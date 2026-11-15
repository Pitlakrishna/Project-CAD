"""Specialized prompt guidelines for the Search Engineering Specs Tool."""

SEARCH_TOOL_PROMPT = """
Use `search_engineering_specs` to look up real-world standard dimensions, component datasheets, DIN/ISO standards, and port layouts when designing an object without explicit dimensions.
Syntax:
```tool:search_engineering_specs
{
  "query": "standard 15.6 inch laptop dimensions width depth thickness mm",
  "target_component": "laptop",
  "category": "dimensions"
}
```
"""
