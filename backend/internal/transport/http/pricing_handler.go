package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/pricing"
)

type PricingHandler struct {
	catalog *pricing.Catalog
}

func NewPricingHandler(catalog *pricing.Catalog) *PricingHandler {
	return &PricingHandler{catalog: catalog}
}

// List returns the curated cloud providers with their category/region pricing
// so the client can offer a provider/region picker and label costs.
func (h *PricingHandler) List(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"providers":         h.catalog.All(),
		"defaultProviderId": string(pricing.DefaultProviderID),
	})
}
