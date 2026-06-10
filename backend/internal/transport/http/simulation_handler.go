package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

type SimulationHandler struct {
	service *simulation.Service
}

func NewSimulationHandler(service *simulation.Service) *SimulationHandler {
	return &SimulationHandler{service: service}
}

func (h *SimulationHandler) Simulate(c *gin.Context) {
	var req simulation.SimulateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	result, err := h.service.Run(c.Request.Context(), middleware.GetUserID(c), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *SimulationHandler) Get(c *gin.Context) {
	result, err := h.service.Get(c.Request.Context(), middleware.GetUserID(c), c.Param("id"))
	if err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
