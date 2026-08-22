package lab

import (
	"context"
	"encoding/json"
	"os/exec"
	"strings"
	"testing"
)

// TestCatalogIsWellFormed guards the invariants the runtime depends on. A lab is
// data, so a typo here is a runtime provisioning failure rather than a build
// error — this is the cheapest place to catch one.
func TestCatalogIsWellFormed(t *testing.T) {
	c := NewCatalog()
	labs := c.List()
	if len(labs) == 0 {
		t.Fatal("catalog is empty")
	}

	seen := map[string]bool{}
	for _, l := range labs {
		if seen[l.ID] {
			t.Errorf("duplicate lab id %q", l.ID)
		}
		seen[l.ID] = true

		if l.Title == "" || l.Blurb == "" {
			t.Errorf("lab %q is missing a title or blurb", l.ID)
		}
		if len(l.Services) == 0 {
			t.Errorf("lab %q defines no services", l.ID)
		}
		if l.Ready == "" {
			t.Errorf("lab %q has no readiness check, so it can never become ready", l.ID)
		}
		if len(l.Tasks) == 0 {
			t.Errorf("lab %q has no tasks", l.ID)
		}

		// The workstation must resolve: either a dedicated image, or the name of
		// a service this lab actually starts.
		ws := l.Workstation
		switch {
		case ws.Image != "" && ws.Service != "":
			t.Errorf("lab %q sets both a workstation image and service", l.ID)
		case ws.Image == "" && ws.Service == "":
			t.Errorf("lab %q defines no workstation", l.ID)
		case ws.Service != "":
			found := false
			for _, svc := range l.Services {
				if svc.Name == ws.Service {
					found = true
				}
			}
			if !found {
				t.Errorf("lab %q attaches its terminal to unknown service %q", l.ID, ws.Service)
			}
		}

		taskIDs := map[string]bool{}
		for _, task := range l.Tasks {
			if taskIDs[task.ID] {
				t.Errorf("lab %q has duplicate task id %q", l.ID, task.ID)
			}
			taskIDs[task.ID] = true
			if task.Check == "" {
				t.Errorf("lab %q task %q has no check, so it can never be completed", l.ID, task.ID)
			}
			if task.Title == "" || task.Brief == "" {
				t.Errorf("lab %q task %q is missing a title or brief", l.ID, task.ID)
			}
			if task.Pass == "" || task.Fail == "" {
				t.Errorf("lab %q task %q needs both a pass and fail message", l.ID, task.ID)
			}
		}
	}
}

// TestTaskChecksAreValidShell parses every check with `sh -n`. Checks are shell
// scripts run inside a container, so a quoting mistake would otherwise surface
// only as a task that can never pass.
func TestTaskChecksAreValidShell(t *testing.T) {
	for _, l := range NewCatalog().List() {
		scripts := append([]string{l.Ready}, l.Setup...)
		for _, task := range l.Tasks {
			scripts = append(scripts, task.Check)
		}
		for _, script := range scripts {
			if strings.TrimSpace(script) == "" {
				continue
			}
			cmd := exec.Command("sh", "-n")
			cmd.Stdin = strings.NewReader(script)
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Errorf("lab %q has a script that isn't valid shell: %v\n%s\nscript: %s",
					l.ID, err, out, script)
			}
		}
	}
}

// TestVerifiedLabsHaveALiveSolution keeps the catalog's `verified` flag honest.
// The UI uses it to decide whether to warn the user that a lab is a preview, so a
// lab may only claim to be verified if TestLabsEndToEnd actually drives it.
func TestVerifiedLabsHaveALiveSolution(t *testing.T) {
	covered := map[string]int{}
	for _, sol := range solutions() {
		covered[sol.labID] = len(sol.steps)
	}

	for _, l := range NewCatalog().List() {
		steps, ok := covered[l.ID]
		if l.Verified && !ok {
			t.Errorf("lab %q is marked verified but no integration solution drives it", l.ID)
		}
		if ok && steps != len(l.Tasks) {
			t.Errorf("lab %q has %d objectives but its solution has %d steps",
				l.ID, len(l.Tasks), steps)
		}
	}

	// And the reverse: a solution naming a lab that no longer exists is dead
	// weight that would silently stop testing anything.
	for labID := range covered {
		if _, ok := NewCatalog().Get(labID); !ok {
			t.Errorf("integration solution targets unknown lab %q", labID)
		}
	}
}

