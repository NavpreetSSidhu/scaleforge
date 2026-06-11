package assist

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// ErrDisabled is returned by Chat when no LLM provider is configured (e.g. the
// GROQ_API_KEY env var is unset). The handler maps it to a 503 so the frontend
// can hide the assistant entrypoint.
var ErrDisabled = fmt.Errorf("assistant not configured")

// Service orchestrates the assistant: it builds a grounded system prompt from the
// catalog and the current architecture, calls the LLM provider, then parses and
// validates the structured response so only safe, applicable actions reach the
// client.
type Service struct {
	provider Provider
	catalog  *catalog.Service
}

// NewService wires the assistant. A nil provider means the assistant is disabled
// (no API key configured); Enabled reports this and Chat returns ErrDisabled.
func NewService(provider Provider, cat *catalog.Service) *Service {
	return &Service{provider: provider, catalog: cat}
}

// Enabled reports whether an LLM provider is configured.
func (s *Service) Enabled() bool {
	return s.provider != nil
}

func (s *Service) Chat(ctx context.Context, req ChatRequest) (Response, error) {
	if s.provider == nil {
		return Response{}, ErrDisabled
	}

	system := s.systemPrompt()
	user := s.userPrompt(req)

	raw, err := s.provider.Complete(ctx, system, user)
	if err != nil {
		return Response{}, err
	}

	var parsed Response
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		// The model occasionally wraps JSON in prose despite JSON mode; salvage the
		// outermost object before giving up.
		if obj := extractJSONObject(raw); obj != "" {
			if err2 := json.Unmarshal([]byte(obj), &parsed); err2 != nil {
				return Response{}, fmt.Errorf("assistant returned unparseable response: %w", err)
			}
		} else {
			return Response{}, fmt.Errorf("assistant returned unparseable response: %w", err)
		}
	}

	parsed.Actions = s.validateActions(parsed.Actions, req.Graph)
	return parsed, nil
}

// validateActions drops any action that references an unknown component type or a
// node id that doesn't exist, so the client never receives an action it can't
// safely apply. addNode actions may declare a proposed id that later edges in the
// same batch reference; those proposed ids count as valid endpoints.
func (s *Service) validateActions(actions []Action, graph simulation.Graph) []Action {
	defs := s.catalog.Map()

	validIDs := make(map[string]bool, len(graph.Nodes))
	for _, n := range graph.Nodes {
		validIDs[n.ID] = true
	}
	// First pass: collect proposed ids from addNode so edges can reference them.
	for _, a := range actions {
		if a.Op == OpAddNode && a.NodeID != "" {
			validIDs[a.NodeID] = true
		}
	}

	kept := make([]Action, 0, len(actions))
	for _, a := range actions {
		switch a.Op {
		case OpAddNode:
			if _, ok := defs[a.NodeType]; !ok {
				continue
			}
		case OpRemoveNode, OpUpdateConfig:
			if !validIDs[a.NodeID] {
				continue
			}
		case OpAddEdge, OpRemoveEdge:
			if !validIDs[a.Source] || !validIDs[a.Target] || a.Source == a.Target {
				continue
			}
		default:
			continue
		}
		kept = append(kept, a)
	}
	return kept
}

// systemPrompt embeds the full catalog and the output contract so the model only
// proposes real components and returns parseable, applicable actions.
func (s *Service) systemPrompt() string {
	var b strings.Builder
	b.WriteString(`You are ScaleForge's architecture assistant. You help engineers understand and improve distributed-system architectures they build on a visual canvas.

You can do two things:
1. EXPLAIN the current architecture, its bottleneck, costs, and trade-offs in clear, concise prose grounded in the numbers provided.
2. PROPOSE concrete changes to the graph as structured actions the user can preview and apply.

You MUST respond with a single JSON object of this exact shape:
{
  "reply": "<your natural-language explanation / answer>",
  "actions": [ <zero or more action objects> ]
}

Action objects (only use component types from the catalog below):
- {"op":"addNode","nodeType":"<type>","nodeId":"<proposed-id>","label":"<optional>","config":{"cpu":2,"memory":4,"replicas":3,"autoscaling":true,"runtime":"go"},"rationale":"<short why>"}
- {"op":"removeNode","nodeId":"<existing-id>","rationale":"..."}
- {"op":"addEdge","source":"<id>","target":"<id>","rationale":"..."}  (source/target may be existing node ids or proposed ids from addNode actions in this same response)
- {"op":"removeEdge","source":"<id>","target":"<id>","rationale":"..."}
- {"op":"updateConfig","nodeId":"<existing-id>","config":{"replicas":6},"rationale":"..."}

Rules:
- Only include actions when the user asks to change/improve/build something. For pure explanations, return an empty actions array.
- Keep "reply" tight and specific; reference real numbers (RPS, latency, cost, bottleneck) when given.
- Never invent component types. Never reference node ids that don't exist unless you created them via addNode in this same response.
- Prefer the smallest set of changes that achieves the goal.

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

// userPrompt serializes the live architecture, traffic, and latest result as JSON
// context, followed by prior turns and the new question.
func (s *Service) userPrompt(req ChatRequest) string {
	var b strings.Builder

	graphJSON, _ := json.Marshal(req.Graph)
	trafficJSON, _ := json.Marshal(req.Traffic)
	b.WriteString("Current architecture graph:\n")
	b.Write(graphJSON)
	b.WriteString("\n\nTraffic profile:\n")
	b.Write(trafficJSON)
	if req.Provider != "" {
		fmt.Fprintf(&b, "\n\nCloud provider: %s", req.Provider)
	}
	if req.Result != nil {
		resultJSON, _ := json.Marshal(req.Result)
		b.WriteString("\n\nLatest simulation result:\n")
		b.Write(resultJSON)
	}

	if len(req.History) > 0 {
		b.WriteString("\n\nConversation so far:\n")
		for _, m := range req.History {
			fmt.Fprintf(&b, "%s: %s\n", m.Role, m.Content)
		}
	}

	b.WriteString("\n\nUser request: ")
	b.WriteString(req.Message)
	return b.String()
}

// extractJSONObject returns the substring spanning the first '{' to the last '}',
// a cheap salvage for models that wrap JSON in stray prose.
func extractJSONObject(s string) string {
	start := strings.IndexByte(s, '{')
	end := strings.LastIndexByte(s, '}')
	if start < 0 || end < 0 || end <= start {
		return ""
	}
	return s[start : end+1]
}
