package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/tutor"
)

// TutorHandler exposes the Learn module's two AI personas (Teacher + Q&A) and
// per-user course progress. The AI endpoints are guest-friendly but rate-limited
// per client so the free LLM quota isn't exhausted; progress endpoints are
// account-only and mounted on the authed group.
type TutorHandler struct {
	service *tutor.Service
	limiter *middleware.IPRateLimiter
}

func NewTutorHandler(service *tutor.Service) *TutorHandler {
	return &TutorHandler{
		service: service,
		// Same budget as the assistant: 10/min/client. The check lives in the
		// handler so a disabled tutor answers 503 before spending a token.
		limiter: middleware.NewIPRateLimiter(10, time.Minute),
	}
}

// Status reports whether the AI personas are configured, so the client can show
// or hide the Teacher/Q&A entrypoints without a billable call.
func (h *TutorHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": h.service.Enabled()})
}

// Explain is the Teacher persona — elaborates on the current lesson step.
func (h *TutorHandler) Explain(c *gin.Context) {
	if !h.guard(c) {
		return
	}
	var req tutor.ExplainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	h.reply(c, func() (tutor.Reply, error) {
		return h.service.Explain(c.Request.Context(), req)
	})
}

// Ask is the separate Q&A agent — answers freeform questions with examples.
func (h *TutorHandler) Ask(c *gin.Context) {
	if !h.guard(c) {
		return
	}
	var req tutor.AskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	h.reply(c, func() (tutor.Reply, error) {
		return h.service.Ask(c.Request.Context(), req)
	})
}

// guard enforces "configured?" then the rate limit, writing the response and
// returning false when the request should not proceed.
func (h *TutorHandler) guard(c *gin.Context) bool {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "tutor not configured"})
		return false
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return false
	}
	return true
}

func (h *TutorHandler) reply(c *gin.Context, run func() (tutor.Reply, error)) {
	resp, err := run()
	if err != nil {
		if errors.Is(err, tutor.ErrDisabled) {
			c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "tutor not configured"})
			return
		}
		c.JSON(http.StatusBadGateway, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ListProgress returns the signed-in learner's progress across all courses.
func (h *TutorHandler) ListProgress(c *gin.Context) {
	items, err := h.service.ListProgress(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}
	if items == nil {
		items = []tutor.Progress{}
	}
	c.JSON(http.StatusOK, gin.H{"progress": items})
}

// UpdateProgress upserts the learner's progress for one course.
func (h *TutorHandler) UpdateProgress(c *gin.Context) {
	var body struct {
		CompletedSteps []int `json:"completedSteps"`
		Completed      bool  `json:"completed"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	p := tutor.Progress{
		CourseSlug:     c.Param("slug"),
		CompletedSteps: body.CompletedSteps,
		Completed:      body.Completed,
	}
	if err := h.service.UpsertProgress(c.Request.Context(), middleware.GetUserID(c), p); err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}
	saved, err := h.service.GetProgress(c.Request.Context(), middleware.GetUserID(c), p.CourseSlug)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, saved)
}
