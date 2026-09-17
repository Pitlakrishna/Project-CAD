"""FastAPI route controllers for LLM service."""

import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from src.api.dependencies import get_cad_service, get_event_publisher, get_prompt_cache
from src.api.schemas import (
    CadGenerationResponse,
    GenerateCadRequest,
    HealthResponse,
    RefineCadRequest,
    ValidateCadRequest,
)
from src.config import settings
from src.domain.exceptions import (
    CodeParsingException,
    ProviderException,
    SecurityViolationException,
)
from src.domain.services import CadGenerationService
from src.infrastructure.cache import PromptCache
from src.infrastructure.messaging import EventPublisher
from src.prompts.context_builder import ContextBuilder
from src.providers import get_llm_provider

router = APIRouter(prefix="/api/v1/llm", tags=["LLM CAD Generation"])


@router.post(
    "/generate",
    response_model=CadGenerationResponse,
    summary="Generate Replicad TypeScript 3D CAD code from a natural language prompt",
    description="Translates a text prompt into watertight, parametric Replicad TypeScript with assemblies, colors, metals, and glass.",
)
async def generate_cad(
    request: GenerateCadRequest,
    service: CadGenerationService = Depends(get_cad_service),
) -> CadGenerationResponse:
    try:
        return await service.generate_cad(request)
    except SecurityViolationException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except CodeParsingException as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse valid Replicad TypeScript: {str(e)}",
        )
    except ProviderException as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal generation error: {str(e)}",
        )


@router.post(
    "/refine",
    response_model=CadGenerationResponse,
    summary="Refine existing Replicad TypeScript code with modification prompt",
)
async def refine_cad(
    request: RefineCadRequest,
    service: CadGenerationService = Depends(get_cad_service),
) -> CadGenerationResponse:
    try:
        return await service.refine_cad(request)
    except SecurityViolationException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except CodeParsingException as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse refined Replicad TypeScript: {str(e)}",
        )
    except ProviderException as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal refinement error: {str(e)}",
        )


@router.post(
    "/validate",
    response_model=CadGenerationResponse,
    summary="Validate and inspect Replicad TypeScript code",
    description="Extracts default parameters, slider bounds, parts list, colors, materials, and glass settings without invoking an LLM.",
)
async def validate_cad(
    request: ValidateCadRequest,
    service: CadGenerationService = Depends(get_cad_service),
) -> CadGenerationResponse:
    try:
        return service.validate_code(request)
    except SecurityViolationException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except CodeParsingException as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.post("/generate/stream", summary="Stream generated Replicad TypeScript tokens via SSE")
async def generate_cad_stream(
    request: GenerateCadRequest,
    service: CadGenerationService = Depends(get_cad_service),
):
    """Streams generated response via Server-Sent Events (SSE)."""
    async def event_generator():
        # First check full cache or generate via service
        try:
            full_response = await service.generate_cad(request)
            # Stream code chunks
            chunk_size = 64
            code = full_response.replicad_code
            for i in range(0, len(code), chunk_size):
                chunk = code[i : i + chunk_size]
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"

            # Finally send full payload metadata
            meta = full_response.model_dump()
            yield f"data: {json.dumps({'type': 'done', 'metadata': meta})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/health", response_model=HealthResponse, summary="Service health and backing connectivity check")
async def health_check(
    cache: PromptCache = Depends(get_prompt_cache),
    publisher: EventPublisher = Depends(get_event_publisher),
) -> HealthResponse:
    cache_ok = await cache.ping()
    mq_ok = publisher.ping()

    return HealthResponse(
        status="healthy",
        provider=settings.llm_provider,
        cache_connected=cache_ok,
        rabbitmq_connected=mq_ok,
    )
