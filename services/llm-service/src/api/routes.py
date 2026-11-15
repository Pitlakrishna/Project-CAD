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


def _apply_credentials(
    request: GenerateCadRequest | RefineCadRequest,
    raw_request: Request,
) -> None:
    """Merges dynamic credentials from HTTP headers into the request body where not already set.
    This avoids duplicating the merge logic across every route handler.
    """
    cred = extract_credentials_from_request(raw_request)
    request.api_key = request.api_key or cred.api_key
    request.provider = request.provider or cred.provider
    request.model = request.model or cred.model
    request.chat_model = request.chat_model or cred.chat_model
    request.cad_model = request.cad_model or cred.cad_model
    request.base_url = request.base_url or cred.base_url


def format_route_error(e: Exception) -> str:
    """Translates raw errors into clear, actionable messages explaining the exact issue and how to resolve it."""
    err_msg = str(e).strip() or f"{type(e).__name__}: check LLM provider configuration"
    err_lower = err_msg.lower()
    if any(sig in err_lower for sig in (
        "reduce the length",
        "context_length",
        "context length",
        "maximum context length",
        "prompt is too long",
        "prompt_too_long",
        "too many tokens",
        "input is too long",
        "string too long",
        "exceeds the context window",
        "context window",
        "maximum prompt length",
        "prompt length exceeds",
        "tokens exceed",
        "payload size exceeds",
        "exceeds the maximum allowed tokens",
        "token count exceeds",
        "tokens >",
        "param': 'messages'",
        "param': \"messages\"",
        "request is too large",
        "messages or completion",
    )):
        if "how to resolve" not in err_lower:
            return (
                "Context Window Limit Exceeded: The conversation history, 3D CAD model, or prompt exceeds the provider's token limit.\n\n"
                "How to resolve:\n"
                "1. Click New Chat (+) in the sidebar to start fresh and reset the context window.\n"
                "2. Switch to Google Gemini in Settings (⚙️) for a 1,000,000+ token free context window.\n"
                "3. If using Groq, upgrade to Pay-As-You-Go in the GroqCloud Console for 128k context, or shorten earlier turns."
            )
    elif any(w in err_lower for w in ["429", "resource_exhausted", "quota", "rate limit", "rate_limit"]):
        if "how to resolve" not in err_lower:
            return "Rate limit exceeded: You have reached the API usage quota. Please wait a moment or switch to another provider in Settings."
    return err_msg


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
    _apply_credentials(request, raw_request)

    try:
        return await service.generate_cad(request)
    except SecurityViolationException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except CodeParsingException as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse valid Replicad TypeScript: {e!s}",
        )
    except ProviderException as e:
        err_msg = format_route_error(e)
        if "context window limit exceeded" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=err_msg)
        if any(w in err_msg.lower() for w in ["429", "resource_exhausted", "quota", "rate limit", "rate_limit"]):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings.",
            )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err_msg)
    except Exception as e:
        err_msg = format_route_error(e)
        if "context window limit exceeded" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=err_msg)
        if any(w in err_msg.lower() for w in ["429", "resource_exhausted", "quota", "rate limit", "rate_limit"]):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal generation error: {err_msg}",
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
    _apply_credentials(request, raw_request)

    try:
        return await service.refine_cad(request)
    except SecurityViolationException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except CodeParsingException as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse refined Replicad TypeScript: {e!s}",
        )
    except ProviderException as e:
        err_msg = format_route_error(e)
        if "context window limit exceeded" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=err_msg)
        if any(w in err_msg.lower() for w in ["429", "resource_exhausted", "quota", "rate limit", "rate_limit"]):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings.",
            )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err_msg)
    except Exception as e:
        err_msg = format_route_error(e)
        if "context window limit exceeded" in err_msg.lower():
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=err_msg)
        if any(w in err_msg.lower() for w in ["429", "resource_exhausted", "quota", "rate limit", "rate_limit"]):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal refinement error: {err_msg}",
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
    _apply_credentials(request, raw_request)

    async def event_generator():
        try:
            async for item in service.generate_cad_stream(request):
                yield f"data: {json.dumps(item)}\n\n"
        except Exception as e:
            logger.exception("Error in generate_cad_stream: %s", e)
            err_msg = format_route_error(e)
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
    _apply_credentials(request, raw_request)

    async def event_generator():
        try:
            async for item in service.refine_cad_stream(request):
                yield f"data: {json.dumps(item)}\n\n"
        except Exception as e:
            logger.exception("Error in refine_cad_stream: %s", e)
            err_msg = format_route_error(e)
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
