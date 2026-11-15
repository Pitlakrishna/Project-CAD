from __future__ import annotations

import logging
import time
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any, cast

from src.config import settings
from src.core.base import BaseLlmProvider
from src.core.common import (
    StreamThoughtExtractor,
    create_generation_result,
    create_stream_final_payload,
    execute_with_model_fallback,
    format_chat_messages,
    handle_provider_error,
    validate_api_key,
)
from src.core.models import get_models_to_try, is_retryable_model_error
from src.domain.models import LlmGenerationResult

if TYPE_CHECKING:
    from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class DeepSeekProvider(BaseLlmProvider):
    """DeepSeek API connector for DeepSeek-V3 (deepseek-chat) and DeepSeek-R1 (deepseek-reasoner)."""

    DEFAULT_BASE_URL = "https://api.deepseek.com"

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.deepseek_api_key
        self.base_url = base_url or settings.deepseek_base_url or self.DEFAULT_BASE_URL
        self._client: AsyncOpenAI | None = None
        if self.api_key:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                timeout=settings.deepseek_timeout_seconds,
            )

    async def generate(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        validate_api_key("deepseek", self.api_key)
        start_time = time.perf_counter()
        openai_messages = format_chat_messages(messages)

        async def _call(target_model: str):
            assert self._client is not None
            create_kwargs: dict[str, Any] = {
                "model": target_model,
                "messages": cast(Any, openai_messages),
            }
            if "reasoner" not in target_model.lower():
                create_kwargs["temperature"] = temperature
            return await self._client.chat.completions.create(**create_kwargs)

        response, used_model = await execute_with_model_fallback(
            provider_name="deepseek",
            requested_model=model,
            is_cad_task=is_cad_task,
            call_fn=_call,
        )

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
            provider="deepseek",
            model=used_model,
            start_time=start_time,
            token_usage=tokens,
            raw_thoughts=reasoning,
        )

    async def generate_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        **kwargs: Any,
    ) -> AsyncGenerator[dict[str, Any], None]:
        validate_api_key("deepseek", self.api_key)
        start_time = time.perf_counter()
        openai_messages = format_chat_messages(messages)
        models_to_try = get_models_to_try("deepseek", requested_model=model, is_cad_task=is_cad_task)
        last_error: Exception | None = None

        for current_model in models_to_try:
            yielded_any = False
            try:
                if current_model != models_to_try[0]:
                    logger.info("DeepSeek stream: falling back from '%s' to '%s'", models_to_try[0], current_model)

                assert self._client is not None
                create_kwargs: dict[str, Any] = {
                    "model": current_model,
                    "messages": cast(Any, openai_messages),
                    "stream": True,
                }
                if "reasoner" not in current_model.lower():
                    create_kwargs["temperature"] = temperature

                stream = await self._client.chat.completions.create(**create_kwargs)

                accumulated_tokens: list[str] = []
                accumulated_thoughts: list[str] = []
                thought_extractor = StreamThoughtExtractor()

                async for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta:
                        # 1. DeepSeek-R1 native reasoning tokens
                        reasoning = getattr(delta, "reasoning_content", None) or getattr(delta, "reasoning", None)
                        if reasoning:
                            accumulated_thoughts.append(reasoning)
                            yielded_any = True
                            yield {"type": "thought", "content": reasoning}

                        # 2. Normal output tokens (with inline <think> extractor fallback)
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
                    model=current_model,
                    start_time=start_time,
                    raw_thoughts=full_thoughts,
                )
                return
            except Exception as e:
                last_error = e
                if not yielded_any and is_retryable_model_error(e) and current_model != models_to_try[-1]:
                    logger.warning(
                        "DeepSeek stream model '%s' failed (%s). Retrying with next fallback model...",
                        current_model,
                        e,
                    )
                    continue
                break

        handle_provider_error("deepseek", last_error, action="stream")

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def verify_credentials(self, model: str | None = None) -> tuple[bool, str]:
        if not self.api_key or not self._client:
            return False, "DeepSeek API key is missing. Please provide an API key in settings or set DEEPSEEK_API_KEY."
        target_model = model or settings.deepseek_model
        try:
            await self._client.models.list()
            return True, f"DeepSeek credentials verified successfully (model target: {target_model})."
        except Exception as e:
            return False, f"DeepSeek authentication/connection failed: {e!s}"
