package auth

import (
	"testing"
	"time"
)

func TestIssueAndParseRoundTrip(t *testing.T) {
	token, err := IssueToken("secret", "user-1", time.Hour)
	if err != nil {
		t.Fatalf("IssueToken() error = %v", err)
	}
	sub, err := ParseToken("secret", token)
	if err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}
	if sub != "user-1" {
		t.Errorf("subject = %q, want user-1", sub)
	}
}

func TestParseRejectsWrongSecret(t *testing.T) {
	token, _ := IssueToken("secret", "user-1", time.Hour)
	if _, err := ParseToken("different-secret", token); err == nil {
		t.Error("expected a signature mismatch to fail")
	}
}

func TestParseRejectsExpiredToken(t *testing.T) {
	token, _ := IssueToken("secret", "user-1", -time.Minute)
	if _, err := ParseToken("secret", token); err == nil {
		t.Error("expected an expired token to fail")
	}
}

func TestParseRejectsMalformedToken(t *testing.T) {
	for _, bad := range []string{"", "a.b", "not-a-token", "a.b.c.d"} {
		if _, err := ParseToken("secret", bad); err == nil {
			t.Errorf("expected %q to be rejected", bad)
		}
	}
}
