package agentflow

import (
	"errors"
	"testing"
)

// ragWorkflow is a minimal, valid RAG agent reused across tests:
// input → retriever → llm → output.
func ragWorkflow() Workflow {
	return Workflow{
		Name: "RAG Agent",
		Graph: Graph{
			Nodes: []Node{
				{ID: "in", Type: TypeInput, Label: "Query"},
				{ID: "ret", Type: TypeRetriever, Label: "Retrieve"},
				{ID: "gen", Type: TypeLLM, Label: "Answer"},
				{ID: "out", Type: TypeOutput, Label: "Reply"},
			},
			Edges: []Edge{
				{ID: "e1", Source: "in", Target: "ret"},
				{ID: "e2", Source: "ret", Target: "gen"},
				{ID: "e3", Source: "gen", Target: "out"},
			},
		},
	}
}

func TestValidateAcceptsRAGWorkflow(t *testing.T) {
	cat := NewCatalog()
	w := ragWorkflow()
	normalize(&w, cat)
	if err := validate(&w, cat); err != nil {
		t.Fatalf("expected valid RAG workflow, got: %v", err)
	}
}

func TestNormalizeFillsDefaultsAndLayout(t *testing.T) {
	cat := NewCatalog()
	w := ragWorkflow()
	normalize(&w, cat)

	var ret, gen *Node
	for i := range w.Graph.Nodes {
		switch w.Graph.Nodes[i].ID {
		case "ret":
			ret = &w.Graph.Nodes[i]
		case "gen":
			gen = &w.Graph.Nodes[i]
		}
	}
	if ret.Config.IndexType != "hnsw" || ret.Config.TopK != 5 || ret.Config.Dim != 768 {
		t.Fatalf("retriever defaults not applied: %+v", ret.Config)
	}
	if gen.Config.Model == "" || gen.Config.MaxTokens == 0 {
		t.Fatalf("llm defaults not applied: %+v", gen.Config)
	}
	// Every node but the first was laid out off the origin.
	for _, n := range w.Graph.Nodes[1:] {
		if n.Position.X == 0 && n.Position.Y == 0 {
			t.Fatalf("node %s left at origin after normalize", n.ID)
		}
	}
}

func TestClampConfigBounds(t *testing.T) {
	cat := NewCatalog()
	w := Workflow{
		Name: "Bounds",
		Graph: Graph{Nodes: []Node{
			{ID: "l", Type: TypeLoop, Config: NodeConfig{MaxIterations: 999}},
			{ID: "g", Type: TypeLLM, Config: NodeConfig{Temperature: 9, MaxTokens: 99999, Model: "x"}},
			{ID: "r", Type: TypeRetriever, Config: NodeConfig{IndexType: "bogus", TopK: -3, Dim: 0}},
		}},
	}
	normalize(&w, cat)
	if got := w.Graph.Nodes[0].Config.MaxIterations; got != 20 {
		t.Errorf("loop iterations not clamped: got %d, want 20", got)
	}
	if got := w.Graph.Nodes[1].Config.Temperature; got != 2 {
		t.Errorf("temperature not clamped: got %v, want 2", got)
	}
	if got := w.Graph.Nodes[1].Config.MaxTokens; got != 8192 {
		t.Errorf("maxTokens not clamped: got %d, want 8192", got)
	}
	if got := w.Graph.Nodes[2].Config.IndexType; got != "hnsw" {
		t.Errorf("bogus index type not corrected: got %q", got)
	}
	if got := w.Graph.Nodes[2].Config.TopK; got != 5 {
		t.Errorf("negative topK not corrected: got %d", got)
	}
}

func TestValidateRejectsUnknownType(t *testing.T) {
	cat := NewCatalog()
	w := Workflow{Name: "x", Graph: Graph{Nodes: []Node{{ID: "a", Type: "wizardry"}}}}
	err := validate(&w, cat)
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid for unknown type, got: %v", err)
	}
}

func TestValidateRejectsDanglingEdge(t *testing.T) {
	cat := NewCatalog()
	w := Workflow{Name: "x", Graph: Graph{
		Nodes: []Node{{ID: "a", Type: TypeInput}},
		Edges: []Edge{{ID: "e", Source: "a", Target: "ghost"}},
	}}
	if err := validate(&w, cat); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid for dangling edge, got: %v", err)
	}
}

func TestValidateRejectsRawCycle(t *testing.T) {
	cat := NewCatalog()
	w := Workflow{Name: "x", Graph: Graph{
		Nodes: []Node{{ID: "a", Type: TypeLLM}, {ID: "b", Type: TypeLLM}},
		Edges: []Edge{{ID: "e1", Source: "a", Target: "b"}, {ID: "e2", Source: "b", Target: "a"}},
	}}
	err := validate(&w, cat)
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid for raw cycle, got: %v", err)
	}
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"RAG Agent!":     "rag-agent",
		"  Hello World ": "hello-world",
		"***":            "workflow",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}
