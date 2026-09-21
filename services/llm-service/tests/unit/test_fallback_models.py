"""Unit tests for centralized fallback models registry, intent separation, and error detection."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.models import (
    get_models_to_try,
    get_provider_config,
    is_retryable_model_error,
    sanitize_model,
)
from src.providers.groq_provider import GroqProvider
from src.providers.openai_provider import OpenAiProvider


def test_gemini_models_intent_separation():
    cad_models = get_models_to_try("gemini", is_cad_task=True)
    assert len(cad_models) >= 2
    assert "gemini-3.8-flash" in cad_models[0]
    # CAD fallbacks should prioritize high-capability models
    assert any("3.7" in m or "3.8" in m for m in cad_models)

    chat_models = get_models_to_try("gemini", is_cad_task=False)
    assert len(chat_models) >= 2
    assert "gemini-3.5-flash-lite" in chat_models[0]
    assert "3.5-flash-lite" in chat_models[0]


def test_groq_models_intent_separation():
    cad_models = get_models_to_try("groq", is_cad_task=True)
    assert "llama-3.3-70b-versatile" in cad_models[0]
    assert "qwen-qwq-32b" in cad_models

    chat_models = get_models_to_try("groq", is_cad_task=False)
    assert "llama-3.1-8b-instant" in chat_models


def test_openai_models_intent_separation():
    cad_models = get_models_to_try("openai", is_cad_task=True)
    assert cad_models[0] == "gpt-4o"
    assert "gpt-4o-mini" in cad_models

    chat_models = get_models_to_try("openai", is_cad_task=False)
    assert chat_models[0] == "gpt-4o-mini"


def test_anthropic_models_intent_separation():
    cad_models = get_models_to_try("anthropic", is_cad_task=True)
    assert "sonnet" in cad_models[0]

    chat_models = get_models_to_try("anthropic", is_cad_task=False)
    assert "haiku" in chat_models[0]


def test_ollama_models_intent_separation():
    cad_models = get_models_to_try("ollama", is_cad_task=True)
    assert "deepseek-coder:6.7b" in cad_models[0]

    chat_models = get_models_to_try("ollama", is_cad_task=False)
    assert "llama3:latest" in chat_models[0]


def test_sanitize_model_banned_gemini_upgrade():
    # Deprecated 2.0-flash on CAD task -> upgrades to active CAD model
    sanitized_cad = sanitize_model("gemini", "gemini-2.0-flash", is_cad_task=True)
    assert sanitized_cad == "gemini-3.8-flash"

    # Deprecated 2.0-flash on Chat task -> upgrades to active Chat fast model
    sanitized_chat = sanitize_model("gemini", "gemini-2.0-flash", is_cad_task=False)
    assert sanitized_chat == "gemini-3.5-flash-lite"


def test_is_retryable_model_error():
    assert is_retryable_model_error(Exception("HTTP 429 Too Many Requests"))
    assert is_retryable_model_error(Exception("RESOURCE_EXHAUSTED: quota exceeded"))
    assert is_retryable_model_error(Exception("rate_limit_exceeded on TPM"))
    assert is_retryable_model_error(Exception("503 Service Overloaded"))
    assert is_retryable_model_error(Exception("The model `xyz` is not available"))
    assert not is_retryable_model_error(Exception("Invalid authentication key 401"))
    assert not is_retryable_model_error(Exception("Bad syntax in JSON body 400"))


@pytest.mark.asyncio
async def test_groq_provider_fallback_execution():
    provider = GroqProvider(api_key="gsk_test_mock_key")

    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="export default function main() { return []; }"))]
    mock_response.usage.total_tokens = 120

    # Simulate primary model failing with 429, fallback model succeeding
    mock_create = AsyncMock(side_effect=[
        Exception("Error code: 429 - Rate limit reached for model llama-3.3-70b-versatile"),
        mock_response,
    ])
    provider._client = MagicMock()
    provider._client.chat.completions.create = mock_create

    result = await provider.generate(
        messages=[{"role": "user", "content": "Design a box"}],
        is_cad_task=True,
    )

    assert result.raw_response == "export default function main() { return []; }"
    assert mock_create.call_count == 2
    # Verify second call used the fallback model
    second_call_kwargs = mock_create.call_args_list[1].kwargs
    assert second_call_kwargs["model"] != "llama-3.3-70b-versatile"
