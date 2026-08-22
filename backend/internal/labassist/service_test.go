package labassist

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/scaleforge/scaleforge/internal/lab"
)

// stubProvider records the prompts it was given and replays a canned completion,
// so the grounding can be asserted without a network call.
type stubProvider struct {
	reply  string
	err    error
	system string
	user   string
}

func (s *stubProvider) Complete(_ context.Context, system, user string) (string, error) {
	s.system, s.user = system, user
	return s.reply, s.err
}

// stubLabs stands in for the lab manager.
type stubLabs struct {
	ctx lab.AssistContext
	ok  bool
}

func (s stubLabs) AssistContext(string) (lab.AssistContext, bool) { return s.ctx, s.ok }

func liveContext() stubLabs {
	return stubLabs{
		ok: true,
		ctx: lab.AssistContext{
			LabID:     "kubernetes-workloads",
			LabTitle:  "Kubernetes: Deployments & Self-Healing",
			Blurb:     "A real single-node Kubernetes cluster in a container.",
			Fidelity:  lab.FidelityReal,
			Concepts:  []string{"Namespaces", "ReplicaSets"},
			Toolchain: "`kubectl` inside the k3s server container. No `jq`.",
			Shell:     "sh",
			Services:  []lab.Service{{Name: "k3s", Image: "rancher/k3s:latest"}},
			Endpoints: []lab.Endpoint{{Label: "Kubernetes API", Address: "127.0.0.1:6443"}},
			Tasks: []lab.AssistTask{
				{ID: "namespace", Title: "Create a namespace", Done: true},
				{ID: "deployment", Title: "Deploy 3 replicas", Done: false, Message: "`web` doesn't have 3 ready replicas yet."},
			},
		},
	}
}

func TestDisabledWithoutProvider(t *testing.T) {
	svc := NewService(nil, liveContext())
	if svc.Enabled() {
		t.Error("a service with no provider reports enabled")
	}
	if _, err := svc.Chat(context.Background(), "s", ChatRequest{Message: "hi"}); err != ErrDisabled {
		t.Errorf("expected ErrDisabled, got %v", err)
	}
}

func TestChatRequiresALiveSession(t *testing.T) {
	svc := NewService(&stubProvider{reply: `{"reply":"hi"}`}, stubLabs{ok: false})
	if _, err := svc.Chat(context.Background(), "gone", ChatRequest{Message: "hi"}); err != ErrNoSession {
		t.Errorf("expected ErrNoSession, got %v", err)
	}
}

// TestPromptIsGroundedInTheLiveSession is the test that matters: an assistant
// proposing commands for the wrong toolchain is worse than no assistant.
func TestPromptIsGroundedInTheLiveSession(t *testing.T) {
	p := &stubProvider{reply: `{"reply":"ok","commands":[]}`}
	svc := NewService(p, liveContext())

	_, err := svc.Chat(context.Background(), "s", ChatRequest{
		Message:  "why is my deployment not ready?",
		Terminal: "$ kubectl -n lab get pods\nweb-1 0/1 ImagePullBackOff",
		History:  []Message{{Role: "user", Content: "earlier question"}},
	})
	if err != nil {
		t.Fatalf("chat: %v", err)
	}

	for _, want := range []string{
		"Kubernetes: Deployments & Self-Healing", // which lab
		"kubectl",                                // what tools exist
		"No `jq`",                                // and what doesn't
		"k3s (rancher/k3s:latest)",               // what's on the network
		"Create a namespace",                     // objectives
		"[complete]",                             // and their state
		"[outstanding]",
		"doesn't have 3 ready replicas",   // why the check is failing
		"ImagePullBackOff",                // the user's actual error
		"earlier question",                // conversation history
		"why is my deployment not ready?", // the question itself
	} {
		if !strings.Contains(p.user, want) {
			t.Errorf("prompt is missing %q\n---\n%s", want, p.user)
		}
	}
}

func TestEmulatedLabIsFlaggedToTheModel(t *testing.T) {
	labs := liveContext()
	labs.ctx.Fidelity = lab.FidelityEmulated
	p := &stubProvider{reply: `{"reply":"ok"}`}

	if _, err := NewService(p, labs).Chat(context.Background(), "s", ChatRequest{Message: "q"}); err != nil {
		t.Fatalf("chat: %v", err)
	}
	if !strings.Contains(p.user, "emulator") {
		t.Error("an emulated lab should tell the model it is not the real service")
	}
}

func TestSystemPromptForbidsGivingAwayAnswers(t *testing.T) {
	p := &stubProvider{reply: `{"reply":"ok"}`}
	if _, err := NewService(p, liveContext()).Chat(context.Background(), "s", ChatRequest{Message: "q"}); err != nil {
		t.Fatalf("chat: %v", err)
	}
	if !strings.Contains(p.system, "give away an objective's answer") {
		t.Error("the system prompt should hold back objective answers unless asked")
	}
}

