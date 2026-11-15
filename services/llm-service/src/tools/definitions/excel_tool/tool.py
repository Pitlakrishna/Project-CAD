"""Specialized Excel Spreadsheet (.xlsx) Tool implementation."""

from src.tools.base import BaseTool
from src.tools.definitions.excel_tool.prompt import EXCEL_TOOL_PROMPT
from src.tools.definitions.excel_tool.schema import ExcelSheetArgs


class ExcelSheetTool(BaseTool):
    name = "generate_excel_sheet"
    description = (
        "Generates a multi-sheet Microsoft Excel (.xlsx) workbook for engineering calculations, "
        "bill of materials (BOM), tolerance stackups, and cost estimates."
    )
    artifact_type = "xlsx"
    file_extension = ".xlsx"
    prompt_guidelines = EXCEL_TOOL_PROMPT
    args_schema = ExcelSheetArgs
