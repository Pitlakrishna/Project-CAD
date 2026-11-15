"""RabbitMQ event publisher adhering to platform event schema with persistent connection management."""

import json
import logging
import threading
import uuid
from datetime import datetime, timezone

import pika  # type: ignore

from src.config import settings

logger = logging.getLogger(__name__)


class EventPublisher:
    """Publishes domain events to RabbitMQ using a pooled, reconnecting connection."""

    def __init__(self):
        self.enabled = settings.rabbitmq_enabled
        self._connection: pika.BlockingConnection | None = None
        self._channel: pika.adapters.blocking_connection.BlockingChannel | None = None
        self._lock = threading.Lock()

    def _get_channel(self) -> pika.adapters.blocking_connection.BlockingChannel | None:
        """Returns a valid open channel, reconnecting if disconnected."""
        if not self.enabled:
            return None

        with self._lock:
            if self._connection and self._connection.is_open and self._channel and self._channel.is_open:
                return self._channel

            # Clean up any stale handles
            try:
                if self._channel and self._channel.is_open:
                    self._channel.close()
            except Exception:
                pass
            try:
                if self._connection and self._connection.is_open:
                    self._connection.close()
            except Exception:
                pass

            try:
                if settings.rabbitmq_url:
                    parameters: pika.ConnectionParameters | pika.URLParameters = pika.URLParameters(
                        settings.rabbitmq_url
                    )
                    parameters.socket_timeout = 2.0
                else:
                    credentials = pika.PlainCredentials(settings.rabbitmq_user, settings.rabbitmq_pass)
                    parameters = pika.ConnectionParameters(
                        host=settings.rabbitmq_host,
                        port=settings.rabbitmq_port,
                        credentials=credentials,
                        connection_attempts=2,
                        retry_delay=1,
                        socket_timeout=2.0,
                    )
                self._connection = pika.BlockingConnection(parameters)
                self._channel = self._connection.channel()
                self._channel.exchange_declare(
                    exchange=settings.rabbitmq_events_exchange,
                    exchange_type="topic",
                    durable=True,
                )
                return self._channel
            except Exception as e:
                logger.warning("RabbitMQ connection failed: %s", e)
                self._connection = None
                self._channel = None
                return None

    def publish_code_generated(
        self,
        prompt_id: str,
        user_id: str,
        code_snippet: str,
        token_usage: int,
        tenant_id: str | None = None,
    ) -> bool:
        if not self.enabled:
            return False

        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "llm.code_generated",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tenant_id": tenant_id,
            "payload": {
                "prompt_id": prompt_id,
                "user_id": user_id,
                "code_snippet": code_snippet,
                "token_usage": token_usage,
            },
        }

        try:
            channel = self._get_channel()
            if not channel:
                return False

            channel.basic_publish(
                exchange=settings.rabbitmq_events_exchange,
                routing_key="llm.code_generated",
                body=json.dumps(event),
                properties=pika.BasicProperties(
                    content_type="application/json",
                    delivery_mode=2,  # make message persistent
                ),
            )
            return True
        except Exception as e:
            logger.warning("Failed to publish code_generated event to RabbitMQ: %s", e)
            # Invalidate connection on publish error so next attempt reconnects
            with self._lock:
                self._connection = None
                self._channel = None
            return False

    def ping(self) -> bool:
        if not self.enabled:
            return False
        try:
            channel = self._get_channel()
            return channel is not None and channel.is_open
        except Exception:
            return False

    def close(self) -> None:
        """Gracefully closes persistent connection on shutdown."""
        with self._lock:
            try:
                if self._channel and self._channel.is_open:
                    self._channel.close()
            except Exception:
                pass
            try:
                if self._connection and self._connection.is_open:
                    self._connection.close()
            except Exception:
                pass
            self._connection = None
            self._channel = None
