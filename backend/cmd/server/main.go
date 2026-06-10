package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/scaleforge/scaleforge/internal/config"
	"github.com/scaleforge/scaleforge/internal/migrate"
	"github.com/scaleforge/scaleforge/internal/repository/postgres"
	transport "github.com/scaleforge/scaleforge/internal/transport/http"
)

func main() {
	migrateOnly := flag.Bool("migrate-only", false, "run migrations and exit")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	if err := migrate.Run(cfg.DatabaseURL); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	if *migrateOnly {
		log.Println("migrations complete")
		return
	}

	ctx := context.Background()
	pool, err := postgres.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer pool.Close()

	store := postgres.NewStore(pool)
	router := transport.NewRouter(cfg, transport.Dependencies{Store: store})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("ScaleForge API listening on %s", addr)

	go func() {
		if err := router.Run(addr); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down...")
	time.Sleep(100 * time.Millisecond)
}
