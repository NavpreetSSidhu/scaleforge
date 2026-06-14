package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/scaleforge/scaleforge/internal/tutor"
)

// GetProgress returns a learner's progress in one course, or a zero-value
// Progress (no completed steps) when they haven't started it.
func (s *Store) GetProgress(ctx context.Context, userID, courseSlug string) (tutor.Progress, error) {
	const query = `
		SELECT course_slug, completed_steps, completed, updated_at
		FROM lesson_progress
		WHERE user_id = $1 AND course_slug = $2
	`
	var p tutor.Progress
	var stepsJSON []byte
	err := s.pool.QueryRow(ctx, query, userID, courseSlug).
		Scan(&p.CourseSlug, &stepsJSON, &p.Completed, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return tutor.Progress{CourseSlug: courseSlug, CompletedSteps: []int{}}, nil
		}
		return tutor.Progress{}, fmt.Errorf("get progress: %w", err)
	}
	if err := json.Unmarshal(stepsJSON, &p.CompletedSteps); err != nil {
		return tutor.Progress{}, fmt.Errorf("decode completed steps: %w", err)
	}
	return p, nil
}

// ListProgress returns the learner's progress across all courses they've touched.
func (s *Store) ListProgress(ctx context.Context, userID string) ([]tutor.Progress, error) {
	const query = `
		SELECT course_slug, completed_steps, completed, updated_at
		FROM lesson_progress
		WHERE user_id = $1
		ORDER BY updated_at DESC
	`
	rows, err := s.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list progress: %w", err)
	}
	defer rows.Close()

	var out []tutor.Progress
	for rows.Next() {
		var p tutor.Progress
		var stepsJSON []byte
		if err := rows.Scan(&p.CourseSlug, &stepsJSON, &p.Completed, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan progress: %w", err)
		}
		if err := json.Unmarshal(stepsJSON, &p.CompletedSteps); err != nil {
			return nil, fmt.Errorf("decode completed steps: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// UpsertProgress writes (or overwrites) the learner's progress for a course.
func (s *Store) UpsertProgress(ctx context.Context, userID string, p tutor.Progress) error {
	steps := p.CompletedSteps
	if steps == nil {
		steps = []int{}
	}
	stepsJSON, err := json.Marshal(steps)
	if err != nil {
		return fmt.Errorf("encode completed steps: %w", err)
	}
	const query = `
		INSERT INTO lesson_progress (user_id, course_slug, completed_steps, completed, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (user_id, course_slug)
		DO UPDATE SET completed_steps = EXCLUDED.completed_steps,
		              completed = EXCLUDED.completed,
		              updated_at = NOW()
	`
	if _, err := s.pool.Exec(ctx, query, userID, p.CourseSlug, stepsJSON, p.Completed); err != nil {
		return fmt.Errorf("upsert progress: %w", err)
	}
	return nil
}
