package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/assist"
	"github.com/scaleforge/scaleforge/internal/catalog"
)

// stubProvider lets the handler tests run an "enabled" assistant without network.
type stubProvider struct{ reply string }

func (s stubProvider) Complete(_ context.Context, _, _ string) (string, error) {
	return s.reply, nil
}

func newAssistTestRouter(provider assist.Provider) *gin.Engine {
	gin.SetMode(gin.TestMode)
	svc := assist.NewService(provider, catalog.NewService())
	h := NewAssistHandler(svc)
	r := gin.New()
	r.POST("/assistant", h.Chat)
	return r
}

func postAssistant(r *gin.Engine, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/assistant", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestAssistantDisabledReturns503(t *testing.T) {
	r := newAssistTestRouter(nil) // nil provider => disabled
	w := postAssistant(r, `{"message":"explain"}`)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
}

func TestAssistantReturnsReply(t *testing.T) {
	r := newAssistTestRouter(stubProvider{reply: `{"reply":"hello","actions":[]}`})
	w := postAssistant(r, `{"message":"explain","graph":{"nodes":[],"edges":[]}}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "hello") {
		t.Fatalf("expected reply in body, got %s", w.Body.String())
	}
}

func TestAssistantRateLimited(t *testing.T) {
	r := newAssistTestRouter(stubProvider{reply: `{"reply":"ok","actions":[]}`})
	// The limiter allows 10/min; the 11th from the same client must be throttled.
	var last int
	for i := 0; i < 12; i++ {
		w := postAssistant(r, `{"message":"hi","graph":{"nodes":[],"edges":[]}}`)
		last = w.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after exceeding the rate limit, got %d", last)
	}
}
