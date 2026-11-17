"""Schemas for the county boundaries + per-listing scatter endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.app_exports import PaginationMeta


class CountyRowCount(BaseModel):
    """One row of GET /api/v1/counties/row_counts — county name + listing count."""

    county: str
    n_listings: int


class CountyRowCountsResponse(BaseModel):
    """GET /api/v1/counties/row_counts response."""

    counties: list[CountyRowCount]
    total_listings: int
    n_counties: int


class CountyListingScatterRow(BaseModel):
    """One row of GET /api/v1/counties/{county}/listings — the scatter-plot fields.

    ``listed_price_per_acre_ksh`` and ``size_acres`` come directly from
    ``listings_scored.parquet`` (Cell 9.6).  ``dist_to_nairobi_km`` is
    recomputed from the stored lat/lon via B1's haversine — the raw column
    didn't survive into the export (Cell 9.6 only carries ID_COLUMNS +
    price columns, not feature columns).
    """

    listing_no: str | None
    title: str | None
    latitude: float | None
    longitude: float | None
    listed_price_per_acre_ksh: float
    dist_to_nairobi_km: float | None = Field(
        None,
        description=(
            "Haversine distance to Nairobi CBD (recomputed from lat/lon via "
            "B1's haversine_km_vectorised — Cell 4.2's formula, same earth "
            "radius 6371.0 km).  Null when the listing's coordinates are missing."
        ),
    )
    size_acres: float
    verdict: str = Field(..., description="'underpriced' / 'fair' / 'overpriced'")
    data_quality_flag: bool


class CountyListingsResponse(BaseModel):
    """GET /api/v1/counties/{county}/listings response — paginated per-listing data."""

    county: str
    pagination: PaginationMeta
    listings: list[CountyListingScatterRow]
