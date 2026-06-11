package assist

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

func TestChatDisabledWithoutProvider(t *testing.T) {
	svc := NewService(nil, catalog.NewService())
	if svc.Enabled() {
		t.Fatal("expected service to be disabled with nil provider")
	}
	_, err := svc.Chat(context.Background(), ChatRequest{Message: "hi"})
	if err != ErrDisabled {
		t.Fatalf("expected ErrDisabled, got %v", err)
	}
}

func TestChatKeepsValidActions(t *testing.T) {
	reply := `{"reply":"Add a cache.","actions":[
		{"op":"addNode","nodeType":"redis_cache","nodeId":"cache-1","rationale":"cut DB load"},
		{"op":"addEdge","source":"api-1","target":"cache-1"},
		{"op":"updateConfig","nodeId":"api-1","config":{"replicas":6}}
	]}`
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())

	resp, err := svc.Chat(context.Background(), ChatRequest{Message: "add caching", Graph: sampleGraph()})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Actions) != 3 {
		t.Fatalf("expected 3 valid actions, got %d: %+v", len(resp.Actions), resp.Actions)
	}
	if resp.Reply == "" {
		t.Fatal("expected a non-empty reply")
	}
}

func TestChatDropsInvalidActions(t *testing.T) {
	reply := `{"reply":"x","actions":[
		{"op":"addNode","nodeType":"not_a_real_type","nodeId":"x-1"},
		{"op":"removeNode","nodeId":"ghost"},
		{"op":"addEdge","source":"api-1","target":"missing"},
		{"op":"addEdge","source":"api-1","target":"api-1"},
		{"op":"updateConfig","nodeId":"db-1","config":{"replicas":2}}
	]}`
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())

	resp, err := svc.Chat(context.Background(), ChatRequest{Message: "break things", Graph: sampleGraph()})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Only the final updateConfig on the existing db-1 node is valid.
	if len(resp.Actions) != 1 || resp.Actions[0].Op != OpUpdateConfig {
		t.Fatalf("expected only the valid updateConfig to survive, got %+v", resp.Actions)
	}
}

func TestChatSalvagesWrappedJSON(t *testing.T) {
	reply := "Sure! Here is the plan:\n{\"reply\":\"ok\",\"actions\":[]}\nHope that helps."
	svc := NewService(fakeProvider{reply: reply}, catalog.NewService())

	resp, err := svc.Chat(context.Background(), ChatRequest{Message: "explain", Graph: sampleGraph()})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Reply != "ok" {
		t.Fatalf("expected salvaged reply 'ok', got %q", resp.Reply)
	}
}
