package runtime

// EventType classifies a streamed execution event.
type EventType string

const (
	EventNodeStart  EventType = "node_start"
	EventNodeFinish EventType = "node_finish"
	EventRoute      EventType = "route"
	EventError      EventType = "error"
	EventDone       EventType = "done"
)

// Event is one streamed step of a live workflow run. The SSE handler serializes
// these to the client so the canvas can light up nodes as they execute.
type Event struct {
	Type      EventType `json:"type"`
	NodeID    string    `json:"nodeId,omitempty"`
	NodeType  string    `json:"nodeType,omitempty"`
	Label     string    `json:"label,omitempty"`
	Output    string    `json:"output,omitempty"`
	LatencyMs float64   `json:"latencyMs,omitempty"`
	TokensIn  int       `json:"tokensIn,omitempty"`
	TokensOut int       `json:"tokensOut,omitempty"`
	// Branch is the chosen edge label/target for a router decision.
	Branch string `json:"branch,omitempty"`
	Error  string `json:"error,omitempty"`
}
