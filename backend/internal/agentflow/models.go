// Package agentflow models, validates, simulates, executes, and exports agentic
// LLM workflows — a surface parallel to the infrastructure simulator. A Workflow
// is a small graph of typed steps (input, llm, retriever, tool, router, loop, …)
// the user designs on a canvas; the same graph drives the Monte-Carlo simulator
// (sim/), the live dry-run runtime (runtime/), and the code exporters (export/).
//
// The graph is self-contained (it does NOT reuse simulation.Graph) because agent
// nodes carry a very different config — prompts, models, vector-index settings —
// than infra nodes. Everything is plain JSON so the React canvas, the DB column,
// and the LLM generator all speak the same shape.
package agentflow

import (
	"context"
	"errors"
	"time"
)

// ErrDisabled is returned when an LLM-backed operation (generation, live run) is
// requested but no provider is configured (GROQ_API_KEY unset). Handlers map it
// to 503 so the client hides those entrypoints while design/sim/export still work.
var ErrDisabled = errors.New("agent runtime not configured")

// ErrInvalid wraps validation failures so handlers can answer 422 with a message
// that names the specific problem (unknown node type, dangling edge, …).
var ErrInvalid = errors.New("invalid workflow")

// Position is a node's location on the canvas.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// NodeConfig is the union of every node type's settings, kept flat (with
// omitempty) so it serializes cleanly to JSON and a single JSONB column. Only the
// fields relevant to a node's Type are meaningful; normalize() fills defaults
// from the catalog and the simulator/runtime read only what they need.
type NodeConfig struct {
	// llm / router(llm) — the reasoning settings.
	Model       string  `json:"model,omitempty"`
	Prompt      string  `json:"prompt,omitempty"`
	Temperature float64 `json:"temperature,omitempty"`
	MaxTokens   int     `json:"maxTokens,omitempty"`

	// retriever — vector-search settings, fed to the pure-Go vector engine.
	IndexType    string `json:"indexType,omitempty"`    // flat | ivf | hnsw
	Quantization string `json:"quantization,omitempty"` // none | scalar | product
	TopK         int    `json:"topK,omitempty"`
	Dim          int    `json:"dim,omitempty"`        // embedding dimensionality
	CorpusSize   int    `json:"corpusSize,omitempty"` // indexed document count

	// tool — an external function call.
	ToolName   string `json:"toolName,omitempty"`
	ToolSchema string `json:"toolSchema,omitempty"` // JSON-schema text for args

	// router — branch selection.
	Condition string `json:"condition,omitempty"`

	// loop — bounded iteration over the body it points at.
	MaxIterations int `json:"maxIterations,omitempty"`
}

// Node is one step in a workflow.
type Node struct {
	ID       string     `json:"id"`
	Type     string     `json:"type"`
	Label    string     `json:"label"`
	Position Position   `json:"position"`
	Config   NodeConfig `json:"config"`
}

// Edge connects two nodes. Label optionally names a router branch ("yes"/"no",
// "tool"/"answer") so conditional routing and exporters can read intent.
type Edge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label,omitempty"`
}

// Graph is the workflow DAG (cycles are expressed only through loop nodes, never
// raw edges — validate enforces this).
type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

// Workflow is a user-authored agentic workflow, persisted server-side. Graph is
// the design; the rest is the persistence envelope.
type Workflow struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Graph       Graph     `json:"graph"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// WorkflowInput is the create/update payload from the editor. Name is required;
// everything else is normalized (defaults filled, ids generated) then validated.
type WorkflowInput struct {
	Name        string `json:"name" binding:"required,max=140"`
	Description string `json:"description" binding:"max=400"`
	Graph       Graph  `json:"graph"`
}

// GenerateInput is the body of POST /workflows/generate: a freeform description
// of the agent the user wants. The LLM fills a full draft graph they then edit.
type GenerateInput struct {
	Prompt string `json:"prompt" binding:"required,max=2000"`
}

// Repository persists user workflows. The postgres Store satisfies it; methods
// return repository.ErrNotFound for a missing/foreign workflow.
type Repository interface {
	CreateWorkflow(ctx context.Context, userID string, w Workflow) (Workflow, error)
	ListWorkflows(ctx context.Context, userID string) ([]Workflow, error)
	GetWorkflow(ctx context.Context, userID, id string) (Workflow, error)
	UpdateWorkflow(ctx context.Context, userID, id string, w Workflow) (Workflow, error)
	DeleteWorkflow(ctx context.Context, userID, id string) error
}
