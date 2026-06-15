package simulation

import (
	"math"

	"github.com/scaleforge/scaleforge/internal/catalog"
)

// ChaosScenario describes an injected failure: specific nodes killed, an entire
// region taken offline, and/or a traffic spike applied on top of the profile.
type ChaosScenario struct {
	KilledNodeIDs   []string `json:"killedNodeIds"`
	OutageRegion    string   `json:"outageRegion,omitempty"`
	SpikeMultiplier float64  `json:"spikeMultiplier,omitempty"`
}

type ChaosRequest struct {
	Graph    Graph          `json:"graph" binding:"required"`
	Traffic  TrafficProfile `json:"traffic" binding:"required"`
	Provider string         `json:"provider,omitempty"`
	Scenario ChaosScenario  `json:"scenario"`
}

// Node impact states, used to drive the canvas under an injected failure.
const (
	ImpactDead       = "dead"       // killed or in the downed region
	ImpactOverloaded = "overloaded" // saturated (or failing in a full outage)
	ImpactDegraded   = "degraded"   // over capacity but not the worst
	ImpactHealthy    = "healthy"
)

// NodeImpact is a node's state under the injected failure.
type NodeImpact struct {
	NodeID string `json:"nodeId"`
	Status string `json:"status"`
}

// Spof is a node whose removal alone causes a full outage — a single point of
// failure in the architecture as designed.
type Spof struct {
	NodeID string `json:"nodeId"`
	Label  string `json:"label"`
	Impact string `json:"impact"`
}

// ChaosResult is the outcome of injecting a failure scenario: the healthy
// baseline, the degraded result, an availability verdict, and a
// scenario-independent resilience score plus the architecture's SPOFs.
type ChaosResult struct {
	Baseline        Result       `json:"baseline"`
	Degraded        Result       `json:"degraded"`
	Available       bool         `json:"available"`
	Availability    float64      `json:"availability"`
	ServedRPS       float64      `json:"servedRps"`
	FailedRPS       float64      `json:"failedRps"`
	ResilienceScore int          `json:"resilienceScore"`
	SPOFs           []Spof       `json:"spofs"`
	NodeImpacts     []NodeImpact `json:"nodeImpacts"`
}

// requiredCategories are the tiers a request must traverse to be served.
// Emptying any of them (every node killed) is a full outage — something the
// weakest-link engine can't express on its own. Edge covers LBs/gateways/DNS.
var requiredCategories = map[string]bool{
	catalog.CategoryEdge:     true,
	catalog.CategoryCompute:  true,
	catalog.CategoryDatabase: true,
}

// availability is the served-vs-incoming verdict for one scenario.
type availability struct {
	available    bool
	availability float64
	served       float64
	failed       float64
}

// Chaos injects a failure scenario and reports the healthy baseline, the
// degraded result under the failure (+ traffic spike), an availability verdict,
// and a scenario-independent resilience score with the architecture's single
// points of failure. Compute-only — nothing is persisted, so it works for
// guests just like Simulate/Compare.
func (s *Service) Chaos(req ChaosRequest) ChaosResult {
	defs := s.catalog.Map()

	baseline := s.compute(SimulateRequest{Graph: req.Graph, Traffic: req.Traffic, Provider: req.Provider})
	degraded, avail := s.evaluateScenario(req.Graph, req.Traffic, req.Provider, req.Scenario, defs)
	score, spofs := s.resilience(req.Graph, req.Traffic, req.Provider, defs)

	return ChaosResult{
		Baseline:        baseline,
		Degraded:        degraded,
		Available:       avail.available,
		Availability:    avail.availability,
		ServedRPS:       avail.served,
		FailedRPS:       avail.failed,
		ResilienceScore: score,
		SPOFs:           spofs,
		NodeImpacts:     buildNodeImpacts(req.Graph, req.Scenario, degraded, avail),
	}
}

// evaluateScenario removes the failed nodes, applies the traffic spike, runs the
// engine on the effective graph, then layers an explicit tier-outage check the
// weakest-link engine alone can't express.
func (s *Service) evaluateScenario(graph Graph, traffic TrafficProfile, provider string, sc ChaosScenario, defs map[string]catalog.NodeDefinition) (Result, availability) {
	effGraph := applyScenario(graph, sc)
	effTraffic := spikeTraffic(traffic, sc.SpikeMultiplier)
	degraded := s.compute(SimulateRequest{Graph: effGraph, Traffic: effTraffic, Provider: provider})

	incoming := degraded.IncomingRPS

	// A required tier with zero survivors is a full outage regardless of the
	// remaining nodes' capacity.
	if tierOutage(graph, effGraph, defs) {
		return degraded, availability{available: false, availability: 0, served: 0, failed: incoming}
	}

	avail := availability{available: true, availability: 1, served: incoming}
	if incoming > 0 {
		served := math.Min(incoming, degraded.SystemCapacity)
		avail.served = served
		avail.availability = served / incoming
		avail.failed = incoming - served
	}
	return degraded, avail
}

