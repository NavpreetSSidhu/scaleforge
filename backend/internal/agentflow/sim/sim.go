// Package sim is the Monte-Carlo simulator for agentic workflows. LLM latency is
// heavy-tailed and step costs compound, so a single deterministic number is
// misleading — instead we run many randomized trials concurrently and report the
// distribution (p50/p95/p99) of end-to-end latency and cost, plus per-node
// hotspots and the critical path.
//
// Concurrency is the point: trials are embarrassingly parallel, so we fan them
// out across GOMAXPROCS workers via errgroup, each with its own rand source and
// disjoint output slices (no locks on the hot path), then merge. This is the
// "showcase Go" engine behind the Agent Studio sim panel.
package sim

import (
	"math/rand"
	"runtime"
	"sort"

	"golang.org/x/sync/errgroup"

	"github.com/scaleforge/scaleforge/internal/agentflow"
)

// Options tunes a run. Trials and Seed are clamped/defaulted by Simulate.
// RetrieverLatencyMs optionally overrides a retriever node's base latency with a
// real measured value from the vector engine (wired in Phase 2); nil keeps the
// catalog estimate.
type Options struct {
	Trials             int                `json:"trials"`
	Seed               int64              `json:"seed"`
	RetrieverLatencyMs map[string]float64 `json:"-"`
}

// Percentiles summarizes a sample distribution.
type Percentiles struct {
	P50  float64 `json:"p50"`
	P95  float64 `json:"p95"`
	P99  float64 `json:"p99"`
	Mean float64 `json:"mean"`
}

// NodeStat is one node's contribution across all trials.
type NodeStat struct {
	NodeID        string  `json:"nodeId"`
	Type          string  `json:"type"`
	Label         string  `json:"label"`
	MeanLatencyMs float64 `json:"meanLatencyMs"`
	MeanTokensIn  float64 `json:"meanTokensIn"`
	MeanTokensOut float64 `json:"meanTokensOut"`
	MeanCostUsd   float64 `json:"meanCostUsd"`
	// Share is this node's mean latency as a fraction of the summed per-node mean
	// latency — a hotspot bar (which step dominates the wall-clock).
	Share float64 `json:"share"`
}

// Result is the simulation outcome.
type Result struct {
	Trials        int         `json:"trials"`
	LatencyMs     Percentiles `json:"latencyMs"`
	CostUsd       Percentiles `json:"costUsd"`
	MeanTokensIn  float64     `json:"meanTokensIn"`
	MeanTokensOut float64     `json:"meanTokensOut"`
	PerNode       []NodeStat  `json:"perNode"`
	// CriticalPath is the longest-latency node path (by label) on the mean pass.
	CriticalPath []string `json:"criticalPath"`
	// Bottleneck is the id of the highest mean-latency node.
	Bottleneck string `json:"bottleneck"`
}

// nodeModel is a node flattened for the hot loop (no map lookups per trial).
type nodeModel struct {
	id        string
	typ       string
	label     string
	baseLat   float64
	jitter    float64
	tokIn     int
	tokOut    int
	costPer1k float64
	fixedCost float64
	maxIter   int
	isRouter  bool
	isLoop    bool
	resets    bool // aggregator/output reset the loop multiplier for successors
	succ      []int
}

type graphModel struct {
	nodes   []nodeModel
	topo    []int  // topological order of node indices
	hasPred []bool // true if the node has at least one incoming edge (not a root)
}

func buildModel(cat *agentflow.Catalog, g agentflow.Graph, opt Options) graphModel {
	idx := make(map[string]int, len(g.Nodes))
	for i, n := range g.Nodes {
		idx[n.ID] = i
	}
	defs := cat.Map()
	nodes := make([]nodeModel, len(g.Nodes))
	for i, n := range g.Nodes {
		k := defs[n.Type] // validated upstream; zero value is harmless
		base := k.BaseLatencyMs
		if n.Type == agentflow.TypeRetriever {
			if v, ok := opt.RetrieverLatencyMs[n.ID]; ok {
				base = v
			}
		}
		nodes[i] = nodeModel{
			id: n.ID, typ: n.Type, label: labelOr(n.Label, k.Label),
			baseLat: base, jitter: k.LatencyJitter,
			tokIn: k.MeanTokensIn, tokOut: k.MeanTokensOut,
			costPer1k: k.CostPer1kTokensUsd, fixedCost: k.FixedCostUsd,
			maxIter:  maxIterOr(n.Config.MaxIterations, k.DefaultConfig.MaxIterations),
			isRouter: n.Type == agentflow.TypeRouter,
			isLoop:   n.Type == agentflow.TypeLoop,
			resets:   n.Type == agentflow.TypeAggregator || n.Type == agentflow.TypeOutput,
		}
	}
	indeg := make([]int, len(g.Nodes))
	hasPred := make([]bool, len(g.Nodes))
	for _, e := range g.Edges {
		s, t := idx[e.Source], idx[e.Target]
		nodes[s].succ = append(nodes[s].succ, t)
		indeg[t]++
		hasPred[t] = true
	}
	return graphModel{nodes: nodes, topo: topoSort(nodes, indeg), hasPred: hasPred}
}

