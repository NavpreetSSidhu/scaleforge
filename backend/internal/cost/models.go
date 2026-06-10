package cost

type Graph struct {
	Nodes []Node `json:"nodes"`
}

type Node struct {
	Type   string     `json:"type"`
	Config NodeConfig `json:"config"`
}

type NodeConfig struct {
	Replicas int `json:"replicas"`
}
