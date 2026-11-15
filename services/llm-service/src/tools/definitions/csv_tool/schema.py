"""Pydantic input schema for CSV export tool."""


from pydantic import BaseModel, Field


class CsvExportArgs(BaseModel):
    title: str = Field(..., description="Export dataset title")
    headers: list[str] = Field(..., min_length=1, description="List of column names")
    rows: list[list[str]] = Field(..., min_length=1, description="2D list of row values")
