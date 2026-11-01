"""Specialized PDF Engineering Report Tool implementation."""

from src.tools.base import BaseTool
from src.tools.definitions.pdf_tool.prompt import PDF_TOOL_PROMPT
from src.tools.definitions.pdf_tool.schema import PdfReportArgs


class PdfReportTool(BaseTool):
    name = "generate_pdf_report"
    description = (
        "Generates an ISO/ASME standard engineering PDF report with document control metadata, "
        "executive summary, parametric specification tables, and engineering sign-offs."
    )
    artifact_type = "pdf"
    file_extension = ".pdf"
    prompt_guidelines = PDF_TOOL_PROMPT
    args_schema = PdfReportArgs
