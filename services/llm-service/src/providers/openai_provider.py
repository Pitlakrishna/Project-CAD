from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from src.config import settings
from src.domain.exceptions import ProviderException
from src.domain.models import LlmGenerationResult
from src.providers.base import BaseLlmProvider

if TYPE_CHECKING:
    from openai import AsyncOpenAI
    from openai.types.chat import ChatCompletionMessageParam


class OpenAiProvider(BaseLlmProvider):
    """OpenAI API connector for GPT-4o and GPT-4 Turbo models."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or settings.openai_api_key
        self.base_url = base_url or settings.openai_base_url
        self._client: Optional[AsyncOpenAI] = None
        if self.api_key:
            from openai import AsyncOpenAI
            client_kwargs = {
                "api_key": self.api_key,
                "timeout": settings.openai_timeout_seconds,
            }
            if self.base_url:
                client_kwargs["base_url"] = self.base_url
            self._client = AsyncOpenAI(**client_kwargs)

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        if not self._client:
            raise ProviderException("OpenAI API key is not configured.")

        selected_model = model or settings.openai_model
        start_time = time.perf_counter()

        # Format and strictly type messages for OpenAI API
        openai_messages: List[ChatCompletionMessageParam] = []
        for m in messages:
            role = m.get("role", "")
            content = m.get("content", "")
            if role == "system":
                openai_messages.append({"role": "system", "content": content})
            elif role == "assistant":
                openai_messages.append({"role": "assistant", "content": content})
            else:
                openai_messages.append({"role": "user", "content": content})

        try:
            create_kwargs: Dict[str, Any] = {
                "model": selected_model,
                "messages": openai_messages,
            }
            if not selected_model.startswith(("o1", "o3")):
                create_kwargs["temperature"] = temperature

            response = await self._client.chat.completions.create(**create_kwargs)

            latency = (time.perf_counter() - start_time) * 1000
            content = response.choices[0].message.content or ""
            tokens = response.usage.total_tokens if response.usage else 0

            return LlmGenerationResult(
                raw_response=content,
                token_usage=tokens,
                provider="openai",
                model=selected_model,
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            err_str = str(e)
            if any(term in err_str.lower() for term in ["429", "insufficient_quota", "quota", "rate_limit", "rate limit"]):
                raise ProviderException(
                    "Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings."
                ) from e
            raise ProviderException(f"OpenAI generation failed: {err_str}") from e


    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def verify_credentials(self, model: Optional[str] = None) -> tuple[bool, str]:
        if not self.api_key or not self._client:
            return False, "OpenAI API key is missing. Please provide an API key in settings or set OPENAI_API_KEY."
        target_model = model or settings.openai_model
        try:
            # First attempt to list models with short timeout to verify key
            await self._client.models.list()
            return True, f"OpenAI credentials verified successfully (model target: {target_model})."
        except Exception as e:
            return False, f"OpenAI authentication/connection failed: {str(e)}"
