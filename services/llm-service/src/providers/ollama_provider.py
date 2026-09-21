from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional
import httpx

from src.config import settings
from src.domain.models import LlmGenerationResult
from src.core.base import BaseLlmProvider
from src.core.common import (
    create_generation_result,
    execute_with_model_fallback,
)

logger = logging.getLogger(__name__)


class OllamaProvider(BaseLlmProvider):
    """Local Ollama instance connector."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")

    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        **kwargs: Any,
    ) -> LlmGenerationResult:
        start_time = time.perf_counter()

        async def _call(target_model: str):
            payload = {
                "model": target_model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": temperature,
                },
            }
            async with httpx.AsyncClient(timeout=settings.ollama_timeout_seconds) as client:
                resp = await client.post(f"{self.base_url}/api/chat", json=payload)
                resp.raise_for_status()
                return resp.json()

        data, used_model = await execute_with_model_fallback(
            provider_name="ollama",
            requested_model=model,
            is_cad_task=is_cad_task,
            call_fn=_call,
        )

        content = data.get("message", {}).get("content", "")
        eval_count = data.get("eval_count", 0) + data.get("prompt_eval_count", 0)
        return create_generation_result(
            raw_response=content,
            provider="ollama",
            model=used_model,
            start_time=start_time,
            token_usage=eval_count,
        )

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
