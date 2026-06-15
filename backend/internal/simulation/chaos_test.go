package simulation

import "testing"

// linearGraph is a single-path edge -> compute -> db with no redundancy: every
// tier is a single point of failure.
func linearGraph() Graph {
	return Graph{
		Nodes: []Node{
			{ID: "cdn", Type: "cdn_edge", Label: "CDN", Config: NodeConfig{Replicas: 1}},
			{ID: "api", Type: "api_service", Label: "API", Config: NodeConfig{CPU: 2, Replicas: 1}},
			{ID: "db", Type: "sql_primary", Label: "Primary DB", Config: NodeConfig{CPU: 2, Replicas: 1}},
		},
		Edges: []Edge{{Source: "cdn", Target: "api"}, {Source: "api", Target: "db"}},
	}
}

// redundantGraph has two nodes in every critical tier, so no single failure
// empties a tier.
func redundantGraph() Graph {
	return Graph{
		Nodes: []Node{
			{ID: "cdn1", Type: "cdn_edge", Label: "CDN A", Config: NodeConfig{Replicas: 1}},
			{ID: "cdn2", Type: "cdn_edge", Label: "CDN B", Config: NodeConfig{Replicas: 1}},
			{ID: "api1", Type: "api_service", Label: "API A", Config: NodeConfig{CPU: 2, Replicas: 1}},
			{ID: "api2", Type: "api_service", Label: "API B", Config: NodeConfig{CPU: 2, Replicas: 1}},
			{ID: "db1", Type: "sql_primary", Label: "DB A", Config: NodeConfig{CPU: 2, Replicas: 1}},
			{ID: "db2", Type: "read_replica", Label: "DB B", Config: NodeConfig{CPU: 2, Replicas: 1}},
		},
		Edges: []Edge{
			{Source: "cdn1", Target: "api1"}, {Source: "cdn2", Target: "api2"},
			{Source: "api1", Target: "db1"}, {Source: "api2", Target: "db2"},
		},
	}
}

func normalTraffic() TrafficProfile {
	return TrafficProfile{ConcurrentUsers: 5000, RequestsPerUserMin: 2, PeakTrafficMultiplier: 1}
}

func hasSpof(spofs []Spof, id string) bool {
	for _, s := range spofs {
		if s.NodeID == id {
			return true
		}
	}
	return false
}

func impactOf(impacts []NodeImpact, id string) string {
	for _, i := range impacts {
		if i.NodeID == id {
			return i.Status
		}
	}
	return ""
}

func TestChaosKillingOnlyDatabaseCausesOutage(t *testing.T) {
	svc := newService(&fakeRepo{})

	res := svc.Chaos(ChaosRequest{
		Graph:    linearGraph(),
		Traffic:  normalTraffic(),
		Scenario: ChaosScenario{KilledNodeIDs: []string{"db"}},
	})

	if res.Available {
		t.Error("killing the only database should be a full outage")
	}
	if res.Availability != 0 || res.ServedRPS != 0 {
		t.Errorf("outage should serve nothing: availability=%v served=%v", res.Availability, res.ServedRPS)
	}
	if !hasSpof(res.SPOFs, "db") {
		t.Error("the sole database should be reported as a single point of failure")
	}
	if got := impactOf(res.NodeImpacts, "db"); got != ImpactDead {
		t.Errorf("killed db impact = %q, want %q", got, ImpactDead)
	}
	if got := impactOf(res.NodeImpacts, "api"); got != ImpactOverloaded {
		t.Errorf("surviving api in an outage impact = %q, want %q", got, ImpactOverloaded)
	}
}

func TestChaosRedundancySurvivesSingleKill(t *testing.T) {
	svc := newService(&fakeRepo{})

	res := svc.Chaos(ChaosRequest{
		Graph:    redundantGraph(),
		Traffic:  normalTraffic(),
		Scenario: ChaosScenario{KilledNodeIDs: []string{"api1"}},
	})

	if !res.Available {
		t.Error("killing one of two API nodes should not take the system down")
	}
	if hasSpof(res.SPOFs, "api1") {
		t.Error("a redundant API node must not be a single point of failure")
	}
}

func TestChaosTrafficSpikeSaturatesWithoutOutage(t *testing.T) {
	svc := newService(&fakeRepo{})

	// High concurrency under a big spike pushes incoming RPS past capacity, but
	// no tier is emptied, so it degrades rather than fully fails.
	traffic := TrafficProfile{ConcurrentUsers: 50000, RequestsPerUserMin: 2, PeakTrafficMultiplier: 1}
	res := svc.Chaos(ChaosRequest{
		Graph:    linearGraph(),
		Traffic:  traffic,
		Scenario: ChaosScenario{SpikeMultiplier: 10},
	})

	if !res.Available {
		t.Error("a traffic spike (no nodes killed) should degrade, not cause a full outage")
	}
	if res.Availability >= 1 || res.Availability <= 0 {
		t.Errorf("spike should partially saturate: availability=%v, want 0<x<1", res.Availability)
	}
	if res.FailedRPS <= 0 {
		t.Error("an over-capacity spike should shed some requests")
	}
}

func TestChaosResilienceScoreRewardsRedundancy(t *testing.T) {
	svc := newService(&fakeRepo{})

	linear := svc.Chaos(ChaosRequest{Graph: linearGraph(), Traffic: normalTraffic()})
	redundant := svc.Chaos(ChaosRequest{Graph: redundantGraph(), Traffic: normalTraffic()})

	if linear.ResilienceScore >= redundant.ResilienceScore {
		t.Errorf("redundant score (%d) should beat linear score (%d)",
			redundant.ResilienceScore, linear.ResilienceScore)
	}
	if linear.ResilienceScore != 0 {
		t.Errorf("a fully single-pathed graph should score 0, got %d", linear.ResilienceScore)
	}
	if len(linear.SPOFs) != 3 {
		t.Errorf("linear graph should have 3 SPOFs (edge/compute/db), got %d", len(linear.SPOFs))
	}
	if len(redundant.SPOFs) != 0 {
		t.Errorf("redundant graph should have no SPOFs, got %d", len(redundant.SPOFs))
	}
}
