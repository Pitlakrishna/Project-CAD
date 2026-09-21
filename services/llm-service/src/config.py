from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "dev"
    debug: bool = True
    port: int = 8000
    host: str = "0.0.0.0"

    # LLM Provider: 'gemini' | 'groq' | 'openai' | 'anthropic' | 'ollama'
    llm_provider: str = "gemini"

    # OpenAI Settings
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    openai_model: str = "gpt-4o"
    openai_fast_model: str = "gpt-4o-mini"
    openai_timeout_seconds: float = 60.0

    # Anthropic Settings
    anthropic_api_key: Optional[str] = None
    anthropic_base_url: Optional[str] = None
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    anthropic_fast_model: str = "claude-3-5-haiku-20241022"
    anthropic_timeout_seconds: float = 60.0

    # Google Gemini Settings
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-3.8-flash"
    gemini_fast_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: float = 60.0
    gemini_thinking_budget_chat: int = 0
    gemini_thinking_budget_cad: int = 512
    gemini_search_grounding: bool = False

    # Groq Settings (Ultra-fast LPU inference, generous free tier)
    groq_api_key: Optional[str] = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.3-70b-versatile"
    groq_fast_model: str = "openai/gpt-oss-20b"
    groq_timeout_seconds: float = 60.0

    # Ollama Settings
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "deepseek-coder:6.7b"
    ollama_timeout_seconds: float = 90.0

    # Redis Cache Settings
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: Optional[str] = None
    cache_enabled: bool = True
    cache_ttl_seconds: int = 86400

    # RabbitMQ Settings
    rabbitmq_host: str = "localhost"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "guest"
    rabbitmq_pass: str = "guest"
    rabbitmq_events_exchange: str = "aicad.events"
    rabbitmq_enabled: bool = False

    # CORS
    cors_origins: List[str] = ["*"]


settings = Settings()
