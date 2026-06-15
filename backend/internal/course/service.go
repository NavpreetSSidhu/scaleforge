package course

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/scaleforge/scaleforge/internal/catalog"
)

// Service owns user-authored courses: CRUD with server-side validation, and AI
// generation of draft courses. Validation is shared by the manual and AI paths,
// so a saved course always satisfies the invariants the player depends on.
type Service struct {
	provider Provider
	catalog  *catalog.Service
	repo     Repository
}

// NewService wires the course service. A nil provider disables AI generation
// (Enabled reports false, GenerateDraft returns ErrDisabled); CRUD works either
// way.
func NewService(provider Provider, cat *catalog.Service, repo Repository) *Service {
	return &Service{provider: provider, catalog: cat, repo: repo}
}

// Enabled reports whether AI generation is available (an LLM provider is set).
func (s *Service) Enabled() bool { return s.provider != nil }

// List returns the user's courses (newest first), each flagged IsCustom.
func (s *Service) List(ctx context.Context, userID string) ([]Course, error) {
	return s.repo.ListCourses(ctx, userID)
}

// Get returns one of the user's courses, or repository.ErrNotFound.
func (s *Service) Get(ctx context.Context, userID, id string) (Course, error) {
	return s.repo.GetCourse(ctx, userID, id)
}

// Create normalizes + validates the input, assigns a unique per-user slug, and
// persists a new course.
func (s *Service) Create(ctx context.Context, userID string, in CourseInput) (Course, error) {
	c := fromInput(in)
	normalize(&c, s.catalog)
	if err := validate(&c, s.catalog); err != nil {
		return Course{}, err
	}
	slug, err := s.uniqueSlug(ctx, userID, slugify(c.Title), "")
	if err != nil {
		return Course{}, err
	}
	c.ID = uuid.New().String()
	c.Slug = slug
	return s.repo.CreateCourse(ctx, userID, c)
}

// Update normalizes + validates the input and overwrites an existing course the
// user owns, refreshing its slug while keeping it unique.
func (s *Service) Update(ctx context.Context, userID, id string, in CourseInput) (Course, error) {
	c := fromInput(in)
	normalize(&c, s.catalog)
	if err := validate(&c, s.catalog); err != nil {
		return Course{}, err
	}
	slug, err := s.uniqueSlug(ctx, userID, slugify(c.Title), id)
	if err != nil {
		return Course{}, err
	}
	c.ID = id
	c.Slug = slug
	return s.repo.UpdateCourse(ctx, userID, id, c)
}

// Delete removes a course the user owns.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	return s.repo.DeleteCourse(ctx, userID, id)
}

// uniqueSlug picks a per-user-unique slug from base, appending -2, -3, … on
// collision. excludeID is the course being updated (so it doesn't clash itself).
func (s *Service) uniqueSlug(ctx context.Context, userID, base, excludeID string) (string, error) {
	existing, err := s.repo.ListCourses(ctx, userID)
	if err != nil {
		return "", err
	}
	taken := make(map[string]bool, len(existing))
	for _, c := range existing {
		if c.ID != excludeID {
			taken[c.Slug] = true
		}
	}
	if !taken[base] {
		return base, nil
	}
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s-%d", base, i)
		if !taken[candidate] {
			return candidate, nil
		}
	}
}

func fromInput(in CourseInput) Course {
	return Course{
		Title:      in.Title,
		Summary:    in.Summary,
		Difficulty: in.Difficulty,
		Category:   in.Category,
		Kind:       in.Kind,
		Graph:      in.Graph,
		Steps:      in.Steps,
		Solution:   in.Solution,
	}
}

// --- AI generation ---

// GenerateDraft asks the LLM for a complete course on the given topic, then
// normalizes + validates it. On an unparseable/invalid first attempt it makes a
// single repair round-trip echoing the error. The returned course is NOT saved
// (no id/slug/user) — the client loads it into the editor for review.
func (s *Service) GenerateDraft(ctx context.Context, in GenerateInput) (Course, error) {
	if s.provider == nil {
		return Course{}, ErrDisabled
	}
	kind := in.Kind
	if !kinds[kind] {
		kind = "system-design"
	}
	difficulty := in.Difficulty
	if !difficulties[difficulty] {
		difficulty = "Beginner"
	}

	system := s.generateSystemPrompt(kind)
	user := s.generateUserPrompt(in.Prompt, kind, difficulty)

	c, err := s.completeCourse(ctx, system, user)
	if err == nil {
		return c, nil
	}
	// One repair attempt: hand the model its own error and ask for valid JSON.
	repair := user + "\n\nYour previous attempt failed with: " + err.Error() +
		"\nReturn a corrected, complete JSON course that fixes this."
	return s.completeCourse(ctx, system, repair)
}

