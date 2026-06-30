// Package review is the AI SRE / architecture reviewer. Where the assistant is a
// conversational helper, the reviewer is a structured, one-shot senior-SRE pass:
// it ingests the architecture *and its measured simulation + chaos results* and
// returns severity-ranked findings — single points of failure, scaling cliffs,
// cost waste, observability/security gaps — each with a concrete, one-click fix.
//
// It deliberately mirrors internal/assist (same Provider seam, same catalog-
// grounded prompt → JSON contract → server-side validation pattern) and reuses
// assist.Action + assist.ValidateActions so the fixes flow through the exact same
// client apply pipeline as the assistant's suggestions.
package review

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/scaleforge/scaleforge/internal/assist"
	"github.com/scaleforge/scaleforge/internal/catalog"
)

// ErrDisabled is returned when no LLM provider is configured (no API key). The
// handler maps it to a 503 so the client can hide the reviewer entrypoint.
var ErrDisabled = fmt.Errorf("reviewer not configured")

// Service builds a grounded SRE-rubric prompt, calls the LLM, then parses and
// validates the structured response so only safe, applicable fixes reach the client.
type Service struct {
	provider assist.Provider
	catalog  *catalog.Service
}

// NewService wires the reviewer. A nil provider means it is disabled (no key);
// Enabled reports this and Review returns ErrDisabled.
func NewService(provider assist.Provider, cat *catalog.Service) *Service {
	return &Service{provider: provider, catalog: cat}
}

// Enabled reports whether an LLM provider is configured.
func (s *Service) Enabled() bool { return s.provider != nil }

// severityRank orders findings most-severe first for the client.
var severityRank = map[string]int{
	SeverityCritical: 0,
	SeverityHigh:     1,
	SeverityMedium:   2,
	SeverityLow:      3,
}

func (s *Service) Review(ctx context.Context, req Request) (Response, error) {
	if s.provider == nil {
		return Response{}, ErrDisabled
	}

	raw, err := s.provider.Complete(ctx, s.systemPrompt(), s.userPrompt(req))
	if err != nil {
		return Response{}, err
	}

	var parsed Response
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		// The model occasionally wraps JSON in prose despite JSON mode; salvage the
		// outermost object before giving up.
		if obj := assist.ExtractJSONObject(raw); obj != "" {
			if err2 := json.Unmarshal([]byte(obj), &parsed); err2 != nil {
				return Response{}, fmt.Errorf("reviewer returned unparseable response: %w", err)
			}
		} else {
			return Response{}, fmt.Errorf("reviewer returned unparseable response: %w", err)
		}
	}

	defs := s.catalog.Map()
	for i := range parsed.Findings {
		// Drop any proposed fix that references an unknown type or dangling id, so
		// the client never receives an action it can't safely apply.
		parsed.Findings[i].Actions = assist.ValidateActions(parsed.Findings[i].Actions, req.Graph, defs)
		if parsed.Findings[i].Severity == "" {
			parsed.Findings[i].Severity = SeverityMedium
		}
	}
	sort.SliceStable(parsed.Findings, func(i, j int) bool {
		return severityRank[parsed.Findings[i].Severity] < severityRank[parsed.Findings[j].Severity]
	})
	return parsed, nil
}

// systemPrompt embeds the SRE rubric, the output contract, and the full catalog
// so the model only proposes real components and returns parseable, applicable fixes.
func (s *Service) systemPrompt() string {
	var b strings.Builder
	b.WriteString(`You are ScaleForge's principal SRE reviewer. You audit a distributed-system architecture and its MEASURED simulation results, then report concrete, prioritized findings.

Review the design against this rubric:
- Reliability: single points of failure, missing replicas, no multi-region, no failover.
- Scalability: the bottleneck tier, capacity headroom vs incoming load, scaling cliffs.
- Cost: over-provisioned tiers, expensive components doing little work.
- Performance: latency hot spots, chatty cross-region hops, missing caches.
- Observability & Security: no monitoring, no WAF/secrets management on exposed systems.

You MUST respond with a single JSON object of this exact shape:
{
  "summary": "<one or two sentence overall verdict grounded in the numbers>",
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "category": "Reliability|Scalability|Cost|Performance|Observability|Security",
      "title": "<short title>",
      "detail": "<why it matters, citing real numbers when given>",
      "actions": [ <zero or more fix actions> ]
    }
  ]
}

Fix action objects (only use component types from the catalog below):
- {"op":"addNode","nodeType":"<type>","nodeId":"<proposed-id>","label":"<optional>","config":{"replicas":2},"rationale":"<short why>"}
- {"op":"removeNode","nodeId":"<existing-id>","rationale":"..."}
- {"op":"addEdge","source":"<id>","target":"<id>","rationale":"..."}  (ids may be existing or proposed ids from addNode actions in this same response)
- {"op":"updateConfig","nodeId":"<existing-id>","config":{"replicas":6,"autoscaling":true},"rationale":"..."}

Rules:
- Ground every finding in the provided numbers (RPS, capacity, latency, cost, bottleneck, resilience, SPOFs) — do not speculate.
- Attach a concrete fix to a finding whenever one applies; for findings with no graph fix, return an empty actions array.
- Never invent component types. Never reference node ids that don't exist unless you created them via addNode in this same response.
- Order findings most-severe first. Be specific and terse.

Catalog (type — category — capacity rps — base latency ms — unit $/mo):
`)
	defs := s.catalog.All()
	sort.Slice(defs, func(i, j int) bool { return defs[i].Type < defs[j].Type })
	for _, d := range defs {
		fmt.Fprintf(&b, "- %s — %s — %.0f rps — %.0f ms — $%.0f — %s\n",
			d.Type, d.Category, d.PerInstanceCapacity, d.BaseLatencyMs, d.UnitMonthlyCostUsd, d.Label)
	}
	return b.String()
}

// userPrompt serializes the live architecture, traffic, and the measured
// simulation + chaos results as JSON context for the review.
func (s *Service) userPrompt(req Request) string {
	var b strings.Builder

	graphJSON, _ := json.Marshal(req.Graph)
	trafficJSON, _ := json.Marshal(req.Traffic)
	b.WriteString("Architecture graph:\n")
	b.Write(graphJSON)
	b.WriteString("\n\nTraffic profile:\n")
	b.Write(trafficJSON)
	if req.Provider != "" {
		fmt.Fprintf(&b, "\n\nCloud provider: %s", req.Provider)
	}
	if req.Result != nil {
		resultJSON, _ := json.Marshal(req.Result)
		b.WriteString("\n\nSimulation result (measured):\n")
		b.Write(resultJSON)
	}
	if req.Chaos != nil {
		chaosJSON, _ := json.Marshal(req.Chaos)
		b.WriteString("\n\nResilience / chaos result (measured):\n")
		b.Write(chaosJSON)
	}
	b.WriteString("\n\nReview this architecture and return prioritized findings with concrete fixes.")
	return b.String()
}
