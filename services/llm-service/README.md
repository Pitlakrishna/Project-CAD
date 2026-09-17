# LLM Service — AI Prompt Engine

The **LLM Service** translates natural language prompts into parametric 3D CAD models written in **Replicad TypeScript**.

## Features
- **Replicad TypeScript Code Generation**: Generates watertight, parametric 3D geometry scripts.
- **Physical Materials & Glass Optics**: Generates multi-part assemblies with colors (`#hex`), physical materials (`metal`, `plastic`, `wood`, `rubber`), and glass parameters (`opacity`, `transmission`, `roughness`, `ior`).
- **Parametric Sliders**: Exports strongly-typed `defaultParams` suitable for dynamic UI slider bindings in Three.js CAD viewers.
- **Multi-Provider Support**: Pluggable support for:
  - `openai` (GPT-4o, GPT-4 Turbo)
  - `anthropic` (Claude 3.5 Sonnet)
  - `ollama` (Local models: DeepSeek-Coder, Llama 3)
  - `mock` (Deterministic local provider for offline testing with zero API keys)
- **Sanitizer & Parser**: Strips markdown, validates Replicad AST exports, and extracts assembly parts metadata.
- **Caching & Event-Driven**: Caches prompt hashes in Redis and publishes `LlmCodeGeneratedPayload` to RabbitMQ.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn src.main:app --reload --port 8000
```

## API Endpoints
- `POST /api/v1/llm/generate`: Generate Replicad 3D CAD code from a prompt.
- `POST /api/v1/llm/refine`: Iteratively modify existing CAD code based on follow-up user instructions.
- `POST /api/v1/llm/validate`: Validate and extract parameters/parts from existing Replicad TypeScript code.
- `GET /api/v1/llm/health`: Health status.
