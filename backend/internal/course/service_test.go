package course

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

// fakeRepo is an in-memory Repository for service tests.
type fakeRepo struct {
	courses []Course
}

func (r *fakeRepo) CreateCourse(_ context.Context, _ string, c Course) (Course, error) {
	r.courses = append(r.courses, c)
	return c, nil
}
func (r *fakeRepo) ListCourses(_ context.Context, _ string) ([]Course, error) { return r.courses, nil }
func (r *fakeRepo) GetCourse(_ context.Context, _, _ string) (Course, error)  { return Course{}, nil }
func (r *fakeRepo) UpdateCourse(_ context.Context, _, _ string, c Course) (Course, error) {
	return c, nil
}
func (r *fakeRepo) DeleteCourse(_ context.Context, _, _ string) error { return nil }

// fakeProvider returns a canned completion.
type fakeProvider struct{ reply string }

func (p fakeProvider) Complete(_ context.Context, _, _ string) (string, error) { return p.reply, nil }

func validSystemDesignInput() CourseInput {
	return CourseInput{
		Title:      "Caching 101",
		Kind:       "system-design",
		Difficulty: "Beginner",
		Graph: simulation.Graph{
			Nodes: []simulation.Node{
				{ID: "svc", Type: "api_service", Label: "API"},
				{ID: "cache", Type: "redis_cache", Label: "Cache"},
			},
			Edges: []simulation.Edge{{ID: "e1", Source: "svc", Target: "cache"}},
		},
		Steps: []Step{
			{Title: "Service", RevealNodeIDs: []string{"svc"}, FocusNodeID: "svc"},
			{Title: "Add cache", RevealNodeIDs: []string{"svc", "cache"}, RevealEdgeIDs: []string{"e1"}, FocusNodeID: "cache"},
		},
	}
}

func newService(provider Provider) (*Service, *fakeRepo) {
	repo := &fakeRepo{}
	return NewService(provider, catalog.NewService(), repo), repo
}

func TestCreate_ValidSystemDesign(t *testing.T) {
	svc, repo := newService(nil)
	c, err := svc.Create(context.Background(), "u1", validSystemDesignInput())
	if err != nil {
		t.Fatalf("expected valid course, got %v", err)
	}
	if c.Slug != "caching-101" {
		t.Fatalf("unexpected slug %q", c.Slug)
	}
	if c.ID == "" || len(repo.courses) != 1 {
		t.Fatalf("course was not persisted with an id")
	}
}

func TestCreate_RejectsUnknownComponent(t *testing.T) {
	svc, _ := newService(nil)
	in := validSystemDesignInput()
	in.Graph.Nodes[0].Type = "not_a_real_type"
	_, err := svc.Create(context.Background(), "u1", in)
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid for unknown type, got %v", err)
	}
}

func TestCreate_RejectsFocusNotRevealed(t *testing.T) {
	svc, _ := newService(nil)
	in := validSystemDesignInput()
	in.Steps[0].FocusNodeID = "cache" // not in this step's revealNodeIds
	_, err := svc.Create(context.Background(), "u1", in)
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid for unrevealed focus, got %v", err)
	}
}

func TestCreate_UniqueSlugPerUser(t *testing.T) {
	svc, _ := newService(nil)
	if _, err := svc.Create(context.Background(), "u1", validSystemDesignInput()); err != nil {
		t.Fatal(err)
	}
	c2, err := svc.Create(context.Background(), "u1", validSystemDesignInput())
	if err != nil {
		t.Fatal(err)
	}
	if c2.Slug != "caching-101-2" {
		t.Fatalf("expected de-duped slug, got %q", c2.Slug)
	}
}

func TestGenerateDraft_DisabledWithoutProvider(t *testing.T) {
	svc, _ := newService(nil)
	_, err := svc.GenerateDraft(context.Background(), GenerateInput{Prompt: "x"})
	if !errors.Is(err, ErrDisabled) {
		t.Fatalf("expected ErrDisabled, got %v", err)
	}
}

func TestGenerateDraft_ParsesAndValidates(t *testing.T) {
	reply := `Here is your course: {
		"title":"Consistent Hashing","summary":"ring","category":"Scaling","kind":"system-design",
		"graph":{"nodes":[{"id":"lb","type":"load_balancer","label":"LB"},{"id":"svc","type":"api_service","label":"API"}],
		"edges":[{"id":"e1","source":"lb","target":"svc"}]},
		"steps":[{"id":"s1","title":"LB","revealNodeIds":["lb"],"revealEdgeIds":[],"focusNodeId":"lb"},
		{"id":"s2","title":"Service","revealNodeIds":["lb","svc"],"revealEdgeIds":["e1"],"focusNodeId":"svc"}]}`
	svc, _ := newService(fakeProvider{reply: reply})
	draft, err := svc.GenerateDraft(context.Background(), GenerateInput{Prompt: "consistent hashing", Kind: "system-design"})
	if err != nil {
		t.Fatalf("expected valid draft, got %v", err)
	}
	if draft.Title != "Consistent Hashing" || len(draft.Steps) != 2 {
		t.Fatalf("unexpected draft: %+v", draft)
	}
	if draft.ID != "" || draft.Slug != "" {
		t.Fatalf("draft must not carry persistence envelope")
	}
	// Node left at origin should have been auto-laid-out and given a config.
	if draft.Graph.Nodes[1].Config.CPU == 0 {
		t.Fatalf("expected catalog default config to be filled")
	}
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"LRU Cache!!":          "lru-cache",
		"  Rate Limiter (v2) ": "rate-limiter-v2",
		"???":                  "course",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestGenerateSystemPrompt_LLDUsesAbstractTypes(t *testing.T) {
	svc, _ := newService(fakeProvider{})
	p := svc.generateSystemPrompt("lld")
	if !strings.Contains(p, "lld_class") || strings.Contains(p, "redis_cache") {
		t.Fatalf("LLD prompt should advertise lld_ types and omit the infra catalog")
	}
}
