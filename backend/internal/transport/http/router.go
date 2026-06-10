package http

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/scaleforge/scaleforge/internal/achievements"
	"github.com/scaleforge/scaleforge/internal/auth"
	"github.com/scaleforge/scaleforge/internal/catalog"
	"github.com/scaleforge/scaleforge/internal/config"
	"github.com/scaleforge/scaleforge/internal/cost"
	"github.com/scaleforge/scaleforge/internal/middleware"
	"github.com/scaleforge/scaleforge/internal/pricing"
	"github.com/scaleforge/scaleforge/internal/repository"
	"github.com/scaleforge/scaleforge/internal/repository/postgres"
	"github.com/scaleforge/scaleforge/internal/scoring"
	"github.com/scaleforge/scaleforge/internal/simulation"
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

	archHandler := NewArchitectureHandler(deps.Store, catalogService, deps.Store)
	simHandler := NewSimulationHandler(simService, catalogService, achievementsService)
	authHandler := NewAuthHandler(authService)
	achievementsHandler := NewAchievementsHandler(achievementsService)
	pricingHandler := NewPricingHandler(pricingCatalog)

	r.GET("/health", archHandler.Health)

	// Public auth endpoints.
	r.POST("/auth/signup", authHandler.Signup)
	r.POST("/auth/login", authHandler.Login)

	// Guest-friendly: catalog browsing and running simulations work signed out
	// (simulations just aren't persisted). A valid token is attached when present.
	guest := r.Group("/")
	guest.Use(middleware.AuthOptional(authService.Verify))
	{
		guest.GET("/catalog", archHandler.GetCatalog)
		guest.GET("/pricing", pricingHandler.List)
		guest.POST("/simulate", simHandler.Simulate)
		guest.POST("/compare", simHandler.Compare)
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
)
