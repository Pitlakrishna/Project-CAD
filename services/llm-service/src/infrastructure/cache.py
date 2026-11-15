"""Redis caching layer for generated Replicad models."""

import asyncio
import hashlib
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from src.config import settings

logger = logging.getLogger(__name__)


class PromptCache:
    """Async Redis cache for generated CAD models."""

    def __init__(self):
        self._redis: aioredis.Redis | None = None
        if settings.cache_enabled:
            try:
                if settings.redis_url:
                    self._redis = aioredis.from_url(
                        settings.redis_url,
                        decode_responses=True,
                        socket_connect_timeout=0.5,
                        socket_timeout=0.5,
                    )
                else:
                    self._redis = aioredis.Redis(
                        host=settings.redis_host,
                        port=settings.redis_port,
                        password=settings.redis_password,
                        decode_responses=True,
                        socket_connect_timeout=0.15,
                        socket_timeout=0.15,
                    )
            except Exception as e:
                logger.debug("Failed to initialize Redis cache connection: %s", e)
                self._redis = None

    @staticmethod
    def compute_cache_key(prompt: str, model: str) -> str:
        """Computes a deterministic hash key for prompt + model combination."""
        combined = f"{model.lower()}::{prompt.strip().lower()}"
        return f"cad:cache:{hashlib.sha256(combined.encode('utf-8')).hexdigest()}"

    async def get(self, cache_key: str) -> dict[str, Any] | None:
        if not self._redis or not settings.cache_enabled:
            return None
        try:
            val = await asyncio.wait_for(self._redis.get(cache_key), timeout=0.15)
            if val:
                return json.loads(val)
        except Exception as e:
            logger.debug("Redis unavailable, bypassing cache: %s", e)
            # Disable redis handle to prevent blocking future requests when Redis is down
            self._redis = None
        return None

    async def set(self, cache_key: str, data: dict[str, Any], ttl: int | None = None) -> None:
        if not self._redis or not settings.cache_enabled:
            return
        try:
            ttl_val = ttl or settings.cache_ttl_seconds
            await asyncio.wait_for(
                self._redis.setex(cache_key, ttl_val, json.dumps(data)),
                timeout=0.2,
            )
        except Exception as e:
            logger.debug("Redis SETEX error: %s", e)
            self._redis = None

    async def ping(self) -> bool:
        if not self._redis or not settings.cache_enabled:
            return False
        try:
            return bool(await asyncio.wait_for(self._redis.ping(), timeout=0.3))
        except Exception:
            return False
