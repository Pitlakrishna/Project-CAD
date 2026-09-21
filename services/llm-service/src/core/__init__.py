"""Core package: foundational provider abstractions, shared execution utilities, and model registry."""

from src.core.base import BaseLlmProvider
from src.core.common import (
    create_generation_result,
    create_stream_final_payload,
    execute_with_model_fallback,
    extract_system_and_messages,
    format_chat_messages,
    handle_provider_error,
    validate_api_key,
)
from src.core.models import (
    ProviderModelConfig,
    get_models_to_try,
    get_provider_config,
    is_retryable_model_error,
    sanitize_model,
)

__all__ = [
    "BaseLlmProvider",
    "ProviderModelConfig",
    "create_generation_result",
    "create_stream_final_payload",
    "execute_with_model_fallback",
    "extract_system_and_messages",
    "format_chat_messages",
    "get_models_to_try",
    "get_provider_config",
    "handle_provider_error",
    "is_retryable_model_error",
    "sanitize_model",
    "validate_api_key",
]
