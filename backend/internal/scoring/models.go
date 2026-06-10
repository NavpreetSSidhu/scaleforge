package scoring

type Graph struct {
	Nodes []Node `json:"nodes"`
}

type Node struct {
	Type     string     `json:"type"`
	Category string     `json:"category"`
	Config   NodeConfig `json:"config"`
}

// Category constants mirror catalog semantic categories used in scoring.
const (
	CategoryCache = "cache"
)

type NodeConfig struct {
	Replicas    int  `json:"replicas"`
	Autoscaling bool `json:"autoscaling"`
}

type Metrics struct {
	IncomingRPS      float64
	SystemCapacity   float64
	EstimatedLatency float64
	MonthlyCost      float64
}

type Scores struct {
	Performance     int    `json:"performance"`
	Reliability     int    `json:"reliability"`
	Scalability     int    `json:"scalability"`
	CostEfficiency  int    `json:"costEfficiency"`
	Maintainability int    `json:"maintainability"`
	OverallGrade    string `json:"overallGrade"`
}
