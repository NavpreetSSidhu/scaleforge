package lab

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/scaleforge/scaleforge/internal/dockerx"
)

// Status is where a lab session is in its lifecycle.
type Status string

const (
	StatusStarting Status = "starting"
	StatusReady    Status = "ready"
	StatusFailed   Status = "failed"
	StatusStopped  Status = "stopped"
)

// containerLabel tags everything a lab creates, so orphans left behind by a hard
// crash can be swept on the next boot rather than lingering on the machine.
const containerLabel = "scaleforge.lab=1"

// Endpoint is a published service address surfaced to the UI.
type Endpoint struct {
	Label   string `json:"label"`
	Address string `json:"address"`
	URL     string `json:"url,omitempty"`
}

// TaskState is the verification state of one objective.
type TaskState struct {
	ID        string     `json:"id"`
	Done      bool       `json:"done"`
	Message   string     `json:"message,omitempty"`
	CheckedAt *time.Time `json:"checkedAt,omitempty"`
}

// SessionView is an immutable snapshot safe to serialise while the session's own
// goroutines are still mutating it.
type SessionView struct {
	ID        string      `json:"id"`
	LabID     string      `json:"labId"`
	Status    Status      `json:"status"`
	Phase     string      `json:"phase"`
	Error     string      `json:"error,omitempty"`
	CreatedAt time.Time   `json:"createdAt"`
	ExpiresAt time.Time   `json:"expiresAt"`
	Endpoints []Endpoint  `json:"endpoints"`
	Tasks     []TaskState `json:"tasks"`
}

// Session is one running lab environment.
type Session struct {
	mu sync.Mutex

	id        string
	lab       Lab
	status    Status
	phase     string
	failure   string
	createdAt time.Time
	expiresAt time.Time
	endpoints []Endpoint
	tasks     []TaskState

	network     string
	containers  []string // every container, in start order, for teardown
	workstation string   // the container the terminal and checks run in
	shell       []string
	// execEnv is injected into every exec — the terminal, the readiness probe,
	// the setup scripts and the task checks — so all four see one environment.
	execEnv []string
}

func (s *Session) snapshot() SessionView {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Both lists are always non-nil: a nil slice marshals to JSON null, and a
	// session that hasn't published its endpoints yet would hand the client a
	// null where it expects an array.
	endpoints := make([]Endpoint, 0, len(s.endpoints))
	endpoints = append(endpoints, s.endpoints...)
	tasks := make([]TaskState, 0, len(s.tasks))
	tasks = append(tasks, s.tasks...)
	return SessionView{
		ID:        s.id,
		LabID:     s.lab.ID,
		Status:    s.status,
		Phase:     s.phase,
		Error:     s.failure,
		CreatedAt: s.createdAt,
		ExpiresAt: s.expiresAt,
		Endpoints: endpoints,
		Tasks:     tasks,
	}
}

func (s *Session) setPhase(phase string) {
	s.mu.Lock()
	s.phase = phase
	s.mu.Unlock()
}

func (s *Session) fail(err error, logs string) {
	s.mu.Lock()
	s.status = StatusFailed
	msg := err.Error()
	if logs != "" {
		msg += "\n\ncontainer logs:\n" + strings.TrimSpace(logs)
	}
	s.failure = msg
	s.phase = "Failed"
	s.mu.Unlock()
}

// Manager owns every running lab session on this host.
type Manager struct {
	mu       sync.Mutex
	sessions map[string]*Session

	enabled     bool
	catalog     *Catalog
	maxSessions int
	ttl         time.Duration
}

// NewManager builds the lab manager. Labs are opt-in: they start real containers
// and hold real resources, so a deployment must choose to turn them on.
func NewManager(enabled bool, catalog *Catalog) *Manager {
	m := &Manager{
		sessions:    map[string]*Session{},
		enabled:     enabled,
		catalog:     catalog,
		maxSessions: 3,
		ttl:         45 * time.Minute,
	}
	if enabled {
		go m.reapLoop()
	}
	return m
}

func (m *Manager) Enabled() bool     { return m.enabled }
func (m *Manager) Catalog() *Catalog { return m.catalog }

// DockerReady reports whether a daemon is reachable right now, so the UI can say
// "start Docker" instead of failing at provisioning time.
func (m *Manager) DockerReady(ctx context.Context) bool {
	if !m.enabled {
		return false
	}
	return dockerx.Available(ctx)
}

