package livesim

import "math"

// histogram is a compact fixed-bucket latency recorder (HDR-style in spirit but
// deliberately simple): 1 ms buckets up to maxBucketMs, plus a single overflow
// bucket. Recording is O(1) and percentile queries walk the cumulative counts,
// which is plenty for the tens of thousands of completions a live run produces
// and avoids re-sorting a growing slice on every tick.
type histogram struct {
	buckets []int64
	count   int64
	// sum lets us report a cheap mean alongside the percentiles.
	sum float64
}

// maxBucketMs is the largest latency tracked at 1 ms resolution; anything slower
// lands in the overflow bucket and is reported as maxBucketMs.
const maxBucketMs = 5000

func newHistogram() *histogram {
	// +1 for the overflow bucket at index maxBucketMs.
	return &histogram{buckets: make([]int64, maxBucketMs+1)}
}

// record adds one observation in milliseconds. Negative values are clamped to 0.
func (h *histogram) record(ms float64) {
	if ms < 0 {
		ms = 0
	}
	idx := int(math.Round(ms))
	if idx > maxBucketMs {
		idx = maxBucketMs
	}
	h.buckets[idx]++
	h.count++
	h.sum += ms
}

// percentile returns the latency (ms) at the given quantile in [0,1]. Returns 0
// when nothing has been recorded.
func (h *histogram) percentile(p float64) float64 {
	if h.count == 0 {
		return 0
	}
	if p < 0 {
		p = 0
	}
	if p > 1 {
		p = 1
	}
	// rank is the 1-based index of the target observation.
	rank := int64(math.Ceil(p * float64(h.count)))
	if rank < 1 {
		rank = 1
	}
	var cumulative int64
	for ms, c := range h.buckets {
		cumulative += c
		if cumulative >= rank {
			return float64(ms)
		}
	}
	return maxBucketMs
}

// mean returns the average recorded latency in ms, or 0 when empty.
func (h *histogram) mean() float64 {
	if h.count == 0 {
		return 0
	}
	return h.sum / float64(h.count)
}
