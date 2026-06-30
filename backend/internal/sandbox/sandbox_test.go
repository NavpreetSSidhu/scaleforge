package sandbox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

func TestHistogramPercentiles(t *testing.T) {
	h := newHistogram()
	for i := 1; i <= 100; i++ {
		h.record(float64(i))
	}
	if got := h.percentile(0.5); got < 49 || got > 51 {
		t.Errorf("p50 = %.0f, want ~50", got)
	}
	if got := h.percentile(0.99); got < 98 || got > 100 {
		t.Errorf("p99 = %.0f, want ~99", got)
	}
}

// TestGenerateAgainstRealServer drives a real httptest server and checks the load
// generator measures sane throughput + latency with no errors on a fast target.
func TestGenerateAgainstRealServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(3 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	m := generate(context.Background(), srv.Client(), srv.URL,
		LoadOptions{TargetRPS: 300, DurationSec: 1}, func(Progress) {})

	if m.Sent == 0 {
		t.Fatal("expected requests to be sent")
	}
	if m.ErrorRate > 0.05 {
		t.Errorf("fast target should have near-zero errors, got %.2f", m.ErrorRate)
	}
	if m.P50 < 1 || m.P50 > 60 {
		t.Errorf("p50 = %.0fms, expected to reflect the ~3ms target", m.P50)
	}
	if m.AchievedRps < 100 {
		t.Errorf("achieved rps = %.0f, expected to approach the offered 300", m.AchievedRps)
	}
}

func tinyGraph() simulation.Graph {
	// Single SQL primary: capacity ~1500 rps, ~8ms latency → small concurrency.
	return simulation.Graph{
		Nodes: []simulation.Node{{ID: "db", Type: "sql_primary", Label: "DB", Config: simulation.NodeConfig{Replicas: 1}}},
	}
}

func TestBuildModelSizesConcurrencyToBottleneck(t *testing.T) {
	m := buildModel(tinyGraph(), catalog.NewService().Map())
	if m.CapacityRps <= 0 || m.ServiceLatency <= 0 || m.Concurrency < 1 {
		t.Fatalf("unexpected model: %+v", m)
	}
}

// TestTargetShedsUnderSaturation confirms the stood-up service really saturates:
// offered far above capacity produces 503s (failures), as a real bottleneck would.
func TestTargetShedsUnderSaturation(t *testing.T) {
	tgt, model := startTarget(tinyGraph(), catalog.NewService().Map(), nil)
	defer tgt.close()

	m := generate(context.Background(), &http.Client{Timeout: 5 * time.Second}, tgt.url(),
		LoadOptions{TargetRPS: model.CapacityRps * 8, DurationSec: 1}, func(Progress) {})

	if m.Failed == 0 {
		t.Errorf("saturated target should shed (503) some requests, got 0 failures of %d sent", m.Sent)
	}
}

func TestServiceDisabled(t *testing.T) {
	svc := NewService(false, catalog.NewService())
	if svc.Enabled() {
		t.Fatal("expected disabled")
	}
	if _, err := svc.Run(context.Background(), Request{Graph: tinyGraph()}); err == nil {
		t.Fatal("expected error when disabled")
	}
}

func TestServiceRunStreamsToCompletion(t *testing.T) {
	svc := NewService(true, catalog.NewService())
	// Compute-only graph: no cache/db tier, so the run never provisions containers
	// and stays a fast, hermetic unit test even when Docker is available.
	computeOnly := simulation.Graph{
		Nodes: []simulation.Node{{ID: "api", Type: "api_service", Label: "API", Config: simulation.NodeConfig{Replicas: 2}}},
	}
	ch, err := svc.Run(context.Background(), Request{
		Graph:       computeOnly,
		Traffic:     simulation.TrafficProfile{ConcurrentUsers: 1000, RequestsPerUserMin: 60, PeakTrafficMultiplier: 1},
		DurationSec: 1,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var sawProgress, sawDone bool
	var final Event
	for ev := range ch {
		if ev.Type == EventProgress {
			sawProgress = true
		}
		if ev.Type == EventDone {
			sawDone = true
			final = ev
		}
	}
	if !sawProgress || !sawDone {
		t.Errorf("expected progress and done events (progress=%v done=%v)", sawProgress, sawDone)
	}
	if final.Measured == nil || final.Predicted == nil {
		t.Error("done event should carry measured + predicted")
	}
}
