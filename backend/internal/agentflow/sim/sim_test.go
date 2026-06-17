package sim

import (
	"testing"

	"github.com/scaleforge/scaleforge/internal/agentflow"
)

// ragGraph: input → retriever → llm → output (the canonical RAG agent).
func ragGraph() agentflow.Graph {
	cat := agentflow.NewCatalog()
	defs := cat.Map()
	mk := func(id, typ string) agentflow.Node {
		return agentflow.Node{ID: id, Type: typ, Label: id, Config: defs[typ].DefaultConfig}
	}
	return agentflow.Graph{
		Nodes: []agentflow.Node{
			mk("in", agentflow.TypeInput),
			mk("ret", agentflow.TypeRetriever),
			mk("gen", agentflow.TypeLLM),
			mk("out", agentflow.TypeOutput),
		},
		Edges: []agentflow.Edge{
			{ID: "e1", Source: "in", Target: "ret"},
			{ID: "e2", Source: "ret", Target: "gen"},
			{ID: "e3", Source: "gen", Target: "out"},
		},
	}
}

func TestSimulatePercentileOrdering(t *testing.T) {
	cat := agentflow.NewCatalog()
	r := Simulate(cat, ragGraph(), Options{Trials: 5000, Seed: 42})
	if r.Trials != 5000 {
		t.Fatalf("trials = %d, want 5000", r.Trials)
	}
	if !(r.LatencyMs.P50 <= r.LatencyMs.P95 && r.LatencyMs.P95 <= r.LatencyMs.P99) {
		t.Fatalf("latency percentiles not ordered: %+v", r.LatencyMs)
	}
	if r.LatencyMs.P99 <= r.LatencyMs.P50 {
		t.Fatalf("expected a heavy tail (p99 > p50): %+v", r.LatencyMs)
	}
	if r.CostUsd.Mean <= 0 {
		t.Fatalf("expected positive cost, got %+v", r.CostUsd)
	}
}

func TestSimulateLLMDominatesCriticalPath(t *testing.T) {
	cat := agentflow.NewCatalog()
	r := Simulate(cat, ragGraph(), Options{Trials: 4000, Seed: 7})
	// The LLM call (≈750ms) should be the bottleneck over retriever (≈12ms).
	if r.Bottleneck != "gen" {
		t.Fatalf("bottleneck = %q, want the llm node \"gen\"", r.Bottleneck)
	}
	var llm NodeStat
	for _, n := range r.PerNode {
		if n.NodeID == "gen" {
			llm = n
		}
	}
	if llm.Share < 0.5 {
		t.Fatalf("llm latency share = %.2f, expected it to dominate (>0.5)", llm.Share)
	}
	if len(r.CriticalPath) == 0 {
		t.Fatalf("expected a non-empty critical path")
	}
}

func TestSimulateDeterministicWithSeed(t *testing.T) {
	cat := agentflow.NewCatalog()
	a := Simulate(cat, ragGraph(), Options{Trials: 1000, Seed: 99})
	b := Simulate(cat, ragGraph(), Options{Trials: 1000, Seed: 99})
	if a.LatencyMs != b.LatencyMs || a.CostUsd != b.CostUsd {
		t.Fatalf("same seed should be deterministic:\n a=%+v\n b=%+v", a, b)
	}
}

func TestSimulateLoopAmplifiesCost(t *testing.T) {
	cat := agentflow.NewCatalog()
	defs := cat.Map()
	mk := func(id, typ string) agentflow.Node {
		return agentflow.Node{ID: id, Type: typ, Label: id, Config: defs[typ].DefaultConfig}
	}
	loop := mk("loop", agentflow.TypeLoop)
	loop.Config.MaxIterations = 5
	looped := agentflow.Graph{
		Nodes: []agentflow.Node{mk("in", agentflow.TypeInput), loop, mk("gen", agentflow.TypeLLM), mk("out", agentflow.TypeOutput)},
		Edges: []agentflow.Edge{
			{ID: "e1", Source: "in", Target: "loop"},
			{ID: "e2", Source: "loop", Target: "gen"},
			{ID: "e3", Source: "gen", Target: "out"},
		},
	}
	plain := agentflow.Graph{
		Nodes: []agentflow.Node{mk("in", agentflow.TypeInput), mk("gen", agentflow.TypeLLM), mk("out", agentflow.TypeOutput)},
		Edges: []agentflow.Edge{
			{ID: "e1", Source: "in", Target: "gen"},
			{ID: "e2", Source: "gen", Target: "out"},
		},
	}
	loopRes := Simulate(cat, looped, Options{Trials: 3000, Seed: 5})
	plainRes := Simulate(cat, plain, Options{Trials: 3000, Seed: 5})
	if loopRes.CostUsd.Mean <= plainRes.CostUsd.Mean*2 {
		t.Fatalf("5× loop should multiply cost well beyond 2×: loop=%.6f plain=%.6f",
			loopRes.CostUsd.Mean, plainRes.CostUsd.Mean)
	}
}
