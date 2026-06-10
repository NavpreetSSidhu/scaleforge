package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	CORSOrigin  string
	GinMode     string
	DevUserID   string
	JWTSecret   string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://scaleforge:scaleforge@localhost:5432/scaleforge?sslmode=disable"),
		CORSOrigin:  getEnv("CORS_ORIGIN", "http://localhost:5173"),
		GinMode:     getEnv("GIN_MODE", "debug"),
		DevUserID:   getEnv("DEV_USER_ID", "00000000-0000-0000-0000-000000000001"),
		JWTSecret:   getEnv("JWT_SECRET", "dev-insecure-secret-change-me"),
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
