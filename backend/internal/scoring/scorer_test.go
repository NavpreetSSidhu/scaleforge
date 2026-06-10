package scoring

import "testing"

func TestLetterGradeBoundaries(t *testing.T) {
	cases := []struct {
		score float64
		want  string
	}{
		{95, "A"},
		{93, "A"},
		{92.9, "A-"},
		{90, "A-"},
		{88, "B+"},
		{83, "B"},
		{80, "B-"},
		{77, "C+"},
		{73, "C"},
		{70, "C-"},
		{69.9, "D"},
		{0, "D"},
	}

	for _, c := range cases {
		if got := letterGrade(c.score); got != c.want {
			t.Errorf("letterGrade(%v) = %q, want %q", c.score, got, c.want)
		}
	}
}

func TestClampScoreBounds(t *testing.T) {
	if got := clampScore(150); got != 100 {
		t.Errorf("clampScore(150) = %d, want 100", got)
	}
	if got := clampScore(-20); got != 0 {
		t.Errorf("clampScore(-20) = %d, want 0", got)
	}
	if got := clampScore(72.6); got != 73 {
		t.Errorf("clampScore(72.6) = %d, want 73 (rounded)", got)
	}
}

func TestScoreClampsAllCategoriesToRange(t *testing.T) {
	scorer := NewScorer()
	scores := scorer.Score(Metrics{
		IncomingRPS:      1000,
		SystemCapacity:   9000,
		EstimatedLatency: 20,
		MonthlyCost:      300,
	}, Graph{Nodes: []Node{
		{Type: "api_service", Config: NodeConfig{Replicas: 3, Autoscaling: true}},
		{Type: "redis_cache", Config: NodeConfig{Replicas: 1}},
		{Type: "sql_primary", Config: NodeConfig{Replicas: 2}},
	}})

	for name, v := range map[string]int{
		"performance":     scores.Performance,
		"reliability":     scores.Reliability,
		"scalability":     scores.Scalability,
		"costEfficiency":  scores.CostEfficiency,
		"maintainability": scores.Maintainability,
	} {
		if v < 0 || v > 100 {
			t.Errorf("%s score %d out of range [0,100]", name, v)
		}
	}
	if scores.OverallGrade == "" {
		t.Error("expected a non-empty overall grade")
	}
}

func TestScoreRewardsRedundancyAndCache(t *testing.T) {
	scorer := NewScorer()
	metrics := Metrics{IncomingRPS: 1000, SystemCapacity: 5000, EstimatedLatency: 30, MonthlyCost: 200}

	fragile := scorer.Score(metrics, Graph{Nodes: []Node{
		{Type: "api_service", Config: NodeConfig{Replicas: 1}},
		{Type: "sql_primary", Config: NodeConfig{Replicas: 1}},
	}})

	resilient := scorer.Score(metrics, Graph{Nodes: []Node{
		{Type: "api_service", Config: NodeConfig{Replicas: 3, Autoscaling: true}},
		{Type: "redis_cache", Category: CategoryCache, Config: NodeConfig{Replicas: 2}},
		{Type: "sql_primary", Config: NodeConfig{Replicas: 2}},
	}})

	if resilient.Reliability <= fragile.Reliability {
		t.Errorf("redundant architecture reliability %d should exceed fragile %d",
			resilient.Reliability, fragile.Reliability)
	}
	if resilient.Scalability <= fragile.Scalability {
		t.Errorf("cached/autoscaled architecture scalability %d should exceed fragile %d",
			resilient.Scalability, fragile.Scalability)
	}
}

func TestScorePenalizesUnderCapacityPerformance(t *testing.T) {
	scorer := NewScorer()
	graph := Graph{Nodes: []Node{{Type: "sql_primary", Config: NodeConfig{Replicas: 1}}}}

	overloaded := scorer.Score(Metrics{IncomingRPS: 5000, SystemCapacity: 1000, EstimatedLatency: 40, MonthlyCost: 100}, graph)
	healthy := scorer.Score(Metrics{IncomingRPS: 500, SystemCapacity: 5000, EstimatedLatency: 40, MonthlyCost: 100}, graph)

	if overloaded.Performance >= healthy.Performance {
		t.Errorf("overloaded performance %d should be lower than healthy %d",
			overloaded.Performance, healthy.Performance)
	}
}
