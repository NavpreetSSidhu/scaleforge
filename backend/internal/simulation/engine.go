package simulation

import (
	"fmt"
	"math"
	"sort"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/runtime"
)

// runtimeCatalog holds the curated language/runtime performance coefficients.
// It is static curated data (like the inter-region latency constant), so a
// package-level instance is sufficient; factors only apply to compute nodes and
// Go == 1.0, so an unset runtime leaves results identical to before the feature.
var runtimeCatalog = runtime.NewCatalog()

// CalculateIncomingRPS derives requests per second from traffic profile.
// Formula: (concurrentUsers * requestsPerUserMin / 60) * peakTrafficMultiplier
func CalculateIncomingRPS(traffic TrafficProfile) float64 {
	if traffic.ConcurrentUsers <= 0 || traffic.RequestsPerUserMin <= 0 {
		return 0
	}
	multiplier := traffic.PeakTrafficMultiplier
	if multiplier <= 0 {
		multiplier = 1.0
	}
	return float64(traffic.ConcurrentUsers) * traffic.RequestsPerUserMin / 60.0 * multiplier
}

type nodeCapacity struct {
	node     Node
	capacity float64
}

func orderedNodes(graph Graph) []Node {
	if len(graph.Nodes) == 0 {
		return nil
	}

	nodeMap := make(map[string]Node, len(graph.Nodes))
	inDegree := make(map[string]int, len(graph.Nodes))
	adjacency := make(map[string][]string, len(graph.Nodes))

	for _, node := range graph.Nodes {
		nodeMap[node.ID] = node
		inDegree[node.ID] = 0
	}

	for _, edge := range graph.Edges {
		if _, ok := nodeMap[edge.Source]; !ok {
			continue
		}
		if _, ok := nodeMap[edge.Target]; !ok {
			continue
		}
		adjacency[edge.Source] = append(adjacency[edge.Source], edge.Target)
		inDegree[edge.Target]++
	}

	var roots []string
	for id := range nodeMap {
		if inDegree[id] == 0 {
			roots = append(roots, id)
		}
	}
	sort.Strings(roots)

	var ordered []Node
	visited := make(map[string]bool)

	var walk func(id string)
	walk = func(id string) {
		if visited[id] {
			return
		}
		visited[id] = true
		ordered = append(ordered, nodeMap[id])
		targets := adjacency[id]
		sort.Strings(targets)
		for _, target := range targets {
			walk(target)
		}
	}

	for _, root := range roots {
		walk(root)
	}

	for id := range nodeMap {
		if !visited[id] {
			walk(id)
		}
	}

	return ordered
}

func nodeCapacityFor(node Node, defs map[string]catalog.NodeDefinition) float64 {
	def, ok := defs[node.Type]
	if !ok {
		return 1000
	}

	replicas := node.Config.Replicas
	if replicas <= 0 {
		replicas = 1
	}

	cpuMultiplier := 1.0
	if node.Config.CPU > 0 {
		cpuMultiplier = float64(node.Config.CPU) / 2.0
	}

	capacity := def.PerInstanceCapacity * float64(replicas) * cpuMultiplier

	// Compute components run user code, so the language/runtime changes how much
	// throughput a core delivers. Managed services (DBs, caches, edge) are fixed.
	if def.Category == catalog.CategoryCompute {
		capacity *= runtimeCatalog.OrDefault(node.Config.Runtime).ThroughputFactor
	}

	return capacity
}

// interRegionLatencyMs is the round-trip penalty added for each edge that
// crosses a region boundary — the cost of leaving the local datacenter.
const interRegionLatencyMs = 25.0

func regionOf(node Node) string {
	if node.Config.Region == "" {
		return "us-east-1"
	}
	return node.Config.Region
}

// crossRegionEdges counts edges whose endpoints live in different regions.
func crossRegionEdges(graph Graph) int {
	region := make(map[string]string, len(graph.Nodes))
	for _, n := range graph.Nodes {
		region[n.ID] = regionOf(n)
	}
	count := 0
	for _, e := range graph.Edges {
		rs, ok1 := region[e.Source]
		rt, ok2 := region[e.Target]
		if ok1 && ok2 && rs != rt {
			count++
		}
	}
	return count
}

func calculateLatency(graph Graph, defs map[string]catalog.NodeDefinition) float64 {
	nodes := orderedNodes(graph)
	var total float64
	for _, node := range nodes {
		if def, ok := defs[node.Type]; ok {
			latency := def.BaseLatencyMs
			// Runtime affects how fast user code on compute nodes responds.
			if def.Category == catalog.CategoryCompute {
				latency *= runtimeCatalog.OrDefault(node.Config.Runtime).LatencyFactor
			}
			total += latency
		}
	}
	// Each cross-region hop on the path adds inter-region round-trip latency.
	total += float64(crossRegionEdges(graph)) * interRegionLatencyMs
	return total
}

func calculateCapacities(graph Graph, defs map[string]catalog.NodeDefinition) ([]nodeCapacity, float64) {
	nodes := orderedNodes(graph)
	capacities := make([]nodeCapacity, 0, len(nodes))
	minCapacity := math.MaxFloat64

	for _, node := range nodes {
		cap := nodeCapacityFor(node, defs)
		capacities = append(capacities, nodeCapacity{node: node, capacity: cap})
		if cap < minCapacity {
			minCapacity = cap
		}
	}

	if len(capacities) == 0 {
		return capacities, 0
	}

	return capacities, minCapacity
}

func detectBottleneck(capacities []nodeCapacity, incomingRPS float64) *Bottleneck {
	if len(capacities) == 0 {
		return nil
	}

	lowest := capacities[0]
	for _, c := range capacities[1:] {
		if c.capacity < lowest.capacity {
			lowest = c
		}
	}

	return &Bottleneck{
		NodeID:   lowest.node.ID,
		NodeType: lowest.node.Type,
		Label:    lowest.node.Label,
		Capacity: lowest.capacity,
		Incoming: incomingRPS,
	}
}

