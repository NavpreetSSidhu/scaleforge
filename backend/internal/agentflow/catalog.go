package agentflow

// NodeKind is a palette entry: a workflow node type with the metadata the editor
// (label/group/description/default config), the Monte-Carlo simulator (latency
// distribution + token/cost model), and the exporters (how to render it) all
// read. It mirrors the infra catalog's NodeDefinition pattern: a flat in-code
// table, no DB, queried via All/Map/ByType.
type NodeKind struct {
	Type        string `json:"type"`
	Label       string `json:"label"`
	Group       string `json:"group"`
	Description string `json:"description"`

	// Latency distribution (milliseconds). The simulator samples lognormal when
	// LatencyJitter > 0 (LLM/tool calls are heavy-tailed), else a fixed value.
	BaseLatencyMs float64 `json:"baseLatencyMs"`
	LatencyJitter float64 `json:"latencyJitter"` // sigma of the underlying normal; 0 = deterministic

	// Token economics. Meaningful for llm/embedder/router-llm nodes.
	MeanTokensIn       int     `json:"meanTokensIn"`
	MeanTokensOut      int     `json:"meanTokensOut"`
	CostPer1kTokensUsd float64 `json:"costPer1kTokensUsd"`
	// FixedCostUsd is a per-call cost independent of tokens (tools, managed APIs).
	FixedCostUsd float64 `json:"fixedCostUsd"`

	DefaultConfig NodeConfig `json:"defaultConfig"`
}

// Node-type and group constants. Types are the contract shared with the frontend
// palette, validation, the simulator, the runtime, and every exporter.
const (
	TypeInput      = "input"
	TypeLLM        = "llm"
	TypeRetriever  = "retriever"
	TypeEmbedder   = "embedder"
	TypeTool       = "tool"
	TypeRouter     = "router"
	TypeLoop       = "loop"
	TypeGuardrail  = "guardrail"
	TypeAggregator = "aggregator"
	TypeOutput     = "output"

	GroupIO        = "Input / Output"
	GroupReasoning = "Reasoning"
	GroupRetrieval = "Retrieval"
	GroupControl   = "Control Flow"
	GroupSafety    = "Safety"
)

// Catalog is the immutable node-type registry.
type Catalog struct {
	kinds []NodeKind
	byID  map[string]NodeKind
}

// NewCatalog builds the registry. Numbers are deliberate, documented estimates —
// the same "curated table behind a seam" philosophy as internal/pricing and
// internal/runtime — chosen so a typical RAG agent's latency/cost land in a
// believable range and the bottleneck (usually the LLM) is obvious.
func NewCatalog() *Catalog {
	kinds := []NodeKind{
		{
			Type: TypeInput, Label: "Input", Group: GroupIO,
			Description:   "Entry point — the user query or trigger that starts the workflow.",
			BaseLatencyMs: 0,
			DefaultConfig: NodeConfig{},
		},
		{
			Type: TypeLLM, Label: "LLM Call", Group: GroupReasoning,
			Description:   "A chat-completion step. Latency is heavy-tailed; tokens drive cost.",
			BaseLatencyMs: 750, LatencyJitter: 0.5,
			MeanTokensIn: 600, MeanTokensOut: 250, CostPer1kTokensUsd: 0.0008,
			DefaultConfig: NodeConfig{
				Model: "llama-3.3-70b-versatile", Temperature: 0.3, MaxTokens: 1024,
				Prompt: "You are a helpful assistant. Answer the user's question using the provided context.",
			},
		},
		{
			Type: TypeRetriever, Label: "Vector Retriever", Group: GroupRetrieval,
			Description:   "Embeds the query and runs ANN search over a vector index (Flat/IVF/HNSW + quantization). Latency comes from the real Go vector engine.",
			BaseLatencyMs: 12, LatencyJitter: 0.2,
			MeanTokensIn: 0, MeanTokensOut: 0, FixedCostUsd: 0.00002,
			DefaultConfig: NodeConfig{
				IndexType: "hnsw", Quantization: "none", TopK: 5, Dim: 768, CorpusSize: 50000,
			},
		},
		{
			Type: TypeEmbedder, Label: "Embedder", Group: GroupRetrieval,
			Description:   "Turns text into a vector. Cheap and fast relative to generation.",
			BaseLatencyMs: 35, LatencyJitter: 0.25,
			MeanTokensIn: 400, MeanTokensOut: 0, CostPer1kTokensUsd: 0.0001,
			DefaultConfig: NodeConfig{Model: "text-embedding-3-small", Dim: 768},
		},
		{
			Type: TypeTool, Label: "Tool / Function", Group: GroupReasoning,
			Description:   "Calls an external function or API the agent can invoke. Moderate, variable latency.",
			BaseLatencyMs: 150, LatencyJitter: 0.4, FixedCostUsd: 0,
			DefaultConfig: NodeConfig{
				ToolName:   "search_web",
				ToolSchema: `{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}`,
			},
		},
		{
			Type: TypeRouter, Label: "Router", Group: GroupControl,
			Description:   "Branches the flow to one of its outgoing edges based on a condition. Near-free when rule-based.",
			BaseLatencyMs: 4, LatencyJitter: 0,
			DefaultConfig: NodeConfig{Condition: "needs_tool"},
		},
		{
			Type: TypeLoop, Label: "Loop", Group: GroupControl,
			Description:   "Repeats the steps it points at up to a bounded number of iterations (agent reasoning loop).",
			BaseLatencyMs: 0, LatencyJitter: 0,
			DefaultConfig: NodeConfig{MaxIterations: 3},
		},
		{
			Type: TypeGuardrail, Label: "Guardrail", Group: GroupSafety,
			Description:   "Validates / sanitizes input or output (schema, PII, policy). Deterministic and quick.",
			BaseLatencyMs: 18, LatencyJitter: 0,
			DefaultConfig: NodeConfig{},
		},
		{
			Type: TypeAggregator, Label: "Aggregator", Group: GroupControl,
			Description:   "Joins the outputs of parallel branches into one result.",
			BaseLatencyMs: 6, LatencyJitter: 0,
			DefaultConfig: NodeConfig{},
		},
		{
			Type: TypeOutput, Label: "Output", Group: GroupIO,
			Description:   "Exit point — the final answer returned to the caller.",
			BaseLatencyMs: 0,
			DefaultConfig: NodeConfig{},
		},
	}

	byID := make(map[string]NodeKind, len(kinds))
	for _, k := range kinds {
		byID[k.Type] = k
	}
	return &Catalog{kinds: kinds, byID: byID}
}

// All returns every node kind in display order.
func (c *Catalog) All() []NodeKind { return c.kinds }

// Map returns a type→kind lookup for O(1) access during sim/validation.
func (c *Catalog) Map() map[string]NodeKind { return c.byID }

// ByType looks up one kind; ok is false for unknown types.
func (c *Catalog) ByType(t string) (NodeKind, bool) {
	k, ok := c.byID[t]
	return k, ok
}
