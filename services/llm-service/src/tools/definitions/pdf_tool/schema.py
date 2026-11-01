"""Pydantic input schema for Engineering PDF Report tool."""

from typing import List, Optional
from pydantic import BaseModel, Field


class TableData(BaseModel):
    headers: List[str] = Field(default_factory=list, description="Column names")
    rows: List[List[str]] = Field(default_factory=list, description="Data row cells")


class DocumentTheme(BaseModel):
    primary: str = Field(default="#1E3A8A", description="Primary brand hex color")
    accent: str = Field(default="#2563EB", description="Secondary accent hex color")
    font: str = Field(default="Helvetica", description="Base font family")


class Signoff(BaseModel):
    role: str = Field(..., description="Role e.g. 'Lead CAD Engineer', 'Quality Assurance'")
    responsibility: Optional[str] = Field(None, description="Scope of review")
    criteria: Optional[str] = Field(None, description="Acceptance criteria")
    status: str = Field(default="PENDING", description="'PENDING' | 'APPROVED'")


class DocumentSection(BaseModel):
    heading: str = Field(..., description="Section title")
    content: Optional[str] = Field(None, description="Narrative paragraph text")
    bullets: Optional[List[str]] = Field(default_factory=list, description="Technical bullet points")
    table: Optional[TableData] = Field(None, description="Data table for this section")


class PdfReportArgs(BaseModel):
    title: str = Field(..., description="Formal technical document title")
    doc_id: Optional[str] = Field(None, description="Document tracking ID e.g. DOC-CAD-2026-001")
    theme: Optional[DocumentTheme] = Field(default_factory=DocumentTheme, description="Color palette")
    image_query: Optional[str] = Field(None, description="Keywords for blueprint or schematic images")
    executive_summary: Optional[str] = Field(None, description="Executive engineering summary")
    sections: List[DocumentSection] = Field(..., min_length=1, description="Structured document sections")
    signoffs: Optional[List[Signoff]] = Field(default_factory=list, description="Engineering sign-off matrix")
