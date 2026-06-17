package vector

import (
	"math/rand"
	"runtime"
	"sort"
	"sync"
	"time"
)

// Variant names one index configuration to benchmark.
type Variant struct {
	IndexType    string `json:"indexType"`    // flat | ivf | hnsw
	Quantization string `json:"quantization"` // none | scalar | product
	Nlist        int    `json:"nlist,omitempty"`
	Nprobe       int    `json:"nprobe,omitempty"`
	M            int    `json:"m,omitempty"`
	EfSearch     int    `json:"efSearch,omitempty"`
}

// VariantResult is one variant's measured trade-off.
type VariantResult struct {
	Name         string  `json:"name"`
	IndexType    string  `json:"indexType"`
	Quantization string  `json:"quantization"`
	RecallAtK    float64 `json:"recallAtK"`  // overlap with exact top-k, averaged over queries
	QueryP50Ms   float64 `json:"queryP50Ms"` // per-query latency percentiles (concurrent load)
	QueryP95Ms   float64 `json:"queryP95Ms"`
	MemoryBytes  int     `json:"memoryBytes"`
	MemoryMB     float64 `json:"memoryMB"`
	BuildMs      float64 `json:"buildMs"`
}

// BenchRequest configures a benchmark. Sizes are clamped to keep the endpoint
// snappy — this is a scaled-down but real demonstration of the algorithms, not a
// production-scale load test.
type BenchRequest struct {
	CorpusSize int       `json:"corpusSize"`
	Dim        int       `json:"dim"`
	K          int       `json:"k"`
	Queries    int       `json:"queries"`
	Variants   []Variant `json:"variants"`
	Seed       int64     `json:"seed"`
}

// BenchResult is the full benchmark outcome.
type BenchResult struct {
	CorpusSize int             `json:"corpusSize"`
	Dim        int             `json:"dim"`
	K          int             `json:"k"`
	Queries    int             `json:"queries"`
	Variants   []VariantResult `json:"variants"`
}

// DefaultVariants is the trade-off curve the UI shows by default: exact baseline,
// the two quantizations on a flat scan, IVF at two nprobe settings, and HNSW.
func DefaultVariants() []Variant {
	return []Variant{
		{IndexType: "flat", Quantization: "none"},
		{IndexType: "flat", Quantization: "scalar"},
		{IndexType: "flat", Quantization: "product"},
		{IndexType: "ivf", Quantization: "none", Nlist: 64, Nprobe: 4},
		{IndexType: "ivf", Quantization: "none", Nlist: 64, Nprobe: 16},
		{IndexType: "hnsw", Quantization: "none", M: 16, EfSearch: 100},
	}
}

// Benchmark generates a clustered synthetic corpus, computes exact ground truth,
// then builds and measures every requested variant.
func Benchmark(req BenchRequest) BenchResult {
	corpus := clamp(req.CorpusSize, 200, 20000, 5000)
	dim := clamp(req.Dim, 8, 512, 128)
	k := clamp(req.K, 1, 100, 10)
	nq := clamp(req.Queries, 5, 200, 50)
	seed := req.Seed
	if seed == 0 {
		seed = 1
	}
	variants := req.Variants
	if len(variants) == 0 {
		variants = DefaultVariants()
	}

	data, queries := makeCorpus(corpus, dim, nq, seed)

	// Exact ground truth (Flat, no quantization) for recall.
	truth := make([][]int, nq)
	{
		gt := NewFlat(dim, "none", seed)
		for i, v := range data {
			gt.Add(i, v)
		}
		gt.Build()
		for qi, q := range queries {
			ns := gt.Search(q, k)
			ids := make([]int, len(ns))
			for j, n := range ns {
				ids[j] = n.ID
			}
			truth[qi] = ids
		}
	}

	results := make([]VariantResult, len(variants))
	for vi, v := range variants {
		results[vi] = benchVariant(v, data, queries, truth, dim, k, seed)
	}
	return BenchResult{CorpusSize: corpus, Dim: dim, K: k, Queries: nq, Variants: results}
}

