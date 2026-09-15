# AI CAD Platform

> Next-generation, browser-based, AI-driven parametric CAD platform. Convert natural language into parametric geometry, manipulate 3D models with Replicad & Three.js, and export to industry-standard STEP, STL, and DXF formats.

---

## 🏗 Architecture Overview

The platform uses a polyglot microservices monorepo architecture:

- **Frontend**: React + Vite + TypeScript + Three.js / WebGL / WebAssembly CAD viewer.
- **API Gateway**: Kong API Gateway for reverse-proxying, rate-limiting, and auth validation.
- **Backend Microservices** (`services/`):
  - `cad-service`: High-performance CAD engine built in **Rust** (Replicad runner, geometry tessellator, STEP/STL/DXF exporters).
  - `llm-service`: AI prompt engine built with **Python + FastAPI** (OpenAI, Anthropic, Ollama connectors).
  - `auth-service`: Authentication, JWT, and session management in **Java + Spring Boot**.
  - `user-service`: User profiles and multi-tenant management in **Java + Spring Boot**.
  - `payment-service`: Subscription and billing processing via Razorpay in **Java + Spring Boot**.
  - `file-service`: CAD file uploads and S3/MinIO management in **Go**.
  - `notification-service`: Real-time WebSockets, push, and emails in **Go**.
  - `analytics-service`: High-throughput ClickHouse event ingestion (**Rust**) + reporting API (**Python**).
- **Compile-time Shared Layer** (`common/`):
  - `python-common`, `java-common`, `go-common`, `rust-common`.
  - `proto/`: Protobuf / gRPC contracts managed with `buf`.
  - `events/`: Language-agnostic event schemas.
- **Infrastructure** (`infrastructure/`):
  - `kubernetes/`, `terraform/`, `helm/`, `monitoring/` (Prometheus, Grafana, Jaeger, Loki).

For detailed directory mapping, see [repository-structure.md](file:///d:/All%20FIles/practice/project-CAD/docs/architecture/repository-structure.md).

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- [Docker & Docker Compose](https://www.docker.com/)
- [Node.js (v20+)](https://nodejs.org/)
- [Make](https://www.gnu.org/software/make/)

### 2. Start Backing Infrastructure
Start PostgreSQL, Redis, RabbitMQ, MinIO, ClickHouse, and Kong Gateway:
```bash
# Copy environment variables
cp .env.example .env

# Start local infrastructure
make up
```

### 3. Verify Running Services
```bash
make ps
```
- **Kong Gateway**: [http://localhost:8000](http://localhost:8000)
- **RabbitMQ Management**: [http://localhost:15672](http://localhost:15672) (User: `guest`, Pass: `guest`)
- **MinIO Console**: [http://localhost:9001](http://localhost:9001) (User: `minioadmin`, Pass: `minioadmin`)
- **ClickHouse HTTP**: [http://localhost:8123](http://localhost:8123)

---

## 📜 Commands Reference
Run `make help` to inspect available automation commands:
```bash
make up          # Start backing containers
make down        # Stop containers
make build-all   # Build all services
make test-all    # Run test suites
make lint        # Run linters
make clean       # Clean build caches
```
