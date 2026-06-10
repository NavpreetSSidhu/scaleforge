package simulation

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/cost"
	"github.com/scaleforge/scaleforge/internal/pricing"
	"github.com/scaleforge/scaleforge/internal/scoring"
)

type Service struct {
	catalog    *catalog.Service
	calculator *cost.Calculator
	scorer     *scoring.Scorer
	simRepo    Repository
}

func NewService(
	catalog *catalog.Service,
	calculator *cost.Calculator,
	scorer *scoring.Scorer,
	simRepo Repository,
) *Service {
	return &Service{
		catalog:    catalog,
		calculator: calculator,
		scorer:     scorer,
		simRepo:    simRepo,
	}
}

// compute runs the full engine + cost + scoring pipeline for a request without
// any persistence. Both Run and Compare build on it so cost/scoring stay
// provider-aware and identical across the two paths.
func (s *Service) compute(req SimulateRequest) Result {
	result := runEngine(req.Graph, req.Traffic, s.catalog.Map())
	result.Provider = string(pricing.DefaultProviderID)
	if req.Provider != "" {
		result.Provider = req.Provider
	}
	result.MonthlyCost = s.calculator.MonthlyCostFor(toCostGraph(req.Graph), req.Provider)

	scores := s.scorer.Score(scoring.Metrics{
		IncomingRPS:      result.IncomingRPS,
		SystemCapacity:   result.SystemCapacity,
		EstimatedLatency: result.EstimatedLatency,
		MonthlyCost:      result.MonthlyCost,
	}, s.toScoringGraph(req.Graph))
	result.Scores = toSimulationScores(scores)
	result.CreatedAt = time.Now().UTC()
	return result
}

func (s *Service) Run(ctx context.Context, userID string, req SimulateRequest) (*Result, error) {
	result := s.compute(req)

	// Guests (no user) get a fully computed result that simply isn't persisted —
	// the simulations table requires an owning user.
	if userID == "" {
		result.ID = uuid.New().String()
		result.ArchitectureID = req.ArchitectureID
		return &result, nil
	}

	return s.simRepo.CreateSimulation(ctx, userID, req.ArchitectureID, result)
}

// Compare evaluates several scenarios (different architectures, providers, or
// traffic) and reports per-metric winners. Results are computed only — nothing
// is persisted — so comparison works for guests and signed-in users alike.
func (s *Service) Compare(req CompareRequest) Comparison {
	scenarios := make([]ScenarioResult, 0, len(req.Scenarios))
	for _, sc := range req.Scenarios {
		result := s.compute(SimulateRequest{Graph: sc.Graph, Traffic: sc.Traffic, Provider: sc.Provider})
		result.ID = uuid.New().String()
		scenarios = append(scenarios, ScenarioResult{Label: sc.Label, Provider: sc.Provider, Result: result})
	}
	return Comparison{Scenarios: scenarios, Winners: pickWinners(scenarios)}
}

func (s *Service) Get(ctx context.Context, userID, id string) (*Result, error) {
	return s.simRepo.GetSimulation(ctx, userID, id)
}

func toCostGraph(graph Graph) cost.Graph {
	nodes := make([]cost.Node, len(graph.Nodes))
	for i, node := range graph.Nodes {
		replicas := node.Config.Replicas
		if replicas <= 0 {
			replicas = 1
		}
		nodes[i] = cost.Node{
			Type: node.Type,
			Config: cost.NodeConfig{
				Replicas: replicas,
				Region:   node.Config.Region,
			},
		}
	}
	return cost.Graph{Nodes: nodes}
}

func (s *Service) toScoringGraph(graph Graph) scoring.Graph {
	defs := s.catalog.Map()
	nodes := make([]scoring.Node, len(graph.Nodes))
	for i, node := range graph.Nodes {
		nodes[i] = scoring.Node{
			Type:     node.Type,
			Category: defs[node.Type].Category,
			Config: scoring.NodeConfig{
				Replicas:    node.Config.Replicas,
				Autoscaling: node.Config.Autoscaling,
			},
		}
	}
	return scoring.Graph{Nodes: nodes}
}

func toSimulationScores(scores scoring.Scores) Scores {
	return Scores{
		Performance:     scores.Performance,
		Reliability:     scores.Reliability,
		Scalability:     scores.Scalability,
		CostEfficiency:  scores.CostEfficiency,
		Maintainability: scores.Maintainability,
		OverallGrade:    scores.OverallGrade,
	}
}
