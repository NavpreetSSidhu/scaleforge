package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/review"
)

// ReviewHandler exposes the AI SRE / architecture reviewer. Like the assistant it
// is guest-friendly but rate-limited per client, and the "configured?" check runs
// before any token is spent so a disabled reviewer answers 503 rather than
// consuming a rate-limit slot.
type ReviewHandler struct {
	service *review.Service
	limiter *middleware.IPRateLimiter
}

func NewReviewHandler(service *review.Service) *ReviewHandler {
	return &ReviewHandler{
		service: service,
		limiter: middleware.NewIPRateLimiter(10, time.Minute),
	}
}

// Status reports whether the reviewer is configured, so the client can show or
// hide its entrypoint without making a billable LLM call.
func (h *ReviewHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": h.service.Enabled()})
}

// Review audits the architecture + measured results and returns severity-ranked
// findings with concrete, one-click fixes.
func (h *ReviewHandler) Review(c *gin.Context) {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "reviewer not configured"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}

	var req review.Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.Review(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, review.ErrDisabled) {
			c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "reviewer not configured"})
			return
		}
		// A bad upstream answer (unparseable model output) is a 502, not the user's fault.
		c.JSON(http.StatusBadGateway, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}
