package runtime

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/scaleforge/scaleforge/internal/agentflow"
)

// fakeProvider is a scripted assist.Provider for deterministic executor tests.
type fakeProvider struct {
	mu        sync.Mutex
	calls     int32
	reply     string
	failFirst int32 // fail this many initial calls (to exercise retries)
	delay     time.Duration
}

func (f *fakeProvider) Complete(ctx context.Context, system, user string) (string, error) {
	n := atomic.AddInt32(&f.calls, 1)
	if f.delay > 0 {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(f.delay):
		}
	}
	if n <= atomic.LoadInt32(&f.failFirst) {
		return "", errors.New("transient upstream error")
	}
	if f.reply != "" {
		return f.reply, nil
	}
	return "answer to: " + truncate(user, 40), nil
}

func mkNode(id, typ string) agentflow.Node {
	cat := agentflow.NewCatalog()
	return agentflow.Node{ID: id, Type: typ, Label: id, Config: cat.Map()[typ].DefaultConfig}
}

func collect(t *testing.T, ex *Executor, g agentflow.Graph, input string) ([]Event, string, error) {
	t.Helper()
	var mu sync.Mutex
	var events []Event
	final, err := ex.Run(context.Background(), g, Options{Input: input}, func(ev Event) {
		mu.Lock()
		events = append(events, ev)
		mu.Unlock()
	})
	return events, final, err
}

func TestExecutorRunsRAG(t *testing.T) {
	cat := agentflow.NewCatalog()
	fp := &fakeProvider{reply: "Redis caches reads."}
	ex := NewExecutor(cat, fp)
	g := agentflow.Graph{
		Nodes: []agentflow.Node{
			mkNode("in", agentflow.TypeInput),
			mkNode("ret", agentflow.TypeRetriever),
			mkNode("gen", agentflow.TypeLLM),
			mkNode("out", agentflow.TypeOutput),
		},
		Edges: []agentflow.Edge{
			{ID: "e1", Source: "in", Target: "ret"},
			{ID: "e2", Source: "ret", Target: "gen"},
			{ID: "e3", Source: "gen", Target: "out"},
		},
	}
	events, final, err := collect(t, ex, g, "how does caching help?")
	if err != nil {
		t.Fatalf("run failed: %v", err)
	}
	if final != "Redis caches reads." {
		t.Fatalf("final = %q", final)
	}
	// The retriever should have produced context from the vector engine (a finish
	// event with non-empty output).
	var retOut string
	for _, e := range events {
		if e.Type == EventNodeFinish && e.NodeID == "ret" {
			retOut = e.Output
		}
	}
	if retOut == "" {
		t.Fatalf("retriever produced no context")
	}
	if events[len(events)-1].Type != EventDone {
		t.Fatalf("last event should be done, got %s", events[len(events)-1].Type)
	}
}

func TestExecutorRetriesThenSucceeds(t *testing.T) {
	cat := agentflow.NewCatalog()
	fp := &fakeProvider{reply: "ok", failFirst: 2}
	ex := NewExecutor(cat, fp)
	g := agentflow.Graph{
		Nodes: []agentflow.Node{mkNode("in", agentflow.TypeInput), mkNode("gen", agentflow.TypeLLM)},
		Edges: []agentflow.Edge{{ID: "e1", Source: "in", Target: "gen"}},
	}
	_, final, err := collect(t, ex, g, "hi")
	if err != nil {
		t.Fatalf("expected retry success, got %v", err)
	}
	if final != "ok" {
		t.Fatalf("final = %q", final)
	}
	if atomic.LoadInt32(&fp.calls) != 3 {
		t.Fatalf("expected 3 attempts (2 fail + 1 ok), got %d", fp.calls)
	}
}

func TestExecutorRouterTakesLabeledBranch(t *testing.T) {
	cat := agentflow.NewCatalog()
	ex := NewExecutor(cat, &fakeProvider{reply: "x"})
	g := agentflow.Graph{
		Nodes: []agentflow.Node{
			mkNode("in", agentflow.TypeInput),
			mkNode("route", agentflow.TypeRouter),
			mkNode("a", agentflow.TypeOutput),
			mkNode("b", agentflow.TypeOutput),
		},
		Edges: []agentflow.Edge{
			{ID: "e1", Source: "in", Target: "route"},
			{ID: "e2", Source: "route", Target: "a", Label: "alpha"},
			{ID: "e3", Source: "route", Target: "b", Label: "beta"},
		},
	}
	events, _, err := collect(t, ex, g, "please take the beta path")
	if err != nil {
		t.Fatalf("run failed: %v", err)
	}
	var branch string
	executedB := false
	for _, e := range events {
		if e.Type == EventRoute {
			branch = e.Branch
		}
		if e.Type == EventNodeFinish && e.NodeID == "b" {
			executedB = true
		}
	}
	if branch != "beta" {
		t.Fatalf("router branch = %q, want beta", branch)
	}
	if !executedB {
		t.Fatalf("expected branch b to execute")
	}
}

func TestExecutorConcurrentBranches(t *testing.T) {
	cat := agentflow.NewCatalog()
	// Two LLM branches feeding an aggregator; with a per-call delay, concurrent
	// execution must finish in well under the serial sum.
	fp := &fakeProvider{reply: "ok", delay: 120 * time.Millisecond}
	ex := NewExecutor(cat, fp)
	g := agentflow.Graph{
		Nodes: []agentflow.Node{
			mkNode("in", agentflow.TypeInput),
			mkNode("a", agentflow.TypeLLM),
			mkNode("b", agentflow.TypeLLM),
			mkNode("agg", agentflow.TypeAggregator),
		},
		Edges: []agentflow.Edge{
			{ID: "e1", Source: "in", Target: "a"},
			{ID: "e2", Source: "in", Target: "b"},
			{ID: "e3", Source: "a", Target: "agg"},
			{ID: "e4", Source: "b", Target: "agg"},
		},
	}
	start := time.Now()
	_, _, err := collect(t, ex, g, "go")
	if err != nil {
		t.Fatalf("run failed: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 220*time.Millisecond {
		t.Fatalf("branches did not run concurrently: %v (expected ~120ms)", elapsed)
	}
}

func TestExecutorDisabledWithoutProvider(t *testing.T) {
	ex := NewExecutor(agentflow.NewCatalog(), nil)
	if ex.Enabled() {
		t.Fatal("executor should be disabled without a provider")
	}
	_, _, err := collect(t, ex, agentflow.Graph{Nodes: []agentflow.Node{mkNode("in", agentflow.TypeInput)}}, "x")
	if !errors.Is(err, agentflow.ErrDisabled) {
		t.Fatalf("expected ErrDisabled, got %v", err)
	}
}

var _ = strings.TrimSpace
