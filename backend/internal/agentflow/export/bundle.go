// Package export turns a designed agentic Workflow into runnable scaffolds and a
// portable spec: LangGraph (Python), LangChain (Python), a self-contained Go
// program, and a framework-agnostic JSON + Mermaid diagram + prompt pack. Each
// target embeds the workflow's generated system prompts and tool schemas so the
// exported code is faithful to what was simulated. Exporters are pure (no LLM, no
// DB) and emit text via the stdlib only.
package export

import (
	"fmt"
	"sort"

	"github.com/scaleforge/scaleforge/internal/agentflow"
)

// Target selects an output format.
type Target string

const (
	TargetLangGraph Target = "langgraph"
	TargetLangChain Target = "langchain"
	TargetGo        Target = "go"
	TargetPortable  Target = "portable"
)

// File is one generated artifact.
type File struct {
	Name     string `json:"name"`
	Language string `json:"language"` // for client syntax highlighting
	Content  string `json:"content"`
}

// Bundle is the set of files produced for the requested targets.
type Bundle struct {
	Files []File `json:"files"`
}

// Generate produces the artifacts for the requested targets (all targets when
// none are given). The catalog supplies per-node defaults/labels the generators
// reference.
func Generate(cat *agentflow.Catalog, wf agentflow.Workflow, targets []Target) Bundle {
	if len(targets) == 0 {
		targets = []Target{TargetLangGraph, TargetLangChain, TargetGo, TargetPortable}
	}
	var b Bundle
	for _, t := range targets {
		switch t {
		case TargetLangGraph:
			b.Files = append(b.Files, File{Name: "agent_langgraph.py", Language: "python", Content: genLangGraph(cat, wf)})
		case TargetLangChain:
			b.Files = append(b.Files, File{Name: "agent_langchain.py", Language: "python", Content: genLangChain(cat, wf)})
		case TargetGo:
			b.Files = append(b.Files, File{Name: "agent.go", Language: "go", Content: genGo(cat, wf)})
		case TargetPortable:
			b.Files = append(b.Files,
				File{Name: "workflow.json", Language: "json", Content: genWorkflowJSON(wf)},
				File{Name: "diagram.mmd", Language: "mermaid", Content: Mermaid(wf)},
				File{Name: "PROMPTS.md", Language: "markdown", Content: genPromptPack(cat, wf)},
			)
		}
	}
	return b
}

// --- shared graph helpers used by every generator ---

// orderedNodes returns nodes in topological order (Kahn) so generated code
// declares/executes steps in dependency order. Ties break by original index for
// stable, deterministic output.
func orderedNodes(g agentflow.Graph) []agentflow.Node {
	idx := make(map[string]int, len(g.Nodes))
	for i, n := range g.Nodes {
		idx[n.ID] = i
	}
	indeg := make([]int, len(g.Nodes))
	adj := make([][]int, len(g.Nodes))
	for _, e := range g.Edges {
		s, ok1 := idx[e.Source]
		t, ok2 := idx[e.Target]
		if !ok1 || !ok2 {
			continue
		}
		adj[s] = append(adj[s], t)
		indeg[t]++
	}
	var queue []int
	for i := range g.Nodes {
		if indeg[i] == 0 {
			queue = append(queue, i)
		}
	}
	sort.Ints(queue)
	var order []agentflow.Node
	for len(queue) > 0 {
		u := queue[0]
		queue = queue[1:]
		order = append(order, g.Nodes[u])
		var next []int
		for _, v := range adj[u] {
			indeg[v]--
			if indeg[v] == 0 {
				next = append(next, v)
			}
		}
		sort.Ints(next)
		queue = append(queue, next...)
	}
	// Append any leftovers (defensive; validate forbids cycles).
	if len(order) < len(g.Nodes) {
		seen := make(map[string]bool, len(order))
		for _, n := range order {
			seen[n.ID] = true
		}
		for _, n := range g.Nodes {
			if !seen[n.ID] {
				order = append(order, n)
			}
		}
	}
	return order
}

// successors returns the outgoing edges of a node id, preserving order.
func successors(g agentflow.Graph, id string) []agentflow.Edge {
	var out []agentflow.Edge
	for _, e := range g.Edges {
		if e.Source == id {
			out = append(out, e)
		}
	}
	return out
}

// nodeByID looks up a node.
func nodeByID(g agentflow.Graph, id string) (agentflow.Node, bool) {
	for _, n := range g.Nodes {
		if n.ID == id {
			return n, true
		}
	}
	return agentflow.Node{}, false
}

// pyIdent / goIdent sanitize a node id into a safe identifier for generated code.
func ident(prefix, id string) string {
	var out []rune
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			out = append(out, r)
		default:
			out = append(out, '_')
		}
	}
	return fmt.Sprintf("%s_%s", prefix, string(out))
}
