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
)

func (s *Store) CreateArchitecture(ctx context.Context, userID string, req repository.CreateArchitectureRequest) (*repository.Architecture, error) {
	graphJSON, err := json.Marshal(req.Graph)
	if err != nil {
		return nil, err
	}
	trafficJSON, err := json.Marshal(req.Traffic)
	if err != nil {
		return nil, err
	}

	id := uuid.New().String()
	now := time.Now().UTC()

	const query = `
		INSERT INTO architectures (id, user_id, name, graph, traffic, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, user_id, name, graph, traffic, created_at, updated_at
	`

	var arch repository.Architecture
	var graphBytes, trafficBytes []byte

	err = s.pool.QueryRow(ctx, query, id, userID, req.Name, graphJSON, trafficJSON, now, now).
		Scan(&arch.ID, &arch.UserID, &arch.Name, &graphBytes, &trafficBytes, &arch.CreatedAt, &arch.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert architecture: %w", err)
	}

	if err := json.Unmarshal(graphBytes, &arch.Graph); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(trafficBytes, &arch.Traffic); err != nil {
		return nil, err
	}

	return &arch, nil
}

func (s *Store) ListArchitectures(ctx context.Context, userID string) ([]repository.Architecture, error) {
	const query = `
		SELECT id, user_id, name, graph, traffic, created_at, updated_at
		FROM architectures
		WHERE user_id = $1
		ORDER BY updated_at DESC
	`

	rows, err := s.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list architectures: %w", err)
	}
	defer rows.Close()

	var result []repository.Architecture
	for rows.Next() {
		arch, err := scanArchitecture(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, *arch)
	}

	return result, rows.Err()
}

func (s *Store) GetArchitecture(ctx context.Context, userID, id string) (*repository.Architecture, error) {
	const query = `
		SELECT id, user_id, name, graph, traffic, created_at, updated_at
		FROM architectures
		WHERE id = $1 AND user_id = $2
	`

	row := s.pool.QueryRow(ctx, query, id, userID)
	arch, err := scanArchitectureRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return arch, nil
}

func (s *Store) UpdateArchitecture(ctx context.Context, userID, id string, req repository.UpdateArchitectureRequest) (*repository.Architecture, error) {
	graphJSON, err := json.Marshal(req.Graph)
	if err != nil {
		return nil, err
	}
	trafficJSON, err := json.Marshal(req.Traffic)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	const query = `
		UPDATE architectures
		SET name = $1, graph = $2, traffic = $3, updated_at = $4
		WHERE id = $5 AND user_id = $6
		RETURNING id, user_id, name, graph, traffic, created_at, updated_at
	`

	row := s.pool.QueryRow(ctx, query, req.Name, graphJSON, trafficJSON, now, id, userID)
	arch, err := scanArchitectureRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	return arch, nil
}

func (s *Store) DeleteArchitecture(ctx context.Context, userID, id string) error {
	const query = `DELETE FROM architectures WHERE id = $1 AND user_id = $2`

	tag, err := s.pool.Exec(ctx, query, id, userID)
	if err != nil {
		return fmt.Errorf("delete architecture: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}
	return nil
}
