"""CadGenerationService: Orchestrates prompt engineering, LLM calls, parsing, caching, and events."""

import logging
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx
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
from src.core.models import get_provider_config, sanitize_model

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
                heavy_cad_defaults = [settings.gemini_model.lower(), settings.openai_model.lower(), settings.anthropic_model.lower()]
                if req.lower() in heavy_cad_defaults:
                    target_model = None
                else:
                    target_model = req

        if target_model:
            return sanitize_model(p, target_model, is_cad_task=is_cad_task)

        config = get_provider_config(p)
        if config:
            return config.cad_model if is_cad_task else config.chat_model
        return "default"

    async def _validate_and_auto_repair(
        self,
        provider,
        messages: List[Dict[str, str]],
        model_name: str,
        initial_result,
        parsed,
        max_repairs: int = 2,
    ):
        """Validates generated Replicad code against cad-service and triggers automatic LLM self-repair reflection if runtime errors occur."""
        current_code = parsed.code
        current_params = parsed.parameters
        current_raw = initial_result.raw_response
        total_tokens = initial_result.token_usage

        for attempt in range(max_repairs):
            if not current_code or not getattr(settings, "auto_repair_cad_errors", True):
                break

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"{settings.cad_service_url}/api/v1/cad/generate",
                        json={"script": current_code, "parameters": current_params},
                    )

                    if resp.status_code == 200:
                        logger.info("CAD code successfully validated against OpenCASCADE cad-service.")
                        break

                    error_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                    error_msg = error_data.get("error", resp.text)
                    logger.warning(
                        "CAD code failed execution (attempt %d/%d): %s. Triggering automatic LLM self-repair...",
                        attempt + 1,
                        max_repairs,
                        error_msg,
                    )

                    # Reflection prompt to LLM to self-heal its code
                    repair_messages = list(messages) + [
                        {"role": "assistant", "content": current_raw},
                        {
                            "role": "user",
                            "content": (
                                f"The generated Replicad TypeScript code produced the following execution error in the CAD kernel:\n"
                                f"```\n{error_msg}\n```\n\n"
                                f"Please fix this error. Ensure all variables, dimensions, and parameters (e.g. chamfers, fillets, radii) are explicitly defined and declared. "
                                f"Return the complete, corrected Replicad TypeScript code block enclosed in ```typescript ... ```."
                            ),
                        },
                    ]

                    repair_result = await provider.generate(
                        messages=repair_messages,
                        model=model_name,
                        temperature=0.1,
                        is_cad_task=True,
                    )

                    total_tokens += repair_result.token_usage
                    repaired_parsed = ReplicadParser.parse_cad_output(repair_result.raw_response)

                    if repaired_parsed.code:
                        current_code = repaired_parsed.code
                        current_params = repaired_parsed.parameters
                        current_raw = repair_result.raw_response
                        parsed = repaired_parsed

            except Exception as e:
                logger.debug("CAD service validation skipped or unavailable: %s", e)
                break

        return parsed, total_tokens

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
            enable_search=request.enable_search,
        )

        # Parse and sanitize Replicad TypeScript code
        parsed = ReplicadParser.parse_cad_output(result.raw_response)

        # Autonomous Commercial Self-Correction & Auto-Repair
        if is_cad_task and parsed.code:
            parsed, total_tokens = await self._validate_and_auto_repair(
                provider=provider,
                messages=messages,
                model_name=model_name,
                initial_result=result,
                parsed=parsed,
            )
            result.token_usage = total_tokens

        # Assemble API response
        response = CadGenerationResponse(
            prompt_id=prompt_id,
            replicad_code=parsed.code,
            raw_explanation=parsed.explanation,
            raw_thoughts=getattr(result, "raw_thoughts", None) or None,
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
            grounding_metadata=result.grounding_metadata,
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
            enable_search=request.enable_search,
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
                raw_thoughts=full_thoughts or None,
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
                grounding_metadata=final_payload.get("grounding_metadata"),
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
            enable_search=request.enable_search,
        )

        parsed = ReplicadParser.parse_cad_output(result.raw_response)

        # Autonomous Commercial Self-Correction & Auto-Repair for Refinement
        if is_cad_task and parsed.code:
            parsed, total_tokens = await self._validate_and_auto_repair(
                provider=provider,
                messages=messages,
                model_name=model_name,
                initial_result=result,
                parsed=parsed,
            )
            result.token_usage = total_tokens

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
            grounding_metadata=result.grounding_metadata,
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
            enable_search=request.enable_search,
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
                raw_thoughts=full_thoughts or None,
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
                grounding_metadata=final_payload.get("grounding_metadata"),
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
