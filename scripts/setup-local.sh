#!/usr/bin/env bash
set -e

echo "=========================================="
echo "AI CAD Platform — Local Setup"
echo "=========================================="

if [ ! -f .env ]; then
  echo "Copying .env.example -> .env"
  cp .env.example .env
fi

echo "Starting backing infrastructure (PostgreSQL, Redis, RabbitMQ, MinIO, Kong)..."
docker-compose up -d

echo "Waiting for services to report healthy..."
docker-compose ps

echo "Setup complete! API Gateway running at http://localhost:8000"
