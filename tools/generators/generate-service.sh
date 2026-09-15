#!/usr/bin/env bash
# Helper script to scaffold a new microservice
set -e

SERVICE_NAME=$1
TECH_STACK=$2 # python, java, rust, go

if [ -z "$SERVICE_NAME" ] || [ -z "$TECH_STACK" ]; then
  echo "Usage: ./tools/generators/generate-service.sh <service-name> <python|java|rust|go>"
  exit 1
fi

TARGET_DIR="services/$SERVICE_NAME"
mkdir -p "$TARGET_DIR"

echo "Scaffolding $SERVICE_NAME ($TECH_STACK) into $TARGET_DIR..."
echo "# $SERVICE_NAME" > "$TARGET_DIR/README.md"
echo "Done."
