package sandbox

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/simulation"
)

const (
	redisImage    = "redis:7-alpine"
	postgresImage = "postgres:16-alpine"
)

// Deployment holds the real containers backing a sandbox run and live clients to
// them, so the target service can perform real I/O per request. Any field may be
// nil when the design has no node of that category.
type Deployment struct {
	containerIDs []string
	redis        *redisPool
	pg           *pgxpool.Pool
}

// dockerAvailable reports whether a Docker daemon is reachable. Cheap probe so we
// can fall back to the pure in-process target when Docker is down.
func dockerAvailable(ctx context.Context) bool {
	c, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return exec.CommandContext(c, "docker", "version", "--format", "{{.Server.Version}}").Run() == nil
}

// hasCategory reports whether any node in the graph is of the given catalog category.
func hasCategory(graph simulation.Graph, defs map[string]catalog.NodeDefinition, category string) bool {
	for _, n := range graph.Nodes {
		if def, ok := defs[n.Type]; ok && def.Category == category {
			return true
		}
	}
	return false
}

// provision starts real Redis/Postgres containers for the categories present in
// the design and returns live clients to them. It streams human-readable phases
// via emit. On any failure it tears down whatever started and returns the error,
// so the caller can fall back to the pure in-process target.
func provision(ctx context.Context, graph simulation.Graph, defs map[string]catalog.NodeDefinition, poolSize int, emit func(string)) (*Deployment, error) {
	dep := &Deployment{}
	needRedis := hasCategory(graph, defs, catalog.CategoryCache)
	needPG := hasCategory(graph, defs, catalog.CategoryDatabase)
	if !needRedis && !needPG {
		return nil, nil // nothing to provision; in-process emulation is enough
	}

	if needRedis {
		emit("Pulling + starting a real redis:7-alpine container…")
		addr, id, err := runContainer(ctx, redisImage, "6379", nil)
		if err != nil {
			dep.teardown()
			return nil, fmt.Errorf("starting redis: %w", err)
		}
		dep.containerIDs = append(dep.containerIDs, id)
		rc, err := waitRedis(ctx, addr, poolSize)
		if err != nil {
			dep.teardown()
			return nil, fmt.Errorf("redis not ready: %w", err)
		}
		dep.redis = rc
		emit("Redis container ready.")
	}

	if needPG {
		emit("Pulling + starting a real postgres:16-alpine container…")
		addr, id, err := runContainer(ctx, postgresImage, "5432", []string{
			"-e", "POSTGRES_PASSWORD=sandbox", "-e", "POSTGRES_DB=sandbox",
		})
		if err != nil {
			dep.teardown()
			return nil, fmt.Errorf("starting postgres: %w", err)
		}
		dep.containerIDs = append(dep.containerIDs, id)
		connStr := fmt.Sprintf("postgres://postgres:sandbox@%s/sandbox?sslmode=disable", addr)
		pool, err := waitPostgres(ctx, connStr)
		if err != nil {
			dep.teardown()
			return nil, fmt.Errorf("postgres not ready: %w", err)
		}
		dep.pg = pool
		emit("Postgres container ready.")
	}

	return dep, nil
}

// runContainer runs an image detached with the container port published to a
// random host port, and returns the host address (127.0.0.1:port) + container id.
func runContainer(ctx context.Context, image, containerPort string, extraArgs []string) (string, string, error) {
	args := []string{"run", "-d", "--rm", "-p", "127.0.0.1::" + containerPort}
	args = append(args, extraArgs...)
	args = append(args, image)

	c, cancel := context.WithTimeout(ctx, 90*time.Second) // first run may pull the image
	defer cancel()
	out, err := exec.CommandContext(c, "docker", args...).Output()
	if err != nil {
		return "", "", err
	}
	id := strings.TrimSpace(string(out))

	// Discover the published host port.
	portOut, err := exec.CommandContext(ctx, "docker", "port", id, containerPort+"/tcp").Output()
	if err != nil {
		return "", id, fmt.Errorf("resolving published port: %w", err)
	}
	// Output looks like "127.0.0.1:32768" (possibly multiple lines).
	mapping := strings.TrimSpace(strings.SplitN(string(portOut), "\n", 2)[0])
	idx := strings.LastIndex(mapping, ":")
	if idx < 0 {
		return "", id, fmt.Errorf("unexpected docker port output: %q", mapping)
	}
	return "127.0.0.1:" + mapping[idx+1:], id, nil
}

// waitRedis dials + PINGs until the container answers, then opens a pool sized to
// the load's concurrency so Redis isn't an artificial serialization point.
func waitRedis(ctx context.Context, addr string, poolSize int) (*redisPool, error) {
	if poolSize < 1 {
		poolSize = 8
	}
	if poolSize > 64 {
		poolSize = 64
	}
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if pool, err := dialRedisPool(addr, poolSize, time.Second); err == nil {
			return pool, nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return nil, fmt.Errorf("timed out waiting for redis at %s", addr)
}

// waitPostgres opens a pool and runs SELECT 1 until the container is accepting
// connections (Postgres takes a moment to initialize on first boot).
func waitPostgres(ctx context.Context, connStr string) (*pgxpool.Pool, error) {
	deadline := time.Now().Add(40 * time.Second)
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		pool, err := pgxpool.New(ctx, connStr)
		if err == nil {
			pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			_, qErr := pool.Exec(pingCtx, "SELECT 1")
			cancel()
			if qErr == nil {
				return pool, nil
			}
			pool.Close()
		}
		time.Sleep(500 * time.Millisecond)
	}
	return nil, fmt.Errorf("timed out waiting for postgres")
}

// teardown closes clients and force-removes every container that was started.
func (d *Deployment) teardown() {
	if d == nil {
		return
	}
	d.redis.close()
	if d.pg != nil {
		d.pg.Close()
	}
	for _, id := range d.containerIDs {
		// Best-effort; --rm means a stopped container is already gone.
		_ = exec.Command("docker", "rm", "-f", id).Run()
	}
}