// topoSort returns node indices in dependency order via Kahn's algorithm. The
// graph is validated acyclic; any leftover nodes (defensive) are appended.
func topoSort(nodes []nodeModel, indeg []int) []int {
	queue := make([]int, 0, len(nodes))
	deg := append([]int(nil), indeg...)
	for i := range nodes {
		if deg[i] == 0 {
			queue = append(queue, i)
		}
	}
	order := make([]int, 0, len(nodes))
	for len(queue) > 0 {
		u := queue[0]
		queue = queue[1:]
		order = append(order, u)
		for _, v := range nodes[u].succ {
			deg[v]--
			if deg[v] == 0 {
				queue = append(queue, v)
			}
		}
	}
	for i := range nodes {
		if deg[i] > 0 {
			order = append(order, i)
		}
	}
	return order
}

// scratch holds the per-trial reusable buffers so workers don't allocate inside
// the trial loop.
type scratch struct {
	executed []bool
	mult     []float64
	dist     []float64 // longest-path latency ending at node, this trial
	inDist   []float64 // best predecessor dist flowing into node
}

func newScratch(n int) *scratch {
	return &scratch{
		executed: make([]bool, n),
		mult:     make([]float64, n),
		dist:     make([]float64, n),
		inDist:   make([]float64, n),
	}
}

// trialAccum is a worker's running per-node totals, merged after the fan-out.
type trialAccum struct {
	sumLat  []float64
	sumIn   []float64
	sumOut  []float64
	sumCost []float64
}

func newAccum(n int) *trialAccum {
	return &trialAccum{
		sumLat:  make([]float64, n),
		sumIn:   make([]float64, n),
		sumOut:  make([]float64, n),
		sumCost: make([]float64, n),
	}
}

// runTrial simulates one execution: it picks router branches, propagates loop
// multipliers, computes the critical-path latency, and accumulates cost/tokens
// over every executed node. Returns end-to-end latency and total cost for this
// trial and updates the worker accumulator.
func runTrial(gm graphModel, sc *scratch, acc *trialAccum, rng *rand.Rand) (latency, cost float64) {
	nodes := gm.nodes
	for i := range nodes {
		sc.executed[i] = false
		sc.mult[i] = 0
		sc.dist[i] = 0
		sc.inDist[i] = 0
	}
	// Seed roots (no incoming edge) as executed with multiplier 1; everything else
	// becomes executed only when an executed predecessor selects it (routers prune).
	for i := range nodes {
		if !gm.hasPred[i] {
			sc.executed[i] = true
			sc.mult[i] = 1
		}
	}

	// Single pass in topological order: by the time we reach u, all its executed
	// predecessors have finalized mult[u] and inDist[u]. We sample u's latency
	// exactly once, then relax into the successors it activates.
	for _, u := range gm.topo {
		if !sc.executed[u] {
			continue
		}
		n := nodes[u]
		applied := sampleLatency(n.baseLat, n.jitter, rng) * sc.mult[u]
		sc.dist[u] = sc.inDist[u] + applied
		if sc.dist[u] > latency {
			latency = sc.dist[u]
		}

		// Cost + tokens for this node, scaled by its iteration multiplier.
		tin := float64(sampleTokens(n.tokIn, rng)) * sc.mult[u]
		tout := float64(sampleTokens(n.tokOut, rng)) * sc.mult[u]
		nodeCost := (tin+tout)/1000*n.costPer1k + n.fixedCost*sc.mult[u]
		acc.sumLat[u] += applied
		acc.sumIn[u] += tin
		acc.sumOut[u] += tout
		acc.sumCost[u] += nodeCost
		cost += nodeCost

		// Multiplier handed to successors: loops amplify, convergence/exit resets.
		outM := sc.mult[u]
		switch {
		case n.resets:
			outM = 1
		case n.isLoop:
			outM *= float64(n.maxIter)
		}

		succ := n.succ
		if n.isRouter && len(succ) > 1 {
			succ = succ[rng.Intn(len(succ)):][:1] // a router takes exactly one branch
		}
		for _, v := range succ {
			sc.executed[v] = true
			if sc.mult[v] < outM {
				sc.mult[v] = outM
			}
			if sc.dist[u] > sc.inDist[v] {
				sc.inDist[v] = sc.dist[u]
			}
		}
	}
	return latency, cost
}

