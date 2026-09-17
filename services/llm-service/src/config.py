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

    # LLM Provider: 'openai' | 'anthropic' | 'ollama' | 'mock'
    llm_provider: str = "mock"

    # OpenAI Settings
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o"
    openai_timeout_seconds: float = 60.0

    # Anthropic Settings
    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    anthropic_timeout_seconds: float = 60.0

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
