package simulation

import (
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
)

func TestCalculateIncomingRPS(t *testing.T) {
	traffic := TrafficProfile{
		ConcurrentUsers:       5000,
		RequestsPerUserMin:    2,
		PeakTrafficMultiplier: 1.5,
	}

	got := CalculateIncomingRPS(traffic)
	want := 250.0

	if got != want {
		t.Fatalf("CalculateIncomingRPS() = %v, want %v", got, want)
	}
}

func TestRunDemoScenario(t *testing.T) {
	catalogService := catalog.NewService()

	graph := Graph{
		Nodes: []Node{
			{ID: "cf", Type: "cdn_edge", Label: "Cloudflare", Config: NodeConfig{Replicas: 1}},
			{ID: "lb", Type: "load_balancer", Label: "Load Balancer", Config: NodeConfig{CPU: 2, Replicas: 2, Autoscaling: true}},
			{ID: "go", Type: "api_service", Label: "Go API", Config: NodeConfig{CPU: 2, Replicas: 3, Autoscaling: true}},
			{ID: "redis_cache", Type: "redis_cache", Label: "Redis", Config: NodeConfig{Replicas: 1}},
			{ID: "pg", Type: "sql_primary", Label: "PostgreSQL", Config: NodeConfig{CPU: 2, Replicas: 1}},
		},
		Edges: []Edge{
			{ID: "e1", Source: "cf", Target: "lb"},
			{ID: "e2", Source: "lb", Target: "go"},
			{ID: "e3", Source: "go", Target: "redis_cache"},
			{ID: "e4", Source: "redis_cache", Target: "pg"},
		},
	}

	traffic := TrafficProfile{
		ConcurrentUsers:       5000,
		RequestsPerUserMin:    2,
		PeakTrafficMultiplier: 1.5,
	}

	result := runEngine(graph, traffic, catalogService.Map())

	if result.EstimatedLatency != 31 {
		t.Fatalf("latency = %v, want 31", result.EstimatedLatency)
	}

	if result.SystemCapacity != 1500 {
		t.Fatalf("capacity = %v, want 1500", result.SystemCapacity)
	}

	if result.Bottleneck == nil || result.Bottleneck.NodeType != "sql_primary" {
		t.Fatalf("expected postgres bottleneck, got %+v", result.Bottleneck)
	}
}
