package simulation

import (
	"context"
	"errors"
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/cost"
	"github.com/scaleforge/scaleforge/internal/scoring"
)

// fakeRepo records what the service persists and lets tests stub returns.
type fakeRepo struct {
	created     *Result
	createdUser string
	createErr   error
	getResult   *Result
	getErr      error
}

func (f *fakeRepo) CreateSimulation(_ context.Context, userID string, _ *string, result Result) (*Result, error) {
	if f.createErr != nil {
		return nil, f.createErr
	}
	f.createdUser = userID
	stored := result
	stored.ID = "sim-1"
	f.created = &stored
	return &stored, nil
}

func (f *fakeRepo) GetSimulation(_ context.Context, _, _ string) (*Result, error) {
	return f.getResult, f.getErr
}

func newService(repo Repository) *Service {
	cat := catalog.NewService()
	return NewService(cat, cost.NewCalculator(cat), scoring.NewScorer(), repo)
}

func demoRequest() SimulateRequest {
	return SimulateRequest{
		Name: "Demo",
		Graph: Graph{
			Nodes: []Node{
				{ID: "cf", Type: "cdn_edge", Label: "Cloudflare", Config: NodeConfig{Replicas: 1}},
				{ID: "lb", Type: "load_balancer", Label: "LB", Config: NodeConfig{CPU: 2, Replicas: 2, Autoscaling: true}},
				{ID: "go", Type: "api_service", Label: "Go API", Config: NodeConfig{CPU: 2, Replicas: 3, Autoscaling: true}},
				{ID: "redis_cache", Type: "redis_cache", Label: "Redis", Config: NodeConfig{Replicas: 1}},
				{ID: "pg", Type: "sql_primary", Label: "PostgreSQL", Config: NodeConfig{CPU: 2, Replicas: 1}},
			},
			Edges: []Edge{
				{Source: "cf", Target: "lb"}, {Source: "lb", Target: "go"},
				{Source: "go", Target: "redis_cache"}, {Source: "redis_cache", Target: "pg"},
			},
		},
		Traffic: TrafficProfile{ConcurrentUsers: 5000, RequestsPerUserMin: 2, PeakTrafficMultiplier: 1.5},
	}
}

func TestServiceRunEnrichesAndPersists(t *testing.T) {
	repo := &fakeRepo{}
	svc := newService(repo)

	result, err := svc.Run(context.Background(), "user-42", demoRequest())
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	if result.ID != "sim-1" {
		t.Errorf("result ID = %q, want sim-1 (assigned by repo)", result.ID)
	}
	// cloudflare 20 + lb 30*2 + go 40*3 + redis 20 + pg 50 = 270
	if result.MonthlyCost != 270 {
		t.Errorf("MonthlyCost = %v, want 270", result.MonthlyCost)
	}
	if result.EstimatedLatency != 31 {
		t.Errorf("latency = %v, want 31", result.EstimatedLatency)
	}
	if result.Scores.OverallGrade == "" {
		t.Error("expected scores to be populated")
	}
	if result.CreatedAt.IsZero() {
		t.Error("expected CreatedAt to be set")
	}
	if repo.created == nil {
		t.Fatal("expected the result to be persisted")
	}
	if repo.createdUser != "user-42" {
		t.Errorf("persisted under user %q, want user-42", repo.createdUser)
	}
}

func TestServiceRunSkipsPersistenceForGuests(t *testing.T) {
	repo := &fakeRepo{}
	svc := newService(repo)

	result, err := svc.Run(context.Background(), "", demoRequest())
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if repo.created != nil {
		t.Error("guest simulations must not be persisted")
	}
	if result.ID == "" {
		t.Error("guest result should still carry a generated ID")
	}
	if result.Scores.OverallGrade == "" || result.MonthlyCost == 0 {
		t.Error("guest result should still be fully computed")
	}
}

func TestServiceRunPropagatesRepoError(t *testing.T) {
	repo := &fakeRepo{createErr: errors.New("db down")}
	svc := newService(repo)

	if _, err := svc.Run(context.Background(), "user-1", demoRequest()); err == nil {
		t.Fatal("expected error to propagate from repository")
	}
}

func TestServiceGetDelegatesToRepo(t *testing.T) {
	want := &Result{ID: "sim-9"}
	svc := newService(&fakeRepo{getResult: want})

	got, err := svc.Get(context.Background(), "user-1", "sim-9")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if got != want {
		t.Errorf("Get() = %+v, want %+v", got, want)
	}
}
