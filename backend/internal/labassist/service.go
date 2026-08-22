package labassist

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/scaleforge/scaleforge/internal/lab"
)

// ErrDisabled is returned when no LLM provider is configured, so the handler can
// answer 503 and the client can hide the entry point.
var ErrDisabled = fmt.Errorf("lab assistant not configured")

// ErrNoSession is returned when the session is unknown or not ready.
var ErrNoSession = fmt.Errorf("no live lab session")

// Provider is the LLM seam, matching the one the other AI features use.
type Provider interface {
	Complete(ctx context.Context, system, user string) (string, error)
}

// Labs is the slice of the lab manager this package needs. Taking an interface
// keeps the assistant testable without Docker.
type Labs interface {
	AssistContext(sessionID string) (lab.AssistContext, bool)
}

// Service answers questions about a running lab and proposes commands for it.
type Service struct {
	provider Provider
	labs     Labs
}

func NewService(provider Provider, labs Labs) *Service {
	return &Service{provider: provider, labs: labs}
}

// Enabled reports whether an LLM provider is configured.
func (s *Service) Enabled() bool { return s.provider != nil }

// Chat answers grounded in the live session: which lab it is, what tools the
// workstation has, which objectives are outstanding and why the checks say they
// are, and the tail of the user's own terminal.
func (s *Service) Chat(ctx context.Context, sessionID string, req ChatRequest) (Response, error) {
	if s.provider == nil {
		return Response{}, ErrDisabled
	}
	labCtx, ok := s.labs.AssistContext(sessionID)
	if !ok {
		return Response{}, ErrNoSession
	}

	raw, err := s.provider.Complete(ctx, systemPrompt(), userPrompt(labCtx, req))
	if err != nil {
		return Response{}, err
	}

	parsed, err := parseResponse(raw)
	if err != nil {
		return Response{}, err
	}
	parsed.Commands = sanitizeCommands(parsed.Commands)
	return parsed, nil
}

func systemPrompt() string {
	return strings.Join([]string{
		"You are the ScaleForge Labs assistant. The user is learning infrastructure inside a live",
		"container lab: real services on an isolated network, with a real shell into them.",
		"",
		"You do two things:",
		"1. EXPLAIN what is happening — concepts, command output, and errors — concretely and briefly.",
		"2. PROPOSE commands that move the user toward what they asked for.",
		"",
		"Rules:",
		"- Propose commands ONLY for the toolchain described in the context. They run in that",
		"  workstation's shell, so use its tools and assume its preset environment variables.",
		"- A conceptual question deserves an answer, not commands. Return an empty commands list",
		"  when the user is asking what something means rather than asking you to do something.",
		"- Prefer commands that show their work: a command whose output teaches something beats a",
		"  silent one. Split multi-step setup into separate commands so each result is visible.",
		"- Never propose anything that would destroy the environment the user is working in, and",
		"  never invent objectives — the lab's objectives are given to you.",
		"- Do not give away an objective's answer unless the user asks for it directly. If they are",
		"  stuck, explain the concept and what their own output is telling them first.",
		"",
		`Reply with JSON only: {"reply": "markdown text", "commands": [{"run": "...", "explain": "..."}]}`,
	}, "\n")
}

