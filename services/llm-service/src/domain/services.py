"""CadGenerationService: Orchestrates prompt engineering, LLM calls, parsing, caching, and events."""

import logging
import uuid
from typing import Any, AsyncGenerator, Dict, Optional
from src.api.schemas import (
    CadGenerationResponse,
    GenerateCadRequest,
    RefineCadRequest,
    ValidateCadRequest,
)
from src.config import settings
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

    @staticmethod
    def resolve_effective_model(
        provider_name: str,
        requested_model: Optional[str] = None,
        is_cad_task: bool = True,
        chat_model: Optional[str] = None,
        cad_model: Optional[str] = None,
    ) -> str:
        """Dynamically routes to optimal model based on prompt intent, provider, and separate chat/cad model settings.

        - If is_cad_task == True:
            1. Use cad_model if specified (and != 'auto' / 'default').
            2. Else if requested_model is specified (and != 'auto' / 'default').
            3. Fallback to settings.<provider>_model.
        - If is_cad_task == False:
            1. Use chat_model if specified (and != 'auto' / 'default').
            2. Fallback to settings.<provider>_fast_model.
        - Explicitly bans deprecated targets (e.g. gemini-2.0-flash) and upgrades to active targets.
        """
        p = provider_name.lower().strip()
        req = (requested_model or "").strip()
        chat_req = (chat_model or "").strip()
        cad_req = (cad_model or "").strip()

        target_model = None
        if is_cad_task:
            if cad_req and cad_req.lower() not in ("auto", "default"):
                target_model = cad_req
            elif req and req.lower() not in ("auto", "default"):
                target_model = req
        else:
            if chat_req and chat_req.lower() not in ("auto", "default"):
                target_model = chat_req
            elif req and req.lower() not in ("auto", "default"):
                # If requested_model is specifically the heavy CAD default model, don't force it on chat
                heavy_cad_defaults = [settings.gemini_model.lower(), "gemini-3.8-flash", settings.openai_model.lower(), settings.anthropic_model.lower()]
                if req.lower() in heavy_cad_defaults:
                    target_model = None
                else:
                    target_model = req

        if target_model:
            # Upgrade retired Gemini models
            if p == "gemini" and any(banned in target_model.lower() for banned in ["2.0-flash", "2.0-flash-exp"]):
                return settings.gemini_model if is_cad_task else settings.gemini_fast_model
            return target_model

        if p == "openai":
            return settings.openai_model if is_cad_task else settings.openai_fast_model
        elif p == "anthropic":
            return settings.anthropic_model if is_cad_task else settings.anthropic_fast_model
        elif p == "gemini":
            return settings.gemini_model if is_cad_task else settings.gemini_fast_model
        elif p == "ollama":
            return settings.ollama_model
        return "default"

    async def generate_cad(self, request: GenerateCadRequest) -> CadGenerationResponse:
        prompt_id = str(uuid.uuid4())
        provider_name = (request.provider or settings.llm_provider).lower().strip()
        provider = get_llm_provider(provider_name, api_key=request.api_key, base_url=request.base_url)

        # Determine intent: only load full CAD system prompt & deep thinking if designing CAD
        is_cad_task = ContextBuilder.is_cad_intent(request.prompt, request.constraints)
        model_name = self.resolve_effective_model(
            provider_name,
            requested_model=request.model,
            is_cad_task=is_cad_task,
            chat_model=request.chat_model,
            cad_model=request.cad_model,
        )
        cache_key = None

        # Check Cache only for 3D CAD models
        if is_cad_task:
            cache_key = self.cache.compute_cache_key(request.prompt, f"{provider_name}:{model_name}")
            cached_data = await self.cache.get(cache_key)
            if cached_data:
                cached_resp = CadGenerationResponse(**cached_data)
                cached_resp.prompt_id = prompt_id
                cached_resp.cached = True
                return cached_resp

        if not await provider.is_available() and not is_cad_task:
            greeting_text = (
                "Hello! I am your AI CAD & technical documentation assistant.\n\n"
                "I can help you design 3D CAD models, answer Replicad questions, calculate dimensions, or write technical specifications.\n\n"
                "*(Note: To generate 3D models and Replicad code, please configure your API key in Settings)*"
            )
            return CadGenerationResponse(
                prompt_id=prompt_id,
                replicad_code="",
                raw_explanation=greeting_text,
                provider=provider_name,
                model="local-assistant",
                latency_ms=1.0,
            )

        messages = ContextBuilder.build_generation_messages(
            user_prompt=request.prompt,
            constraints=request.constraints,
            is_cad_task=is_cad_task,
        )

        # Invoke LLM provider with dynamically resolved model
        result = await provider.generate(
            messages=messages,
            model=model_name,
            temperature=request.temperature or 0.2,
            is_cad_task=is_cad_task,
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

        # Store in Cache only for CAD designs
        if is_cad_task and cache_key:
            await self.cache.set(cache_key, response.model_dump())

        return response

    async def generate_cad_stream(
        self, request: GenerateCadRequest
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt_id = str(uuid.uuid4())
        provider_name = (request.provider or settings.llm_provider).lower().strip()
        provider = get_llm_provider(provider_name, api_key=request.api_key, base_url=request.base_url)

        # Determine intent: only load full CAD system prompt & deep thinking if designing CAD
        is_cad_task = ContextBuilder.is_cad_intent(request.prompt, request.constraints)
        model_name = self.resolve_effective_model(
            provider_name,
            requested_model=request.model,
            is_cad_task=is_cad_task,
            chat_model=request.chat_model,
            cad_model=request.cad_model,
        )
        cache_key = None

        # Check Cache only for 3D CAD models
        if is_cad_task:
            cache_key = self.cache.compute_cache_key(request.prompt, f"{provider_name}:{model_name}")
            cached_data = await self.cache.get(cache_key)
            if cached_data:
                cached_resp = CadGenerationResponse(**cached_data)
                cached_resp.prompt_id = prompt_id
                cached_resp.cached = True
                chunk_size = 40
                exp = cached_resp.raw_explanation or "Cached generation complete."
                for i in range(0, len(exp), chunk_size):
                    yield {"type": "token", "content": exp[i : i + chunk_size]}
                yield {"type": "done", "metadata": cached_resp.model_dump()}
                return

        if not await provider.is_available() and not is_cad_task:
            greeting_text = (
                "Hello! I am your AI CAD & technical documentation assistant.\n\n"
                "I can help you design 3D CAD models, answer Replicad questions, calculate dimensions, or write technical specifications.\n\n"
                "*(Note: To generate 3D models and Replicad code, please configure your API key in Settings)*"
            )
            chunk_size = 40
            for i in range(0, len(greeting_text), chunk_size):
                yield {"type": "token", "content": greeting_text[i : i + chunk_size]}
            yield {
                "type": "done",
                "metadata": CadGenerationResponse(
                    prompt_id=prompt_id,
                    replicad_code="",
                    raw_explanation=greeting_text,
                    provider=provider_name,
                    model="local-assistant",
                    latency_ms=1.0,
                ).model_dump(),
            }
            return

        messages = ContextBuilder.build_generation_messages(
            user_prompt=request.prompt,
            constraints=request.constraints,
            is_cad_task=is_cad_task,
        )

        final_payload = None
        async for item in provider.generate_stream(
            messages=messages,
            model=model_name,
            temperature=request.temperature or 0.2,
            is_cad_task=is_cad_task,
        ):
            if item.get("type") == "final_payload":
                final_payload = item
            else:
                yield item

        if final_payload:
            full_text = final_payload.get("raw_response", "")
            full_thoughts = final_payload.get("raw_thoughts", "")
            parsed = ReplicadParser.parse_cad_output(full_text)

            clean_explanation = parsed.explanation
            if not clean_explanation:
                if parsed.code:
                    clean_explanation = "Here is the 3D model generated based on your specifications."
                else:
                    clean_explanation = full_text

            response = CadGenerationResponse(
                prompt_id=prompt_id,
                replicad_code=parsed.code,
                raw_explanation=clean_explanation,
                parameters=parsed.parameters,
                parameter_definitions=parsed.parameter_definitions,
                parts=parsed.parts,
                materials_used=parsed.materials,
                has_glass=parsed.has_glass,
                provider=provider_name,
                model=final_payload.get("model", model_name),
                token_usage=final_payload.get("token_usage", 0),
                cached=False,
                latency_ms=final_payload.get("latency_ms", 0.0),
            )

            # Store in Cache only for CAD designs
            if is_cad_task and cache_key:
                await self.cache.set(cache_key, response.model_dump())

            meta = response.model_dump()
            meta["raw_thoughts"] = full_thoughts
            yield {
                "type": "done",
                "metadata": meta,
            }

    async def refine_cad(self, request: RefineCadRequest) -> CadGenerationResponse:
        prompt_id = str(uuid.uuid4())
        provider_name = (request.provider or settings.llm_provider).lower().strip()
        provider = get_llm_provider(provider_name, api_key=request.api_key, base_url=request.base_url)

        is_cad_task = ContextBuilder.is_cad_intent(request.prompt)
        model_name = self.resolve_effective_model(
            provider_name,
            requested_model=request.model,
            is_cad_task=is_cad_task,
            chat_model=request.chat_model,
            cad_model=request.cad_model,
        )
        messages = ContextBuilder.build_refinement_messages(
            refinement_prompt=request.prompt,
            previous_code=request.previous_code,
            previous_parameters=request.previous_parameters,
            is_cad_task=is_cad_task,
        )

        result = await provider.generate(
            messages=messages,
            model=model_name,
            temperature=0.2,
            is_cad_task=is_cad_task,
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

    async def refine_cad_stream(
        self, request: RefineCadRequest
    ) -> AsyncGenerator[Dict[str, Any], None]:
        prompt_id = str(uuid.uuid4())
        provider_name = (request.provider or settings.llm_provider).lower().strip()
        provider = get_llm_provider(provider_name, api_key=request.api_key, base_url=request.base_url)

        is_cad_task = ContextBuilder.is_cad_intent(request.prompt)
        model_name = self.resolve_effective_model(
            provider_name,
            requested_model=request.model,
            is_cad_task=is_cad_task,
            chat_model=request.chat_model,
            cad_model=request.cad_model,
        )
        messages = ContextBuilder.build_refinement_messages(
            refinement_prompt=request.prompt,
            previous_code=request.previous_code,
            previous_parameters=request.previous_parameters,
            is_cad_task=is_cad_task,
        )

        final_payload = None
        async for item in provider.generate_stream(
            messages=messages,
            model=model_name,
            temperature=0.2,
            is_cad_task=is_cad_task,
        ):
            if item.get("type") == "final_payload":
                final_payload = item
            else:
                yield item

        if final_payload:
            full_text = final_payload.get("raw_response", "")
            full_thoughts = final_payload.get("raw_thoughts", "")
            parsed = ReplicadParser.parse_cad_output(full_text)

            clean_explanation = parsed.explanation
            if not clean_explanation:
                if parsed.code:
                    clean_explanation = "Here is the updated 3D CAD model based on your modifications."
                else:
                    clean_explanation = full_text

            response = CadGenerationResponse(
                prompt_id=prompt_id,
                replicad_code=parsed.code,
                raw_explanation=clean_explanation,
                parameters=parsed.parameters,
                parameter_definitions=parsed.parameter_definitions,
                parts=parsed.parts,
                materials_used=parsed.materials,
                has_glass=parsed.has_glass,
                provider=provider_name,
                model=final_payload.get("model", model_name),
                token_usage=final_payload.get("token_usage", 0),
                cached=False,
                latency_ms=final_payload.get("latency_ms", 0.0),
            )

            meta = response.model_dump()
            meta["raw_thoughts"] = full_thoughts
            yield {
                "type": "done",
                "metadata": meta,
            }

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

    async def verify_provider_credentials(
        self,
        provider_name: str,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> tuple[bool, str]:
        """Instantiates provider with supplied credentials and tests connectivity."""
        try:
            effective_model = self.resolve_effective_model(provider_name, model, is_cad_task=False)
            provider = get_llm_provider(provider_name, api_key=api_key, base_url=base_url)
            return await provider.verify_credentials(model=effective_model)
        except Exception as e:
            return False, f"Provider initialization failed: {str(e)}"
