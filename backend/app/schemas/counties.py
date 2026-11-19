"""Schemas for the county boundaries + per-listing scatter endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.pagination import PaginationMeta


class CountyRowCount(BaseModel):
    """One row of GET /api/v1/counties/row_counts — county name + listing count."""

    county: str
    n_listings: int


class CountyRowCountsResponse(BaseModel):
    """GET /api/v1/counties/row_counts response."""

    counties: list[CountyRowCount]
    total_listings: int
    n_counties: int


class PropertyTypeCount(BaseModel):
    """One canonical property type + its row count in the corpus (the
    dropdown options render from this — the frontend never re-types the
    list)."""

    name: str
    n: int = Field(..., ge=0)


class PriceBandEdge(BaseModel):
    """One colour band edge, computed as a quantile of the county medians
    (P3b: bands are DATA, not typed thresholds).

    ``index`` maps to the frontend's single colour-token map (band 0 =
    palest … band N-1 = darkest).  ``upper`` is null for the final open
    band (``>= lower``).
    """

    index: int = Field(..., ge=0, description="Band index (0 = lowest price band)")
    lower: float = Field(..., description="Lower median edge (KSh per acre)")
    upper: float | None = Field(
        None, description="Upper median edge; null = open top band (>= lower)"
    )


class CountySummaryRow(BaseModel):
    """One county's aggregate row (CSV path or frame path).

    ``water_body_distance_share`` is only populated on the unfiltered
    CSV path (the notebook's column); the frame path leaves it null.
    ``n_below_min_county_n`` is null when the threshold itself is
    unavailable (see CountySummaryResponse.data_quality).  The price
    fields are null when the county has no usable rows under the
    current filter (never a fabricated 0).
    """

    county: str
    n_listings: int
    median_price_per_acre_ksh: float | None = None
    q1_price_per_acre_ksh: float | None = None
    q3_price_per_acre_ksh: float | None = None
    mean_log_price_per_acre: float | None = None
    water_body_distance_share: float | None = None
    n_below_min_county_n: bool | None = None


class CountySummaryResponse(BaseModel):
    """Response for GET /api/v1/counties/summary.

    P3b additions (all additive / nullable):
    - ``prop_type`` — echo of the applied canonical filter.
    - ``property_types`` — canonical list with corpus-level counts.
    - ``price_bands`` + ``bands_reason`` — the colour-band edges as data
      (quintiles of the county medians of min_county_n-eligible
      counties).  ``price_bands`` is empty and ``bands_reason`` explains
      why when there are fewer eligible counties than bands.
    - ``min_county_n`` — from the manifest config; null (with
      ``data_quality="min_county_n_missing"``) when the config lacks it.
    - ``n_counties_with_data`` / ``n_counties_total`` — from the
      boundaries service (not a literal).
    - ``unmapped_prop_type_rows`` — corpus rows whose prop_type is not
      canonical (never silently dropped).
    """

    counties: list[CountySummaryRow]
    n_counties: int
    min_county_n: int | None = Field(
        None, description="CONFIG.MIN_COUNTY_N from the manifest; null when missing"
    )
    prop_type: str | None = None
    property_types: list[PropertyTypeCount] = []
    price_bands: list[PriceBandEdge] = []
    bands_reason: str | None = None
    data_quality: str | None = None
    n_counties_with_data: int | None = None
    n_counties_total: int | None = None
    unmapped_prop_type_rows: int | None = None


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


# ----------------------------------------------------------------------
# GET /api/v1/counties/{county}/distance-profile (P3b)
# ----------------------------------------------------------------------


class DistanceProfileTrend(BaseModel):
    """Server-side OLS fit of log(price per acre) on distance-to-Nairobi,
    over ALL rows of the county (not a page)."""

    slope: float | None = Field(None, description="Slope per km; null when <2 rows")
    intercept: float | None = Field(None, description="log(price) at distance 0")
    r2: float | None = Field(None, description="Coefficient of determination")
    n: int = Field(..., ge=0, description="Rows used in the fit")


class DistanceProfilePoint(BaseModel):
    """One point of the deterministic unbiased sample."""

    listing_no: str | None
    distance_km: float | None
    price_per_acre_ksh: float
    verdict: str | None
    prop_type: str | None


class CountyDistanceProfileResponse(BaseModel):
    """GET /api/v1/counties/{county}/distance-profile response.

    ``low_support`` is true when the county is below min_county_n — the
    rows/sample are still returned but ``trend`` is omitted (null) so
    the UI can show a "limited data" note instead of a misleading line.
    """

    county: str
    prop_type: str | None = None
    n: int = Field(..., ge=0, description="Total rows in the county (after filter)")
    low_support: bool = Field(..., description="True when n < min_county_n")
    min_county_n: int | None = None
    distance_range_km: list[float] | None = Field(
        None, description="[min, max] distance-to-Nairobi over the county's rows"
    )
    price_range: list[float] | None = Field(
        None, description="[min, max] listed price per acre (KSh)"
    )
    trend: DistanceProfileTrend | None = None
    sample: list[DistanceProfilePoint]
    n_total: int = Field(..., ge=0, description="Total rows the sample was drawn from")
    n_returned: int = Field(..., ge=0, description="Rows actually returned")
    sample_limit: int = Field(..., ge=0, description="The cap applied")
