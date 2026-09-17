from __future__ import annotations

import time
from typing import TYPE_CHECKING, Dict, List, Optional
from src.config import settings
from src.domain.exceptions import ProviderException
from src.domain.models import LlmGenerationResult
from src.providers.base import BaseLlmProvider

if TYPE_CHECKING:
    from anthropic import AsyncAnthropic
    from anthropic.types import MessageParam


class AnthropicProvider(BaseLlmProvider):
    """Anthropic API connector for Claude 3.5 Sonnet."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.anthropic_api_key
        self._client: Optional[AsyncAnthropic] = None
        if self.api_key:
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=self.api_key, timeout=settings.anthropic_timeout_seconds)

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
    ) -> LlmGenerationResult:
        if not self._client:
            raise ProviderException("Anthropic API key is not configured.")

        selected_model = model or settings.anthropic_model
        start_time = time.perf_counter()

        # Extract system message from messages list
        system_content = ""
        claude_messages: List[MessageParam] = []
        for m in messages:
            role = m.get("role", "")
            content = m.get("content", "")
            if role == "system":
                system_content += content + "\n\n"
            elif role == "assistant":
                claude_messages.append({"role": "assistant", "content": content})
            else:
                claude_messages.append({"role": "user", "content": content})

        clean_system = system_content.strip()

        try:
            if clean_system:
                response = await self._client.messages.create(
                    model=selected_model,
                    system=clean_system,
                    messages=claude_messages,
                    max_tokens=4096,
                    extra_body={"temperature": temperature},
                )
            else:
                response = await self._client.messages.create(
                    model=selected_model,
                    messages=claude_messages,
                    max_tokens=4096,
                    extra_body={"temperature": temperature},
                )

            latency = (time.perf_counter() - start_time) * 1000
            content = "".join([block.text for block in response.content if hasattr(block, "text")])
            tokens = response.usage.input_tokens + response.usage.output_tokens if response.usage else 0

            return LlmGenerationResult(
                raw_response=content,
                token_usage=tokens,
                provider="anthropic",
                model=selected_model,
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            raise ProviderException(f"Anthropic generation failed: {str(e)}") from e

    async def is_available(self) -> bool:
        return bool(self.api_key)
