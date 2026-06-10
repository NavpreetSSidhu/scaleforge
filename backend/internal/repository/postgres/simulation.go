package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/scaleforge/scaleforge/internal/repository"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

func (s *Store) CreateSimulation(ctx context.Context, userID string, architectureID *string, result simulation.Result) (*simulation.Result, error) {
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}

	id := uuid.New().String()
	now := time.Now().UTC()

	const query = `
		INSERT INTO simulations (id, architecture_id, user_id, result, created_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`

	var archID any
	if architectureID != nil {
		archID = *architectureID
	}

	err = s.pool.QueryRow(ctx, query, id, archID, userID, resultJSON, now).
		Scan(&result.ID, &result.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert simulation: %w", err)
	}

	result.ArchitectureID = architectureID
	return &result, nil
}

func (s *Store) GetSimulation(ctx context.Context, userID, id string) (*simulation.Result, error) {
	const query = `
		SELECT architecture_id, result, created_at
		FROM simulations
		WHERE id = $1 AND user_id = $2
	`

	var architectureID *string
	var resultBytes []byte
	var createdAt time.Time

	err := s.pool.QueryRow(ctx, query, id, userID).
		Scan(&architectureID, &resultBytes, &createdAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}

	var result simulation.Result
	if err := json.Unmarshal(resultBytes, &result); err != nil {
		return nil, err
	}

	result.ID = id
	result.ArchitectureID = architectureID
	result.CreatedAt = createdAt
	return &result, nil
}
