"""Pydantic input schema for Word Document (.docx) tool."""

from typing import List, Optional
from pydantic import BaseModel, Field


class TableData(BaseModel):
    headers: List[str] = Field(default_factory=list, description="Column header strings")
    rows: List[List[str]] = Field(default_factory=list, description="2D cell matrix")


class DocumentTheme(BaseModel):
    primary: str = Field(default="#1E3A8A", description="Primary brand hex color")
    accent: str = Field(default="#2563EB", description="Secondary accent hex color")
    font: str = Field(default="Calibri", description="Font family name")


class Signoff(BaseModel):
    role: str = Field(..., description="Role e.g. 'Project Manager'")
    responsibility: Optional[str] = Field(None, description="Scope of sign-off")
    criteria: Optional[str] = Field(None, description="Acceptance criteria")
    status: str = Field(default="PENDING", description="'PENDING' | 'APPROVED'")


class DocumentSection(BaseModel):
    heading: str = Field(..., description="Section title")
    content: Optional[str] = Field(None, description="Detailed text body")
    bullets: Optional[List[str]] = Field(default_factory=list, description="Bullet items")
    table: Optional[TableData] = Field(None, description="Optional embedded data table")


class WordDocArgs(BaseModel):
    title: str = Field(..., description="Formal specification document title")
    doc_id: Optional[str] = Field(None, description="Tracking ID e.g. SPEC-2026-001")
    theme: Optional[DocumentTheme] = Field(default_factory=DocumentTheme, description="Color palette")
    image_query: Optional[str] = Field(None, description="Keywords for header image search")
    executive_summary: Optional[str] = Field(None, description="Executive summary")
    sections: List[DocumentSection] = Field(..., min_length=1, description="Sections with headings and text")
    signoffs: Optional[List[Signoff]] = Field(default_factory=list, description="Sign-off checklist")
