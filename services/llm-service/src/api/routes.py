"""FastAPI route controllers for LLM service."""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

logger = logging.getLogger("aicad.llm_service.routes")
from src.api.dependencies import (
    extract_credentials_from_request,
    get_cad_service,
    get_event_publisher,
    get_prompt_cache,
)
from src.api.schemas import (
    CadGenerationResponse,
    GenerateCadRequest,
    HealthResponse,
    RefineCadRequest,
    ValidateCadRequest,
    VerifyCredentialsRequest,
    VerifyCredentialsResponse,
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

router = APIRouter(prefix="/api/v1/llm", tags=["LLM CAD Generation"])


@router.post(
    "/generate",
    response_model=CadGenerationResponse,
    summary="Generate Replicad TypeScript 3D CAD code from a natural language prompt",
    description="Translates a text prompt into watertight, parametric Replicad TypeScript with assemblies, colors, metals, and glass.",
)
async def generate_cad(
    request: GenerateCadRequest,
    raw_request: Request,
    service: CadGenerationService = Depends(get_cad_service),
) -> CadGenerationResponse:
    # Merge credentials from headers if not provided in JSON body
    cred = extract_credentials_from_request(raw_request)
    if not request.api_key and cred.api_key:
        request.api_key = cred.api_key
    if not request.provider and cred.provider:
        request.provider = cred.provider
    if not request.model and cred.model:
        request.model = cred.model
    if not request.chat_model and cred.chat_model:
        request.chat_model = cred.chat_model
    if not request.cad_model and cred.cad_model:
        request.cad_model = cred.cad_model
    if not request.base_url and cred.base_url:
        request.base_url = cred.base_url

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
    raw_request: Request,
    service: CadGenerationService = Depends(get_cad_service),
) -> CadGenerationResponse:
    # Merge credentials from headers if not provided in JSON body
    cred = extract_credentials_from_request(raw_request)
    if not request.api_key and cred.api_key:
        request.api_key = cred.api_key
    if not request.provider and cred.provider:
        request.provider = cred.provider
    if not request.model and cred.model:
        request.model = cred.model
    if not request.chat_model and cred.chat_model:
        request.chat_model = cred.chat_model
    if not request.cad_model and cred.cad_model:
        request.cad_model = cred.cad_model
    if not request.base_url and cred.base_url:
        request.base_url = cred.base_url

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
    raw_request: Request,
    service: CadGenerationService = Depends(get_cad_service),
):
    """Streams generated response via Server-Sent Events (SSE)."""
    cred = extract_credentials_from_request(raw_request)
    if not request.api_key and cred.api_key:
        request.api_key = cred.api_key
    if not request.provider and cred.provider:
        request.provider = cred.provider
    if not request.model and cred.model:
        request.model = cred.model
    if not request.chat_model and cred.chat_model:
        request.chat_model = cred.chat_model
    if not request.cad_model and cred.cad_model:
        request.cad_model = cred.cad_model
    if not request.base_url and cred.base_url:
        request.base_url = cred.base_url

    async def event_generator():
        try:
            async for item in service.generate_cad_stream(request):
                yield f"data: {json.dumps(item)}\n\n"
        except Exception as e:
            logger.exception("Error in generate_cad_stream: %s", e)
            err_msg = str(e).strip() or f"{type(e).__name__}: check LLM provider configuration"
            yield f"data: {json.dumps({'type': 'error', 'error': err_msg})}\n\n"

    sse_headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=sse_headers)


@router.post("/refine/stream", summary="Stream refined Replicad TypeScript tokens via SSE")
async def refine_cad_stream(
    request: RefineCadRequest,
    raw_request: Request,
    service: CadGenerationService = Depends(get_cad_service),
):
    """Streams refined response via Server-Sent Events (SSE)."""
    cred = extract_credentials_from_request(raw_request)
    if not request.api_key and cred.api_key:
        request.api_key = cred.api_key
    if not request.provider and cred.provider:
        request.provider = cred.provider
    if not request.model and cred.model:
        request.model = cred.model
    if not request.chat_model and cred.chat_model:
        request.chat_model = cred.chat_model
    if not request.cad_model and cred.cad_model:
        request.cad_model = cred.cad_model
    if not request.base_url and cred.base_url:
        request.base_url = cred.base_url

    async def event_generator():
        try:
            async for item in service.refine_cad_stream(request):
                yield f"data: {json.dumps(item)}\n\n"
        except Exception as e:
            logger.exception("Error in refine_cad_stream: %s", e)
            err_msg = str(e).strip() or f"{type(e).__name__}: check LLM provider configuration"
            yield f"data: {json.dumps({'type': 'error', 'error': err_msg})}\n\n"

    sse_headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=sse_headers)


@router.post(
    "/verify-key",
    response_model=VerifyCredentialsResponse,
    summary="Dynamically verify provider credentials and endpoint connectivity",
    description="Tests API keys and custom base URLs against providers without performing a full CAD generation.",
)
async def verify_credentials_endpoint(
    req: VerifyCredentialsRequest,
    raw_request: Request,
    service: CadGenerationService = Depends(get_cad_service),
) -> VerifyCredentialsResponse:
    cred = extract_credentials_from_request(raw_request)
    provider = req.provider or cred.provider or settings.llm_provider
    api_key = req.api_key or cred.api_key
    model = req.model or cred.model
    base_url = req.base_url or cred.base_url

    valid, message = await service.verify_provider_credentials(
        provider_name=provider,
        api_key=api_key,
        model=model,
        base_url=base_url,
    )

    return VerifyCredentialsResponse(
        valid=valid,
        provider=provider,
        model=model,
        message=message,
    )


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
