package achievements

import (
	"context"
	"testing"
	"time"
)

type memRepo struct {
	unlocked map[string]time.Time
}

func newMemRepo() *memRepo { return &memRepo{unlocked: map[string]time.Time{}} }

func (m *memRepo) ListUnlocked(_ context.Context, _ string) (map[string]time.Time, error) {
	return m.unlocked, nil
}

func (m *memRepo) Unlock(_ context.Context, _ string, ids []string) ([]string, error) {
	var newly []string
	for _, id := range ids {
		if _, ok := m.unlocked[id]; !ok {
			m.unlocked[id] = time.Now().UTC()
			newly = append(newly, id)
		}
	}
	return newly, nil
}

func TestServiceListAnnotatesUnlockState(t *testing.T) {
	repo := newMemRepo()
	repo.unlocked[IDFirstArchitecture] = time.Now().UTC()
	svc := NewService(repo)

	items, err := svc.List(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(items) != len(definitions) {
		t.Fatalf("List returned %d items, want %d", len(items), len(definitions))
	}
	for _, a := range items {
		if a.ID == IDFirstArchitecture {
			if !a.Unlocked || a.UnlockedAt == nil {
				t.Error("first-architecture should be marked unlocked with a timestamp")
			}
		} else if a.Unlocked {
			t.Errorf("%s should be locked", a.ID)
		}
	}
}

func TestServiceSyncOnlyReturnsNewlyUnlocked(t *testing.T) {
	repo := newMemRepo()
	svc := NewService(repo)
	in := EvalInput{NodeCount: 2, Categories: []string{"cache"}}

	first, err := svc.Sync(context.Background(), "user-1", in)
	if err != nil {
		t.Fatalf("first sync: %v", err)
	}
	if len(first) == 0 {
		t.Fatal("first sync should unlock at least first-architecture + cache-wizard")
	}

	// Re-running the identical input unlocks nothing new.
	second, err := svc.Sync(context.Background(), "user-1", in)
	if err != nil {
		t.Fatalf("second sync: %v", err)
	}
	if len(second) != 0 {
		t.Errorf("second identical sync returned %d new achievements, want 0", len(second))
	}
}

func TestEvaluateEphemeralDoesNotPersist(t *testing.T) {
	repo := newMemRepo()
	svc := NewService(repo)

	got := svc.EvaluateEphemeral(EvalInput{NodeCount: 1})
	if len(got) == 0 {
		t.Fatal("expected at least first-architecture")
	}
	if len(repo.unlocked) != 0 {
		t.Errorf("ephemeral evaluation persisted %d rows, want 0", len(repo.unlocked))
	}
}
