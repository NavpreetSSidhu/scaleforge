// Package dockerx is a thin, dependency-free wrapper over the `docker` CLI.
//
// It exists so features that need *real* containers (the Real Sandbox's backing
// datastores, and the Labs vertical's live infrastructure) share one place that
// knows how to start, probe, exec into and tear down containers — instead of
// each shelling out with its own argument-building and port-parsing.
//
// The CLI is used rather than the Docker SDK deliberately: it keeps the module
// free of a large dependency, works with whatever daemon the user already has
// wired up (Docker Desktop, Colima, Rancher), and degrades to a clean "docker
// not available" instead of a build-time coupling.
package dockerx

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Available reports whether a Docker daemon is reachable. It is a cheap probe so
// callers can fall back to an emulated path when Docker is down.
func Available(ctx context.Context) bool {
	c, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return exec.CommandContext(c, "docker", "version", "--format", "{{.Server.Version}}").Run() == nil
}

// PortMap publishes a container port on a random loopback host port.
type PortMap struct {
	// Label names the endpoint for the UI ("S3 API", "Console").
	Label string
	// Container is the port inside the container, e.g. "9000".
	Container string
	// Scheme, when set, renders the resolved endpoint as a clickable URL.
	Scheme string
}

// RunOptions describes a container to start.
type RunOptions struct {
	Image string
	// Name is the container name. On a user-defined network this doubles as the
	// DNS hostname, which is how lab services address each other.
	Name string
	// Network attaches the container to a user-defined network.
	Network string
	// Aliases are extra DNS names on that network. Container names must be
	// unique across the host, so a lab prefixes them per session — the alias is
	// what lets peers keep addressing each other by their short, stable name.
	Aliases []string
	Env     []string
	// Entrypoint overrides the image's entrypoint (used to get a shell in
	// images whose entrypoint is the tool itself, e.g. amazon/aws-cli).
	Entrypoint string
	// Cmd overrides the image's command.
	Cmd []string
	// Ports are published to random loopback host ports.
	Ports []PortMap
	// Privileged is required by containers that run their own container runtime
	// (k3s needs it to manage cgroups and mount filesystems).
	Privileged bool
	// TmpfsCgroup mounts the writable paths a nested runtime needs.
	Tmpfs []string
	// Labels are applied to the container so orphans can be swept later.
	Labels []string
	// Interactive keeps stdin open so a shell-only container stays alive.
	Interactive bool
	// PullTimeout bounds the run, which may include a first-time image pull.
	PullTimeout time.Duration
}

