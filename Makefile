.PHONY: db-up db-down backend frontend dev migrate build-backend

db-up:
	docker compose up -d postgres adminer

db-down:
	docker compose down

migrate:
	cd backend && go run ./cmd/server -migrate-only

backend:
	cd backend && go run ./cmd/server

frontend:
	cd frontend && bun run dev

dev: db-up
	@echo "Starting backend and frontend..."
	@make -j2 backend frontend

build-backend:
	cd backend && go build -o bin/server ./cmd/server

build-frontend:
	cd frontend && bun run build
