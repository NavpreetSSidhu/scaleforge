// Package runtime is a small Go-native engine that actually executes an agentic
// workflow — the "LangGraph in Go" dry-run behind Agent Studio's live-run panel.
// Independent branches run concurrently (errgroup), the whole run is bounded by a
// context deadline, LLM steps retry with backoff, and a retriever step queries the
// real pure-Go vector index. LLM calls go through the same assist.Provider seam as
// the rest of ScaleForge, so it's enabled only when an API key is configured.
package runtime

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/scaleforge/scaleforge/internal/agentflow"
	"github.com/scaleforge/scaleforge/internal/assist"
)

// Executor runs workflows. A nil provider means LLM nodes can't run (Enabled is
// false); the handler gates on that before starting a run.
type Executor struct {
	cat      *agentflow.Catalog
	provider assist.Provider
}

func NewExecutor(cat *agentflow.Catalog, provider assist.Provider) *Executor {
	return &Executor{cat: cat, provider: provider}
}

// textCompleter is the optional plain-text completion path. Agent LLM steps emit
// natural language, not JSON, so when the provider supports it (the Groq provider
// does) we use CompleteText to avoid forcing JSON mode.
type textCompleter interface {
	CompleteText(ctx context.Context, system, user string) (string, error)
}

// complete calls the provider in text mode when available, else falls back to the
// JSON-mode Complete (e.g. test fakes that only implement the base interface).
func (e *Executor) complete(ctx context.Context, system, user string) (string, error) {
	if tc, ok := e.provider.(textCompleter); ok {
		return tc.CompleteText(ctx, system, user)
	}
	return e.provider.Complete(ctx, system, user)
}

// Enabled reports whether live runs are available (an LLM provider is configured).
func (e *Executor) Enabled() bool { return e.provider != nil }

// Options configures one run.
type Options struct {
	Input       string
	Timeout     time.Duration
	Concurrency int
}

