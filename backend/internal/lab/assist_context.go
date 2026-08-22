package lab

import (
	"context"
	"fmt"
	"time"

	"github.com/scaleforge/scaleforge/internal/dockerx"
)

// AssistTask is one objective's state, flattened for an AI helper.
type AssistTask struct {
	ID    string
	Title string
	Brief string
	Done  bool
	// Message is the last check result, which is often the most useful thing to
	// reason about — it says exactly what the environment is still missing.
	Message string
}

// AssistContext is everything an AI helper needs to reason about a live session:
// which lab it is, what the environment is, and how far the user has got.
type AssistContext struct {
	LabID     string
	LabTitle  string
	Blurb     string
	Fidelity  string
	Concepts  []string
	Toolchain string
	Shell     string
	Services  []Service
	Endpoints []Endpoint
	Tasks     []AssistTask
}

// AssistContext returns the grounding for a live session. It is read-only and
// safe to call on any session the manager knows about.
func (m *Manager) AssistContext(sessionID string) (AssistContext, bool) {
	m.mu.Lock()
	s, ok := m.sessions[sessionID]
	m.mu.Unlock()
	if !ok {
		return AssistContext{}, false
	}

	s.mu.Lock()
	states := make(map[string]TaskState, len(s.tasks))
	for _, ts := range s.tasks {
		states[ts.ID] = ts
	}
	endpoints := append([]Endpoint(nil), s.endpoints...)
	shell := s.shell
	s.mu.Unlock()

	labDef := s.lab
	tasks := make([]AssistTask, 0, len(labDef.Tasks))
	for _, t := range labDef.Tasks {
		st := states[t.ID]
		tasks = append(tasks, AssistTask{
			ID:      t.ID,
			Title:   t.Title,
			Brief:   t.Brief,
			Done:    st.Done,
			Message: st.Message,
		})
	}

	shellName := "sh"
	if len(shell) > 0 {
		shellName = shell[0]
	}

	return AssistContext{
		LabID:     labDef.ID,
		LabTitle:  labDef.Title,
		Blurb:     labDef.Blurb,
		Fidelity:  labDef.Fidelity,
		Concepts:  labDef.Concepts,
		Toolchain: labDef.Toolchain,
		Shell:     shellName,
		Services:  labDef.Services,
		Endpoints: endpoints,
		Tasks:     tasks,
	}, true
}

// RunResult is the outcome of a user-approved command.
type RunResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
}

// RunCommand executes a command in the session's workstation and returns its
// output.
//
// This grants no capability the user does not already have: the lab terminal is
// an interactive shell in the same container, so anything runnable here is
// runnable by typing it. It exists so an approved suggestion can be executed
// with its output captured, instead of the user retyping it. Commands are only
// ever run after the user accepts them in the UI — nothing here runs on its own.
func (m *Manager) RunCommand(ctx context.Context, sessionID, script string) (RunResult, error) {
	s, err := m.workstationOf(sessionID)
	if err != nil {
		return RunResult{}, err
	}
	if script == "" {
		return RunResult{}, fmt.Errorf("no command given")
	}

	res, execErr := dockerx.Exec(ctx, s.workstation, dockerx.ExecOptions{
		Script:  script,
		Env:     s.execEnv,
		Timeout: 2 * time.Minute,
	})
	if execErr != nil {
		return RunResult{}, execErr
	}
	return RunResult{Stdout: res.Stdout, Stderr: res.Stderr, ExitCode: res.ExitCode}, nil
}