func buildNodeHealth(capacities []nodeCapacity, bottleneck *Bottleneck, incomingRPS float64) []NodeHealth {
	health := make([]NodeHealth, 0, len(capacities))
	for _, c := range capacities {
		status := "healthy"
		if bottleneck != nil && c.node.ID == bottleneck.NodeID && incomingRPS > c.capacity {
			status = "bottleneck"
		} else if incomingRPS > c.capacity {
			status = "warning"
		}

		health = append(health, NodeHealth{
			NodeID:   c.node.ID,
			NodeType: c.node.Type,
			Label:    c.node.Label,
			Capacity: c.capacity,
			Status:   status,
		})
	}
	return health
}

// overProvisionFactor is how far a component's capacity must exceed the incoming
// load before we flag it as wasted headroom worth trimming for cost.
const overProvisionFactor = 8.0

// trimmableCategory reports whether a component is one you'd realistically
// downsize or remove replicas from to save money. Caches, edges, messaging and
// observability have inherently huge or fixed capacity, so flagging them as
// "over-provisioned" would just be noise.
func trimmableCategory(category string) bool {
	return category == catalog.CategoryCompute || category == catalog.CategoryDatabase
}

// mostOverProvisioned returns the non-bottleneck compute/database node whose
// capacity most dwarfs the incoming load, or nil when nothing is meaningfully
// over-built. The result responds to the traffic profile, so lowering the load
// surfaces components to trim and raising it makes them earn their keep.
func mostOverProvisioned(capacities []nodeCapacity, defs map[string]catalog.NodeDefinition, bottleneck *Bottleneck, incomingRPS float64) *nodeCapacity {
	if incomingRPS <= 0 {
		return nil
	}
	var worst *nodeCapacity
	for i := range capacities {
		c := capacities[i]
		if bottleneck != nil && c.node.ID == bottleneck.NodeID {
			continue
		}
		if !trimmableCategory(defs[c.node.Type].Category) {
			continue
		}
		if c.capacity < incomingRPS*overProvisionFactor {
			continue
		}
		if worst == nil || c.capacity > worst.capacity {
			worst = &capacities[i]
		}
	}
	return worst
}

func generateRecommendations(graph Graph, defs map[string]catalog.NodeDefinition, capacities []nodeCapacity, bottleneck *Bottleneck, incomingRPS float64, systemCapacity float64) []string {
	var recs []string

	if bottleneck != nil && incomingRPS > systemCapacity {
		recs = append(recs, "Increase capacity for "+bottleneck.Label+" or add read replicas")
	}

	categoryOf := func(node Node) string {
		return defs[node.Type].Category
	}

	hasCache := false
	hasDB := false
	dbUnderReplicated := false
	for _, node := range graph.Nodes {
		switch categoryOf(node) {
		case catalog.CategoryCache:
			hasCache = true
		case catalog.CategoryDatabase:
			hasDB = true
			if node.Config.Replicas <= 1 {
				dbUnderReplicated = true
			}
		}
	}

	if hasDB && !hasCache {
		recs = append(recs, "Add a Redis cache to reduce database load")
	}

	if hasDB && dbUnderReplicated {
		recs = append(recs, "Add read replicas to scale database reads")
	}

	for _, node := range graph.Nodes {
		if categoryOf(node) == catalog.CategoryCompute && node.Config.Replicas <= 1 && !node.Config.Autoscaling {
			recs = append(recs, "Enable autoscaling or add replicas for "+node.Label)
			break
		}
	}

	if crossings := crossRegionEdges(graph); crossings > 0 {
		recs = append(recs, fmt.Sprintf(
			"%d cross-region hop(s) add ~%.0fms each — co-locate chatty services to cut latency",
			crossings, interRegionLatencyMs,
		))
	}

	// Spare-headroom hint: when nothing is saturated, point out the component
	// most over-built for the current load so it can be downsized or removed.
	if bottleneck == nil || incomingRPS <= systemCapacity {
		if over := mostOverProvisioned(capacities, defs, bottleneck, incomingRPS); over != nil {
			recs = append(recs, fmt.Sprintf(
				"%s is over-provisioned (%s headroom over current load) — downsize or remove replicas to cut cost",
				over.node.Label, headroomLabel(over.capacity, incomingRPS),
			))
		}
	}

	if len(recs) == 0 {
		recs = append(recs, "Architecture looks healthy for the current traffic profile")
	}

	return recs
}

// headroomLabel renders how many times a component's capacity exceeds the load.
func headroomLabel(capacity, incomingRPS float64) string {
	if incomingRPS <= 0 {
		return "ample"
	}
	return fmt.Sprintf("%.0f×", capacity/incomingRPS)
}

func runEngine(graph Graph, traffic TrafficProfile, defs map[string]catalog.NodeDefinition) Result {
	incomingRPS := CalculateIncomingRPS(traffic)
	latency := calculateLatency(graph, defs)
	capacities, systemCapacity := calculateCapacities(graph, defs)
	bottleneck := detectBottleneck(capacities, incomingRPS)
	nodeHealth := buildNodeHealth(capacities, bottleneck, incomingRPS)
	recommendations := generateRecommendations(graph, defs, capacities, bottleneck, incomingRPS, systemCapacity)

	return Result{
		EstimatedRPS:     systemCapacity,
		IncomingRPS:      incomingRPS,
		EstimatedLatency: latency,
		SystemCapacity:   systemCapacity,
		Bottleneck:       bottleneck,
		NodeHealth:       nodeHealth,
		Recommendations:  recommendations,
	}
}
