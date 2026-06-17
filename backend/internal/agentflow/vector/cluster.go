package vector

import "math/rand"

// kmeans runs Lloyd's algorithm and returns k centroids plus each point's
// assignment. It seeds centroids by sampling distinct points (k-means++ is
// overkill for the demo scale) and is shared by the IVF coarse quantizer and the
// product quantizer's per-subspace codebooks. Deterministic for a given rng.
func kmeans(data [][]float32, k, iters int, rng *rand.Rand) (centroids [][]float32, assign []int) {
	n := len(data)
	if n == 0 || k <= 0 {
		return nil, nil
	}
	if k > n {
		k = n
	}
	dim := len(data[0])

	centroids = make([][]float32, k)
	perm := rng.Perm(n)
	for i := 0; i < k; i++ {
		centroids[i] = append([]float32(nil), data[perm[i]]...)
	}
	assign = make([]int, n)

	for it := 0; it < iters; it++ {
		// Assignment step.
		changed := false
		for i, p := range data {
			best, bestD := 0, float32(1e38)
			for c := 0; c < k; c++ {
				if d := l2sq(p, centroids[c]); d < bestD {
					bestD, best = d, c
				}
			}
			if assign[i] != best {
				assign[i] = best
				changed = true
			}
		}
		// Update step.
		sums := make([][]float32, k)
		counts := make([]int, k)
		for c := range sums {
			sums[c] = make([]float32, dim)
		}
		for i, p := range data {
			c := assign[i]
			counts[c]++
			for d := 0; d < dim; d++ {
				sums[c][d] += p[d]
			}
		}
		for c := 0; c < k; c++ {
			if counts[c] == 0 {
				// Re-seed an empty cluster onto a random point to avoid collapse.
				centroids[c] = append([]float32(nil), data[rng.Intn(n)]...)
				continue
			}
			inv := 1 / float32(counts[c])
			for d := 0; d < dim; d++ {
				centroids[c][d] = sums[c][d] * inv
			}
		}
		if !changed && it > 0 {
			break
		}
	}
	return centroids, assign
}
