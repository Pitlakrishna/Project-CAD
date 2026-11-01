"""Centralized Tool Registry for Project CAD.

Provides:
- Tool registration and discovery.
- Generation of native Gemini and OpenAI function schemas.
- Compilation of tool-specific prompt instructions for LLM context injection.
- Execution and Pydantic validation of tool arguments.
- Robust dual-mode extraction (fenced tool code blocks + legacy XML tag fallback).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional
from src.tools.base import BaseTool, ToolCallResult
from src.tools.definitions import ALL_TOOLS

logger = logging.getLogger(__name__)

# Matches: ```tool:<tool_name>\n{...json...}\n```
_TOOL_FENCE_RE = re.compile(
    r"```tool:([a-z_]+)\s*\n(.*?)```",
    re.DOTALL,
)

# Backward-compat: matches legacy <file_artifact filename="..." type="..." title="...">...</file_artifact>
_LEGACY_TAG_RE = re.compile(
    r'<file_artifact\s+filename=["\']([^"\']+)["\']\s+type=["\']([^"\']+)["\']\s+title=["\']([^"\']+)["\']\s*>(.*?)</file_artifact>',
    re.DOTALL | re.IGNORECASE,
)

_LEGACY_TYPE_TO_TOOL: Dict[str, str] = {
    "docx": "generate_word_document",
    "doc": "generate_word_document",
    "xlsx": "generate_excel_sheet",
    "xls": "generate_excel_sheet",
    "pptx": "generate_presentation",
    "ppt": "generate_presentation",
    "pdf": "generate_pdf_report",
    "csv": "generate_csv_export",
}


class ToolRegistry:
    """Manages all available domain tools, schema conversions, and execution dispatch."""

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        for tool in ALL_TOOLS:
            self.register(tool)

    def register(self, tool: BaseTool) -> None:
        """Registers a tool in the registry."""
        self._tools[tool.name] = tool
        logger.debug("Registered tool: %s", tool.name)

    def get_tool(self, name: str) -> Optional[BaseTool]:
        """Returns the registered tool by name, or None."""
        return self._tools.get(name)

    def list_tools(self) -> List[BaseTool]:
        """Returns all registered tool instances."""
        return list(self._tools.values())

    def get_gemini_declarations(self) -> List[Dict[str, Any]]:
        """Returns all tools formatted as Gemini Function Declarations."""
        return [tool.to_gemini_declaration() for tool in self._tools.values()]

    def get_openai_tools(self) -> List[Dict[str, Any]]:
        """Returns all tools formatted as OpenAI / Groq tool definitions."""
        return [tool.to_openai_tool() for tool in self._tools.values()]

    def get_system_prompt_guidelines(self) -> str:
        """Compiles specialized prompt instructions across all registered tools."""
        sections = [
            "### AVAILABLE SPECIALIZED TOOLS",
            "When the user requests documents, reports, presentations, or data tables, "
            "you MUST invoke the appropriate tool using a fenced block:",
            "```tool:<tool_name>",
            "{ ...JSON payload conforming to tool schema... }",
            "```\n",
        ]

        for tool in self._tools.values():
            sections.append(f"#### Tool: `{tool.name}`")
            sections.append(f"**Purpose:** {tool.description}")
            sections.append(f"**Specialized Guidelines:**\n{tool.prompt_guidelines.strip()}\n")

        return "\n".join(sections)

    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolCallResult:
        """Validates arguments against the tool's Pydantic schema and returns a ToolCallResult."""
        tool = self.get_tool(tool_name)
        if not tool:
            # Fallback for unrecognized tools
            return ToolCallResult(
                tool_name=tool_name,
                filename=f"{tool_name}.json",
                artifact_type="txt",
                title=tool_name.replace("_", " ").title(),
                data=arguments,
            )

        return tool.execute(**arguments)

    def extract_tool_calls(self, raw_text: str) -> List[ToolCallResult]:
        """Extracts and executes/validates tool calls from LLM response text.

        Tries fenced tool blocks first. Falls back to legacy XML tags for backward compatibility.
        """
        results = self._extract_tool_fences(raw_text)
        if results:
            return results
        return self._extract_legacy_tags(raw_text)

    def _extract_tool_fences(self, raw_text: str) -> List[ToolCallResult]:
        results: List[ToolCallResult] = []
        for match in _TOOL_FENCE_RE.finditer(raw_text):
            tool_name = match.group(1).strip()
            json_body = match.group(2).strip()
            try:
                data = json.loads(json_body)
                validated_result = self.execute(tool_name, data)
                results.append(validated_result)
            except json.JSONDecodeError as e:
                logger.warning("ToolRegistry: JSON decode error in '%s': %s", tool_name, e)
            except Exception as e:
                logger.warning("ToolRegistry: Validation error executing '%s': %s", tool_name, e)
                # Graceful fallback: return unvalidated dictionary so user does not lose output
                try:
                    data = json.loads(json_body)
                    tool = self.get_tool(tool_name)
                    results.append(
                        ToolCallResult(
                            tool_name=tool_name,
                            filename=tool.derive_filename(data) if tool else f"{tool_name}.txt",
                            artifact_type=tool.artifact_type if tool else "txt",
                            title=data.get("title") or tool_name.replace("_", " ").title(),
                            data=data,
                        )
                    )
                except Exception:
                    pass
        return results

    def _extract_legacy_tags(self, raw_text: str) -> List[ToolCallResult]:
        results: List[ToolCallResult] = []
        for match in _LEGACY_TAG_RE.finditer(raw_text):
            filename = match.group(1).strip()
            file_type = match.group(2).strip().lower()
            title = match.group(3).strip()
            body = match.group(4).strip()
            tool_name = _LEGACY_TYPE_TO_TOOL.get(file_type, f"generate_{file_type}_export")
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                data = {"title": title, "raw": body}

            try:
                validated_result = self.execute(tool_name, data)
                if filename:
                    validated_result.filename = filename
                if title:
                    validated_result.title = title
                results.append(validated_result)
            except Exception:
                # If validation fails on legacy data, construct safe result with original metadata
                results.append(
                    ToolCallResult(
                        tool_name=tool_name,
                        filename=filename,
                        artifact_type=file_type,
                        title=title,
                        data=data,
                    )
                )
        return results


# Global singleton registry instance
tool_registry = ToolRegistry()
