package repository

import (
	"context"
	"errors"
	"time"

	"github.com/scaleforge/scaleforge/internal/simulation"
)

var ErrNotFound = errors.New("not found")

type Architecture struct {
	ID        string                    `json:"id"`
	UserID    string                    `json:"userId"`
	Name      string                    `json:"name"`
	Graph     simulation.Graph          `json:"graph"`
	Traffic   simulation.TrafficProfile `json:"traffic"`
	CreatedAt time.Time                 `json:"createdAt"`
	UpdatedAt time.Time                 `json:"updatedAt"`
}

type CreateArchitectureRequest struct {
	Name    string                    `json:"name" binding:"required"`
	Graph   simulation.Graph          `json:"graph" binding:"required"`
	Traffic simulation.TrafficProfile `json:"traffic"`
}

type UpdateArchitectureRequest struct {
	Name    string                    `json:"name" binding:"required"`
	Graph   simulation.Graph          `json:"graph" binding:"required"`
	Traffic simulation.TrafficProfile `json:"traffic"`
}

type ArchitectureRepository interface {
	CreateArchitecture(ctx context.Context, userID string, req CreateArchitectureRequest) (*Architecture, error)
	ListArchitectures(ctx context.Context, userID string) ([]Architecture, error)
	GetArchitecture(ctx context.Context, userID, id string) (*Architecture, error)
	UpdateArchitecture(ctx context.Context, userID, id string, req UpdateArchitectureRequest) (*Architecture, error)
	DeleteArchitecture(ctx context.Context, userID, id string) error
}

type HealthChecker interface {
	Ping(ctx context.Context) error
}
