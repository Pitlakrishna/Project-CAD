#!/usr/bin/env bash
set -e

echo "Running tests across all services..."

# 1. Tests in tests/e2e
if [ -d "tests/e2e" ] && [ -f "tests/e2e/package.json" ]; then
  echo "==> Running E2E tests..."
  (cd tests/e2e && npm test)
fi

echo "Tests finished."
