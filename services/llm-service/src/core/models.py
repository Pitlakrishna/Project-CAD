"""Centralized LLM provider models registry, fallback hierarchies, and sanitization.

Strictly enforces separation between:
- 3D CAD modeling tasks (is_cad_task=True): high-intelligence spatial reasoning & Replicad TypeScript code generation.
- Normal chat tasks (is_cad_task=False): ultra-fast, lightweight conversational models.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from src.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderModelConfig:
    """Configures primary models and prioritized fallback chains for a specific provider."""

    cad_model: str
    cad_fallbacks: tuple[str, ...]
    chat_model: str
    chat_fallbacks: tuple[str, ...]
    banned_models: frozenset[str] = field(default_factory=frozenset)


# Banned models registry (kept empty so real models like gemini-2.0-flash / gemini-2.5-flash are not blocked)
GEMINI_BANNED_MODELS = frozenset()


def _build_registry() -> Dict[str, ProviderModelConfig]:
    """Dynamically builds the provider model registry pulling configured defaults from settings."""
    return {
        "gemini": ProviderModelConfig(
            cad_model=getattr(settings, "gemini_model", "gemini-2.5-flash"),
            cad_fallbacks=(
                "gemini-2.5-flash",
                "gemini-2.0-flash",
                "gemini-2.0-flash-thinking-exp-01-21",
                "gemini-3.8-flash",
                "gemini-3.7-flash",
                "gemini-3.5-flash-lite",
            ),
            chat_model=getattr(settings, "gemini_fast_model", "gemini-2.0-flash"),
            chat_fallbacks=(
                "gemini-2.0-flash",
                "gemini-2.5-flash",
                "gemini-3.5-flash-lite",
                "gemini-3.7-flash",
            ),
            banned_models=GEMINI_BANNED_MODELS,
        ),
        "groq": ProviderModelConfig(
            cad_model=getattr(settings, "groq_model", "llama-3.3-70b-versatile"),
            cad_fallbacks=(
                "llama-3.3-70b-versatile",
                "deepseek-r1-distill-llama-70b",
                "qwen-qwq-32b",
                "llama-3.1-8b-instant",
            ),
            chat_model=getattr(settings, "groq_fast_model", "openai/gpt-oss-20b"),
            chat_fallbacks=(
                "llama-3.1-8b-instant",
                "deepseek-r1-distill-llama-70b",
                "openai/gpt-oss-20b",
            ),
        ),
        "openai": ProviderModelConfig(
            cad_model=getattr(settings, "openai_model", "gpt-4o"),
            cad_fallbacks=(
                "gpt-4o",
                "o3-mini",
                "gpt-4-turbo",
                "gpt-4o-mini",
            ),
            chat_model=getattr(settings, "openai_fast_model", "gpt-4o-mini"),
            chat_fallbacks=(
                "gpt-4o-mini",
                "o3-mini",
                "gpt-4o",
            ),
        ),
        "anthropic": ProviderModelConfig(
            cad_model=getattr(settings, "anthropic_model", "claude-3-5-sonnet-20241022"),
            cad_fallbacks=(
                "claude-3-5-sonnet-20241022",
                "claude-3-7-sonnet-20250219",
                "claude-3-opus-20240229",
                "claude-3-5-haiku-20241022",
            ),
            chat_model=getattr(settings, "anthropic_fast_model", "claude-3-5-haiku-20241022"),
            chat_fallbacks=(
                "claude-3-5-haiku-20241022",
                "claude-3-7-sonnet-20250219",
                "claude-3-5-sonnet-20241022",
            ),
        ),
        "deepseek": ProviderModelConfig(
            cad_model=getattr(settings, "deepseek_model", "deepseek-chat"),
            cad_fallbacks=(
                "deepseek-chat",
                "deepseek-reasoner",
            ),
            chat_model=getattr(settings, "deepseek_fast_model", "deepseek-chat"),
            chat_fallbacks=(
                "deepseek-chat",
                "deepseek-reasoner",
            ),
        ),
        "ollama": ProviderModelConfig(
            cad_model=getattr(settings, "ollama_model", "deepseek-coder:6.7b"),
            cad_fallbacks=(
                "deepseek-coder:6.7b",
                "deepseek-r1:latest",
                "deepseek-r1:8b",
                "deepseek-r1:7b",
                "llama3:latest",
            ),
            chat_model="llama3:latest",
            chat_fallbacks=(
                "llama3:latest",
                "deepseek-r1:latest",
                "deepseek-coder:6.7b",
            ),
        ),
    }


def get_provider_config(provider: str) -> Optional[ProviderModelConfig]:
    """Retrieves the model configuration for a provider."""
    registry = _build_registry()
    return registry.get((provider or "").lower().strip())


def sanitize_model(
    provider: str,
    requested_model: Optional[str],
    is_cad_task: bool = False,
) -> str:
    """Sanitizes requested model, substituting defaults and explicitly banning deprecated targets.

    - If requested_model is empty, 'auto', or 'default', returns intent-specific primary.
    - If requested_model is banned, substitutes with the safe active target.
    """
    config = get_provider_config(provider)
    fallback_target = (config.cad_model if is_cad_task else config.chat_model) if config else "default"

    req = (requested_model or fallback_target).strip()
    if not req or req.lower() in ("auto", "default"):
        return fallback_target

    if config and config.banned_models:
        req_lower = req.lower()
        if any(banned in req_lower for banned in config.banned_models):
            logger.warning(
                "Deprecated/banned model target '%s' requested for %s. Substituting with active target '%s'.",
                req,
                provider,
                fallback_target,
            )
            return fallback_target

    return req


def get_models_to_try(
    provider: str,
    requested_model: Optional[str] = None,
    is_cad_task: bool = False,
) -> List[str]:
    """Returns an ordered list of models: sanitized primary target first, followed by safe fallback candidates."""
    config = get_provider_config(provider)
    if not config:
        clean = (requested_model or "default").strip()
        return [clean] if clean else ["default"]

    clean_model = sanitize_model(provider, requested_model, is_cad_task=is_cad_task)
    models: List[str] = [clean_model]

    candidates = config.cad_fallbacks if is_cad_task else config.chat_fallbacks
    for candidate in candidates:
        if candidate not in models and candidate not in config.banned_models:
            models.append(candidate)

    return models


def is_retryable_model_error(error: Exception) -> bool:
    """Checks if an error indicates rate limit, quota exhaustion, or temporary capacity overload."""
    err_str = str(error).lower()
    retryable_signatures = [
        "429",
        "resource_exhausted",
        "insufficient_quota",
        "quota",
        "rate_limit",
        "rate limit",
        "tpm",
        "rpm",
        "overloaded",
        "503",
        "504",
        "deadline_exceeded",
        "deadline expired",
        "deadline",
        "timeout",
        "timed out",
        "model not found",
        "not available",
    ]
    return any(sig in err_str for sig in retryable_signatures)
