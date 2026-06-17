package runtime

import (
	"fmt"
	"hash/fnv"
	"math"
	"strings"

	"github.com/scaleforge/scaleforge/internal/agentflow/vector"
)

// sampleCorpus is a tiny in-memory knowledge base the live dry-run retriever
// searches, so a retriever node actually exercises the pure-Go vector engine
// (vector.Search) end to end rather than returning a canned string.
var sampleCorpus = []string{
	"ScaleForge simulates distributed-system architectures and estimates RPS, latency, and cost.",
	"A Redis cache in front of Postgres absorbs read traffic and lifts system capacity.",
	"Horizontal scaling adds replicas behind a load balancer to raise throughput.",
	"Vector databases power retrieval-augmented generation by finding nearest-neighbour embeddings.",
	"HNSW is a graph index giving near-exact recall at a fraction of an exhaustive scan.",
	"Product quantization compresses vectors to a few bytes, trading some recall for memory.",
	"Rate limiting protects shared LLM quotas from bursty or abusive traffic.",
	"Monte-Carlo simulation reveals p95/p99 tail latency that a single average hides.",
	"An API gateway terminates TLS, authenticates requests, and routes to backends.",
	"Message queues decouple producers from consumers and smooth traffic spikes.",
	"Read replicas scale database reads; the primary still bounds write throughput.",
	"Autoscaling adds capacity under load and removes it when traffic subsides.",
}

const retrieverDim = 64

// vectorRetriever holds a built Flat index over the sample corpus for a chosen
// quantization, reused across retriever nodes in one run.
type vectorRetriever struct {
	idx  vector.Index
	docs []string
}

// newVectorRetriever embeds the sample corpus and builds an index. The index type
// is honoured (flat/ivf/hnsw) so the live run reflects the node's configuration;
// quantization is passed through to the flat path.
func newVectorRetriever(indexType, quantization string) *vectorRetriever {
	var idx vector.Index
	switch indexType {
	case "ivf":
		idx = vector.NewIVF(retrieverDim, 8, 4, quantization, 1)
	case "hnsw":
		idx = vector.NewHNSW(retrieverDim, 8, 32, 1)
	default:
		idx = vector.NewFlat(retrieverDim, quantization, 1)
	}
	for i, d := range sampleCorpus {
		idx.Add(i, hashEmbed(d, retrieverDim))
	}
	idx.Build()
	return &vectorRetriever{idx: idx, docs: sampleCorpus}
}

// retrieve returns the topK most similar corpus snippets to query as a single
// context block.
func (r *vectorRetriever) retrieve(query string, topK int) string {
	if topK <= 0 {
		topK = 3
	}
	hits := r.idx.Search(hashEmbed(query, retrieverDim), topK)
	var b strings.Builder
	for i, h := range hits {
		if h.ID >= 0 && h.ID < len(r.docs) {
			fmt.Fprintf(&b, "[%d] %s\n", i+1, r.docs[h.ID])
		}
	}
	return strings.TrimSpace(b.String())
}

// hashEmbed turns text into a deterministic, L2-normalized bag-of-hashed-tokens
// vector. It isn't a learned embedding, but it places texts that share words near
// each other — enough for the live retriever to return relevant snippets and to
// genuinely exercise the ANN engine.
func hashEmbed(text string, dim int) []float32 {
	v := make([]float32, dim)
	for _, tok := range strings.Fields(strings.ToLower(text)) {
		tok = strings.Trim(tok, ".,;:!?()[]\"'")
		if tok == "" {
			continue
		}
		h := fnv.New32a()
		_, _ = h.Write([]byte(tok))
		sum := h.Sum32()
		v[sum%uint32(dim)] += 1
		// A second hashed slot reduces collisions and enriches the signal.
		v[(sum/uint32(dim))%uint32(dim)] += 0.5
	}
	var norm float32
	for _, x := range v {
		norm += x * x
	}
	if norm > 0 {
		inv := float32(1 / math.Sqrt(float64(norm)))
		for i := range v {
			v[i] *= inv
		}
	}
	return v
}
