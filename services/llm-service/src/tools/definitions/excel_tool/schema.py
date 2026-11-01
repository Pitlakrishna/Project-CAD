"""Pydantic input schema for Excel Spreadsheet (.xlsx) tool."""

from typing import List, Optional
from pydantic import BaseModel, Field


class DocumentTheme(BaseModel):
    primary: str = Field(default="#047857", description="Primary brand hex color (e.g. green for Excel)")
    accent: str = Field(default="#10B981", description="Secondary accent hex color")
    font: str = Field(default="Segoe UI", description="Font family name")


class SpreadsheetSheet(BaseModel):
    name: str = Field(..., description="Worksheet tab name, e.g. 'Bill of Materials'")
    columns: List[str] = Field(..., min_length=1, description="List of column header titles")
    rows: List[List[str]] = Field(..., min_length=1, description="2D matrix of cell values as strings or numbers")


class ExcelSheetArgs(BaseModel):
    title: str = Field(..., description="Workbook title")
    theme: Optional[DocumentTheme] = Field(default_factory=DocumentTheme, description="Color styling")
    sheets: List[SpreadsheetSheet] = Field(..., min_length=1, description="One or more worksheets")
