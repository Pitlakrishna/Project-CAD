"""Specialized Search Engineering Specs Tool implementation."""

from typing import Any, Dict, Optional
from src.tools.base import BaseTool, ToolCallResult
from src.tools.definitions.search_tool.prompt import SEARCH_TOOL_PROMPT
from src.tools.definitions.search_tool.schema import SearchSpecsArgs


class SearchSpecsTool(BaseTool):
    name = "search_engineering_specs"
    description = (
        "Searches Google and engineering databases for standard real-world dimensions, manufacturer specifications, "
        "port layouts, and tolerances for mechanical parts and consumer electronics."
    )
    artifact_type = "specs"
    file_extension = ".json"
    prompt_guidelines = SEARCH_TOOL_PROMPT
    args_schema = SearchSpecsArgs

    def execute(self, arguments: Optional[Dict[str, Any]] = None, **kwargs: Any) -> ToolCallResult:
        """Validates arguments and creates the tool call result."""
        payload = arguments if arguments is not None else kwargs
        validated = SearchSpecsArgs.model_validate(payload)
        query = validated.query
        filename = f"specs_{self.derive_filename({'title': query})}"
        return ToolCallResult(
            tool_name=self.name,
            filename=filename,
            artifact_type=self.artifact_type,
            title=f"Engineering Specs: {query}",
            data=validated.model_dump(),
        )