// Run starts a container detached and returns its ID. The container is NOT
// started with --rm, so a crashed container can still be inspected for logs
// before Remove is called.
func Run(ctx context.Context, opts RunOptions) (string, error) {
	args := []string{"run", "-d"}
	if opts.Name != "" {
		args = append(args, "--name", opts.Name)
	}
	if opts.Network != "" {
		args = append(args, "--network", opts.Network)
	}
	for _, a := range opts.Aliases {
		args = append(args, "--network-alias", a)
	}
	if opts.Privileged {
		args = append(args, "--privileged")
	}
	if opts.Interactive {
		args = append(args, "-i")
	}
	if opts.Entrypoint != "" {
		args = append(args, "--entrypoint", opts.Entrypoint)
	}
	for _, e := range opts.Env {
		args = append(args, "-e", e)
	}
	for _, t := range opts.Tmpfs {
		args = append(args, "--tmpfs", t)
	}
	for _, l := range opts.Labels {
		args = append(args, "--label", l)
	}
	for _, p := range opts.Ports {
		args = append(args, "-p", "127.0.0.1::"+p.Container)
	}
	args = append(args, opts.Image)
	args = append(args, opts.Cmd...)

	timeout := opts.PullTimeout
	if timeout <= 0 {
		timeout = 5 * time.Minute // a cold k3s/minio pull is not fast
	}
	c, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(c, "docker", args...)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("docker run %s: %w: %s", opts.Image, err, strings.TrimSpace(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

// HostPort resolves the loopback host address a container port was published on,
// e.g. "127.0.0.1:32768".
func HostPort(ctx context.Context, id, containerPort string) (string, error) {
	out, err := exec.CommandContext(ctx, "docker", "port", id, containerPort+"/tcp").Output()
	if err != nil {
		return "", fmt.Errorf("resolving published port %s: %w", containerPort, err)
	}
	// Output looks like "127.0.0.1:32768", possibly several lines (v4 + v6).
	mapping := strings.TrimSpace(strings.SplitN(string(out), "\n", 2)[0])
	idx := strings.LastIndex(mapping, ":")
	if idx < 0 {
		return "", fmt.Errorf("unexpected docker port output: %q", mapping)
	}
	return "127.0.0.1:" + mapping[idx+1:], nil
}

// ExecResult is the outcome of a command run inside a container.
type ExecResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// Ok reports whether the command exited cleanly. Lab task checks are authored as
// shell scripts that exit non-zero on failure, so this is the pass/fail signal.
func (r ExecResult) Ok() bool { return r.ExitCode == 0 }

// ExecOptions describes a one-shot command run inside a container.
type ExecOptions struct {
	// Script is run with `sh -c`.
	Script string
	// Env is injected for this command only. Labs whose terminal attaches to a
	// service container (postgres, redis) supply their client environment here,
	// because those vars belong to the client rather than to the server image.
	Env     []string
	Timeout time.Duration
}

// ExecArgs builds the `docker exec` argument list shared by the one-shot and
// interactive paths, so a lab's environment is identical in both.
func ExecArgs(id string, env []string, interactive bool, command []string) []string {
	args := []string{"exec"}
	if interactive {
		args = append(args, "-i", "-t")
	}
	for _, e := range env {
		args = append(args, "-e", e)
	}
	args = append(args, id)
	return append(args, command...)
}

// Exec runs a shell script inside a container and captures its output. The exit
// code is returned rather than folded into err, so callers can distinguish "the
// command reported failure" (a check that didn't pass) from "docker broke".
func Exec(ctx context.Context, id string, opts ExecOptions) (ExecResult, error) {
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	c, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var stdout, stderr bytes.Buffer
	args := ExecArgs(id, opts.Env, false, []string{"sh", "-c", opts.Script})
	cmd := exec.CommandContext(c, "docker", args...)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()

	res := ExecResult{Stdout: stdout.String(), Stderr: stderr.String()}
	if err == nil {
		return res, nil
	}
	var exitErr *exec.ExitError
	if ok := asExitError(err, &exitErr); ok {
		res.ExitCode = exitErr.ExitCode()
		return res, nil
	}
	// The context expiring is a real failure, not a failed assertion.
	if c.Err() != nil {
		res.ExitCode = -1
		return res, fmt.Errorf("exec timed out after %s", timeout)
	}
	res.ExitCode = -1
	return res, err
}

// asExitError is a tiny errors.As shim kept local so the import list stays short.
func asExitError(err error, target **exec.ExitError) bool {
	if ee, ok := err.(*exec.ExitError); ok {
		*target = ee
		return true
	}
	return false
}

// Logs returns the tail of a container's combined output — used to explain why a
// service never became ready.
func Logs(ctx context.Context, id string, tail int) string {
	out, err := exec.CommandContext(ctx, "docker", "logs", "--tail", fmt.Sprint(tail), id).CombinedOutput()
	if err != nil {
		return ""
	}
	return string(out)
}

// CreateNetwork makes a user-defined bridge network, which gives the containers
// on it DNS resolution by container name.
func CreateNetwork(ctx context.Context, name string, labels ...string) error {
	args := []string{"network", "create"}
	for _, l := range labels {
		args = append(args, "--label", l)
	}
	args = append(args, name)
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker network create %s: %w: %s", name, err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

// Remove force-removes containers, ignoring ones that are already gone.
func Remove(ids ...string) {
	for _, id := range ids {
		if id == "" {
			continue
		}
		_ = exec.Command("docker", "rm", "-f", "-v", id).Run()
	}
}

// RemoveNetwork deletes a network once its containers are gone.
func RemoveNetwork(name string) {
	if name == "" {
		return
	}
	_ = exec.Command("docker", "network", "rm", name).Run()
}
