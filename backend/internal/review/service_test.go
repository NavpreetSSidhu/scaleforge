package review

import (
	"context"
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// fakeProvider returns a canned response, ignoring the prompts.
type fakeProvider struct {
	reply string
	err   error
}

func (f fakeProvider) Complete(_ context.Context, _, _ string) (string, error) {
	return f.reply, f.err
}

func sampleGraph() simulation.Graph {
	return simulation.Graph{
		Nodes: []simulation.Node{
			{ID: "api-1", Type: "api_service", Label: "API"},
			{ID: "db-1", Type: "sql_primary", Label: "DB"},
		},
		Edges: []simulation.Edge{{ID: "e1", Source: "api-1", Target: "db-1"}},
	}
}

func TestReviewDisabledWithoutProvider(t *testing.T) {
	svc := NewService(nil, catalog.NewService())
	if svc.Enabled() {
		t.Fatal("expected service disabled with nil provider")
	}
	if _, err := svc.Review(context.Background(), Request{}); err != ErrDisabled {
		t.Fatalf("expected ErrDisabled, got %v", err)
	}
}

func TestReviewParsesAndValidatesFindings(t *testing.T) {
	reply := `{"summary":"DB is a SPOF.","findings":[
		{"severity":"critical","category":"Reliability","title":"Single Postgres","detail":"No replica.","actions":[
			{"op":"addNode","nodeType":"read_replica","nodeId":"rr-1"},
			{"op":"addEdge","source":"api-1","target":"rr-1"},
			{"op":"addNode","nodeType":"not_a_real_type","nodeId":"x"}
		]},
		{"severity":"low","category":"Observability","title":"No monitoring","detail":"Add metrics.","actions":[]}
	]}`
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())

	resp, err := svc.Review(context.Background(), Request{Graph: sampleGraph()})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Summary == "" {
		t.Error("expected a summary")
	}
	if len(resp.Findings) != 2 {
		t.Fatalf("expected 2 findings, got %d", len(resp.Findings))
	}
	// Critical sorts before low.
	if resp.Findings[0].Severity != SeverityCritical {
		t.Errorf("expected critical first, got %q", resp.Findings[0].Severity)
	}
	// The unknown-type action is dropped; the two valid ones remain.
	if got := len(resp.Findings[0].Actions); got != 2 {
		t.Errorf("expected 2 valid actions after validation, got %d", got)
	}
}

func TestReviewSalvagesProseWrappedJSON(t *testing.T) {
	reply := "Here is the review:\n{\"summary\":\"ok\",\"findings\":[]}\nHope that helps!"
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())
	resp, err := svc.Review(context.Background(), Request{Graph: sampleGraph()})
	if err != nil {
		t.Fatalf("expected salvage to succeed, got %v", err)
	}
	if resp.Summary != "ok" {
		t.Errorf("expected salvaged summary, got %q", resp.Summary)
	}
}

func TestReviewDefaultsBlankSeverity(t *testing.T) {
	reply := `{"summary":"s","findings":[{"category":"Cost","title":"t","detail":"d","actions":[]}]}`
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())
	resp, _ := svc.Review(context.Background(), Request{Graph: sampleGraph()})
	if resp.Findings[0].Severity != SeverityMedium {
		t.Errorf("expected blank severity to default to medium, got %q", resp.Findings[0].Severity)
	}
}
