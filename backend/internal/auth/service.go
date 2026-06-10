package auth

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrEmailTaken         = errors.New("email already registered")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrWeakPassword       = errors.New("password must be at least 8 characters")
	ErrInvalidEmail       = errors.New("a valid email is required")
	ErrUserNotFound       = errors.New("user not found")
)

const minPasswordLen = 8

var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

// User is the public account shape returned to callers (never includes the hash).
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

// StoredUser is the persisted record, including the bcrypt hash for verification.
type StoredUser struct {
	User
	PasswordHash string
}

// UserRepository is the persistence contract the auth service depends on,
// implemented by the postgres store.
type UserRepository interface {
	CreateUser(ctx context.Context, email, name, passwordHash string) (*StoredUser, error)
	GetUserByEmail(ctx context.Context, email string) (*StoredUser, error)
	GetUserByID(ctx context.Context, id string) (*StoredUser, error)
}

// Service handles registration, authentication and token issuance.
type Service struct {
	repo      UserRepository
	jwtSecret string
	tokenTTL  time.Duration
}

func NewService(repo UserRepository, jwtSecret string, tokenTTL time.Duration) *Service {
	if tokenTTL <= 0 {
		tokenTTL = 7 * 24 * time.Hour
	}
	return &Service{repo: repo, jwtSecret: jwtSecret, tokenTTL: tokenTTL}
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// Signup validates input, creates the user with a bcrypt-hashed password and
// returns the public user plus a freshly minted token.
func (s *Service) Signup(ctx context.Context, email, name, password string) (*User, string, error) {
	email = normalizeEmail(email)
	if !emailPattern.MatchString(email) {
		return nil, "", ErrInvalidEmail
	}
	if len(password) < minPasswordLen {
		return nil, "", ErrWeakPassword
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = email[:strings.IndexByte(email, '@')]
	}

	if existing, _ := s.repo.GetUserByEmail(ctx, email); existing != nil {
		return nil, "", ErrEmailTaken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}

	stored, err := s.repo.CreateUser(ctx, email, name, string(hash))
	if err != nil {
		return nil, "", err
	}
	return s.issue(stored)
}

// Login verifies credentials and returns the public user plus a token.
func (s *Service) Login(ctx context.Context, email, password string) (*User, string, error) {
	email = normalizeEmail(email)
	stored, err := s.repo.GetUserByEmail(ctx, email)
	if err != nil || stored == nil || stored.PasswordHash == "" {
		return nil, "", ErrInvalidCredentials
	}
	if bcrypt.CompareHashAndPassword([]byte(stored.PasswordHash), []byte(password)) != nil {
		return nil, "", ErrInvalidCredentials
	}
	return s.issue(stored)
}

// UserByID resolves the account behind a token (used by /auth/me).
func (s *Service) UserByID(ctx context.Context, id string) (*User, error) {
	stored, err := s.repo.GetUserByID(ctx, id)
	if err != nil || stored == nil {
		return nil, ErrUserNotFound
	}
	return &stored.User, nil
}

// Verify is the TokenVerifier the HTTP middleware uses to authenticate requests.
func (s *Service) Verify(token string) (string, error) {
	return ParseToken(s.jwtSecret, token)
}

func (s *Service) issue(stored *StoredUser) (*User, string, error) {
	token, err := IssueToken(s.jwtSecret, stored.ID, s.tokenTTL)
	if err != nil {
		return nil, "", err
	}
	user := stored.User
	return &user, token, nil
}