// Simulate runs the Monte-Carlo simulation and returns the aggregated result.
func Simulate(cat *agentflow.Catalog, g agentflow.Graph, opt Options) Result {
	trials := opt.Trials
	if trials <= 0 {
		trials = 2000
	}
	if trials > 50000 {
		trials = 50000
	}
	seed := opt.Seed
	if seed == 0 {
		seed = 1
	}

	gm := buildModel(cat, g, opt)
	n := len(gm.nodes)
	if n == 0 {
		return Result{Trials: 0}
	}

	latencySamples := make([]float64, trials)
	costSamples := make([]float64, trials)

	workers := runtime.GOMAXPROCS(0)
	if workers > trials {
		workers = trials
	}
	if workers < 1 {
		workers = 1
	}
	accums := make([]*trialAccum, workers)

	var g0 errgroup.Group
	chunk := (trials + workers - 1) / workers
	for w := 0; w < workers; w++ {
		w := w
		start := w * chunk
		end := start + chunk
		if end > trials {
			end = trials
		}
		accums[w] = newAccum(n)
		if start >= end {
			continue
		}
		g0.Go(func() error {
			rng := rand.New(rand.NewSource(seed + int64(w)*1_000_003))
			sc := newScratch(n)
			acc := accums[w]
			for t := start; t < end; t++ {
				lat, cost := runTrial(gm, sc, acc, rng)
				latencySamples[t] = lat
				costSamples[t] = cost
			}
			return nil
		})
	}
	_ = g0.Wait() // trials never error; errgroup is used for the structured fan-out

	// Merge per-node accumulators.
	sumLat := make([]float64, n)
	sumIn := make([]float64, n)
	sumOut := make([]float64, n)
	sumCost := make([]float64, n)
	for _, a := range accums {
		for i := 0; i < n; i++ {
			sumLat[i] += a.sumLat[i]
			sumIn[i] += a.sumIn[i]
			sumOut[i] += a.sumOut[i]
			sumCost[i] += a.sumCost[i]
		}
	}

	sort.Float64s(latencySamples)
	sort.Float64s(costSamples)

	ft := float64(trials)
	var totalMeanLat, meanIn, meanOut float64
	for i := 0; i < n; i++ {
		totalMeanLat += sumLat[i] / ft
		meanIn += sumIn[i] / ft
		meanOut += sumOut[i] / ft
	}

	perNode := make([]NodeStat, n)
	var bottleneck string
	var maxMean float64
	for i := 0; i < n; i++ {
		ml := sumLat[i] / ft
		share := 0.0
		if totalMeanLat > 0 {
			share = ml / totalMeanLat
		}
		perNode[i] = NodeStat{
			NodeID: gm.nodes[i].id, Type: gm.nodes[i].typ, Label: gm.nodes[i].label,
			MeanLatencyMs: ml, MeanTokensIn: sumIn[i] / ft, MeanTokensOut: sumOut[i] / ft,
			MeanCostUsd: sumCost[i] / ft, Share: share,
		}
		if ml > maxMean {
			maxMean = ml
			bottleneck = gm.nodes[i].id
		}
	}

	return Result{
		Trials:        trials,
		LatencyMs:     summarize(latencySamples),
		CostUsd:       summarize(costSamples),
		MeanTokensIn:  meanIn,
		MeanTokensOut: meanOut,
		PerNode:       perNode,
		CriticalPath:  criticalPath(gm),
		Bottleneck:    bottleneck,
	}
}

// criticalPath returns the longest-latency node path (by label) using mean
// latencies and first-branch routing — a representative, deterministic trace for
// the UI to highlight.
func criticalPath(gm graphModel) []string {
	n := len(gm.nodes)
	dist := make([]float64, n)
	prev := make([]int, n)
	executed := make([]bool, n)
	mult := make([]float64, n)
	for i := range prev {
		prev[i] = -1
	}
	hasPred := make([]bool, n)
	for _, u := range gm.topo {
		for _, v := range gm.nodes[u].succ {
			hasPred[v] = true
		}
	}
	for i := range gm.nodes {
		if !hasPred[i] {
			executed[i] = true
			mult[i] = 1
			dist[i] = gm.nodes[i].baseLat
		}
	}
	for _, u := range gm.topo {
		if !executed[u] {
			continue
		}
		nd := gm.nodes[u]
		outM := mult[u]
		switch {
		case nd.resets:
			outM = 1
		case nd.isLoop:
			outM *= float64(nd.maxIter)
		}
		succ := nd.succ
		if nd.isRouter && len(succ) > 1 {
			succ = succ[:1]
		}
		for _, v := range succ {
			executed[v] = true
			if mult[v] < outM {
				mult[v] = outM
			}
			cand := dist[u] + gm.nodes[v].baseLat*outM
			if cand > dist[v] {
				dist[v] = cand
				prev[v] = u
			}
		}
	}
	end := -1
	var best float64
	for i := 0; i < n; i++ {
		if executed[i] && dist[i] >= best {
			best = dist[i]
			end = i
		}
	}
	var path []string
	for v := end; v >= 0; v = prev[v] {
		path = append([]string{gm.nodes[v].label}, path...)
	}
	return path
}

func labelOr(label, fallback string) string {
	if label != "" {
		return label
	}
	return fallback
}

func maxIterOr(v, fallback int) int {
	if v > 0 {
		return v
	}
	if fallback > 0 {
		return fallback
	}
	return 1
}
