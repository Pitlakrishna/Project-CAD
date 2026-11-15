"""Base contract for all domain tools in Project CAD.

Every tool implements this abstract class, providing:
1. Strict Pydantic input validation (args_schema).
2. Domain-specific prompt engineering (prompt_guidelines) for Option 2.
3. Native Gemini & OpenAI function declarations.
4. An execute() method that validates and returns a ToolCallResult.
"""

from __future__ import annotations

import re
from abc import ABC
from typing import Any

from pydantic import BaseModel, Field


class ToolCallResult(BaseModel):
    """Validated, serializable result of a single tool execution."""
    tool_name: str = Field(..., description="Unique tool identifier, e.g. 'generate_word_document'")
    filename: str = Field(..., description="Target download filename with extension")
    artifact_type: str = Field(..., description="Format identifier: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'csv'")
    title: str = Field(..., description="Human-readable document or artifact title")
    data: dict[str, Any] = Field(default_factory=dict, description="Validated payload dictionary")


class BaseTool(ABC):
    """Abstract base class for all commercial-grade tools."""

    name: str
    description: str
    artifact_type: str
    file_extension: str
    prompt_guidelines: str
    args_schema: type[BaseModel]

    def derive_filename(self, data: dict[str, Any]) -> str:
        """Derives a safe, sanitized filename from document title or tool name."""
        raw_title = data.get("title") or self.name.replace("generate_", "")
        safe = re.sub(r"[^\w\s-]", "", raw_title).strip().replace(" ", "_")
        ext = self.file_extension if self.file_extension.startswith(".") else f".{self.file_extension}"
        return f"{safe[:60]}{ext}" if safe else f"document{ext}"

    def to_gemini_declaration(self) -> dict[str, Any]:
        """Converts the Pydantic schema to Gemini Function Declaration format."""
        schema = self.args_schema.model_json_schema()
        # Clean up unsupported Gemini JSON Schema keywords
        properties = {}
        for prop_name, prop_val in schema.get("properties", {}).items():
            clean_prop = {k: v for k, v in prop_val.items() if k not in ["title", "default"]}
            properties[prop_name] = clean_prop

        return {
            "name": self.name,
            "description": f"{self.description} Format rules: {self.prompt_guidelines[:200]}",
            "parameters": {
                "type": "OBJECT",
                "properties": properties,
                "required": schema.get("required", []),
            },
        }

    def to_openai_tool(self) -> dict[str, Any]:
        """Converts the Pydantic schema to OpenAI/Groq Tool Calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.args_schema.model_json_schema(),
            },
        }

    def execute(self, **kwargs) -> ToolCallResult:
        """Validates kwargs with args_schema and returns a typed ToolCallResult."""
        validated = self.args_schema.model_validate(kwargs)
        payload = validated.model_dump()
        filename = self.derive_filename(payload)
        title = payload.get("title") or self.name.replace("generate_", "").replace("_", " ").title()

        return ToolCallResult(
            tool_name=self.name,
            filename=filename,
            artifact_type=self.artifact_type,
            title=title,
            data=payload,
        )
