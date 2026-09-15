# ==============================================================================
# AI CAD Platform — Root Makefile
# ==============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ------------------------------------------------------------------------------
# Help Target
# ------------------------------------------------------------------------------
.PHONY: help
help:
	@echo "AI CAD Platform Management Commands:"
	@echo "-------------------------------------------------------------"
	@echo "  make up              Start backing local services (DB, Redis, MQ, MinIO)"
	@echo "  make down            Stop backing local services"
	@echo "  make restart         Restart backing services"
	@echo "  make logs            Tail logs from docker-compose services"
	@echo "  make build-all       Build all service Docker images and frontend"
	@echo "  make test-all        Execute unit and integration tests across services"
	@echo "  make lint            Run linters across Python, Go, Rust, Java, TS"
	@echo "  make proto           Generate gRPC and Protobuf code from common/proto"
	@echo "  make clean           Clean build artifacts, caches, and test reports"
	@echo "-------------------------------------------------------------"

# ------------------------------------------------------------------------------
# Local Infrastructure & Containers
# ------------------------------------------------------------------------------
.PHONY: up down restart logs ps clean-docker
up:
	docker-compose up -d

down:
	docker-compose down

restart: down up

logs:
	docker-compose logs -f

ps:
	docker-compose ps

clean-docker:
	docker-compose down -v --remove-orphans

# ------------------------------------------------------------------------------
# Build & Test
# ------------------------------------------------------------------------------
.PHONY: build-all test-all lint clean

build-all:
	@echo "==> Building all services..."
	@bash scripts/build-all.sh

test-all:
	@echo "==> Running all test suites..."
	@bash scripts/test-all.sh

lint:
	@echo "==> Running linters..."
	@if [ -d "frontend" ]; then cd frontend && npm run lint; fi

proto:
	@echo "==> Compiling Protobuf definitions with Buf..."
	@if command -v buf >/dev/null 2>&1; then cd common/proto && buf generate; else echo "buf CLI not installed"; fi

clean:
	@echo "==> Cleaning build artifacts..."
	@find . -name "target" -type d -prune -exec rm -rf '{}' + 2>/dev/null || true
	@find . -name "node_modules" -type d -prune -exec rm -rf '{}' + 2>/dev/null || true
	@find . -name "__pycache__" -type d -prune -exec rm -rf '{}' + 2>/dev/null || true
	@find . -name ".pytest_cache" -type d -prune -exec rm -rf '{}' + 2>/dev/null || true
	@find . -name "dist" -type d -prune -exec rm -rf '{}' + 2>/dev/null || true
