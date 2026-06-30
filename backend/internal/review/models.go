package review

import (
	"github.com/scaleforge/scaleforge/internal/assist"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// Severity ranks a finding. The client sorts and colours by this.
const (
	SeverityCritical = "critical"
	SeverityHigh     = "high"
	SeverityMedium   = "medium"
	SeverityLow      = "low"
)

// Request is the body of POST /review. It mirrors a simulate request so the model
// reasons over the exact architecture on screen, and carries the latest
// simulation result (and optional chaos result) so the review is grounded in real
// measured numbers — capacity, bottleneck, cost, resilience — rather than vibes.
type Request struct {
	Graph    simulation.Graph          `json:"graph"`
	Traffic  simulation.TrafficProfile `json:"traffic"`
	Provider string                    `json:"provider,omitempty"`
	Result   *simulation.Result        `json:"result,omitempty"`
	Chaos    *simulation.ChaosResult   `json:"chaos,omitempty"`
}

// Finding is one issue the reviewer raises, with a concrete, one-click fix. The
// fix reuses assist.Action so the existing client apply pipeline works unchanged.
type Finding struct {
	Severity string          `json:"severity"`
	Category string          `json:"category"`
	Title    string          `json:"title"`
	Detail   string          `json:"detail"`
	Actions  []assist.Action `json:"actions"`
}

// Response is the reviewer's output: a short summary plus severity-ranked findings.
type Response struct {
	Summary  string    `json:"summary"`
	Findings []Finding `json:"findings"`
}
