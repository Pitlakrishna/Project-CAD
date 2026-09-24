"""FastAPI dependency injection providers."""

from functools import lru_cache
from typing import Optional
from fastapi import Request
from src.domain.services import CadGenerationService
from src.infrastructure.cache import PromptCache
from src.infrastructure.messaging import EventPublisher


@lru_cache()
def get_prompt_cache() -> PromptCache:
    return PromptCache()


@lru_cache()
def get_event_publisher() -> EventPublisher:
    return EventPublisher()


def get_cad_service() -> CadGenerationService:
    return CadGenerationService(
        cache=get_prompt_cache(),
        event_publisher=get_event_publisher(),
    )


class RequestCredentials:
    """Encapsulates dynamic credentials extracted from HTTP request headers."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        chat_model: Optional[str] = None,
        cad_model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = api_key
        self.provider = provider
        self.model = model
        self.chat_model = chat_model
        self.cad_model = cad_model
        self.base_url = base_url


def extract_credentials_from_request(request: Request) -> RequestCredentials:
    """Extracts dynamic credentials from standard and provider-specific HTTP headers."""
    headers = request.headers

    # 1. API Key resolution order: X-API-Key -> Authorization (Bearer) -> provider headers
    api_key = headers.get("x-api-key")
    if not api_key:
        auth = headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
            if token:
                api_key = token

    provider = headers.get("x-provider")
    model = headers.get("x-model")
    chat_model = headers.get("x-chat-model")
    cad_model = headers.get("x-cad-model")
    base_url = headers.get("x-base-url")

    # Provider specific header fallback
    if not api_key:
        if headers.get("x-openai-api-key"):
            api_key = headers.get("x-openai-api-key")
        elif headers.get("x-anthropic-api-key"):
            api_key = headers.get("x-anthropic-api-key")
        elif headers.get("x-gemini-api-key"):
            api_key = headers.get("x-gemini-api-key")
        elif headers.get("x-groq-api-key"):
            api_key = headers.get("x-groq-api-key")
        elif headers.get("x-deepseek-api-key"):
            api_key = headers.get("x-deepseek-api-key")

    return RequestCredentials(
        api_key=api_key or None,
        provider=provider or None,
        model=model or None,
        chat_model=chat_model or None,
        cad_model=cad_model or None,
        base_url=base_url or None,
    )
