package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Minimal HS256 JWT implementation on the standard library — enough to issue and
// verify our own session tokens without pulling in a third-party dependency.

var (
	// ErrInvalidToken is returned for malformed, mis-signed or expired tokens.
	ErrInvalidToken = errors.New("invalid token")
)

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

type jwtClaims struct {
	Sub string `json:"sub"`
	Iat int64  `json:"iat"`
	Exp int64  `json:"exp"`
}

func b64(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func sign(secret, signingInput string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	return b64(mac.Sum(nil))
}

// IssueToken mints a signed token for userID valid for ttl.
func IssueToken(secret, userID string, ttl time.Duration) (string, error) {
	now := time.Now()
	header, err := json.Marshal(jwtHeader{Alg: "HS256", Typ: "JWT"})
	if err != nil {
		return "", err
	}
	claims, err := json.Marshal(jwtClaims{
		Sub: userID,
		Iat: now.Unix(),
		Exp: now.Add(ttl).Unix(),
	})
	if err != nil {
		return "", err
	}

	signingInput := b64(header) + "." + b64(claims)
	return signingInput + "." + sign(secret, signingInput), nil
}

// ParseToken verifies the signature and expiry and returns the subject (userID).
func ParseToken(secret, token string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", ErrInvalidToken
	}

	signingInput := parts[0] + "." + parts[1]
	expected := sign(secret, signingInput)
	// Constant-time compare guards against signature-timing attacks.
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return "", ErrInvalidToken
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", ErrInvalidToken
	}
	var claims jwtClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", ErrInvalidToken
	}
	if claims.Sub == "" || time.Now().Unix() >= claims.Exp {
		return "", ErrInvalidToken
	}

	return claims.Sub, nil
}
