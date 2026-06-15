package course

import "context"

// Provider is the LLM seam for AI course generation. It is intentionally
// identical in shape to assist.Provider / tutor.Provider so the existing
// *assist.GroqProvider satisfies all three without an import cycle — the router
// builds one Groq provider and shares it. A fake is used in tests.
type Provider interface {
	Complete(ctx context.Context, systemPrompt, userPrompt string) (string, error)
}
