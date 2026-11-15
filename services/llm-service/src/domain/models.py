"""Domain models for internal processing of CAD generation."""

from dataclasses import dataclass, field
from typing import Any

from src.api.schemas import ParameterDefinition, PartVisualSchema


@dataclass
class ParsedCadModel:
    code: str
    parameters: dict[str, Any] = field(default_factory=dict)
    parameter_definitions: list[ParameterDefinition] = field(default_factory=list)
    parts: list[PartVisualSchema] = field(default_factory=list)
    materials: list[str] = field(default_factory=list)
    has_glass: bool = False
    explanation: str | None = None


@dataclass
class LlmGenerationResult:
    raw_response: str
    token_usage: int
    provider: str
    model: str
    latency_ms: float
    grounding_metadata: dict[str, Any] | None = None
    raw_thoughts: str = ""

