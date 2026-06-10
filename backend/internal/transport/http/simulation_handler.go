package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/achievements"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/simulation"
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
