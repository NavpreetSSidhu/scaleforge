package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/scaleforge/scaleforge/internal/auth"
)

const uniqueViolation = "23505"

// CreateUser inserts a new account, surfacing a duplicate email as ErrEmailTaken.
func (s *Store) CreateUser(ctx context.Context, email, name, passwordHash string) (*auth.StoredUser, error) {
	const query = `
		INSERT INTO users (email, name, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id, email, name, created_at
	`
	var u auth.StoredUser
	err := s.pool.QueryRow(ctx, query, email, name, passwordHash).
		Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
			return nil, auth.ErrEmailTaken
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}
	u.PasswordHash = passwordHash
	return &u, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*auth.StoredUser, error) {
	const query = `
		SELECT id, email, name, password_hash, created_at
		FROM users WHERE email = $1
	`
	return s.scanUser(s.pool.QueryRow(ctx, query, email))
}

func (s *Store) GetUserByID(ctx context.Context, id string) (*auth.StoredUser, error) {
	const query = `
		SELECT id, email, name, password_hash, created_at
		FROM users WHERE id = $1
	`
	return s.scanUser(s.pool.QueryRow(ctx, query, id))
}

func (s *Store) scanUser(row pgx.Row) (*auth.StoredUser, error) {
	var u auth.StoredUser
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, auth.ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}
