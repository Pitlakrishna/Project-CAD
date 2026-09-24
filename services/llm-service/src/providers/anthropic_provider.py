from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from src.config import settings
from src.domain.models import LlmGenerationResult
from src.core.base import BaseLlmProvider
from src.core.common import (
    StreamThoughtExtractor,
    create_generation_result,
    create_stream_final_payload,
    execute_with_model_fallback,
    extract_system_and_messages,
    handle_provider_error,
    validate_api_key,
)
from src.core.models import get_models_to_try, is_retryable_model_error

if TYPE_CHECKING:
    from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)


class AnthropicProvider(BaseLlmProvider):
    """Anthropic API connector for Claude 3.5 Sonnet."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or settings.anthropic_api_key
        self.base_url = base_url or settings.anthropic_base_url
        self._client: Optional[AsyncAnthropic] = None
        if self.api_key:
            from anthropic import AsyncAnthropic
            client_kwargs = {
                "api_key": self.api_key,
                "timeout": settings.anthropic_timeout_seconds,
            }
            if self.base_url:
                client_kwargs["base_url"] = self.base_url
            self._client = AsyncAnthropic(**client_kwargs)

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        validate_api_key("anthropic", self.api_key)
        start_time = time.perf_counter()
        clean_system, claude_messages = extract_system_and_messages(messages)

        async def _call(target_model: str):
            assert self._client is not None
            create_kwargs: Dict[str, Any] = {
                "model": target_model,
                "messages": claude_messages,
                "max_tokens": 4096 if is_cad_task else 2048,
                "extra_body": {"temperature": temperature},
            }
            if clean_system:
                create_kwargs["system"] = clean_system
            return await self._client.messages.create(**create_kwargs)

        response, used_model = await execute_with_model_fallback(
            provider_name="anthropic",
            requested_model=model,
            is_cad_task=is_cad_task,
            call_fn=_call,
        )

        content_blocks = []
        thinking_blocks = []
        for block in response.content:
            if getattr(block, "type", None) == "thinking" or hasattr(block, "thinking"):
                thinking_blocks.append(getattr(block, "thinking", ""))
            elif hasattr(block, "text"):
                content_blocks.append(block.text)

        content = "".join(content_blocks)
        reasoning = "".join(thinking_blocks)
        tokens = response.usage.input_tokens + response.usage.output_tokens if response.usage else 0
        return create_generation_result(
            raw_response=content,
            provider="anthropic",
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
        validate_api_key("anthropic", self.api_key)
        start_time = time.perf_counter()
        clean_system, claude_messages = extract_system_and_messages(messages)
        models_to_try = get_models_to_try("anthropic", requested_model=model, is_cad_task=is_cad_task)
        last_error: Optional[Exception] = None

        for current_model in models_to_try:
            yielded_any = False
            try:
                if current_model != models_to_try[0]:
                    logger.info("Anthropic stream: falling back from '%s' to '%s'", models_to_try[0], current_model)

                assert self._client is not None
                is_thinking_model = "3-7" in current_model.lower() or "thinking" in current_model.lower()
                create_kwargs: Dict[str, Any] = {
                    "model": current_model,
                    "messages": claude_messages,
                    "max_tokens": 8192 if is_cad_task else 4096,
                }
                if is_thinking_model and is_cad_task:
                    create_kwargs["thinking"] = {"type": "enabled", "budget_tokens": 1024}
                else:
                    create_kwargs["extra_body"] = {"temperature": temperature}

                if clean_system:
                    create_kwargs["system"] = clean_system

                accumulated_tokens: List[str] = []
                accumulated_thoughts: List[str] = []
                thought_extractor = StreamThoughtExtractor()

                async with self._client.messages.stream(**create_kwargs) as stream:
                    async for event in stream:
                        event_type = getattr(event, "type", None)
                        if event_type == "content_block_delta":
                            delta = getattr(event, "delta", None)
                            if delta:
                                delta_type = getattr(delta, "type", None)
                                if delta_type == "thinking_delta":
                                    th = getattr(delta, "thinking", "")
                                    if th:
                                        accumulated_thoughts.append(th)
                                        yielded_any = True
                                        yield {"type": "thought", "content": th}
                                elif delta_type == "text_delta":
                                    t = getattr(delta, "text", "")
                                    if t:
                                        yielded_any = True
                                        for kind, text in thought_extractor.feed(t):
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
                    logger.warning("Anthropic stream model '%s' failed (%s). Retrying with next fallback model...", current_model, e)
                    continue
                break

        handle_provider_error("anthropic", last_error, action="stream")

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def verify_credentials(self, model: Optional[str] = None) -> tuple[bool, str]:
        if not self.api_key or not self._client:
            return False, "Anthropic API key is missing. Please provide an API key in settings or set ANTHROPIC_API_KEY."
        target_model = model or settings.anthropic_model
        try:
            await self._client.models.list(limit=1)
            return True, f"Anthropic credentials verified successfully (model target: {target_model})."
        except Exception as e:
            return False, f"Anthropic authentication/connection failed: {str(e)}"
