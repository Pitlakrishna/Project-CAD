"""Pydantic schemas and ToolCallExtractor adapter for Project CAD."""

from typing import List
from src.tools.base import ToolCallResult
from src.tools.registry import tool_registry


class ToolCallExtractor:
    """Backward-compatible adapter that delegates extraction and validation to ToolRegistry."""

    @classmethod
    def extract(cls, raw_text: str) -> List[ToolCallResult]:
        """Extracts and validates tool calls using the specialized ToolRegistry."""
        return tool_registry.extract_tool_calls(raw_text)


__all__ = ["ToolCallResult", "ToolCallExtractor", "tool_registry"]
