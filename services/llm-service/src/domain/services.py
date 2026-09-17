"""CadGenerationService: Orchestrates prompt engineering, LLM calls, parsing, caching, and events."""

import logging
import uuid
from typing import Optional
from src.api.schemas import (
    CadGenerationResponse,
    GenerateCadRequest,
    RefineCadRequest,
    ValidateCadRequest,
)
from src.domain.parser import ReplicadParser
from src.infrastructure.cache import PromptCache
from src.infrastructure.messaging import EventPublisher
from src.prompts.context_builder import ContextBuilder
from src.providers import get_llm_provider

logger = logging.getLogger(__name__)


class CadGenerationService:
    """Core domain service for AI-assisted parametric CAD generation."""

    def __init__(
        self,
        cache: Optional[PromptCache] = None,
        event_publisher: Optional[EventPublisher] = None,
    ):
        self.cache = cache or PromptCache()
        self.event_publisher = event_publisher or EventPublisher()

    async def generate_cad(self, request: GenerateCadRequest) -> CadGenerationResponse:
        prompt_id = str(uuid.uuid4())
        provider_name = request.provider
        provider = get_llm_provider(provider_name, api_key=request.api_key)
        model_name = request.model or getattr(provider, "model", "default")

        # Check Cache
        cache_key = self.cache.compute_cache_key(request.prompt, f"{provider_name}:{model_name}")
        cached_data = await self.cache.get(cache_key)
        if cached_data:
            cached_resp = CadGenerationResponse(**cached_data)
            cached_resp.prompt_id = prompt_id
            cached_resp.cached = True
            return cached_resp

        # Assemble prompt sequence
        messages = ContextBuilder.build_generation_messages(
            user_prompt=request.prompt,
            constraints=request.constraints,
            include_examples=True,
        )

        # Invoke LLM provider
        result = await provider.generate(
            messages=messages,
            model=request.model,
            temperature=request.temperature or 0.2,
        )

        # Parse and sanitize Replicad TypeScript code
        parsed = ReplicadParser.parse_cad_output(result.raw_response)

        # Assemble API response
        response = CadGenerationResponse(
            prompt_id=prompt_id,
            replicad_code=parsed.code,
            raw_explanation=parsed.explanation,
            parameters=parsed.parameters,
            parameter_definitions=parsed.parameter_definitions,
            parts=parsed.parts,
            materials_used=parsed.materials,
            has_glass=parsed.has_glass,
            provider=result.provider,
            model=result.model,
            token_usage=result.token_usage,
            cached=False,
            latency_ms=result.latency_ms,
        )

        # Asynchronously publish event
        self.event_publisher.publish_code_generated(
            prompt_id=prompt_id,
            user_id=request.user_id or "anonymous",
            code_snippet=parsed.code,
            token_usage=result.token_usage,
            tenant_id=request.tenant_id,
        )

        # Store in Cache
        await self.cache.set(cache_key, response.model_dump())

        return response

    async def refine_cad(self, request: RefineCadRequest) -> CadGenerationResponse:
        prompt_id = str(uuid.uuid4())
        provider = get_llm_provider(request.provider, api_key=request.api_key)

        messages = ContextBuilder.build_refinement_messages(
            refinement_prompt=request.prompt,
            previous_code=request.previous_code,
            previous_parameters=request.previous_parameters,
        )

        result = await provider.generate(
            messages=messages,
            model=request.model,
            temperature=0.2,
        )

        parsed = ReplicadParser.parse_cad_output(result.raw_response)

        response = CadGenerationResponse(
            prompt_id=prompt_id,
            replicad_code=parsed.code,
            raw_explanation=parsed.explanation,
            parameters=parsed.parameters,
            parameter_definitions=parsed.parameter_definitions,
            parts=parsed.parts,
            materials_used=parsed.materials,
            has_glass=parsed.has_glass,
            provider=result.provider,
            model=result.model,
            token_usage=result.token_usage,
            cached=False,
            latency_ms=result.latency_ms,
        )

        self.event_publisher.publish_code_generated(
            prompt_id=prompt_id,
            user_id=request.user_id or "anonymous",
            code_snippet=parsed.code,
            token_usage=result.token_usage,
            tenant_id=request.tenant_id,
        )

        return response

    @staticmethod
    def validate_code(request: ValidateCadRequest) -> CadGenerationResponse:
        """Parses and validates arbitrary Replicad TypeScript code without calling an LLM."""
        prompt_id = str(uuid.uuid4())
        parsed = ReplicadParser.parse_cad_output(request.replicad_code)

        return CadGenerationResponse(
            prompt_id=prompt_id,
            replicad_code=parsed.code,
            raw_explanation=parsed.explanation,
            parameters=parsed.parameters,
            parameter_definitions=parsed.parameter_definitions,
            parts=parsed.parts,
            materials_used=parsed.materials,
            has_glass=parsed.has_glass,
            provider="validator",
            model="internal-ast-parser",
            token_usage=0,
            cached=False,
            latency_ms=0.5,
        )
