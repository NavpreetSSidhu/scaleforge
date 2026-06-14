package tutor

import (
	"context"
	"fmt"
	"time"
)

// ErrDisabled is returned by Explain/Ask when no LLM provider is configured (e.g.
// GROQ_API_KEY is unset). The handler maps it to a 503 so the frontend can hide
// the Teacher/Q&A entrypoints while authored lessons + animations still render.
var ErrDisabled = fmt.Errorf("tutor not configured")

// Message is one turn of conversation. Role is "user" or "assistant".
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ExplainRequest is the body of POST /tutor/explain. The Teacher persona answers
// in the context of the lesson step the learner is currently on; FocusComponent
// (a catalog component type) lets it explain "what is this node and why is it
// here". Question is an optional follow-up; when empty the Teacher elaborates on
// the step itself.
type ExplainRequest struct {
	CourseTitle    string    `json:"courseTitle"`
	StepTitle      string    `json:"stepTitle"`
	StepBody       string    `json:"stepBody"`
	FocusComponent string    `json:"focusComponent,omitempty"`
	Question       string    `json:"question,omitempty" binding:"max=2000"`
	History        []Message `json:"history,omitempty"`
}

// AskRequest is the body of POST /tutor/ask. The Q&A persona answers freeform
// questions about the topic with small concrete examples. CourseTitle is optional
// context (the course the learner is viewing).
type AskRequest struct {
	CourseTitle string    `json:"courseTitle,omitempty"`
	Question    string    `json:"question" binding:"required,max=2000"`
	History     []Message `json:"history,omitempty"`
}

// Reply is what both personas return: a single block of natural-language prose.
// (The LLM is asked to wrap it as {"reply": "..."} so we can reuse the provider's
// JSON mode unchanged; the service parses it back out.)
type Reply struct {
	Reply string `json:"reply"`
}

// Progress is a learner's state in one course: which step indices they've
// completed and whether the whole course is done.
type Progress struct {
	CourseSlug     string    `json:"courseSlug"`
	CompletedSteps []int     `json:"completedSteps"`
	Completed      bool      `json:"completed"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// Repository persists per-user course progress. The postgres Store satisfies it.
type Repository interface {
	GetProgress(ctx context.Context, userID, courseSlug string) (Progress, error)
	ListProgress(ctx context.Context, userID string) ([]Progress, error)
	UpsertProgress(ctx context.Context, userID string, p Progress) error
}
