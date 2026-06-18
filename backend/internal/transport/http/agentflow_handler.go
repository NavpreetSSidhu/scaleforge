package http

import (
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/agentflow"
	"github.com/scaleforge/scaleforge/internal/agentflow/export"
	agentruntime "github.com/scaleforge/scaleforge/internal/agentflow/runtime"
	"github.com/scaleforge/scaleforge/internal/agentflow/sim"
	"github.com/scaleforge/scaleforge/internal/agentflow/vector"
	"github.com/scaleforge/scaleforge/internal/middleware"
)

// AgentflowHandler exposes Agent Studio: the node-type palette and pure
// design-time operations (simulate / vector-bench / export) are guest-friendly;
// workflow CRUD is account-only; AI generation and the live dry-run runtime are
// additionally gated by the LLM key and rate-limited per client (same budget and
// "check enabled before spending a token" ordering as the assistant).
type AgentflowHandler struct {
	service  *agentflow.Service
	executor *agentruntime.Executor
	limiter  *middleware.IPRateLimiter
}

func NewAgentflowHandler(service *agentflow.Service, executor *agentruntime.Executor) *AgentflowHandler {
	return &AgentflowHandler{
		service:  service,
		executor: executor,
		limiter:  middleware.NewIPRateLimiter(10, time.Minute),
	}
}

// GetCatalog returns the node-type palette (guest).
func (h *AgentflowHandler) GetCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"nodeTypes": h.service.Catalog().All()})
}

// simulateRequest is the body of POST /agentflow/simulate.
type simulateRequest struct {
	Graph  agentflow.Graph `json:"graph"`
	Trials int             `json:"trials"`
	Seed   int64           `json:"seed"`
}

// Simulate runs the concurrent Monte-Carlo simulator over a (design-time) graph
// and returns the latency/cost distribution + per-node hotspots. Guest-friendly
// and pure (no LLM), so it needs no key — only the shared sim rate limit applied
// at the route.
func (h *AgentflowHandler) Simulate(c *gin.Context) {
	var req simulateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	graph, err := h.service.PrepareGraph(req.Graph)
	if err != nil {
		writeWorkflowError(c, err)
		return
	}
	result := sim.Simulate(h.service.Catalog(), graph, sim.Options{
		Trials:             req.Trials,
		Seed:               req.Seed,
		RetrieverLatencyMs: retrieverLatencies(graph),
	})
	c.JSON(http.StatusOK, result)
}

// retrieverLatencies derives a per-retriever-node base latency from the vector
// engine's analytical model, so the simulator reflects the chosen index type and
// quantization (Flat is slow, HNSW fast, product quantization cheaper still)
// without building a real index on every request.
func retrieverLatencies(g agentflow.Graph) map[string]float64 {
	var out map[string]float64
	for _, n := range g.Nodes {
		if n.Type != agentflow.TypeRetriever {
			continue
		}
		if out == nil {
			out = make(map[string]float64)
		}
		out[n.ID] = vector.EstimateLatencyMs(n.Config.IndexType, n.Config.Quantization, n.Config.CorpusSize, n.Config.Dim, n.Config.TopK)
	}
	return out
}

// VectorBench builds and measures the requested ANN index variants over a
// synthetic clustered corpus, returning the real recall ↔ latency ↔ memory
// trade-off. Guest-friendly and pure; compute-heavy, so it shares the sim limiter.
func (h *AgentflowHandler) VectorBench(c *gin.Context) {
	var req vector.BenchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, vector.Benchmark(req))
}

// exportRequest is the body of POST /agentflow/export.
type exportRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Graph       agentflow.Graph `json:"graph"`
	Targets     []export.Target `json:"targets"`
}

// Export generates runnable scaffolds + a portable spec for the workflow. Guest-
// friendly and pure (no LLM, no DB).
func (h *AgentflowHandler) Export(c *gin.Context) {
	var req exportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	graph, err := h.service.PrepareGraph(req.Graph)
	if err != nil {
		writeWorkflowError(c, err)
		return
	}
	wf := agentflow.Workflow{Name: req.Name, Description: req.Description, Graph: graph}
	c.JSON(http.StatusOK, export.Generate(h.service.Catalog(), wf, req.Targets))
}

