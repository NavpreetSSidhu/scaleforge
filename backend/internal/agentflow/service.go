package agentflow

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/scaleforge/scaleforge/internal/assist"
)

// Service owns agentic workflows: persistence (CRUD with shared validation), plus
// the LLM-backed operations (live run, AI generation) that reuse the same
// assist.Provider seam as the architecture assistant. Simulation and export are
// pure functions in the sub-packages and don't need a provider, so they remain
// available even when the assistant is disabled.
type Service struct {
	provider assist.Provider
	catalog  *Catalog
	repo     Repository
}

// NewService wires the workflow service. A nil provider disables generation and
// live execution (Enabled reports false); design, simulation, vector-bench, and
// export all work without a key.
func NewService(provider assist.Provider, cat *Catalog, repo Repository) *Service {
	return &Service{provider: provider, catalog: cat, repo: repo}
}

// Enabled reports whether the LLM provider is configured (gates generate + run).
func (s *Service) Enabled() bool { return s.provider != nil }

// Catalog exposes the node-type registry for handlers (palette endpoint).
func (s *Service) Catalog() *Catalog { return s.catalog }

// PrepareGraph normalizes and validates a standalone graph (no persistence
// envelope) so the design-time operations — simulate, vector-bench, export, live
// run — all start from a clean, well-formed graph. It returns ErrInvalid for a
// bad graph so handlers can answer 422. Kept here (not in the sim/export
// sub-packages) so those packages depend only on agentflow, never the reverse.
func (s *Service) PrepareGraph(g Graph) (Graph, error) {
	w := Workflow{Name: "scratch", Graph: g}
	normalize(&w, s.catalog)
	if err := validate(&w, s.catalog); err != nil {
		return Graph{}, err
	}
	return w.Graph, nil
}

// List returns the user's workflows (newest first).
func (s *Service) List(ctx context.Context, userID string) ([]Workflow, error) {
	return s.repo.ListWorkflows(ctx, userID)
}

// Get returns one of the user's workflows, or repository.ErrNotFound.
func (s *Service) Get(ctx context.Context, userID, id string) (Workflow, error) {
	return s.repo.GetWorkflow(ctx, userID, id)
}

// Create normalizes + validates the input, assigns a unique per-user slug, and
// persists a new workflow.
func (s *Service) Create(ctx context.Context, userID string, in WorkflowInput) (Workflow, error) {
	w := fromInput(in)
	normalize(&w, s.catalog)
	if err := validate(&w, s.catalog); err != nil {
		return Workflow{}, err
	}
	slug, err := s.uniqueSlug(ctx, userID, slugify(w.Name), "")
	if err != nil {
		return Workflow{}, err
	}
	w.ID = uuid.New().String()
	w.Slug = slug
	return s.repo.CreateWorkflow(ctx, userID, w)
}

// Update normalizes + validates the input and overwrites an existing workflow the
// user owns, refreshing its (still-unique) slug.
func (s *Service) Update(ctx context.Context, userID, id string, in WorkflowInput) (Workflow, error) {
	w := fromInput(in)
	normalize(&w, s.catalog)
	if err := validate(&w, s.catalog); err != nil {
		return Workflow{}, err
	}
	slug, err := s.uniqueSlug(ctx, userID, slugify(w.Name), id)
	if err != nil {
		return Workflow{}, err
	}
	w.ID = id
	w.Slug = slug
	return s.repo.UpdateWorkflow(ctx, userID, id, w)
}

// Delete removes a workflow the user owns.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	return s.repo.DeleteWorkflow(ctx, userID, id)
}

// uniqueSlug picks a per-user-unique slug from base, appending -2, -3, … on
// collision. excludeID is the workflow being updated (so it doesn't clash itself).
func (s *Service) uniqueSlug(ctx context.Context, userID, base, excludeID string) (string, error) {
	existing, err := s.repo.ListWorkflows(ctx, userID)
	if err != nil {
		return "", err
	}
	taken := make(map[string]bool, len(existing))
	for _, w := range existing {
		if w.ID != excludeID {
			taken[w.Slug] = true
		}
	}
	if !taken[base] {
		return base, nil
	}
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s-%d", base, i)
		if !taken[candidate] {
			return candidate, nil
		}
	}
}
