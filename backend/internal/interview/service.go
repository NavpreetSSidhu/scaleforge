// Package interview is the AI System Design Interviewer. It runs a mock
// system-design interview: it poses a curated prompt, then — turn by turn —
// reads the candidate's live canvas design and asks probing follow-ups grounded
// in that actual graph and its simulation results, and finally grades the design
// against an SRE rubric.
//
// It mirrors internal/assist and internal/tutor: the same Provider seam (reusing
// assist.Provider / *assist.GroqProvider), the same catalog-grounded prompt →
// JSON-contract → salvage pattern. Sessions are stateless — the client replays
// the transcript each turn — so no persistence is required.
package interview

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/scaleforge/scaleforge/internal/assist"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// ErrDisabled is returned by Turn/Grade when no LLM provider is configured. Start
// works without a provider (the topic bank is static), so only the AI turns gate.
var ErrDisabled = fmt.Errorf("interviewer not configured")

// Service drives the interview. The provider may be nil (no API key): Enabled
// reports this, Start still works, and Turn/Grade return ErrDisabled.
type Service struct {
	provider assist.Provider
	catalog  *catalog.Service
}

func NewService(provider assist.Provider, cat *catalog.Service) *Service {
	return &Service{provider: provider, catalog: cat}
}

// Enabled reports whether the AI turns (follow-ups + grading) are available.
func (s *Service) Enabled() bool { return s.provider != nil }

// Topics returns the curated interview bank.
func (s *Service) Topics() []Topic { return topics }

// Start picks the requested topic (or a random one) and returns the opening
// prompt with a fresh client-side session id. No LLM call — fully deterministic.
func (s *Service) Start(req StartRequest) StartResponse {
	topic, ok := topicByID(req.Topic)
	if !ok {
		topic = topics[rand.Intn(len(topics))]
	}
	return StartResponse{SessionID: uuid.New().String(), Topic: topic}
}

// Turn produces the interviewer's next probing reply, grounded in the candidate's
// current graph + simulation result + transcript.
func (s *Service) Turn(ctx context.Context, req TurnRequest) (TurnResponse, error) {
	if s.provider == nil {
		return TurnResponse{}, ErrDisabled
	}
	raw, err := s.provider.Complete(ctx, s.turnSystemPrompt(), s.designContext(req.Topic, designSnapshot{
		graph: marshal(req.Graph), traffic: marshal(req.Traffic), result: marshalResult(req.Result),
		history: req.History, message: req.Message,
	}))
	if err != nil {
		return TurnResponse{}, err
	}
	var parsed TurnResponse
	if err := unmarshalSalvage(raw, &parsed); err != nil {
		return TurnResponse{}, err
	}
	return parsed, nil
}

// Grade assesses the final design against the rubric, grounded in the numbers.
func (s *Service) Grade(ctx context.Context, req GradeRequest) (GradeResponse, error) {
	if s.provider == nil {
		return GradeResponse{}, ErrDisabled
	}
	raw, err := s.provider.Complete(ctx, s.gradeSystemPrompt(), s.designContext(req.Topic, designSnapshot{
		graph: marshal(req.Graph), traffic: marshal(req.Traffic), result: marshalResult(req.Result),
		history: req.History,
	}))
	if err != nil {
		return GradeResponse{}, err
	}
	var parsed GradeResponse
	if err := unmarshalSalvage(raw, &parsed); err != nil {
		return GradeResponse{}, err
	}
	clampRubric(&parsed)
	return parsed, nil
}

func (s *Service) turnSystemPrompt() string {
	var b strings.Builder
	b.WriteString(`You are a senior staff engineer conducting a system-design interview. The candidate is building their design on a visual canvas; you can see the exact components, connections, traffic profile, and the simulator's measured results.

Behave like a real interviewer:
- Acknowledge what they have, then probe the WEAKEST part of the CURRENT design with one focused question.
- Ground questions in their actual graph + numbers (e.g. "your single SQL primary caps at ~1500 rps but you're offering 4000 — how do you scale reads?").
- Push on scale, failure modes, consistency, and cost trade-offs. One question at a time; don't lecture.
- Set "done": true only once the design plausibly satisfies the prompt's constraints.

Respond with a single JSON object of this exact shape:
{
  "reply": "<your spoken turn: brief acknowledgement + one probing question>",
  "followUps": ["<2-4 short directions the candidate could explore next>"],
  "done": false
}

`)
	b.WriteString(s.catalogHint())
	return b.String()
}

