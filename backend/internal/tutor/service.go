package tutor

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/scaleforge/scaleforge/internal/catalog"
)

// Service powers the learning module's two AI personas — a Teacher (Explain) and
// a separate Q&A agent (Ask) — and delegates progress persistence to a
// Repository. Both personas reuse the LLM Provider seam; lesson content itself is
// authored on the client, so the service never generates curriculum, only
// teaching prose grounded in the component catalog.
type Service struct {
	provider Provider
	catalog  *catalog.Service
	repo     Repository
}

// NewService wires the tutor. A nil provider means the AI personas are disabled
// (no API key); Enabled reports this and Explain/Ask return ErrDisabled. Progress
// endpoints work regardless of the provider.
func NewService(provider Provider, cat *catalog.Service, repo Repository) *Service {
	return &Service{provider: provider, catalog: cat, repo: repo}
}

// Enabled reports whether an LLM provider is configured.
func (s *Service) Enabled() bool {
	return s.provider != nil
}

// Explain answers as the Teacher: a clear, grounded elaboration of the current
// lesson step (and the focused component, if any).
func (s *Service) Explain(ctx context.Context, req ExplainRequest) (Reply, error) {
	if s.provider == nil {
		return Reply{}, ErrDisabled
	}
	return s.complete(ctx, s.teacherSystemPrompt(), s.explainPrompt(req))
}

// Ask answers as the separate Q&A agent: a freeform question about the topic,
// answered with small concrete examples.
func (s *Service) Ask(ctx context.Context, req AskRequest) (Reply, error) {
	if s.provider == nil {
		return Reply{}, ErrDisabled
	}
	return s.complete(ctx, s.qnaSystemPrompt(), s.askPrompt(req))
}

// complete calls the provider and parses the {"reply": "..."} envelope, salvaging
// prose-wrapped JSON the same way the assistant does.
func (s *Service) complete(ctx context.Context, system, user string) (Reply, error) {
	raw, err := s.provider.Complete(ctx, system, user)
	if err != nil {
		return Reply{}, err
	}

	var parsed Reply
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		if obj := extractJSONObject(raw); obj != "" {
			if err2 := json.Unmarshal([]byte(obj), &parsed); err2 != nil {
				return Reply{}, fmt.Errorf("tutor returned unparseable response: %w", err)
			}
		} else {
			return Reply{}, fmt.Errorf("tutor returned unparseable response: %w", err)
		}
	}
	if strings.TrimSpace(parsed.Reply) == "" {
		// Some models drop the envelope and return bare prose; use it verbatim.
		parsed.Reply = strings.TrimSpace(raw)
	}
	return parsed, nil
}

// --- Progress (delegated to the repository) ---

func (s *Service) GetProgress(ctx context.Context, userID, courseSlug string) (Progress, error) {
	return s.repo.GetProgress(ctx, userID, courseSlug)
}

func (s *Service) ListProgress(ctx context.Context, userID string) ([]Progress, error) {
	return s.repo.ListProgress(ctx, userID)
}

func (s *Service) UpsertProgress(ctx context.Context, userID string, p Progress) error {
	return s.repo.UpsertProgress(ctx, userID, p)
}

// --- Prompts ---

func (s *Service) teacherSystemPrompt() string {
	var b strings.Builder
	b.WriteString(`You are ScaleForge's system-design Teacher. The learner is stepping through an interactive, animated lesson on a distributed-systems topic. Your job is to explain "what is this and why is it here" clearly and concretely, building intuition.

Respond with a single JSON object: {"reply": "<your explanation, plain prose, may use short markdown>"}.

Rules:
- Keep it tight and concrete; prefer a few sentences over a wall of text.
- Ground real components in the catalog below when relevant; never invent component types.
- Explain trade-offs and the "why", not just the "what".
- If the learner asked a follow-up question, answer that specifically.

`)
	s.writeCatalog(&b)
	return b.String()
}

func (s *Service) qnaSystemPrompt() string {
	var b strings.Builder
	b.WriteString(`You are ScaleForge's Q&A agent for a system-design course. Answer the learner's question clearly, with small concrete examples (numbers, short scenarios, or component sketches) that build intuition.

Respond with a single JSON object: {"reply": "<your answer, plain prose, may use short markdown>"}.

Rules:
- Be specific and practical; favour an example over abstraction.
- When a real component fits, reference the catalog below; never invent component types.
- If the question is ambiguous, answer the most useful interpretation briefly.

`)
	s.writeCatalog(&b)
	return b.String()
}

// writeCatalog appends the component catalog so the personas reference only real
// components — mirrors assist.Service.systemPrompt's catalog listing.
func (s *Service) writeCatalog(b *strings.Builder) {
	b.WriteString("Component catalog (type — category — capacity rps — base latency ms — unit $/mo — label):\n")
	defs := s.catalog.All()
	sort.Slice(defs, func(i, j int) bool { return defs[i].Type < defs[j].Type })
	for _, d := range defs {
		fmt.Fprintf(b, "- %s — %s — %.0f rps — %.0f ms — $%.0f — %s\n",
			d.Type, d.Category, d.PerInstanceCapacity, d.BaseLatencyMs, d.UnitMonthlyCostUsd, d.Label)
	}
}

func (s *Service) explainPrompt(req ExplainRequest) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Course: %s\n", req.CourseTitle)
	fmt.Fprintf(&b, "Current step: %s\n%s\n", req.StepTitle, req.StepBody)
	if req.FocusComponent != "" {
		fmt.Fprintf(&b, "\nThe learner is focused on the component type: %s\n", req.FocusComponent)
	}
	writeHistory(&b, req.History)
	if strings.TrimSpace(req.Question) != "" {
		fmt.Fprintf(&b, "\nLearner's follow-up question: %s", req.Question)
	} else {
		b.WriteString("\nExplain this step (and the focused component, if any) in more depth.")
	}
	return b.String()
}

func (s *Service) askPrompt(req AskRequest) string {
	var b strings.Builder
	if req.CourseTitle != "" {
		fmt.Fprintf(&b, "The learner is taking the course: %s\n", req.CourseTitle)
	}
	writeHistory(&b, req.History)
	fmt.Fprintf(&b, "\nLearner's question: %s", req.Question)
	return b.String()
}

func writeHistory(b *strings.Builder, history []Message) {
	if len(history) == 0 {
		return
	}
	b.WriteString("\nConversation so far:\n")
	for _, m := range history {
		fmt.Fprintf(b, "%s: %s\n", m.Role, m.Content)
	}
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
