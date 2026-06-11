package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/assist"
	"github.com/scaleforge/scaleforge/internal/middleware"
)

// AssistHandler exposes the AI architecture assistant. It is guest-friendly but
// rate-limited per client so the free LLM provider quota isn't exhausted.
type AssistHandler struct {
	service *assist.Service
	limiter *middleware.IPRateLimiter
}

func NewAssistHandler(service *assist.Service) *AssistHandler {
	return &AssistHandler{
		service: service,
		// 10 requests per minute per client keeps casual use smooth while
		// protecting the shared free-tier quota from abuse. The check lives in the
		// handler (not route middleware) so a disabled assistant still answers 503
		// rather than spending a rate-limit token.
		limiter: middleware.NewIPRateLimiter(10, time.Minute),
	}
}

// Status reports whether the assistant is configured, so the client can show or
// hide its entrypoint without making a billable LLM call.
func (h *AssistHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": h.service.Enabled()})
}

func (h *AssistHandler) Chat(c *gin.Context) {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "assistant not configured"})
		return
	}

	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}

	var req assist.ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	resp, err := h.service.Chat(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, assist.ErrDisabled) {
			c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "assistant not configured"})
			return
		}
		c.JSON(http.StatusBadGateway, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}
