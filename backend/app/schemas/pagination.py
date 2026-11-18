"""PaginationMeta — the shared envelope for paginated list responses.

Lives in its own leaf module (P3b) so ``app.schemas.counties`` and
``app.schemas.app_exports`` can both import it without a circular
import (counties is imported BY app_exports for the CountySummary
re-export).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PaginationMeta(BaseModel):
    """Standard pagination block returned by every list endpoint."""

    page: int = Field(..., ge=1, description="Current page (1-indexed)")
    page_size: int = Field(..., ge=1, description="Rows returned per page")
    total_rows: int = Field(..., ge=0, description="Total rows matching the filter")
    total_pages: int = Field(..., ge=0, description="Total pages at this page_size")
    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="The filters actually applied (echoed for the client).",
    )
