# Contributing to AI CAD Platform

Thank you for your interest in contributing to the AI CAD Platform!

## Monorepo Architecture

Before making contributions, please review our canonical architecture blueprint in [repository-structure.md](file:///d:/All%20FIles/practice/project-CAD/docs/architecture/repository-structure.md).

### Microservices Development Guidelines
- Each microservice under `services/` is independently deployable and versioned.
- Shared logic must be placed inside `common/` according to its language runtime (`python-common`, `java-common`, `go-common`, `rust-common`).
- Cross-service API contracts must be defined in `common/proto/` (for gRPC) or `docs/api/openapi/` (for REST).
- Domain models must NOT be leaked across microservice boundaries.

## Development Workflow
1. Fork and clone the repository.
2. Ensure you have Docker, Make, and the respective runtime installed for the service you are developing.
3. Start backing services with `make up`.
4. Run tests with `make test-all`.
5. Ensure linters pass with `make lint`.
6. Open a pull request using our PR template.
