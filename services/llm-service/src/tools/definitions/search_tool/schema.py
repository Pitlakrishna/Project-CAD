"""Pydantic schema for the Search Engineering Specs Tool."""

from typing import Optional
from pydantic import BaseModel, Field


class SearchSpecsArgs(BaseModel):
    """Arguments for searching engineering specifications and standard dimensions."""

    query: str = Field(
        ...,
        description="Target search query (e.g. 'standard 15.6 inch laptop dimensions thickness width mm' or 'Raspberry Pi 4 mounting hole spacing mm')",
    )
    target_component: Optional[str] = Field(
        None,
        description="Name of the component or standard (e.g. 'laptop', 'Raspberry Pi 4', 'NEMA 17', 'M4 bolt')",
    )
    category: Optional[str] = Field(
        "dimensions",
        description="Type of specification: 'dimensions' | 'datasheet' | 'fasteners' | 'tolerances'",
    )
