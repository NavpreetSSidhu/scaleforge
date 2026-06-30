package http

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/achievements"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/simulation"
	"github.com/scaleforge/scaleforge/internal/simulation/livesim"
)

type SimulationHandler struct {
	service      *simulation.Service
	catalog      *catalog.Service
	achievements *achievements.Service
}

// NewSimulationHandler wires the simulation service. The catalog and achievements
// services are optional (may be nil) — when both are present, each run also
// evaluates and unlocks achievements and returns the newly earned ones.
func NewSimulationHandler(service *simulation.Service, cat *catalog.Service, ach *achievements.Service) *SimulationHandler {
	return &SimulationHandler{service: service, catalog: cat, achievements: ach}
}

// simulateResponse embeds the simulation result and adds any achievements
// unlocked by this run. Embedding flattens the result fields into the JSON, so
// the response is shape-compatible with a bare Result plus `newAchievements`.
type simulateResponse struct {
	simulation.Result
	NewAchievements []achievements.Achievement `json:"newAchievements,omitempty"`
}

func (h *SimulationHandler) Simulate(c *gin.Context) {
	var req simulation.SimulateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	userID := middleware.GetUserID(c)
	result, err := h.service.Run(c.Request.Context(), userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	resp := simulateResponse{Result: *result}
	if h.achievements != nil && h.catalog != nil {
		input := h.buildEvalInput(result, req)
		if userID == "" {
			// Guests get the celebration but no persistence.
			resp.NewAchievements = h.achievements.EvaluateEphemeral(input)
		} else if unlocked, syncErr := h.achievements.Sync(c.Request.Context(), userID, input); syncErr == nil {
			resp.NewAchievements = unlocked
		}
		// A failure to record achievements must never fail the simulation itself.
	}

	c.JSON(http.StatusOK, resp)
}

// Compare evaluates several scenarios and returns each result plus per-metric
// winners. Like Simulate it is guest-friendly and never persists.
func (h *SimulationHandler) Compare(c *gin.Context) {
	var req simulation.CompareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	if len(req.Scenarios) < 2 {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: "at least two scenarios are required to compare"})
		return
	}

	c.JSON(http.StatusOK, h.service.Compare(req))
}

// Chaos injects a failure scenario (killed nodes, region outage, traffic spike)
// and returns the degraded result, an availability verdict, and the
// architecture's resilience score + single points of failure. Like Simulate it
// is guest-friendly and never persists.
func (h *SimulationHandler) Chaos(c *gin.Context) {
	var req simulation.ChaosRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, h.service.Chaos(req))
}

// liveSimulateRequest is the body of POST /simulate/live. It mirrors a simulate
// request and adds the knobs the discrete-event run exposes to the UI; zero
// values fall back to livesim's defaults.
type liveSimulateRequest struct {
	Graph        simulation.Graph          `json:"graph"`
	Traffic      simulation.TrafficProfile `json:"traffic"`
	DurationSec  float64                   `json:"durationSec,omitempty"`
	SpeedFactor  float64                   `json:"speedFactor,omitempty"`
	ArrivalScale float64                   `json:"arrivalScale,omitempty"`
	MaxRetries   *int                      `json:"maxRetries,omitempty"`
	Seed         int64                     `json:"seed,omitempty"`
}

// LiveSimulate runs the discrete-event simulator and streams one Server-Sent
// Event per tick, so the canvas can animate queues building, tails stretching,
// and load shedding in real time. Guest-friendly and pure (no LLM, no DB); it
// shares the sim rate limit applied at the route. Mirrors the Agent Studio Run
// streaming pattern. A default SpeedFactor paces the run to wall-clock time so
// the build-up plays out rather than completing instantly.
func (h *SimulationHandler) LiveSimulate(c *gin.Context) {
	var req liveSimulateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	opts := livesim.Options{
		DurationSec:  req.DurationSec,
		SpeedFactor:  req.SpeedFactor,
		ArrivalScale: req.ArrivalScale,
		Seed:         req.Seed,
	}
	// Pace to wall-clock by default so the animation is watchable; the client may
	// override with a higher SpeedFactor (or 0 for as-fast-as-possible).
	if req.SpeedFactor == 0 {
		opts.SpeedFactor = 4
	}
	if req.MaxRetries != nil {
		opts.MaxRetries = *req.MaxRetries
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	ctx := c.Request.Context()
	ticks := make(chan livesim.Tick, 64)
	go func() {
		defer close(ticks)
		livesim.Run(ctx, req.Graph, req.Traffic, h.catalog.Map(), opts, func(t livesim.Tick) {
			// Don't block forever pushing ticks if the client has disconnected.
			select {
			case ticks <- t:
			case <-ctx.Done():
			}
		})
	}()

	c.Stream(func(w io.Writer) bool {
		t, ok := <-ticks
		if !ok {
			return false
		}
		c.SSEvent("message", t)
		return true
	})
}

func (h *SimulationHandler) Get(c *gin.Context) {
	result, err := h.service.Get(c.Request.Context(), middleware.GetUserID(c), c.Param("id"))
	if err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// buildEvalInput maps a simulation result + request into the achievements
// evaluator's input, resolving node categories via the catalog.
func (h *SimulationHandler) buildEvalInput(result *simulation.Result, req simulation.SimulateRequest) achievements.EvalInput {
	defs := h.catalog.Map()

	categories := make([]string, 0, len(req.Graph.Nodes))
	regions := make([]string, 0, len(req.Graph.Nodes))
	for _, node := range req.Graph.Nodes {
		if def, ok := defs[node.Type]; ok {
			categories = append(categories, def.Category)
		}
		if node.Config.Region != "" {
			regions = append(regions, node.Config.Region)
		}
	}

	bottleneckCategory := ""
	if result.Bottleneck != nil {
		if def, ok := defs[result.Bottleneck.NodeType]; ok {
			bottleneckCategory = def.Category
		}
	}

	return achievements.EvalInput{
		NodeCount:          len(req.Graph.Nodes),
		IncomingRPS:        result.IncomingRPS,
		SystemCapacity:     result.SystemCapacity,
		MonthlyCost:        result.MonthlyCost,
		DailyActiveUsers:   req.Traffic.DailyActiveUsers,
		CostEfficiency:     result.Scores.CostEfficiency,
		Categories:         categories,
		Regions:            regions,
		BottleneckCategory: bottleneckCategory,
	}
}
