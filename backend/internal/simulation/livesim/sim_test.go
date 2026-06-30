package livesim

import (
	"context"
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

func defs() map[string]catalog.NodeDefinition {
	return catalog.NewService().Map()
}

// graph builds a small tandem: load_balancer → api_service → sql_primary, with
// the given replica counts so tests can dial capacity up or down.
func graph(apiReplicas, dbReplicas int) simulation.Graph {
	return simulation.Graph{
		Nodes: []simulation.Node{
			{ID: "lb", Type: "load_balancer", Label: "LB", Config: simulation.NodeConfig{Replicas: 2}},
			{ID: "api", Type: "api_service", Label: "API", Config: simulation.NodeConfig{Replicas: apiReplicas}},
			{ID: "db", Type: "sql_primary", Label: "DB", Config: simulation.NodeConfig{Replicas: dbReplicas}},
		},
		Edges: []simulation.Edge{
			{ID: "e1", Source: "lb", Target: "api"},
			{ID: "e2", Source: "api", Target: "db"},
		},
	}
}

func traffic(concurrent int) simulation.TrafficProfile {
	return simulation.TrafficProfile{ConcurrentUsers: concurrent, RequestsPerUserMin: 60, PeakTrafficMultiplier: 1}
}

// headless options: no wall-clock pacing, fixed seed, short window.
func headless(seed int64) Options {
	return Options{Seed: seed, DurationSec: 6, TickMs: 500, SpeedFactor: 0}
}

func runCollect(g simulation.Graph, tp simulation.TrafficProfile, opts Options) []Tick {
	var ticks []Tick
	Run(context.Background(), g, tp, defs(), opts, func(t Tick) { ticks = append(ticks, t) })
	return ticks
}

func lastTick(t *testing.T, ticks []Tick) Tick {
	t.Helper()
	if len(ticks) == 0 {
		t.Fatal("no ticks emitted")
	}
	return ticks[len(ticks)-1]
}

func TestHealthyArchitectureServesWithoutShedding(t *testing.T) {
	// 100 rps against a 3-tier system with ample capacity: nearly everything
	// completes, drops are negligible.
	ticks := runCollect(graph(4, 2), traffic(100), headless(1))
	final := lastTick(t, ticks)
	if !final.Done {
		t.Fatal("final tick should be Done")
	}
	if final.Completed == 0 {
		t.Fatal("expected completed requests")
	}
	if final.Failed > final.Completed/10 {
		t.Errorf("healthy run shed too much: completed=%d failed=%d", final.Completed, final.Failed)
	}
	if final.P50 <= 0 || final.P99 < final.P50 {
		t.Errorf("percentiles look wrong: p50=%.1f p99=%.1f", final.P50, final.P99)
	}
}

func TestSaturatedStationShedsLoad(t *testing.T) {
	// 5000 rps onto a single-replica SQL primary (≈1500 rps): the DB station
	// must back up and shed.
	ticks := runCollect(graph(8, 1), traffic(5000), headless(2))
	final := lastTick(t, ticks)
	var db StationTick
	var totalDropped int64
	for _, s := range final.Stations {
		totalDropped += s.Dropped
		if s.NodeID == "db" {
			db = s
		}
	}
	if totalDropped == 0 {
		t.Fatal("expected drops under saturation")
	}
	if db.Dropped == 0 {
		t.Errorf("saturated DB should drop: %+v", db)
	}
	if db.Utilization < 0.9 {
		t.Errorf("saturated DB should be near-fully utilized, got %.2f", db.Utilization)
	}
}

func TestDeterministicForFixedSeed(t *testing.T) {
	a := lastTick(t, runCollect(graph(8, 1), traffic(5000), headless(42)))
	b := lastTick(t, runCollect(graph(8, 1), traffic(5000), headless(42)))
	if a.Completed != b.Completed || a.Failed != b.Failed {
		t.Errorf("same seed should be deterministic: a=(%d,%d) b=(%d,%d)", a.Completed, a.Failed, b.Completed, b.Failed)
	}
}

func TestNoTrafficEmitsFinalTick(t *testing.T) {
	ticks := runCollect(graph(2, 1), simulation.TrafficProfile{}, headless(1))
	final := lastTick(t, ticks)
	if !final.Done || final.Completed != 0 {
		t.Errorf("no-traffic run should finish immediately with no completions: %+v", final)
	}
}

func TestEmptyGraphIsSafe(t *testing.T) {
	ticks := runCollect(simulation.Graph{}, traffic(100), headless(1))
	final := lastTick(t, ticks)
	if !final.Done {
		t.Error("empty graph should still emit a final tick")
	}
}
