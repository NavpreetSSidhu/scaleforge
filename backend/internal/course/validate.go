package course

import (
	"fmt"
	"strings"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// lldTypes is the abstract low-level-design node vocabulary. These don't exist
// in the infra catalog; the client renders them with dedicated icons (see
// frontend lib/catalog.ts). LLD courses may use these or anything lld_-prefixed.
var lldTypes = []string{"lld_class", "lld_index", "lld_list", "lld_node", "lld_bucket"}

// normalize fills in everything the editor/AI can leave blank so a draft is
// well-formed before validation: default enums, generated ids, auto-laid-out
// positions, and per-node configs from the catalog (or a neutral LLD config).
// It mutates the course in place. Built-in/editor payloads usually arrive
// complete, so this is mostly a no-op for them.
func normalize(c *Course, cat *catalog.Service) {
	c.Title = strings.TrimSpace(c.Title)
	c.Summary = strings.TrimSpace(c.Summary)
	if c.Difficulty == "" {
		c.Difficulty = "Beginner"
	}
	if c.Kind == "" {
		c.Kind = "system-design"
	}
	if c.Category == "" {
		if c.Kind == "lld" {
			c.Category = "Data Structures"
		} else {
			c.Category = "System Design"
		}
	}

	defs := cat.Map()
	for i := range c.Graph.Nodes {
		n := &c.Graph.Nodes[i]
		// Auto-layout any node the author/AI left at the origin onto a tidy grid.
		if n.Position.X == 0 && n.Position.Y == 0 {
			col := i % 3
			row := i / 3
			n.Position = simulation.Position{X: float64(col) * 240, Y: float64(row) * 170}
		}
		if isZeroConfig(n.Config) {
			if def, ok := defs[n.Type]; ok {
				n.Config = simulation.NodeConfig(def.DefaultConfig)
			} else {
				n.Config = simulation.NodeConfig{CPU: 1, Memory: 1, Replicas: 1}
			}
		}
	}
	for i := range c.Graph.Edges {
		e := &c.Graph.Edges[i]
		if e.ID == "" {
			e.ID = fmt.Sprintf("e-%s-%s", e.Source, e.Target)
		}
	}
	for i := range c.Steps {
		s := &c.Steps[i]
		if s.ID == "" {
			s.ID = fmt.Sprintf("step-%d", i+1)
		}
		if s.RevealNodeIDs == nil {
			s.RevealNodeIDs = []string{}
		}
		if s.RevealEdgeIDs == nil {
			s.RevealEdgeIDs = []string{}
		}
	}
}

func isZeroConfig(c simulation.NodeConfig) bool {
	return c.CPU == 0 && c.Memory == 0 && c.Replicas == 0
}

// validate enforces the invariants the player relies on, so a user/AI course
// can never reference a missing node or use a bogus component type. Returns an
// ErrInvalid-wrapped error naming the first problem found.
func validate(c *Course, cat *catalog.Service) error {
	if c.Title == "" {
		return fmt.Errorf("%w: title is required", ErrInvalid)
	}
	if !difficulties[c.Difficulty] {
		return fmt.Errorf("%w: difficulty must be Beginner, Intermediate, or Advanced", ErrInvalid)
	}
	if !kinds[c.Kind] {
		return fmt.Errorf("%w: kind must be system-design or lld", ErrInvalid)
	}
	if len(c.Steps) == 0 {
		return fmt.Errorf("%w: a course needs at least one step", ErrInvalid)
	}
	if len(c.Graph.Nodes) == 0 {
		return fmt.Errorf("%w: a course needs at least one node", ErrInvalid)
	}

	nodeIDs := make(map[string]bool, len(c.Graph.Nodes))
	for _, n := range c.Graph.Nodes {
		if n.ID == "" {
			return fmt.Errorf("%w: every node needs an id", ErrInvalid)
		}
		if nodeIDs[n.ID] {
			return fmt.Errorf("%w: duplicate node id %q", ErrInvalid, n.ID)
		}
		nodeIDs[n.ID] = true
		if err := validNodeType(c.Kind, n.Type, cat); err != nil {
			return err
		}
	}

	edgeIDs := make(map[string]bool, len(c.Graph.Edges))
	for _, e := range c.Graph.Edges {
		if !nodeIDs[e.Source] || !nodeIDs[e.Target] {
			return fmt.Errorf("%w: edge %q connects a missing node", ErrInvalid, e.ID)
		}
		edgeIDs[e.ID] = true
	}

	for i, s := range c.Steps {
		if strings.TrimSpace(s.Title) == "" {
			return fmt.Errorf("%w: step %d needs a title", ErrInvalid, i+1)
		}
		for _, id := range s.RevealNodeIDs {
			if !nodeIDs[id] {
				return fmt.Errorf("%w: step %d reveals unknown node %q", ErrInvalid, i+1, id)
			}
		}
		for _, id := range s.RevealEdgeIDs {
			if !edgeIDs[id] {
				return fmt.Errorf("%w: step %d reveals unknown edge %q", ErrInvalid, i+1, id)
			}
		}
		if s.FocusNodeID != "" && !contains(s.RevealNodeIDs, s.FocusNodeID) {
			return fmt.Errorf("%w: step %d focuses node %q that it does not reveal", ErrInvalid, i+1, s.FocusNodeID)
		}
	}

	if c.Kind == "lld" && c.Solution != nil && strings.TrimSpace(c.Solution.Code) == "" {
		return fmt.Errorf("%w: solution code is empty", ErrInvalid)
	}
	return nil
}

// validNodeType grounds node types: system-design must use real catalog
// components; LLD uses the abstract lld_ vocabulary. This is what guarantees a
// generated/authored course renders with valid icons and (for HLD) is runnable
// on the builder canvas.
func validNodeType(kind, nodeType string, cat *catalog.Service) error {
	if nodeType == "" {
		return fmt.Errorf("%w: every node needs a type", ErrInvalid)
	}
	if kind == "lld" {
		if strings.HasPrefix(nodeType, "lld_") {
			return nil
		}
		return fmt.Errorf("%w: LLD node type %q must be one of %s (or lld_*)", ErrInvalid, nodeType, strings.Join(lldTypes, ", "))
	}
	if _, ok := cat.ByType(nodeType); !ok {
		return fmt.Errorf("%w: unknown component type %q", ErrInvalid, nodeType)
	}
	return nil
}

func contains(xs []string, target string) bool {
	for _, x := range xs {
		if x == target {
			return true
		}
	}
	return false
}

// slugify turns a title into a url-safe, lowercase slug. Uniqueness per user is
// handled separately by the service.
func slugify(s string) string {
	var b strings.Builder
	lastDash := true // avoids a leading dash
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
		return "course"
	}
	return out
}
