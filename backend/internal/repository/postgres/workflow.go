package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/scaleforge/scaleforge/internal/agentflow"
	"github.com/scaleforge/scaleforge/internal/repository"
)

func scanWorkflow(row scanner) (agentflow.Workflow, error) {
	var w agentflow.Workflow
	var graphJSON []byte
	if err := row.Scan(
		&w.ID, &w.UserID, &w.Slug, &w.Name, &w.Description,
		&graphJSON, &w.CreatedAt, &w.UpdatedAt,
	); err != nil {
		return agentflow.Workflow{}, err
	}
	if err := json.Unmarshal(graphJSON, &w.Graph); err != nil {
		return agentflow.Workflow{}, fmt.Errorf("decode workflow graph: %w", err)
	}
	return w, nil
}

const workflowColumns = `id, user_id, slug, name, description, graph, created_at, updated_at`

func (s *Store) CreateWorkflow(ctx context.Context, userID string, w agentflow.Workflow) (agentflow.Workflow, error) {
	graphJSON, err := json.Marshal(w.Graph)
	if err != nil {
		return agentflow.Workflow{}, err
	}
	now := time.Now().UTC()
	const query = `
		INSERT INTO workflows (id, user_id, slug, name, description, graph, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
		RETURNING ` + workflowColumns
	row := s.pool.QueryRow(ctx, query, w.ID, userID, w.Slug, w.Name, w.Description, graphJSON, now)
	saved, err := scanWorkflow(row)
	if err != nil {
		return agentflow.Workflow{}, fmt.Errorf("insert workflow: %w", err)
	}
	return saved, nil
}

func (s *Store) ListWorkflows(ctx context.Context, userID string) ([]agentflow.Workflow, error) {
	const query = `SELECT ` + workflowColumns + ` FROM workflows WHERE user_id = $1 ORDER BY updated_at DESC`
	rows, err := s.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list workflows: %w", err)
	}
	defer rows.Close()

	var out []agentflow.Workflow
	for rows.Next() {
		w, err := scanWorkflow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan workflow: %w", err)
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (s *Store) GetWorkflow(ctx context.Context, userID, id string) (agentflow.Workflow, error) {
	const query = `SELECT ` + workflowColumns + ` FROM workflows WHERE id = $1 AND user_id = $2`
	row := s.pool.QueryRow(ctx, query, id, userID)
	w, err := scanWorkflow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return agentflow.Workflow{}, repository.ErrNotFound
		}
		return agentflow.Workflow{}, err
	}
	return w, nil
}

func (s *Store) UpdateWorkflow(ctx context.Context, userID, id string, w agentflow.Workflow) (agentflow.Workflow, error) {
	graphJSON, err := json.Marshal(w.Graph)
	if err != nil {
		return agentflow.Workflow{}, err
	}
	const query = `
		UPDATE workflows
		SET slug = $1, name = $2, description = $3, graph = $4, updated_at = NOW()
		WHERE id = $5 AND user_id = $6
		RETURNING ` + workflowColumns
	row := s.pool.QueryRow(ctx, query, w.Slug, w.Name, w.Description, graphJSON, id, userID)
	saved, err := scanWorkflow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return agentflow.Workflow{}, repository.ErrNotFound
		}
		return agentflow.Workflow{}, fmt.Errorf("update workflow: %w", err)
	}
	return saved, nil
}

func (s *Store) DeleteWorkflow(ctx context.Context, userID, id string) error {
	const query = `DELETE FROM workflows WHERE id = $1 AND user_id = $2`
	tag, err := s.pool.Exec(ctx, query, id, userID)
	if err != nil {
		return fmt.Errorf("delete workflow: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}
	return nil
}
