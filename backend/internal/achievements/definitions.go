package achievements

// EvalInput is the minimal, package-local snapshot the evaluator needs to decide
// which achievements a simulation run earns. The HTTP layer builds it from a
// simulation result + request, so this package never imports `simulation`
// (which would create an import cycle, since simulation has no need of us).
type EvalInput struct {
	NodeCount          int
	IncomingRPS        float64
	SystemCapacity     float64
	MonthlyCost        float64
	DailyActiveUsers   int
	CostEfficiency     int
	Categories         []string // distinct node categories present (cache, database, compute…)
	Regions            []string // distinct non-empty regions in use
	BottleneckCategory string   // category of the saturating node, "" if nothing is saturated
}

// Achievement IDs. Stable strings — persisted in user_achievements.
const (
	IDFirstArchitecture = "first-architecture"
	IDSupports10k       = "supports-10k"
	IDSupports100k      = "supports-100k"
	IDMultiRegion       = "multi-region-master"
	IDCacheWizard       = "cache-wizard"
	IDCostOptimizer     = "cost-optimizer"
	IDDatabaseSlayer    = "database-slayer"
)

// definitions is the ordered catalog shown in the UI (locked + unlocked).
var definitions = []Definition{
	{
		ID:          IDFirstArchitecture,
		Name:        "First Architecture",
		Description: "Ran your first simulation.",
		Icon:        "rocket",
		Hint:        "Run a simulation on any architecture.",
	},
	{
		ID:          IDSupports10k,
		Name:        "Supports 10k Users",
		Description: "Served 10,000 daily users without saturating any component.",
		Icon:        "users",
		Hint:        "Handle 10k daily users with no bottleneck.",
	},
	{
		ID:          IDSupports100k,
		Name:        "Supports 100k Users",
		Description: "Served 100,000 daily users without saturating any component.",
		Icon:        "users-round",
		Hint:        "Handle 100k daily users with no bottleneck.",
	},
	{
		ID:          IDMultiRegion,
		Name:        "Multi-Region Master",
		Description: "Deployed components across two or more regions.",
		Icon:        "globe",
		Hint:        "Place components in at least two regions.",
	},
	{
		ID:          IDCacheWizard,
		Name:        "Cache Wizard",
		Description: "Added a cache tier to your architecture.",
		Icon:        "zap",
		Hint:        "Include a cache (e.g. Redis) in the design.",
	},
	{
		ID:          IDCostOptimizer,
		Name:        "Cost Optimizer",
		Description: "Reached a cost-efficiency score of 85 or higher.",
		Icon:        "piggy-bank",
		Hint:        "Score 85+ on cost efficiency.",
	},
	{
		ID:          IDDatabaseSlayer,
		Name:        "Database Slayer",
		Description: "Served 1,000+ RPS with a database that never became the bottleneck.",
		Icon:        "database",
		Hint:        "Sustain 1k+ RPS without a database bottleneck.",
	},
}

var defByID = func() map[string]Definition {
	m := make(map[string]Definition, len(definitions))
	for _, d := range definitions {
		m[d.ID] = d
	}
	return m
}()

const (
	categoryCache    = "cache"
	categoryDatabase = "database"
)

// Evaluate returns the IDs of every achievement earned by this run, in catalog
// order. It is pure and deterministic — persistence and "newly unlocked"
// bookkeeping happen in the Service.
func Evaluate(in EvalInput) []string {
	if in.NodeCount == 0 {
		return nil
	}

	saturated := in.SystemCapacity > 0 && in.IncomingRPS > in.SystemCapacity
	hasCache := containsCategory(in.Categories, categoryCache)
	hasDatabase := containsCategory(in.Categories, categoryDatabase)

	var earned []string
	add := func(id string, ok bool) {
		if ok {
			earned = append(earned, id)
		}
	}

	add(IDFirstArchitecture, true)
	add(IDSupports10k, in.DailyActiveUsers >= 10_000 && !saturated)
	add(IDSupports100k, in.DailyActiveUsers >= 100_000 && !saturated)
	add(IDMultiRegion, distinctCount(in.Regions) >= 2)
	add(IDCacheWizard, hasCache)
	add(IDCostOptimizer, in.CostEfficiency >= 85)
	add(IDDatabaseSlayer, hasDatabase && in.IncomingRPS >= 1000 && in.BottleneckCategory != categoryDatabase)

	return earned
}

func containsCategory(categories []string, target string) bool {
	for _, c := range categories {
		if c == target {
			return true
		}
	}
	return false
}

func distinctCount(values []string) int {
	seen := make(map[string]struct{}, len(values))
	for _, v := range values {
		if v == "" {
			continue
		}
		seen[v] = struct{}{}
	}
	return len(seen)
}
