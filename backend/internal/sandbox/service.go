// Package sandbox is the Real Sandbox: it stands the designed architecture up as
// a live HTTP service on a real local listener and drives it with a real,
// concurrent Go load generator over real sockets, then reconciles what the system
// MEASURED against what the simulator PREDICTED.
//
// Unlike the steady-state engine and the live discrete-event simulator (which
// model behaviour), this closes the loop with measurement: real goroutines,
// real TCP round-trips, a real rate-paced load, real saturation and shedding.
// It is opt-in (SANDBOX_ENABLED=1) because it spawns a server and generates load.
package sandbox

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// Service runs sandbox load tests. It is gated by config so the feature is hidden
// unless explicitly enabled.
type Service struct {
	enabled bool
	catalog *catalog.Service
}

func NewService(enabled bool, cat *catalog.Service) *Service {
	return &Service{enabled: enabled, catalog: cat}
}

func (s *Service) Enabled() bool { return s.enabled }

// Predicted is the simulator's forecast, supplied by the client so the result can
// be shown side by side with the measured numbers.
type Predicted struct {
	CapacityRps float64 `json:"capacityRps"`
	LatencyMs   float64 `json:"latencyMs"`
}

// Request is the input to a sandbox run.
type Request struct {
	Graph       simulation.Graph          `json:"graph"`
	Traffic     simulation.TrafficProfile `json:"traffic"`
	Predicted   Predicted                 `json:"predicted"`
	DurationSec float64                   `json:"durationSec,omitempty"`
}

// EventType discriminates streamed events.
type EventType string

const (
	EventPhase    EventType = "phase"    // a lifecycle message (provisioning/warmup/load/teardown)
	EventProgress EventType = "progress" // a periodic load snapshot
	EventDone     EventType = "done"     // final measured-vs-predicted result
	EventError    EventType = "error"
)

// Event is one streamed Server-Sent Event from a run.
type Event struct {
	Type      EventType    `json:"type"`
	Message   string       `json:"message,omitempty"`
	Model     *targetModel `json:"model,omitempty"`
	Progress  *Progress    `json:"progress,omitempty"`
	Measured  *Measured    `json:"measured,omitempty"`
	Predicted *Predicted   `json:"predicted,omitempty"`
}

// Run stands up the target, warms it up, drives load at the offered RPS, streams
// progress, then tears everything down and emits the measured-vs-predicted
// result. It honours ctx cancellation (e.g. the SSE client disconnecting).
func (s *Service) Run(ctx context.Context, req Request) (<-chan Event, error) {
	if !s.enabled {
		return nil, fmt.Errorf("sandbox not enabled")
	}
	if len(req.Graph.Nodes) == 0 {
		return nil, fmt.Errorf("design is empty — add components before load testing")
	}

	events := make(chan Event, 64)
	go func() {
		defer close(events)
		send := func(ev Event) {
			select {
			case events <- ev:
			case <-ctx.Done():
			}
		}

		defs := s.catalog.Map()

		// Stand up real Redis/Postgres containers when the design has those tiers
		// and Docker is reachable, so requests do real datastore I/O. Falls back to
		// pure in-process emulation otherwise (Docker down, or no cache/db tier).
		var dep *Deployment
		if (hasCategory(req.Graph, defs, catalog.CategoryCache) || hasCategory(req.Graph, defs, catalog.CategoryDatabase)) && dockerAvailable(ctx) {
			poolSize := buildModel(req.Graph, defs).Concurrency
			d, err := provision(ctx, req.Graph, defs, poolSize, func(msg string) {
				send(Event{Type: EventPhase, Message: msg})
			})
			if err != nil {
				send(Event{Type: EventPhase, Message: "Container provisioning failed — falling back to in-process emulation. (" + err.Error() + ")"})
			} else {
				dep = d
			}
		}
		defer dep.teardown()

		tgt, model := startTarget(req.Graph, defs, dep)
		defer tgt.close()
		m := model
		backing := "in-process emulation"
		if dep != nil {
			backing = "real containers"
		}
		send(Event{Type: EventPhase, Message: fmt.Sprintf(
			"Live service up (%s): %d concurrent servers, ~%.0fms/request, ~%.0f rps capacity.",
			backing, m.Concurrency, m.ServiceLatency, m.CapacityRps), Model: &m})

		client := &http.Client{
			Timeout: 10 * time.Second,
			// A generous transport so the client isn't the bottleneck under load.
			Transport: &http.Transport{MaxIdleConns: 1024, MaxIdleConnsPerHost: 1024, MaxConnsPerHost: 0},
		}

		offered := simulation.CalculateIncomingRPS(req.Traffic)
		if offered <= 0 {
			offered = m.CapacityRps // nothing offered — probe at capacity so the run is meaningful
		}

		// Warmup so connection pools and the runtime settle before measuring.
		send(Event{Type: EventPhase, Message: "Warming up…"})
		generate(ctx, client, tgt.url(), LoadOptions{TargetRPS: offered * 0.5, DurationSec: 1}, func(Progress) {})
		if ctx.Err() != nil {
			return
		}

		duration := req.DurationSec
		if duration <= 0 {
			duration = 8
		}
		send(Event{Type: EventPhase, Message: fmt.Sprintf("Driving %.0f rps for %.0fs…", offered, duration)})
		measured := generate(ctx, client, tgt.url(), LoadOptions{TargetRPS: offered, DurationSec: duration}, func(p Progress) {
			pp := p
			send(Event{Type: EventProgress, Progress: &pp})
		})
		if ctx.Err() != nil {
			return
		}

		send(Event{Type: EventPhase, Message: "Tearing down."})
		predicted := req.Predicted
		// If the client didn't pass a prediction, fall back to the target model.
		if predicted.CapacityRps == 0 {
			predicted.CapacityRps = m.CapacityRps
		}
		if predicted.LatencyMs == 0 {
			predicted.LatencyMs = m.ServiceLatency
		}
		send(Event{Type: EventDone, Measured: &measured, Predicted: &predicted})
	}()

	return events, nil
}
