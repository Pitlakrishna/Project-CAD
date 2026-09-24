"""Unified common utilities for LLM providers.

Provides shared logic for:
- Intent-based fallback execution
- Message formatting and system prompt extraction
- Latency calculation and LlmGenerationResult construction
- Stream final_payload construction
- Centralized rate limit & error handling
- API key validation
"""

from __future__ import annotations

import logging
import time
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    List,
    NoReturn,
    Optional,
    TypeVar,
)

from src.domain.exceptions import ProviderException
from src.domain.models import LlmGenerationResult
from src.core.models import get_models_to_try, is_retryable_model_error

logger = logging.getLogger(__name__)

T = TypeVar("T")


def validate_api_key(provider_name: str, api_key: Optional[str]) -> None:
    """Verifies that an API key is provided, raising ProviderException if missing."""
    if not api_key:
        raise ProviderException(f"{provider_name.capitalize()} API key is not configured.")


def format_chat_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Standardizes list of role/content message dicts into typed chat completion format."""
    formatted: List[Dict[str, str]] = []
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


def extract_system_and_messages(messages: List[Dict[str, str]]) -> tuple[str, List[Dict[str, str]]]:
    """Extracts system instructions string and remaining conversational turns."""
    system_parts: List[str] = []
    chat_messages: List[Dict[str, str]] = []

    for m in messages:
        role = m.get("role", "")
        content = m.get("content", "")
        if role == "system":
            system_parts.append(content)
        elif role == "assistant":
            chat_messages.append({"role": "assistant", "content": content})
        else:
            chat_messages.append({"role": "user", "content": content})

    return "\n\n".join(system_parts).strip(), chat_messages


class StreamThoughtExtractor:
    """Extracts <think>...</think> tags on the fly from an incoming token stream.
    
    Yields events as ('thought', text) or ('token', text) so that thought reasoning
    is neatly routed to the client and never leaks into raw response / CAD parsing.
    """

    def __init__(self) -> None:
        self.in_thought = False

    def feed(self, chunk: str) -> List[tuple[str, str]]:
        if not chunk:
            return []
        events: List[tuple[str, str]] = []
        text = chunk
        while text:
            if not self.in_thought:
                if "<think>" in text:
                    before, _, after = text.partition("<think>")
                    if before:
                        events.append(("token", before))
                    self.in_thought = True
                    text = after
                else:
                    events.append(("token", text))
                    text = ""
            else:
                if "</think>" in text:
                    thought_text, _, after = text.partition("</think>")
                    if thought_text:
                        events.append(("thought", thought_text))
                    self.in_thought = False
                    text = after
                else:
                    events.append(("thought", text))
                    text = ""
        return events


def create_generation_result(
    raw_response: str,
    provider: str,
    model: str,
    start_time: float,
    token_usage: Optional[int] = None,
    raw_thoughts: str = "",
) -> LlmGenerationResult:
    """Constructs a typed LlmGenerationResult with elapsed latency in milliseconds."""
    latency = (time.perf_counter() - start_time) * 1000
    tokens = token_usage if token_usage is not None else len(raw_response.split())
    return LlmGenerationResult(
        raw_response=raw_response,
        token_usage=tokens,
        provider=provider.lower().strip(),
        model=model,
        latency_ms=round(latency, 2),
        raw_thoughts=raw_thoughts,
    )


def create_stream_final_payload(
    raw_response: str,
    model: str,
    start_time: float,
    token_usage: Optional[int] = None,
    raw_thoughts: str = "",
) -> Dict[str, Any]:
    """Constructs the standard final_payload dictionary for SSE streaming."""
    latency = (time.perf_counter() - start_time) * 1000
    tokens = token_usage if token_usage is not None else len(raw_response.split())
    return {
        "type": "final_payload",
        "raw_response": raw_response,
        "raw_thoughts": raw_thoughts,
        "token_usage": tokens,
        "model": model,
        "latency_ms": round(latency, 2),
    }


def handle_provider_error(
    provider_name: str,
    error: Optional[Exception],
    action: str = "generation",
) -> NoReturn:
    """Translates provider exceptions, raising user-friendly rate limit or timeout error if applicable."""
    p_name = provider_name.capitalize()
    err_str = str(error) if error else "Unknown error"
    err_lower = err_str.lower()

    if any(sig in err_lower for sig in ("504", "deadline_exceeded", "deadline expired", "timed out", "timeout")):
        raise ProviderException(
            f"Upstream provider timeout (504 Deadline Exceeded): {p_name} took longer than expected to complete. Please retry or select another model/provider in Settings."
        ) from error

    if error and is_retryable_model_error(error):
        raise ProviderException(
            "Rate limit exceeded: You have reached the API usage quota. Please switch to another provider in Settings."
        ) from error
    raise ProviderException(f"{p_name} {action} failed: {err_str}") from error


async def execute_with_model_fallback(
    provider_name: str,
    requested_model: Optional[str],
    is_cad_task: bool,
    call_fn: Callable[[str], Awaitable[T]],
) -> tuple[T, str]:
    """Iterates through intent-specific candidate models, automatically failing over on retryable errors.

    Returns:
        tuple of (call_result, model_name_used)
    """
    models_to_try = get_models_to_try(
        provider_name,
        requested_model=requested_model,
        is_cad_task=is_cad_task,
    )
    last_error: Optional[Exception] = None

    for current_model in models_to_try:
        try:
            if current_model != models_to_try[0]:
                logger.info(
                    "%s: falling back from '%s' to '%s'",
                    provider_name.capitalize(),
                    models_to_try[0],
                    current_model,
                )
            result = await call_fn(current_model)
            return result, current_model
        except Exception as e:
            last_error = e
            if is_retryable_model_error(e) and current_model != models_to_try[-1]:
                logger.warning(
                    "%s model '%s' failed (%s). Retrying with next fallback model...",
                    provider_name.capitalize(),
                    current_model,
                    e,
                )
                continue
            break

    handle_provider_error(provider_name, last_error, action="call")
