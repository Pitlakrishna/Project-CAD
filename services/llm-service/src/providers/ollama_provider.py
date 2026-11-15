from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from src.config import settings
from src.core.base import BaseLlmProvider
from src.core.common import (
    StreamThoughtExtractor,
    create_generation_result,
    create_stream_final_payload,
    execute_with_model_fallback,
    handle_provider_error,
)
from src.core.models import get_models_to_try, is_retryable_model_error
from src.domain.models import LlmGenerationResult

logger = logging.getLogger(__name__)


class OllamaProvider(BaseLlmProvider):
    """Local Ollama instance connector supporting streaming and thought extraction (DeepSeek-R1, QwQ)."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")

    async def generate(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
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

        msg = data.get("message", {})
        content = msg.get("content", "")
        reasoning = msg.get("thinking", "") or ""

        if "<think>" in content and "</think>" in content:
            before, _, rest = content.partition("<think>")
            th, _, after = rest.partition("</think>")
            if not reasoning:
                reasoning = th.strip()
            content = (before + after).strip()

        eval_count = data.get("eval_count", 0) + data.get("prompt_eval_count", 0)
        return create_generation_result(
            raw_response=content,
            provider="ollama",
            model=used_model,
            start_time=start_time,
            token_usage=eval_count,
            raw_thoughts=reasoning,
        )

    async def generate_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
        is_cad_task: bool = True,
        **kwargs: Any,
    ) -> AsyncGenerator[dict[str, Any], None]:
        start_time = time.perf_counter()
        models_to_try = get_models_to_try("ollama", requested_model=model, is_cad_task=is_cad_task)
        last_error: Exception | None = None

        for current_model in models_to_try:
            yielded_any = False
            try:
                if current_model != models_to_try[0]:
                    logger.info("Ollama stream: falling back from '%s' to '%s'", models_to_try[0], current_model)

                payload = {
                    "model": current_model,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "temperature": temperature,
                    },
                }

                accumulated_tokens: list[str] = []
                accumulated_thoughts: list[str] = []
                thought_extractor = StreamThoughtExtractor()

                async with httpx.AsyncClient(timeout=settings.ollama_timeout_seconds) as client:
                    async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if not line or not line.strip():
                                continue
                            try:
                                chunk_data = json.loads(line)
                            except Exception:
                                continue

                            msg = chunk_data.get("message", {})
                            # Check explicit thinking property
                            th_delta = msg.get("thinking")
                            if th_delta:
                                accumulated_thoughts.append(th_delta)
                                yielded_any = True
                                yield {"type": "thought", "content": th_delta}

                            # Check content text with <think> tag extraction
                            chunk_text = msg.get("content", "")
                            if chunk_text:
                                yielded_any = True
                                for kind, text in thought_extractor.feed(chunk_text):
                                    if kind == "thought":
                                        accumulated_thoughts.append(text)
                                        yield {"type": "thought", "content": text}
                                    else:
                                        accumulated_tokens.append(text)
                                        yield {"type": "token", "content": text}

                full_text = "".join(accumulated_tokens)
                full_thoughts = "".join(accumulated_thoughts)
                yield create_stream_final_payload(
                    raw_response=full_text,
                    raw_thoughts=full_thoughts,
                    model=current_model,
                    start_time=start_time,
                )
                return
            except Exception as e:
                last_error = e
                if not yielded_any and is_retryable_model_error(e) and current_model != models_to_try[-1]:
                    logger.warning("Ollama stream model '%s' failed (%s). Retrying with next fallback model...", current_model, e)
                    continue
                break

        handle_provider_error("ollama", last_error, action="stream")

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False

    async def verify_credentials(self, model: str | None = None) -> tuple[bool, str]:
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
            return False, f"Could not connect to Ollama at {self.base_url}: {e!s}"
