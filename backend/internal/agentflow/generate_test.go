package agentflow

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type stubProvider struct {
	reply string
	err   error
}

func (s stubProvider) Complete(ctx context.Context, system, user string) (string, error) {
	return s.reply, s.err
}

func TestGenerateDraftValid(t *testing.T) {
	cat := NewCatalog()
	reply := `{
      "name": "FAQ Bot",
      "description": "Answers FAQs over a KB.",
      "graph": {
        "nodes": [
          {"id":"in","type":"input","label":"Question"},
          {"id":"ret","type":"retriever","label":"KB"},
          {"id":"gen","type":"llm","label":"Answer"},
          {"id":"out","type":"output","label":"Reply"}
        ],
        "edges": [
          {"id":"e1","source":"in","target":"ret"},
          {"id":"e2","source":"ret","target":"gen"},
          {"id":"e3","source":"gen","target":"out"}
        ]
      }
    }`
	svc := NewService(stubProvider{reply: reply}, cat, nil)
	w, err := svc.GenerateDraft(context.Background(), GenerateInput{Prompt: "make a faq bot"})
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	if w.Name != "FAQ Bot" || len(w.Graph.Nodes) != 4 {
		t.Fatalf("unexpected draft: %+v", w)
	}
	if w.ID != "" || w.UserID != "" || w.Slug != "" {
		t.Fatalf("draft must not carry a persistence envelope: %+v", w)
	}
	// Defaults must be filled by normalize (so the editor/sim work immediately).
	for _, n := range w.Graph.Nodes {
		if n.Type == TypeRetriever && n.Config.IndexType == "" {
			t.Fatalf("retriever defaults not applied: %+v", n.Config)
		}
	}
}

func TestGenerateDraftRejectsBogusType(t *testing.T) {
	cat := NewCatalog()
	// Both the first attempt and the repair return the same invalid type, so the
	// final error is ErrInvalid (validation), not a panic or a saved bad draft.
	reply := `{"name":"x","graph":{"nodes":[{"id":"a","type":"sorcery"}],"edges":[]}}`
	svc := NewService(stubProvider{reply: reply}, cat, nil)
	_, err := svc.GenerateDraft(context.Background(), GenerateInput{Prompt: "x"})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid for bogus node type, got %v", err)
	}
}

func TestGenerateDisabledWithoutProvider(t *testing.T) {
	svc := NewService(nil, NewCatalog(), nil)
	if svc.Enabled() {
		t.Fatal("service should report disabled without a provider")
	}
	_, err := svc.GenerateDraft(context.Background(), GenerateInput{Prompt: "x"})
	if !errors.Is(err, ErrDisabled) {
		t.Fatalf("expected ErrDisabled, got %v", err)
	}
}

// In JSON mode the model still returns syntactically valid JSON, but for a tool
// node it tends to inline toolSchema as an object and quote numeric config
// values. These shapes must decode, not be rejected as "unparseable JSON".
func TestGenerateToleratesLLMConfigShapes(t *testing.T) {
	cat := NewCatalog()
	reply := `{
      "name": "Support Agent",
      "description": "Answers from KB, escalates when unsure.",
      "graph": {
        "nodes": [
          {"id":"in","type":"input","label":"Question"},
          {"id":"ret","type":"retriever","label":"KB"},
          {"id":"gen","type":"llm","label":"Answer","config":{"prompt":"Answer","temperature":"0.3","maxTokens":"512"}},
          {"id":"rt","type":"router","label":"Confident?","config":{"condition":"confidence < 0.5"}},
          {"id":"esc","type":"tool","label":"Escalate","config":{"toolName":"escalate_to_human","toolSchema":{"type":"object","properties":{"reason":{"type":"string"}}}}},
          {"id":"out","type":"output","label":"Reply"}
        ],
        "edges": [
          {"id":"e1","source":"in","target":"ret"},
          {"id":"e2","source":"ret","target":"gen"},
          {"id":"e3","source":"gen","target":"rt"},
          {"id":"e4","source":"rt","target":"out","label":"confident"},
          {"id":"e5","source":"rt","target":"esc","label":"unsure"},
          {"id":"e6","source":"esc","target":"out"}
        ]
      }
    }`
	svc := NewService(stubProvider{reply: reply}, cat, nil)
	w, err := svc.GenerateDraft(context.Background(), GenerateInput{Prompt: "support agent"})
	if err != nil {
		t.Fatalf("generate failed on LLM config shapes: %v", err)
	}
	var gen, tool Node
	for _, n := range w.Graph.Nodes {
		switch n.ID {
		case "gen":
			gen = n
		case "esc":
			tool = n
		}
	}
	if gen.Config.Temperature != 0.3 || gen.Config.MaxTokens != 512 {
		t.Fatalf("quoted numerics not coerced: %+v", gen.Config)
	}
	if !strings.Contains(tool.Config.ToolSchema, "properties") {
		t.Fatalf("object toolSchema not preserved as text: %q", tool.Config.ToolSchema)
	}
}

func TestGenerateSalvagesProseWrappedJSON(t *testing.T) {
	cat := NewCatalog()
	reply := "Sure! Here is your workflow:\n```json\n" + `{"name":"Echo","graph":{"nodes":[{"id":"in","type":"input"},{"id":"out","type":"output"}],"edges":[{"id":"e1","source":"in","target":"out"}]}}` + "\n```\nEnjoy!"
	svc := NewService(stubProvider{reply: reply}, cat, nil)
	w, err := svc.GenerateDraft(context.Background(), GenerateInput{Prompt: "x"})
	if err != nil {
		t.Fatalf("salvage failed: %v", err)
	}
	if w.Name != "Echo" {
		t.Fatalf("unexpected salvage result: %+v", w)
	}
}
