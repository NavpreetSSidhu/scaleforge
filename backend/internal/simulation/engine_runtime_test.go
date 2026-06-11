package simulation

import (
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
)

// TestRuntimeAffectsComputeCapacity verifies that the language/runtime multiplies
// compute capacity (Rust > Go > Node) while an unset runtime matches the Go
// baseline exactly, so pre-existing simulations are unchanged.
func TestRuntimeAffectsComputeCapacity(t *testing.T) {
	defs := catalog.NewService().Map()

	baseline := nodeCapacityFor(Node{Type: "api_service", Config: NodeConfig{CPU: 2, Replicas: 1}}, defs)
	goExplicit := nodeCapacityFor(Node{Type: "api_service", Config: NodeConfig{CPU: 2, Replicas: 1, Runtime: "go"}}, defs)
	rust := nodeCapacityFor(Node{Type: "api_service", Config: NodeConfig{CPU: 2, Replicas: 1, Runtime: "rust"}}, defs)
	node := nodeCapacityFor(Node{Type: "api_service", Config: NodeConfig{CPU: 2, Replicas: 1, Runtime: "node"}}, defs)

	if baseline != goExplicit {
		t.Errorf("unset runtime (%v) should equal explicit go (%v)", baseline, goExplicit)
	}
	if !(rust > baseline) {
		t.Errorf("rust capacity (%v) should exceed go baseline (%v)", rust, baseline)
	}
	if !(node < baseline) {
		t.Errorf("node capacity (%v) should be below go baseline (%v)", node, baseline)
	}
}

// TestRuntimeDoesNotAffectManagedComponents verifies runtime is ignored for
// non-compute components (a database's throughput is fixed regardless of runtime).
func TestRuntimeDoesNotAffectManagedComponents(t *testing.T) {
	defs := catalog.NewService().Map()

	plain := nodeCapacityFor(Node{Type: "sql_primary", Config: NodeConfig{CPU: 2, Replicas: 1}}, defs)
	withRuntime := nodeCapacityFor(Node{Type: "sql_primary", Config: NodeConfig{CPU: 2, Replicas: 1, Runtime: "rust"}}, defs)

	if plain != withRuntime {
		t.Errorf("runtime must not change managed-component capacity: %v vs %v", plain, withRuntime)
	}
}

// TestRuntimeAffectsComputeLatency verifies a faster runtime lowers latency on a
// compute node while leaving the Go baseline untouched.
func TestRuntimeAffectsComputeLatency(t *testing.T) {
	defs := catalog.NewService().Map()

	goGraph := Graph{Nodes: []Node{{ID: "a", Type: "api_service", Config: NodeConfig{CPU: 2, Replicas: 1}}}}
	rustGraph := Graph{Nodes: []Node{{ID: "a", Type: "api_service", Config: NodeConfig{CPU: 2, Replicas: 1, Runtime: "rust"}}}}

	goLatency := calculateLatency(goGraph, defs)
	rustLatency := calculateLatency(rustGraph, defs)

	if !(rustLatency < goLatency) {
		t.Errorf("rust latency (%v) should be below go latency (%v)", rustLatency, goLatency)
	}
}
