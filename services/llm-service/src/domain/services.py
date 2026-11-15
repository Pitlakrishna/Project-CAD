"""CadGenerationService: Orchestrates prompt engineering, LLM calls, parsing, caching, and events."""

import logging
import re
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from src.api.schemas import (
    CadGenerationResponse,
    GenerateCadRequest,
    RefineCadRequest,
    ToolCallResult,
    ValidateCadRequest,
)
from src.config import settings
from src.core.models import get_provider_config, sanitize_model
from src.domain.parser import ReplicadParser
from src.infrastructure.cache import PromptCache
from src.infrastructure.messaging import EventPublisher
from src.prompts.context_builder import ContextBuilder
from src.providers import get_llm_provider
from src.tools.schemas import ToolCallExtractor

logger = logging.getLogger(__name__)


class _ResponseMessages:
    """Centralized user-facing response strings. Never hardcode these inline."""
    NO_API_KEY_GREETING = (
        "Hello! I'm your AI CAD & technical documentation assistant.\n\n"
        "I can help you design 3D models, calculate dimensions, write specs, and generate documents.\n\n"
        "*(To generate 3D models, please configure your API key in **Settings**)*"
    )
    GENERATED_MODEL_FALLBACK = "3D model generated successfully based on your specifications."
    REFINED_MODEL_FALLBACK = "CAD model updated based on your modification request."


