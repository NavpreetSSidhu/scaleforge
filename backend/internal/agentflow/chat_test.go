package agentflow

import (
	"context"
	"errors"
	"testing"
)

// ragGraph is a minimal valid workflow the chat assistant reasons over in tests.
func ragGraph() Graph {
	return Graph{
		Nodes: []Node{
			{ID: "in", Type: TypeInput, Label: "Query"},
			{ID: "gen", Type: TypeLLM, Label: "Answer"},
			{ID: "out", Type: TypeOutput, Label: "Reply"},
		},
		Edges: []Edge{
			{ID: "e1", Source: "in", Target: "gen"},
			{ID: "e2", Source: "gen", Target: "out"},
		},
	}
}

func TestChatDisabledWithoutProvider(t *testing.T) {
	svc := NewService(nil, NewCatalog(), nil)
	_, err := svc.Chat(context.Background(), ChatRequest{Message: "hi", Graph: ragGraph()})
	if !errors.Is(err, ErrDisabled) {
		t.Fatalf("expected ErrDisabled, got %v", err)
	}
}

func TestChatKeepsValidActionsDropsInvalid(t *testing.T) {
	reply := `{
      "reply": "Add a retriever before the LLM so it can ground answers.",
      "actions": [
        {"op":"addNode","nodeType":"retriever","nodeId":"ret","label":"Knowledge Base","config":{"topK":8}},
        {"op":"addEdge","source":"in","target":"ret"},
        {"op":"addEdge","source":"ret","target":"gen"},
        {"op":"removeEdge","source":"in","target":"gen"},
        {"op":"addNode","nodeType":"sorcery","nodeId":"bad"},
        {"op":"updateConfig","nodeId":"ghost","config":{"topK":3}},
        {"op":"addEdge","source":"gen","target":"gen"}
      ]
    }`
	svc := NewService(stubProvider{reply: reply}, NewCatalog(), nil)
	resp, err := svc.Chat(context.Background(), ChatRequest{Message: "ground the answers", Graph: ragGraph()})
	if err != nil {
		t.Fatalf("chat failed: %v", err)
	}
	if resp.Reply == "" {
		t.Fatal("expected a reply")
	}
	// Kept: addNode(retriever), addEdge in->ret, addEdge ret->gen, removeEdge in->gen.
	// Dropped: addNode(sorcery=unknown type), updateConfig(ghost=missing id),
	// self-edge gen->gen.
	if len(resp.Actions) != 4 {
		t.Fatalf("expected 4 valid actions, got %d: %+v", len(resp.Actions), resp.Actions)
	}
	for _, a := range resp.Actions {
		if a.Op == ChatOpAddNode && a.NodeType == "sorcery" {
			t.Fatal("unknown node type should have been dropped")
		}
		if a.Source == a.Target && a.Source != "" {
			t.Fatal("self-edge should have been dropped")
		}
	}
}

func TestChatSalvagesProseWrappedJSON(t *testing.T) {
	reply := "Sure:\n```json\n" + `{"reply":"ok","actions":[]}` + "\n```"
	svc := NewService(stubProvider{reply: reply}, NewCatalog(), nil)
	resp, err := svc.Chat(context.Background(), ChatRequest{Message: "explain", Graph: ragGraph()})
	if err != nil {
		t.Fatalf("salvage failed: %v", err)
	}
	if resp.Reply != "ok" || len(resp.Actions) != 0 {
		t.Fatalf("unexpected salvage result: %+v", resp)
	}
}
