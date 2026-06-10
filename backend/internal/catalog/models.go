package catalog

type NodeDefinition struct {
	Type                string     `json:"type"`
	Category            string     `json:"category"`
	Group               string     `json:"group"`
	Label               string     `json:"label"`
	Description         string     `json:"description"`
	BaseLatencyMs       float64    `json:"baseLatencyMs"`
	PerInstanceCapacity float64    `json:"perInstanceCapacityRps"`
	UnitMonthlyCostUsd  float64    `json:"unitMonthlyCostUsd"`
	DefaultConfig       NodeConfig `json:"defaultConfig"`
}

// Semantic categories drive simulation/scoring behaviour.
const (
	CategoryEdge          = "edge"
	CategoryCompute       = "compute"
	CategoryDatabase      = "database"
	CategoryCache         = "cache"
	CategoryStorage       = "storage"
	CategoryMessaging     = "messaging"
	CategorySecurity      = "security"
	CategoryObservability = "observability"
)

// Groups are the sidebar headings shown in the component library.
const (
	GroupEdge          = "Edge & Network"
	GroupCompute       = "Compute"
	GroupData          = "Data Stores"
	GroupMessaging     = "Messaging"
	GroupSecurity      = "Security"
	GroupObservability = "Observability"
)

type NodeConfig struct {
	CPU         int    `json:"cpu"`
	Memory      int    `json:"memory"`
	Replicas    int    `json:"replicas"`
	Autoscaling bool   `json:"autoscaling"`
	Region      string `json:"region,omitempty"`
}
