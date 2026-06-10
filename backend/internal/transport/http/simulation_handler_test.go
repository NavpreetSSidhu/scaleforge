package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
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

func newSimTestRouter(repo simulation.Repository) *gin.Engine {
	gin.SetMode(gin.TestMode)
	cat := catalog.NewService()
	svc := simulation.NewService(cat, cost.NewCalculator(cat), scoring.NewScorer(), repo)
	h := NewSimulationHandler(svc)

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
