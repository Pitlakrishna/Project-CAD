from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional, cast

from src.config import settings
from src.domain.models import LlmGenerationResult
from src.core.base import BaseLlmProvider
from src.core.common import (
    create_generation_result,
    create_stream_final_payload,
    execute_with_model_fallback,
    format_chat_messages,
    handle_provider_error,
    validate_api_key,
)
from src.core.models import get_models_to_try, is_retryable_model_error

if TYPE_CHECKING:
    from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class GroqProvider(BaseLlmProvider):
    """Groq API connector for ultra-fast LPU inference (Llama 3.3, Llama 3.1)."""

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
        openai_messages = format_chat_messages(messages)

        async def _call(target_model: str):
            assert self._client is not None
            return await self._client.chat.completions.create(
                model=target_model,
                messages=cast(Any, openai_messages),
                temperature=temperature,
            )

        response, used_model = await execute_with_model_fallback(
            provider_name="groq",
            requested_model=model,
            is_cad_task=is_cad_task,
            call_fn=_call,
        )

        content = response.choices[0].message.content or ""
        tokens = response.usage.total_tokens if response.usage else 0
        return create_generation_result(
            raw_response=content,
            provider="groq",
            model=used_model,
            start_time=start_time,
            token_usage=tokens,
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
        openai_messages = format_chat_messages(messages)
        models_to_try = get_models_to_try("groq", requested_model=model, is_cad_task=is_cad_task)
        last_error: Optional[Exception] = None

        for current_model in models_to_try:
            yielded_any = False
            try:
                if current_model != models_to_try[0]:
                    logger.info("Groq stream: falling back from '%s' to '%s'", models_to_try[0], current_model)

                assert self._client is not None
                stream = await self._client.chat.completions.create(
                    model=current_model,
                    messages=cast(Any, openai_messages),
                    temperature=temperature,
                    stream=True,
                )

                accumulated_tokens: List[str] = []
                async for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        token = delta.content
                        accumulated_tokens.append(token)
                        yielded_any = True
                        yield {"type": "token", "content": token}

                full_text = "".join(accumulated_tokens)
                yield create_stream_final_payload(
                    raw_response=full_text,
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
