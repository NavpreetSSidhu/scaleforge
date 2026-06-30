package livesim

import "container/heap"

// eventKind discriminates the two event types the scheduler processes.
type eventKind int

const (
	// evArrival: a request reaches a station and is either serviced, queued, or shed.
	evArrival eventKind = iota
	// evDeparture: a server at a station finishes a request and frees up.
	evDeparture
)

// event is one scheduled occurrence in simulated time. The scheduler is a
// classic discrete-event loop: it always advances to the next event by time,
// never by a fixed step, so idle gaps cost nothing and bursts are exact.
type event struct {
	at      float64 // simulated time in seconds
	kind    eventKind
	station int      // index into the station slice
	req     *request // the request this event concerns
	seq     uint64   // tie-breaker so equal-time events stay FIFO (deterministic)
}

// request is a single job flowing through the tandem of stations. It carries the
// time it entered the system so end-to-end latency is exact on completion, the
// index of the station it is currently at, and how many retries it has left.
type request struct {
	id          uint64
	enteredAt   float64
	routeIndex  int
	retriesLeft int
}

// station is a queueing node: c servers (one per replica) each draining the
// shared FIFO queue at serverRate, with a bounded queue that sheds load when
// full (backpressure) and a circuit breaker that fails fast while tripped.
type station struct {
	nodeID     string
	nodeType   string
	label      string
	servers    int
	serverRate float64 // requests/second a single server completes (exp service)
	queueCap   int

	busy  int        // servers currently serving
	queue []*request // waiting requests (FIFO)

	// Cumulative counters over the whole run (for rates and the canvas).
	arrived int64
	served  int64
	dropped int64

	// Windowed counters reset every tick; drive the circuit-breaker decision so
	// a station recovers (half-opens) once its recent drop rate falls.
	winArrived int64
	winDropped int64
	tripped    bool
}

// utilization is the instantaneous fraction of busy servers in [0,1].
func (s *station) utilization() float64 {
	if s.servers <= 0 {
		return 0
	}
	return float64(s.busy) / float64(s.servers)
}

// eventQueue is a min-heap of events ordered by simulated time (then seq).
type eventQueue []*event

func (q eventQueue) Len() int { return len(q) }
func (q eventQueue) Less(i, j int) bool {
	if q[i].at == q[j].at {
		return q[i].seq < q[j].seq
	}
	return q[i].at < q[j].at
}
func (q eventQueue) Swap(i, j int) { q[i], q[j] = q[j], q[i] }
func (q *eventQueue) Push(x any)   { *q = append(*q, x.(*event)) }
func (q *eventQueue) Pop() any {
	old := *q
	n := len(old)
	e := old[n-1]
	old[n-1] = nil
	*q = old[:n-1]
	return e
}

// scheduler wraps the heap with a monotonic sequence counter so equal-time
// events pop in insertion order (keeps runs deterministic for a fixed seed).
type scheduler struct {
	q   eventQueue
	seq uint64
}

func newScheduler() *scheduler {
	s := &scheduler{}
	heap.Init(&s.q)
	return s
}

func (s *scheduler) push(at float64, kind eventKind, station int, req *request) {
	heap.Push(&s.q, &event{at: at, kind: kind, station: station, req: req, seq: s.seq})
	s.seq++
}

func (s *scheduler) pop() *event {
	if s.q.Len() == 0 {
		return nil
	}
	return heap.Pop(&s.q).(*event)
}

func (s *scheduler) empty() bool { return s.q.Len() == 0 }
