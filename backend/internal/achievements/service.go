package achievements

import (
	"context"
	"time"
)

// Repository persists per-user unlock state.
type Repository interface {
	// ListUnlocked returns achievement ID → unlock time for the user.
	ListUnlocked(ctx context.Context, userID string) (map[string]time.Time, error)
	// Unlock inserts the given achievement IDs for the user (idempotent) and
	// returns the subset that were *newly* inserted.
	Unlock(ctx context.Context, userID string, ids []string) ([]string, error)
}

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Definitions returns the full catalog in display order.
func (s *Service) Definitions() []Definition {
	out := make([]Definition, len(definitions))
	copy(out, definitions)
	return out
}

// List returns every achievement annotated with the user's unlock state.
func (s *Service) List(ctx context.Context, userID string) ([]Achievement, error) {
	unlocked, err := s.repo.ListUnlocked(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]Achievement, 0, len(definitions))
	for _, d := range definitions {
		a := Achievement{Definition: d}
		if t, ok := unlocked[d.ID]; ok {
			when := t
			a.Unlocked = true
			a.UnlockedAt = &when
		}
		out = append(out, a)
	}
	return out, nil
}

// Sync evaluates a simulation run for a signed-in user, persists any earned
// achievements, and returns only those unlocked *by this run* (for the
// celebration UI).
func (s *Service) Sync(ctx context.Context, userID string, in EvalInput) ([]Achievement, error) {
	earned := Evaluate(in)
	if len(earned) == 0 {
		return nil, nil
	}
	newIDs, err := s.repo.Unlock(ctx, userID, earned)
	if err != nil {
		return nil, err
	}
	return achievementsFor(newIDs, time.Now().UTC()), nil
}

// EvaluateEphemeral returns earned achievements as freshly unlocked without
// persisting — used for guest runs so they still see the celebration.
func (s *Service) EvaluateEphemeral(in EvalInput) []Achievement {
	return achievementsFor(Evaluate(in), time.Now().UTC())
}

func achievementsFor(ids []string, at time.Time) []Achievement {
	if len(ids) == 0 {
		return nil
	}
	out := make([]Achievement, 0, len(ids))
	for _, id := range ids {
		d, ok := defByID[id]
		if !ok {
			continue
		}
		when := at
		out = append(out, Achievement{Definition: d, Unlocked: true, UnlockedAt: &when})
	}
	return out
}