func TestCommandsAreReturnedForSetupRequests(t *testing.T) {
	p := &stubProvider{reply: `{"reply":"Here you go.","commands":[
		{"run":"kubectl create namespace lab","explain":"namespaces partition the cluster"},
		{"run":"  ","explain":"blank"},
		{"run":"kubectl -n lab get pods"}
	]}`}
	resp, err := NewService(p, liveContext()).Chat(context.Background(), "s", ChatRequest{Message: "set it up"})
	if err != nil {
		t.Fatalf("chat: %v", err)
	}
	if len(resp.Commands) != 2 {
		t.Fatalf("expected the blank command to be dropped, got %d: %+v", len(resp.Commands), resp.Commands)
	}
	if resp.Commands[0].Run != "kubectl create namespace lab" {
		t.Errorf("unexpected first command: %q", resp.Commands[0].Run)
	}
}

func TestCommandsAreCapped(t *testing.T) {
	var b strings.Builder
	b.WriteString(`{"reply":"lots","commands":[`)
	for i := 0; i < 30; i++ {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`{"run":"echo hi"}`)
	}
	b.WriteString(`]}`)

	resp, err := NewService(&stubProvider{reply: b.String()}, liveContext()).
		Chat(context.Background(), "s", ChatRequest{Message: "everything"})
	if err != nil {
		t.Fatalf("chat: %v", err)
	}
	if len(resp.Commands) != maxCommands {
		t.Errorf("expected commands capped at %d, got %d", maxCommands, len(resp.Commands))
	}
}

// TestProseWrappedJSONIsSalvaged mirrors the other AI features: models sometimes
// ignore JSON mode and wrap the object in commentary.
func TestProseWrappedJSONIsSalvaged(t *testing.T) {
	p := &stubProvider{reply: "Sure! Here is the plan:\n```json\n{\"reply\":\"Do this\",\"commands\":[{\"run\":\"kubectl get ns\"}]}\n```"}
	resp, err := NewService(p, liveContext()).Chat(context.Background(), "s", ChatRequest{Message: "q"})
	if err != nil {
		t.Fatalf("chat: %v", err)
	}
	if resp.Reply != "Do this" || len(resp.Commands) != 1 {
		t.Errorf("failed to salvage wrapped JSON: %+v", resp)
	}
}

func TestBareProseIsShownRatherThanErroring(t *testing.T) {
	resp, err := NewService(&stubProvider{reply: "A namespace partitions a cluster."}, liveContext()).
		Chat(context.Background(), "s", ChatRequest{Message: "what is a namespace?"})
	if err != nil {
		t.Fatalf("chat: %v", err)
	}
	if !strings.Contains(resp.Reply, "partitions a cluster") {
		t.Errorf("expected bare prose to be used verbatim, got %q", resp.Reply)
	}
}

// TestTerminalTailIsBounded keeps a long scrollback from eating the context window.
func TestTerminalTailIsBounded(t *testing.T) {
	p := &stubProvider{reply: `{"reply":"ok"}`}
	huge := strings.Repeat("noise line that goes on\n", 2000)
	if _, err := NewService(p, liveContext()).Chat(context.Background(), "s", ChatRequest{
		Message:  "q",
		Terminal: huge + "THE-LAST-THING-I-RAN",
	}); err != nil {
		t.Fatalf("chat: %v", err)
	}
	if len(p.user) > 20000 {
		t.Errorf("prompt ballooned to %d bytes; the terminal tail is not bounded", len(p.user))
	}
	// The tail must keep the *end* — the most recent output is the relevant part.
	if !strings.Contains(p.user, "THE-LAST-THING-I-RAN") {
		t.Error("truncation dropped the most recent terminal output")
	}
}

// TestMultiLineCommandsSurviveIntact guards a real case: the assistant answers
// "set up a canary deployment" with a heredoc writing a manifest. That is one
// command, and flattening it would corrupt the YAML.
func TestMultiLineCommandsSurviveIntact(t *testing.T) {
	heredoc := "cat <<'EOF' > /tmp/d.yaml\napiVersion: apps/v1\nkind: Deployment\nEOF\nkubectl apply -f /tmp/d.yaml"
	blob, err := json.Marshal(map[string]any{
		"reply":    "here",
		"commands": []map[string]string{{"run": heredoc}},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	resp, err := NewService(&stubProvider{reply: string(blob)}, liveContext()).
		Chat(context.Background(), "s", ChatRequest{Message: "set up a canary"})
	if err != nil {
		t.Fatalf("chat: %v", err)
	}
	if len(resp.Commands) != 1 {
		t.Fatalf("expected 1 command, got %d", len(resp.Commands))
	}
	if resp.Commands[0].Run != heredoc {
		t.Errorf("multi-line command was altered:\n%q", resp.Commands[0].Run)
	}
}
