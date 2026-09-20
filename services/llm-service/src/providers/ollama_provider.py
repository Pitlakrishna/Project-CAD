"""Local Ollama LLM Provider connector (for DeepSeek-Coder, Llama 3, etc.)."""

import time
from typing import Any, Dict, List, Optional
import httpx
from src.config import settings
from src.domain.exceptions import ProviderException
from src.domain.models import LlmGenerationResult
from src.providers.base import BaseLlmProvider


class OllamaProvider(BaseLlmProvider):
    """Local Ollama instance connector."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        selected_model = model or settings.ollama_model
        start_time = time.perf_counter()

        payload = {
            "model": selected_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=settings.ollama_timeout_seconds) as client:
                resp = await client.post(f"{self.base_url}/api/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()

            latency = (time.perf_counter() - start_time) * 1000
            content = data.get("message", {}).get("content", "")
            eval_count = data.get("eval_count", 0) + data.get("prompt_eval_count", 0)

            return LlmGenerationResult(
                raw_response=content,
                token_usage=eval_count,
                provider="ollama",
                model=selected_model,
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            raise ProviderException(f"Ollama request to {self.base_url} failed: {str(e)}") from e

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False

    async def verify_credentials(self, model: Optional[str] = None) -> tuple[bool, str]:
        target_model = model or settings.ollama_model
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code != 200:
                    return False, f"Ollama instance at {self.base_url} returned HTTP {resp.status_code}"
                data = resp.json()
                models = [m.get("name") for m in data.get("models", [])]
                if target_model and not any(target_model in m for m in models if m):
                    return True, f"Ollama reachable at {self.base_url}, but '{target_model}' is not in installed models: {models}."
                return True, f"Ollama connected successfully at {self.base_url} (model '{target_model}' ready)."
        except Exception as e:
            return False, f"Could not connect to Ollama at {self.base_url}: {str(e)}"
