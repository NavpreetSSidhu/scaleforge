// Package livesim is a discrete-event simulator for ScaleForge architectures.
//
// Where the steady-state engine (internal/simulation) answers "does the system
// hold?" with closed-form weakest-link math, livesim answers "what does it feel
// like under load over time?" by pushing individual requests through a tandem of
// M/M/c queueing stations and watching queues build, tails stretch, and load
// shed. It models the things static math can't: queueing delay, backpressure
// (bounded queues that drop when full), retries, and circuit breakers that fail
// fast while a downstream is unhealthy.
//
// The core is a textbook event loop: a min-heap of timestamped events advanced
// strictly in simulated-time order. Requests arrive as a Poisson process at the
// architecture's incoming RPS and flow through the components in dependency
// order. The run streams Tick snapshots so the canvas can animate live, optionally
// paced to wall-clock time so the build-up plays out rather than finishing
// instantly.
package livesim

import (
	"context"
	"math"
	"math/rand"
	"time"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// Options tunes a live run. Zero values fall back to the documented defaults so
// callers can pass Options{} for a sensible run.
type Options struct {
	Seed            int64   // RNG seed; 0 uses a time-based seed
	DurationSec     float64 // simulated seconds to run; default 20
	TickMs          float64 // emit a snapshot every this many simulated ms; default 250
	SpeedFactor     float64 // simulated seconds per real second for pacing; <=0 runs as fast as possible
	QueueCapacity   int     // per-station queue bound before shedding; default 256
	MaxRetries      int     // retries for a shed request before it fails; default 1
	BreakerDropRate float64 // windowed drop-rate that trips a station's breaker; default 0.6
	ArrivalScale    float64 // multiplier on incoming RPS; default 1
}

func (o Options) withDefaults() Options {
	if o.DurationSec <= 0 {
		o.DurationSec = 20
	}
	if o.TickMs <= 0 {
		o.TickMs = 250
	}
	if o.QueueCapacity <= 0 {
		o.QueueCapacity = 256
	}
	if o.MaxRetries < 0 {
		o.MaxRetries = 0
	}
	if o.BreakerDropRate <= 0 {
		o.BreakerDropRate = 0.6
	}
	if o.ArrivalScale <= 0 {
		o.ArrivalScale = 1
	}
	return o
}

// StationTick is one station's state at a tick: enough for the canvas to render
// a load glow, a queue-depth badge, and a tripped indicator.
type StationTick struct {
	NodeID      string  `json:"nodeId"`
	NodeType    string  `json:"nodeType"`
	Label       string  `json:"label"`
	QueueLen    int     `json:"queueLen"`
	Utilization float64 `json:"utilization"`
	Arrived     int64   `json:"arrived"`
	Served      int64   `json:"served"`
	Dropped     int64   `json:"dropped"`
	Tripped     bool    `json:"tripped"`
}

// Tick is a snapshot of the whole system at a moment in simulated time. The
// percentiles are cumulative over the run so the tail visibly converges; the
// rps figures are windowed over the last tick so they read like a live meter.
type Tick struct {
	TimeMs      float64       `json:"timeMs"`
	Stations    []StationTick `json:"stations"`
	IncomingRps float64       `json:"incomingRps"`
	ServedRps   float64       `json:"servedRps"`
	DroppedRps  float64       `json:"droppedRps"`
	P50         float64       `json:"p50"`
	P95         float64       `json:"p95"`
	P99         float64       `json:"p99"`
	P999        float64       `json:"p999"`
	MeanLatency float64       `json:"meanLatencyMs"`
	Completed   int64         `json:"completed"`
	Failed      int64         `json:"failed"`
	Done        bool          `json:"done"`
}

// expSample draws an exponentially-distributed interval with the given rate
// (mean = 1/rate). Used for both Poisson arrivals and service times.
func expSample(rng *rand.Rand, rate float64) float64 {
	if rate <= 0 {
		return math.Inf(1)
	}
	// rng.Float64() is in [0,1); 1-x avoids log(0).
	return -math.Log(1-rng.Float64()) / rate
}

// Run executes a discrete-event simulation of the architecture and invokes emit
// with a Tick every Options.TickMs of simulated time (and once more at the end
// with Done=true). It returns when the run completes, the duration elapses, or
// ctx is cancelled (e.g. the SSE client disconnects).
func Run(ctx context.Context, graph simulation.Graph, traffic simulation.TrafficProfile, defs map[string]catalog.NodeDefinition, opts Options, emit func(Tick)) {
	opts = opts.withDefaults()

	seed := opts.Seed
	if seed == 0 {
		seed = time.Now().UnixNano()
	}
	rng := rand.New(rand.NewSource(seed))

	stations := buildStations(graph, defs, opts.QueueCapacity)
	lambda := simulation.CalculateIncomingRPS(traffic) * opts.ArrivalScale

	// No traffic or no stations to route through: emit a single empty final tick.
	if lambda <= 0 || len(stations) == 0 {
		emit(Tick{TimeMs: 0, Stations: stationTicks(stations), IncomingRps: math.Max(0, lambda), Done: true})
		return
	}

	hist := newHistogram()
	sched := newScheduler()
	var nextReqID uint64
	var completed, failed int64

	// Seed the first external arrival, then each arrival schedules the next so the
	// inter-arrival gaps are exponential (a Poisson process at rate lambda).
	scheduleArrival := func(at float64) {
		nextReqID++
		req := &request{id: nextReqID, enteredAt: at, routeIndex: 0, retriesLeft: opts.MaxRetries}
		sched.push(at, evArrival, 0, req)
	}
	scheduleArrival(expSample(rng, lambda))

	// drop fails or retries a shed request at the station it could not enter.
	drop := func(st *station, req *request, now float64) {
		st.dropped++
		st.winDropped++
		if req.retriesLeft > 0 {
			req.retriesLeft--
			// Small backoff before retrying at the same station.
			sched.push(now+expSample(rng, st.serverRate*4+1), evArrival, indexOf(stations, st), req)
			return
		}
		failed++
	}

	startService := func(st *station, req *request, stationIdx int, now float64) {
		st.busy++
		sched.push(now+expSample(rng, st.serverRate), evDeparture, stationIdx, req)
	}

	advance := func(req *request, fromIdx int, now float64) {
		req.routeIndex++
		if req.routeIndex >= len(stations) {
			completed++
			hist.record((now - req.enteredAt) * 1000) // seconds → ms
			return
		}
		sched.push(now, evArrival, req.routeIndex, req)
	}

	tickEverySec := opts.TickMs / 1000.0
	nextTickAt := tickEverySec
	var lastServed, lastDropped int64
	var lastTickTime float64

	emitTick := func(now float64, done bool) {
		dt := now - lastTickTime
		if dt <= 0 {
			dt = tickEverySec
		}
		served := totalServed(stations)
		dropped := totalDropped(stations)
		t := Tick{
			TimeMs:      now * 1000,
			Stations:    stationTicks(stations),
			IncomingRps: lambda,
			ServedRps:   float64(served-lastServed) / dt,
			DroppedRps:  float64(dropped-lastDropped) / dt,
			P50:         hist.percentile(0.50),
			P95:         hist.percentile(0.95),
			P99:         hist.percentile(0.99),
			P999:        hist.percentile(0.999),
			MeanLatency: hist.mean(),
			Completed:   completed,
			Failed:      failed,
			Done:        done,
		}
		emit(t)
		lastServed, lastDropped, lastTickTime = served, dropped, now
		// Re-evaluate circuit breakers, then reset the per-tick window. A breaker
		// is the classic upstream-protects-downstream pattern: a station trips when
		// the station it feeds (its downstream) is shedding heavily over the last
		// window, so the caller fails fast and stops piling load onto a sick tier.
		// The bottleneck itself therefore stays hot while its upstream sheds early.
		unhealthy := make([]bool, len(stations))
		for i, st := range stations {
			unhealthy[i] = st.winArrived >= 8 && float64(st.winDropped)/float64(st.winArrived) >= opts.BreakerDropRate
		}
		for i, st := range stations {
			st.tripped = i+1 < len(stations) && unhealthy[i+1]
			st.winArrived, st.winDropped = 0, 0
		}
		// Pace to wall-clock so the animation plays out, unless running headless.
		if opts.SpeedFactor > 0 && !done {
			sleep := time.Duration(tickEverySec / opts.SpeedFactor * float64(time.Second))
			timer := time.NewTimer(sleep)
			select {
			case <-ctx.Done():
				timer.Stop()
			case <-timer.C:
			}
		}
	}

	for {
		if ctx.Err() != nil {
			return
		}
		ev := sched.pop()
		// Out of events but still within the window: keep arrivals flowing.
		if ev == nil {
			if nextTickAt > opts.DurationSec {
				break
			}
			scheduleArrival(nextTickAt)
			continue
		}

		// Emit any ticks whose boundary we crossed before processing this event.
		for ev.at >= nextTickAt && nextTickAt <= opts.DurationSec {
			emitTick(nextTickAt, false)
			nextTickAt += tickEverySec
			if ctx.Err() != nil {
				return
			}
		}
		if ev.at > opts.DurationSec {
			break
		}

		st := stations[ev.station]
		switch ev.kind {
		case evArrival:
			// Only the entry station keeps the external arrival process going.
			if ev.station == 0 {
				scheduleArrival(ev.at + expSample(rng, lambda))
			}
			st.arrived++
			st.winArrived++
			switch {
			case st.tripped:
				// Breaker open: fail fast instead of queueing behind a sick tier.
				drop(st, ev.req, ev.at)
			case st.busy < st.servers:
				startService(st, ev.req, ev.station, ev.at)
			case len(st.queue) < st.queueCap:
				st.queue = append(st.queue, ev.req)
			default:
				drop(st, ev.req, ev.at) // queue full → shed (backpressure)
			}
		case evDeparture:
			st.busy--
			st.served++
			advance(ev.req, ev.station, ev.at)
			// Pull the next waiting request onto the freed server.
			if len(st.queue) > 0 {
				next := st.queue[0]
				st.queue = st.queue[1:]
				startService(st, next, ev.station, ev.at)
			}
		}
	}

	emitTick(math.Min(nextTickAt, opts.DurationSec), true)
}

// buildStations turns the graph into a tandem of queueing stations in dependency
// order, deriving each station's server count and per-server rate from the same
// capacity the steady-state engine uses.
func buildStations(graph simulation.Graph, defs map[string]catalog.NodeDefinition, queueCap int) []*station {
	ordered := simulation.TopologicalOrder(graph)
	stations := make([]*station, 0, len(ordered))
	for _, n := range ordered {
		servers := n.Config.Replicas
		if servers <= 0 {
			servers = 1
		}
		capacity := simulation.ServiceCapacity(n, defs) // total rps across all servers
		serverRate := capacity / float64(servers)
		if serverRate <= 0 {
			serverRate = 1
		}
		stations = append(stations, &station{
			nodeID:     n.ID,
			nodeType:   n.Type,
			label:      n.Label,
			servers:    servers,
			serverRate: serverRate,
			queueCap:   queueCap,
		})
	}
	return stations
}

func indexOf(stations []*station, target *station) int {
	for i, s := range stations {
		if s == target {
			return i
		}
	}
	return 0
}

func stationTicks(stations []*station) []StationTick {
	out := make([]StationTick, 0, len(stations))
	for _, s := range stations {
		out = append(out, StationTick{
			NodeID:      s.nodeID,
			NodeType:    s.nodeType,
			Label:       s.label,
			QueueLen:    len(s.queue),
			Utilization: s.utilization(),
			Arrived:     s.arrived,
			Served:      s.served,
			Dropped:     s.dropped,
			Tripped:     s.tripped,
		})
	}
	return out
}

func totalServed(stations []*station) int64 {
	var n int64
	for _, s := range stations {
		n += s.served
	}
	return n
}

func totalDropped(stations []*station) int64 {
	var n int64
	for _, s := range stations {
		n += s.dropped
	}
	return n
}
