package assist

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestProvider points a provider at a stub server standing in for Groq.
func newTestProvider(handler http.HandlerFunc) (*GroqProvider, func()) {
	srv := httptest.NewServer(handler)
	p := NewGroqProvider("test-key", "some-model")
	p.baseURL = srv.URL
	return p, srv.Close
}

func TestDefaultModelIsUsedWhenUnset(t *testing.T) {
	if got := NewGroqProvider("k", "").model; got != DefaultModel {
		t.Errorf("empty model should fall back to DefaultModel, got %q", got)
	}
	if got := NewGroqProvider("k", "custom").model; got != "custom" {
		t.Errorf("explicit model should win, got %q", got)
	}
}

// TestRetiredModelIsReportedAsConfiguration is the regression test for a real
// outage: the default model was retired by the provider, and every AI feature
// began failing with an opaque 502 that read like a bug rather than a setting.
func TestRetiredModelIsReportedAsConfiguration(t *testing.T) {
	p, done := newTestProvider(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"message":"The model ` + "`x`" + ` does not exist","type":"invalid_request_error","code":"model_not_found"}}`))
	})
	defer done()

	_, err := p.Complete(context.Background(), "sys", "user")
	if err == nil {
		t.Fatal("expected an error for a retired model")
	}
	for _, want := range []string{"some-model", "ASSIST_MODEL"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should name %q so it can be acted on, got: %v", want, err)
		}
	}
}

func TestBadKeyIsReportedAsSuch(t *testing.T) {
	p, done := newTestProvider(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"Invalid API Key"}}`))
	})
	defer done()

	_, err := p.Complete(context.Background(), "sys", "user")
	if err == nil || !strings.Contains(err.Error(), "GROQ_API_KEY") {
		t.Errorf("expected the error to point at the API key, got: %v", err)
	}
}

func TestRateLimitIsReportedAsTransient(t *testing.T) {
	p, done := newTestProvider(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":{"message":"rate limit"}}`))
	})
	defer done()

	_, err := p.Complete(context.Background(), "sys", "user")
	if err == nil || !strings.Contains(err.Error(), "rate limiting") {
		t.Errorf("expected a rate-limit error, got: %v", err)
	}
}

// TestJSONModeOnlyOnTheJSONPath guards the split between the two entry points:
// Groq rejects JSON mode unless the prompt mentions json, and the agent runtime's
// prompts are prose.
func TestJSONModeOnlyOnTheJSONPath(t *testing.T) {
	for _, tc := range []struct {
		name     string
		call     func(p *GroqProvider) (string, error)
		wantJSON bool
	}{
		{"Complete", func(p *GroqProvider) (string, error) {
			return p.Complete(context.Background(), "s", "u")
		}, true},
		{"CompleteText", func(p *GroqProvider) (string, error) {
			return p.CompleteText(context.Background(), "s", "u")
		}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var gotBody string
			p, done := newTestProvider(func(w http.ResponseWriter, r *http.Request) {
				buf := make([]byte, r.ContentLength)
				_, _ = r.Body.Read(buf)
				gotBody = string(buf)
				_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"{}"}}]}`))
			})
			defer done()

			if _, err := tc.call(p); err != nil {
				t.Fatalf("call: %v", err)
			}
			hasJSONMode := strings.Contains(gotBody, "json_object")
			if hasJSONMode != tc.wantJSON {
				t.Errorf("json mode = %v, want %v (body: %s)", hasJSONMode, tc.wantJSON, gotBody)
			}
		})
	}
}
