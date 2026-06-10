package simulation

import "context"

type Repository interface {
	CreateSimulation(ctx context.Context, userID string, architectureID *string, result Result) (*Result, error)
	GetSimulation(ctx context.Context, userID, id string) (*Result, error)
}
