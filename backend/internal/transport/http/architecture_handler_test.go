package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/repository"
)

// fakeArchRepo is an in-memory ArchitectureRepository + HealthChecker for tests.
type fakeArchRepo struct {
	items     map[string]*repository.Architecture
	pingErr   error
	createErr error
}

func newFakeArchRepo() *fakeArchRepo {
	return &fakeArchRepo{items: map[string]*repository.Architecture{}}
}

func (f *fakeArchRepo) Ping(context.Context) error { return f.pingErr }

func (f *fakeArchRepo) CreateArchitecture(_ context.Context, userID string, req repository.CreateArchitectureRequest) (*repository.Architecture, error) {
	if f.createErr != nil {
		return nil, f.createErr
	}
	arch := &repository.Architecture{ID: "arch-1", UserID: userID, Name: req.Name, Graph: req.Graph, Traffic: req.Traffic}
	f.items[arch.ID] = arch
	return arch, nil
}

func (f *fakeArchRepo) ListArchitectures(_ context.Context, userID string) ([]repository.Architecture, error) {
	var out []repository.Architecture
	for _, a := range f.items {
		if a.UserID == userID {
			out = append(out, *a)
		}
	}
	return out, nil
}

func (f *fakeArchRepo) GetArchitecture(_ context.Context, userID, id string) (*repository.Architecture, error) {
	a, ok := f.items[id]
	if !ok || a.UserID != userID {
		return nil, repository.ErrNotFound
	}
	return a, nil
}

func (f *fakeArchRepo) UpdateArchitecture(_ context.Context, userID, id string, req repository.UpdateArchitectureRequest) (*repository.Architecture, error) {
	a, ok := f.items[id]
	if !ok || a.UserID != userID {
		return nil, repository.ErrNotFound
	}
	a.Name = req.Name
	a.Graph = req.Graph
	a.Traffic = req.Traffic
	return a, nil
}

func (f *fakeArchRepo) DeleteArchitecture(_ context.Context, userID, id string) error {
	a, ok := f.items[id]
	if !ok || a.UserID != userID {
		return repository.ErrNotFound
	}
	delete(f.items, id)
	return nil
}

const testUserID = "user-test"

func newArchTestRouter(repo *fakeArchRepo) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewArchitectureHandler(repo, catalog.NewService(), repo)
	r.GET("/health", h.Health)
	api := r.Group("/")
	api.Use(middleware.DevAuth(testUserID))
	{
		api.GET("/catalog", h.GetCatalog)
		api.POST("/architectures", h.Create)
		api.GET("/architectures", h.List)
		api.GET("/architectures/:id", h.Get)
		api.PUT("/architectures/:id", h.Update)
		api.DELETE("/architectures/:id", h.Delete)
	}
	return r
}

func doJSON(r http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestHealthOK(t *testing.T) {
	rec := doJSON(newArchTestRouter(newFakeArchRepo()), http.MethodGet, "/health", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("health status = %d, want 200", rec.Code)
	}
}

func TestHealthReportsDatabaseDown(t *testing.T) {
	repo := newFakeArchRepo()
	repo.pingErr = errors.New("no db")
	rec := doJSON(newArchTestRouter(repo), http.MethodGet, "/health", nil)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("health status = %d, want 503", rec.Code)
	}
}

func TestCreateArchitectureValidatesBody(t *testing.T) {
	// Missing required "name" should fail binding.
	rec := doJSON(newArchTestRouter(newFakeArchRepo()), http.MethodPost, "/architectures", map[string]any{
		"graph": map[string]any{"nodes": []any{}, "edges": []any{}},
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("create status = %d, want 400", rec.Code)
	}
}

func TestCreateAndGetArchitecture(t *testing.T) {
	router := newArchTestRouter(newFakeArchRepo())

	body := repository.CreateArchitectureRequest{
		Name:  "My Arch",
		Graph: jsonGraph(),
	}
	rec := doJSON(router, http.MethodPost, "/architectures", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want 201 (body: %s)", rec.Code, rec.Body.String())
	}

	var created repository.Architecture
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.UserID != testUserID {
		t.Errorf("created under user %q, want %q", created.UserID, testUserID)
	}

	rec = doJSON(router, http.MethodGet, "/architectures/"+created.ID, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get status = %d, want 200", rec.Code)
	}
}

func TestGetMissingArchitectureReturns404(t *testing.T) {
	rec := doJSON(newArchTestRouter(newFakeArchRepo()), http.MethodGet, "/architectures/nope", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get status = %d, want 404", rec.Code)
	}
}

func TestDeleteArchitecture(t *testing.T) {
	repo := newFakeArchRepo()
	repo.items["arch-1"] = &repository.Architecture{ID: "arch-1", UserID: testUserID, Name: "x"}
	router := newArchTestRouter(repo)

	rec := doJSON(router, http.MethodDelete, "/architectures/arch-1", nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, want 204", rec.Code)
	}
	if _, ok := repo.items["arch-1"]; ok {
		t.Error("architecture should have been removed")
	}
}

func TestListArchitecturesReturnsEmptyArray(t *testing.T) {
	rec := doJSON(newArchTestRouter(newFakeArchRepo()), http.MethodGet, "/architectures", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d, want 200", rec.Code)
	}
	if got := rec.Body.String(); got != "[]" {
		t.Errorf("empty list body = %q, want []", got)
	}
}

func TestGetCatalog(t *testing.T) {
	rec := doJSON(newArchTestRouter(newFakeArchRepo()), http.MethodGet, "/catalog", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("catalog status = %d, want 200", rec.Code)
	}
	var payload struct {
		Nodes []catalog.NodeDefinition `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode catalog: %v", err)
	}
	if len(payload.Nodes) == 0 {
		t.Error("expected catalog to return node definitions")
	}
}
