package vector

import "math"

// EstimateLatencyMs returns a fast, analytical estimate of a single ANN query's
// latency for a retriever configuration, without building an index. The Monte-
// Carlo simulator calls this per retriever node (building a 50k-vector HNSW on
// every /simulate would be far too slow); the /vector-bench endpoint then proves
// the same trade-offs with real measurements.
//
// The model mirrors each algorithm's actual cost: Flat scans the whole corpus
// (O(corpus·dim)); IVF scans only the probed fraction plus the centroid list;
// HNSW touches O(efSearch·log·dim). Quantization changes the per-distance cost.
// Constants are calibrated so a Flat scan of 50k×768 lands at ≈15ms, matching the
// engine's measured behaviour. An embedding/query overhead floor is always added.
func EstimateLatencyMs(indexType, quantization string, corpus, dim, topK int) float64 {
	if corpus <= 0 {
		corpus = 10000
	}
	if dim <= 0 {
		dim = 768
	}
	const (
		perFlop   = 4e-7 // ms per corpus·dim distance unit (Flat baseline)
		queryBase = 1.5  // fixed embed/setup overhead in ms
	)
	work := float64(corpus) * float64(dim)

	var scanned float64
	switch indexType {
	case "ivf":
		// nlist ≈ sqrt(corpus); probe ≈ 1/8 of cells, plus scanning the centroids.
		nlist := math.Sqrt(float64(corpus))
		if nlist < 1 {
			nlist = 1
		}
		probeFrac := math.Min(1, 8/nlist) // nprobe≈8 of nlist cells
		scanned = work*probeFrac + nlist*float64(dim)
	case "hnsw":
		// Beam of efSearch≈64 over a small-world graph: ~ef·log2(corpus) distances.
		ef := 64.0
		scanned = ef * math.Log2(float64(corpus)+2) * float64(dim)
	default: // flat
		scanned = work
	}

	cost := scanned * perFlop * quantFactor(quantization)
	// A few extra distance comparisons to assemble the top-k heap.
	cost += float64(topK) * float64(dim) * perFlop
	return queryBase + cost
}

// quantFactor scales per-distance cost: product quantization replaces full
// distances with table lookups (cheaper), scalar adds a decode step (slightly
// dearer than raw but still cache-friendly).
func quantFactor(quantization string) float64 {
	switch quantization {
	case "product":
		return 0.35
	case "scalar":
		return 1.1
	default:
		return 1.0
	}
}
