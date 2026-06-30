package sandbox

import (
	"math"
	"net/http"
	"net/http/httptest"
	"time"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// target is the designed architecture stood up as a REAL HTTP service on a real
// localhost listener. It is not a mock of the load test — the load generator
// drives it over real TCP. Its behaviour is derived from the design so the
// measured numbers can be cross-checked against the analytical prediction:
//   - service latency = the sum of the catalog base latencies along the tiers
//     (a real time.Sleep, so requests genuinely take that long), and
//   - a concurrency limit sized to the design's bottleneck capacity via Little's
//     Law (capacity_rps × latency_s), so under offered load beyond capacity the
//     server saturates and sheds (503) exactly like the real system would.
type target struct {
	server      *httptest.Server
	sem         chan struct{}
	serviceTime time.Duration
	dep         *Deployment // when set, requests do real Redis/Postgres I/O
}

// targetModel is the derived behaviour, exposed so the caller can report what the
// sandbox actually stood up.
type targetModel struct {
	CapacityRps    float64 `json:"capacityRps"`
	ServiceLatency float64 `json:"serviceLatency"` // ms
	Concurrency    int     `json:"concurrency"`
}

// buildModel derives the target's behaviour from the graph: total per-request
// latency is the sum of base latencies along the dependency order; capacity is
// the weakest tier; concurrency follows Little's Law so throughput caps at capacity.
func buildModel(graph simulation.Graph, defs map[string]catalog.NodeDefinition) targetModel {
	var latencyMs float64
	capacity := math.MaxFloat64
	for _, n := range simulation.TopologicalOrder(graph) {
		if def, ok := defs[n.Type]; ok {
			latencyMs += def.BaseLatencyMs
		}
		if c := simulation.ServiceCapacity(n, defs); c < capacity {
			capacity = c
		}
	}
	if capacity == math.MaxFloat64 {
		capacity = 0
	}
	latencySec := latencyMs / 1000.0
	concurrency := int(math.Round(capacity * latencySec))
	if concurrency < 1 {
		concurrency = 1
	}
	return targetModel{CapacityRps: capacity, ServiceLatency: latencyMs, Concurrency: concurrency}
}

// maxQueueWait caps how long a request waits for a free slot before the target
// sheds it (503). Keeping it short makes saturation show up as shedding quickly.
const maxQueueWait = 40 * time.Millisecond

// emulatedLatency is the per-request latency to emulate with a sleep: the sum of
// base latencies for tiers that are NOT backed by a real container (real Redis/
// Postgres I/O supplies the latency for the cache/database tiers themselves).
func emulatedLatency(graph simulation.Graph, defs map[string]catalog.NodeDefinition, dep *Deployment) time.Duration {
	var ms float64
	for _, n := range simulation.TopologicalOrder(graph) {
		def, ok := defs[n.Type]
		if !ok {
			continue
		}
		if dep != nil && dep.redis != nil && def.Category == catalog.CategoryCache {
			continue // real Redis round-trip supplies this latency
		}
		if dep != nil && dep.pg != nil && def.Category == catalog.CategoryDatabase {
			continue // real Postgres round-trip supplies this latency
		}
		ms += def.BaseLatencyMs
	}
	return time.Duration(ms * float64(time.Millisecond))
}

// startTarget builds the model and starts a real HTTP server implementing it. When
// dep is non-nil the server performs real I/O (cache-aside against Redis, a real
// query against Postgres) so the load test exercises actual datastore round-trips.
func startTarget(graph simulation.Graph, defs map[string]catalog.NodeDefinition, dep *Deployment) (*target, targetModel) {
	model := buildModel(graph, defs)
	t := &target{
		sem:         make(chan struct{}, model.Concurrency),
		serviceTime: emulatedLatency(graph, defs, dep),
		dep:         dep,
	}
	t.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case t.sem <- struct{}{}:
			defer func() { <-t.sem }()
			if t.serviceTime > 0 {
				timer := time.NewTimer(t.serviceTime)
				select {
				case <-timer.C:
				case <-r.Context().Done():
					timer.Stop()
					return
				}
			}
			if err := t.backendIO(r); err != nil {
				w.WriteHeader(http.StatusBadGateway) // a real datastore round-trip failed
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok"))
		case <-time.After(maxQueueWait):
			// All servers busy and the queue wait elapsed: shed, like a saturated tier.
			w.WriteHeader(http.StatusServiceUnavailable)
		case <-r.Context().Done():
		}
	}))
	return t, model
}

// backendIO performs the real datastore work for one request when containers are
// provisioned: cache-aside (GET; on miss, query Postgres then SET) when a cache is
// present, else a direct Postgres query when only a database is present.
func (t *target) backendIO(r *http.Request) error {
	if t.dep == nil {
		return nil
	}
	const key = "sandbox:probe"
	if t.dep.redis != nil {
		var miss bool
		if err := t.dep.redis.withConn(func(c *redisConn) error {
			v, err := c.get(key)
			if err != nil {
				return err
			}
			miss = v == ""
			return nil
		}); err != nil {
			return err
		}
		if miss {
			if t.dep.pg != nil {
				if _, err := t.dep.pg.Exec(r.Context(), "SELECT 1"); err != nil {
					return err
				}
			}
			return t.dep.redis.withConn(func(c *redisConn) error { return c.set(key, "1") })
		}
		return nil
	}
	if t.dep.pg != nil {
		_, err := t.dep.pg.Exec(r.Context(), "SELECT 1")
		return err
	}
	return nil
}

func (t *target) url() string { return t.server.URL }

func (t *target) close() { t.server.Close() }
