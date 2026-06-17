package vector

import (
	"math/rand"
	"testing"
)

// buildCorpus makes a small clustered dataset + queries with exact ground truth.
func buildCorpus(t *testing.T, n, dim, nq, k int) (data, queries [][]float32, truth [][]int) {
	t.Helper()
	data, queries = makeCorpus(n, dim, nq, 7)
	gt := NewFlat(dim, "none", 7)
	for i, v := range data {
		gt.Add(i, v)
	}
	gt.Build()
	truth = make([][]int, nq)
	for qi, q := range queries {
		ns := gt.Search(q, k)
		ids := make([]int, len(ns))
		for j, nb := range ns {
			ids[j] = nb.ID
		}
		truth[qi] = ids
	}
	return data, queries, truth
}

func recallOf(t *testing.T, idx Index, data, queries [][]float32, truth [][]int, k int) float64 {
	t.Helper()
	for i, v := range data {
		idx.Add(i, v)
	}
	idx.Build()
	var hits int
	for qi, q := range queries {
		hits += overlap(idx.Search(q, k), truth[qi])
	}
	return float64(hits) / float64(len(queries)*k)
}

func TestFlatExactRecall(t *testing.T) {
	data, queries, truth := buildCorpus(t, 2000, 64, 40, 10)
	if r := recallOf(t, NewFlat(64, "none", 7), data, queries, truth, 10); r < 0.999 {
		t.Fatalf("exact flat recall = %.3f, want 1.0", r)
	}
}

func TestHNSWHighRecall(t *testing.T) {
	data, queries, truth := buildCorpus(t, 3000, 64, 50, 10)
	r := recallOf(t, NewHNSW(64, 16, 96, 7), data, queries, truth, 10)
	if r < 0.85 {
		t.Fatalf("hnsw recall = %.3f, want ≥0.85 at efSearch=96", r)
	}
}

func TestIVFNprobeRaisesRecall(t *testing.T) {
	data, queries, truth := buildCorpus(t, 4000, 64, 50, 10)
	low := recallOf(t, NewIVF(64, 64, 1, "none", 7), data, queries, truth, 10)
	high := recallOf(t, NewIVF(64, 64, 24, "none", 7), data, queries, truth, 10)
	if high <= low {
		t.Fatalf("more probes should not lower recall: nprobe1=%.3f nprobe24=%.3f", low, high)
	}
}

func TestProductQuantizationSavesMemory(t *testing.T) {
	dim := 128
	data, _, _ := buildCorpus(t, 2000, dim, 10, 10)

	flat := NewFlat(dim, "none", 7)
	pq := NewFlat(dim, "product", 7)
	for i, v := range data {
		flat.Add(i, v)
		pq.Add(i, v)
	}
	flat.Build()
	pq.Build()
	if pq.MemoryBytes()*4 >= flat.MemoryBytes() {
		t.Fatalf("product quantization should be far smaller: pq=%d flat=%d", pq.MemoryBytes(), flat.MemoryBytes())
	}
}

func TestScalarQuantizationApproxRecall(t *testing.T) {
	data, queries, truth := buildCorpus(t, 2000, 64, 40, 10)
	r := recallOf(t, NewFlat(64, "scalar", 7), data, queries, truth, 10)
	// Scalar quantization is a small, uniform error — recall should stay high.
	if r < 0.9 {
		t.Fatalf("scalar-quantized recall = %.3f, want ≥0.9", r)
	}
}

func TestEstimateLatencyOrdering(t *testing.T) {
	flat := EstimateLatencyMs("flat", "none", 50000, 768, 5)
	ivf := EstimateLatencyMs("ivf", "none", 50000, 768, 5)
	hnsw := EstimateLatencyMs("hnsw", "none", 50000, 768, 5)
	if !(hnsw < ivf && ivf < flat) {
		t.Fatalf("expected hnsw < ivf < flat, got hnsw=%.2f ivf=%.2f flat=%.2f", hnsw, ivf, flat)
	}
	// Flat over 50k×768 should land near the calibrated ~15ms.
	if flat < 8 || flat > 30 {
		t.Fatalf("flat estimate out of calibrated range: %.2f ms", flat)
	}
}

func TestBenchmarkSmoke(t *testing.T) {
	res := Benchmark(BenchRequest{CorpusSize: 1500, Dim: 48, K: 10, Queries: 30, Seed: 3})
	if len(res.Variants) != len(DefaultVariants()) {
		t.Fatalf("expected %d variants, got %d", len(DefaultVariants()), len(res.Variants))
	}
	for _, v := range res.Variants {
		if v.IndexType == "flat" && v.Quantization == "none" && v.RecallAtK < 0.999 {
			t.Fatalf("exact flat variant recall = %.3f, want 1.0", v.RecallAtK)
		}
		if v.RecallAtK < 0 || v.RecallAtK > 1.0001 {
			t.Fatalf("recall out of range for %s: %.3f", v.Name, v.RecallAtK)
		}
	}
}

// ensure the rng helper compiles against the package (used indirectly).
var _ = rand.New(rand.NewSource(1))
