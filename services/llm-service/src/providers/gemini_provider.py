"""Google Gemini LLM provider using the modern google-genai SDK with dynamic model selection from the frontend."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

from src.config import settings
from src.domain.exceptions import ProviderException
from src.domain.models import LlmGenerationResult
from src.core.base import BaseLlmProvider
from src.core.common import handle_provider_error, validate_api_key
from src.core.models import (
    GEMINI_BANNED_MODELS,
    get_models_to_try as centralized_get_models_to_try,
    is_retryable_model_error,
    sanitize_model as centralized_sanitize_model,
)

logger = logging.getLogger(__name__)


class GeminiProvider(BaseLlmProvider):
    """Google Gemini API connector using the exact model selected by the user."""

    DEFAULT_MODEL = "gemini-3.8-flash"
    BANNED_MODELS = GEMINI_BANNED_MODELS

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or getattr(settings, "gemini_api_key", None)
        self._client = None
        if self.api_key:
            try:
                from google import genai
                from google.genai import types
                self._client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(timeout=60000.0),
                )
            except Exception as e:
                logger.warning("Could not initialize Gemini client: %s", e)

    def _prepare_payload(self, messages: List[Dict[str, str]]):
        from google.genai import types

        system_parts: List[str] = []
        user_or_model_contents: List[tuple[str, str]] = []

        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                system_parts.append(content)
            else:
                user_or_model_contents.append((role, content))

        system_instruction = "\n\n".join(system_parts) if system_parts else None

        formatted_contents: List[types.Content] = []
        for role, content in user_or_model_contents:
            clean_text = content.strip() if content else ""
            if not clean_text:
                clean_text = " "
            genai_role = "model" if role == "assistant" else "user"
            formatted_contents.append(
                types.Content(
                    role=genai_role,
                    parts=[types.Part.from_text(text=clean_text)],
                )
            )

        if not formatted_contents:
            formatted_contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text="Hello")],
                )
            )

        return system_instruction, formatted_contents

    @classmethod
    def _build_thinking_config(cls, is_cad_task: bool, current_model: str):
        """Configure thinking parameters:
        1. Conversational Chat (Target: Sub-Second <0.8s):
           For Gemini 3.x models (gemini-3.5-flash-lite, 3.7, 3.8):
             Set thinking_level to 'minimal' or 'low' to completely eliminate
             internal reasoning deliberation and emit tokens immediately (<0.5s).
           For Gemini 2.5 / legacy models:
             Set thinking_budget = 0.
        2. 3D CAD Generation (Target: ~2–3s):
           For Gemini 3.x models:
             Set thinking_level to 'low' for fast geometric correctness without 30s stalls.
           For Gemini 2.5 / legacy models:
             Set thinking_budget = 512.
        """
        try:
            from google.genai import types

            model_lower = (current_model or "").lower()
            if any(legacy in model_lower for legacy in ["1.5-flash", "1.5-pro", "1.0"]):
                return None

            is_gemini_3 = any(v in model_lower for v in ["3.5", "3.7", "3.8", "3."])

            if not is_cad_task:
                # 1. Chat: Turn off/minimize thinking completely for sub-second (<0.5s) response
                if is_gemini_3:
                    # Use 'low' thinking level which is supported by all Gemini 3 models (3.7, 3.8, 3.5)
                    try:
                        tl = getattr(getattr(types, "ThinkingLevel", None), "LOW", "low")
                        return types.ThinkingConfig(thinking_level=tl)
                    except Exception:
                        try:
                            return types.ThinkingConfig(thinking_budget=0)
                        except Exception:
                            return None
                else:
                    # Legacy Gemini 2.5 uses thinking_budget=0
                    try:
                        return types.ThinkingConfig(thinking_budget=0)
                    except Exception:
                        try:
                            return types.ThinkingConfig(thinking_level="low")
                        except Exception:
                            return None
            else:
                # 2. 3D CAD Generation: Target ~2–3s
                if is_gemini_3:
                    try:
                        tl = getattr(getattr(types, "ThinkingLevel", None), "LOW", "low")
                        return types.ThinkingConfig(thinking_level=tl)
                    except Exception:
                        try:
                            return types.ThinkingConfig(thinking_budget=512)
                        except Exception:
                            return None
                else:
                    budget = int(getattr(settings, "gemini_thinking_budget_cad", 512) or 512)
                    if budget > 512:
                        budget = 512
                    try:
                        return types.ThinkingConfig(thinking_budget=budget)
                    except Exception:
                        try:
                            return types.ThinkingConfig(thinking_level="low")
                        except Exception:
                            return None
        except Exception as e:
            logger.warning("Could not build thinking_config for '%s': %s", current_model, e)
            return None

    @classmethod
    def _build_tools_config(cls, enable_search: bool = False) -> Optional[List[Any]]:
        """Search grounding is disabled to prevent 429 quota exhaustion on Gemini API keys."""
        return None

    @classmethod
    def _extract_grounding_metadata(cls, cand: Any) -> Optional[Dict[str, Any]]:
        """Extracts Google Search queries and cited web sources from a candidate."""
        try:
            gm = getattr(cand, "grounding_metadata", None)
            if not gm:
                return None

            queries = getattr(gm, "web_search_queries", None) or []
            chunks = getattr(gm, "grounding_chunks", None) or []
            sources: List[Dict[str, str]] = []
            for chunk in chunks:
                web = getattr(chunk, "web", None)
                if web:
                    uri = getattr(web, "uri", None) or ""
                    title = getattr(web, "title", None) or uri
                    if uri and not any(s.get("uri") == uri for s in sources):
                        sources.append({"title": title, "uri": uri})

            return {
                "search_queries": [str(q) for q in queries],
                "sources": sources,
            }
        except Exception as e:
            logger.debug("Could not parse grounding_metadata: %s", e)
            return None

    @classmethod
    def sanitize_model(cls, requested_model: Optional[str], is_cad_task: bool = False) -> str:
        """Sanitizes requested model via centralized models registry."""
        return centralized_sanitize_model("gemini", requested_model, is_cad_task=is_cad_task)

    @classmethod
    def _get_models_to_try(cls, requested_model: str, is_cad_task: bool = False) -> List[str]:
        """Returns ordered list of models for Gemini via centralized models registry."""
        return centralized_get_models_to_try("gemini", requested_model, is_cad_task=is_cad_task)

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        enable_search: Optional[bool] = None,
        **kwargs: Any,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        validate_api_key("gemini", self.api_key)

        tools = None

        default_target = getattr(settings, "gemini_model", self.DEFAULT_MODEL) if is_cad_task else getattr(settings, "gemini_fast_model", "gemini-3.5-flash-lite")
        selected_model = self.sanitize_model(model or default_target, is_cad_task=is_cad_task)
        models_to_try = self._get_models_to_try(selected_model, is_cad_task=is_cad_task)

        from google import genai
        from google.genai import types

        http_opts = types.HttpOptions(timeout=60000.0)
        client = self._client or genai.Client(api_key=self.api_key, http_options=http_opts)
        system_instruction, formatted_contents = self._prepare_payload(messages)

        last_error = None

        for current_model in models_to_try:
            is_fallback = current_model != selected_model
            if is_fallback:
                logger.info(
                    "Gemini: falling back from '%s' to '%s' due to: %s",
                    selected_model,
                    current_model,
                    last_error,
                )
            thinking_config = self._build_thinking_config(is_cad_task, current_model)
            max_tokens = 8192 if is_cad_task else 2048

            gen_config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                system_instruction=system_instruction,
                thinking_config=thinking_config,
                tools=tools,
            )

            # Try up to 2 attempts for the requested model if it's a transient spike, 1 for fallbacks
            max_attempts = 2 if not is_fallback else 1

            for attempt in range(max_attempts):
                model_start_time = time.perf_counter()
                raw_text_parts = []
                total_tokens = 0
                latest_grounding_cand = None
                try:
                    response_stream = await client.aio.models.generate_content_stream(
                        model=current_model,
                        contents=formatted_contents,
                        config=gen_config,
                    )

                    async for chunk in response_stream:
                        usage = getattr(chunk, "usage_metadata", None)
                        if usage:
                            total_tokens = getattr(usage, "total_token_count", total_tokens) or total_tokens

                        if chunk.candidates and len(chunk.candidates) > 0:
                            cand = chunk.candidates[0]
                            if getattr(cand, "grounding_metadata", None):
                                latest_grounding_cand = cand
                            finish_reason = getattr(cand, "finish_reason", None)
                            if finish_reason and str(finish_reason) not in ("STOP", "FinishReason.STOP", "None"):
                                logger.info("Gemini '%s' stream finish_reason: %s", current_model, finish_reason)

                            if cand.content and cand.content.parts:
                                for part in cand.content.parts:
                                    is_thought = getattr(part, "thought", False)
                                    text_val = getattr(part, "text", None) or ""
                                    if is_thought and text_val:
                                        yield {"type": "thought", "content": text_val}
                                    elif not is_thought and text_val:
                                        raw_text_parts.append(text_val)
                                        yield {"type": "token", "content": text_val}

                    latency = (time.perf_counter() - model_start_time) * 1000
                    full_text = "".join(raw_text_parts)

                    if not full_text.strip():
                        logger.warning(
                            "Gemini stream '%s' produced empty response. Trying next fallback model...",
                            current_model,
                        )
                        last_error = f"Model '{current_model}' returned 0 tokens"
                        continue

                    grounding_data = self._extract_grounding_metadata(latest_grounding_cand) if latest_grounding_cand else None

                    yield {
                        "type": "final_payload",
                        "raw_response": full_text,
                        "raw_thoughts": "",
                        "token_usage": int(total_tokens or 0),
                        "model": current_model,
                        "latency_ms": round(latency, 2),
                        "grounding_metadata": grounding_data,
                    }
                    return

                except Exception as e:
                    err_str = str(e).strip() or repr(e) or type(e).__name__
                    last_error = err_str
                    err_lower = f"{err_str} {type(e).__name__}".lower()



                    # If the error was caused by thinking_config being rejected for this model, step down gracefully
                    if "thinking" in err_lower and gen_config.thinking_config is not None:
                        logger.info(
                            "Gemini stream '%s': thinking_config rejected (%s). Retrying with alternative thinking param...",
                            current_model,
                            err_str[:120],
                        )
                        current_tl = str(getattr(gen_config.thinking_config, "thinking_level", "")).lower()
                        if "minimal" in current_tl:
                            try:
                                gen_config.thinking_config = types.ThinkingConfig(thinking_level="low")
                            except Exception:
                                gen_config.thinking_config = None
                        elif "low" in current_tl:
                            try:
                                gen_config.thinking_config = types.ThinkingConfig(thinking_budget=0 if not is_cad_task else 512)
                            except Exception:
                                gen_config.thinking_config = None
                        else:
                            gen_config.thinking_config = None
                        continue


                    is_high_demand_or_unavailable = (
                        "503" in err_lower
                        or "unavailable" in err_lower
                        or "high demand" in err_lower
                        or "overloaded" in err_lower
                        or "resourceexhausted" in err_lower
                        or "429" in err_lower
                    )

                    # Check if there are other fallback candidates left to try
                    current_idx = models_to_try.index(current_model) if current_model in models_to_try else -1
                    remaining_fallbacks = [m for m in models_to_try[current_idx + 1:] if m != current_model]

                    if is_high_demand_or_unavailable and remaining_fallbacks:
                        logger.warning(
                            "Gemini stream '%s' hit high demand / 503 (%s). Resetting stream and falling back immediately to '%s'...",
                            current_model,
                            err_str[:120],
                            remaining_fallbacks[0],
                        )
                        if len(raw_text_parts) > 0:
                            yield {"type": "reset"}
                            raw_text_parts = []
                        break

                    is_retryable = (
                        is_high_demand_or_unavailable
                        or "network" in err_lower
                        or "connect" in err_lower
                        or "timeout" in err_lower
                        or "socket" in err_lower
                        or "connection" in err_lower
                    )

                    if is_retryable and attempt < max_attempts - 1:
                        logger.warning(
                            "Gemini stream '%s' (attempt %d/%d) hit transient spike: %s. Retrying...",
                            current_model,
                            attempt + 1,
                            max_attempts,
                            err_str[:120],
                        )
                        if len(raw_text_parts) > 0:
                            yield {"type": "reset"}
                            raw_text_parts = []
                        await asyncio.sleep(1.0)
                        continue
                    else:
                        logger.warning(
                            "Gemini stream '%s' failed (%s). Checking next fallback model in list...",
                            current_model,
                            err_str[:120],
                        )
                        if len(raw_text_parts) > 0:
                            yield {"type": "reset"}
                            raw_text_parts = []
                        break

        last_exc = last_error if isinstance(last_error, Exception) else Exception(str(last_error))
        handle_provider_error("gemini", last_exc, action="stream")

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        enable_search: Optional[bool] = None,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        validate_api_key("gemini", self.api_key)

        tools = None

        default_target = getattr(settings, "gemini_model", self.DEFAULT_MODEL) if is_cad_task else getattr(settings, "gemini_fast_model", "gemini-3.5-flash-lite")
        selected_model = self.sanitize_model(model or default_target, is_cad_task=is_cad_task)
        models_to_try = self._get_models_to_try(selected_model, is_cad_task=is_cad_task)

        from google import genai
        from google.genai import types

        http_opts = types.HttpOptions(timeout=60000.0)
        client = self._client or genai.Client(api_key=self.api_key, http_options=http_opts)
        system_instruction, formatted_contents = self._prepare_payload(messages)

        last_error = None

        for current_model in models_to_try:
            is_fallback = current_model != selected_model
            if is_fallback:
                logger.info(
                    "Gemini generate: falling back from '%s' to '%s' due to: %s",
                    selected_model,
                    current_model,
                    last_error,
                )

            thinking_config = self._build_thinking_config(is_cad_task, current_model)
            max_tokens = 8192 if is_cad_task else 2048

            gen_config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                system_instruction=system_instruction,
                thinking_config=thinking_config,
                tools=tools,
            )

            max_attempts = 2 if not is_fallback else 1

            for attempt in range(max_attempts):
                model_start_time = time.perf_counter()
                try:
                    response = await client.aio.models.generate_content(
                        model=current_model,
                        contents=formatted_contents,
                        config=gen_config,
                    )

                    latency = (time.perf_counter() - model_start_time) * 1000
                    try:
                        raw_text = response.text or ""
                    except Exception:
                        raw_text = ""

                    if not raw_text.strip():
                        logger.warning(
                            "Gemini generate '%s' produced empty response. Trying next fallback...",
                            current_model,
                        )
                        last_error = f"Model '{current_model}' returned empty response"
                        continue

                    usage = getattr(response, "usage_metadata", None)
                    tokens = getattr(usage, "total_token_count", 0) if usage else 0

                    grounding_data = None
                    if getattr(response, "candidates", None) and len(response.candidates) > 0:
                        grounding_data = self._extract_grounding_metadata(response.candidates[0])

                    return LlmGenerationResult(
                        raw_response=raw_text,
                        token_usage=int(tokens or 0),
                        provider="gemini",
                        model=current_model,
                        latency_ms=round(latency, 2),
                        grounding_metadata=grounding_data,
                    )

                except Exception as e:
                    err_str = str(e).strip() or repr(e) or type(e).__name__
                    last_error = err_str
                    err_lower = f"{err_str} {type(e).__name__}".lower()



                    # If the error was caused by thinking_config being rejected for this model, step down gracefully
                    if "thinking" in err_lower and gen_config.thinking_config is not None:
                        logger.info(
                            "Gemini generate '%s': thinking_config rejected (%s). Retrying with alternative thinking param...",
                            current_model,
                            err_str[:120],
                        )
                        current_tl = str(getattr(gen_config.thinking_config, "thinking_level", "")).lower()
                        if "minimal" in current_tl:
                            try:
                                gen_config.thinking_config = types.ThinkingConfig(thinking_level="low")
                            except Exception:
                                gen_config.thinking_config = None
                        elif "low" in current_tl:
                            try:
                                gen_config.thinking_config = types.ThinkingConfig(thinking_budget=0 if not is_cad_task else 512)
                            except Exception:
                                gen_config.thinking_config = None
                        else:
                            gen_config.thinking_config = None
                        continue


                    is_high_demand_or_unavailable = (
                        "503" in err_lower
                        or "unavailable" in err_lower
                        or "high demand" in err_lower
                        or "overloaded" in err_lower
                        or "resourceexhausted" in err_lower
                        or "429" in err_lower
                    )

                    current_idx = models_to_try.index(current_model) if current_model in models_to_try else -1
                    remaining_fallbacks = [m for m in models_to_try[current_idx + 1:] if m != current_model]

                    if is_high_demand_or_unavailable and remaining_fallbacks:
                        logger.warning(
                            "Gemini generate '%s' hit high demand / 503 (%s). Falling back immediately to '%s'...",
                            current_model,
                            err_str[:120],
                            remaining_fallbacks[0],
                        )
                        break

                    is_retryable = (
                        is_high_demand_or_unavailable
                        or "network" in err_lower
                        or "connect" in err_lower
                        or "timeout" in err_lower
                    )

                    if is_retryable and attempt < max_attempts - 1:
                        logger.warning(
                            "Gemini generate '%s' (attempt %d/%d) hit transient spike: %s. Retrying...",
                            current_model,
                            attempt + 1,
                            max_attempts,
                            err_str[:120],
                        )
                        await asyncio.sleep(1.0)
                        continue
                    else:
                        logger.warning(
                            "Gemini generate '%s' hit error (%s). Checking next fallback...",
                            current_model,
                            err_str[:120],
                        )
                        break

        last_exc = last_error if isinstance(last_error, Exception) else Exception(str(last_error))
        handle_provider_error("gemini", last_exc, action="generation")


    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def verify_credentials(self, model: Optional[str] = None) -> tuple[bool, str]:
        if not self.api_key:
            return False, "Gemini API key is missing. Please provide an API key in settings or set GEMINI_API_KEY."

        target_model = (model or getattr(settings, "gemini_model", self.DEFAULT_MODEL)).strip()
        try:
            from google import genai
            from google.genai import types
            http_opts = types.HttpOptions(timeout=30000.0)
            client = genai.Client(api_key=self.api_key, http_options=http_opts)
            try:
                model_info = await client.aio.models.get(model=target_model)
            except (AttributeError, TypeError):
                model_info = client.models.get(model=target_model)
            return True, f"Google Gemini credentials verified successfully (model target: {getattr(model_info, 'name', target_model)})."
        except Exception as e:
            return False, f"Gemini verification failed for '{target_model}': {str(e)}"
