package vector

import (
	"math"
	"math/rand"
)

// HNSWIndex is a Hierarchical Navigable Small World graph: a multi-layer
// proximity graph where upper layers are sparse "express lanes" and layer 0 holds
// every node. Search greedily descends the layers then explores layer 0 with a
// beam of width efSearch. It gives near-exact recall at a fraction of a full scan
// and is the default production ANN structure (the engine FAISS/hnswlib/pgvector
// expose). Built from scratch here over full-precision vectors.
type HNSWIndex struct {
	dim       int
	m, m0     int     // max neighbours per node on upper layers / layer 0
	efConstr  int     // beam width while inserting
	efSearch  int     // beam width while querying
	ml        float64 // level-generation factor, 1/ln(M)
	vectors   [][]float32
	ids       []int
	links     [][][]int // links[node][layer] = neighbour node indices
	entry     int       // entry-point node index
	maxLayer  int
	rng       *rand.Rand
	dthreshld int // corpus size below which we just scan (graph overhead not worth it)
}

// NewHNSW builds an empty graph. m≈16 and efSearch≈64 are typical defaults; a
// larger efSearch trades latency for recall (the dial the UI exposes).
func NewHNSW(dim, m, efSearch int, seed int64) *HNSWIndex {
	if m < 4 {
		m = 4
	}
	if efSearch < 1 {
		efSearch = 1
	}
	return &HNSWIndex{
		dim: dim, m: m, m0: 2 * m,
		// A generous construction beam builds a higher-quality graph (better recall);
		// it only costs build time, which is fine at demo scale.
		efConstr: maxInt(efSearch, 200), efSearch: efSearch,
		ml:        1 / math.Log(float64(m)),
		entry:     -1,
		rng:       rand.New(rand.NewSource(seed)),
		dthreshld: 0,
	}
}

func (g *HNSWIndex) Add(id int, vec []float32) {
	g.ids = append(g.ids, id)
	g.vectors = append(g.vectors, append([]float32(nil), vec...))
	g.links = append(g.links, nil)
}

func (g *HNSWIndex) Build() {
	// HNSW is built incrementally; do the insertions here so Add stays O(1) and the
	// whole corpus is present (deterministic order) before linking.
	for node := range g.vectors {
		g.insert(node)
	}
}

func (g *HNSWIndex) randomLayer() int {
	return int(-math.Log(g.rng.Float64()+1e-12) * g.ml)
}

func (g *HNSWIndex) insert(node int) {
	level := g.randomLayer()
	g.links[node] = make([][]int, level+1)

	if g.entry == -1 {
		g.entry = node
		g.maxLayer = level
		return
	}

	q := g.vectors[node]
	ep := g.entry
	// Greedy descent through the layers above the new node's top level.
	for l := g.maxLayer; l > level; l-- {
		ep = g.greedyClosest(q, ep, l)
	}
	// Connect on each layer from min(level,maxLayer) down to 0.
	start := level
	if start > g.maxLayer {
		start = g.maxLayer
	}
	for l := start; l >= 0; l-- {
		candidates := g.searchLayer(q, ep, g.efConstr, l)
		m := g.m
		if l == 0 {
			m = g.m0
		}
		neighbors := g.selectHeuristic(q, candidates, m)
		g.links[node][l] = neighbors
		// Add the back-links and prune over-full neighbours.
		for _, nb := range neighbors {
			g.links[nb][l] = append(g.links[nb][l], node)
			if len(g.links[nb][l]) > m {
				g.links[nb][l] = g.pruneNeighbors(nb, l, m)
			}
		}
		if len(candidates) > 0 {
			ep = candidates[0].node
		}
	}
	if level > g.maxLayer {
		g.maxLayer = level
		g.entry = node
	}
}

// greedyClosest walks to the locally-closest node to q on a single layer (beam
// width 1) starting from ep.
func (g *HNSWIndex) greedyClosest(q []float32, ep, layer int) int {
	best := ep
	bestD := l2sq(q, g.vectors[ep])
	improved := true
	for improved {
		improved = false
		for _, nb := range g.linksAt(best, layer) {
			if d := l2sq(q, g.vectors[nb]); d < bestD {
				bestD, best = d, nb
				improved = true
			}
		}
	}
	return best
}

type cand struct {
	node int
	dist float32
}

