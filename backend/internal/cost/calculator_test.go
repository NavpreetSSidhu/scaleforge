package cost

import (
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/pricing"
)

func newCalculator() *Calculator {
	return NewCalculator(catalog.NewService(), pricing.NewCatalog())
}

func TestMonthlyCostSumsUnitCostTimesReplicas(t *testing.T) {
	calc := newCalculator()

	// go_service: $40/mo, redis: $20/mo, postgresql: $50/mo (from catalog).
	graph := Graph{Nodes: []Node{
		{Type: "api_service", Config: NodeConfig{Replicas: 3}}, // 120
		{Type: "redis_cache", Config: NodeConfig{Replicas: 1}}, // 20
		{Type: "sql_primary", Config: NodeConfig{Replicas: 1}}, // 50
	}}

	got := calc.MonthlyCost(graph)
	want := 190.0

	if got != want {
		t.Fatalf("MonthlyCost() = %v, want %v", got, want)
	}
}

func TestMonthlyCostTreatsZeroReplicasAsOne(t *testing.T) {
	calc := newCalculator()

	graph := Graph{Nodes: []Node{
		{Type: "sql_primary", Config: NodeConfig{Replicas: 0}}, // billed as 1 instance -> 50
	}}

	if got := calc.MonthlyCost(graph); got != 50 {
		t.Fatalf("MonthlyCost() with zero replicas = %v, want 50", got)
	}
}

func TestMonthlyCostIgnoresUnknownTypes(t *testing.T) {
	calc := newCalculator()

	graph := Graph{Nodes: []Node{
		{Type: "quantum_computer", Config: NodeConfig{Replicas: 5}},
		{Type: "redis_cache", Config: NodeConfig{Replicas: 1}}, // 20
	}}

	if got := calc.MonthlyCost(graph); got != 20 {
		t.Fatalf("MonthlyCost() = %v, want 20 (unknown type ignored)", got)
	}
}

func TestMonthlyCostEmptyGraphIsZero(t *testing.T) {
	calc := newCalculator()

	if got := calc.MonthlyCost(Graph{}); got != 0 {
		t.Fatalf("MonthlyCost() of empty graph = %v, want 0", got)
	}
}
