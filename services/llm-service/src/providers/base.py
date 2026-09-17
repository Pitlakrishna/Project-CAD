"""Abstract base interface for LLM providers."""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from src.domain.models import LlmGenerationResult


class BaseLlmProvider(ABC):
    """Abstract interface for all LLM connectors."""

    @abstractmethod
    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
    ) -> LlmGenerationResult:
        """Sends chat messages to LLM and returns raw response string with metadata."""
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        """Returns True if the provider is configured and reachable."""
        pass
