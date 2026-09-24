"""Unit tests for intent-based dynamic model routing in CadGenerationService."""

import pytest
from src.config import settings
from src.domain.services import CadGenerationService


def test_resolve_effective_model_openai():
    # CAD task -> Advanced model (gpt-4o)
    model_cad = CadGenerationService.resolve_effective_model(
        provider_name="openai",
        requested_model=None,
        is_cad_task=True,
    )
    assert model_cad == settings.openai_model
    assert model_cad == "gpt-4o"

    # Conversational task -> Fast model (gpt-4o-mini)
    model_fast = CadGenerationService.resolve_effective_model(
        provider_name="openai",
        requested_model=None,
        is_cad_task=False,
    )
    assert model_fast == settings.openai_fast_model
    assert model_fast == "gpt-4o-mini"


def test_resolve_effective_model_anthropic():
    # CAD task -> Claude 3.5 Sonnet
    model_cad = CadGenerationService.resolve_effective_model(
        provider_name="anthropic",
        requested_model=None,
        is_cad_task=True,
    )
    assert model_cad == settings.anthropic_model
    assert "sonnet" in model_cad

    # Conversational task -> Claude 3.5 Haiku
    model_fast = CadGenerationService.resolve_effective_model(
        provider_name="anthropic",
        requested_model=None,
        is_cad_task=False,
    )
    assert model_fast == settings.anthropic_fast_model
    assert "haiku" in model_fast


def test_resolve_effective_model_gemini():
    # CAD task -> Gemini CAD model from settings
    model_cad = CadGenerationService.resolve_effective_model(
        provider_name="gemini",
        requested_model=None,
        is_cad_task=True,
    )
    assert model_cad == settings.gemini_model
    assert "gemini" in model_cad

    # Conversational task -> Fast model from settings
    model_fast = CadGenerationService.resolve_effective_model(
        provider_name="gemini",
        requested_model=None,
        is_cad_task=False,
    )
    assert model_fast == settings.gemini_fast_model
    assert "gemini" in model_fast


def test_separate_chat_and_cad_model_params():
    # Separate parameters explicitly provided
    model_chat = CadGenerationService.resolve_effective_model(
        provider_name="gemini",
        chat_model="gemini-2.0-flash",
        cad_model="gemini-2.5-flash",
        is_cad_task=False,
    )
    assert model_chat == "gemini-2.0-flash"

    model_cad = CadGenerationService.resolve_effective_model(
        provider_name="gemini",
        chat_model="gemini-2.0-flash",
        cad_model="gemini-2.5-flash",
        is_cad_task=True,
    )
    assert model_cad == "gemini-2.5-flash"


def test_gemini_model_intent_routing():
    model_chat = CadGenerationService.resolve_effective_model(
        provider_name="gemini",
        requested_model=None,
        is_cad_task=False,
    )
    assert model_chat == settings.gemini_fast_model

    model_cad = CadGenerationService.resolve_effective_model(
        provider_name="gemini",
        requested_model=None,
        is_cad_task=True,
    )
    assert model_cad == settings.gemini_model


def test_gemini_thinking_budgets_mandated():
    from src.providers.gemini_provider import GeminiProvider

    config_chat = GeminiProvider._build_thinking_config(is_cad_task=False, current_model="gemini-2.0-flash")
    assert config_chat is not None
    chat_budget = getattr(config_chat, "thinking_budget", None)
    # Chat must have thinking disabled (budget == 0) for zero latency
    assert chat_budget == 0

    config_cad = GeminiProvider._build_thinking_config(is_cad_task=True, current_model="gemini-2.5-flash")
    assert config_cad is not None
    cad_budget = getattr(config_cad, "thinking_budget", None)
    cad_level = str(getattr(config_cad, "thinking_level", "")).lower()
    assert (cad_budget is not None and cad_budget >= 512) or cad_level != ""


def test_resolve_effective_model_auto_and_overrides():
    # Explicit 'auto' should trigger intent-based routing
    assert (
        CadGenerationService.resolve_effective_model(
            provider_name="openai",
            requested_model="auto",
            is_cad_task=True,
        )
        == "gpt-4o"
    )
    assert (
        CadGenerationService.resolve_effective_model(
            provider_name="openai",
            requested_model="auto",
            is_cad_task=False,
        )
        == "gpt-4o-mini"
    )

    # Empty string should trigger intent-based routing
    assert (
        CadGenerationService.resolve_effective_model(
            provider_name="anthropic",
            requested_model="",
            is_cad_task=False,
        )
        == "claude-3-5-haiku-20241022"
    )

    # Explicit custom override should be respected regardless of intent
    custom_model = "deepseek-ai/DeepSeek-V3"
    assert (
        CadGenerationService.resolve_effective_model(
            provider_name="openai",
            requested_model=custom_model,
            is_cad_task=False,
        )
        == custom_model
    )
    assert (
        CadGenerationService.resolve_effective_model(
            provider_name="openai",
            requested_model=custom_model,
            is_cad_task=True,
        )
        == custom_model
    )


