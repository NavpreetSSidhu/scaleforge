package lab

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/scaleforge/scaleforge/internal/dockerx"
)

// VerifyResult is the outcome of checking every objective in a lab.
type VerifyResult struct {
	Tasks     []TaskState `json:"tasks"`
	Completed int         `json:"completed"`
	Total     int         `json:"total"`
}

// Verify runs every task's check against the live environment and records the
// results on the session.
//
// Checks are read-only queries, so they run concurrently — five sequential
// kubectl round-trips is a noticeable wait for something the user just clicked.
func (m *Manager) Verify(ctx context.Context, sessionID string) (VerifyResult, error) {
	s, err := m.workstationOf(sessionID)
	if err != nil {
		return VerifyResult{}, err
	}

	tasks := s.lab.Tasks
	states := make([]TaskState, len(tasks))
	now := time.Now()

	// Completion is monotonic within a run. A lab is a progression, and later
	// objectives routinely undo the observable state an earlier one created —
	// the S3 lab deletes the object it had you upload, the Redis lab evicts the
	// key it had you set. Re-checking from scratch each time would un-earn those,
	// so an objective already met stays met.
	s.mu.Lock()
	earned := make(map[string]TaskState, len(s.tasks))
	for _, ts := range s.tasks {
		if ts.Done {
			earned[ts.ID] = ts
		}
	}
	s.mu.Unlock()

	var wg sync.WaitGroup
	for i, task := range tasks {
		wg.Add(1)
		go func(i int, task Task) {
			defer wg.Done()
			if prev, ok := earned[task.ID]; ok {
				states[i] = prev
				return
			}
			checkedAt := now
			state := TaskState{ID: task.ID, CheckedAt: &checkedAt}

			res, err := dockerx.Exec(ctx, s.workstation, dockerx.ExecOptions{
				Script:  task.Check,
				Env:     s.execEnv,
				Timeout: 30 * time.Second,
			})
			switch {
			case err != nil:
				// Docker itself failed — report that rather than claiming the
				// objective was not met.
				state.Message = "Couldn't run the check: " + err.Error()
			case res.Ok():
				state.Done = true
				state.Message = task.Pass
			default:
				state.Message = task.Fail
				if detail := firstLine(res.Stderr); detail != "" && task.Fail == "" {
					state.Message = detail
				}
			}
			states[i] = state
		}(i, task)
	}
	wg.Wait()

	completed := 0
	for _, st := range states {
		if st.Done {
			completed++
		}
	}

	s.mu.Lock()
	s.tasks = states
	s.mu.Unlock()

	return VerifyResult{Tasks: states, Completed: completed, Total: len(states)}, nil
}

// Hint returns the hint for one task, revealed on demand so the objective stays
// a genuine exercise until the user asks for help.
func (m *Manager) Hint(sessionID, taskID string) (string, error) {
	m.mu.Lock()
	s, ok := m.sessions[sessionID]
	m.mu.Unlock()
	if !ok {
		return "", fmt.Errorf("no such lab session")
	}
	for _, t := range s.lab.Tasks {
		if t.ID == taskID {
			return t.Hint, nil
		}
	}
	return "", fmt.Errorf("no such task")
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}