func userPrompt(c lab.AssistContext, req ChatRequest) string {
	var b strings.Builder

	fmt.Fprintf(&b, "LAB: %s\n%s\n", c.LabTitle, c.Blurb)
	if c.Fidelity == lab.FidelityEmulated {
		b.WriteString("This lab runs against an emulator, not the real cloud service. Say so if the\n" +
			"user asks something the emulator would not answer faithfully (limits, throughput,\n" +
			"eventual consistency timing).\n")
	}
	if len(c.Concepts) > 0 {
		fmt.Fprintf(&b, "CONCEPTS: %s\n", strings.Join(c.Concepts, ", "))
	}

	fmt.Fprintf(&b, "\nWORKSTATION SHELL: %s\n", c.Shell)
	if c.Toolchain != "" {
		fmt.Fprintf(&b, "AVAILABLE TOOLING: %s\n", c.Toolchain)
	}
	if len(c.Services) > 0 {
		names := make([]string, 0, len(c.Services))
		for _, svc := range c.Services {
			names = append(names, fmt.Sprintf("%s (%s)", svc.Name, svc.Image))
		}
		fmt.Fprintf(&b, "SERVICES ON THE LAB NETWORK, addressable by name: %s\n", strings.Join(names, ", "))
	}
	for _, ep := range c.Endpoints {
		fmt.Fprintf(&b, "PUBLISHED: %s at %s\n", ep.Label, ep.Address)
	}

	b.WriteString("\nOBJECTIVES:\n")
	for i, t := range c.Tasks {
		status := "outstanding"
		if t.Done {
			status = "complete"
		}
		fmt.Fprintf(&b, "%d. [%s] %s\n", i+1, status, t.Title)
		if !t.Done && t.Message != "" {
			fmt.Fprintf(&b, "   last check said: %s\n", t.Message)
		}
	}

	if tail := trimTerminal(req.Terminal); tail != "" {
		b.WriteString("\nTAIL OF THE USER'S TERMINAL (what they actually ran and saw):\n")
		b.WriteString("```\n" + tail + "\n```\n")
	}

	if len(req.History) > 0 {
		b.WriteString("\nCONVERSATION SO FAR:\n")
		for _, m := range req.History {
			fmt.Fprintf(&b, "%s: %s\n", m.Role, m.Content)
		}
	}

	fmt.Fprintf(&b, "\nUSER: %s\n", req.Message)
	return b.String()
}

// terminalTailBytes bounds how much scrollback reaches the model — enough for the
// last few commands and their output, without spending the context window on it.
const terminalTailBytes = 4000

func trimTerminal(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= terminalTailBytes {
		return s
	}
	tail := s[len(s)-terminalTailBytes:]
	// Start at a line boundary so the excerpt doesn't open mid-token.
	if i := strings.IndexByte(tail, '\n'); i >= 0 && i < len(tail)-1 {
		tail = tail[i+1:]
	}
	return tail
}

// maxCommands caps a single turn. A reply proposing dozens of commands is a model
// losing the plot, and the user cannot meaningfully review that many at once.
const maxCommands = 8

// sanitizeCommands drops empty proposals and caps the batch. Multi-line commands
// are deliberately left intact: a heredoc writing a Kubernetes manifest is one
// command, and flattening it would corrupt the YAML it is feeding to kubectl.
func sanitizeCommands(in []Command) []Command {
	out := make([]Command, 0, len(in))
	for _, c := range in {
		run := strings.TrimSpace(c.Run)
		if run == "" {
			continue
		}
		out = append(out, Command{Run: run, Explain: strings.TrimSpace(c.Explain)})
		if len(out) == maxCommands {
			break
		}
	}
	return out
}

func parseResponse(raw string) (Response, error) {
	var parsed Response
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		// Models occasionally ignore JSON mode. Two failure shapes, both worth
		// recovering from rather than surfacing as an error: the object wrapped in
		// commentary, and a plain-prose answer with no envelope at all. In both
		// cases the model said something useful, and showing it beats discarding it.
		obj := extractJSONObject(raw)
		if obj == "" {
			return Response{Reply: strings.TrimSpace(raw)}, nil
		}
		if err2 := json.Unmarshal([]byte(obj), &parsed); err2 != nil {
			// A malformed object is not prose; fall back to showing the whole reply.
			return Response{Reply: strings.TrimSpace(raw)}, nil
		}
	}
	if strings.TrimSpace(parsed.Reply) == "" && len(parsed.Commands) == 0 {
		parsed.Reply = strings.TrimSpace(raw)
	}
	return parsed, nil
}

// extractJSONObject returns the outermost {...} span, or "" if there isn't one.
func extractJSONObject(s string) string {
	start := strings.IndexByte(s, '{')
	end := strings.LastIndexByte(s, '}')
	if start < 0 || end <= start {
		return ""
	}
	return s[start : end+1]
}