// Start provisions a lab and returns immediately with a starting session; the
// environment comes up on a background goroutine and the client polls the
// session until it reports ready or failed.
func (m *Manager) Start(ctx context.Context, labID string) (SessionView, error) {
	if !m.enabled {
		return SessionView{}, fmt.Errorf("labs are not enabled")
	}
	labDef, ok := m.catalog.Get(labID)
	if !ok {
		return SessionView{}, fmt.Errorf("unknown lab %q", labID)
	}
	if !dockerx.Available(ctx) {
		return SessionView{}, fmt.Errorf("Docker isn't reachable — start Docker Desktop (or your container runtime) and try again")
	}

	m.mu.Lock()
	live := 0
	for _, s := range m.sessions {
		if st := s.snapshotStatus(); st == StatusStarting || st == StatusReady {
			live++
		}
	}
	if live >= m.maxSessions {
		m.mu.Unlock()
		return SessionView{}, fmt.Errorf("too many labs running (%d) — stop one before starting another", live)
	}

	id := uuid.NewString()
	now := time.Now()
	tasks := make([]TaskState, 0, len(labDef.Tasks))
	for _, t := range labDef.Tasks {
		tasks = append(tasks, TaskState{ID: t.ID})
	}
	s := &Session{
		id:        id,
		lab:       labDef,
		status:    StatusStarting,
		phase:     "Queued",
		createdAt: now,
		expiresAt: now.Add(m.ttl),
		tasks:     tasks,
		network:   "sf-lab-" + id[:8],
	}
	m.sessions[id] = s
	m.mu.Unlock()

	// Provisioning outlives the HTTP request that triggered it, so it gets its
	// own bounded context rather than the request's.
	go func() {
		provCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		m.provision(provCtx, s)
	}()

	return s.snapshot(), nil
}

func (s *Session) snapshotStatus() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.status
}

// provision brings the whole environment up: network, services, workstation,
// readiness, then seed data. Any failure tears down what was started.
func (m *Manager) provision(ctx context.Context, s *Session) {
	labDef := s.lab

	s.setPhase("Creating an isolated network…")
	if err := dockerx.CreateNetwork(ctx, s.network, containerLabel); err != nil {
		s.fail(err, "")
		return
	}

	byName := map[string]string{}
	for _, svc := range labDef.Services {
		s.setPhase(fmt.Sprintf("Starting %s (%s)…", svc.Name, svc.Image))
		id, err := dockerx.Run(ctx, dockerx.RunOptions{
			Image:   svc.Image,
			Name:    s.network + "-" + svc.Name,
			Network: s.network,
			Aliases: []string{svc.Name}, // peers address it as e.g. "minio"

			Env:        svc.Env,
			Cmd:        svc.Cmd,
			Ports:      svc.Ports,
			Privileged: svc.Privileged,
			Tmpfs:      svc.Tmpfs,
			Labels:     []string{containerLabel},
		})
		if err != nil {
			s.fail(fmt.Errorf("starting %s: %w", svc.Name, err), "")
			m.teardown(s)
			return
		}
		s.mu.Lock()
		s.containers = append(s.containers, id)
		s.mu.Unlock()
		byName[svc.Name] = id

		// Publish the addresses now so the UI can show them while we wait for ready.
		for _, p := range svc.Ports {
			addr, err := resolvePort(ctx, id, p.Container)
			if err != nil {
				// A published port that can't be resolved is a broken lab, not a
				// cosmetic problem: it's how the user reaches the console and how
				// they point their own tools at the service.
				s.fail(fmt.Errorf("publishing %s port %s: %w", svc.Name, p.Container, err),
					dockerx.Logs(ctx, id, 40))
				m.teardown(s)
				return
			}
			ep := Endpoint{Label: p.Label, Address: addr}
			if p.Scheme != "" {
				ep.URL = p.Scheme + "://" + addr
			}
			s.mu.Lock()
			s.endpoints = append(s.endpoints, ep)
			s.mu.Unlock()
		}
	}

	// Resolve the container the terminal and task checks run in.
	ws := labDef.Workstation
	switch {
	case ws.Service != "":
		id, ok := byName[ws.Service]
		if !ok {
			s.fail(fmt.Errorf("workstation service %q is not defined by this lab", ws.Service), "")
			m.teardown(s)
			return
		}
		s.workstation = id
	case ws.Image != "":
		s.setPhase(fmt.Sprintf("Starting the workstation (%s)…", ws.Image))
		id, err := dockerx.Run(ctx, dockerx.RunOptions{
			Image:       ws.Image,
			Name:        s.network + "-workstation",
			Network:     s.network,
			Env:         ws.Env,
			Entrypoint:  ws.Entrypoint,
			Interactive: true, // keeps a shell-only container alive with no command
			Labels:      []string{containerLabel},
		})
		if err != nil {
			s.fail(fmt.Errorf("starting workstation: %w", err), "")
			m.teardown(s)
			return
		}
		s.mu.Lock()
		s.containers = append(s.containers, id)
		s.mu.Unlock()
		s.workstation = id
	default:
		s.fail(fmt.Errorf("lab %q defines no workstation", labDef.ID), "")
		m.teardown(s)
		return
	}

	s.shell = ws.Shell
	if len(s.shell) == 0 {
		s.shell = []string{"sh"}
	}
	s.execEnv = ws.Env

	// Wait for the services to actually serve, not merely to have started.
	if labDef.Ready != "" {
		s.setPhase("Waiting for the environment to come up…")
		if err := m.waitReady(ctx, s, labDef.Ready); err != nil {
			s.fail(err, dockerx.Logs(ctx, s.workstation, 40))
			m.teardown(s)
			return
		}
	}

	for i, script := range labDef.Setup {
		note := labDef.SetupNote
		if note == "" {
			note = fmt.Sprintf("Preparing the lab (%d/%d)…", i+1, len(labDef.Setup))
		}
		s.setPhase(note)
		res, err := dockerx.Exec(ctx, s.workstation, dockerx.ExecOptions{
			Script:  script,
			Env:     s.execEnv,
			Timeout: 3 * time.Minute,
		})
		if err != nil {
			s.fail(fmt.Errorf("lab setup failed: %w", err), "")
			m.teardown(s)
			return
		}
		if !res.Ok() {
			s.fail(fmt.Errorf("lab setup failed: %s", strings.TrimSpace(res.Stderr+res.Stdout)), "")
			m.teardown(s)
			return
		}
	}

	s.mu.Lock()
	s.status = StatusReady
	s.phase = "Ready"
	s.mu.Unlock()
}

