package vector

import "math/rand"

// FlatIndex is exhaustive search. With no quantizer it computes exact L2 over the
// raw vectors — the ground truth every other index's recall is measured against.
// With a quantizer it scans compact codes instead (asymmetric distance), trading
// a little recall for ~4–48× less memory: the clearest demonstration of the
// quantization trade-off.
type FlatIndex struct {
	dim   int
	ids   []int
	raw   [][]float32
	codes [][]byte
	quant Quantizer
	qname string
	rng   *rand.Rand
}

// NewFlat builds an exhaustive index. quantization is "none", "scalar", or
// "product".
func NewFlat(dim int, quantization string, seed int64) *FlatIndex {
	return &FlatIndex{
		dim:   dim,
		quant: newQuantizer(quantization, dim),
		qname: quantization,
		rng:   rand.New(rand.NewSource(seed)),
	}
}

func (f *FlatIndex) Add(id int, vec []float32) {
	f.ids = append(f.ids, id)
	f.raw = append(f.raw, append([]float32(nil), vec...))
}

func (f *FlatIndex) Build() {
	if f.quant == nil {
		return
	}
	f.quant.Train(f.raw, f.rng)
	f.codes = make([][]byte, len(f.raw))
	for i, v := range f.raw {
		f.codes[i] = f.quant.Encode(v)
	}
	f.raw = nil // codes are the resident representation now — that's the memory win
}

func (f *FlatIndex) Search(query []float32, k int) []Neighbor {
	h := newResultHeap(k)
	if f.quant == nil {
		for i, v := range f.raw {
			h.offer(Neighbor{ID: f.ids[i], Score: l2sq(query, v)})
		}
		return h.sorted()
	}
	table := f.quant.PrepareQuery(query)
	for i, code := range f.codes {
		h.offer(Neighbor{ID: f.ids[i], Score: f.quant.Distance(table, code)})
	}
	return h.sorted()
}

func (f *FlatIndex) MemoryBytes() int {
	if f.quant == nil {
		return len(f.raw) * f.dim * 4
	}
	// codes + a rough codebook/parameter overhead constant.
	return len(f.codes)*f.quant.CodeBytes() + f.dim*256*4
}

func (f *FlatIndex) Name() string { return indexName("flat", f.qname) }

// indexName joins an index family with its quantization suffix for display.
func indexName(family, quant string) string {
	switch quant {
	case "scalar":
		return family + "+sq"
	case "product":
		return family + "+pq"
	default:
		return family
	}
}
