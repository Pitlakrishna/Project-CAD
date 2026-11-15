"""Specialized Word Document (.docx) Tool implementation."""

from src.tools.base import BaseTool
from src.tools.definitions.word_tool.prompt import WORD_TOOL_PROMPT
from src.tools.definitions.word_tool.schema import WordDocArgs


class WordDocumentTool(BaseTool):
    name = "generate_word_document"
    description = (
        "Generates a Microsoft Word (.docx) technical specification document with executive summary, "
        "hierarchical sections, technical tables, and verification sign-offs."
    )
    artifact_type = "docx"
    file_extension = ".docx"
    prompt_guidelines = WORD_TOOL_PROMPT
    args_schema = WordDocArgs
