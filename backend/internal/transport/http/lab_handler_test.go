package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/lab"
)

// newLabTestRouter wires the lab routes against a manager with the given gate.
// A disabled manager touches Docker on no path, so these tests never need a daemon.
func newLabTestRouter(enabled bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewLabHandler(lab.NewManager(enabled, lab.NewCatalog()), "http://localhost:5173")
	r := gin.New()
	r.GET("/labs", h.Status)
	r.GET("/labs/sessions", h.ListSessions)
	r.POST("/labs/sessions", h.StartSession)
	r.GET("/labs/sessions/:id", h.GetSession)
	r.DELETE("/labs/sessions/:id", h.StopSession)
	r.POST("/labs/sessions/:id/verify", h.Verify)
	r.GET("/labs/sessions/:id/hint", h.Hint)
	return r
}

func doLab(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestLabStatusReportsDisabled(t *testing.T) {
	w := doLab(newLabTestRouter(false), http.MethodGet, "/labs", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body struct {
		Enabled bool      `json:"enabled"`
		Docker  bool      `json:"docker"`
		Labs    []lab.Lab `json:"labs"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Enabled {
		t.Error("expected enabled=false when the feature gate is off")
	}
	if body.Docker {
		t.Error("expected docker=false when the feature gate is off")
	}
	// The catalog is still served so the UI can advertise what labs exist.
	if len(body.Labs) == 0 {
		t.Error("expected the lab catalog to be served even when disabled")
	}
}

// TestLabCatalogWithholdsAnswers is the regression test for hints having shipped
// with the catalog: the check scripts and hints are the answer key, and serving
// them alongside the objectives would defeat the exercise.
func TestLabCatalogWithholdsAnswers(t *testing.T) {
	w := doLab(newLabTestRouter(true), http.MethodGet, "/labs", "")
	body := w.Body.String()

	for _, leaked := range []string{`"hint"`, `"check"`, "aws s3 mb", "kubectl create namespace"} {
		if strings.Contains(body, leaked) {
			t.Errorf("lab catalog leaks the answer key: found %q", leaked)
		}
	}
	// Sanity: the objectives themselves are still there.
	if !strings.Contains(body, `"tasks"`) || !strings.Contains(body, "Create a bucket") {
		t.Error("expected the catalog to still describe the objectives")
	}
}

func TestStartLabDisabledReturns503(t *testing.T) {
	w := doLab(newLabTestRouter(false), http.MethodPost, "/labs/sessions", `{"labId":"s3-object-storage"}`)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestStartLabRejectsMissingLabID(t *testing.T) {
	w := doLab(newLabTestRouter(true), http.MethodPost, "/labs/sessions", `{}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a body with no labId, got %d", w.Code)
	}
}

func TestStartLabRejectsUnknownLab(t *testing.T) {
	w := doLab(newLabTestRouter(true), http.MethodPost, "/labs/sessions", `{"labId":"nope"}`)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for an unknown lab, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "unknown lab") {
		t.Errorf("expected the error to name the problem, got %s", w.Body.String())
	}
}

func TestGetUnknownSessionReturns404(t *testing.T) {
	w := doLab(newLabTestRouter(true), http.MethodGet, "/labs/sessions/does-not-exist", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestStopUnknownSessionReturns404(t *testing.T) {
	w := doLab(newLabTestRouter(true), http.MethodDelete, "/labs/sessions/does-not-exist", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestVerifyUnknownSessionReturns422(t *testing.T) {
	w := doLab(newLabTestRouter(true), http.MethodPost, "/labs/sessions/does-not-exist/verify", "")
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", w.Code)
	}
}

func TestHintUnknownSessionReturns404(t *testing.T) {
	w := doLab(newLabTestRouter(true), http.MethodGet, "/labs/sessions/does-not-exist/hint?task=create-bucket", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

// TestListSessionsIsAlwaysAnArray guards the JSON contract for a client that
// iterates the result without a null check.
func TestListSessionsIsAlwaysAnArray(t *testing.T) {
	w := doLab(newLabTestRouter(true), http.MethodGet, "/labs/sessions", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body struct {
		Sessions []lab.SessionView `json:"sessions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if strings.Contains(w.Body.String(), `"sessions":null`) {
		t.Error("empty session list marshalled to null instead of []")
	}
}