def test_gemini_fallback_candidates_list():
    from src.providers.gemini_provider import GeminiProvider

    # CAD tasks include heavy reasoning fallbacks
    models_cad = GeminiProvider._get_models_to_try("gemini-2.5-flash", is_cad_task=True)
    assert models_cad[0] == "gemini-2.5-flash"
    assert "gemini-2.0-flash" in models_cad

    # Chat tasks prioritize fast lightweight models
    models_chat = GeminiProvider._get_models_to_try("gemini-2.0-flash", is_cad_task=False)
    assert models_chat[0] == "gemini-2.0-flash"


def test_meta_and_informational_not_cad_intent():
    from src.prompts.context_builder import ContextBuilder

    # Meta, review, and model inquiries should NOT trigger CAD generation
    assert not ContextBuilder.is_cad_intent("what model are you")
    assert not ContextBuilder.is_cad_intent("which model are you using?")
    assert not ContextBuilder.is_cad_intent("taking gemini-3.5-flash-lite (16.9s) can you fix the code review and fix it")
    assert not ContextBuilder.is_cad_intent("can you review the code?")
    assert not ContextBuilder.is_cad_intent("why did it take so long?")

    # Explicit 3D CAD design request should trigger CAD generation
    assert ContextBuilder.is_cad_intent("design a phone stand 80mm tall")
    assert ContextBuilder.is_cad_intent("create a 3d model of a cylinder")


def test_groq_provider_routing_and_instantiation():
    from src.providers import get_llm_provider
    from src.providers.groq_provider import GroqProvider

    # Intent routing for Groq
    cad_model = CadGenerationService.resolve_effective_model(provider_name="groq", is_cad_task=True)
    assert cad_model == "llama-3.3-70b-versatile"

    chat_model = CadGenerationService.resolve_effective_model(provider_name="groq", is_cad_task=False)
    assert chat_model == "openai/gpt-oss-20b"

    # Provider instantiation
    provider = get_llm_provider("groq", api_key="gsk_test_123")
    assert isinstance(provider, GroqProvider)
    assert provider.api_key == "gsk_test_123"
    assert provider.base_url == "https://api.groq.com/openai/v1"


def test_gemini_google_search_grounding_tools():
    from src.providers.gemini_provider import GeminiProvider

    # Search disabled to prevent 429 quota exhaustion: returns None
    tools = GeminiProvider._build_tools_config(enable_search=True)
    assert tools is None



def test_gemini_grounding_metadata_extraction():
    from unittest.mock import MagicMock
    from src.providers.gemini_provider import GeminiProvider

    mock_cand = MagicMock()
    mock_cand.grounding_metadata.web_search_queries = ["market news today", "sp500 performance"]
    
    mock_chunk1 = MagicMock()
    mock_chunk1.web.title = "Financial Times Market Update"
    mock_chunk1.web.uri = "https://ft.com/markets"

    mock_chunk2 = MagicMock()
    mock_chunk2.web.title = "Bloomberg Markets"
    mock_chunk2.web.uri = "https://bloomberg.com/markets"

    mock_cand.grounding_metadata.grounding_chunks = [mock_chunk1, mock_chunk2]

    metadata = GeminiProvider._extract_grounding_metadata(mock_cand)
    assert metadata is not None
    assert "market news today" in metadata["search_queries"]
    assert len(metadata["sources"]) == 2
    assert metadata["sources"][0]["title"] == "Financial Times Market Update"
    assert metadata["sources"][0]["uri"] == "https://ft.com/markets"


def test_deepseek_provider_routing_and_instantiation():
    from src.providers import get_llm_provider
    from src.providers.deepseek_provider import DeepSeekProvider

    # Intent routing for DeepSeek
    cad_model = CadGenerationService.resolve_effective_model(provider_name="deepseek", is_cad_task=True)
    assert cad_model == "deepseek-chat"

    chat_model = CadGenerationService.resolve_effective_model(provider_name="deepseek", is_cad_task=False)
    assert chat_model == "deepseek-chat"

    # Fallback list should prioritize deepseek-chat then deepseek-reasoner
    from src.core.models import get_models_to_try
    models = get_models_to_try("deepseek", is_cad_task=True)
    assert models == ["deepseek-chat", "deepseek-reasoner"]

    # Provider instantiation
    provider = get_llm_provider("deepseek", api_key="sk-dsk_test_123")
    assert isinstance(provider, DeepSeekProvider)
    assert provider.api_key == "sk-dsk_test_123"
    assert provider.base_url == "https://api.deepseek.com"