// RunStatus reports whether live dry-runs are available (LLM key configured), so
// the client can show/hide the run button without a billable call.
func (h *AgentflowHandler) RunStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": h.executor.Enabled()})
}

// runRequest is the body of POST /agentflow/run.
type runRequest struct {
	Graph agentflow.Graph `json:"graph"`
	Input string          `json:"input"`
}

// Run executes the workflow live and streams Server-Sent Events (one per step).
// Key-gated and rate-limited, with the "enabled?" and limit checks before any
// token is spent — same ordering as the assistant.
func (h *AgentflowHandler) Run(c *gin.Context) {
	if !h.executor.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "agent runtime not configured"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}
	var req runRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	graph, err := h.service.PrepareGraph(req.Graph)
	if err != nil {
		writeWorkflowError(c, err)
		return
	}
	input := req.Input
	if input == "" {
		input = "Hello — what can this system do?"
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	events := make(chan agentruntime.Event, 64)
	go func() {
		defer close(events)
		_, _ = h.executor.Run(c.Request.Context(), graph, agentruntime.Options{Input: input}, func(ev agentruntime.Event) {
			events <- ev
		})
	}()

	c.Stream(func(w io.Writer) bool {
		ev, ok := <-events
		if !ok {
			return false
		}
		c.SSEvent("message", ev)
		return true
	})
}

// Chat is the incremental Agent Studio assistant: it proposes granular workflow
// edits ({reply, actions[]}) the client previews and applies — the agentflow
// analog of the infra /assistant endpoint. Guest-friendly but key-gated and
// rate-limited, with the "enabled?" and limit checks before any token is spent.
func (h *AgentflowHandler) Chat(c *gin.Context) {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "workflow assistant not configured"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}
	var req agentflow.ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	resp, err := h.service.Chat(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, agentflow.ErrDisabled) {
			c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "workflow assistant not configured"})
			return
		}
		// ErrInvalid here means the model returned an unparseable response — a bad
		// upstream answer, so 502 rather than 422 (the user's input was fine).
		c.JSON(http.StatusBadGateway, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// --- account-only CRUD ---

func (h *AgentflowHandler) List(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}
	if items == nil {
		items = []agentflow.Workflow{}
	}
	c.JSON(http.StatusOK, gin.H{"workflows": items})
}

func (h *AgentflowHandler) Get(c *gin.Context) {
	item, err := h.service.Get(c.Request.Context(), middleware.GetUserID(c), c.Param("id"))
	if err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *AgentflowHandler) Create(c *gin.Context) {
	var in agentflow.WorkflowInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	item, err := h.service.Create(c.Request.Context(), middleware.GetUserID(c), in)
	if err != nil {
		writeWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *AgentflowHandler) Update(c *gin.Context) {
	var in agentflow.WorkflowInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	item, err := h.service.Update(c.Request.Context(), middleware.GetUserID(c), c.Param("id"), in)
	if err != nil {
		writeWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *AgentflowHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), middleware.GetUserID(c), c.Param("id")); err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// Generate returns an AI-authored draft workflow (not persisted) for the editor.
// Account-only, key-gated, and rate-limited.
func (h *AgentflowHandler) Generate(c *gin.Context) {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "workflow generator not configured"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}
	var in agentflow.GenerateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	draft, err := h.service.GenerateDraft(c.Request.Context(), in)
	if err != nil {
		writeWorkflowError(c, err)
		return
	}
	c.JSON(http.StatusOK, draft)
}

// writeWorkflowError maps domain errors to status codes: invalid input → 422,
// disabled runtime → 503, missing/foreign workflow → 404, else 502/500.
func writeWorkflowError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, agentflow.ErrInvalid):
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{Error: err.Error()})
	case errors.Is(err, agentflow.ErrDisabled):
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: err.Error()})
	default:
		handleRepositoryError(c, err)
	}
}
