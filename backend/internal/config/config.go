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
	// GroqAPIKey enables the AI assistant when set. Empty disables the feature.
	GroqAPIKey string
	// AssistModel overrides the LLM model used by the assistant.
	AssistModel string
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
		GroqAPIKey:  getEnv("GROQ_API_KEY", ""),
		AssistModel: getEnv("ASSIST_MODEL", ""),
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
