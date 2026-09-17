"""Pytest configuration and fixtures for llm-service."""

import os
import pytest
from fastapi.testclient import TestClient

# Set test environment
os.environ["ENV"] = "test"
os.environ["DEBUG"] = "false"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["CACHE_ENABLED"] = "false"
os.environ["RABBITMQ_ENABLED"] = "false"

from src.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
