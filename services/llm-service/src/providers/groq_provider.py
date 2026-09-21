from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional
from src.config import settings
from src.domain.exceptions import ProviderException
from src.domain.models import LlmGenerationResult
from src.providers.base import BaseLlmProvider

if TYPE_CHECKING:
    from openai import AsyncOpenAI
    from openai.types.chat import ChatCompletionMessageParam

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

    def _format_messages(self, messages: List[Dict[str, str]]) -> List[ChatCompletionMessageParam]:
        formatted: List[ChatCompletionMessageParam] = []
        for m in messages:
            role = m.get("role", "")
            content = m.get("content", "")
            if role == "system":
                formatted.append({"role": "system", "content": content})
            elif role == "assistant":
                formatted.append({"role": "assistant", "content": content})
            else:
                formatted.append({"role": "user", "content": content})
        return formatted

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        if not self._client:
            raise ProviderException("Groq API key is not configured.")

        selected_model = model or settings.groq_model
        start_time = time.perf_counter()
        openai_messages = self._format_messages(messages)

        try:
            response = await self._client.chat.completions.create(
                model=selected_model,
                messages=openai_messages,
                temperature=temperature,
            )

            latency = (time.perf_counter() - start_time) * 1000
            content = response.choices[0].message.content or ""
            tokens = response.usage.total_tokens if response.usage else 0

            return LlmGenerationResult(
                raw_response=content,
                token_usage=tokens,
                provider="groq",
                model=selected_model,
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            err_str = str(e)
            if any(term in err_str.lower() for term in ["429", "insufficient_quota", "quota", "rate_limit", "rate limit"]):
                raise ProviderException(
                    "Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings."
                ) from e
            raise ProviderException(f"Groq generation failed: {err_str}") from e

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        **kwargs: Any,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        if not self._client:
            raise ProviderException("Groq API key is not configured.")

        selected_model = model or settings.groq_model
        start_time = time.perf_counter()
        openai_messages = self._format_messages(messages)

        try:
            stream = await self._client.chat.completions.create(
                model=selected_model,
                messages=openai_messages,
                temperature=temperature,
                stream=True,
            )

            accumulated_tokens: List[str] = []
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    token = delta.content
                    accumulated_tokens.append(token)
                    yield {"type": "token", "content": token}

            full_text = "".join(accumulated_tokens)
            latency = (time.perf_counter() - start_time) * 1000

            yield {
                "type": "final_payload",
                "raw_response": full_text,
                "raw_thoughts": "",
                "token_usage": len(full_text.split()),
                "model": selected_model,
                "latency_ms": round(latency, 2),
            }
        except Exception as e:
            err_str = str(e)
            if any(term in err_str.lower() for term in ["429", "insufficient_quota", "quota", "rate_limit", "rate limit"]):
                raise ProviderException(
                    "Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings."
                ) from e
            raise ProviderException(f"Groq stream failed: {err_str}") from e

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