func benchVariant(v Variant, data, queries [][]float32, truth [][]int, dim, k int, seed int64) VariantResult {
	idx := newIndex(v, dim, seed)
	for i, vec := range data {
		idx.Add(i, vec)
	}
	t0 := time.Now()
	idx.Build()
	buildMs := msSince(t0)

	// Run queries concurrently to exercise the index under parallel load and to
	// showcase that search is goroutine-safe (read-only after Build).
	latencies := make([]float64, len(queries))
	hits := make([]int, len(queries))
	var wg sync.WaitGroup
	workers := runtime.GOMAXPROCS(0)
	jobs := make(chan int)
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for qi := range jobs {
				start := time.Now()
				got := idx.Search(queries[qi], k)
				latencies[qi] = msSince(start)
				hits[qi] = overlap(got, truth[qi])
			}
		}()
	}
	for qi := range queries {
		jobs <- qi
	}
	close(jobs)
	wg.Wait()

	var totalHits int
	for _, h := range hits {
		totalHits += h
	}
	recall := float64(totalHits) / float64(len(queries)*k)
	sort.Float64s(latencies)

	mem := idx.MemoryBytes()
	return VariantResult{
		Name:         idx.Name(),
		IndexType:    v.IndexType,
		Quantization: v.Quantization,
		RecallAtK:    recall,
		QueryP50Ms:   pctl(latencies, 50),
		QueryP95Ms:   pctl(latencies, 95),
		MemoryBytes:  mem,
		MemoryMB:     float64(mem) / (1024 * 1024),
		BuildMs:      buildMs,
	}
}

// newIndex constructs the index family named by a variant.
func newIndex(v Variant, dim int, seed int64) Index {
	switch v.IndexType {
	case "ivf":
		nlist := v.Nlist
		if nlist <= 0 {
			nlist = 64
		}
		nprobe := v.Nprobe
		if nprobe <= 0 {
			nprobe = 8
		}
		return NewIVF(dim, nlist, nprobe, v.Quantization, seed)
	case "hnsw":
		m := v.M
		if m <= 0 {
			m = 16
		}
		ef := v.EfSearch
		if ef <= 0 {
			ef = 64
		}
		return NewHNSW(dim, m, ef, seed)
	default:
		return NewFlat(dim, v.Quantization, seed)
	}
}

// makeCorpus builds a clustered synthetic dataset (Gaussian blobs) plus query
// vectors drawn near random cluster centres, so neighbours are meaningful and
// recall differences between variants are visible.
func makeCorpus(n, dim, nq int, seed int64) (data, queries [][]float32) {
	rng := rand.New(rand.NewSource(seed))
	nClusters := 16
	if nClusters > n {
		nClusters = n
	}
	centers := make([][]float32, nClusters)
	for c := range centers {
		centers[c] = randVec(dim, rng, 1.0)
	}
	data = make([][]float32, n)
	for i := 0; i < n; i++ {
		c := centers[rng.Intn(nClusters)]
		data[i] = jitter(c, dim, rng, 0.15)
	}
	queries = make([][]float32, nq)
	for i := 0; i < nq; i++ {
		c := centers[rng.Intn(nClusters)]
		queries[i] = jitter(c, dim, rng, 0.15)
	}
	return data, queries
}

func randVec(dim int, rng *rand.Rand, scale float32) []float32 {
	v := make([]float32, dim)
	for d := range v {
		v[d] = float32(rng.NormFloat64()) * scale
	}
	return v
}

func jitter(center []float32, dim int, rng *rand.Rand, sigma float32) []float32 {
	v := make([]float32, dim)
	for d := 0; d < dim; d++ {
		v[d] = center[d] + float32(rng.NormFloat64())*sigma
	}
	return v
}

// overlap counts how many of got's ids appear in the exact top-k truth set.
func overlap(got []Neighbor, truth []int) int {
	set := make(map[int]bool, len(truth))
	for _, id := range truth {
		set[id] = true
	}
	hits := 0
	for _, n := range got {
		if set[n.ID] {
			hits++
		}
	}
	return hits
}

func pctl(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	rank := int(float64(len(sorted))*p/100) - 1
	if rank < 0 {
		rank = 0
	}
	if rank >= len(sorted) {
		rank = len(sorted) - 1
	}
	return sorted[rank]
}

func msSince(t time.Time) float64 { return float64(time.Since(t).Microseconds()) / 1000 }

func clamp(v, lo, hi, def int) int {
	if v == 0 {
		return def
	}
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
