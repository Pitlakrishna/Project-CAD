from __future__ import annotations

import time
from typing import TYPE_CHECKING, Dict, List, Optional
from src.config import settings
from src.domain.exceptions import ProviderException
from src.domain.models import LlmGenerationResult
from src.providers.base import BaseLlmProvider

if TYPE_CHECKING:
    from openai import AsyncOpenAI
    from openai.types.chat import ChatCompletionMessageParam


class OpenAiProvider(BaseLlmProvider):
    """OpenAI API connector for GPT-4o and GPT-4 Turbo models."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.openai_api_key
        self._client: Optional[AsyncOpenAI] = None
        if self.api_key:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self.api_key, timeout=settings.openai_timeout_seconds)

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
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
            if not (selected_model.startswith("o1") or selected_model.startswith("o3")):
                response = await self._client.chat.completions.create(
                    model=selected_model,
                    messages=openai_messages,
                    temperature=temperature,
                )
            else:
                response = await self._client.chat.completions.create(
                    model=selected_model,
                    messages=openai_messages,
                )

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
            raise ProviderException(f"OpenAI generation failed: {str(e)}") from e

    async def is_available(self) -> bool:
        return bool(self.api_key)
