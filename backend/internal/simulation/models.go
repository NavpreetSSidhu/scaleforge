package simulation

import "time"

type NodeConfig struct {
	CPU         int    `json:"cpu"`
	Memory      int    `json:"memory"`
	Replicas    int    `json:"replicas"`
	Autoscaling bool   `json:"autoscaling"`
	Region      string `json:"region,omitempty"`
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
	Graph          Graph          `json:"graph" binding:"required"`
	Traffic        TrafficProfile `json:"traffic" binding:"required"`
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
