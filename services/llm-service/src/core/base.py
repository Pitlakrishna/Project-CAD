"""Abstract base interface for LLM providers."""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any

from src.domain.models import LlmGenerationResult


class BaseLlmProvider(ABC):
    """Abstract interface for all LLM connectors."""

    @abstractmethod
    async def generate(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        """Sends chat messages to LLM and returns raw response string with metadata."""

    async def generate_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
        **kwargs: Any,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Default stream implementation using standard generate call."""
        res = await self.generate(messages, model=model, temperature=temperature, **kwargs)
        yield {"type": "token", "content": res.raw_response}
        yield {
            "type": "final_payload",
            "raw_response": res.raw_response,
            "raw_thoughts": "",
            "token_usage": res.token_usage,
            "model": res.model,
            "latency_ms": res.latency_ms,
        }

    @abstractmethod
    async def is_available(self) -> bool:
        """Returns True if the provider is configured and reachable."""

    @abstractmethod
    async def verify_credentials(self, model: str | None = None) -> tuple[bool, str]:
        """Validates the configured API credentials and connectivity, returning (success, message)."""
