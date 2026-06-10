package http

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/repository"
)

type ArchitectureHandler struct {
	archRepo repository.ArchitectureRepository
	catalog  *catalog.Service
	health   repository.HealthChecker
}

func NewArchitectureHandler(
	archRepo repository.ArchitectureRepository,
	catalog *catalog.Service,
	health repository.HealthChecker,
) *ArchitectureHandler {
	return &ArchitectureHandler{
		archRepo: archRepo,
		catalog:  catalog,
		health:   health,
	}
}

func (h *ArchitectureHandler) Health(c *gin.Context) {
	if err := h.health.Ping(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "database unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *ArchitectureHandler) GetCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"nodes": h.catalog.All()})
}

func (h *ArchitectureHandler) Create(c *gin.Context) {
	var req repository.CreateArchitectureRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	arch, err := h.archRepo.CreateArchitecture(c.Request.Context(), middleware.GetUserID(c), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusCreated, arch)
}

func (h *ArchitectureHandler) List(c *gin.Context) {
	archs, err := h.archRepo.ListArchitectures(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		return
	}

	if archs == nil {
		archs = []repository.Architecture{}
	}

	c.JSON(http.StatusOK, archs)
}

func (h *ArchitectureHandler) Get(c *gin.Context) {
	arch, err := h.archRepo.GetArchitecture(c.Request.Context(), middleware.GetUserID(c), c.Param("id"))
	if err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.JSON(http.StatusOK, arch)
}

func (h *ArchitectureHandler) Update(c *gin.Context) {
	var req repository.UpdateArchitectureRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		return
	}

	arch, err := h.archRepo.UpdateArchitecture(c.Request.Context(), middleware.GetUserID(c), c.Param("id"), req)
	if err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.JSON(http.StatusOK, arch)
}

func (h *ArchitectureHandler) Delete(c *gin.Context) {
	err := h.archRepo.DeleteArchitecture(c.Request.Context(), middleware.GetUserID(c), c.Param("id"))
	if err != nil {
		handleRepositoryError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func handleRepositoryError(c *gin.Context, err error) {
	if errors.Is(err, repository.ErrNotFound) {
		c.JSON(http.StatusNotFound, ErrorResponse{Error: "resource not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
}
