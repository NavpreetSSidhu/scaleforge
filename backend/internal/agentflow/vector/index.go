// Package vector is a small, dependency-free approximate-nearest-neighbour (ANN)
// engine written from scratch in Go — the "FAISS in Go" showcase behind Agent
// Studio's retriever nodes. It implements three index families (exact Flat, IVF
// with a k-means coarse quantizer, and a hierarchical HNSW graph) plus scalar and
// product quantization, and a benchmark that measures the real recall ↔ latency ↔
// memory trade-off so the UI shows genuine numbers, not a curated table.
//
// All distances are squared Euclidean (L2²): smaller is closer. Squaring avoids
// a sqrt on the hot path and preserves ordering.
package vector

import "math"

// Neighbor is one search result: a corpus id and its distance to the query.
type Neighbor struct {
	ID    int     `json:"id"`
	Score float32 `json:"score"` // squared-L2 distance; lower is closer
}

// Index is the common contract every index family implements.
type Index interface {
	// Add registers a vector under an id (call before Build).
	Add(id int, vec []float32)
	// Build finalizes the index (trains quantizers, clusters, links graphs).
	Build()
	// Search returns the k nearest neighbours to query, best-first.
	Search(query []float32, k int) []Neighbor
	// MemoryBytes is the approximate resident size of the index payload.
	MemoryBytes() int
	// Name is a short human label, e.g. "hnsw" or "ivf+sq".
	Name() string
}

// l2sq returns the squared Euclidean distance between two equal-length vectors.
func l2sq(a, b []float32) float32 {
	var sum float32
	for i := range a {
		d := a[i] - b[i]
		sum += d * d
	}
	return sum
}

// resultHeap is a fixed-capacity max-heap of the k best (smallest-distance)
// neighbours seen so far: the worst kept result sits at the root so we can reject
// or evict in O(log k). Implemented inline (no container/heap interface{} boxing)
// because it's on the hot path of every search.
type resultHeap struct {
	items []Neighbor
	cap   int
}

func newResultHeap(k int) *resultHeap {
	return &resultHeap{items: make([]Neighbor, 0, k), cap: k}
}

func (h *resultHeap) worst() float32 {
	if len(h.items) == 0 {
		return float32(math.Inf(1))
	}
	return h.items[0].Score
}

// offer adds n if it's better than the current worst (or the heap isn't full).
func (h *resultHeap) offer(n Neighbor) {
	if len(h.items) < h.cap {
		h.items = append(h.items, n)
		h.up(len(h.items) - 1)
		return
	}
	if n.Score < h.items[0].Score {
		h.items[0] = n
		h.down(0)
	}
}

func (h *resultHeap) up(i int) {
	for i > 0 {
		p := (i - 1) / 2
		if h.items[p].Score >= h.items[i].Score {
			break
		}
		h.items[p], h.items[i] = h.items[i], h.items[p]
		i = p
	}
}

func (h *resultHeap) down(i int) {
	n := len(h.items)
	for {
		l, r, largest := 2*i+1, 2*i+2, i
		if l < n && h.items[l].Score > h.items[largest].Score {
			largest = l
		}
		if r < n && h.items[r].Score > h.items[largest].Score {
			largest = r
		}
		if largest == i {
			break
		}
		h.items[i], h.items[largest] = h.items[largest], h.items[i]
		i = largest
	}
}

// sorted drains the heap into a best-first (ascending distance) slice.
func (h *resultHeap) sorted() []Neighbor {
	out := make([]Neighbor, len(h.items))
	copy(out, h.items)
	// simple insertion sort — k is small (typically ≤ 100)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1].Score > out[j].Score; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}
