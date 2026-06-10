package simulation

// Metric keys reported in Comparison.Winners. Each maps to the index of the
// winning scenario for that dimension.
const (
	MetricCost            = "cost"            // lower is better
	MetricLatency         = "latency"         // lower is better
	MetricCapacity        = "capacity"        // higher is better
	MetricPerformance     = "performance"     // higher is better
	MetricReliability     = "reliability"     // higher is better
	MetricScalability     = "scalability"     // higher is better
	MetricCostEfficiency  = "costEfficiency"  // higher is better
	MetricMaintainability = "maintainability" // higher is better
	MetricOverall         = "overall"         // higher is better (avg of categories)
)

// overallScore is the mean of the five category scores — a single numeric proxy
// for the letter grade, used to pick the overall winner.
func overallScore(s Scores) float64 {
	return float64(s.Performance+s.Reliability+s.Scalability+s.CostEfficiency+s.Maintainability) / 5.0
}

// NoWinner is reported for a metric when no single scenario is uniquely best —
// i.e. the optimum value is shared by two or more scenarios (a tie). The UI
// highlights nothing in that case rather than crowning an arbitrary column.
const NoWinner = -1

// pickWinners returns, for each metric, the index of the *uniquely* best
// scenario, or NoWinner when the best value is tied. "Lower is better" metrics
// ignore non-positive values (e.g. a zero-cost empty graph never wins on cost).
// Returns nil for no input.
func pickWinners(scenarios []ScenarioResult) map[string]int {
	if len(scenarios) == 0 {
		return nil
	}

	lowerWins := func(value func(Result) float64) int {
		best, bestVal, ties := NoWinner, 0.0, 0
		for i := range scenarios {
			v := value(scenarios[i].Result)
			if v <= 0 {
				continue
			}
			switch {
			case best == NoWinner || v < bestVal:
				best, bestVal, ties = i, v, 1
			case v == bestVal:
				ties++
			}
		}
		if best == NoWinner || ties > 1 {
			return NoWinner
		}
		return best
	}

	higherWins := func(value func(Result) float64) int {
		best, bestVal, ties := NoWinner, 0.0, 0
		for i := range scenarios {
			v := value(scenarios[i].Result)
			switch {
			case best == NoWinner || v > bestVal:
				best, bestVal, ties = i, v, 1
			case v == bestVal:
				ties++
			}
		}
		if ties > 1 {
			return NoWinner
		}
		return best
	}

	return map[string]int{
		MetricCost:            lowerWins(func(r Result) float64 { return r.MonthlyCost }),
		MetricLatency:         lowerWins(func(r Result) float64 { return r.EstimatedLatency }),
		MetricCapacity:        higherWins(func(r Result) float64 { return r.SystemCapacity }),
		MetricPerformance:     higherWins(func(r Result) float64 { return float64(r.Scores.Performance) }),
		MetricReliability:     higherWins(func(r Result) float64 { return float64(r.Scores.Reliability) }),
		MetricScalability:     higherWins(func(r Result) float64 { return float64(r.Scores.Scalability) }),
		MetricCostEfficiency:  higherWins(func(r Result) float64 { return float64(r.Scores.CostEfficiency) }),
		MetricMaintainability: higherWins(func(r Result) float64 { return float64(r.Scores.Maintainability) }),
		MetricOverall:         higherWins(func(r Result) float64 { return overallScore(r.Scores) }),
	}
}
