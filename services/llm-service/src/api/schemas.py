from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from src.config import settings


class MaterialType(str, Enum):
    METAL = "metal"
    PLASTIC = "plastic"
    GLASS = "glass"
    WOOD = "wood"
    RUBBER = "rubber"
    CERAMIC = "ceramic"
    MATTE = "matte"
    CUSTOM = "custom"


class PartVisualSchema(BaseModel):
    name: str = Field(..., description="Name of the assembly component, e.g. MainBody, GlassLid, Screw")
    color: str = Field(default="#3b82f6", description="Hex color string, e.g. #2563eb")
    material: MaterialType = Field(default=MaterialType.PLASTIC, description="Physical material categorization")
    opacity: float = Field(default=1.0, ge=0.0, le=1.0, description="Visual opacity: 0.0 transparent, 1.0 opaque")
    roughness: float = Field(default=0.3, ge=0.0, le=1.0, description="Surface roughness (PBR): 0.0 smooth, 1.0 matte")
    metalness: float = Field(default=0.0, ge=0.0, le=1.0, description="Metalness (PBR): 0.0 dielectric, 1.0 pure metal")
    transmission: float = Field(default=0.0, ge=0.0, le=1.0, description="Optical transmission for glass/acrylic (0.0 to 1.0)")
    ior: float = Field(default=1.52, ge=1.0, le=3.0, description="Index of refraction (1.52 for glass, 1.49 acrylic, 1.0 air)")
    transparent: bool = Field(default=False, description="Whether the material requires alpha blending/transparency")


class ParameterDefinition(BaseModel):
    name: str = Field(..., description="Parameter variable name")
    default_value: float | int | bool | str = Field(..., description="Initial default value")
    param_type: str = Field(default="number", description="'number', 'boolean', or 'string'")
    min_value: float | None = Field(default=None, description="Slider minimum limit")
    max_value: float | None = Field(default=None, description="Slider maximum limit")
    step: float | None = Field(default=None, description="Slider step increment")
    description: str | None = Field(default=None, description="Human-readable parameter description")


class ChatHistoryMessage(BaseModel):
    role: str = Field(..., description="'user' | 'assistant'")
    content: str = Field(..., description="Message text content")


class GenerateCadRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Natural language prompt describing the 3D parametric object or conversation")
    history: list[ChatHistoryMessage] | None = Field(default_factory=list, description="Recent conversation history for multi-turn context")
    provider: str | None = Field(default=None, description="Optional override: 'gemini' | 'groq' | 'openai' | 'anthropic' | 'ollama' | 'deepseek'")
    model: str | None = Field(default=None, description="Optional override for model name")
    chat_model: str | None = Field(default=None, description="Optional model override for conversational / fast chat")
    cad_model: str | None = Field(default=None, description="Optional model override for 3D CAD parametric modeling")
    api_key: str | None = Field(default=None, description="Optional provider API key override from client settings")
    base_url: str | None = Field(default=None, description="Optional custom base URL (for Ollama, DeepSeek, vLLM, OpenRouter)")
    temperature: float | None = Field(default=0.2, ge=0.0, le=1.0, description="LLM sampling temperature")
    tenant_id: str | None = Field(default=None, description="Tenant identifier")
    user_id: str | None = Field(default="anonymous", description="User identifier")
    constraints: dict[str, Any] | None = Field(default_factory=dict, description="Optional dimensional or material constraints")
    enable_search: bool | None = Field(default=None, description="Enable Google Search Grounding for real-time web information")
    engine_mode: str | None = Field(default="auto", description="'auto' | 'cad' | 'threejs' | 'hybrid'")


class RefineCadRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Modification prompt, e.g. 'add a glass window to the front'")
    previous_code: str = Field(..., min_length=10, description="The previous Replicad TypeScript code to modify")
    previous_parameters: dict[str, Any] | None = Field(default_factory=dict, description="Current parameter values")
    history: list[ChatHistoryMessage] | None = Field(default_factory=list, description="Recent conversation history for multi-turn context")
    provider: str | None = Field(default=None)
    model: str | None = Field(default=None)
    chat_model: str | None = Field(default=None)
    cad_model: str | None = Field(default=None)
    api_key: str | None = Field(default=None)
    base_url: str | None = Field(default=None)
    tenant_id: str | None = Field(default=None)
    user_id: str | None = Field(default="anonymous")
    enable_search: bool | None = Field(default=None, description="Enable Google Search Grounding for real-time web information")
    engine_mode: str | None = Field(default="auto", description="'auto' | 'cad' | 'threejs'")


class ValidateCadRequest(BaseModel):
    replicad_code: str = Field(..., min_length=10, description="Replicad TypeScript code snippet to inspect and parse")


class VerifyCredentialsRequest(BaseModel):
    provider: str = Field(..., description="Provider: 'gemini' | 'groq' | 'openai' | 'anthropic' | 'ollama' | 'deepseek'")
    api_key: str | None = Field(default=None, description="Provider API key to test")
    model: str | None = Field(default=None, description="Model identifier to test against")
    base_url: str | None = Field(default=None, description="Base URL / host for provider")


class VerifyCredentialsResponse(BaseModel):
    valid: bool = Field(..., description="Whether credentials and connectivity succeeded")
    provider: str = Field(..., description="Provider name tested")
    model: str | None = Field(default=None, description="Model used for test")
    message: str = Field(..., description="Human-readable verification result message")



class ToolCallResult(BaseModel):
    """A structured tool call result extracted from an LLM response."""
    tool_name: str = Field(..., description="Tool identifier, e.g. 'generate_word_document'")
    filename: str = Field(..., description="Download filename with extension, e.g. 'spec.docx'")
    artifact_type: str = Field(..., description="File type: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'csv'")
    title: str = Field(..., description="Human-readable document title")
    data: dict[str, Any] = Field(default_factory=dict, description="Full structured JSON payload for the document")


class CadGenerationResponse(BaseModel):
    prompt_id: str = Field(..., description="Unique UUID for this generation request")
    engine_mode: str | None = Field(default="cad", description="'cad' | 'threejs' | 'hybrid'")
    replicad_code: str = Field(default="", description="Cleaned, runnable Replicad TypeScript code")
    threejs_code: str | None = Field(default=None, description="Cleaned, runnable native Three.js procedural scene code")
    raw_explanation: str | None = Field(default=None, description="CAD design commentary and explanation")
    raw_thoughts: str | None = Field(default=None, description="Model internal thinking/reasoning process")
    parameters: dict[str, Any] = Field(default_factory=dict, description="Extracted parameter dictionary")
    parameter_definitions: list[ParameterDefinition] = Field(default_factory=list, description="Parametric metadata with UI slider bounds")
    parts: list[PartVisualSchema] = Field(default_factory=list, description="List of assembly parts with colors and materials")
    materials_used: list[str] = Field(default_factory=list, description="Summary list of unique materials present")
    has_glass: bool = Field(default=False, description="Indicates if this model contains optical/glass components")
    provider: str = Field(..., description="Provider used ('gemini', 'groq', 'openai', 'anthropic', 'ollama', 'deepseek')")
    model: str = Field(..., description="Model identifier used")
    token_usage: int = Field(default=0, description="Total tokens used in generation")
    cached: bool = Field(default=False, description="Whether the result was served from Redis cache")
    latency_ms: float = Field(default=0.0, description="Execution time in milliseconds")
    grounding_metadata: dict[str, Any] | None = Field(default=None, description="Google Search grounding metadata (queries, sources)")
    tool_calls: list[ToolCallResult] = Field(default_factory=list, description="Structured tool call outputs (document artifacts)")



class HealthResponse(BaseModel):
    status: str
    provider: str
    cache_connected: bool
    rabbitmq_connected: bool
    version: str = Field(default_factory=lambda: settings.app_version)
