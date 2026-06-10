package cost

import (
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/pricing"
)

type Calculator struct {
	catalog *catalog.Service
	pricing *pricing.Catalog
}

func NewCalculator(catalog *catalog.Service, pricing *pricing.Catalog) *Calculator {
	return &Calculator{catalog: catalog, pricing: pricing}
}

// MonthlyCost prices the graph against the default provider (AWS).
func (c *Calculator) MonthlyCost(graph Graph) float64 {
	return c.MonthlyCostFor(graph, string(pricing.DefaultProviderID))
}

// MonthlyCostFor prices the graph against the given provider. Each node is
// priced by its category and region; an unknown provider falls back to AWS.
func (c *Calculator) MonthlyCostFor(graph Graph, providerID string) float64 {
	provider := c.pricing.ProviderOrDefault(providerID)
	defs := c.catalog.Map()
	var total float64

	for _, node := range graph.Nodes {
		def, ok := defs[node.Type]
		if !ok {
			continue
		}
		total += provider.NodeMonthlyCost(def.Category, node.Config.Region, def.UnitMonthlyCostUsd, node.Config.Replicas)
	}

	return total
}
