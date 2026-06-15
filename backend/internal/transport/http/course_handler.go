package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/course"
	"github.com/scaleforge/scaleforge/internal/middleware"
)

// CourseHandler exposes CRUD for user-authored courses plus AI draft generation.
// All routes are account-only (mounted on the authed group); generation is
// additionally gated by the LLM key and rate-limited per client.
type CourseHandler struct {
	service *course.Service
	limiter *middleware.IPRateLimiter
}

func NewCourseHandler(service *course.Service) *CourseHandler {
	return &CourseHandler{
		service: service,
		// Same budget as the assistant/tutor: 10/min/client.
		limiter: middleware.NewIPRateLimiter(10, time.Minute),
	}
}

func (h *CourseHandler) List(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}
	if items == nil {
		items = []course.Course{}
	}
	c.JSON(http.StatusOK, gin.H{"courses": items})
}

func (h *CourseHandler) Get(c *gin.Context) {
	item, err := h.service.Get(c.Request.Context(), middleware.GetUserID(c), c.Param("id"))
	if err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *CourseHandler) Create(c *gin.Context) {
	var in course.CourseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	item, err := h.service.Create(c.Request.Context(), middleware.GetUserID(c), in)
	if err != nil {
		writeCourseError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *CourseHandler) Update(c *gin.Context) {
	var in course.CourseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	item, err := h.service.Update(c.Request.Context(), middleware.GetUserID(c), c.Param("id"), in)
	if err != nil {
		writeCourseError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *CourseHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), middleware.GetUserID(c), c.Param("id")); err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// Generate returns an AI-authored draft course (not persisted) for the editor.
func (h *CourseHandler) Generate(c *gin.Context) {
	if !h.service.Enabled() {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "course generator not configured"})
		return
	}
	if !h.limiter.Allow(c.ClientIP()) {
		c.JSON(http.StatusTooManyRequests, ErrorResponse{Error: "rate limit reached — please wait a moment"})
		return
	}
	var in course.GenerateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}
	draft, err := h.service.GenerateDraft(c.Request.Context(), in)
	if err != nil {
		writeCourseError(c, err)
		return
	}
	c.JSON(http.StatusOK, draft)
}

// writeCourseError maps domain errors to status codes: invalid input → 422,
// disabled generator → 503, missing/foreign course → 404, else 502/500.
func writeCourseError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, course.ErrInvalid):
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{Error: err.Error()})
	case errors.Is(err, course.ErrDisabled):
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: err.Error()})
	default:
		handleRepositoryError(c, err)
	}
}
