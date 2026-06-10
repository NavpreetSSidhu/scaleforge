package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/achievements"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/cost"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/repository"
	"github.com/scaleforge/scaleforge/internal/scoring"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// fakeSimRepo implements simulation.Repository for handler tests.
type fakeSimRepo struct {
	stored  *simulation.Result
	getErr  error
	getByID *simulation.Result
}

func (f *fakeSimRepo) CreateSimulation(_ context.Context, _ string, _ *string, result simulation.Result) (*simulation.Result, error) {
	result.ID = "sim-1"
	f.stored = &result
	return &result, nil
}

func (f *fakeSimRepo) GetSimulation(_ context.Context, _, _ string) (*simulation.Result, error) {
	return f.getByID, f.getErr
}

// fakeAchievementsRepo implements achievements.Repository for handler tests.
type fakeAchievementsRepo struct {
	unlocked map[string]time.Time
}

func (f *fakeAchievementsRepo) ListUnlocked(_ context.Context, _ string) (map[string]time.Time, error) {
	if f.unlocked == nil {
		return map[string]time.Time{}, nil
	}
	return f.unlocked, nil
}

func (f *fakeAchievementsRepo) Unlock(_ context.Context, _ string, ids []string) ([]string, error) {
	if f.unlocked == nil {
		f.unlocked = map[string]time.Time{}
	}
	var newly []string
	for _, id := range ids {
		if _, ok := f.unlocked[id]; !ok {
			f.unlocked[id] = time.Now().UTC()
			newly = append(newly, id)
		}
	}
	return newly, nil
}

func newSimTestRouter(repo simulation.Repository) *gin.Engine {
	gin.SetMode(gin.TestMode)
	cat := catalog.NewService()
	svc := simulation.NewService(cat, cost.NewCalculator(cat), scoring.NewScorer(), repo)
	h := NewSimulationHandler(svc, cat, achievements.NewService(&fakeAchievementsRepo{}))

	r := gin.New()
	api := r.Group("/")
	api.Use(middleware.DevAuth(testUserID))
	{
		api.POST("/simulate", h.Simulate)
		api.GET("/simulation/:id", h.Get)
	}
	return r
}

func jsonGraph() simulation.Graph {
	return simulation.Graph{
		Nodes: []simulation.Node{
			{ID: "go", Type: "api_service", Label: "Go API", Config: simulation.NodeConfig{CPU: 2, Replicas: 3}},
			{ID: "pg", Type: "sql_primary", Label: "PostgreSQL", Config: simulation.NodeConfig{CPU: 2, Replicas: 1}},
		},
		Edges: []simulation.Edge{{ID: "e1", Source: "go", Target: "pg"}},
	}
}

func TestSimulateReturnsEnrichedResult(t *testing.T) {
	repo := &fakeSimRepo{}
	router := newSimTestRouter(repo)

	req := simulation.SimulateRequest{
		Name:    "Test",
		Graph:   jsonGraph(),
		Traffic: simulation.TrafficProfile{ConcurrentUsers: 5000, RequestsPerUserMin: 2, PeakTrafficMultiplier: 1.5},
	}
	rec := doJSON(router, http.MethodPost, "/simulate", req)
	if rec.Code != http.StatusOK {
		t.Fatalf("simulate status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}

	var result simulation.Result
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if result.ID != "sim-1" {
		t.Errorf("result ID = %q, want sim-1", result.ID)
	}
	if result.MonthlyCost <= 0 {
		t.Error("expected a positive monthly cost in the response")
	}
	if result.Bottleneck == nil || result.Bottleneck.NodeID != "pg" {
		t.Errorf("expected postgres bottleneck, got %+v", result.Bottleneck)
	}
	if repo.stored == nil {
		t.Error("expected the simulation to be persisted")
	}
}

func TestSimulateRejectsInvalidJSON(t *testing.T) {
	router := newSimTestRouter(&fakeSimRepo{})

	req := httptest.NewRequest(http.MethodPost, "/simulate", strings.NewReader("{ not valid json "))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("simulate status = %d, want 400", rec.Code)
	}
}

func TestGetSimulationNotFound(t *testing.T) {
	repo := &fakeSimRepo{getErr: repository.ErrNotFound}
	router := newSimTestRouter(repo)

	rec := doJSON(router, http.MethodGet, "/simulation/missing", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get simulation status = %d, want 404", rec.Code)
	}
}
