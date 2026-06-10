package scoring

type Scorer struct{}

func NewScorer() *Scorer {
	return &Scorer{}
}

func letterGrade(score float64) string {
	switch {
	case score >= 93:
		return "A"
	case score >= 90:
		return "A-"
	case score >= 87:
		return "B+"
	case score >= 83:
		return "B"
	case score >= 80:
		return "B-"
	case score >= 77:
		return "C+"
	case score >= 73:
		return "C"
	case score >= 70:
		return "C-"
	default:
		return "D"
	}
}

func clampScore(value float64) int {
	return int(max(0, min(100, round(value))))
}

func round(v float64) float64 {
	if v < 0 {
		return float64(int(v - 0.5))
	}
	return float64(int(v + 0.5))
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func (s *Scorer) Score(metrics Metrics, graph Graph) Scores {
	performance := 100.0
	if metrics.IncomingRPS > 0 {
		ratio := metrics.SystemCapacity / metrics.IncomingRPS
		performance = min(100, ratio*80)
		if metrics.EstimatedLatency <= 50 {
			performance += 10
		}
	}

	reliability := 60.0
	redundantNodes := 0
	for _, node := range graph.Nodes {
		if node.Config.Replicas > 1 {
			redundantNodes++
			reliability += 8
		}
		if node.Config.Autoscaling {
			reliability += 4
		}
	}
	if redundantNodes == 0 {
		reliability -= 10
	}

	scalability := 50.0
	for _, node := range graph.Nodes {
		if node.Config.Autoscaling {
			scalability += 10
		}
		if node.Category == CategoryCache {
			scalability += 15
		}
		if node.Config.Replicas > 1 {
			scalability += 5
		}
	}

	costEfficiency := 100.0
	if metrics.MonthlyCost > 0 && metrics.IncomingRPS > 0 {
		costPerRPS := metrics.MonthlyCost / metrics.IncomingRPS
		costEfficiency = max(30, 100-costPerRPS*2)
	}

	maintainability := 85.0
	complexityPenalty := float64(len(graph.Nodes)) * 1.5
	maintainability = max(40, maintainability-complexityPenalty)

	overall := (performance + reliability + scalability + costEfficiency + maintainability) / 5

	return Scores{
		Performance:     clampScore(performance),
		Reliability:     clampScore(reliability),
		Scalability:     clampScore(scalability),
		CostEfficiency:  clampScore(costEfficiency),
		Maintainability: clampScore(maintainability),
		OverallGrade:    letterGrade(overall),
	}
}
