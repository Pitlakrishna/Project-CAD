"""LLM Providers package and factory."""

from typing import Optional
from src.config import settings
from src.providers.anthropic_provider import AnthropicProvider
from src.providers.base import BaseLlmProvider
from src.providers.mock_provider import MockLlmProvider
from src.providers.ollama_provider import OllamaProvider
from src.providers.openai_provider import OpenAiProvider


def get_llm_provider(provider_name: Optional[str] = None, api_key: Optional[str] = None) -> BaseLlmProvider:
    """Factory to instantiate the appropriate LLM provider."""
    name = (provider_name or settings.llm_provider).lower().strip()

    if name == "openai":
        return OpenAiProvider(api_key=api_key)
    elif name == "anthropic":
        return AnthropicProvider(api_key=api_key)
    elif name == "ollama":
        return OllamaProvider()
    elif name == "mock":
        return MockLlmProvider()
    else:
        # Fallback to mock for unknown provider in dev mode
        if settings.debug:
            return MockLlmProvider()
        raise ValueError(f"Unsupported LLM provider '{name}'")
