package tutor

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
)

// fakeProvider returns a canned reply and records the prompts it received.
type fakeProvider struct {
	reply      string
	lastSystem string
	lastUser   string
}

func (f *fakeProvider) Complete(_ context.Context, system, user string) (string, error) {
	f.lastSystem = system
	f.lastUser = user
	return f.reply, nil
}

func TestExplainReturnsProse(t *testing.T) {
	fp := &fakeProvider{reply: `{"reply":"A rate limiter caps requests per second."}`}
	svc := NewService(fp, catalog.NewService(), nil)

	got, err := svc.Explain(context.Background(), ExplainRequest{
		CourseTitle:    "Rate Limiting",
		StepTitle:      "The limiter",
		StepBody:       "Caps requests.",
		FocusComponent: "api_gateway",
	})
	if err != nil {
		t.Fatalf("Explain: %v", err)
	}
	if got.Reply != "A rate limiter caps requests per second." {
		t.Fatalf("unexpected reply: %q", got.Reply)
	}
	// The focused component and catalog grounding must reach the model.
	if !strings.Contains(fp.lastUser, "api_gateway") {
		t.Errorf("focus component not in user prompt")
	}
	if !strings.Contains(fp.lastSystem, "Component catalog") {
		t.Errorf("catalog grounding not in system prompt")
	}
}

func TestAskSalvagesProseWrappedJSON(t *testing.T) {
	fp := &fakeProvider{reply: "Sure! {\"reply\":\"Use a token bucket.\"} hope that helps"}
	svc := NewService(fp, catalog.NewService(), nil)

	got, err := svc.Ask(context.Background(), AskRequest{Question: "How do I throttle?"})
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	if got.Reply != "Use a token bucket." {
		t.Fatalf("salvage failed, got: %q", got.Reply)
	}
}

func TestDisabledWhenNoProvider(t *testing.T) {
	svc := NewService(nil, catalog.NewService(), nil)
	if svc.Enabled() {
		t.Fatal("expected disabled with nil provider")
	}
	if _, err := svc.Explain(context.Background(), ExplainRequest{}); !errors.Is(err, ErrDisabled) {
		t.Fatalf("Explain: want ErrDisabled, got %v", err)
	}
	if _, err := svc.Ask(context.Background(), AskRequest{Question: "x"}); !errors.Is(err, ErrDisabled) {
		t.Fatalf("Ask: want ErrDisabled, got %v", err)
	}
}
