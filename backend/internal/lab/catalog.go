package lab

import "github.com/scaleforge/scaleforge/internal/dockerx"

// Difficulty grades a lab for the catalog UI.
const (
	Beginner     = "beginner"
	Intermediate = "intermediate"
	Advanced     = "advanced"
)

// Track groups labs into the infrastructure area they teach.
const (
	TrackStorage       = "storage"
	TrackOrchestration = "orchestration"
	TrackData          = "data"
	TrackMesh          = "mesh"
)

// Service is a backing container in a lab's environment. Services share a
// user-defined network and address each other by Name, so a lab reads like a
// miniature docker-compose file authored in Go.
type Service struct {
	Name       string            `json:"name"`
	Image      string            `json:"image"`
	Env        []string          `json:"-"`
	Cmd        []string          `json:"-"`
	Ports      []dockerx.PortMap `json:"-"`
	Privileged bool              `json:"-"`
	Tmpfs      []string          `json:"-"`
}

// Workstation is the container the browser terminal attaches to.
//
// Most labs don't need a separate one: the service image already ships the tool
// you're there to learn (k3s bundles kubectl, postgres bundles psql). Those set
// Service to attach the terminal straight to that container. A lab sets Image
// instead when the client and server are genuinely different programs — the S3
// lab drives MinIO with the real AWS CLI, exactly as you would drive S3.
type Workstation struct {
	// Service names an existing service to attach to. Mutually exclusive with Image.
	Service string `json:"-"`
	// Image runs a dedicated client container when set.
	Image      string   `json:"-"`
	Entrypoint string   `json:"-"`
	Env        []string `json:"-"`
	// Shell is the command the terminal runs. Defaults to `sh`.
	Shell []string `json:"-"`
}

// Task is one verified objective. Check is a shell script run inside the
// workstation; exit 0 means the objective is met. Authoring checks as scripts
// rather than an assertion DSL means a check can ask the real system anything
// its own CLI can express — a kubectl JSONPath, a psql query, a redis INFO field.
type Task struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	// Brief is markdown shown as the instructions for the objective.
	Brief string `json:"brief"`
	// Hint is revealed on demand through its own endpoint — it is deliberately
	// withheld from the catalog so the objective stays an exercise until asked for.
	Hint  string `json:"-"`
	Check string `json:"-"`
	// Pass is the message shown when the check succeeds.
	Pass string `json:"-"`
	// Fail explains what the check looked for and didn't find.
	Fail string `json:"-"`
}

// Lab is a complete learning environment: real containers, a real shell, and a
// list of objectives verified against real state.
type Lab struct {
	ID          string      `json:"id"`
	Title       string      `json:"title"`
	Track       string      `json:"track"`
	Blurb       string      `json:"blurb"`
	Difficulty  string      `json:"difficulty"`
	Minutes     int         `json:"minutes"`
	Concepts    []string    `json:"concepts"`
	Services    []Service   `json:"services"`
	Workstation Workstation `json:"-"`
	// Ready is polled in the workstation until it exits 0 — the signal that every
	// service is actually serving, not merely that the container started.
	Ready string `json:"-"`
	// Setup runs once after Ready passes, to seed data the lab needs.
	Setup []string `json:"-"`
	// SetupNote is shown while Setup runs, since seeding can take a few seconds.
	SetupNote string `json:"-"`
	Tasks     []Task `json:"tasks"`
	// Verified marks labs whose environment has been exercised end to end. The
	// UI flags the rest as preview so nobody is surprised by a rough edge.
	Verified bool `json:"verified"`
}

// Catalog is the built-in set of labs.
type Catalog struct {
	labs  []Lab
	index map[string]Lab
}

func NewCatalog() *Catalog {
	labs := builtinLabs()
	index := make(map[string]Lab, len(labs))
	for _, l := range labs {
		index[l.ID] = l
	}
	return &Catalog{labs: labs, index: index}
}

// List returns every lab in catalog order.
func (c *Catalog) List() []Lab { return c.labs }

// Get looks a lab up by ID.
func (c *Catalog) Get(id string) (Lab, bool) {
	l, ok := c.index[id]
	return l, ok
}

func builtinLabs() []Lab {
	return []Lab{s3Lab(), kubernetesLab(), postgresLab(), redisLab()}
}
