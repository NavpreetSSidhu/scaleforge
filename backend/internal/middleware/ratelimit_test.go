package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestIPRateLimiterAllow(t *testing.T) {
	rl := NewIPRateLimiter(2, time.Minute)
	if !rl.Allow("1.2.3.4") {
		t.Fatal("first request should be allowed")
	}
	if !rl.Allow("1.2.3.4") {
		t.Fatal("second request should be allowed")
	}
	if rl.Allow("1.2.3.4") {
		t.Fatal("third request should be blocked")
	}
	// A different client is tracked independently.
	if !rl.Allow("5.6.7.8") {
		t.Fatal("a different IP should have its own budget")
	}
}

func TestIPRateLimiterMiddleware429(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rl := NewIPRateLimiter(1, time.Minute)
	r := gin.New()
	r.GET("/x", rl.Middleware(), func(c *gin.Context) { c.Status(http.StatusOK) })

	codes := make([]int, 0, 2)
	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "9.9.9.9:1234"
		r.ServeHTTP(w, req)
		codes = append(codes, w.Code)
	}
	if codes[0] != http.StatusOK {
		t.Fatalf("first request should pass, got %d", codes[0])
	}
	if codes[1] != http.StatusTooManyRequests {
		t.Fatalf("second request should be 429, got %d", codes[1])
	}
}
