package http

import (
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/sandbox"
)

// SandboxHandler exposes the Real Sandbox: it stands the design up as a live HTTP
// service and load-tests it. It's expensive (spawns a server + drives traffic),
// so it's tightly rate-limited and gated behind SANDBOX_ENABLED.
type SandboxHandler struct {
	service *sandbox.Service
	limiter *middleware.IPRateLimiter
}

func NewSandboxHandler(service *sandbox.Service) *SandboxHandler {
	return &SandboxHandler{
		service: service,
		limiter: middleware.NewIPRateLimiter(3, time.Minute),
	}
}

// Status reports whether the sandbox is enabled, so the client can hide the
// entrypoint when the feature is off.
func (h *SandboxHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": h.service.Enabled()})
}

// Run executes a load test and streams Server-Sent Events: lifecycle phases, a
// periodic progress snapshot, and a final measured-vs-predicted result.
func (h *SandboxHandler) Run(c *gin.Context) {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "sandbox not enabled"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}

	var req sandbox.Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	events, err := h.service.Run(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{Error: err.Error()})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	c.Stream(func(w io.Writer) bool {
		ev, ok := <-events
		if !ok {
			return false
		}
		c.SSEvent("message", ev)
		return true
	})
}
