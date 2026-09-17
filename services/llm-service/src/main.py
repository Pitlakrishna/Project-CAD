"""FastAPI application entrypoint for the AI CAD LLM Service."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router
from src.config import settings

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("aicad.llm_service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing AI CAD LLM Service (provider: %s, env: %s)...", settings.llm_provider, settings.env)
    yield
    logger.info("Shutting down AI CAD LLM Service...")


app = FastAPI(
    title="AI CAD Platform — LLM Service",
    description=(
        "Microservice translating natural language text into watertight, parametric Replicad TypeScript "
        "3D CAD models with rich assembly support for colors, metals, plastics, and glass optics."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(router)


@app.get("/health", tags=["System"])
async def root_health():
    """Container healthcheck ping."""
    return {"status": "ok", "service": "llm-service", "version": "0.1.0"}


@app.get("/", tags=["System"])
async def root_index():
    return {
        "service": "AI CAD LLM Service",
        "status": "online",
        "docs": "/docs",
        "generate_endpoint": "/api/v1/llm/generate",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host=settings.host, port=settings.port, reload=settings.debug)
