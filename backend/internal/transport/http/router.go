package http

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/achievements"
	"github.com/scaleforge/scaleforge/internal/agentflow"
	agentruntime "github.com/scaleforge/scaleforge/internal/agentflow/runtime"
	"github.com/scaleforge/scaleforge/internal/assist"
	"github.com/scaleforge/scaleforge/internal/auth"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/config"
	"github.com/scaleforge/scaleforge/internal/cost"
	"github.com/scaleforge/scaleforge/internal/course"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/pricing"
	"github.com/scaleforge/scaleforge/internal/repository"
	"github.com/scaleforge/scaleforge/internal/repository/postgres"
	runtimepkg "github.com/scaleforge/scaleforge/internal/runtime"
	"github.com/scaleforge/scaleforge/internal/scoring"
	"github.com/scaleforge/scaleforge/internal/simulation"
	"github.com/scaleforge/scaleforge/internal/tutor"
)

type Dependencies struct {
	Store *postgres.Store
}

func NewRouter(cfg *config.Config, deps Dependencies) *gin.Engine {
	gin.SetMode(cfg.GinMode)

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.CORSOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	catalogService := catalog.NewService()
	pricingCatalog := pricing.NewCatalog()
	costCalculator := cost.NewCalculator(catalogService, pricingCatalog)
	scorer := scoring.NewScorer()
	simService := simulation.NewService(catalogService, costCalculator, scorer, deps.Store)
	authService := auth.NewService(deps.Store, cfg.JWTSecret, 0)
	achievementsService := achievements.NewService(deps.Store)

	// The assistant is enabled only when an LLM API key is configured; otherwise
	// the service is constructed with a nil provider and reports itself disabled.
	var assistProvider assist.Provider
	if cfg.GroqAPIKey != "" {
		assistProvider = assist.NewGroqProvider(cfg.GroqAPIKey, cfg.AssistModel)
	}
	assistService := assist.NewService(assistProvider, catalogService)

	// The tutor reuses the same LLM provider; lesson content is authored client-
	// side, so this only powers the Teacher/Q&A personas + progress persistence.
	var tutorProvider tutor.Provider
	if assistProvider != nil {
		tutorProvider = assistProvider
	}
	tutorService := tutor.NewService(tutorProvider, catalogService, deps.Store)

	// User-authored courses reuse the same LLM provider for AI generation; CRUD
	// works without a key (generation just reports itself disabled).
	var courseProvider course.Provider
	if assistProvider != nil {
		courseProvider = assistProvider
	}
	courseService := course.NewService(courseProvider, catalogService, deps.Store)

	// Agent Studio reuses the same LLM provider for AI workflow generation and the
	// live dry-run runtime; design, simulation, vector-bench, and export all work
	// without a key (those operations just don't touch the provider).
	var agentProvider assist.Provider
	if assistProvider != nil {
		agentProvider = assistProvider
	}
	agentflowCatalog := agentflow.NewCatalog()
	agentflowService := agentflow.NewService(agentProvider, agentflowCatalog, deps.Store)
	agentExecutor := agentruntime.NewExecutor(agentflowCatalog, agentProvider)

	archHandler := NewArchitectureHandler(deps.Store, catalogService, deps.Store)
	simHandler := NewSimulationHandler(simService, catalogService, achievementsService)
	authHandler := NewAuthHandler(authService)
	achievementsHandler := NewAchievementsHandler(achievementsService)
	pricingHandler := NewPricingHandler(pricingCatalog)
	runtimeHandler := NewRuntimeHandler(runtimepkg.NewCatalog())
	assistHandler := NewAssistHandler(assistService)
	tutorHandler := NewTutorHandler(tutorService)
	courseHandler := NewCourseHandler(courseService)
	agentflowHandler := NewAgentflowHandler(agentflowService, agentExecutor)

	// Per-IP rate limiters guarding the endpoints worth protecting: auth (brute
	// force / account enumeration) and the compute-heavy simulation endpoints.
	// Read-only catalog/pricing/runtimes browsing is left unthrottled; the
	// assistant has its own limiter (it checks "configured?" before counting).
	authLimiter := middleware.NewIPRateLimiter(10, time.Minute)
	simLimiter := middleware.NewIPRateLimiter(60, time.Minute)

	r.GET("/health", archHandler.Health)

	// Public auth endpoints (rate-limited to blunt brute-force attempts).
	r.POST("/auth/signup", authLimiter.Middleware(), authHandler.Signup)
	r.POST("/auth/login", authLimiter.Middleware(), authHandler.Login)

	// Guest-friendly: catalog browsing and running simulations work signed out
	// (simulations just aren't persisted). A valid token is attached when present.
	guest := r.Group("/")
	guest.Use(middleware.AuthOptional(authService.Verify))
	{
		guest.GET("/catalog", archHandler.GetCatalog)
		guest.GET("/pricing", pricingHandler.List)
		guest.GET("/runtimes", runtimeHandler.List)
		guest.POST("/simulate", simLimiter.Middleware(), simHandler.Simulate)
		guest.POST("/compare", simLimiter.Middleware(), simHandler.Compare)
		guest.POST("/chaos", simLimiter.Middleware(), simHandler.Chaos)
		guest.GET("/assistant", assistHandler.Status)
		guest.POST("/assistant", assistHandler.Chat)

		// Learn module: authored lessons render client-side; these power the two
		// AI personas (gated by API key, rate-limited inside the handler).
		guest.GET("/tutor", tutorHandler.Status)
		guest.POST("/tutor/explain", tutorHandler.Explain)
		guest.POST("/tutor/ask", tutorHandler.Ask)

		// Agent Studio: the node-type palette and pure design-time operations are
		// guest-friendly. Simulate is compute-heavy, so it shares the sim limiter.
		guest.GET("/agentflow/catalog", agentflowHandler.GetCatalog)
		guest.POST("/agentflow/simulate", simLimiter.Middleware(), agentflowHandler.Simulate)
		guest.POST("/agentflow/vector-bench", simLimiter.Middleware(), agentflowHandler.VectorBench)
		guest.POST("/agentflow/export", agentflowHandler.Export)
		guest.GET("/agentflow/run", agentflowHandler.RunStatus)
		guest.POST("/agentflow/run", agentflowHandler.Run)
	}

	// Account-only: saving/loading architectures and fetching the profile.
	authed := r.Group("/")
	authed.Use(middleware.RequireAuth(authService.Verify))
	{
		authed.GET("/auth/me", authHandler.Me)

		authed.POST("/architectures", archHandler.Create)
		authed.GET("/architectures", archHandler.List)
		authed.GET("/architectures/:id", archHandler.Get)
		authed.PUT("/architectures/:id", archHandler.Update)
		authed.DELETE("/architectures/:id", archHandler.Delete)

		authed.GET("/simulation/:id", simHandler.Get)

		authed.GET("/achievements", achievementsHandler.List)

		authed.GET("/tutor/progress", tutorHandler.ListProgress)
		authed.PUT("/tutor/progress/:slug", tutorHandler.UpdateProgress)

		// User-authored Learn courses: CRUD + AI draft generation. They merge
		// into the same catalog and play through the same lesson player.
		authed.GET("/courses", courseHandler.List)
		authed.POST("/courses", courseHandler.Create)
		authed.POST("/courses/generate", courseHandler.Generate)
		authed.GET("/courses/:id", courseHandler.Get)
		authed.PUT("/courses/:id", courseHandler.Update)
		authed.DELETE("/courses/:id", courseHandler.Delete)

		// Agent Studio workflows: CRUD + AI draft generation. Generate is POST-only
		// so it never collides with the /:id routes.
		authed.GET("/workflows", agentflowHandler.List)
		authed.POST("/workflows", agentflowHandler.Create)
		authed.POST("/workflows/generate", agentflowHandler.Generate)
		authed.GET("/workflows/:id", agentflowHandler.Get)
		authed.PUT("/workflows/:id", agentflowHandler.Update)
		authed.DELETE("/workflows/:id", agentflowHandler.Delete)
	}

	return r
}

// Ensure Store satisfies repository interfaces at compile time.
var (
	_ repository.ArchitectureRepository = (*postgres.Store)(nil)
	_ simulation.Repository             = (*postgres.Store)(nil)
	_ repository.HealthChecker          = (*postgres.Store)(nil)
	_ auth.UserRepository               = (*postgres.Store)(nil)
	_ achievements.Repository           = (*postgres.Store)(nil)
	_ tutor.Repository                  = (*postgres.Store)(nil)
	_ course.Repository                 = (*postgres.Store)(nil)
	_ agentflow.Repository              = (*postgres.Store)(nil)
)