// Run executes the workflow, streaming Events via emit (called from multiple
// goroutines — it is serialized internally). It returns the final answer. The
// graph is assumed already validated/normalized by the caller.
func (e *Executor) Run(ctx context.Context, g agentflow.Graph, opt Options, emit func(Event)) (string, error) {
	if e.provider == nil {
		return "", agentflow.ErrDisabled
	}
	timeout := opt.Timeout
	if timeout <= 0 || timeout > 60*time.Second {
		timeout = 45 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var emitMu sync.Mutex
	safeEmit := func(ev Event) {
		emitMu.Lock()
		emit(ev)
		emitMu.Unlock()
	}

	executed, activePred, activeSucc, routeChoice := plan(g, opt.Input)

	// A single retriever (built lazily) shared by all retriever nodes in this run.
	var retOnce sync.Once
	var ret *vectorRetriever
	retrieverFor := func(n agentflow.Node) *vectorRetriever {
		retOnce.Do(func() { ret = newVectorRetriever(n.Config.IndexType, n.Config.Quantization) })
		return ret
	}

	outputs := make(map[string]string)
	var outMu sync.Mutex
	getInput := func(id string) string {
		outMu.Lock()
		defer outMu.Unlock()
		var parts []string
		for _, p := range activePred[id] {
			if v := outputs[p]; v != "" {
				parts = append(parts, v)
			}
		}
		return strings.Join(parts, "\n")
	}
	setOutput := func(id, v string) {
		outMu.Lock()
		outputs[id] = v
		outMu.Unlock()
	}

	// Wave scheduler: run all currently-ready nodes concurrently, then release
	// their successors. Independent branches execute in parallel.
	indeg := make(map[string]int, len(executed))
	for id := range executed {
		indeg[id] = len(activePred[id])
	}
	var ready []string
	for id := range executed {
		if indeg[id] == 0 {
			ready = append(ready, id)
		}
	}
	ready = stableOrder(g, ready)

	concurrency := opt.Concurrency
	if concurrency <= 0 {
		concurrency = 4
	}

	for len(ready) > 0 {
		var eg errgroup.Group
		eg.SetLimit(concurrency)
		for _, id := range ready {
			id := id
			node, _ := nodeByID(g, id)
			eg.Go(func() error {
				out, err := e.runNode(ctx, node, getInput(id), retrieverFor, routeChoice[id], safeEmit)
				if err != nil {
					return err
				}
				setOutput(id, out)
				return nil
			})
		}
		if err := eg.Wait(); err != nil {
			safeEmit(Event{Type: EventError, Error: err.Error()})
			return "", err
		}
		// Release successors of everything that just finished.
		var next []string
		for _, id := range ready {
			for _, s := range activeSucc[id] {
				indeg[s]--
				if indeg[s] == 0 {
					next = append(next, s)
				}
			}
		}
		ready = stableOrder(g, next)
	}

	final := finalAnswer(g, executed, outputs)
	safeEmit(Event{Type: EventDone, Output: final})
	return final, nil
}

// runNode executes one node and emits start/finish events. Returns the node's
// output text passed to successors.
func (e *Executor) runNode(ctx context.Context, n agentflow.Node, input string, retrieverFor func(agentflow.Node) *vectorRetriever, branch string, emit func(Event)) (string, error) {
	defs := e.cat.Map()
	def := defs[n.Type]
	emit(Event{Type: EventNodeStart, NodeID: n.ID, NodeType: n.Type, Label: labelOr(n.Label, def.Label)})
	start := time.Now()

	var out string
	var tokIn, tokOut int
	switch n.Type {
	case agentflow.TypeLLM:
		reply, ti, to, err := e.runLLM(ctx, n, def, input)
		if err != nil {
			emit(Event{Type: EventNodeFinish, NodeID: n.ID, NodeType: n.Type, Error: err.Error(), LatencyMs: msSince(start)})
			return "", fmt.Errorf("node %s (llm): %w", n.ID, err)
		}
		out, tokIn, tokOut = reply, ti, to
	case agentflow.TypeRetriever:
		out = retrieverFor(n).retrieve(input, n.Config.TopK)
	case agentflow.TypeTool:
		// Dry-run: tools are not actually invoked (no arbitrary code execution);
		// we echo a deterministic stand-in so downstream steps have something.
		out = fmt.Sprintf("[tool:%s output for %q]", orDefault(n.Config.ToolName, "tool"), truncate(input, 80))
	case agentflow.TypeRouter:
		emit(Event{Type: EventRoute, NodeID: n.ID, NodeType: n.Type, Label: labelOr(n.Label, def.Label), Branch: branch})
		out = input
	default:
		// input/output/guardrail/aggregator/loop/embedder — pass the context along.
		out = input
		if n.Type == agentflow.TypeInput && out == "" {
			out = input
		}
	}

	emit(Event{
		Type: EventNodeFinish, NodeID: n.ID, NodeType: n.Type, Label: labelOr(n.Label, def.Label),
		Output: truncate(out, 600), LatencyMs: msSince(start), TokensIn: tokIn, TokensOut: tokOut,
	})
	return out, nil
}

// runLLM calls the provider with up to 3 attempts and exponential backoff,
// honouring context cancellation. Tokens are estimated from text length (~4
// chars/token) since the provider returns only text.
func (e *Executor) runLLM(ctx context.Context, n agentflow.Node, def agentflow.NodeKind, input string) (reply string, tokIn, tokOut int, err error) {
	system := orDefault(n.Config.Prompt, def.DefaultConfig.Prompt)
	user := input
	if strings.TrimSpace(user) == "" {
		user = "Respond helpfully."
	}
	backoff := 250 * time.Millisecond
	for attempt := 0; attempt < 3; attempt++ {
		if ctx.Err() != nil {
			return "", 0, 0, ctx.Err()
		}
		reply, err = e.complete(ctx, system, user)
		if err == nil {
			return reply, estimateTokens(system + user), estimateTokens(reply), nil
		}
		select {
		case <-ctx.Done():
			return "", 0, 0, ctx.Err()
		case <-time.After(backoff):
			backoff *= 2
		}
	}
	return "", 0, 0, err
}

func estimateTokens(s string) int { return (len(s) + 3) / 4 }

func msSince(t time.Time) float64 { return float64(time.Since(t).Microseconds()) / 1000 }

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func labelOr(label, fallback string) string {
	if label != "" {
		return label
	}
	return fallback
}

func orDefault(v, fallback string) string {
	if strings.TrimSpace(v) != "" {
		return v
	}
	return fallback
}

func nodeByID(g agentflow.Graph, id string) (agentflow.Node, bool) {
	for _, n := range g.Nodes {
		if n.ID == id {
			return n, true
		}
	}
	return agentflow.Node{}, false
}
