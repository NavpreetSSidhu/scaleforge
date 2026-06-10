package achievements

import (
	"slices"
	"testing"
)

func TestEvaluateEmptyGraphEarnsNothing(t *testing.T) {
	if got := Evaluate(EvalInput{NodeCount: 0}); got != nil {
		t.Fatalf("empty graph earned %v, want nil", got)
	}
}

func TestEvaluateFirstArchitectureAlwaysEarnedWithNodes(t *testing.T) {
	got := Evaluate(EvalInput{NodeCount: 1})
	if !slices.Contains(got, IDFirstArchitecture) {
		t.Errorf("expected %q, got %v", IDFirstArchitecture, got)
	}
}

func TestEvaluateSupportsThresholdsRequireNoSaturation(t *testing.T) {
	// Healthy: capacity comfortably above incoming, 100k daily users.
	healthy := EvalInput{
		NodeCount:        3,
		IncomingRPS:      500,
		SystemCapacity:   2000,
		DailyActiveUsers: 100_000,
	}
	got := Evaluate(healthy)
	if !slices.Contains(got, IDSupports10k) || !slices.Contains(got, IDSupports100k) {
		t.Errorf("healthy 100k arch should earn 10k+100k, got %v", got)
	}

	// Saturated: incoming exceeds capacity — neither support badge is earned.
	saturated := healthy
	saturated.IncomingRPS = 5000
	got = Evaluate(saturated)
	if slices.Contains(got, IDSupports10k) || slices.Contains(got, IDSupports100k) {
		t.Errorf("saturated arch should not earn support badges, got %v", got)
	}
}

func TestEvaluateMultiRegionNeedsTwoDistinctRegions(t *testing.T) {
	one := Evaluate(EvalInput{NodeCount: 2, Regions: []string{"us-east", "us-east"}})
	if slices.Contains(one, IDMultiRegion) {
		t.Error("single distinct region should not earn multi-region")
	}
	two := Evaluate(EvalInput{NodeCount: 2, Regions: []string{"us-east", "eu-west"}})
	if !slices.Contains(two, IDMultiRegion) {
		t.Error("two distinct regions should earn multi-region")
	}
}

func TestEvaluateCacheWizard(t *testing.T) {
	got := Evaluate(EvalInput{NodeCount: 2, Categories: []string{"compute", "cache"}})
	if !slices.Contains(got, IDCacheWizard) {
		t.Errorf("cache present should earn cache-wizard, got %v", got)
	}
}

func TestEvaluateCostOptimizerThreshold(t *testing.T) {
	if slices.Contains(Evaluate(EvalInput{NodeCount: 1, CostEfficiency: 84}), IDCostOptimizer) {
		t.Error("cost efficiency 84 should not earn cost-optimizer")
	}
	if !slices.Contains(Evaluate(EvalInput{NodeCount: 1, CostEfficiency: 85}), IDCostOptimizer) {
		t.Error("cost efficiency 85 should earn cost-optimizer")
	}
}

func TestEvaluateDatabaseSlayer(t *testing.T) {
	base := EvalInput{
		NodeCount:      3,
		Categories:     []string{"compute", "database"},
		IncomingRPS:    1500,
		SystemCapacity: 3000,
	}
	if !slices.Contains(Evaluate(base), IDDatabaseSlayer) {
		t.Error("db serving 1.5k RPS without being bottleneck should earn database-slayer")
	}

	// When the database is the bottleneck, the badge is withheld.
	dbBottleneck := base
	dbBottleneck.BottleneckCategory = "database"
	if slices.Contains(Evaluate(dbBottleneck), IDDatabaseSlayer) {
		t.Error("database bottleneck should not earn database-slayer")
	}

	// Below the RPS floor, the badge is withheld.
	lowTraffic := base
	lowTraffic.IncomingRPS = 500
	if slices.Contains(Evaluate(lowTraffic), IDDatabaseSlayer) {
		t.Error("sub-1k RPS should not earn database-slayer")
	}
}
