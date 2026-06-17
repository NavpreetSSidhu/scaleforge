package export

import (
	"encoding/json"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/scaleforge/scaleforge/internal/agentflow"
)

// ragWithRouter: input → retriever → llm → router →(answer) output / →(tool) tool.
func ragWithRouter() agentflow.Workflow {
	cat := agentflow.NewCatalog()
	defs := cat.Map()
	mk := func(id, typ string) agentflow.Node {
		return agentflow.Node{ID: id, Type: typ, Label: id, Config: defs[typ].DefaultConfig}
	}
	return agentflow.Workflow{
		Name:        "Support RAG Agent",
		Description: "Answers questions from a knowledge base, escalating to a tool when needed.",
		Graph: agentflow.Graph{
			Nodes: []agentflow.Node{
				mk("in", agentflow.TypeInput),
				mk("ret", agentflow.TypeRetriever),
				mk("gen", agentflow.TypeLLM),
				mk("route", agentflow.TypeRouter),
				mk("tool", agentflow.TypeTool),
				mk("out", agentflow.TypeOutput),
			},
			Edges: []agentflow.Edge{
				{ID: "e1", Source: "in", Target: "ret"},
				{ID: "e2", Source: "ret", Target: "gen"},
				{ID: "e3", Source: "gen", Target: "route"},
				{ID: "e4", Source: "route", Target: "out", Label: "answer"},
				{ID: "e5", Source: "route", Target: "tool", Label: "escalate"},
			},
		},
	}
}

func fileByName(b Bundle, name string) (File, bool) {
	for _, f := range b.Files {
		if f.Name == name {
			return f, true
		}
	}
	return File{}, false
}

func TestGenerateAllTargets(t *testing.T) {
	cat := agentflow.NewCatalog()
	b := Generate(cat, ragWithRouter(), nil)
	want := []string{"agent_langgraph.py", "agent_langchain.py", "agent.go", "workflow.json", "diagram.mmd", "PROMPTS.md"}
	for _, name := range want {
		if _, ok := fileByName(b, name); !ok {
			t.Errorf("missing expected file %q", name)
		}
	}
}

func TestGeneratedGoParses(t *testing.T) {
	cat := agentflow.NewCatalog()
	b := Generate(cat, ragWithRouter(), []Target{TargetGo})
	f, _ := fileByName(b, "agent.go")
	if _, err := parser.ParseFile(token.NewFileSet(), "agent.go", f.Content, parser.AllErrors); err != nil {
		t.Fatalf("generated Go does not parse: %v\n---\n%s", err, f.Content)
	}
}

func TestWorkflowJSONRoundTrips(t *testing.T) {
	cat := agentflow.NewCatalog()
	b := Generate(cat, ragWithRouter(), []Target{TargetPortable})
	f, _ := fileByName(b, "workflow.json")
	var spec struct {
		Name  string          `json:"name"`
		Graph agentflow.Graph `json:"graph"`
	}
	if err := json.Unmarshal([]byte(f.Content), &spec); err != nil {
		t.Fatalf("workflow.json invalid: %v", err)
	}
	if spec.Name != "Support RAG Agent" || len(spec.Graph.Nodes) != 6 {
		t.Fatalf("workflow.json content wrong: %+v", spec)
	}
}

func TestMermaidShape(t *testing.T) {
	cat := agentflow.NewCatalog()
	b := Generate(cat, ragWithRouter(), []Target{TargetPortable})
	f, _ := fileByName(b, "diagram.mmd")
	if !strings.HasPrefix(f.Content, "flowchart TD") {
		t.Fatalf("mermaid should start with flowchart TD:\n%s", f.Content)
	}
	if !strings.Contains(f.Content, "|answer|") || !strings.Contains(f.Content, "|escalate|") {
		t.Fatalf("router branch labels missing from mermaid:\n%s", f.Content)
	}
}

func TestPromptPackContainsPrompt(t *testing.T) {
	cat := agentflow.NewCatalog()
	b := Generate(cat, ragWithRouter(), []Target{TargetPortable})
	f, _ := fileByName(b, "PROMPTS.md")
	if !strings.Contains(f.Content, "System prompt") || !strings.Contains(f.Content, "Args schema") {
		t.Fatalf("prompt pack missing sections:\n%s", f.Content)
	}
}

// TestGeneratedPythonCompiles is best-effort: it only runs when python3 exists.
func TestGeneratedPythonCompiles(t *testing.T) {
	py, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not available; skipping py_compile check")
	}
	cat := agentflow.NewCatalog()
	b := Generate(cat, ragWithRouter(), []Target{TargetLangGraph, TargetLangChain})
	dir := t.TempDir()
	for _, name := range []string{"agent_langgraph.py", "agent_langchain.py"} {
		f, _ := fileByName(b, name)
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(f.Content), 0o644); err != nil {
			t.Fatal(err)
		}
		out, err := exec.Command(py, "-m", "py_compile", path).CombinedOutput()
		if err != nil {
			t.Fatalf("%s failed py_compile: %v\n%s", name, err, out)
		}
	}
}
