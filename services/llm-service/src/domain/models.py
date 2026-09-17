"""Domain models for internal processing of CAD generation."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from src.api.schemas import ParameterDefinition, PartVisualSchema


@dataclass
class ParsedCadModel:
    code: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    parameter_definitions: List[ParameterDefinition] = field(default_factory=list)
    parts: List[PartVisualSchema] = field(default_factory=list)
    materials: List[str] = field(default_factory=list)
    has_glass: bool = False
    explanation: Optional[str] = None


@dataclass
class LlmGenerationResult:
    raw_response: str
    token_usage: int
    provider: str
    model: str
    latency_ms: float
