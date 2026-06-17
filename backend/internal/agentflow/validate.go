package agentflow

import (
	"fmt"
	"strings"
)

// Enum vocabularies for retriever config, shared by validation and the vector
// engine. Kept here so the editor and the AI generator are held to the same set.
var (
	indexTypes    = map[string]bool{"flat": true, "ivf": true, "hnsw": true}
	quantizations = map[string]bool{"none": true, "scalar": true, "product": true}
)

// normalize fills in everything the editor or the AI generator can leave blank so
// a draft is well-formed before validation: generated ids, auto-laid-out
// positions, per-node defaults from the catalog, and clamped numeric ranges. It
// mutates the workflow in place.
func normalize(w *Workflow, cat *Catalog) {
	w.Name = strings.TrimSpace(w.Name)
	w.Description = strings.TrimSpace(w.Description)

	defs := cat.Map()
	for i := range w.Graph.Nodes {
		n := &w.Graph.Nodes[i]
		if n.Position.X == 0 && n.Position.Y == 0 {
			// Lay anything left at the origin out on a tidy left-to-right grid.
			col := i % 4
			row := i / 4
			n.Position = Position{X: float64(col) * 220, Y: float64(row) * 150}
		}
		def, known := defs[n.Type]
		if known && isZeroConfig(n.Config) {
			n.Config = def.DefaultConfig
		}
		clampConfig(n, def, known)
	}
	for i := range w.Graph.Edges {
		e := &w.Graph.Edges[i]
		if e.ID == "" {
			e.ID = fmt.Sprintf("e-%s-%s", e.Source, e.Target)
		}
	}
}

// isZeroConfig reports whether a node config carries no meaningful settings, so
// normalize knows to substitute the catalog default rather than clobber author
// input.
func isZeroConfig(c NodeConfig) bool {
	return c == NodeConfig{}
}

// clampConfig keeps per-type numeric settings inside sane, simulatable bounds so
// neither a careless editor value nor a hallucinated AI draft can produce a
// nonsensical simulation (e.g. an unbounded loop or a 0-dim retriever).
func clampConfig(n *Node, def NodeKind, known bool) {
	switch n.Type {
	case TypeLLM:
		if n.Config.Model == "" {
			n.Config.Model = def.DefaultConfig.Model
		}
		if n.Config.Temperature < 0 {
			n.Config.Temperature = 0
		}
		if n.Config.Temperature > 2 {
			n.Config.Temperature = 2
		}
		if n.Config.MaxTokens <= 0 {
			n.Config.MaxTokens = def.DefaultConfig.MaxTokens
		}
		if n.Config.MaxTokens > 8192 {
			n.Config.MaxTokens = 8192
		}
	case TypeRetriever:
		if !indexTypes[n.Config.IndexType] {
			n.Config.IndexType = "hnsw"
		}
		if !quantizations[n.Config.Quantization] {
			n.Config.Quantization = "none"
		}
		if n.Config.TopK <= 0 {
			n.Config.TopK = 5
		}
		if n.Config.TopK > 100 {
			n.Config.TopK = 100
		}
		if n.Config.Dim <= 0 {
			n.Config.Dim = 768
		}
		if n.Config.CorpusSize <= 0 {
			n.Config.CorpusSize = 10000
		}
	case TypeLoop:
		if n.Config.MaxIterations <= 0 {
			n.Config.MaxIterations = 3
		}
		if n.Config.MaxIterations > 20 {
			n.Config.MaxIterations = 20
		}
	}
}

// validate enforces the invariants the simulator, runtime, and exporters rely on:
// real node types, unique ids, edges that connect existing nodes, no raw cycles
// (loops are modeled by loop nodes), and bounded loop counts. Returns an
// ErrInvalid-wrapped error naming the first problem found.
func validate(w *Workflow, cat *Catalog) error {
	if w.Name == "" {
		return fmt.Errorf("%w: name is required", ErrInvalid)
	}
	if len(w.Graph.Nodes) == 0 {
		return fmt.Errorf("%w: a workflow needs at least one node", ErrInvalid)
	}

	nodeIDs := make(map[string]bool, len(w.Graph.Nodes))
	for _, n := range w.Graph.Nodes {
		if n.ID == "" {
			return fmt.Errorf("%w: every node needs an id", ErrInvalid)
		}
		if nodeIDs[n.ID] {
			return fmt.Errorf("%w: duplicate node id %q", ErrInvalid, n.ID)
		}
		nodeIDs[n.ID] = true
		if _, ok := cat.ByType(n.Type); !ok {
			return fmt.Errorf("%w: unknown node type %q", ErrInvalid, n.Type)
		}
	}

	edgeIDs := make(map[string]bool, len(w.Graph.Edges))
	for _, e := range w.Graph.Edges {
		if !nodeIDs[e.Source] || !nodeIDs[e.Target] {
			return fmt.Errorf("%w: edge %q connects a missing node", ErrInvalid, e.ID)
		}
		if e.Source == e.Target {
			return fmt.Errorf("%w: edge %q is a self-loop (use a loop node)", ErrInvalid, e.ID)
		}
		if edgeIDs[e.ID] {
			return fmt.Errorf("%w: duplicate edge id %q", ErrInvalid, e.ID)
		}
		edgeIDs[e.ID] = true
	}

	if cycle := findCycle(w.Graph); cycle != "" {
		return fmt.Errorf("%w: edges form a cycle through %s — model repetition with a loop node instead", ErrInvalid, cycle)
	}
	return nil
}

// findCycle returns a human-readable node path if the edge set (ignoring loop
// semantics) contains a directed cycle, else "". Loops in an agent are expressed
// with an explicit loop node + bounded iterations, never as a raw back-edge, so
// any cycle here is a design error the simulator/runtime could not terminate on.
func findCycle(g Graph) string {
	adj := make(map[string][]string, len(g.Nodes))
	for _, e := range g.Edges {
		adj[e.Source] = append(adj[e.Source], e.Target)
	}
	const (
		white = 0
		gray  = 1
		black = 2
	)
	color := make(map[string]int, len(g.Nodes))

	var stack []string
	var dfs func(string) string
	dfs = func(u string) string {
		color[u] = gray
		stack = append(stack, u)
		for _, v := range adj[u] {
			switch color[v] {
			case gray:
				return strings.Join(append(stack, v), " → ")
			case white:
				if c := dfs(v); c != "" {
					return c
				}
			}
		}
		stack = stack[:len(stack)-1]
		color[u] = black
		return ""
	}
	for _, n := range g.Nodes {
		if color[n.ID] == white {
			if c := dfs(n.ID); c != "" {
				return c
			}
		}
	}
	return ""
}

func fromInput(in WorkflowInput) Workflow {
	return Workflow{
		Name:        in.Name,
		Description: in.Description,
		Graph:       in.Graph,
	}
}

// slugify turns a name into a url-safe, lowercase slug. Uniqueness per user is
// handled by the service.
func slugify(s string) string {
	var b strings.Builder
	lastDash := true
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "workflow"
	}
	return out
}
