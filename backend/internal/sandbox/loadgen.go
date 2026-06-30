package sandbox

import (
	"context"
	"math"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// histogram is a compact 1 ms-bucket latency recorder (same shape as the live
// simulator's): O(1) record, cheap percentile walk.
type histogram struct {
	mu      sync.Mutex
	buckets []int64
	count   int64
	maxMs   float64
}

const histMaxMs = 20000 // 20s ceiling at 1ms resolution

func newHistogram() *histogram { return &histogram{buckets: make([]int64, histMaxMs+1)} }

func (h *histogram) record(ms float64) {
	if ms < 0 {
		ms = 0
	}
	idx := int(math.Round(ms))
	if idx > histMaxMs {
		idx = histMaxMs
	}
	h.mu.Lock()
	h.buckets[idx]++
	h.count++
	if ms > h.maxMs {
		h.maxMs = ms
	}
	h.mu.Unlock()
}

func (h *histogram) percentile(p float64) float64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.count == 0 {
		return 0
	}
	rank := int64(math.Ceil(p * float64(h.count)))
	if rank < 1 {
		rank = 1
	}
	var cum int64
	for ms, c := range h.buckets {
		cum += c
		if cum >= rank {
			return float64(ms)
		}
	}
	return histMaxMs
}

// LoadOptions configures one load phase.
type LoadOptions struct {
	TargetRPS   float64 // requests/second to offer
	DurationSec float64 // how long to run
	Workers     int     // concurrent issuing goroutines
}

func (o LoadOptions) withDefaults() LoadOptions {
	if o.DurationSec <= 0 {
		o.DurationSec = 8
	}
	if o.Workers <= 0 {
		// Enough concurrency to keep the offered rate saturated at typical latencies.
		o.Workers = int(math.Max(16, math.Min(512, o.TargetRPS/20)))
	}
	return o
}

// Progress is a periodic snapshot streamed during a run.
type Progress struct {
	ElapsedSec  float64 `json:"elapsedSec"`
	AchievedRps float64 `json:"achievedRps"`
	P50         float64 `json:"p50"`
	P95         float64 `json:"p95"`
	P99         float64 `json:"p99"`
	ErrorRate   float64 `json:"errorRate"`
	Sent        int64   `json:"sent"`
	OK          int64   `json:"ok"`
	Failed      int64   `json:"failed"`
}

// Measured is the final outcome of a load run — what the system actually did.
type Measured struct {
	AchievedRps float64 `json:"achievedRps"`
	P50         float64 `json:"p50"`
	P95         float64 `json:"p95"`
	P99         float64 `json:"p99"`
	MaxLatency  float64 `json:"maxLatencyMs"`
	ErrorRate   float64 `json:"errorRate"`
	Sent        int64   `json:"sent"`
	OK          int64   `json:"ok"`
	Failed      int64   `json:"failed"`
}

// generate runs a closed-loop-free, rate-paced load test against url and returns
// the measured result. A pacer goroutine releases request tokens at TargetRPS
// onto a bounded channel; a fixed pool of workers pull tokens and issue real HTTP
// requests, recording wall-clock latency and success/failure. Tokens dropped when
// the channel is full mean the workers can't keep up — i.e. the target is the
// limiter, which is exactly the signal we want.
func generate(ctx context.Context, client *http.Client, url string, opts LoadOptions, emit func(Progress)) Measured {
	opts = opts.withDefaults()
	hist := newHistogram()
	var sent, ok, failed int64

	tokens := make(chan struct{}, opts.Workers*2)
	runCtx, cancel := context.WithTimeout(ctx, time.Duration(opts.DurationSec*float64(time.Second)))
	defer cancel()

	// Pacer: release tokens at the target rate. We tick at a fine interval and
	// release a batch per tick so high RPS doesn't need microsecond timers.
	var pacer sync.WaitGroup
	pacer.Add(1)
	go func() {
		defer pacer.Done()
		const tick = 5 * time.Millisecond
		perTick := opts.TargetRPS * tick.Seconds()
		carry := 0.0
		t := time.NewTicker(tick)
		defer t.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-t.C:
				carry += perTick
				n := int(carry)
				carry -= float64(n)
				for i := 0; i < n; i++ {
					select {
					case tokens <- struct{}{}:
					default:
						// Channel full: workers are saturated. Drop the token rather
						// than build an unbounded backlog (open-loop, no coordinated omission).
					}
				}
			}
		}
	}()

	var workers sync.WaitGroup
	for i := 0; i < opts.Workers; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for {
				select {
				case <-runCtx.Done():
					return
				case <-tokens:
					atomic.AddInt64(&sent, 1)
					start := time.Now()
					req, _ := http.NewRequestWithContext(runCtx, http.MethodGet, url, nil)
					resp, err := client.Do(req)
					lat := float64(time.Since(start).Microseconds()) / 1000.0
					hist.record(lat)
					if err != nil || resp.StatusCode >= 500 {
						atomic.AddInt64(&failed, 1)
					} else {
						atomic.AddInt64(&ok, 1)
					}
					if resp != nil {
						resp.Body.Close()
					}
				}
			}
		}()
	}

	// Progress emitter.
	var reporter sync.WaitGroup
	reporter.Add(1)
	go func() {
		defer reporter.Done()
		start := time.Now()
		t := time.NewTicker(500 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-t.C:
				elapsed := time.Since(start).Seconds()
				s := atomic.LoadInt64(&sent)
				f := atomic.LoadInt64(&failed)
				emit(Progress{
					ElapsedSec:  elapsed,
					AchievedRps: float64(s) / math.Max(elapsed, 0.001),
					P50:         hist.percentile(0.50),
					P95:         hist.percentile(0.95),
					P99:         hist.percentile(0.99),
					ErrorRate:   safeRatio(f, s),
					Sent:        s,
					OK:          atomic.LoadInt64(&ok),
					Failed:      f,
				})
			}
		}
	}()

	<-runCtx.Done()
	pacer.Wait()
	workers.Wait()
	reporter.Wait()

	totalSent := atomic.LoadInt64(&sent)
	totalFailed := atomic.LoadInt64(&failed)
	return Measured{
		AchievedRps: float64(totalSent) / opts.DurationSec,
		P50:         hist.percentile(0.50),
		P95:         hist.percentile(0.95),
		P99:         hist.percentile(0.99),
		MaxLatency:  hist.maxMs,
		ErrorRate:   safeRatio(totalFailed, totalSent),
		Sent:        totalSent,
		OK:          atomic.LoadInt64(&ok),
		Failed:      totalFailed,
	}
}

func safeRatio(num, den int64) float64 {
	if den == 0 {
		return 0
	}
	return float64(num) / float64(den)
}
