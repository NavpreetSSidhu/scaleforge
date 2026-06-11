package assist

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Provider is the LLM seam. Complete sends a system + user prompt and returns the
// model's raw text reply (expected to be a JSON object per our contract). Keeping
// this an interface lets Groq be swapped for OpenRouter/Together/Ollama — or a
// fake in tests — without touching the service.
type Provider interface {
	Complete(ctx context.Context, systemPrompt, userPrompt string) (string, error)
}

// GroqProvider talks to Groq's OpenAI-compatible Chat Completions API. Groq
// offers a free tier and is wire-compatible with OpenAI, so the same struct works
// against other OpenAI-style endpoints by changing baseURL.
type GroqProvider struct {
	apiKey  string
	model   string
	baseURL string
	client  *http.Client
}

// GroqBaseURL is Groq's OpenAI-compatible endpoint root.
const GroqBaseURL = "https://api.groq.com/openai/v1"

// DefaultModel is a capable, free-tier Groq model with JSON-mode support.
const DefaultModel = "llama-3.3-70b-versatile"

// NewGroqProvider builds a Groq-backed provider. An empty model falls back to
// DefaultModel.
func NewGroqProvider(apiKey, model string) *GroqProvider {
	if model == "" {
		model = DefaultModel
	}
	return &GroqProvider{
		apiKey:  apiKey,
		model:   model,
		baseURL: GroqBaseURL,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequestBody struct {
	Model          string            `json:"model"`
	Messages       []chatMessage     `json:"messages"`
	Temperature    float64           `json:"temperature"`
	ResponseFormat map[string]string `json:"response_format"`
}

type chatResponseBody struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *GroqProvider) Complete(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	body := chatRequestBody{
		Model: p.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.3,
		// JSON mode: the model must return a single JSON object matching our contract.
		ResponseFormat: map[string]string{"type": "json_object"},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("assistant provider returned %d: %s", resp.StatusCode, string(raw))
	}

	var parsed chatResponseBody
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("decoding assistant response: %w", err)
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("assistant provider error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("assistant returned no choices")
	}
	return parsed.Choices[0].Message.Content, nil
}
