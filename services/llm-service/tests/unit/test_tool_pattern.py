"""Unit tests for the Specialized Multi-Tool Pattern."""

import pytest
from pydantic import ValidationError
from src.tools.base import BaseTool, ToolCallResult
from src.tools.registry import ToolRegistry, tool_registry


def test_registry_has_all_specialized_tools():
    """Verify all 5 commercial tools are registered by default."""
    tools = tool_registry.list_tools()
    tool_names = {t.name for t in tools}
    expected = {
        "generate_word_document",
        "generate_excel_sheet",
        "generate_presentation",
        "generate_pdf_report",
        "generate_csv_export",
    }
    assert expected.issubset(tool_names)


def test_gemini_declarations_generation():
    """Verify Gemini function declarations are valid and include parameter schemas."""
    declarations = tool_registry.get_gemini_declarations()
    assert len(declarations) >= 5
    for decl in declarations:
        assert "name" in decl
        assert "description" in decl
        assert "parameters" in decl
        assert decl["parameters"]["type"] == "OBJECT"
        assert "properties" in decl["parameters"]


def test_openai_tools_generation():
    """Verify OpenAI tool specifications are valid."""
    tools = tool_registry.get_openai_tools()
    assert len(tools) >= 5
    for t in tools:
        assert t["type"] == "function"
        assert "function" in t
        assert "name" in t["function"]
        assert "parameters" in t["function"]


def test_presentation_tool_validation_success():
    """Verify presentation tool validates slide requirements."""
    tool = tool_registry.get_tool("generate_presentation")
    assert tool is not None

    payload = {
        "title": "Titanium Drone Arm Stress Analysis",
        "slides": [
            {
                "title": "1.0 Design Context",
                "bullets": ["Lightweight aerostructure", "Operating limit: 120°C"],
                "notes": "Speaker notes for slide 1",
            },
            {
                "title": "2.0 FEA Results",
                "bullets": ["Von Mises stress: 180 MPa", "Factor of safety: 3.2"],
            },
        ],
    }

    result = tool.execute(**payload)
    assert isinstance(result, ToolCallResult)
    assert result.tool_name == "generate_presentation"
    assert result.artifact_type == "pptx"
    assert result.filename == "Titanium_Drone_Arm_Stress_Analysis.pptx"
    assert len(result.data["slides"]) == 2


def test_presentation_tool_validation_failure():
    """Verify Pydantic validation rejects malformed payloads."""
    tool = tool_registry.get_tool("generate_presentation")
    assert tool is not None

    # Missing mandatory 'slides' field
    with pytest.raises(ValidationError):
        tool.execute(title="Broken Deck")


def test_extract_tool_fences_pipeline():
    """Verify extraction and validation of markdown tool fences."""
    raw_llm_text = """
Here is the engineering design report:

```tool:generate_pdf_report
{
    "title": "Hydraulic Actuator Specification",
    "doc_id": "DOC-HYD-2026",
    "sections": [
        {
            "heading": "1.0 Operating Envelope",
            "content": "Piston displacement rated for 150 bar.",
            "bullets": ["Stroke: 250 mm", "Bore: 80 mm"]
        }
    ]
}
```

Let me know if you need any adjustments.
"""
    results = tool_registry.extract_tool_calls(raw_llm_text)
    assert len(results) == 1
    assert results[0].tool_name == "generate_pdf_report"
    assert results[0].artifact_type == "pdf"
    assert results[0].filename == "Hydraulic_Actuator_Specification.pdf"
    assert results[0].data["doc_id"] == "DOC-HYD-2026"


def test_legacy_tag_fallback():
    """Verify backward compatibility with legacy XML <file_artifact> tags."""
    legacy_text = """
<file_artifact filename="BOM.xlsx" type="xlsx" title="Bill of Materials">
{
    "title": "Bill of Materials",
    "sheets": [
        {
            "name": "BOM",
            "columns": ["Part", "Qty"],
            "rows": [["Bracket", "4"]]
        }
    ]
}
</file_artifact>
"""
    results = tool_registry.extract_tool_calls(legacy_text)
    assert len(results) == 1
    assert results[0].tool_name == "generate_excel_sheet"
    assert results[0].artifact_type == "xlsx"
    assert results[0].filename == "BOM.xlsx"


def test_search_engineering_specs_tool():
    """Verify search_engineering_specs tool is registered, valid, and extracts from fenced blocks."""
    tool = tool_registry.get_tool("search_engineering_specs")
    assert tool is not None
    assert tool.name == "search_engineering_specs"

    raw_text = """
I am researching standard laptop dimensions:
```tool:search_engineering_specs
{
    "query": "standard 15.6 inch laptop dimensions thickness width mm",
    "target_component": "laptop"
}
```
"""
    results = tool_registry.extract_tool_calls(raw_text)
    assert len(results) == 1
    assert results[0].tool_name == "search_engineering_specs"
    assert results[0].artifact_type == "specs"
    assert "laptop" in results[0].data["query"]

    # Verify direct execution with kwargs and dictionary
    direct_res = tool.execute(query="Raspberry Pi 4", target_component="rpi4")
    assert isinstance(direct_res, ToolCallResult)
    assert direct_res.tool_name == "search_engineering_specs"
    assert direct_res.data["query"] == "Raspberry Pi 4"

    dict_res = tool.execute({"query": "NEMA 17", "category": "dimensions"})
    assert isinstance(dict_res, ToolCallResult)
    assert dict_res.data["query"] == "NEMA 17"


@pytest.mark.asyncio
async def test_engineering_spec_search_executor():
    """Verify EngineeringSpecSearchExecutor retrieves real-world standard dimensions."""
    from src.tools.definitions.search_tool.executor import EngineeringSpecSearchExecutor

    laptop_res = await EngineeringSpecSearchExecutor.search("15 inch laptop", "laptop")
    assert laptop_res["status"] == "success"
    assert "standard_envelope" in laptop_res
    assert laptop_res["standard_envelope"]["width"] >= 300.0

    rpi_res = await EngineeringSpecSearchExecutor.search("Raspberry Pi 4 mounting holes")
    assert rpi_res["status"] == "success"
    assert "specifications" in rpi_res
    assert "mounting_holes" in rpi_res["specifications"]

