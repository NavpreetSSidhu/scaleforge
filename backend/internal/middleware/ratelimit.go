package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// IPRateLimiter is a small, dependency-free fixed-window rate limiter keyed by
// client IP. It is intentionally simple (in-memory, single instance) — enough to
// blunt brute-force and abuse on a demo deployment without a Redis dependency.
// For a multi-instance deployment this would move to a shared store.
type IPRateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	counters map[string]*windowCounter
}

type windowCounter struct {
	count       int
	windowStart time.Time
}

// NewIPRateLimiter builds a limiter allowing `limit` requests per `window` per
// client, and starts a background sweep so idle IPs don't accumulate forever.
func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	rl := &IPRateLimiter{
		limit:    limit,
		window:   window,
		counters: make(map[string]*windowCounter),
	}
	go rl.sweep()
	return rl
}

// Allow reports whether a request from `key` is within the limit, counting it.
func (rl *IPRateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	wc, ok := rl.counters[key]
	if !ok || now.Sub(wc.windowStart) >= rl.window {
		rl.counters[key] = &windowCounter{count: 1, windowStart: now}
		return true
	}
	if wc.count >= rl.limit {
		return false
	}
	wc.count++
	return true
}

// Middleware enforces the limit per client IP, aborting with 429 when exceeded.
func (rl *IPRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !rl.Allow(c.ClientIP()) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit reached — please slow down and try again shortly",
			})
			return
		}
		c.Next()
	}
}

// sweep periodically drops counters whose window has fully elapsed, bounding
// memory under churn of distinct client IPs.
func (rl *IPRateLimiter) sweep() {
	ticker := time.NewTicker(rl.window)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		rl.mu.Lock()
		for key, wc := range rl.counters {
			if now.Sub(wc.windowStart) >= rl.window {
				delete(rl.counters, key)
			}
		}
		rl.mu.Unlock()
	}
}
