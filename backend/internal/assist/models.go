package assist

import "github.com/scaleforge/scaleforge/internal/simulation"

// Action operation identifiers. The frontend's apply layer mirrors these.
const (
	OpAddNode      = "addNode"
	OpRemoveNode   = "removeNode"
	OpAddEdge      = "addEdge"
	OpRemoveEdge   = "removeEdge"
	OpUpdateConfig = "updateConfig"
)

// Action is one proposed mutation to the architecture graph. The assistant only
// ever returns actions; the frontend previews them and applies the ones the user
// accepts. Every action is validated server-side against the catalog and the
// current graph before it reaches the client, so unknown component types or
// dangling references are dropped rather than trusted.
type Action struct {
	Op string `json:"op"`
	// NodeType is the catalog component type for addNode (e.g. "redis_cache").
	NodeType string `json:"nodeType,omitempty"`
	// NodeID identifies the target of removeNode/updateConfig. For addNode it is
	// an optional *proposed* id the model can reference from edges in the same
	// batch; the frontend remaps it to a real generated id on apply.
	NodeID string `json:"nodeId,omitempty"`
	// Label overrides the default catalog label for addNode.
	Label string `json:"label,omitempty"`
	// Source/Target are node ids (existing or proposed) for addEdge/removeEdge.
	Source string `json:"source,omitempty"`
	Target string `json:"target,omitempty"`
	// Config carries the fields to merge for addNode/updateConfig.
	Config *ActionConfig `json:"config,omitempty"`
	// Rationale is a short, human-readable reason shown beside the action chip.
	Rationale string `json:"rationale,omitempty"`
}

// ActionConfig is the subset of node config the assistant may set. Pointers keep
// "unset" distinct from "set to zero" so a partial updateConfig only touches the
// fields the model actually named.
type ActionConfig struct {
	CPU         *int    `json:"cpu,omitempty"`
	Memory      *int    `json:"memory,omitempty"`
	Replicas    *int    `json:"replicas,omitempty"`
	Autoscaling *bool   `json:"autoscaling,omitempty"`
	Region      *string `json:"region,omitempty"`
	Runtime     *string `json:"runtime,omitempty"`
}

// ChatRequest is the body of POST /assistant. Graph/Traffic/Provider mirror a
// simulate request so the model reasons over the exact architecture on screen;
// Result is the latest simulation output (optional) so explanations cite real
// numbers; History is prior turns for multi-turn context.
type ChatRequest struct {
	Message  string                    `json:"message" binding:"required"`
	Graph    simulation.Graph          `json:"graph"`
	Traffic  simulation.TrafficProfile `json:"traffic"`
	Provider string                    `json:"provider,omitempty"`
	Result   *simulation.Result        `json:"result,omitempty"`
	History  []Message                 `json:"history,omitempty"`
}

// Message is one turn of conversation. Role is "user" or "assistant".
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Response is what the assistant returns: a natural-language reply plus any
// validated, ready-to-apply graph actions.
type Response struct {
	Reply   string   `json:"reply"`
	Actions []Action `json:"actions"`
}