// resolvePort asks the daemon which host port a container port was published on,
// retrying briefly: the binding is registered moments after the container is
// created, and a busy daemon (several labs starting at once, an image still
// unpacking) can answer before it is there.
func resolvePort(ctx context.Context, id, containerPort string) (string, error) {
	var err error
	for attempt := 0; attempt < 15; attempt++ {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		var addr string
		if addr, err = dockerx.HostPort(ctx, id, containerPort); err == nil {
			return addr, nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return "", err
}

// waitReady polls the lab's readiness script until it exits 0. The budget is
// generous because a cold pull plus a k3s control plane is genuinely slow.
func (m *Manager) waitReady(ctx context.Context, s *Session, script string) error {
	deadline := time.Now().Add(4 * time.Minute)
	var last string
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		res, err := dockerx.Exec(ctx, s.workstation, dockerx.ExecOptions{
			Script:  script,
			Env:     s.execEnv,
			Timeout: 20 * time.Second,
		})
		if err == nil && res.Ok() {
			return nil
		}
		if err == nil {
			last = strings.TrimSpace(res.Stderr)
		}
		time.Sleep(2 * time.Second)
	}
	if last != "" {
		return fmt.Errorf("the environment never became ready: %s", last)
	}
	return fmt.Errorf("the environment never became ready within 4 minutes")
}

// Get returns a snapshot of one session.
func (m *Manager) Get(id string) (SessionView, bool) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	m.mu.Unlock()
	if !ok {
		return SessionView{}, false
	}
	return s.snapshot(), true
}

// List returns every session this process knows about, newest first.
func (m *Manager) List() []SessionView {
	m.mu.Lock()
	out := make([]SessionView, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, s.snapshot())
	}
	m.mu.Unlock()
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].CreatedAt.After(out[i].CreatedAt) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

// Stop tears a session's containers down and marks it stopped.
func (m *Manager) Stop(id string) error {
	m.mu.Lock()
	s, ok := m.sessions[id]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("no such lab session")
	}
	m.teardown(s)
	s.mu.Lock()
	s.status = StatusStopped
	s.phase = "Stopped"
	s.mu.Unlock()
	return nil
}

func (m *Manager) teardown(s *Session) {
	s.mu.Lock()
	ids := append([]string(nil), s.containers...)
	network := s.network
	s.containers = nil
	s.mu.Unlock()

	dockerx.Remove(ids...)
	dockerx.RemoveNetwork(network)
}

// workstationOf returns the container the terminal should attach to.
func (m *Manager) workstationOf(id string) (*Session, error) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("no such lab session")
	}
	if st := s.snapshotStatus(); st != StatusReady {
		return nil, fmt.Errorf("lab is %s, not ready", st)
	}
	return s, nil
}

// reapLoop stops sessions that outlived their TTL. Labs hold real containers, so
// a forgotten browser tab must not pin memory on the host indefinitely.
func (m *Manager) reapLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		m.mu.Lock()
		var expired []*Session
		for _, s := range m.sessions {
			s.mu.Lock()
			live := s.status == StatusReady || s.status == StatusStarting
			out := now.After(s.expiresAt)
			s.mu.Unlock()
			if live && out {
				expired = append(expired, s)
			}
		}
		m.mu.Unlock()

		for _, s := range expired {
			m.teardown(s)
			s.mu.Lock()
			s.status = StatusStopped
			s.phase = "Expired"
			s.mu.Unlock()
		}
	}
}

// Shutdown tears down every live session. Called on server exit so a restart
// doesn't strand containers.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	all := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		all = append(all, s)
	}
	m.mu.Unlock()
	for _, s := range all {
		m.teardown(s)
	}
}