// TestSolutionStepsTargetRealTasks catches a solution drifting from the objective
// ids it claims to complete — the assertion would otherwise silently pass.
func TestSolutionStepsTargetRealTasks(t *testing.T) {
	for _, sol := range solutions() {
		labDef, ok := NewCatalog().Get(sol.labID)
		if !ok {
			continue // reported by TestVerifiedLabsHaveALiveSolution
		}
		valid := map[string]bool{}
		for _, task := range labDef.Tasks {
			valid[task.ID] = true
		}
		for _, st := range sol.steps {
			if st.task != "" && !valid[st.task] {
				t.Errorf("lab %q: solution step targets unknown objective %q", sol.labID, st.task)
			}
		}
	}
}

func TestGetUnknownLab(t *testing.T) {
	if _, ok := NewCatalog().Get("nope"); ok {
		t.Error("expected unknown lab id to miss")
	}
}

// TestDisabledManagerRefusesToStart checks the feature gate holds before any
// Docker call is attempted.
func TestDisabledManagerRefusesToStart(t *testing.T) {
	m := NewManager(false, NewCatalog())
	if m.Enabled() {
		t.Fatal("manager built with enabled=false reports enabled")
	}
	if _, err := m.Start(context.Background(), "s3-object-storage"); err == nil {
		t.Error("expected a disabled manager to refuse to start a lab")
	}
	if m.DockerReady(context.Background()) {
		t.Error("a disabled manager should not report Docker as ready")
	}
}

// TestStartRejectsUnknownLab makes sure a bad id fails before provisioning.
func TestStartRejectsUnknownLab(t *testing.T) {
	m := NewManager(true, NewCatalog())
	if _, err := m.Start(context.Background(), "does-not-exist"); err == nil {
		t.Error("expected an unknown lab id to be rejected")
	} else if !strings.Contains(err.Error(), "unknown lab") {
		t.Errorf("unexpected error for unknown lab: %v", err)
	}
}

// TestSnapshotNeverMarshalsNullLists guards the JSON contract: a nil Go slice
// marshals to null, and a client iterating the endpoints of a session that
// hasn't published any yet would crash on it.
func TestSnapshotNeverMarshalsNullLists(t *testing.T) {
	s := &Session{id: "x", lab: Lab{ID: "l"}, status: StatusStarting}
	view := s.snapshot()
	if view.Endpoints == nil {
		t.Error("Endpoints is nil, which marshals to JSON null")
	}
	if view.Tasks == nil {
		t.Error("Tasks is nil, which marshals to JSON null")
	}

	blob, err := json.Marshal(view)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	for _, field := range []string{`"endpoints":null`, `"tasks":null`} {
		if strings.Contains(string(blob), field) {
			t.Errorf("session JSON contains %s", field)
		}
	}
}

func TestSessionSnapshotSeedsOneStatePerTask(t *testing.T) {
	labDef, ok := NewCatalog().Get("redis-caching")
	if !ok {
		t.Fatal("redis lab missing from catalog")
	}
	s := &Session{id: "x", lab: labDef, status: StatusStarting}
	for _, task := range labDef.Tasks {
		s.tasks = append(s.tasks, TaskState{ID: task.ID})
	}
	view := s.snapshot()
	if len(view.Tasks) != len(labDef.Tasks) {
		t.Errorf("snapshot has %d task states, want %d", len(view.Tasks), len(labDef.Tasks))
	}
	for _, ts := range view.Tasks {
		if ts.Done {
			t.Errorf("task %q starts already done", ts.ID)
		}
	}
}
