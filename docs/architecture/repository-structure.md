# AI CAD Platform — Complete Repository Structure & Architecture Blueprint

This document defines the canonical, production-grade folder structure, technology stacks, and service-level architecture for the **AI CAD Platform** polyglot microservices monorepo.

```text
ai-cad-platform/
│
├── README.md                              # Project overview, quick start
├── CONTRIBUTING.md                        # How to contribute
├── CODE_OF_CONDUCT.md                     # Community guidelines
├── SECURITY.md                            # Security policy & disclosure
├── CHANGELOG.md                           # Version history
├── LICENSE
├── .gitignore
├── .editorconfig
├── .gitattributes
├── .dockerignore
├── .env.example
├── docker-compose.yml                     # Local development
├── docker-compose.prod.yml                # Production overrides
├── makefile                               # Common dev commands
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                         # Build + test on PR
│   │   ├── cd.yml                         # Deploy on merge to main
│   │   ├── security-scan.yml              # SAST, dependency scan
│   │   └── release.yml                    # Tagged releases
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── CODEOWNERS                         # Auto-review assignments
│
├── docs/                                  # Project documentation
│   ├── architecture/
│   │   ├── overview.md                    # System architecture
│   │   ├── adr/                           # Architecture Decision Records
│   │   │   ├── 001-microservices.md
│   │   │   ├── 002-config-server.md
│   │   │   ├── 003-event-driven.md
│   │   │   └── 004-database-per-service.md
│   │   └── diagrams/
│   │       ├── runtime-connections.png
│   │       ├── request-flow.png
│   │       └── deployment.png
│   ├── api/                               # API contracts
│   │   ├── openapi/
│   │   │   ├── auth-service.yaml
│   │   │   ├── llm-service.yaml
│   │   │   ├── cad-service.yaml
│   │   │   └── ...
│   │   └── events/                        # Event schemas
│   │       ├── user.registered.json
│   │       ├── llm.code_generated.json
│   │       └── cad.export_ready.json
│   ├── runbooks/                          # Operational runbooks
│   │   ├── incident-response.md
│   │   ├── database-recovery.md
│   │   └── scaling-guide.md
│   ├── onboarding/
│   │   ├── developer-setup.md
│   │   └── first-pr.md
│   └── business/
│       ├── pricing-strategy.md
│       └── go-to-market.md
│
├── infrastructure/
│   ├── config-server/                     # Spring Cloud Config Server
│   │   ├── Dockerfile
│   │   ├── pom.xml
│   │   ├── README.md
│   │   └── src/
│   │       ├── main/
│   │       │   ├── java/com/aicad/config/
│   │       │   │   └── ConfigServerApplication.java
│   │       │   └── resources/
│   │       │       ├── application.yml
│   │       │       └── bootstrap.yml
│   │       └── test/
│   │           └── java/com/aicad/config/
│   │               └── ConfigServerTest.java
│   │
│   ├── config-repo/                       # Git-backed configuration
│   │   ├── README.md
│   │   ├── application.yml                # Shared across all services
│   │   ├── application-dev.yml
│   │   ├── application-staging.yml
│   │   ├── application-prod.yml
│   │   ├── auth-service.yml
│   │   ├── auth-service-dev.yml
│   │   ├── auth-service-prod.yml
│   │   ├── user-service.yml
│   │   ├── llm-service.yml
│   │   ├── llm-service-prod.yml
│   │   ├── cad-service.yml
│   │   ├── payment-service.yml
│   │   ├── file-service.yml
│   │   ├── notification-service.yml
│   │   └── analytics-service.yml
│   │
│   ├── discovery-server/                  # Eureka / Consul
│   │   ├── Dockerfile
│   │   ├── pom.xml
│   │   ├── README.md
│   │   └── src/
│   │       ├── main/
│   │       │   ├── java/com/aicad/discovery/
│   │       │   │   └── DiscoveryServerApplication.java
│   │       │   └── resources/
│   │       │       └── application.yml
│   │       └── test/
│   │
│   ├── kubernetes/
│   │   ├── namespaces/
│   │   │   └── ai-cad.yaml
│   │   ├── ingress/
│   │   │   └── api-gateway.yaml
│   │   ├── secrets/
│   │   │   └── external-secrets.yaml
│   │   ├── config-server/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── configmap.yaml
│   │   ├── discovery-server/
│   │   │   ├── deployment.yaml
│   │   │   └── service.yaml
│   │   ├── auth-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   ├── hpa.yaml
│   │   │   └── configmap.yaml
│   │   ├── user-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   ├── hpa.yaml
│   │   │   └── configmap.yaml
│   │   ├── llm-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   ├── hpa.yaml
│   │   │   └── configmap.yaml
│   │   ├── cad-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   ├── hpa.yaml
│   │   │   ├── configmap.yaml
│   │   │   └── gpu-node-selector.yaml
│   │   ├── payment-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── configmap.yaml
│   │   ├── file-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── configmap.yaml
│   │   ├── notification-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── configmap.yaml
│   │   ├── analytics-service/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── configmap.yaml
│   │   ├── messaging/
│   │   │   ├── rabbitmq-statefulset.yaml
│   │   │   └── rabbitmq-service.yaml
│   │   ├── cache/
│   │   │   ├── redis-statefulset.yaml
│   │   │   └── redis-service.yaml
│   │   └── monitoring/
│   │       ├── prometheus.yaml
│   │       ├── grafana.yaml
│   │       ├── jaeger.yaml
│   │       └── loki.yaml
│   │
│   ├── terraform/
│   │   ├── environments/
│   │   │   ├── dev/
│   │   │   ├── staging/
│   │   │   └── prod/
│   │   ├── modules/
│   │   │   ├── rds/
│   │   │   ├── eks/
│   │   │   ├── elasticache/
│   │   │   ├── mq/
│   │   │   ├── s3/
│   │   │   └── vpc/
│   │   └── README.md
│   │
│   ├── helm/
│   │   └── charts/
│   │       ├── ai-cad-platform/
│   │       │   ├── Chart.yaml
│   │       │   ├── values.yaml
│   │       │   ├── values-dev.yaml
│   │       │   ├── values-prod.yaml
│   │       │   └── templates/
│   │       └── monitoring-stack/
│   │
│   └── monitoring/
│       ├── prometheus/
│       │   ├── prometheus.yml
│       │   └── alerts.yml
│       ├── grafana/
│       │   ├── dashboards/
│       │   │   ├── service-overview.json
│       │   │   ├── llm-usage.json
│       │   │   └── business-metrics.json
│       │   └── datasources/
│       ├── jaeger/
│       └── loki/
│
├── gateway/                               # Kong API Gateway
│   ├── kong.yml
│   ├── routes.yml
│   ├── plugins.yml
│   ├── consumers.yml
│   └── README.md
│
├── services/
│   │
│   ├── auth-service/                      # Java + Spring Boot
│   │   ├── Dockerfile
│   │   ├── pom.xml
│   │   ├── .env.example
│   │   ├── README.md
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── java/com/aicad/auth/
│   │   │   │   │   ├── AuthApplication.java
│   │   │   │   │   ├── config/
│   │   │   │   │   │   ├── SecurityConfig.java
│   │   │   │   │   │   ├── RedisConfig.java
│   │   │   │   │   │   ├── RabbitMQConfig.java
│   │   │   │   │   │   ├── JwtConfig.java
│   │   │   │   │   │   └── OpenApiConfig.java
│   │   │   │   │   ├── api/
│   │   │   │   │   │   ├── AuthController.java
│   │   │   │   │   │   ├── dto/
│   │   │   │   │   │   │   ├── RegisterRequest.java
│   │   │   │   │   │   │   ├── LoginRequest.java
│   │   │   │   │   │   │   └── TokenResponse.java
│   │   │   │   │   │   └── mapper/
│   │   │   │   │   │       └── UserMapper.java
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── User.java
│   │   │   │   │   │   ├── Session.java
│   │   │   │   │   │   └── service/
│   │   │   │   │   │       ├── AuthService.java
│   │   │   │   │   │       └── JwtService.java
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   ├── repository/
│   │   │   │   │   │   │   └── UserRepository.java
│   │   │   │   │   │   ├── cache/
│   │   │   │   │   │   │   └── SessionCache.java
│   │   │   │   │   │   └── messaging/
│   │   │   │   │   │       └── EventPublisher.java
│   │   │   │   │   └── events/
│   │   │   │   │       └── UserEventPublisher.java
│   │   │   │   └── resources/
│   │   │   │       ├── application.yml
│   │   │   │       ├── bootstrap.yml
│   │   │   │       └── db/migration/
│   │   │   │           ├── V1__create_users.sql
│   │   │   │           └── V2__create_sessions.sql
│   │   │   └── test/
│   │   │       ├── java/com/aicad/auth/
│   │   │       │   ├── unit/
│   │   │       │   ├── integration/
│   │   │       │   └── e2e/
│   │   │       └── resources/
│   │   │           └── application-test.yml
│   │   └── .mvn/
│   │
│   ├── user-service/                      # Java + Spring Boot
│   │   ├── Dockerfile
│   │   ├── pom.xml
│   │   ├── .env.example
│   │   ├── README.md
│   │   └── src/
│   │       ├── main/
│   │       │   ├── java/com/aicad/user/
│   │       │   │   ├── UserApplication.java
│   │       │   │   ├── config/
│   │       │   │   ├── api/
│   │       │   │   │   ├── UserController.java
│   │       │   │   │   ├── TenantController.java
│   │       │   │   │   └── dto/
│   │       │   │   ├── domain/
│   │       │   │   │   ├── UserProfile.java
│   │       │   │   │   ├── Tenant.java
│   │       │   │   │   ├── Preference.java
│   │       │   │   │   └── service/
│   │       │   │   ├── infrastructure/
│   │       │   │   │   ├── repository/
│   │       │   │   │   └── cache/
│   │       │   │   └── events/
│   │       │   └── resources/
│   │       │       ├── application.yml
│   │       │       ├── bootstrap.yml
│   │       │       └── db/migration/
│   │       └── test/
│   │
│   ├── llm-service/                       # Python + FastAPI
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── requirements-dev.txt
│   │   ├── pyproject.toml
│   │   ├── .env.example
│   │   ├── README.md
│   │   ├── src/
│   │   │   ├── __init__.py
│   │   │   ├── main.py
│   │   │   ├── config.py
│   │   │   ├── api/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── routes.py
│   │   │   │   ├── schemas.py
│   │   │   │   └── dependencies.py
│   │   │   ├── domain/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── models.py
│   │   │   │   ├── services.py
│   │   │   │   └── exceptions.py
│   │   │   ├── providers/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py
│   │   │   │   ├── openai_provider.py
│   │   │   │   ├── anthropic_provider.py
│   │   │   │   └── ollama_provider.py
│   │   │   ├── prompts/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── system_prompt.py
│   │   │   │   ├── context_builder.py
│   │   │   │   └── examples.py
│   │   │   ├── infrastructure/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── database.py
│   │   │   │   ├── repositories.py
│   │   │   │   ├── cache.py
│   │   │   │   ├── messaging.py
│   │   │   │   └── observability.py
│   │   │   └── events/
│   │   │       ├── __init__.py
│   │   │       ├── publishers.py
│   │   │       └── subscribers.py
│   │   ├── migrations/
│   │   │   ├── alembic.ini
│   │   │   └── versions/
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   ├── e2e/
│   │   │   └── conftest.py
│   │   └── scripts/
│   │       └── seed_data.py
│   │
│   ├── cad-service/                       # Rust (High Performance CAD engine)
│   │   ├── Dockerfile
│   │   ├── Cargo.toml
│   │   ├── Cargo.lock
│   │   ├── .env.example
│   │   ├── README.md
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   ├── config.rs
│   │   │   ├── lib.rs
│   │   │   ├── api/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── routes.rs
│   │   │   │   ├── schemas.rs
│   │   │   │   └── handlers.rs
│   │   │   ├── engine/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── replicad_runner.rs
│   │   │   │   ├── tessellator.rs
│   │   │   │   └── sanitizer.rs
│   │   │   ├── exporters/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── step_exporter.rs
│   │   │   │   ├── dxf_exporter.rs
│   │   │   │   └── stl_exporter.rs
│   │   │   ├── infrastructure/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── redis.rs
│   │   │   │   ├── rabbitmq.rs
│   │   │   │   └── observability.rs
│   │   │   └── events/
│   │   │       ├── mod.rs
│   │   │       ├── publishers.rs
│   │   │       └── subscribers.rs
│   │   ├── migrations/
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   └── integration/
│   │   └── benches/
│   │
│   ├── payment-service/                   # Java + Spring Boot
│   │   ├── Dockerfile
│   │   ├── pom.xml
│   │   ├── .env.example
│   │   ├── README.md
│   │   └── src/
│   │       ├── main/
│   │       │   ├── java/com/aicad/payment/
│   │       │   │   ├── PaymentApplication.java
│   │       │   │   ├── config/
│   │       │   │   │   ├── RazorpayConfig.java
│   │       │   │   │   ├── SecurityConfig.java
│   │       │   │   │   └── RabbitMQConfig.java
│   │       │   │   ├── api/
│   │       │   │   │   ├── PaymentController.java
│   │       │   │   │   ├── WebhookController.java
│   │       │   │   │   └── dto/
│   │       │   │   ├── domain/
│   │       │   │   │   ├── Subscription.java
│   │       │   │   │   ├── Order.java
│   │       │   │   │   ├── Invoice.java
│   │       │   │   │   └── service/
│   │       │   │   │       ├── SubscriptionService.java
│   │       │   │   │       └── PlanService.java
│   │       │   │   ├── infrastructure/
│   │       │   │   │   ├── repository/
│   │       │   │   │   ├── razorpay/
│   │       │   │   │   │   ├── RazorpayClient.java
│   │       │   │   │   │   └── SignatureVerifier.java
│   │       │   │   │   └── messaging/
│   │       │   │   └── events/
│   │       │   └── resources/
│   │       │       ├── application.yml
│   │       │       ├── bootstrap.yml
│   │       │       └── db/migration/
│   │       └── test/
│   │
│   ├── file-service/                      # Go
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── go.sum
│   │   ├── .env.example
│   │   ├── README.md
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go
│   │   ├── internal/
│   │   │   ├── config/
│   │   │   │   └── config.go
│   │   │   ├── api/
│   │   │   │   ├── routes.go
│   │   │   │   ├── handlers.go
│   │   │   │   └── middleware.go
│   │   │   ├── domain/
│   │   │   │   ├── file.go
│   │   │   │   └── service.go
│   │   │   ├── storage/
│   │   │   │   ├── minio.go
│   │   │   │   └── r2.go
│   │   │   ├── repository/
│   │   │   │   └── file_repo.go
│   │   │   ├── migrations/
│   │   │   └── events/
│   │   │       ├── publisher.go
│   │   │       └── subscriber.go
│   │   ├── pkg/
│   │   │   └── utils/
│   │   └── tests/
│   │       ├── unit/
│   │       └── integration/
│   │
│   ├── notification-service/              # Go
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── .env.example
│   │   ├── README.md
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go
│   │   ├── internal/
│   │   │   ├── config/
│   │   │   ├── api/
│   │   │   ├── domain/
│   │   │   ├── channels/
│   │   │   │   ├── email.go
│   │   │   │   ├── sms.go
│   │   │   │   └── push.go
│   │   │   ├── templates/
│   │   │   │   ├── welcome.html
│   │   │   │   ├── payment_success.html
│   │   │   │   └── export_ready.html
│   │   │   └── events/
│   │   │       └── subscriber.go
│   │   └── tests/
│   │
│   └── analytics-service/                 # Rust (ingestion) + Python (analysis)
│       ├── README.md
│       ├── ingestion/                     # High-throughput ClickHouse ingest
│       │   ├── Dockerfile
│       │   ├── Cargo.toml
│       │   └── src/
│       │       ├── main.rs
│       │       ├── clickhouse.rs
│       │       └── events/
│       │           └── subscriber.rs
│       └── analysis/                      # Python reporting & analytics API
│           ├── Dockerfile
│           ├── requirements.txt
│           └── src/
│               ├── main.py
│               ├── api/
│               │   └── routes.py
│               └── reports/
│                   └── usage_report.py
│
├── common/                                # COMPILE-TIME shared libraries & contracts
│   ├── python-common/
│   │   ├── pyproject.toml
│   │   ├── README.md
│   │   └── src/
│   │       └── aicad_common/
│   │           ├── __init__.py
│   │           ├── auth/
│   │           ├── logging/
│   │           ├── events/
│   │           ├── db/
│   │           └── observability/
│   │
│   ├── java-common/
│   │   ├── pom.xml
│   │   ├── README.md
│   │   └── src/main/java/com/aicad/common/
│   │       ├── auth/
│   │       ├── events/
│   │       ├── exceptions/
│   │       └── observability/
│   │
│   ├── go-common/
│   │   ├── go.mod
│   │   ├── README.md
│   │   └── pkg/
│   │       ├── auth/
│   │       ├── events/
│   │       ├── logging/
│   │       └── observability/
│   │
│   ├── proto/                             # gRPC contracts (if needed)
│   │   ├── auth.proto
│   │   ├── llm.proto
│   │   ├── cad.proto
│   │   └── buf.yaml
│   │
│   └── events/                            # Event schemas (language-agnostic)
│       ├── schemas.py
│       ├── schemas.go
│       ├── schemas.rs
│       ├── schemas.ts
│       └── README.md
│
├── frontend/                              # React + Vite + TypeScript CAD UI
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env.example
│   ├── .eslintrc.cjs
│   ├── .prettierrc
│   ├── index.html
│   ├── README.md
│   ├── public/
│   │   ├── favicon.ico
│   │   ├── robots.txt
│   │   └── assets/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── vite-env.d.ts
│       ├── router/
│       │   └── index.tsx
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── EditorPage.tsx
│       │   ├── SettingsPage.tsx
│       │   └── BillingPage.tsx
│       ├── components/
│       │   ├── Chat/
│       │   │   ├── ChatPanel.tsx
│       │   │   ├── MessageList.tsx
│       │   │   ├── Message.tsx
│       │   │   └── PromptInput.tsx
│       │   ├── Viewport/
│       │   │   ├── Viewer3D.tsx
│       │   │   ├── Scene.tsx
│       │   │   ├── Camera.tsx
│       │   │   └── Lighting.tsx
│       │   ├── FeatureTree/
│       │   │   ├── TreePanel.tsx
│       │   │   └── FeatureNode.tsx
│       │   ├── ParameterPanel/
│       │   │   ├── ParameterEditor.tsx
│       │   │   └── Slider.tsx
│       │   ├── History/
│       │   │   └── Timeline.tsx
│       │   ├── Export/
│       │   │   └── ExportDialog.tsx
│       │   └── common/
│       │       ├── Button.tsx
│       │       ├── Modal.tsx
│       │       └── Loader.tsx
│       ├── services/
│       │   ├── api.ts
│       │   ├── llmClient.ts
│       │   ├── cadClient.ts
│       │   ├── fileClient.ts
│       │   └── paymentClient.ts
│       ├── store/
│       │   ├── cadStore.ts
│       │   ├── llmStore.ts
│       │   └── uiStore.ts
│       ├── workers/
│       │   └── cadWorker.ts
│       ├── config/
│       │   ├── systemPrompt.ts
│       │   └── constants.ts
│       ├── utils/
│       │   ├── buildUserMessage.ts
│       │   ├── codeParser.ts
│       │   └── format.ts
│       ├── types/
│       │   ├── cad.ts
│       │   ├── user.ts
│       │   └── api.ts
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   └── useCad.ts
│       └── styles/
│           ├── globals.css
│           └── themes.css
│
├── scripts/                               # Operational scripts
│   ├── setup-local.sh                     # One-command local setup
│   ├── deploy.sh                          # Deploy to K8s
│   ├── migrate.sh                         # Run all DB migrations
│   ├── seed.sh                            # Seed dev data
│   ├── build-all.sh                       # Build all services
│   ├── test-all.sh                        # Run all tests
│   ├── security-scan.sh                   # SAST + dependency scan
│   └── generate-openapi.sh                # Generate API docs
│
├── tests/                                 # Cross-service tests
│   ├── e2e/
│   │   ├── auth-flow.spec.ts
│   │   ├── generation-flow.spec.ts
│   │   └── payment-flow.spec.ts
│   ├── load/
│   │   ├── k6-script.js
│   │   └── README.md
│   └── fixtures/
│       └── sample-prompts.json
│
├── tools/                                 # ⬅️ NEW: Developer tooling
│   ├── README.md
│   │
│   ├── generators/                        # Code generation
│   │   ├── generate-service.sh            # Scaffold new microservice
│   │   ├── generate-api-client.sh         # Generate TS client from OpenAPI
│   │   ├── generate-event-schema.sh       # Generate event classes from JSON schema
│   │   └── templates/
│   │       ├── service-template/
│   │       │   ├── Dockerfile.tmpl
│   │       │   ├── README.md.tmpl
│   │       │   └── src/
│   │       └── event-template/
│   │
│   ├── cli/                               # Custom CLI tooling
│   │   ├── aicad-cli/
│   │   │   ├── package.json
│   │   │   ├── src/
│   │   │   │   ├── index.ts
│   │   │   │   ├── commands/
│   │   │   │   │   ├── db-reset.ts
│   │   │   │   │   ├── seed-user.ts
│   │   │   │   │   ├── run-migration.ts
│   │   │   │   │   └── health-check.ts
│   │   │   │   └── utils/
│   │   │   └── README.md
│   │
│   ├── load-testing/                      # k6, Locust
│   │   ├── k6/
│   │   │   ├── auth-flow.js
│   │   │   ├── llm-flow.js
│   │   │   └── cad-flow.js
│   │   ├── locust/
│   │   │   └── locustfile.py
│   │   └── README.md
│   │
│   ├── db-tools/                          # Database utilities
│   │   ├── migrate-all.sh                 # Run all service migrations
│   │   ├── seed-dev-data.py               # Seed dev data
│   │   ├── backup.sh
│   │   ├── restore.sh
│   │   └── reset-all-dbs.sh
│   │
│   ├── api-tools/                         # API utilities
│   │   ├── postman/
│   │   │   ├── ai-cad.postman_collection.json
│   │   │   └── ai-cad.postman_environment.json
│   │   ├── httpie/
│   │   │   └── examples.http
│   │   └── curl/
│   │       └── examples.sh
│   │
│   ├── security-tools/                    # Security utilities
│   │   ├── scan-dependencies.sh
│   │   ├── rotate-secrets.sh
│   │   ├── audit-jwt.sh
│   │   └── generate-keys.sh               # RSA keypair for JWT
│   │
│   ├── git-hooks/                         # Git hooks
│   │   ├── pre-commit
│   │   ├── commit-msg
│   │   └── pre-push
│   │
│   ├── vscode/                            # VS Code workspace
│   │   ├── settings.json
│   │   ├── extensions.json
│   │   ├── launch.json
│   │   └── tasks.json
│   │
│   ├── intellij/                          # IntelliJ config
│   │   ├── code-style.xml
│   │   └── inspection-profile.xml
│   │
│   ├── docker-tools/                      # Docker utilities
│   │   ├── prune-all.sh
│   │   ├── build-service.sh
│   │   └── tail-logs.sh
│   │
│   └── docs-tools/                        # Documentation tooling
│       ├── generate-api-docs.sh
│       ├── generate-architecture-diagram.sh
│       └── validate-links.sh
│
```
