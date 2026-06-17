package runtime

import (
	"sort"
	"strings"

	"github.com/scaleforge/scaleforge/internal/agentflow"
)

// plan walks the graph and resolves which nodes actually execute and how data
// flows, deciding router branches up front from the input query so the executed
// subgraph is known (enabling clean wave-parallel scheduling). A router picks the
// outgoing edge whose label appears in the query, else its first edge — a
// deterministic, explainable dry-run policy.
func plan(g agentflow.Graph, input string) (executed map[string]bool, activePred, activeSucc map[string][]string, routeChoice map[string]string) {
	executed = make(map[string]bool)
	activePred = make(map[string][]string)
	activeSucc = make(map[string][]string)
	routeChoice = make(map[string]string)

	order := topo(g)
	hasIn := make(map[string]bool)
	for _, e := range g.Edges {
		hasIn[e.Target] = true
	}
	for _, n := range g.Nodes {
		if !hasIn[n.ID] {
			executed[n.ID] = true
		}
	}

	lowerQ := strings.ToLower(input)
	outEdges := make(map[string][]agentflow.Edge)
	for _, e := range g.Edges {
		outEdges[e.Source] = append(outEdges[e.Source], e)
	}

	for _, id := range order {
		if !executed[id] {
			continue
		}
		node, _ := nodeByID(g, id)
		edges := outEdges[id]
		if node.Type == agentflow.TypeRouter && len(edges) > 1 {
			chosen := edges[0]
			for _, e := range edges {
				if e.Label != "" && strings.Contains(lowerQ, strings.ToLower(e.Label)) {
					chosen = e
					break
				}
			}
			routeChoice[id] = branchLabel(chosen)
			edges = []agentflow.Edge{chosen}
		}
		for _, e := range edges {
			executed[e.Target] = true
			activeSucc[id] = append(activeSucc[id], e.Target)
			activePred[e.Target] = append(activePred[e.Target], id)
		}
	}
	return executed, activePred, activeSucc, routeChoice
}

func branchLabel(e agentflow.Edge) string {
	if e.Label != "" {
		return e.Label
	}
	return e.Target
}

// topo returns node ids in topological order (Kahn). The graph is validated
// acyclic; any leftovers are appended in declaration order.
func topo(g agentflow.Graph) []string {
	idx := make(map[string]int, len(g.Nodes))
	for i, n := range g.Nodes {
		idx[n.ID] = i
	}
	indeg := make([]int, len(g.Nodes))
	adj := make([][]int, len(g.Nodes))
	for _, e := range g.Edges {
		s, ok1 := idx[e.Source]
		t, ok2 := idx[e.Target]
		if ok1 && ok2 {
			adj[s] = append(adj[s], t)
			indeg[t]++
		}
	}
	var q []int
	for i := range g.Nodes {
		if indeg[i] == 0 {
			q = append(q, i)
		}
	}
	sort.Ints(q)
	var order []string
	seen := make(map[int]bool)
	for len(q) > 0 {
		u := q[0]
		q = q[1:]
		order = append(order, g.Nodes[u].ID)
		seen[u] = true
		var next []int
		for _, v := range adj[u] {
			indeg[v]--
			if indeg[v] == 0 {
				next = append(next, v)
			}
		}
		sort.Ints(next)
		q = append(q, next...)
	}
	for i, n := range g.Nodes {
		if !seen[i] {
			order = append(order, n.ID)
		}
	}
	return order
}

// stableOrder sorts node ids by their position in the graph for deterministic
// wave execution order.
func stableOrder(g agentflow.Graph, ids []string) []string {
	pos := make(map[string]int, len(g.Nodes))
	for i, n := range g.Nodes {
		pos[n.ID] = i
	}
	out := append([]string(nil), ids...)
	sort.Slice(out, func(i, j int) bool { return pos[out[i]] < pos[out[j]] })
	return out
}

// finalAnswer picks the run's result: the output node's text if present, else the
// last executed LLM output in topological order, else any non-empty output.
func finalAnswer(g agentflow.Graph, executed map[string]bool, outputs map[string]string) string {
	order := topo(g)
	var lastLLM, anyOut string
	for _, id := range order {
		if !executed[id] {
			continue
		}
		n, _ := nodeByID(g, id)
		out := outputs[id]
		if out != "" {
			anyOut = out
		}
		if n.Type == agentflow.TypeOutput && out != "" {
			return out
		}
		if n.Type == agentflow.TypeLLM && out != "" {
			lastLLM = out
		}
	}
	if lastLLM != "" {
		return lastLLM
	}
	return anyOut
}
