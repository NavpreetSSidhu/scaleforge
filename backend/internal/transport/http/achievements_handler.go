package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/achievements"
	"github.com/scaleforge/scaleforge/internal/middleware"
)

type AchievementsHandler struct {
	service *achievements.Service
}

func NewAchievementsHandler(service *achievements.Service) *AchievementsHandler {
	return &AchievementsHandler{service: service}
}

// List returns every achievement with the signed-in user's unlock state.
func (h *AchievementsHandler) List(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"achievements": items})
}
