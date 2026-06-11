package simulation

import "time"

type NodeConfig struct {
	CPU         int    `json:"cpu"`
	Memory      int    `json:"memory"`
	Replicas    int    `json:"replicas"`
	Autoscaling bool   `json:"autoscaling"`
	Region      string `json:"region,omitempty"`
	// Runtime is the language/runtime a compute component is built in (e.g. "go",
	// "rust"). Empty means the Go baseline. Only affects compute-category nodes.
	Runtime string `json:"runtime,omitempty"`
}

type Node struct {
	ID       string     `json:"id"`
	Type     string     `json:"type"`
	Label    string     `json:"label"`
	Position Position   `json:"position"`
	Config   NodeConfig `json:"config"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Edge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
}

type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type TrafficProfile struct {
	DailyActiveUsers      int     `json:"dailyActiveUsers"`
	MonthlyActiveUsers    int     `json:"monthlyActiveUsers"`
	ConcurrentUsers       int     `json:"concurrentUsers"`
	RequestsPerUserMin    float64 `json:"requestsPerUserMin"`
	PeakTrafficMultiplier float64 `json:"peakTrafficMultiplier"`
}

type SimulateRequest struct {
	ArchitectureID *string        `json:"architectureId,omitempty"`
	Name           string         `json:"name,omitempty"`
	Provider       string         `json:"provider,omitempty"`
	Graph          Graph          `json:"graph" binding:"required"`
	Traffic        TrafficProfile `json:"traffic" binding:"required"`
}

// CompareScenario is one architecture+traffic+provider combination to evaluate
// in a comparison. The label is a caller-supplied name (e.g. "AWS" or
// "Monolith") used to identify the column in the result.
type CompareScenario struct {
	Label    string         `json:"label"`
	Provider string         `json:"provider,omitempty"`
	Graph    Graph          `json:"graph"`
	Traffic  TrafficProfile `json:"traffic"`
}

type CompareRequest struct {
	Scenarios []CompareScenario `json:"scenarios" binding:"required"`
}

// ScenarioResult pairs a scenario's label/provider with its computed result.
type ScenarioResult struct {
	Label    string `json:"label"`
	Provider string `json:"provider,omitempty"`
	Result   Result `json:"result"`
}

// Comparison is the output of Compare: every scenario's result plus, for each
// metric, the index of the winning scenario.
type Comparison struct {
	Scenarios []ScenarioResult `json:"scenarios"`
	Winners   map[string]int   `json:"winners"`
}

type NodeHealth struct {
	NodeID   string  `json:"nodeId"`
	NodeType string  `json:"nodeType"`
	Label    string  `json:"label"`
	Capacity float64 `json:"capacity"`
	Status   string  `json:"status"`
}

type Bottleneck struct {
	NodeID   string  `json:"nodeId"`
	NodeType string  `json:"nodeType"`
	Label    string  `json:"label"`
	Capacity float64 `json:"capacity"`
	Incoming float64 `json:"incoming"`
}

type Result struct {
	ID               string       `json:"id"`
	ArchitectureID   *string      `json:"architectureId,omitempty"`
	Provider         string       `json:"provider,omitempty"`
	EstimatedRPS     float64      `json:"estimatedRps"`
	IncomingRPS      float64      `json:"incomingRps"`
	EstimatedLatency float64      `json:"estimatedLatencyMs"`
	SystemCapacity   float64      `json:"systemCapacityRps"`
	MonthlyCost      float64      `json:"monthlyCostUsd"`
	Bottleneck       *Bottleneck  `json:"bottleneck,omitempty"`
	NodeHealth       []NodeHealth `json:"nodeHealth"`
	Scores           Scores       `json:"scores"`
	Recommendations  []string     `json:"recommendations"`
	CreatedAt        time.Time    `json:"createdAt"`
}

type Scores struct {
	Performance     int    `json:"performance"`
	Reliability     int    `json:"reliability"`
	Scalability     int    `json:"scalability"`
	CostEfficiency  int    `json:"costEfficiency"`
	Maintainability int    `json:"maintainability"`
	OverallGrade    string `json:"overallGrade"`
}
