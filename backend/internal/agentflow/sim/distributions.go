package sim

import (
	"math"
	"math/rand"
)

// sampleLatency draws a single latency (ms) for a node. LLM and tool calls are
// heavy-tailed, so when jitter (sigma) > 0 we draw from a lognormal whose median
// is base: base * exp(sigma*Z). That keeps the typical value at `base` while
// giving a realistic right tail (the p95/p99 the simulator is built to surface).
// jitter == 0 yields a deterministic value (control/IO nodes).
func sampleLatency(base, jitter float64, rng *rand.Rand) float64 {
	if base <= 0 {
		return 0
	}
	if jitter <= 0 {
		return base
	}
	return base * math.Exp(rng.NormFloat64()*jitter)
}

// sampleTokens draws a token count around mean with mild variance (≈15% sigma),
// clamped non-negative. Returns 0 for nodes that don't consume tokens.
func sampleTokens(mean int, rng *rand.Rand) int {
	if mean <= 0 {
		return 0
	}
	v := float64(mean) * (1 + rng.NormFloat64()*0.15)
	if v < 0 {
		return 0
	}
	return int(math.Round(v))
}

// percentile returns the p-th percentile (0..100) of an already-sorted slice via
// nearest-rank. Empty input yields 0.
func percentile(sorted []float64, p float64) float64 {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	if p <= 0 {
		return sorted[0]
	}
	if p >= 100 {
		return sorted[n-1]
	}
	rank := int(math.Ceil(p/100*float64(n))) - 1
	if rank < 0 {
		rank = 0
	}
	if rank >= n {
		rank = n - 1
	}
	return sorted[rank]
}

// summarize sorts a copy-free (caller owns it) sample slice and returns its
// percentiles + mean.
func summarize(samples []float64) Percentiles {
	if len(samples) == 0 {
		return Percentiles{}
	}
	// samples is sorted in place by the caller before this is called.
	var sum float64
	for _, v := range samples {
		sum += v
	}
	return Percentiles{
		P50:  percentile(samples, 50),
		P95:  percentile(samples, 95),
		P99:  percentile(samples, 99),
		Mean: sum / float64(len(samples)),
	}
}
