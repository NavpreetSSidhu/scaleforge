package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/runtime"
)

type RuntimeHandler struct {
	catalog *runtime.Catalog
}

func NewRuntimeHandler(catalog *runtime.Catalog) *RuntimeHandler {
	return &RuntimeHandler{catalog: catalog}
}

// List returns the curated language/runtime performance coefficients plus the
// default runtime and a provenance note, so the client can offer a runtime picker
// and a "across runtimes" comparison with an honest citation.
func (h *RuntimeHandler) List(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"runtimes":         h.catalog.All(),
		"defaultRuntimeId": runtime.DefaultRuntimeID,
		"provenance":       runtime.ProvenanceNote,
	})
}
