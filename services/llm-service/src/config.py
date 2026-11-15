import json
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "dev"
    debug: bool = False
    port: int = 8000
    host: str = "0.0.0.0"
    app_version: str = "0.1.0"

    # LLM Provider: 'gemini' | 'groq' | 'openai' | 'anthropic' | 'ollama' | 'deepseek'
    llm_provider: str = "gemini"

    # OpenAI Settings
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str = "gpt-4o"
    openai_fast_model: str = "gpt-4o-mini"
    openai_timeout_seconds: float = 60.0

    # Anthropic Settings
    anthropic_api_key: str | None = None
    anthropic_base_url: str | None = None
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    anthropic_fast_model: str = "claude-3-5-haiku-20241022"
    anthropic_timeout_seconds: float = 60.0

    # Google Gemini Settings
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_fast_model: str = "gemini-2.0-flash"
    gemini_timeout_seconds: float = 180.0
    gemini_thinking_budget_chat: int = 512
    gemini_thinking_budget_cad: int = 1024
    gemini_search_grounding: bool = False

    # Groq Settings (Ultra-fast LPU inference, generous free tier)
    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.3-70b-versatile"
    groq_fast_model: str = "llama-3.1-8b-instant"
    groq_timeout_seconds: float = 60.0

    # Ollama Settings
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "deepseek-coder:6.7b"
    ollama_timeout_seconds: float = 90.0

    # DeepSeek Settings
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    deepseek_fast_model: str = "deepseek-chat"
    deepseek_timeout_seconds: float = 60.0

    # Redis Cache Settings (supports REDIS_URL for Render/Upstash or REDIS_HOST/PORT/PASSWORD)
    redis_url: str | None = None
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str | None = None
    cache_enabled: bool = True
    cache_ttl_seconds: int = 86400

    # RabbitMQ Settings (supports RABBITMQ_URL for CloudAMQP or host/port/user/pass)
    rabbitmq_url: str | None = None
    rabbitmq_host: str = "localhost"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "guest"
    rabbitmq_pass: str = "guest"
    rabbitmq_events_exchange: str = "aicad.events"
    rabbitmq_enabled: bool = False

    # CAD Service Integration for Compilation & Auto-Repair
    cad_service_url: str = "http://localhost:8002"
    auto_repair_cad_errors: bool = True

    @field_validator("cad_service_url", mode="before")
    @classmethod
    def _normalize_cad_service_url(cls, v: object) -> str:
        raw = str(v or "").strip().rstrip("/")
        if not raw:
            return "http://localhost:8002"
        if raw.startswith(("http://", "https://")):
            return raw
        scheme = "http://" if raw.startswith(("localhost", "127.0.0.1")) else "https://"
        return f"{scheme}{raw}"

    # CORS (accepts comma-separated string or JSON list via CORS_ORIGINS)
    cors_origins: Annotated[list[str], NoDecode] = ["*"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, list):
            return [str(item).strip() for item in v if str(item).strip()]
        if isinstance(v, str):
            raw = v.strip()
            if not raw:
                return ["*"]
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [item.strip() for item in raw.split(",") if item.strip()]
        return ["*"]


settings = Settings()
