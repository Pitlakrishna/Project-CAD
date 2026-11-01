"""Pydantic input schema for CSV export tool."""

from typing import List
from pydantic import BaseModel, Field


class CsvExportArgs(BaseModel):
    title: str = Field(..., description="Export dataset title")
    headers: List[str] = Field(..., min_length=1, description="List of column names")
    rows: List[List[str]] = Field(..., min_length=1, description="2D list of row values")