func (s *Service) completeCourse(ctx context.Context, system, user string) (Course, error) {
	raw, err := s.provider.Complete(ctx, system, user)
	if err != nil {
		return Course{}, err
	}
	payload := raw
	var draft Course
	if err := json.Unmarshal([]byte(payload), &draft); err != nil {
		if obj := extractJSONObject(raw); obj != "" {
			if err2 := json.Unmarshal([]byte(obj), &draft); err2 != nil {
				return Course{}, fmt.Errorf("%w: model returned unparseable JSON", ErrInvalid)
			}
		} else {
			return Course{}, fmt.Errorf("%w: model returned unparseable JSON", ErrInvalid)
		}
	}
	// Never trust the model with the persistence envelope.
	draft.ID, draft.UserID, draft.Slug, draft.IsCustom = "", "", "", false
	normalize(&draft, s.catalog)
	if err := validate(&draft, s.catalog); err != nil {
		return Course{}, err
	}
	return draft, nil
}

func (s *Service) generateSystemPrompt(kind string) string {
	var b strings.Builder
	b.WriteString(`You are ScaleForge's course author. You design short, interactive, animated lessons. Respond with a SINGLE JSON object (no prose, no markdown fences) with exactly these fields:

{
  "title": string,
  "summary": string,            // one or two sentences
  "category": string,           // short topic tag
  "kind": "system-design" | "lld",
  "graph": {
    "nodes": [ { "id": string, "type": string, "label": string, "position": {"x": number, "y": number} } ],
    "edges": [ { "id": string, "source": <node id>, "target": <node id> } ]
  },
  "steps": [
    {
      "id": string,
      "title": string,
      "body": string,           // markdown; explain the "why", keep it tight
      "revealNodeIds": [<node ids visible by this step, CUMULATIVE>],
      "revealEdgeIds": [<edge ids visible by this step, CUMULATIVE>],
      "focusNodeId": <a node id that is in this step's revealNodeIds>,
      "callout": string         // short bubble beside the focused node
    }
  ]`)
	if kind == "lld" {
		b.WriteString(`,
  "solution": { "language": "python", "code": string }  // full runnable reference implementation`)
	}
	b.WriteString(`
}

Rules:
- Build the diagram up step by step: each step's revealNodeIds/revealEdgeIds is the cumulative set visible so far (step 1 reveals 1 node; the last step reveals everything).
- focusNodeId MUST appear in that step's revealNodeIds.
- Every edge source/target MUST be a node id you defined.
- Lay nodes out left-to-right / top-to-bottom on a canvas roughly 0..800 wide, 0..500 tall.
- Aim for 4-7 steps and 3-6 nodes.
`)
	if kind == "lld" {
		b.WriteString(`- This is a LOW-LEVEL DESIGN course. Use ONLY these abstract node types: ` + strings.Join(lldTypes, ", ") + `. Put runnable Python in the "solution" field and short code snippets (fenced) in step bodies.
`)
	} else {
		b.WriteString("- This is a SYSTEM-DESIGN course. Node \"type\" MUST be one of the real catalog components below — never invent a type.\n\n")
		s.writeCatalog(&b)
	}
	return b.String()
}

func (s *Service) generateUserPrompt(prompt, kind, difficulty string) string {
	return fmt.Sprintf("Author a %s course at %s difficulty about: %s", kind, difficulty, strings.TrimSpace(prompt))
}

// writeCatalog lists the infra component catalog so system-design generation
// references only real types — mirrors tutor.Service.writeCatalog.
func (s *Service) writeCatalog(b *strings.Builder) {
	b.WriteString("Component catalog (type — category — label):\n")
	defs := s.catalog.All()
	sort.Slice(defs, func(i, j int) bool { return defs[i].Type < defs[j].Type })
	for _, d := range defs {
		fmt.Fprintf(b, "- %s — %s — %s\n", d.Type, d.Category, d.Label)
	}
}

// extractJSONObject returns the substring spanning the first '{' to the last
// '}', a cheap salvage for models that wrap JSON in stray prose.
func extractJSONObject(s string) string {
	start := strings.IndexByte(s, '{')
	end := strings.LastIndexByte(s, '}')
	if start < 0 || end < 0 || end <= start {
		return ""
	}
	return s[start : end+1]
}
