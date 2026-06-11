// Package runtime models the performance characteristics of the language/runtime
// a compute component is implemented in.
//
// Like the pricing package, rather than running live benchmarks (which need a
// harness, hardware, and break offline/CI/the guest demo), ScaleForge ships a
// curated table of *relative* coefficients derived from public, reproducible
// data: the TechEmpower Framework Benchmarks. Coefficients are normalized so Go
// == 1.0, which means an architecture with no runtime set behaves exactly as it
// did before this feature existed.
//
// Provenance: coefficients are derived from the TechEmpower Framework Benchmarks
// (Round 22, https://www.techempower.com/benchmarks/), blending the
// JSON-serialization and single-query tests for a representative mainstream
// framework per language, then normalized to Go = 1.0. They are directional —
// good for comparing the shape of a choice — not a guarantee for any specific
// workload, which is why the UI shows this caveat alongside the comparison.
package runtime

// DefaultRuntimeID is assumed when a compute node declares no runtime. Go is the
// catalog's calibration baseline (all factors 1.0), so unset == unchanged.
const DefaultRuntimeID = "go"

// ProvenanceNote is surfaced in the UI so users know where the numbers come from
// and how to read them.
const ProvenanceNote = "Relative to Go = 1.0, derived from the TechEmpower Framework Benchmarks (Round 22, JSON + single-query). Directional, not workload-specific."

// Runtime is one language/runtime choice and its performance multipliers, all
// expressed relative to Go.
type Runtime struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// ThroughputFactor scales per-instance request capacity (higher is faster).
	ThroughputFactor float64 `json:"throughputFactor"`
	// LatencyFactor scales a compute node's base latency (lower is faster).
	LatencyFactor float64 `json:"latencyFactor"`
	// MemoryFactor is the relative per-instance memory footprint (informational).
	MemoryFactor float64 `json:"memoryFactor"`
}

// Catalog is the set of runtimes ScaleForge can model, mirroring pricing.Catalog
// so a different data source could be swapped in behind the same seam.
type Catalog struct {
	runtimes []Runtime
	byID     map[string]Runtime
}

// NewCatalog builds the curated runtime table. See the package doc for provenance.
// Go is the baseline (1.0 across the board) to preserve existing simulations.
func NewCatalog() *Catalog {
	runtimes := []Runtime{
		{ID: "rust", Label: "Rust", ThroughputFactor: 1.75, LatencyFactor: 0.80, MemoryFactor: 0.55},
		{ID: "go", Label: "Go", ThroughputFactor: 1.00, LatencyFactor: 1.00, MemoryFactor: 1.00},
		{ID: "csharp", Label: "C# / .NET", ThroughputFactor: 1.45, LatencyFactor: 0.88, MemoryFactor: 1.60},
		{ID: "java", Label: "Java (JVM)", ThroughputFactor: 1.20, LatencyFactor: 1.05, MemoryFactor: 2.20},
		{ID: "node", Label: "Node.js", ThroughputFactor: 0.60, LatencyFactor: 1.30, MemoryFactor: 1.40},
		{ID: "python", Label: "Python", ThroughputFactor: 0.30, LatencyFactor: 1.80, MemoryFactor: 1.50},
	}

	byID := make(map[string]Runtime, len(runtimes))
	for _, rt := range runtimes {
		byID[rt.ID] = rt
	}
	return &Catalog{runtimes: runtimes, byID: byID}
}

// All returns the runtimes in display order.
func (c *Catalog) All() []Runtime {
	return c.runtimes
}

// ByID looks up a runtime by id.
func (c *Catalog) ByID(id string) (Runtime, bool) {
	rt, ok := c.byID[id]
	return rt, ok
}

// OrDefault resolves an id (possibly empty or unknown) to a runtime, falling back
// to Go — whose factors are all 1.0, so an unset runtime changes nothing.
func (c *Catalog) OrDefault(id string) Runtime {
	if rt, ok := c.byID[id]; ok {
		return rt
	}
	return c.byID[DefaultRuntimeID]
}
