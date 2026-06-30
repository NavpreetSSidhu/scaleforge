package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/interview"
	"github.com/scaleforge/scaleforge/internal/middleware"
)

// InterviewHandler exposes the AI System Design Interviewer. Start (topic +
// prompt) is static and always works; the AI turns (Turn/Grade) are key-gated
// and rate-limited, with the "configured?" check before any token is spent.
type InterviewHandler struct {
	service *interview.Service
	limiter *middleware.IPRateLimiter
}

func NewInterviewHandler(service *interview.Service) *InterviewHandler {
	return &InterviewHandler{
		service: service,
		limiter: middleware.NewIPRateLimiter(10, time.Minute),
	}
}

// Status reports whether the AI turns are available and returns the topic bank,
// so the client can render the topic picker even when AI grading is off.
func (h *InterviewHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": h.service.Enabled(), "topics": h.service.Topics()})
}

// Start returns a curated prompt + session id. No LLM call.
func (h *InterviewHandler) Start(c *gin.Context) {
	var req interview.StartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, h.service.Start(req))
}

// Turn produces the interviewer's next probing reply.
func (h *InterviewHandler) Turn(c *gin.Context) {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "interviewer not configured"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}
	var req interview.TurnRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	resp, err := h.service.Turn(c.Request.Context(), req)
	if err != nil {
		writeInterviewError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Grade returns the final rubric assessment.
func (h *InterviewHandler) Grade(c *gin.Context) {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "interviewer not configured"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}
	var req interview.GradeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	resp, err := h.service.Grade(c.Request.Context(), req)
	if err != nil {
		writeInterviewError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func writeInterviewError(c *gin.Context, err error) {
	if errors.Is(err, interview.ErrDisabled) {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "interviewer not configured"})
		return
	}
	// A bad upstream answer (unparseable model output) is a 502, not the user's fault.
	c.JSON(http.StatusBadGateway, ErrorResponse{Error: err.Error()})
}
