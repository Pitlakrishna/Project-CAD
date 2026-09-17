"""FastAPI dependency injection providers."""

from functools import lru_cache
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
