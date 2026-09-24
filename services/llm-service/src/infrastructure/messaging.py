"""RabbitMQ event publisher adhering to platform event schema."""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
import pika  # type: ignore
from src.config import settings

logger = logging.getLogger(__name__)


class EventPublisher:
    """Publishes domain events (e.g., LlmCodeGenerated) to RabbitMQ."""

    def __init__(self):
        self.enabled = settings.rabbitmq_enabled

    def publish_code_generated(
        self,
        prompt_id: str,
        user_id: str,
        code_snippet: str,
        token_usage: int,
        tenant_id: Optional[str] = None,
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
            credentials = pika.PlainCredentials(settings.rabbitmq_user, settings.rabbitmq_pass)
            parameters = pika.ConnectionParameters(
                host=settings.rabbitmq_host,
                port=settings.rabbitmq_port,
                credentials=credentials,
                connection_attempts=2,
                retry_delay=1,
            )
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()

            channel.exchange_declare(
                exchange=settings.rabbitmq_events_exchange,
                exchange_type="topic",
                durable=True,
            )

            channel.basic_publish(
                exchange=settings.rabbitmq_events_exchange,
                routing_key="llm.code_generated",
                body=json.dumps(event),
                properties=pika.BasicProperties(
                    content_type="application/json",
                    delivery_mode=2,  # make message persistent
                ),
            )
            connection.close()
            return True
        except Exception as e:
            logger.warning("Failed to publish code_generated event to RabbitMQ: %s", e)
            return False

    def ping(self) -> bool:
        if not self.enabled:
            return False
        try:
            credentials = pika.PlainCredentials(settings.rabbitmq_user, settings.rabbitmq_pass)
            parameters = pika.ConnectionParameters(
                host=settings.rabbitmq_host,
                port=settings.rabbitmq_port,
                credentials=credentials,
                socket_timeout=1.0,
            )
            connection = pika.BlockingConnection(parameters)
            connection.close()
            return True
        except Exception:
            return False
