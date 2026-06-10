package cost

import "github.com/scaleforge/scaleforge/internal/catalog"

type Calculator struct {
	catalog *catalog.Service
}

func NewCalculator(catalog *catalog.Service) *Calculator {
	return &Calculator{catalog: catalog}
}

func (c *Calculator) MonthlyCost(graph Graph) float64 {
	defs := c.catalog.Map()
	var total float64

	for _, node := range graph.Nodes {
		def, ok := defs[node.Type]
		if !ok {
			continue
		}

		instances := node.Config.Replicas
		if instances <= 0 {
			instances = 1
		}

		total += def.UnitMonthlyCostUsd * float64(instances)
	}

	return total
}
