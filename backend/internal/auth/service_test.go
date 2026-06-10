package auth

import (
	"context"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// fakeUserRepo is an in-memory UserRepository keyed by email.
type fakeUserRepo struct {
	byEmail map[string]*StoredUser
	byID    map[string]*StoredUser
	seq     int
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{byEmail: map[string]*StoredUser{}, byID: map[string]*StoredUser{}}
}

func (f *fakeUserRepo) CreateUser(_ context.Context, email, name, passwordHash string) (*StoredUser, error) {
	if _, ok := f.byEmail[email]; ok {
		return nil, ErrEmailTaken
	}
	f.seq++
	u := &StoredUser{
		User:         User{ID: string(rune('a' + f.seq)), Email: email, Name: name},
		PasswordHash: passwordHash,
	}
	f.byEmail[email] = u
	f.byID[u.ID] = u
	return u, nil
}

func (f *fakeUserRepo) GetUserByEmail(_ context.Context, email string) (*StoredUser, error) {
	if u, ok := f.byEmail[email]; ok {
		return u, nil
	}
	return nil, ErrUserNotFound
}

func (f *fakeUserRepo) GetUserByID(_ context.Context, id string) (*StoredUser, error) {
	if u, ok := f.byID[id]; ok {
		return u, nil
	}
	return nil, ErrUserNotFound
}

func newTestService() (*Service, *fakeUserRepo) {
	repo := newFakeUserRepo()
	return NewService(repo, "test-secret", 0), repo
}

func TestSignupHashesPasswordAndIssuesToken(t *testing.T) {
	svc, repo := newTestService()

	user, token, err := svc.Signup(context.Background(), "Alice@Example.com ", "Alice", "supersecret")
	if err != nil {
		t.Fatalf("Signup() error = %v", err)
	}
	if user.Email != "alice@example.com" {
		t.Errorf("email = %q, want normalized alice@example.com", user.Email)
	}
	stored := repo.byEmail["alice@example.com"]
	if stored == nil || stored.PasswordHash == "supersecret" || stored.PasswordHash == "" {
		t.Fatal("password should be stored as a non-empty bcrypt hash, not plaintext")
	}
	if bcrypt.CompareHashAndPassword([]byte(stored.PasswordHash), []byte("supersecret")) != nil {
		t.Error("stored hash should verify against the original password")
	}
	if sub, err := ParseToken("test-secret", token); err != nil || sub != user.ID {
		t.Errorf("issued token should encode the user id; sub=%q err=%v", sub, err)
	}
}

func TestSignupRejectsDuplicateAndWeak(t *testing.T) {
	svc, _ := newTestService()
	if _, _, err := svc.Signup(context.Background(), "a@b.com", "A", "short"); err != ErrWeakPassword {
		t.Errorf("weak password err = %v, want ErrWeakPassword", err)
	}
	if _, _, err := svc.Signup(context.Background(), "not-an-email", "A", "longenough"); err != ErrInvalidEmail {
		t.Errorf("bad email err = %v, want ErrInvalidEmail", err)
	}
	if _, _, err := svc.Signup(context.Background(), "dup@b.com", "A", "longenough"); err != nil {
		t.Fatalf("first signup failed: %v", err)
	}
	if _, _, err := svc.Signup(context.Background(), "dup@b.com", "A", "longenough"); err != ErrEmailTaken {
		t.Errorf("duplicate err = %v, want ErrEmailTaken", err)
	}
}

func TestLoginVerifiesCredentials(t *testing.T) {
	svc, _ := newTestService()
	if _, _, err := svc.Signup(context.Background(), "bob@b.com", "Bob", "correcthorse"); err != nil {
		t.Fatalf("signup: %v", err)
	}

	if _, token, err := svc.Login(context.Background(), "bob@b.com", "correcthorse"); err != nil || token == "" {
		t.Errorf("valid login failed: err=%v token=%q", err, token)
	}
	if _, _, err := svc.Login(context.Background(), "bob@b.com", "wrong"); err != ErrInvalidCredentials {
		t.Errorf("wrong password err = %v, want ErrInvalidCredentials", err)
	}
	if _, _, err := svc.Login(context.Background(), "nobody@b.com", "whatever"); err != ErrInvalidCredentials {
		t.Errorf("unknown user err = %v, want ErrInvalidCredentials", err)
	}
}
