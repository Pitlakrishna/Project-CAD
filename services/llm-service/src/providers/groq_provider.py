from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional, cast

from src.config import settings
from src.domain.models import LlmGenerationResult
from src.core.base import BaseLlmProvider
from src.core.common import (
    StreamThoughtExtractor,
    create_generation_result,
    create_stream_final_payload,
    format_chat_messages,
    handle_provider_error,
    validate_api_key,
)
from src.core.models import get_models_to_try, is_retryable_model_error

if TYPE_CHECKING:
    from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class GroqProvider(BaseLlmProvider):
    """Groq API connector for ultra-fast LPU inference (Llama 3.3, DeepSeek-R1-distill)."""

    DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or settings.groq_api_key
        self.base_url = base_url or settings.groq_base_url or self.DEFAULT_BASE_URL
        self._client: Optional[AsyncOpenAI] = None
        if self.api_key:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                timeout=settings.groq_timeout_seconds,
            )

    @staticmethod
    def _format_groq_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Formats messages for Groq API, appending a text-only directive to prevent
        Llama 3 / open-weights models from emitting native tool tokens that cause Groq 400 errors.
        """
        formatted = format_chat_messages(messages)
        text_directive = (
            "\n\n[OUTPUT FORMAT INSTRUCTION]: Provide your response entirely as plain text and standard Markdown. "
            "Do NOT invoke native tool calls or function calls. Any tool or document artifacts must be written directly as literal fenced Markdown code blocks (e.g. ```tool:<tool_name>)."
        )
        has_system = False
        for m in formatted:
            if m.get("role") == "system":
                m["content"] = (m.get("content", "") + text_directive).strip()
                has_system = True
                break
        if not has_system:
            formatted.insert(0, {"role": "system", "content": text_directive.strip()})
        return formatted

    @staticmethod
    def _is_valid_chat_model(model_id: str) -> bool:
        """Filters out voice, TTS, audio, moderation, guard, and embedding models."""
        mid = (model_id or "").lower()
        non_chat_signatures = (
            "canopylabs",
            "orpheus",
            "whisper",
            "tts",
            "audio",
            "speech",
            "voice",
            "guard",
            "safeguard",
            "embed",
            "moderation",
            "transcribe",
            "translation",
        )
        if any(sig in mid for sig in non_chat_signatures):
            return False
        # Chat models on Groq are Llama, Qwen, DeepSeek, Gemma, Mixtral, etc.
        chat_families = ("llama", "qwen", "deepseek", "gemma", "mixtral", "mistral", "gpt")
        return any(fam in mid for fam in chat_families)

    _cached_models: Optional[tuple[float, List[str]]] = None

    async def get_available_models(self) -> List[str]:
        """Dynamically queries Groq API for active text/chat models available on this API key."""
        if not self._client:
            return []

        now = time.time()
        if GroqProvider._cached_models and (now - GroqProvider._cached_models[0]) < 300:
            return GroqProvider._cached_models[1]

        try:
            res = await self._client.models.list()
            model_ids = [
                m.id for m in getattr(res, "data", [])
                if hasattr(m, "id") and self._is_valid_chat_model(m.id)
            ]
            if model_ids:
                GroqProvider._cached_models = (now, model_ids)
                return model_ids
        except Exception as e:
            logger.debug("Failed to query Groq model list: %s", e)

        return []

    async def resolve_models_to_try(
        self, requested_model: Optional[str] = None, is_cad_task: bool = True
    ) -> List[str]:
        """Dynamically builds candidate list from live Groq catalog, eliminating hardcoded model 404 errors."""
        configured = get_models_to_try("groq", requested_model=requested_model, is_cad_task=is_cad_task)
        available = await self.get_available_models()
        if not available:
            return configured

        req = (requested_model or "").strip()
        candidates: List[str] = []

        # 1. If requested model is in available models and is a chat model, place it first
        if req and req.lower() not in ("auto", "default") and req in available:
            candidates.append(req)

        # 2. Prioritize best matching available models for the task
        priority_keywords = (
            ["llama-3.3-70b", "deepseek-r1-distill-llama-70b", "qwen-qwq", "qwq", "llama-3.1-70b", "llama-3.1-8b", "llama3"]
            if is_cad_task
            else ["llama-3.1-8b", "gemma2-9b", "llama-3.3-70b", "deepseek-r1", "llama3"]
        )

        for kw in priority_keywords:
            for m_id in available:
                if kw in m_id.lower() and m_id not in candidates and self._is_valid_chat_model(m_id):
                    candidates.append(m_id)

        # 3. Add any configured fallbacks that exist in available
        for c in configured:
            if c in available and c not in candidates and self._is_valid_chat_model(c):
                candidates.append(c)

        # 4. If no priority match, include any general text/chat models
        if not candidates:
            candidates = [m for m in available if self._is_valid_chat_model(m)][:3]

        return candidates or configured

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        validate_api_key("groq", self.api_key)
        start_time = time.perf_counter()
        openai_messages = self._format_groq_messages(messages)
        models_to_try = await self.resolve_models_to_try(requested_model=model, is_cad_task=is_cad_task)

        async def _call(target_model: str):
            assert self._client is not None
            max_tokens = 8192 if is_cad_task else 2048
            return await self._client.chat.completions.create(
                model=target_model,
                messages=cast(Any, openai_messages),
                temperature=temperature,
                max_tokens=max_tokens,
            )

        last_error = None
        used_model = models_to_try[0]
        response = None
        for current_model in models_to_try:
            try:
                response = await _call(current_model)
                used_model = current_model
                break
            except Exception as e:
                last_error = e
                if is_retryable_model_error(e) and current_model != models_to_try[-1]:
                    logger.warning("Groq model '%s' failed (%s). Retrying with next fallback...", current_model, e)
                    continue
                break

        if response is None:
            handle_provider_error("groq", last_error, action="generation")

        assert response is not None
        msg = response.choices[0].message
        content = msg.content or ""
        reasoning = getattr(msg, "reasoning_content", None) or getattr(msg, "reasoning", "") or ""
        if "<think>" in content and "</think>" in content:
            before, _, rest = content.partition("<think>")
            th, _, after = rest.partition("</think>")
            if not reasoning:
                reasoning = th.strip()
            content = (before + after).strip()

        tokens = response.usage.total_tokens if response.usage else 0
        return create_generation_result(
            raw_response=content,
            provider="groq",
            model=used_model,
            start_time=start_time,
            token_usage=tokens,
            raw_thoughts=reasoning,
        )

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        **kwargs: Any,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        validate_api_key("groq", self.api_key)
        start_time = time.perf_counter()
        openai_messages = self._format_groq_messages(messages)
        models_to_try = await self.resolve_models_to_try(requested_model=model, is_cad_task=is_cad_task)
        last_error: Optional[Exception] = None

        for current_model in models_to_try:
            yielded_any = False
            try:
                if current_model != models_to_try[0]:
                    logger.info("Groq stream: falling back from '%s' to '%s'", models_to_try[0], current_model)

                assert self._client is not None
                max_tokens = 8192 if is_cad_task else 2048
                stream = await self._client.chat.completions.create(
                    model=current_model,
                    messages=cast(Any, openai_messages),
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )

                accumulated_tokens: List[str] = []
                accumulated_thoughts: List[str] = []
                thought_extractor = StreamThoughtExtractor()

                async for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta:
                        # 1. Check dedicated reasoning content field
                        reasoning = getattr(delta, "reasoning_content", None) or getattr(delta, "reasoning", None)
                        if reasoning:
                            accumulated_thoughts.append(reasoning)
                            yielded_any = True
                            yield {"type": "thought", "content": reasoning}

                        # 2. Process content tokens (extracting any inline <think> tags)
                        if delta.content:
                            yielded_any = True
                            for kind, text in thought_extractor.feed(delta.content):
                                if kind == "thought":
                                    accumulated_thoughts.append(text)
                                    yield {"type": "thought", "content": text}
                                else:
                                    accumulated_tokens.append(text)
                                    yield {"type": "token", "content": text}

                full_text = "".join(accumulated_tokens)
                full_thoughts = "".join(accumulated_thoughts)
                yield create_stream_final_payload(
                    raw_response=full_text,
                    raw_thoughts=full_thoughts,
                    model=current_model,
                    start_time=start_time,
                )
                return
            except Exception as e:
                last_error = e
                if not yielded_any and is_retryable_model_error(e) and current_model != models_to_try[-1]:
                    logger.warning("Groq stream model '%s' failed (%s). Retrying with next fallback model...", current_model, e)
                    continue
                break

        handle_provider_error("groq", last_error, action="stream")

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def verify_credentials(self, model: Optional[str] = None) -> tuple[bool, str]:
        if not self.api_key or not self._client:
            return False, "Groq API key is missing. Please provide an API key in settings or set GROQ_API_KEY."
        target_model = model or settings.groq_model
        try:
            await self._client.models.list()
            return True, f"Groq credentials verified successfully (model target: {target_model})."
        except Exception as e:
            return False, f"Groq authentication/connection failed: {str(e)}"
