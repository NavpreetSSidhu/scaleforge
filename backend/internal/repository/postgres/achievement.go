package postgres

import (
	"context"
	"fmt"
	"time"
)

func (s *Store) ListUnlocked(ctx context.Context, userID string) (map[string]time.Time, error) {
	const query = `
		SELECT achievement_id, unlocked_at
		FROM user_achievements
		WHERE user_id = $1
	`
	rows, err := s.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("query achievements: %w", err)
	}
	defer rows.Close()

	unlocked := make(map[string]time.Time)
	for rows.Next() {
		var id string
		var at time.Time
		if err := rows.Scan(&id, &at); err != nil {
			return nil, fmt.Errorf("scan achievement: %w", err)
		}
		unlocked[id] = at
	}
	return unlocked, rows.Err()
}

func (s *Store) Unlock(ctx context.Context, userID string, ids []string) ([]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	// Insert all candidate IDs; RETURNING yields only the rows that did not yet
	// exist, so the caller learns exactly which achievements are new.
	const query = `
		INSERT INTO user_achievements (user_id, achievement_id)
		SELECT $1, unnest($2::text[])
		ON CONFLICT (user_id, achievement_id) DO NOTHING
		RETURNING achievement_id
	`
	rows, err := s.pool.Query(ctx, query, userID, ids)
	if err != nil {
		return nil, fmt.Errorf("insert achievements: %w", err)
	}
	defer rows.Close()

	var newlyUnlocked []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan unlocked achievement: %w", err)
		}
		newlyUnlocked = append(newlyUnlocked, id)
	}
	return newlyUnlocked, rows.Err()
}
