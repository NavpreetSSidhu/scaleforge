package course

import (
	"context"
	"errors"
	"time"

	"github.com/scaleforge/scaleforge/internal/simulation"
)

// ErrDisabled is returned by GenerateDraft when no LLM provider is configured
// (e.g. GROQ_API_KEY is unset). The handler maps it to a 503 so the client can
// hide the "Generate with AI" entrypoint while manual authoring still works.
var ErrDisabled = errors.New("course generator not configured")

// ErrInvalid wraps validation failures so the handler can answer 422. The
// wrapped message names the specific problem (unknown node type, dangling
// reveal id, …) for display in the editor.
var ErrInvalid = errors.New("invalid course")

// Allowed enums, mirroring the client's Course type.
var (
	difficulties = map[string]bool{"Beginner": true, "Intermediate": true, "Advanced": true}
	kinds        = map[string]bool{"system-design": true, "lld": true}
)

// Step is one lesson step: explanation prose plus the animation choreography —
// which nodes/edges are visible by this step (cumulative reveal), which node to
// spotlight, and an optional callout. Matches the client's CourseStep.
type Step struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Body          string   `json:"body"`
	RevealNodeIDs []string `json:"revealNodeIds"`
	RevealEdgeIDs []string `json:"revealEdgeIds"`
	FocusNodeID   string   `json:"focusNodeId,omitempty"`
	Callout       string   `json:"callout,omitempty"`
}

// Solution is the full reference implementation surfaced by LLD courses.
type Solution struct {
	Language string `json:"language"`
	Code     string `json:"code"`
}

// Course is a user-authored lesson, persisted server-side. The graph + steps
// shape is identical to the client's built-in Course so the existing player
// renders it unchanged; ID/UserID/timestamps are the persistence envelope.
type Course struct {
	ID         string           `json:"id"`
	UserID     string           `json:"userId"`
	Slug       string           `json:"slug"`
	Title      string           `json:"title"`
	Summary    string           `json:"summary"`
	Difficulty string           `json:"difficulty"`
	Category   string           `json:"category"`
	Kind       string           `json:"kind"`
	Graph      simulation.Graph `json:"graph"`
	Steps      []Step           `json:"steps"`
	Solution   *Solution        `json:"solution,omitempty"`
	// IsCustom is always true for persisted courses; it lets the client tell
	// user courses apart from the static built-ins in one merged catalog.
	IsCustom  bool      `json:"isCustom"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// CourseInput is the create/update payload from the editor. Title is required;
// everything else is normalized (defaults filled, ids generated) then validated.
type CourseInput struct {
	Title      string           `json:"title" binding:"required,max=140"`
	Summary    string           `json:"summary" binding:"max=400"`
	Difficulty string           `json:"difficulty"`
	Category   string           `json:"category" binding:"max=60"`
	Kind       string           `json:"kind"`
	Graph      simulation.Graph `json:"graph"`
	Steps      []Step           `json:"steps"`
	Solution   *Solution        `json:"solution,omitempty"`
}

// GenerateInput is the body of POST /courses/generate: a freeform topic plus the
// flavour/difficulty to author. The LLM fills a full draft the user then edits.
type GenerateInput struct {
	Prompt     string `json:"prompt" binding:"required,max=2000"`
	Kind       string `json:"kind"`
	Difficulty string `json:"difficulty"`
}

// Repository persists user courses. The postgres Store satisfies it; methods
// return repository.ErrNotFound for a missing/foreign course.
type Repository interface {
	CreateCourse(ctx context.Context, userID string, c Course) (Course, error)
	ListCourses(ctx context.Context, userID string) ([]Course, error)
	GetCourse(ctx context.Context, userID, id string) (Course, error)
	UpdateCourse(ctx context.Context, userID, id string, c Course) (Course, error)
	DeleteCourse(ctx context.Context, userID, id string) error
}
