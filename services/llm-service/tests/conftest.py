"""Pytest configuration and fixtures for llm-service."""

import os
import pytest
from fastapi.testclient import TestClient

# Set test environment
os.environ["ENV"] = "test"
os.environ["DEBUG"] = "false"
os.environ["LLM_PROVIDER"] = "gemini"
os.environ["CACHE_ENABLED"] = "false"
os.environ["RABBITMQ_ENABLED"] = "false"

from src.main import app
from src.providers.base import BaseLlmProvider
from src.domain.models import LlmGenerationResult
from src.providers import get_llm_provider as original_get_llm_provider

SAMPLE_CAD_CODE = '''```typescript
import { drawRoundedRectangle, makeCylinder, sketchOnPlane } from "replicad";

export const defaultParams = {
  length: 110,
  width: 70,
  height: 30,
  wallThickness: 2.5,
  glassLidThickness: 3.0,
  cornerRadius: 6.0,
};

export default function main(params = defaultParams) {
  const { length, width, height, wallThickness, glassLidThickness, cornerRadius } = params;
  const outerProfile = drawRoundedRectangle(length, width, cornerRadius);
  const baseHousing = outerProfile.sketchOnPlane("XY").extrude(height);
  const glassProfile = drawRoundedRectangle(length - 0.5, width - 0.5, cornerRadius);
  const glassLid = glassProfile.sketchOnPlane("XY").extrude(glassLidThickness).translate([0, 0, height]);
  const screw = makeCylinder(2.2, 2.5).translate([0, 0, height + glassLidThickness]);

  return [
    {
      name: "EnclosureBase",
      shape: baseHousing,
      color: "#1e293b",
      material: "plastic",
      roughness: 0.45,
      metalness: 0.0,
      opacity: 1.0,
      transparent: false,
    },
    {
      name: "TemperedGlassLid",
      shape: glassLid,
      color: "#93c5fd",
      material: "glass",
      roughness: 0.04,
      metalness: 0.02,
      transmission: 0.96,
      opacity: 0.32,
      ior: 1.52,
      transparent: true,
    },
    {
      name: "RetainingFasteners",
      shape: screw,
      color: "#e2e8f0",
      material: "metal",
      roughness: 0.2,
      metalness: 0.95,
      opacity: 1.0,
      transparent: false,
    },
  ];
}
```'''


class FakeTestLlmProvider(BaseLlmProvider):
    async def generate(self, messages, model=None, temperature=0.2, is_cad_task=True, **kwargs):
        user_content = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                user_content = m.get("content", "").split("\n\n")[0].lower()
                break

        if not is_cad_task or user_content == "hi":
            return LlmGenerationResult(
                raw_response="Hello! I am your AI CAD assistant.",
                token_usage=20,
                provider="gemini",
                model="test-model",
                latency_ms=10.0,
            )

        return LlmGenerationResult(
            raw_response=SAMPLE_CAD_CODE,
            token_usage=500,
            provider="gemini",
            model="test-cad-model",
            latency_ms=25.0,
        )

    async def is_available(self) -> bool:
        return True

    async def verify_credentials(self, model=None) -> tuple[bool, str]:
        return True, "Test provider ready."


def fake_get_llm_provider(provider_name=None, api_key=None, base_url=None):
    if provider_name == "openai" and not api_key:
        return original_get_llm_provider("openai", api_key=api_key, base_url=base_url)
    if provider_name == "nonexistent_provider":
        return original_get_llm_provider(provider_name, api_key=api_key, base_url=base_url)
    return FakeTestLlmProvider()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("src.domain.services.get_llm_provider", fake_get_llm_provider)
    with TestClient(app) as test_client:
        yield test_client