class CadGenerationService:
    """Core domain service for AI-assisted parametric CAD generation."""

    def __init__(
        self,
        cache: PromptCache | None = None,
        event_publisher: EventPublisher | None = None,
    ):
        self.cache = cache or PromptCache()
        self.event_publisher = event_publisher or EventPublisher()

    @staticmethod
    def resolve_effective_model(
        provider_name: str,
        requested_model: str | None = None,
        is_cad_task: bool = True,
        chat_model: str | None = None,
        cad_model: str | None = None,
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

    @staticmethod
    async def _resolve_grounded_constraints(
        prompt: str,
        constraints: dict[str, Any] | None = None,
        is_cad_task: bool = True,
    ) -> dict[str, Any]:
        """Pre-flight search grounding: automatically fetches certified engineering specs/dimensions
        and materials for real-world components when explicit user dimensions are not provided.
        """
        effective = dict(constraints or {})
        if not is_cad_task:
            return effective

        # If user didn't specify explicit dimensions (e.g. 50mm, 50x50x20, 20 x 30), ground with engineering specs
        has_explicit_dims = bool(
            re.search(
                r"\d+(?:\.\d+)?\s*(?:mm|cm|m|in|inch|inches)\b|\d+(?:\.\d+)?\s*(?:x|by|\*)\s*\d+",
                prompt,
                re.IGNORECASE,
            )
        )
        if not has_explicit_dims and "verified_standard_spec" not in effective:
            try:
                from src.tools.definitions.search_tool.executor import (
                    EngineeringSpecSearchExecutor,
                )
                spec_res = await EngineeringSpecSearchExecutor.search(prompt)
                if spec_res and spec_res.get("status") == "success" and spec_res.get("standard_envelope"):
                    effective["verified_standard_spec"] = {
                        "title": spec_res.get("title"),
                        "envelope": spec_res.get("standard_envelope"),
                        "materials": spec_res.get("specifications", {}).get("materials") if isinstance(spec_res.get("specifications"), dict) else None,
                        "source": spec_res.get("source"),
                    }
            except Exception as e:
                logger.debug("Automatic spec grounding preflight skipped: %s", e)

        return effective

    @staticmethod
    def _sanitize_tool_calls_and_explanation(
        prompt: str,
        is_cad_task: bool,
        tool_calls: list[ToolCallResult],
        explanation: str | None,
    ) -> tuple[list[ToolCallResult], str | None]:
        """Commercial guard: Document tools must only be returned when the user explicitly requests documents.
        Suppresses accidental model hallucinations during chit-chat, greetings, or pure CAD prompts.
        """
        if not ContextBuilder.is_document_intent(prompt):
            # Commercial guard: Suppress document download artifacts (Word, PDF, PPTX, Excel, CSV) when unrequested
            doc_artifacts = [tc for tc in tool_calls if tc.artifact_type in ("docx", "xlsx", "pptx", "pdf", "csv")]
            if doc_artifacts:
                logger.warning(
                    "Suppressed %d unrequested document tool call(s) for prompt '%s'",
                    len(doc_artifacts),
                    prompt[:60],
                )
                tool_calls = [tc for tc in tool_calls if tc not in doc_artifacts]

        if explanation:
            explanation = re.sub(r"```tool:[a-z_]+[\s\S]*?```", "", explanation).strip()
            explanation = re.sub(r"<file_artifact[\s\S]*?</file_artifact>", "", explanation).strip()

        return tool_calls, explanation

    async def _synthesize_cad_with_llm(
        self,
        provider,
        messages: list[dict[str, str]],
        model_name: str,
        user_prompt: str,
        initial_raw_response: str,
    ) -> tuple[Any, str, int]:
        """When a CAD task is requested but the initial LLM response omitted the Replicad code block,
        autonomously prompts the LLM to make all geometric decisions and synthesize the complete Replicad TypeScript model.
        ZERO hardcoding: the LLM decides all geometry, parameters, parts, and materials based on the user prompt.
        """
        synth_messages = list(messages) + [
            {"role": "assistant", "content": initial_raw_response},
            {
                "role": "user",
                "content": (
                    f"You have provided the technical description/documents for '{user_prompt}', but you did not include the executable Replicad TypeScript CAD code block.\n\n"
                    "Now, please make all CAD engineering design decisions and provide the COMPLETE, executable Replicad TypeScript CAD script enclosed within ```typescript ... ```:\n"
                    "- Import all necessary primitives from 'replicad' (e.g. drawRectangle, drawCircle, makeBox, makeCylinder, sketchOnPlane).\n"
                    "- Define all dimensions and design parameters in 'export const defaultParams = { ... };' with inline comments for UI sliders.\n"
                    "- In 'export default function main(params = defaultParams)', construct the geometry and return the solid or multi-part assembly array.\n"
                    "- If the user prompt asked for 2D and 3D design separately or both, return an assembly array with BOTH distinct parts:\n"
                    "  1) { name: '2D_Planar_Drawing', shape: ..., color: '#38bdf8', material: 'metal' } on plane 'XY'\n"
                    "  2) { name: '3D_Solid_Model', shape: ..., color: '#1e293b', material: 'metal' }\n"
                    "- If a 2D design, drawing, or floor plan was requested, draft on plane 'XY' with standard thickness for DXF/Top View export.\n"
                    "- Ensure watertight, manifold B-Rep solid geometry with non-zero dimensions and proper clearances."
                ),
            },
        ]

        logger.info("CAD task requested without code block. Calling LLM to autonomously decide and generate Replicad model...")
        synth_result = await provider.generate(
            messages=synth_messages,
            model=model_name,
            temperature=0.2,
            is_cad_task=True,
        )

        synth_parsed = ReplicadParser.parse_cad_output(synth_result.raw_response)
        return synth_parsed, synth_result.raw_response, synth_result.token_usage

    @staticmethod
    def _extract_threejs_scene_code(raw_response: str) -> tuple[str | None, str | None]:
        """Extracts executable Three.js procedural scene code from LLM output."""
        if not raw_response:
            return None, None

        # 1. Match code block containing buildScene
        match = re.search(r"```(?:javascript|js|typescript|ts)?\s*([\s\S]*?function\s+buildScene[\s\S]*?)```", raw_response)
        if match:
            code = match.group(1).strip()
            explanation = (raw_response[:match.start()] + "\n" + raw_response[match.end():]).strip()
            return code, explanation

        # 2. Match any js/ts block
        match = re.search(r"```(?:javascript|js|typescript|ts)\s*([\s\S]*?)```", raw_response)
        if match:
            code = match.group(1).strip()
            explanation = (raw_response[:match.start()] + "\n" + raw_response[match.end():]).strip()
            return code, explanation

        # 3. Direct function definition without markdown fence
        if "function buildScene" in raw_response:
            return raw_response.strip(), None

        return None, raw_response.strip()

    async def _synthesize_threejs_with_llm(
        self,
        provider,
        messages: list[dict[str, str]],
        model_name: str,
        user_prompt: str,
        initial_raw_response: str,
    ) -> tuple[str | None, str, int]:
        """When a Three.js scene task is requested but the initial response omitted the code block,
        autonomously prompts the LLM to output the complete Three.js procedural scene script.
        """
        synth_messages = list(messages) + [
            {"role": "assistant", "content": initial_raw_response},
            {
                "role": "user",
                "content": (
                    f"You provided the description for '{user_prompt}', but you did not include the executable Three.js JavaScript scene code block.\n\n"
                    "Now, please provide the COMPLETE, executable Three.js scene script enclosed within ```javascript ... ```:\n"
                    "- Define `function buildScene(tools) { ... }`\n"
                    "- Use `tools.THREE`, `tools.noise2D`, `tools.createPBRMaterial`, `tools.add(mesh)`\n"
                    "- Implement high detail organic or landscape geometry."
                ),
            },
        ]
        synth_result = await provider.generate(
            messages=synth_messages,
            model=model_name,
            temperature=0.2,
            is_cad_task=True,
        )
        code, _ = self._extract_threejs_scene_code(synth_result.raw_response)
        return code, synth_result.raw_response, synth_result.token_usage

    async def _validate_and_auto_repair(
        self,
        provider,
        messages: list[dict[str, str]],
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
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{settings.cad_service_url.rstrip('/')}/api/v1/cad/generate",
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

        # Determine intent: Three.js WebGL scene vs CAD OpenCASCADE vs Conversational
        engine_mode = getattr(request, "engine_mode", "auto") or "auto"
        is_threejs_task = (engine_mode == "threejs") or (
            engine_mode in ("auto", None) and ContextBuilder.is_threejs_scene_intent(request.prompt)
        )
        is_cad_task = False if is_threejs_task else ContextBuilder.is_cad_intent(request.prompt, request.constraints)
        model_name = self.resolve_effective_model(
            provider_name,
            requested_model=request.model,
            is_cad_task=is_cad_task or is_threejs_task,
            chat_model=request.chat_model,
            cad_model=request.cad_model,
        )
        cache_key = None

        # Check Cache for 3D CAD or Three.js models
        if is_threejs_task:
            cache_key = self.cache.compute_cache_key(f"threejs:{request.prompt}", f"{provider_name}:{model_name}")
            cached_data = await self.cache.get(cache_key)
            if cached_data:
                cached_resp = CadGenerationResponse(**cached_data)
                cached_resp.prompt_id = prompt_id
                cached_resp.cached = True
                return cached_resp
        elif is_cad_task:
            cache_key = self.cache.compute_cache_key(request.prompt, f"{provider_name}:{model_name}")
            cached_data = await self.cache.get(cache_key)
            if cached_data:
                cached_resp = CadGenerationResponse(**cached_data)
                cached_resp.prompt_id = prompt_id
                cached_resp.cached = True
                return cached_resp

        if not await provider.is_available() and not is_cad_task and not is_threejs_task:
            return CadGenerationResponse(
                prompt_id=prompt_id,
                replicad_code="",
                raw_explanation=_ResponseMessages.NO_API_KEY_GREETING,
                provider=provider_name,
                model="local-assistant",
                latency_ms=1.0,
            )

        if is_threejs_task:
            messages = ContextBuilder.build_threejs_messages(
                user_prompt=request.prompt,
                history=getattr(request, "history", None),
            )
            result = await provider.generate(
                messages=messages,
                model=model_name,
                temperature=request.temperature or 0.2,
                is_cad_task=True,
                enable_search=request.enable_search,
            )
            threejs_code, explanation = self._extract_threejs_scene_code(result.raw_response)
            if not threejs_code:
                synth_code, synth_raw, synth_tokens = await self._synthesize_threejs_with_llm(
                    provider=provider,
                    messages=messages,
                    model_name=model_name,
                    user_prompt=request.prompt,
                    initial_raw_response=result.raw_response,
                )
                if synth_code:
                    threejs_code = synth_code
                    result.token_usage += synth_tokens
                    if not explanation:
                        explanation = synth_raw

            tool_calls_raw = ToolCallExtractor.extract(result.raw_response)
            tool_calls = [ToolCallResult(**tc.model_dump()) for tc in tool_calls_raw]
            tool_calls, explanation = self._sanitize_tool_calls_and_explanation(
                prompt=request.prompt,
                is_cad_task=True,
                tool_calls=tool_calls,
                explanation=explanation,
            )

            response = CadGenerationResponse(
                prompt_id=prompt_id,
                engine_mode="threejs",
                replicad_code="",
                threejs_code=threejs_code or "",
                raw_explanation=explanation or _ResponseMessages.GENERATED_MODEL_FALLBACK,
                raw_thoughts=getattr(result, "raw_thoughts", None) or None,
                parameters={},
                parameter_definitions=[],
                parts=[],
                materials_used=["procedural_pbr"],
                has_glass=False,
                provider=result.provider,
                model=result.model,
                token_usage=result.token_usage,
                cached=False,
                latency_ms=result.latency_ms,
                grounding_metadata=result.grounding_metadata,
                tool_calls=tool_calls,
            )

            self.event_publisher.publish_code_generated(
                prompt_id=prompt_id,
                user_id=request.user_id or "anonymous",
                code_snippet=threejs_code or "",
                token_usage=result.token_usage,
                tenant_id=request.tenant_id,
            )

            if cache_key:
                await self.cache.set(cache_key, response.model_dump())

            return response

        effective_constraints = await self._resolve_grounded_constraints(
            prompt=request.prompt,
            constraints=request.constraints,
            is_cad_task=is_cad_task,
        )
        messages = ContextBuilder.build_generation_messages(
            user_prompt=request.prompt,
            constraints=effective_constraints,
            is_cad_task=is_cad_task,
            history=getattr(request, "history", None),
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

        # Autonomous LLM Decision Guard: If user requested CAD design, ensure LLM generates the code block
        if is_cad_task and not parsed.code:
            logger.info("CAD task requested, but LLM omitted code block. Prompting LLM to synthesize Replicad model...")
            synth_parsed, _synth_raw, synth_tokens = await self._synthesize_cad_with_llm(
                provider=provider,
                messages=messages,
                model_name=model_name,
                user_prompt=request.prompt,
                initial_raw_response=result.raw_response,
            )
            if synth_parsed.code:
                parsed = synth_parsed
                result.token_usage += synth_tokens
                if not parsed.explanation:
                    parsed.explanation = result.raw_response

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

        # Extract structured tool calls (new format + legacy XML fallback)
        tool_calls_raw = ToolCallExtractor.extract(result.raw_response)
        tool_calls = [ToolCallResult(**tc.model_dump()) for tc in tool_calls_raw]
        tool_calls, parsed.explanation = self._sanitize_tool_calls_and_explanation(
            prompt=request.prompt,
            is_cad_task=is_cad_task,
            tool_calls=tool_calls,
            explanation=parsed.explanation,
        )

        # Assemble API response
        response = CadGenerationResponse(
            prompt_id=prompt_id,
            engine_mode="cad",
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
            tool_calls=tool_calls,
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
    ) -> AsyncGenerator[dict[str, Any], None]:
        prompt_id = str(uuid.uuid4())
        provider_name = (request.provider or settings.llm_provider).lower().strip()
        provider = get_llm_provider(provider_name, api_key=request.api_key, base_url=request.base_url)

        # Determine intent: Three.js WebGL scene vs CAD OpenCASCADE vs Conversational
        engine_mode = getattr(request, "engine_mode", "auto") or "auto"
        is_threejs_task = (engine_mode == "threejs") or (
            engine_mode in ("auto", None) and ContextBuilder.is_threejs_scene_intent(request.prompt)
        )
        is_cad_task = False if is_threejs_task else ContextBuilder.is_cad_intent(request.prompt, request.constraints)
        model_name = self.resolve_effective_model(
            provider_name,
            requested_model=request.model,
            is_cad_task=is_cad_task or is_threejs_task,
            chat_model=request.chat_model,
            cad_model=request.cad_model,
        )
        cache_key = None

        # Check Cache for 3D CAD or Three.js models
        if is_threejs_task:
            cache_key = self.cache.compute_cache_key(f"threejs:{request.prompt}", f"{provider_name}:{model_name}")
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
        elif is_cad_task:
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

        if not await provider.is_available() and not is_cad_task and not is_threejs_task:
            chunk_size = 40
            greeting_text = _ResponseMessages.NO_API_KEY_GREETING
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

        if is_threejs_task:
            messages = ContextBuilder.build_threejs_messages(
                user_prompt=request.prompt,
                history=getattr(request, "history", None),
            )
            final_payload = None
            async for item in provider.generate_stream(
                messages=messages,
                model=model_name,
                temperature=request.temperature or 0.2,
                is_cad_task=True,
                enable_search=request.enable_search,
            ):
                if item.get("type") == "final_payload":
                    final_payload = item
                else:
                    yield item

            if final_payload:
                full_text = final_payload.get("raw_response", "")
                full_thoughts = final_payload.get("raw_thoughts", "")
                threejs_code, explanation = self._extract_threejs_scene_code(full_text)

                if not threejs_code:
                    synth_messages = list(messages) + [
                        {"role": "assistant", "content": full_text},
                        {
                            "role": "user",
                            "content": (
                                f"You provided the description for '{request.prompt}', but you did not output the executable Three.js JavaScript scene code block.\n\n"
                                "Now, please output the COMPLETE, executable Three.js scene script enclosed within ```javascript ... ```:\n"
                                "- Define `function buildScene(tools) { ... }`\n"
                                "- Use `tools.THREE`, `tools.noise2D`, `tools.createPBRMaterial`, `tools.add(mesh)`\n"
                                "- Output the complete ```javascript ... ``` block now."
                            ),
                        },
                    ]
                    synth_tokens = []
                    yield {"type": "token", "content": "\n\n"}
                    async for item in provider.generate_stream(
                        messages=synth_messages,
                        model=model_name,
                        temperature=0.2,
                        is_cad_task=True,
                    ):
                        if item.get("type") == "token":
                            synth_tokens.append(item.get("content", ""))
                            yield item

                    synth_full_text = "".join(synth_tokens)
                    full_text = full_text + "\n\n" + synth_full_text
                    threejs_code, explanation = self._extract_threejs_scene_code(full_text)

                clean_explanation = explanation or full_text
                tool_calls_raw = ToolCallExtractor.extract(full_text)
                tool_calls = [ToolCallResult(**tc.model_dump()) for tc in tool_calls_raw]
                tool_calls, clean_explanation = self._sanitize_tool_calls_and_explanation(
                    prompt=request.prompt,
                    is_cad_task=True,
                    tool_calls=tool_calls,
                    explanation=clean_explanation,
                )

                response = CadGenerationResponse(
                    prompt_id=prompt_id,
                    engine_mode="threejs",
                    replicad_code="",
                    threejs_code=threejs_code or "",
                    raw_explanation=clean_explanation,
                    raw_thoughts=full_thoughts or None,
                    parameters={},
                    parameter_definitions=[],
                    parts=[],
                    materials_used=["procedural_pbr"],
                    has_glass=False,
                    provider=provider_name,
                    model=final_payload.get("model", model_name),
                    token_usage=final_payload.get("token_usage", 0),
                    cached=False,
                    latency_ms=final_payload.get("latency_ms", 0.0),
                    grounding_metadata=final_payload.get("grounding_metadata"),
                    tool_calls=tool_calls,
                )

                if cache_key:
                    await self.cache.set(cache_key, response.model_dump())

                meta = response.model_dump()
                meta["raw_thoughts"] = full_thoughts
                yield {
                    "type": "done",
                    "metadata": meta,
                }
            return

        effective_constraints = await self._resolve_grounded_constraints(
            prompt=request.prompt,
            constraints=request.constraints,
            is_cad_task=is_cad_task,
        )
        messages = ContextBuilder.build_generation_messages(
            user_prompt=request.prompt,
            constraints=effective_constraints,
            is_cad_task=is_cad_task,
            history=getattr(request, "history", None),
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

            # Autonomous LLM Decision Guard: If user requested CAD design, ensure LLM streams the code block
            if is_cad_task and not parsed.code:
                logger.info("CAD streaming task requested without code block. Streaming autonomous LLM CAD generation...")
                synth_messages = list(messages) + [
                    {"role": "assistant", "content": full_text},
                    {
                        "role": "user",
                        "content": (
                            f"You provided the technical description/documents for '{request.prompt}', but you did not output the executable Replicad TypeScript CAD code block.\n\n"
                            "Now, please make all CAD engineering design decisions and output the COMPLETE, executable Replicad TypeScript CAD script enclosed within ```typescript ... ```:\n"
                            "- Import primitives from 'replicad' (e.g. drawRectangle, drawCircle, makeBox, makeCylinder, sketchOnPlane).\n"
                            "- Define all dimensions in 'export const defaultParams = { ... };'.\n"
                            "- In 'export default function main(params = defaultParams)', return the solid shape or multi-part assembly array.\n"
                            "- If 2D and 3D were requested separately or together, return BOTH parts: '2D_Planar_Drawing' and '3D_Solid_Model'.\n"
                            "- Output the complete ```typescript ... ``` block now."
                        ),
                    },
                ]

                synth_tokens = []
                yield {"type": "token", "content": "\n\n"}
                async for item in provider.generate_stream(
                    messages=synth_messages,
                    model=model_name,
                    temperature=0.2,
                    is_cad_task=True,
                ):
                    if item.get("type") == "token":
                        synth_tokens.append(item.get("content", ""))
                        yield item

                synth_full_text = "".join(synth_tokens)
                full_text = full_text + "\n\n" + synth_full_text
                parsed = ReplicadParser.parse_cad_output(full_text)

            clean_explanation = parsed.explanation
            if not clean_explanation:
                if parsed.code:
                    clean_explanation = _ResponseMessages.GENERATED_MODEL_FALLBACK
                else:
                    clean_explanation = full_text

            # Extract structured tool calls (new format + legacy XML fallback)
            tool_calls_raw = ToolCallExtractor.extract(full_text)
            tool_calls = [ToolCallResult(**tc.model_dump()) for tc in tool_calls_raw]
            tool_calls, clean_explanation = self._sanitize_tool_calls_and_explanation(
                prompt=request.prompt,
                is_cad_task=is_cad_task,
                tool_calls=tool_calls,
                explanation=clean_explanation,
            )

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
                tool_calls=tool_calls,
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

        is_threejs = ("function buildScene" in (request.previous_code or "")) or (
            getattr(request, "engine_mode", None) == "threejs"
        )
        if is_threejs:
            model_name = self.resolve_effective_model(
                provider_name,
                requested_model=request.model,
                is_cad_task=True,
                chat_model=request.chat_model,
                cad_model=request.cad_model,
            )
            messages = ContextBuilder.build_threejs_refinement_messages(
                refinement_prompt=request.prompt,
                previous_code=request.previous_code,
                history=getattr(request, "history", None),
            )
            result = await provider.generate(
                messages=messages,
                model=model_name,
                temperature=0.2,
                is_cad_task=True,
                enable_search=request.enable_search,
            )
            threejs_code, explanation = self._extract_threejs_scene_code(result.raw_response)
            tool_calls_raw = ToolCallExtractor.extract(result.raw_response)
            tool_calls = [ToolCallResult(**tc.model_dump()) for tc in tool_calls_raw]
            tool_calls, explanation = self._sanitize_tool_calls_and_explanation(
                prompt=request.prompt,
                is_cad_task=True,
                tool_calls=tool_calls,
                explanation=explanation,
            )
            return CadGenerationResponse(
                prompt_id=prompt_id,
                engine_mode="threejs",
                replicad_code="",
                threejs_code=threejs_code or request.previous_code,
                raw_explanation=explanation or _ResponseMessages.REFINED_MODEL_FALLBACK,
                raw_thoughts=getattr(result, "raw_thoughts", None) or None,
                parameters={},
                parameter_definitions=[],
                parts=[],
                materials_used=["procedural_pbr"],
                has_glass=False,
                provider=result.provider,
                model=result.model,
                token_usage=result.token_usage,
                cached=False,
                latency_ms=result.latency_ms,
                grounding_metadata=result.grounding_metadata,
                tool_calls=tool_calls,
            )

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
            history=getattr(request, "history", None),
        )

        result = await provider.generate(
            messages=messages,
            model=model_name,
            temperature=0.2,
            is_cad_task=is_cad_task,
            enable_search=request.enable_search,
        )

        parsed = ReplicadParser.parse_cad_output(result.raw_response)

        # Autonomous LLM Decision Guard: If user requested CAD refinement, ensure LLM generates updated code block
        if is_cad_task and not parsed.code:
            logger.info("CAD refinement requested, but LLM omitted code block. Prompting LLM to synthesize updated model...")
            synth_parsed, _synth_raw, synth_tokens = await self._synthesize_cad_with_llm(
                provider=provider,
                messages=messages,
                model_name=model_name,
                user_prompt=request.prompt,
                initial_raw_response=result.raw_response,
            )
            if synth_parsed.code:
                parsed = synth_parsed
                result.token_usage += synth_tokens
                if not parsed.explanation:
                    parsed.explanation = result.raw_response

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

        # Extract structured tool calls (new format + legacy XML fallback)
        tool_calls_raw = ToolCallExtractor.extract(result.raw_response)
        tool_calls = [ToolCallResult(**tc.model_dump()) for tc in tool_calls_raw]
        tool_calls, parsed.explanation = self._sanitize_tool_calls_and_explanation(
            prompt=request.prompt,
            is_cad_task=is_cad_task,
            tool_calls=tool_calls,
            explanation=parsed.explanation,
        )

        response = CadGenerationResponse(
            prompt_id=prompt_id,
            engine_mode="cad",
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
            tool_calls=tool_calls,
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
    ) -> AsyncGenerator[dict[str, Any], None]:
        prompt_id = str(uuid.uuid4())
        provider_name = (request.provider or settings.llm_provider).lower().strip()
        provider = get_llm_provider(provider_name, api_key=request.api_key, base_url=request.base_url)

        is_threejs = ("function buildScene" in (request.previous_code or "")) or (
            getattr(request, "engine_mode", None) == "threejs"
        )
        if is_threejs:
            model_name = self.resolve_effective_model(
                provider_name,
                requested_model=request.model,
                is_cad_task=True,
                chat_model=request.chat_model,
                cad_model=request.cad_model,
            )
            messages = ContextBuilder.build_threejs_refinement_messages(
                refinement_prompt=request.prompt,
                previous_code=request.previous_code,
                history=getattr(request, "history", None),
            )
            final_payload = None
            async for item in provider.generate_stream(
                messages=messages,
                model=model_name,
                temperature=0.2,
                is_cad_task=True,
                enable_search=request.enable_search,
            ):
                if item.get("type") == "final_payload":
                    final_payload = item
                else:
                    yield item

            if final_payload:
                full_text = final_payload.get("raw_response", "")
                full_thoughts = final_payload.get("raw_thoughts", "")
                threejs_code, explanation = self._extract_threejs_scene_code(full_text)
                clean_explanation = explanation or full_text
                tool_calls_raw = ToolCallExtractor.extract(full_text)
                tool_calls = [ToolCallResult(**tc.model_dump()) for tc in tool_calls_raw]
                tool_calls, clean_explanation = self._sanitize_tool_calls_and_explanation(
                    prompt=request.prompt,
                    is_cad_task=True,
                    tool_calls=tool_calls,
                    explanation=clean_explanation,
                )
                response = CadGenerationResponse(
                    prompt_id=prompt_id,
                    engine_mode="threejs",
                    replicad_code="",
                    threejs_code=threejs_code or request.previous_code,
                    raw_explanation=clean_explanation,
                    raw_thoughts=full_thoughts or None,
                    parameters={},
                    parameter_definitions=[],
                    parts=[],
                    materials_used=["procedural_pbr"],
                    has_glass=False,
                    provider=provider_name,
                    model=final_payload.get("model", model_name),
                    token_usage=final_payload.get("token_usage", 0),
                    cached=False,
                    latency_ms=final_payload.get("latency_ms", 0.0),
                    grounding_metadata=final_payload.get("grounding_metadata"),
                    tool_calls=tool_calls,
                )
                meta = response.model_dump()
                meta["raw_thoughts"] = full_thoughts
                yield {
                    "type": "done",
                    "metadata": meta,
                }
            return

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
            history=getattr(request, "history", None),
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

            # Autonomous LLM Decision Guard: If user requested CAD refinement, ensure LLM streams the code block
            if is_cad_task and not parsed.code:
                logger.info("CAD refinement streaming requested without code block. Streaming autonomous LLM CAD generation...")
                synth_messages = list(messages) + [
                    {"role": "assistant", "content": full_text},
                    {
                        "role": "user",
                        "content": (
                            f"You provided the refinement explanation for '{request.prompt}', but you did not output the updated executable Replicad TypeScript CAD code block.\n\n"
                            "Now, please make all CAD engineering design decisions and output the COMPLETE, updated Replicad TypeScript CAD script enclosed within ```typescript ... ```:\n"
                            "- Import primitives from 'replicad'.\n"
                            "- Update all parametric dimensions in 'export const defaultParams = { ... };'.\n"
                            "- In 'export default function main(params = defaultParams)', construct and return the updated shape or assembly.\n"
                            "- Output the complete ```typescript ... ``` block now."
                        ),
                    },
                ]

                synth_tokens = []
                yield {"type": "token", "content": "\n\n"}
                async for item in provider.generate_stream(
                    messages=synth_messages,
                    model=model_name,
                    temperature=0.2,
                    is_cad_task=True,
                ):
                    if item.get("type") == "token":
                        synth_tokens.append(item.get("content", ""))
                        yield item

                synth_full_text = "".join(synth_tokens)
                full_text = full_text + "\n\n" + synth_full_text
                parsed = ReplicadParser.parse_cad_output(full_text)

            clean_explanation = parsed.explanation
            if not clean_explanation:
                if parsed.code:
                    clean_explanation = _ResponseMessages.REFINED_MODEL_FALLBACK
                else:
                    clean_explanation = full_text

            # Extract structured tool calls (new format + legacy XML fallback)
            tool_calls_raw = ToolCallExtractor.extract(full_text)
            tool_calls = [ToolCallResult(**tc.model_dump()) for tc in tool_calls_raw]
            tool_calls, clean_explanation = self._sanitize_tool_calls_and_explanation(
                prompt=request.prompt,
                is_cad_task=is_cad_task,
                tool_calls=tool_calls,
                explanation=clean_explanation,
            )

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
                tool_calls=tool_calls,
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
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> tuple[bool, str]:
        """Instantiates provider with supplied credentials and tests connectivity."""
        try:
            effective_model = self.resolve_effective_model(provider_name, model, is_cad_task=False)
            provider = get_llm_provider(provider_name, api_key=api_key, base_url=base_url)
            return await provider.verify_credentials(model=effective_model)
        except Exception as e:
            return False, f"Provider initialization failed: {e!s}"
