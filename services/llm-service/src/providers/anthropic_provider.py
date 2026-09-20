from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from src.config import settings
from src.domain.exceptions import ProviderException
from src.domain.models import LlmGenerationResult
from src.providers.base import BaseLlmProvider

if TYPE_CHECKING:
    from anthropic import AsyncAnthropic
    from anthropic.types import MessageParam


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
        **kwargs: Any,
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
            create_kwargs: Dict[str, Any] = {
                "model": selected_model,
                "messages": claude_messages,
                "max_tokens": 4096,
                "extra_body": {"temperature": temperature},
            }
            if clean_system:
                create_kwargs["system"] = clean_system

            response = await self._client.messages.create(**create_kwargs)

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

    async def verify_credentials(self, model: Optional[str] = None) -> tuple[bool, str]:
        if not self.api_key or not self._client:
            return False, "Anthropic API key is missing. Please provide an API key in settings or set ANTHROPIC_API_KEY."
        target_model = model or settings.anthropic_model
        try:
            await self._client.models.list(limit=1)
            return True, f"Anthropic credentials verified successfully (model target: {target_model})."
        except Exception as e:
            return False, f"Anthropic authentication/connection failed: {str(e)}"
