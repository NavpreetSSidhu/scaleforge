package vector

import (
	"math/rand"
	"sort"
)

// IVFIndex is an inverted-file index. A k-means coarse quantizer partitions the
// space into nlist cells; each vector lives in its nearest cell. A search only
// scans the nprobe cells nearest the query — so it touches ≈ nprobe/nlist of the
// corpus. nprobe is the recall ⇄ speed dial: nprobe=nlist degenerates to exact,
// nprobe=1 is fastest and lossiest. Optionally pairs with a quantizer to also cut
// memory (IVF-ADC).
type IVFIndex struct {
	dim, nlist, nprobe int
	centroids          [][]float32
	members            [][]int // positions assigned to each cell
	ids                []int   // global id per position
	raw                [][]float32
	codes              [][]byte
	quant              Quantizer
	qname              string
	rng                *rand.Rand
}

// NewIVF builds an IVF index. nlist cells, nprobe probed at query time.
func NewIVF(dim, nlist, nprobe int, quantization string, seed int64) *IVFIndex {
	if nlist < 1 {
		nlist = 1
	}
	if nprobe < 1 {
		nprobe = 1
	}
	if nprobe > nlist {
		nprobe = nlist
	}
	return &IVFIndex{
		dim: dim, nlist: nlist, nprobe: nprobe,
		quant: newQuantizer(quantization, dim), qname: quantization,
		rng: rand.New(rand.NewSource(seed)),
	}
}

func (x *IVFIndex) Add(id int, vec []float32) {
	x.ids = append(x.ids, id)
	x.raw = append(x.raw, append([]float32(nil), vec...))
}

func (x *IVFIndex) Build() {
	if len(x.raw) == 0 {
		return
	}
	if x.nlist > len(x.raw) {
		x.nlist = len(x.raw)
	}
	if x.nprobe > x.nlist {
		x.nprobe = x.nlist
	}
	var assign []int
	x.centroids, assign = kmeans(x.raw, x.nlist, 15, x.rng)
	x.members = make([][]int, len(x.centroids))
	for pos, cell := range assign {
		x.members[cell] = append(x.members[cell], pos)
	}
	if x.quant != nil {
		x.quant.Train(x.raw, x.rng)
		x.codes = make([][]byte, len(x.raw))
		for i, v := range x.raw {
			x.codes[i] = x.quant.Encode(v)
		}
		x.raw = nil
	}
}

func (x *IVFIndex) Search(query []float32, k int) []Neighbor {
	// Rank cells by centroid distance, probe the nearest nprobe.
	type cell struct {
		id   int
		dist float32
	}
	cells := make([]cell, len(x.centroids))
	for i, c := range x.centroids {
		cells[i] = cell{i, l2sq(query, c)}
	}
	sort.Slice(cells, func(i, j int) bool { return cells[i].dist < cells[j].dist })

	h := newResultHeap(k)
	var table queryTable
	if x.quant != nil {
		table = x.quant.PrepareQuery(query)
	}
	probe := x.nprobe
	if probe > len(cells) {
		probe = len(cells)
	}
	for p := 0; p < probe; p++ {
		for _, pos := range x.members[cells[p].id] {
			var d float32
			if x.quant != nil {
				d = x.quant.Distance(table, x.codes[pos])
			} else {
				d = l2sq(query, x.raw[pos])
			}
			h.offer(Neighbor{ID: x.ids[pos], Score: d})
		}
	}
	return h.sorted()
}

func (x *IVFIndex) MemoryBytes() int {
	mem := len(x.centroids) * x.dim * 4
	if x.quant != nil {
		mem += len(x.codes) * x.quant.CodeBytes()
	} else {
		mem += len(x.raw) * x.dim * 4
	}
	return mem
}

func (x *IVFIndex) Name() string { return indexName("ivf", x.qname) }
