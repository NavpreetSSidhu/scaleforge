package livesim

import (
	"math"
	"testing"
)

func TestHistogramPercentiles(t *testing.T) {
	h := newHistogram()
	for i := 1; i <= 100; i++ {
		h.record(float64(i))
	}
	if got := h.percentile(0.5); math.Abs(got-50) > 1 {
		t.Errorf("p50 = %.1f, want ~50", got)
	}
	if got := h.percentile(0.99); math.Abs(got-99) > 1 {
		t.Errorf("p99 = %.1f, want ~99", got)
	}
	if got := h.mean(); math.Abs(got-50.5) > 0.5 {
		t.Errorf("mean = %.2f, want ~50.5", got)
	}
}

func TestHistogramEmpty(t *testing.T) {
	h := newHistogram()
	if h.percentile(0.5) != 0 || h.mean() != 0 {
		t.Error("empty histogram should report 0")
	}
}

func TestHistogramOverflowClamps(t *testing.T) {
	h := newHistogram()
	h.record(999999)
	if got := h.percentile(1.0); got != maxBucketMs {
		t.Errorf("overflow should clamp to %d, got %.0f", maxBucketMs, got)
	}
}
