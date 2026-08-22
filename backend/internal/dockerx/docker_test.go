package dockerx

import (
	"context"
	"os/exec"
	"testing"
	"time"
)

// TestExecArgsBuildsSharedArgumentList covers the invariant that makes labs work:
// the one-shot path (readiness probes, task checks) and the interactive path (the
// browser terminal) must produce the same environment, or an objective can fail
// for a user whose shell can plainly satisfy it.
func TestExecArgsBuildsSharedArgumentList(t *testing.T) {
	env := []string{"PGUSER=scaleforge", "PGDATABASE=lab"}

	oneShot := ExecArgs("abc123", env, false, []string{"sh", "-c", "psql -tAc 'select 1'"})
	interactive := ExecArgs("abc123", env, true, []string{"sh"})

	if oneShot[0] != "exec" || interactive[0] != "exec" {
		t.Fatalf("both paths must start with exec: %v / %v", oneShot, interactive)
	}

	// Only the interactive path allocates a TTY. The flags are matched as whole
	// arguments, not as substrings — the scripts themselves contain things like
	// `psql -tAc`, which a naive substring match would mistake for a TTY flag.
	if indexOf(interactive, "-t") < 0 || indexOf(interactive, "-i") < 0 {
		t.Errorf("interactive exec should request a TTY, got %v", interactive)
	}
	if indexOf(oneShot, "-t") >= 0 || indexOf(oneShot, "-i") >= 0 {
		t.Errorf("one-shot exec must not request a TTY, got %v", oneShot)
	}

	// Every env var reaches both paths, each behind its own -e.
	for _, e := range env {
		for name, args := range map[string][]string{"one-shot": oneShot, "interactive": interactive} {
			if !containsPair(args, "-e", e) {
				t.Errorf("%s exec is missing `-e %s`: %v", name, e, args)
			}
		}
	}

	// The container id must precede the command, or docker parses the command as
	// the container.
	idAt, cmdAt := indexOf(oneShot, "abc123"), indexOf(oneShot, "sh")
	if idAt < 0 || cmdAt < 0 || idAt > cmdAt {
		t.Errorf("container id must come before the command: %v", oneShot)
	}
}

func TestExecArgsWithNoEnv(t *testing.T) {
	args := ExecArgs("id", nil, false, []string{"sh", "-c", "true"})
	if containsPair(args, "-e", "") || indexOf(args, "-e") >= 0 {
		t.Errorf("no env should emit no -e flags: %v", args)
	}
}

func TestExecResultOkTracksExitCode(t *testing.T) {
	if !(ExecResult{ExitCode: 0}).Ok() {
		t.Error("exit 0 should report Ok")
	}
	// A failed check is a normal outcome, not an error — it must be distinguishable.
	if (ExecResult{ExitCode: 1}).Ok() {
		t.Error("exit 1 should not report Ok")
	}
	if (ExecResult{ExitCode: -1}).Ok() {
		t.Error("a transport failure should not report Ok")
	}
}

// TestAvailableIsFalseWithoutDocker points PATH at an empty directory so the
// `docker` binary cannot be found, proving the probe degrades instead of hanging.
func TestAvailableIsFalseWithoutDocker(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	if Available(context.Background()) {
		t.Error("Available should be false when docker is not on PATH")
	}
}

func TestAvailableRespectsContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if Available(ctx) {
		t.Error("Available should be false for an already-cancelled context")
	}
}

// TestExecSurfacesExitCodeNotError is the contract the verifier depends on: a
// non-zero exit is returned in the result, with err staying nil.
func TestExecSurfacesExitCodeNotError(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker binary not on PATH")
	}
	if !Available(context.Background()) {
		t.Skip("docker daemon not reachable")
	}

	// Exec against a container that does not exist: docker itself exits non-zero.
	res, err := Exec(context.Background(), "sf-lab-no-such-container", ExecOptions{
		Script:  "true",
		Timeout: 15 * time.Second,
	})
	if err != nil {
		t.Fatalf("a failing command should not be returned as an error: %v", err)
	}
	if res.Ok() {
		t.Error("exec against a missing container should not report Ok")
	}
}

func containsPair(args []string, flag, value string) bool {
	for i := 0; i < len(args)-1; i++ {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}

func indexOf(args []string, want string) int {
	for i, a := range args {
		if a == want {
			return i
		}
	}
	return -1
}
