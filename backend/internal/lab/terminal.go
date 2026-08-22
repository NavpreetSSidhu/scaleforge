package lab

import (
	"fmt"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
	"github.com/scaleforge/scaleforge/internal/dockerx"
)

// Terminal is an interactive shell attached to a lab's workstation container.
//
// It runs `docker exec -it` under a real PTY rather than plain pipes: without a
// TTY there is no prompt, no echo, no line editing and no colour, which is the
// difference between a shell and a command box. The PTY also means programs that
// check isatty (psql, kubectl, redis-cli) behave the way they do in a terminal.
type Terminal struct {
	cmd  *exec.Cmd
	pty  *os.File
	once sync.Once
}

// Attach opens a shell in the session's workstation container.
func (m *Manager) Attach(sessionID string) (*Terminal, error) {
	s, err := m.workstationOf(sessionID)
	if err != nil {
		return nil, err
	}

	args := dockerx.ExecArgs(s.workstation, s.execEnv, true, s.shell)
	cmd := exec.Command("docker", args...)
	f, err := pty.Start(cmd)
	if err != nil {
		return nil, fmt.Errorf("opening a shell in the lab: %w", err)
	}
	return &Terminal{cmd: cmd, pty: f}, nil
}

// Read returns terminal output. It blocks until bytes are available or the shell exits.
func (t *Terminal) Read(p []byte) (int, error) { return t.pty.Read(p) }

// Write sends keystrokes to the shell.
func (t *Terminal) Write(p []byte) (int, error) { return t.pty.Write(p) }

// Resize tells the shell how big the browser terminal is, so full-screen programs
// and line wrapping render correctly.
func (t *Terminal) Resize(cols, rows uint16) error {
	if cols == 0 || rows == 0 {
		return nil
	}
	return pty.Setsize(t.pty, &pty.Winsize{Cols: cols, Rows: rows})
}

// Close ends the shell and releases the PTY. Safe to call more than once.
func (t *Terminal) Close() {
	t.once.Do(func() {
		_ = t.pty.Close()
		if t.cmd.Process != nil {
			_ = t.cmd.Process.Kill()
		}
		_ = t.cmd.Wait()
	})
}
