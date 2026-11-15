"""Specialized CSV Data Export Tool implementation."""

from src.tools.base import BaseTool
from src.tools.definitions.csv_tool.prompt import CSV_TOOL_PROMPT
from src.tools.definitions.csv_tool.schema import CsvExportArgs


class CsvExportTool(BaseTool):
    name = "generate_csv_export"
    description = (
        "Exports structured engineering and parametric data to CSV format with explicit units and typed columns."
    )
    artifact_type = "csv"
    file_extension = ".csv"
    prompt_guidelines = CSV_TOOL_PROMPT
    args_schema = CsvExportArgs
