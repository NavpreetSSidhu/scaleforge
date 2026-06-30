package interview

import (
	"context"
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
)

type fakeProvider struct {
	reply string
	err   error
}

func (f fakeProvider) Complete(_ context.Context, _, _ string) (string, error) {
	return f.reply, f.err
}

func TestStartIsDeterministicAndStateless(t *testing.T) {
	svc := NewService(nil, catalog.NewService())
	resp := svc.Start(StartRequest{Topic: "url_shortener"})
	if resp.Topic.ID != "url_shortener" {
		t.Fatalf("expected url_shortener, got %q", resp.Topic.ID)
	}
	if resp.SessionID == "" || resp.Topic.Prompt == "" {
		t.Error("expected a session id and a prompt")
	}
	// Unknown topic falls back to a valid bank entry.
	fallback := svc.Start(StartRequest{Topic: "nope"})
	if _, ok := topicByID(fallback.Topic.ID); !ok {
		t.Errorf("fallback topic %q not in bank", fallback.Topic.ID)
	}
}

func TestStartWorksWithoutProvider(t *testing.T) {
	svc := NewService(nil, catalog.NewService())
	if svc.Enabled() {
		t.Error("expected disabled without provider")
	}
	if svc.Start(StartRequest{}).Topic.ID == "" {
		t.Error("Start should work even when AI turns are disabled")
	}
}

func TestTurnDisabledWithoutProvider(t *testing.T) {
	svc := NewService(nil, catalog.NewService())
	if _, err := svc.Turn(context.Background(), TurnRequest{Message: "hi"}); err != ErrDisabled {
		t.Fatalf("expected ErrDisabled, got %v", err)
	}
}

func TestTurnParsesFollowUps(t *testing.T) {
	reply := `{"reply":"Your DB is a SPOF — how do you scale reads?","followUps":["add a replica","add a cache"],"done":false}`
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())
	resp, err := svc.Turn(context.Background(), TurnRequest{Message: "I'd add Postgres"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.FollowUps) != 2 || resp.Done {
		t.Errorf("unexpected turn response: %+v", resp)
	}
}

func TestGradeParsesAndClamps(t *testing.T) {
	reply := `{"summary":"Solid.","overall":140,"rubric":[
		{"dimension":"Scalability","score":7,"comment":"good"},
		{"dimension":"Cost","score":-1,"comment":"ok"}
	]}`
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())
	resp, err := svc.Grade(context.Background(), GradeRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Overall != 100 {
		t.Errorf("overall should clamp to 100, got %d", resp.Overall)
	}
	if resp.Rubric[0].Score != 5 || resp.Rubric[1].Score != 0 {
		t.Errorf("scores should clamp to 0..5, got %+v", resp.Rubric)
	}
}

func TestGradeSalvagesProseWrappedJSON(t *testing.T) {
	reply := "Assessment:\n{\"summary\":\"ok\",\"overall\":80,\"rubric\":[]}\nDone."
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())
	resp, err := svc.Grade(context.Background(), GradeRequest{})
	if err != nil || resp.Overall != 80 {
		t.Fatalf("expected salvaged grade 80, got %d (err %v)", resp.Overall, err)
	}
}
