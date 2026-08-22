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

// DefaultModel is a capable Groq model with JSON-mode support.
//
// Groq retires models on a rolling basis, and a retired default breaks every AI
// feature at once with a 404. When that happens, override it with ASSIST_MODEL
// rather than waiting on a release: `curl https://api.groq.com/openai/v1/models`
// with your key lists what your account can actually reach.
//
// (The previous default, llama-3.3-70b-versatile, was retired and did exactly
// that — hence the explicit unavailable-model error below.)
const DefaultModel = "openai/gpt-oss-120b"

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
	ResponseFormat map[string]string `json:"response_format,omitempty"`
}

type chatResponseBody struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Complete returns the model's reply in JSON mode — the model is constrained to
// emit a single JSON object, as the assistant/tutor/course contracts require.
func (p *GroqProvider) Complete(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	return p.complete(ctx, systemPrompt, userPrompt, true)
}

// CompleteText returns the model's reply as free-form prose (no JSON mode). The
// agent runtime uses this for LLM steps, whose output is natural language — Groq
// rejects JSON mode unless the prompt mentions "json", and agent prompts don't.
func (p *GroqProvider) CompleteText(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	return p.complete(ctx, systemPrompt, userPrompt, false)
}

func (p *GroqProvider) complete(ctx context.Context, systemPrompt, userPrompt string, jsonMode bool) (string, error) {
	body := chatRequestBody{
		Model: p.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.3,
	}
	if jsonMode {
		// JSON mode: the model must return a single JSON object matching our contract.
		body.ResponseFormat = map[string]string{"type": "json_object"}
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
		return "", p.describeHTTPError(resp.StatusCode, raw)
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

// describeHTTPError turns a provider error into something a developer can act on.
//
// The failures worth naming are the ones that look like an outage but are really
// configuration: a retired or unreachable model, and a bad key. Both otherwise
// surface as a raw JSON blob behind a 502, which reads like the feature is broken
// rather than like a setting needs changing.
func (p *GroqProvider) describeHTTPError(status int, raw []byte) error {
	var body struct {
		Error struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)

	switch {
	case body.Error.Code == "model_not_found" || status == http.StatusNotFound:
		return fmt.Errorf(
			"the configured model %q is not available on this account — set ASSIST_MODEL to one that is "+
				"(list them with: curl -H \"Authorization: Bearer $GROQ_API_KEY\" %s/models)",
			p.model, p.baseURL)
	case status == http.StatusUnauthorized:
		return fmt.Errorf("the LLM provider rejected the API key — check GROQ_API_KEY")
	case status == http.StatusTooManyRequests:
		return fmt.Errorf("the LLM provider is rate limiting — try again shortly")
	case body.Error.Message != "":
		return fmt.Errorf("assistant provider returned %d: %s", status, body.Error.Message)
	default:
		return fmt.Errorf("assistant provider returned %d: %s", status, string(raw))
	}
}
