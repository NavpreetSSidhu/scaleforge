package tutor

import "context"

// Provider is the LLM seam for the learning module. It is intentionally identical
// in shape to assist.Provider so the existing *assist.GroqProvider satisfies it
// without an import cycle — the router builds one Groq provider and hands it to
// both the assistant and the tutor. A fake implementation is used in tests.
type Provider interface {
	Complete(ctx context.Context, systemPrompt, userPrompt string) (string, error)
}
