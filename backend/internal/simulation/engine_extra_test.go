package simulation

import (
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
)

func TestCalculateIncomingRPSGuards(t *testing.T) {
	cases := []struct {
		name    string
		traffic TrafficProfile
		want    float64
	}{
		{"zero concurrent", TrafficProfile{ConcurrentUsers: 0, RequestsPerUserMin: 2, PeakTrafficMultiplier: 1}, 0},
		{"zero requests", TrafficProfile{ConcurrentUsers: 100, RequestsPerUserMin: 0, PeakTrafficMultiplier: 1}, 0},
		{"missing multiplier defaults to 1x", TrafficProfile{ConcurrentUsers: 600, RequestsPerUserMin: 1}, 10},
	}

	for _, c := range cases {
		if got := CalculateIncomingRPS(c.traffic); got != c.want {
			t.Errorf("%s: CalculateIncomingRPS() = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestOrderedNodesFollowsTopology(t *testing.T) {
	graph := Graph{
		Nodes: []Node{
			{ID: "c"}, {ID: "a"}, {ID: "b"},
		},
		Edges: []Edge{
			{Source: "a", Target: "b"},
			{Source: "b", Target: "c"},
		},
	}

	ordered := orderedNodes(graph)
	if len(ordered) != 3 {
		t.Fatalf("expected 3 ordered nodes, got %d", len(ordered))
	}
	if ordered[0].ID != "a" || ordered[1].ID != "b" || ordered[2].ID != "c" {
		t.Errorf("topological order = %v, want [a b c]", []string{ordered[0].ID, ordered[1].ID, ordered[2].ID})
	}
}

func TestOrderedNodesIncludesDisconnectedNodes(t *testing.T) {
	graph := Graph{
		Nodes: []Node{{ID: "a"}, {ID: "island"}, {ID: "b"}},
		Edges: []Edge{{Source: "a", Target: "b"}},
	}

	if got := len(orderedNodes(graph)); got != 3 {
		t.Errorf("expected all 3 nodes (including disconnected) to be ordered, got %d", got)
	}
}

func TestNodeCapacityScalesWithReplicasAndCPU(t *testing.T) {
	defs := catalog.NewService().Map()

	single := nodeCapacityFor(Node{Type: "api_service", Config: NodeConfig{CPU: 2, Replicas: 1}}, defs)
	tripled := nodeCapacityFor(Node{Type: "api_service", Config: NodeConfig{CPU: 2, Replicas: 3}}, defs)
	beefier := nodeCapacityFor(Node{Type: "api_service", Config: NodeConfig{CPU: 4, Replicas: 1}}, defs)

	if single != 3000 {
		t.Errorf("base go_service capacity = %v, want 3000", single)
	}
	if tripled != 9000 {
		t.Errorf("3 replicas capacity = %v, want 9000", tripled)
	}
	if beefier != 6000 {
		t.Errorf("4 CPU capacity = %v, want 6000 (2x cpu multiplier)", beefier)
	}
}

func TestRunEngineFlagsBottleneckWhenOverloaded(t *testing.T) {
	defs := catalog.NewService().Map()
	graph := Graph{
		Nodes: []Node{
			{ID: "go", Type: "api_service", Label: "Go API", Config: NodeConfig{CPU: 2, Replicas: 3}},     // 9000
			{ID: "pg", Type: "sql_primary", Label: "PostgreSQL", Config: NodeConfig{CPU: 2, Replicas: 1}}, // 1500
		},
		Edges: []Edge{{Source: "go", Target: "pg"}},
	}
	// Incoming far exceeds the 1500 RPS postgres capacity.
	traffic := TrafficProfile{ConcurrentUsers: 60000, RequestsPerUserMin: 2, PeakTrafficMultiplier: 1}

	result := runEngine(graph, traffic, defs)

	if result.Bottleneck == nil || result.Bottleneck.NodeID != "pg" {
		t.Fatalf("expected postgres bottleneck, got %+v", result.Bottleneck)
	}
	if result.SystemCapacity != 1500 {
		t.Errorf("system capacity = %v, want 1500 (min component)", result.SystemCapacity)
	}

	statuses := map[string]string{}
	for _, h := range result.NodeHealth {
		statuses[h.NodeID] = h.Status
	}
	if statuses["pg"] != "bottleneck" {
		t.Errorf("postgres status = %q, want bottleneck", statuses["pg"])
	}
	if statuses["go"] != "healthy" {
		t.Errorf("go status = %q, want healthy (above incoming)", statuses["go"])
	}
}

func TestRunEngineHealthyWhenUnderCapacity(t *testing.T) {
	defs := catalog.NewService().Map()
	graph := Graph{Nodes: []Node{
		{ID: "go", Type: "api_service", Label: "Go API", Config: NodeConfig{CPU: 2, Replicas: 3}},
		{ID: "redis_cache", Type: "redis_cache", Label: "Redis", Config: NodeConfig{Replicas: 1}},
	}}
	traffic := TrafficProfile{ConcurrentUsers: 300, RequestsPerUserMin: 1, PeakTrafficMultiplier: 1} // 5 RPS

	result := runEngine(graph, traffic, defs)

	for _, h := range result.NodeHealth {
		if h.Status != "healthy" {
			t.Errorf("node %s status = %q, want healthy", h.NodeID, h.Status)
		}
	}
	if result.Bottleneck == nil {
		t.Fatal("bottleneck field should still report the weakest node")
	}
}

func TestRecommendationsSuggestCacheWhenMissing(t *testing.T) {
	defs := catalog.NewService().Map()
	graph := Graph{Nodes: []Node{
		{ID: "go", Type: "api_service", Label: "Go API", Config: NodeConfig{Replicas: 3}},
		{ID: "pg", Type: "sql_primary", Label: "PostgreSQL", Config: NodeConfig{Replicas: 1}},
	}}
	traffic := TrafficProfile{ConcurrentUsers: 300, RequestsPerUserMin: 1, PeakTrafficMultiplier: 1}

	result := runEngine(graph, traffic, defs)

	if !containsSubstring(result.Recommendations, "Redis") {
		t.Errorf("expected a Redis cache recommendation, got %v", result.Recommendations)
	}
}

func TestRecommendationsHealthyWhenWellProvisioned(t *testing.T) {
	defs := catalog.NewService().Map()
	graph := Graph{Nodes: []Node{
		{ID: "go", Type: "api_service", Label: "Go API", Config: NodeConfig{CPU: 2, Replicas: 3, Autoscaling: true}}, // 9000
		{ID: "redis_cache", Type: "redis_cache", Label: "Redis", Config: NodeConfig{Replicas: 2}},
		{ID: "pg", Type: "sql_primary", Label: "PostgreSQL", Config: NodeConfig{CPU: 2, Replicas: 3}}, // 4500
	}}
	// ~2000 RPS keeps compute/db within the over-provision threshold yet under
	// capacity, so no tier is flagged as a bottleneck or as wasted headroom.
	traffic := TrafficProfile{ConcurrentUsers: 120000, RequestsPerUserMin: 1, PeakTrafficMultiplier: 1}

	result := runEngine(graph, traffic, defs)

	if !containsSubstring(result.Recommendations, "healthy") {
		t.Errorf("expected a healthy verdict, got %v", result.Recommendations)
	}
}

func TestRecommendationsFlagOverProvisionedAtLowTraffic(t *testing.T) {
	defs := catalog.NewService().Map()
	graph := Graph{Nodes: []Node{
		{ID: "go", Type: "api_service", Label: "Go API", Config: NodeConfig{CPU: 2, Replicas: 3}}, // 9000
		{ID: "redis_cache", Type: "redis_cache", Label: "Redis", Config: NodeConfig{Replicas: 2}},
		{ID: "pg", Type: "sql_primary", Label: "PostgreSQL", Config: NodeConfig{CPU: 2, Replicas: 3}}, // 4500
	}}
	// A trickle of traffic leaves every tier massively over-built.
	traffic := TrafficProfile{ConcurrentUsers: 300, RequestsPerUserMin: 1, PeakTrafficMultiplier: 1} // 5 RPS

	result := runEngine(graph, traffic, defs)

	if !containsSubstring(result.Recommendations, "over-provisioned") {
		t.Errorf("expected an over-provisioned/downsize hint, got %v", result.Recommendations)
	}
	// The hint must target a trimmable compute/db tier — never the cache.
	if containsSubstring(result.Recommendations, "Redis is over-provisioned") {
		t.Errorf("cache should not be flagged as over-provisioned, got %v", result.Recommendations)
	}
}

func TestRunEngineEmptyGraph(t *testing.T) {
	result := runEngine(Graph{}, TrafficProfile{}, catalog.NewService().Map())

	if result.Bottleneck != nil {
		t.Errorf("empty graph should have no bottleneck, got %+v", result.Bottleneck)
	}
	if len(result.NodeHealth) != 0 {
		t.Errorf("empty graph should have no node health, got %d entries", len(result.NodeHealth))
	}
	if len(result.Recommendations) == 0 {
		t.Error("expected at least one recommendation even for an empty graph")
	}
}

func containsSubstring(items []string, substr string) bool {
	for _, item := range items {
		for i := 0; i+len(substr) <= len(item); i++ {
			if item[i:i+len(substr)] == substr {
				return true
			}
		}
	}
	return false
}
