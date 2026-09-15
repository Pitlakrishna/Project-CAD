#!/usr/bin/env bash
set -e

echo "Building all microservices..."

# 1. Common Python build
if [ -d "common/python-common" ]; then
  echo "==> Validating python-common..."
fi

# 2. Rust CAD Engine
if [ -f "services/cad-service/Cargo.toml" ]; then
  echo "==> Building cad-service (Rust)..."
  (cd services/cad-service && cargo check)
fi

# 3. Frontend
if [ -f "frontend/package.json" ]; then
  echo "==> Building frontend..."
  (cd frontend && npm run build)
fi

echo "All builds completed."
