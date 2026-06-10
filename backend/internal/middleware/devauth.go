package middleware

import (
	"github.com/gin-gonic/gin"
)

const UserIDKey = "userID"

func DevAuth(devUserID string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(UserIDKey, devUserID)
		c.Next()
	}
}

func GetUserID(c *gin.Context) string {
	if val, ok := c.Get(UserIDKey); ok {
		if userID, ok := val.(string); ok {
			return userID
		}
	}
	return ""
}
