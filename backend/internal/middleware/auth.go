package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// TokenVerifier turns a bearer token into a user ID, or an error if it's invalid.
// The auth service satisfies this, keeping the middleware decoupled from JWT details.
type TokenVerifier func(token string) (userID string, err error)

func bearerToken(c *gin.Context) string {
	header := c.GetHeader("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return strings.TrimSpace(parts[1])
	}
	return ""
}

// AuthOptional attaches the user ID when a valid token is present but lets
// unauthenticated (guest) requests through. Handlers branch on GetUserID.
func AuthOptional(verify TokenVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		if token := bearerToken(c); token != "" {
			if userID, err := verify(token); err == nil {
				c.Set(UserIDKey, userID)
			}
		}
		c.Next()
	}
}

// RequireAuth rejects any request without a valid token with 401.
func RequireAuth(verify TokenVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		userID, err := verify(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired session"})
			return
		}
		c.Set(UserIDKey, userID)
		c.Next()
	}
}