// resilience scores the architecture (0..100) independent of the requested
// scenario: it kills each critical node in turn and counts those whose loss
// alone causes an outage (the SPOFs). Multi-region earns a small bonus.
func (s *Service) resilience(graph Graph, traffic TrafficProfile, provider string, defs map[string]catalog.NodeDefinition) (int, []Spof) {
	critical := 0
	for _, n := range graph.Nodes {
		if def, ok := defs[n.Type]; ok && requiredCategories[def.Category] {
			critical++
		}
	}

	var spofs []Spof
	for _, n := range graph.Nodes {
		def, ok := defs[n.Type]
		if !ok || !requiredCategories[def.Category] {
			continue
		}
		_, avail := s.evaluateScenario(graph, traffic, provider, ChaosScenario{KilledNodeIDs: []string{n.ID}}, defs)
		if !avail.available {
			spofs = append(spofs, Spof{NodeID: n.ID, Label: n.Label, Impact: "outage"})
		}
	}

	if critical == 0 {
		if len(graph.Nodes) == 0 {
			return 0, spofs
		}
		// No critical tier to fail — nothing single-fails into an outage.
		return 100, spofs
	}

	score := 100.0 * (1 - float64(len(spofs))/float64(critical))
	if regionCount(graph) > 1 {
		score += 10
	}
	score = math.Max(0, math.Min(100, score))
	return int(math.Round(score)), spofs
}

// applyScenario returns the effective graph with killed nodes and any node in
// the downed region removed, along with every edge that touched a removed node.
func applyScenario(graph Graph, sc ChaosScenario) Graph {
	killed := make(map[string]bool, len(sc.KilledNodeIDs))
	for _, id := range sc.KilledNodeIDs {
		killed[id] = true
	}

	nodes := make([]Node, 0, len(graph.Nodes))
	alive := make(map[string]bool, len(graph.Nodes))
	for _, n := range graph.Nodes {
		if killed[n.ID] {
			continue
		}
		if sc.OutageRegion != "" && regionOf(n) == sc.OutageRegion {
			continue
		}
		nodes = append(nodes, n)
		alive[n.ID] = true
	}

	edges := make([]Edge, 0, len(graph.Edges))
	for _, e := range graph.Edges {
		if alive[e.Source] && alive[e.Target] {
			edges = append(edges, e)
		}
	}
	return Graph{Nodes: nodes, Edges: edges}
}

// spikeTraffic multiplies the peak-traffic multiplier; values <= 1 leave the
// profile untouched so the result stays identical to a plain simulation.
func spikeTraffic(traffic TrafficProfile, multiplier float64) TrafficProfile {
	if multiplier <= 1 {
		return traffic
	}
	out := traffic
	base := out.PeakTrafficMultiplier
	if base <= 0 {
		base = 1
	}
	out.PeakTrafficMultiplier = base * multiplier
	return out
}

// tierOutage reports whether a required category present in the baseline has no
// surviving node in the effective graph.
func tierOutage(baseline, effective Graph, defs map[string]catalog.NodeDefinition) bool {
	present := categoriesPresent(baseline, defs)
	surviving := categoriesPresent(effective, defs)
	for category := range requiredCategories {
		if present[category] && !surviving[category] {
			return true
		}
	}
	return false
}

func categoriesPresent(graph Graph, defs map[string]catalog.NodeDefinition) map[string]bool {
	out := make(map[string]bool, len(graph.Nodes))
	for _, n := range graph.Nodes {
		if def, ok := defs[n.Type]; ok {
			out[def.Category] = true
		}
	}
	return out
}

func regionCount(graph Graph) int {
	set := make(map[string]bool, len(graph.Nodes))
	for _, n := range graph.Nodes {
		set[regionOf(n)] = true
	}
	return len(set)
}

// buildNodeImpacts classifies every original node for the canvas: dead for the
// killed/region-downed nodes, then (on a full outage) all survivors as failing,
// otherwise mapped from the degraded engine health.
func buildNodeImpacts(graph Graph, sc ChaosScenario, degraded Result, avail availability) []NodeImpact {
	killed := make(map[string]bool, len(sc.KilledNodeIDs))
	for _, id := range sc.KilledNodeIDs {
		killed[id] = true
	}
	health := make(map[string]string, len(degraded.NodeHealth))
	for _, h := range degraded.NodeHealth {
		health[h.NodeID] = h.Status
	}

	impacts := make([]NodeImpact, 0, len(graph.Nodes))
	for _, n := range graph.Nodes {
		status := ImpactHealthy
		switch {
		case killed[n.ID] || (sc.OutageRegion != "" && regionOf(n) == sc.OutageRegion):
			status = ImpactDead
		case !avail.available:
			// Full outage — surviving nodes are effectively failing too.
			status = ImpactOverloaded
		default:
			switch health[n.ID] {
			case "bottleneck":
				status = ImpactOverloaded
			case "warning":
				status = ImpactDegraded
			}
		}
		impacts = append(impacts, NodeImpact{NodeID: n.ID, Status: status})
	}
	return impacts
}
