"""Schemas for the P4b Deal Finder options + nearby endpoints.

- ``GET /api/v1/listings/options`` — every list + limit + availability
  flag the filters bar renders (the frontend never re-types a list).
- ``GET /api/v1/listings/{listing_no}/nearby`` — real nearest listings
  by haversine to a given listing.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ListingsPropertyType(BaseModel):
    """Canonical property type + its row count in the corpus."""

    name: str
    n: int = Field(..., ge=0)


class ListingsCountyOption(BaseModel):
    """Exact county name (the filter accepts this string verbatim) + count."""

    name: str
    n: int = Field(..., ge=0)


class VerdictOption(BaseModel):
    """One verdict + its data-derived definition.

    ``rule`` carries the REAL thresholds observed in the frame, so the UI
    can template "listed at least X% below predicted" without typing a
    percentage:

    - ``basis`` — "conformal_interval": the verdict reproduces the
      listed-price-vs-interval comparison (below low / within /
      above high) on every row where it could be checked.
    - ``match_rate`` — the share of rows where the comparison above
      reproduces the stored verdict (1.0 = exact).
    - ``under_ratio_max`` — the maximum listed_over_predicted ratio
      observed among underpriced rows (the empirical cut-off).
    - ``over_ratio_min`` — the minimum ratio among overpriced rows.
    - ``interval_low_ref`` / ``interval_high_ref`` — the frame column
      names the comparison uses (documented, not magic).
    """

    value: str
    label_key: str
    rule: VerdictRule


class VerdictRule(BaseModel):
    basis: str | None = Field(None, description="'conformal_interval' or None when unknown")
    match_rate: float | None = Field(
        None, description="Share of rows where the rule reproduces the stored verdict"
    )
    under_ratio_max: float | None = Field(
        None, description="Max listed_over_predicted among underpriced rows"
    )
    over_ratio_min: float | None = Field(
        None, description="Min listed_over_predicted among overpriced rows"
    )
    interval_low_ref: str | None = Field(
        None, description="Frame column used as the interval lower bound"
    )
    interval_high_ref: str | None = Field(
        None, description="Frame column used as the interval upper bound"
    )


class AmenityOption(BaseModel):
    value: str
    label_key: str


class SortKeyOption(BaseModel):
    value: str
    label_key: str
    default_order: str = Field(..., description="'asc' or 'desc'")


class ListingsOptionsResponse(BaseModel):
    """GET /api/v1/listings/options response."""

    property_types: list[ListingsPropertyType]
    unmapped_prop_type_rows: int = Field(
        ...,
        ge=0,
        description="Corpus rows whose prop_type is not canonical (never silently dropped)",
    )
    counties: list[ListingsCountyOption]
    verdicts: list[VerdictOption]
    amenities: list[AmenityOption]
    radii_km: list[int]
    amenity_filter_available: bool = Field(
        ...,
        description=(
            "False when the POI / roads spatial data is missing — the UI "
            "disables the amenity control with a reason instead of the "
            "filter failing with 503 at click time."
        ),
    )
    page_sizes: list[int]
    default_page_size: int
    max_page_size: int
    sort_keys: list[SortKeyOption]
    export_max_rows: int | None = Field(
        None,
        description=(
            "Server-side export row cap (from the LISTINGS_EXPORT_MAX_ROWS "
            "setting); null = uncapped."
        ),
    )


class NearbyListing(BaseModel):
    """One nearby listing (haversine-nearest, excluding the origin)."""

    listing_no: str | None
    latitude: float | None
    longitude: float | None
    verdict: str
    listed_price_per_acre_ksh: float
    distance_km: float


class NearbyListingsResponse(BaseModel):
    """GET /api/v1/listings/{listing_no}/nearby response."""

    listing_no: str
    radius_km: float
    reason: str | None = Field(
        None, description="'no_coordinates' when the origin listing lacks usable lat/lon"
    )
    nearby: list[NearbyListing]
    n_returned: int = Field(..., ge=0)


VerdictOption.model_rebuild()
