"""Pydantic input schema for PowerPoint Presentation (.pptx) tool."""

from typing import List, Optional
from pydantic import BaseModel, Field


class TableData(BaseModel):
    headers: List[str] = Field(default_factory=list, description="Column header strings")
    rows: List[List[str]] = Field(default_factory=list, description="2D matrix of cell values")


class DocumentTheme(BaseModel):
    primary: str = Field(default="#0F172A", description="Primary background / headline color (hex)")
    accent: str = Field(default="#2563EB", description="Secondary accent color (hex)")
    font: str = Field(default="Arial", description="Font family name")


class PresentationSlide(BaseModel):
    title: str = Field(..., description="Slide title headline")
    bullets: Optional[List[str]] = Field(default_factory=list, description="3-5 detailed bullet points")
    table: Optional[TableData] = Field(None, description="Optional engineering data table")
    notes: Optional[str] = Field(None, description="Speaker notes for executive briefing")


class PresentationArgs(BaseModel):
    title: str = Field(..., description="Executive deck title")
    theme: Optional[DocumentTheme] = Field(default_factory=DocumentTheme, description="Color palette")
    image_query: Optional[str] = Field(None, description="Keywords for visual diagram search")
    slides: List[PresentationSlide] = Field(..., min_length=1, description="Sequential slide definitions")
