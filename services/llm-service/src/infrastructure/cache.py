"""Redis caching layer for generated Replicad models."""

import hashlib
import json
import logging
from typing import Any, Dict, Optional
import redis.asyncio as aioredis
from src.config import settings

logger = logging.getLogger(__name__)


class PromptCache:
    """Async Redis cache for generated CAD models."""

    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        if settings.cache_enabled:
            try:
                self._redis = aioredis.Redis(
                    host=settings.redis_host,
                    port=settings.redis_port,
                    password=settings.redis_password,
                    decode_responses=True,
                    socket_connect_timeout=2.0,
                )
            except Exception as e:
                logger.warning("Failed to initialize Redis cache connection: %s", e)
                self._redis = None

    @staticmethod
    def compute_cache_key(prompt: str, model: str) -> str:
        """Computes a deterministic hash key for prompt + model combination."""
        combined = f"{model.lower()}::{prompt.strip().lower()}"
        return f"cad:cache:{hashlib.sha256(combined.encode('utf-8')).hexdigest()}"

    async def get(self, cache_key: str) -> Optional[Dict[str, Any]]:
        if not self._redis or not settings.cache_enabled:
            return None
        try:
            val = await self._redis.get(cache_key)
            if val:
                return json.loads(val)
        except Exception as e:
            logger.debug("Redis GET error: %s", e)
        return None

    async def set(self, cache_key: str, data: Dict[str, Any], ttl: Optional[int] = None) -> None:
        if not self._redis or not settings.cache_enabled:
            return
        try:
            ttl_val = ttl or settings.cache_ttl_seconds
            await self._redis.setex(cache_key, ttl_val, json.dumps(data))
        except Exception as e:
            logger.debug("Redis SETEX error: %s", e)

    async def ping(self) -> bool:
        if not self._redis:
            return False
        try:
            return bool(await self._redis.ping())
        except Exception:
            return False