func (s *Service) gradeSystemPrompt() string {
	var b strings.Builder
	b.WriteString(`You are grading a completed system-design interview. Assess the candidate's final design (graph + traffic + measured simulation results) against the prompt's constraints.

Score each dimension 0–5 (0 = absent/wrong, 3 = adequate, 5 = excellent) and justify briefly, grounded in the actual design and numbers. Dimensions: Scalability, Availability, Cost, Latency, Tradeoffs.

Respond with a single JSON object of this exact shape:
{
  "summary": "<2-3 sentence overall assessment>",
  "overall": <0-100 integer>,
  "rubric": [
    {"dimension":"Scalability","score":0,"comment":"..."},
    {"dimension":"Availability","score":0,"comment":"..."},
    {"dimension":"Cost","score":0,"comment":"..."},
    {"dimension":"Latency","score":0,"comment":"..."},
    {"dimension":"Tradeoffs","score":0,"comment":"..."}
  ]
}

`)
	b.WriteString(s.catalogHint())
	return b.String()
}

// catalogHint lists the available component types so the interviewer references
// real ScaleForge components when suggesting directions.
func (s *Service) catalogHint() string {
	var b strings.Builder
	b.WriteString("Available canvas components (type — category):\n")
	defs := s.catalog.All()
	sort.Slice(defs, func(i, j int) bool { return defs[i].Type < defs[j].Type })
	for _, d := range defs {
		fmt.Fprintf(&b, "- %s — %s\n", d.Type, d.Category)
	}
	return b.String()
}

type designSnapshot struct {
	graph   string
	traffic string
	result  string
	history []Message
	message string
}

// designContext serializes the interview prompt, the live design, and the
// transcript into the user message both Turn and Grade share.
func (s *Service) designContext(topic Topic, d designSnapshot) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Interview topic: %s\n%s\nConstraints: %s\n\n", topic.Title, topic.Prompt, strings.Join(topic.Constraints, "; "))
	b.WriteString("Candidate's current design graph:\n")
	b.WriteString(d.graph)
	b.WriteString("\n\nTraffic profile:\n")
	b.WriteString(d.traffic)
	if d.result != "" {
		b.WriteString("\n\nSimulation result (measured):\n")
		b.WriteString(d.result)
	}
	if len(d.history) > 0 {
		b.WriteString("\n\nTranscript so far:\n")
		for _, m := range d.history {
			fmt.Fprintf(&b, "%s: %s\n", m.Role, m.Content)
		}
	}
	if d.message != "" {
		b.WriteString("\n\nCandidate just said: ")
		b.WriteString(d.message)
	}
	return b.String()
}

// clampRubric keeps scores in 0–5 and the overall in 0–100 against model drift.
func clampRubric(g *GradeResponse) {
	for i := range g.Rubric {
		if g.Rubric[i].Score < 0 {
			g.Rubric[i].Score = 0
		}
		if g.Rubric[i].Score > 5 {
			g.Rubric[i].Score = 5
		}
	}
	if g.Overall < 0 {
		g.Overall = 0
	}
	if g.Overall > 100 {
		g.Overall = 100
	}
}

func marshal(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func marshalResult(r *simulation.Result) string {
	if r == nil {
		return ""
	}
	return marshal(r)
}

// unmarshalSalvage parses JSON, falling back to the outermost {...} object when
// the model wraps it in prose (reusing assist's salvage).
func unmarshalSalvage(raw string, dst any) error {
	if err := json.Unmarshal([]byte(raw), dst); err == nil {
		return nil
	}
	if obj := assist.ExtractJSONObject(raw); obj != "" {
		if err := json.Unmarshal([]byte(obj), dst); err == nil {
			return nil
		}
	}
	return fmt.Errorf("interviewer returned unparseable response")
}
