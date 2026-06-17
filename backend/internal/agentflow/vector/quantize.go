package vector

import "math/rand"

// Quantizer compresses vectors into compact codes and answers approximate
// (asymmetric) distances: the query stays full-precision while the corpus is
// stored as codes. Encode produces a code; DistanceTable precomputes everything
// needed so Distance(code) is a few cheap lookups/adds on the hot path.
type Quantizer interface {
	Train(data [][]float32, rng *rand.Rand)
	Encode(vec []float32) []byte
	CodeBytes() int // bytes per encoded vector
	// PrepareQuery returns an opaque table for one query; Distance uses it.
	PrepareQuery(query []float32) queryTable
	Distance(table queryTable, code []byte) float32
}

// queryTable is precomputed per-query distance data (its concrete shape depends
// on the quantizer).
type queryTable struct {
	scalar  []float32   // SQ: the dequantized-domain query (per-dim), unused for PQ
	product [][]float32 // PQ: table[subspace][centroid] = partial squared distance
	sq      *ScalarQuantizer
}

// --- Scalar quantization (per-dimension uint8) ---

// ScalarQuantizer maps each dimension independently to a uint8 using that
// dimension's observed [min,max] range — 4× smaller than float32 with a small,
// uniform error. The classic, cheapest quantizer.
type ScalarQuantizer struct {
	dim  int
	min  []float32
	step []float32 // (max-min)/255 per dim
}

func NewScalarQuantizer() *ScalarQuantizer { return &ScalarQuantizer{} }

func (q *ScalarQuantizer) Train(data [][]float32, _ *rand.Rand) {
	if len(data) == 0 {
		return
	}
	q.dim = len(data[0])
	q.min = make([]float32, q.dim)
	maxv := make([]float32, q.dim)
	for d := 0; d < q.dim; d++ {
		q.min[d] = data[0][d]
		maxv[d] = data[0][d]
	}
	for _, v := range data {
		for d := 0; d < q.dim; d++ {
			if v[d] < q.min[d] {
				q.min[d] = v[d]
			}
			if v[d] > maxv[d] {
				maxv[d] = v[d]
			}
		}
	}
	q.step = make([]float32, q.dim)
	for d := 0; d < q.dim; d++ {
		r := maxv[d] - q.min[d]
		if r <= 0 {
			r = 1
		}
		q.step[d] = r / 255
	}
}

func (q *ScalarQuantizer) Encode(vec []float32) []byte {
	code := make([]byte, q.dim)
	for d := 0; d < q.dim; d++ {
		x := (vec[d] - q.min[d]) / q.step[d]
		if x < 0 {
			x = 0
		}
		if x > 255 {
			x = 255
		}
		code[d] = byte(x + 0.5)
	}
	return code
}

func (q *ScalarQuantizer) decodeDim(d int, code byte) float32 {
	return q.min[d] + (float32(code)+0.5)*q.step[d]
}

func (q *ScalarQuantizer) CodeBytes() int { return q.dim }

func (q *ScalarQuantizer) PrepareQuery(query []float32) queryTable {
	return queryTable{scalar: query, sq: q}
}

func (q *ScalarQuantizer) Distance(table queryTable, code []byte) float32 {
	var sum float32
	for d := 0; d < q.dim; d++ {
		diff := table.scalar[d] - q.decodeDim(d, code[d])
		sum += diff * diff
	}
	return sum
}

// --- Product quantization (m subspaces × 256 centroids) ---

// ProductQuantizer splits each vector into m contiguous subvectors and replaces
// each with the id (uint8) of the nearest centroid in a per-subspace codebook of
// 256 entries — so a vector becomes m bytes regardless of dimensionality. Query
// distance uses ADC: a per-subspace lookup table summed across the m codes.
type ProductQuantizer struct {
	dim      int
	m        int           // number of subspaces
	dsub     int           // dimensions per subspace
	codebook [][][]float32 // [m][256][dsub]
}

func NewProductQuantizer(m int) *ProductQuantizer { return &ProductQuantizer{m: m} }

func (q *ProductQuantizer) Train(data [][]float32, rng *rand.Rand) {
	if len(data) == 0 {
		return
	}
	q.dim = len(data[0])
	if q.m <= 0 || q.dim%q.m != 0 {
		q.m = pickSubspaces(q.dim)
	}
	q.dsub = q.dim / q.m
	q.codebook = make([][][]float32, q.m)
	for s := 0; s < q.m; s++ {
		sub := make([][]float32, len(data))
		off := s * q.dsub
		for i, v := range data {
			sub[i] = v[off : off+q.dsub]
		}
		centroids, _ := kmeans(sub, 256, 12, rng)
		q.codebook[s] = centroids
	}
}

func (q *ProductQuantizer) Encode(vec []float32) []byte {
	code := make([]byte, q.m)
	for s := 0; s < q.m; s++ {
		off := s * q.dsub
		sv := vec[off : off+q.dsub]
		best, bestD := 0, float32(1e38)
		for c, cent := range q.codebook[s] {
			if d := l2sq(sv, cent); d < bestD {
				bestD, best = d, c
			}
		}
		code[s] = byte(best)
	}
	return code
}

func (q *ProductQuantizer) CodeBytes() int { return q.m }

func (q *ProductQuantizer) PrepareQuery(query []float32) queryTable {
	table := make([][]float32, q.m)
	for s := 0; s < q.m; s++ {
		off := s * q.dsub
		sv := query[off : off+q.dsub]
		row := make([]float32, len(q.codebook[s]))
		for c, cent := range q.codebook[s] {
			row[c] = l2sq(sv, cent)
		}
		table[s] = row
	}
	return queryTable{product: table}
}

func (q *ProductQuantizer) Distance(table queryTable, code []byte) float32 {
	var sum float32
	for s := 0; s < q.m; s++ {
		sum += table.product[s][code[s]]
	}
	return sum
}

// pickSubspaces chooses an m that divides dim, biased toward ~8-dim subspaces (a
// common PQ default), so PQ works for any embedding dimensionality.
func pickSubspaces(dim int) int {
	for _, m := range []int{dim / 8, dim / 4, dim / 16, dim / 2} {
		if m > 0 && dim%m == 0 {
			return m
		}
	}
	return 1
}

// newQuantizer builds the quantizer named by a config string ("scalar"/"product"),
// or nil for "none"/unknown (exact, full-precision distances).
func newQuantizer(name string, dim int) Quantizer {
	switch name {
	case "scalar":
		return NewScalarQuantizer()
	case "product":
		return NewProductQuantizer(pickSubspaces(dim))
	default:
		return nil
	}
}
