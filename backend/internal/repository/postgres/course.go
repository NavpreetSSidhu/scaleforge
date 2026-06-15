package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/scaleforge/scaleforge/internal/course"
	"github.com/scaleforge/scaleforge/internal/repository"
)

// scanner abstracts pgx.Row and pgx.Rows so one helper scans both.
type scanner interface {
	Scan(dest ...any) error
}

func scanCourse(row scanner) (course.Course, error) {
	var c course.Course
	var graphJSON, stepsJSON, solutionJSON []byte
	if err := row.Scan(
		&c.ID, &c.UserID, &c.Slug, &c.Title, &c.Summary,
		&c.Difficulty, &c.Category, &c.Kind,
		&graphJSON, &stepsJSON, &solutionJSON,
		&c.CreatedAt, &c.UpdatedAt,
	); err != nil {
		return course.Course{}, err
	}
	if err := json.Unmarshal(graphJSON, &c.Graph); err != nil {
		return course.Course{}, fmt.Errorf("decode course graph: %w", err)
	}
	if err := json.Unmarshal(stepsJSON, &c.Steps); err != nil {
		return course.Course{}, fmt.Errorf("decode course steps: %w", err)
	}
	if len(solutionJSON) > 0 {
		if err := json.Unmarshal(solutionJSON, &c.Solution); err != nil {
			return course.Course{}, fmt.Errorf("decode course solution: %w", err)
		}
	}
	c.IsCustom = true
	return c, nil
}

const courseColumns = `id, user_id, slug, title, summary, difficulty, category, kind, graph, steps, solution, created_at, updated_at`

func marshalCourse(c course.Course) (graph, steps, solution []byte, err error) {
	if graph, err = json.Marshal(c.Graph); err != nil {
		return
	}
	if steps, err = json.Marshal(c.Steps); err != nil {
		return
	}
	if c.Solution != nil {
		if solution, err = json.Marshal(c.Solution); err != nil {
			return
		}
	}
	return
}

func (s *Store) CreateCourse(ctx context.Context, userID string, c course.Course) (course.Course, error) {
	graphJSON, stepsJSON, solutionJSON, err := marshalCourse(c)
	if err != nil {
		return course.Course{}, err
	}
	now := time.Now().UTC()
	const query = `
		INSERT INTO courses (id, user_id, slug, title, summary, difficulty, category, kind, graph, steps, solution, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
		RETURNING ` + courseColumns
	row := s.pool.QueryRow(ctx, query,
		c.ID, userID, c.Slug, c.Title, c.Summary, c.Difficulty, c.Category, c.Kind,
		graphJSON, stepsJSON, solutionJSON, now)
	saved, err := scanCourse(row)
	if err != nil {
		return course.Course{}, fmt.Errorf("insert course: %w", err)
	}
	return saved, nil
}

func (s *Store) ListCourses(ctx context.Context, userID string) ([]course.Course, error) {
	const query = `SELECT ` + courseColumns + ` FROM courses WHERE user_id = $1 ORDER BY updated_at DESC`
	rows, err := s.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list courses: %w", err)
	}
	defer rows.Close()

	var out []course.Course
	for rows.Next() {
		c, err := scanCourse(rows)
		if err != nil {
			return nil, fmt.Errorf("scan course: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) GetCourse(ctx context.Context, userID, id string) (course.Course, error) {
	const query = `SELECT ` + courseColumns + ` FROM courses WHERE id = $1 AND user_id = $2`
	row := s.pool.QueryRow(ctx, query, id, userID)
	c, err := scanCourse(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return course.Course{}, repository.ErrNotFound
		}
		return course.Course{}, err
	}
	return c, nil
}

func (s *Store) UpdateCourse(ctx context.Context, userID, id string, c course.Course) (course.Course, error) {
	graphJSON, stepsJSON, solutionJSON, err := marshalCourse(c)
	if err != nil {
		return course.Course{}, err
	}
	const query = `
		UPDATE courses
		SET slug = $1, title = $2, summary = $3, difficulty = $4, category = $5, kind = $6,
		    graph = $7, steps = $8, solution = $9, updated_at = NOW()
		WHERE id = $10 AND user_id = $11
		RETURNING ` + courseColumns
	row := s.pool.QueryRow(ctx, query,
		c.Slug, c.Title, c.Summary, c.Difficulty, c.Category, c.Kind,
		graphJSON, stepsJSON, solutionJSON, id, userID)
	saved, err := scanCourse(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return course.Course{}, repository.ErrNotFound
		}
		return course.Course{}, fmt.Errorf("update course: %w", err)
	}
	return saved, nil
}

func (s *Store) DeleteCourse(ctx context.Context, userID, id string) error {
	const query = `DELETE FROM courses WHERE id = $1 AND user_id = $2`
	tag, err := s.pool.Exec(ctx, query, id, userID)
	if err != nil {
		return fmt.Errorf("delete course: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}
	return nil
}