// searchLayer runs the beam search on one layer: expand the nearest unvisited
// candidate, keep the ef closest results, stop when the nearest candidate is
// farther than the current worst result. Returns results sorted best-first.
func (g *HNSWIndex) searchLayer(q []float32, ep, ef, layer int) []cand {
	visited := map[int]bool{ep: true}
	d0 := l2sq(q, g.vectors[ep])
	candidates := &candMinHeap{}
	candidates.push(cand{ep, d0})
	results := newResultHeap(ef)
	results.offer(Neighbor{ID: ep, Score: d0})

	for candidates.len() > 0 {
		c := candidates.pop()
		if c.dist > results.worst() && len(results.items) >= ef {
			break
		}
		for _, nb := range g.linksAt(c.node, layer) {
			if visited[nb] {
				continue
			}
			visited[nb] = true
			d := l2sq(q, g.vectors[nb])
			if d < results.worst() || len(results.items) < ef {
				candidates.push(cand{nb, d})
				results.offer(Neighbor{ID: nb, Score: d})
			}
		}
	}
	out := make([]cand, len(results.items))
	for i, r := range results.sorted() {
		out[i] = cand{r.ID, r.Score} // r.ID is a node index here, not a global id
	}
	return out
}

func (g *HNSWIndex) linksAt(node, layer int) []int {
	if layer < len(g.links[node]) {
		return g.links[node][layer]
	}
	return nil
}

// pruneNeighbors keeps m well-distributed neighbours of a node on a layer using
// the same diversity heuristic as insertion.
func (g *HNSWIndex) pruneNeighbors(node, layer, m int) []int {
	q := g.vectors[node]
	nbs := g.links[node][layer]
	cs := make([]cand, len(nbs))
	for i, nb := range nbs {
		cs[i] = cand{nb, l2sq(q, g.vectors[nb])}
	}
	return g.selectHeuristic(q, cs, m)
}

// selectHeuristic is HNSW's neighbour-selection heuristic: it prefers a diverse,
// well-connected set over the m strictly-nearest. A candidate is kept only if it
// is closer to the query than to every already-selected neighbour — this avoids
// clustering all links on one side and is the difference between mediocre (~0.5)
// and high (>0.9) recall. Candidates must be sorted best-first.
func (g *HNSWIndex) selectHeuristic(q []float32, cands []cand, m int) []int {
	// Ensure best-first order (insertion sort; small slices).
	for i := 1; i < len(cands); i++ {
		for j := i; j > 0 && cands[j-1].dist > cands[j].dist; j-- {
			cands[j-1], cands[j] = cands[j], cands[j-1]
		}
	}
	result := make([]int, 0, m)
	for _, c := range cands {
		if len(result) >= m {
			break
		}
		keep := true
		for _, r := range result {
			if l2sq(g.vectors[c.node], g.vectors[r]) < c.dist {
				keep = false
				break
			}
		}
		if keep {
			result = append(result, c.node)
		}
	}
	// If the heuristic was too strict to fill m slots, top up with the nearest
	// remaining candidates so the node isn't under-connected.
	if len(result) < m {
		inResult := make(map[int]bool, len(result))
		for _, r := range result {
			inResult[r] = true
		}
		for _, c := range cands {
			if len(result) >= m {
				break
			}
			if !inResult[c.node] {
				result = append(result, c.node)
				inResult[c.node] = true
			}
		}
	}
	return result
}

func (g *HNSWIndex) Search(query []float32, k int) []Neighbor {
	if g.entry == -1 {
		return nil
	}
	ep := g.entry
	for l := g.maxLayer; l > 0; l-- {
		ep = g.greedyClosest(query, ep, l)
	}
	ef := g.efSearch
	if ef < k {
		ef = k
	}
	found := g.searchLayer(query, ep, ef, 0)
	if len(found) > k {
		found = found[:k]
	}
	out := make([]Neighbor, len(found))
	for i, c := range found {
		out[i] = Neighbor{ID: g.ids[c.node], Score: c.dist} // map node index → global id
	}
	return out
}

func (g *HNSWIndex) MemoryBytes() int {
	mem := len(g.vectors) * g.dim * 4
	for _, perLayer := range g.links {
		for _, l := range perLayer {
			mem += len(l) * 4 // 4 bytes per neighbour index
		}
	}
	return mem
}

func (g *HNSWIndex) Name() string { return "hnsw" }

// candMinHeap is a min-heap of candidates by distance (nearest first) used as the
// search frontier.
type candMinHeap struct{ items []cand }

func (h *candMinHeap) len() int { return len(h.items) }
func (h *candMinHeap) push(c cand) {
	h.items = append(h.items, c)
	i := len(h.items) - 1
	for i > 0 {
		p := (i - 1) / 2
		if h.items[p].dist <= h.items[i].dist {
			break
		}
		h.items[p], h.items[i] = h.items[i], h.items[p]
		i = p
	}
}
func (h *candMinHeap) pop() cand {
	top := h.items[0]
	n := len(h.items) - 1
	h.items[0] = h.items[n]
	h.items = h.items[:n]
	i := 0
	for {
		l, r, smallest := 2*i+1, 2*i+2, i
		if l < n && h.items[l].dist < h.items[smallest].dist {
			smallest = l
		}
		if r < n && h.items[r].dist < h.items[smallest].dist {
			smallest = r
		}
		if smallest == i {
			break
		}
		h.items[i], h.items[smallest] = h.items[smallest], h.items[i]
		i = smallest
	}
	return top
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
