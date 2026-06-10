package simulation

import "testing"

func TestComputeAppliesProviderPricing(t *testing.T) {
	svc := newService(&fakeRepo{})

	aws := svc.compute(SimulateRequest{Graph: demoRequest().Graph, Traffic: demoRequest().Traffic, Provider: "aws"})
	gcp := svc.compute(SimulateRequest{Graph: demoRequest().Graph, Traffic: demoRequest().Traffic, Provider: "gcp"})

	if aws.Provider != "aws" || gcp.Provider != "gcp" {
		t.Fatalf("provider not recorded on result: aws=%q gcp=%q", aws.Provider, gcp.Provider)
	}
	// GCP's compute/cache/db multipliers are all < 1, so the same architecture is
	// cheaper on GCP than AWS.
	if !(gcp.MonthlyCost < aws.MonthlyCost) {
		t.Errorf("expected GCP cheaper than AWS, got gcp=%v aws=%v", gcp.MonthlyCost, aws.MonthlyCost)
	}
}

func TestComputeDefaultsProviderToAWS(t *testing.T) {
	svc := newService(&fakeRepo{})
	r := svc.compute(SimulateRequest{Graph: demoRequest().Graph, Traffic: demoRequest().Traffic})
	if r.Provider != "aws" {
		t.Errorf("default provider = %q, want aws", r.Provider)
	}
	if r.MonthlyCost != 270 {
		t.Errorf("default-provider cost = %v, want 270 (AWS baseline)", r.MonthlyCost)
	}
}

func TestCompareReportsWinners(t *testing.T) {
	svc := newService(&fakeRepo{})

	// Same architecture/traffic, different providers — only cost differs, so the
	// cheapest provider (GCP) wins cost and AWS/GCP tie elsewhere (ties → index 0).
	req := CompareRequest{Scenarios: []CompareScenario{
		{Label: "AWS", Provider: "aws", Graph: demoRequest().Graph, Traffic: demoRequest().Traffic},
		{Label: "GCP", Provider: "gcp", Graph: demoRequest().Graph, Traffic: demoRequest().Traffic},
	}}

	cmp := svc.Compare(req)
	if len(cmp.Scenarios) != 2 {
		t.Fatalf("expected 2 scenario results, got %d", len(cmp.Scenarios))
	}
	if cmp.Scenarios[0].Label != "AWS" || cmp.Scenarios[1].Label != "GCP" {
		t.Errorf("scenario labels/order wrong: %+v", cmp.Scenarios)
	}
	if cmp.Winners[MetricCost] != 1 {
		t.Errorf("cost winner = %d, want 1 (GCP cheaper)", cmp.Winners[MetricCost])
	}
	// Latency/capacity are identical across providers → a tie has no winner.
	if cmp.Winners[MetricLatency] != NoWinner {
		t.Errorf("latency winner = %d, want %d (tie -> no winner)", cmp.Winners[MetricLatency], NoWinner)
	}
	if cmp.Winners[MetricCapacity] != NoWinner {
		t.Errorf("capacity winner = %d, want %d (tie -> no winner)", cmp.Winners[MetricCapacity], NoWinner)
	}
}

func TestCompareNoWinnerWhenAllScenariosIdentical(t *testing.T) {
	svc := newService(&fakeRepo{})
	// Same provider + same architecture + same traffic → every metric ties.
	req := CompareRequest{Scenarios: []CompareScenario{
		{Label: "A", Provider: "aws", Graph: demoRequest().Graph, Traffic: demoRequest().Traffic},
		{Label: "B", Provider: "aws", Graph: demoRequest().Graph, Traffic: demoRequest().Traffic},
	}}
	cmp := svc.Compare(req)
	for metric, idx := range cmp.Winners {
		if idx != NoWinner {
			t.Errorf("metric %q winner = %d, want %d (identical scenarios)", metric, idx, NoWinner)
		}
	}
}

func TestPickWinnersEmpty(t *testing.T) {
	if got := pickWinners(nil); got != nil {
		t.Errorf("pickWinners(nil) = %v, want nil", got)
	}
}

func TestPickWinnersIgnoresNonPositiveLowerMetrics(t *testing.T) {
	// A zero-cost scenario must not win on cost over a real-cost one.
	scenarios := []ScenarioResult{
		{Label: "empty", Result: Result{MonthlyCost: 0, EstimatedLatency: 0, SystemCapacity: 0}},
		{Label: "real", Result: Result{MonthlyCost: 100, EstimatedLatency: 20, SystemCapacity: 5000}},
	}
	w := pickWinners(scenarios)
	if w[MetricCost] != 1 {
		t.Errorf("cost winner = %d, want 1 (zero-cost ignored)", w[MetricCost])
	}
	if w[MetricCapacity] != 1 {
		t.Errorf("capacity winner = %d, want 1", w[MetricCapacity])
	}
}
