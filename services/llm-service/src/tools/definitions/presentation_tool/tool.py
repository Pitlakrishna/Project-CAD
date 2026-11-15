"""Specialized PowerPoint Presentation Tool implementation."""

from src.tools.base import BaseTool
from src.tools.definitions.presentation_tool.prompt import PRESENTATION_TOOL_PROMPT
from src.tools.definitions.presentation_tool.schema import PresentationArgs


class PresentationTool(BaseTool):
    name = "generate_presentation"
    description = (
        "Generates a multi-slide executive presentation (.pptx) covering technical CAD design, "
        "engineering specifications, structural analysis, and manufacturing milestones."
    )
    artifact_type = "pptx"
    file_extension = ".pptx"
    prompt_guidelines = PRESENTATION_TOOL_PROMPT
    args_schema = PresentationArgs
