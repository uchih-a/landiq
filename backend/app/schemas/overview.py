"""Schema for GET /api/v1/overview/summary (Overview build round).

A read-only summary over ``listings_scored.parquet`` — the DataFrame the
AppExportsRegistry already loads — giving the Overview page every number
it shows (totals, verdicts, by-property-type / by-size-band / by-distance-band
breakdowns, trend, deterministic scatter sample, county top-N + Others).

Field names below are what the frontend consumes verbatim — keep the
frontend ``OverviewSummaryResponse`` in ``frontend/src/lib/api/types.ts``
in sync.

Canonical lists (the ONLY constants the backend hard-codes for this domain)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
- ``PROPERTY_TYPES`` — ``["Land", "Farm", "Commercial"]`` (imported from
  ``app.schemas.canonical`` — the single source of truth shared with the
  Predict options endpoint).  The Overview filter, the Price-by-property-type
  card, and every future prop_type selector render only these.  If the
  loaded frame carries rows whose ``prop_type`` is not in this list, the
  response counts them under ``unmapped_prop_type_rows`` and never silently
  drops or relabels them.
- ``SIZE_BAND_EDGES_ACRES`` — ``[0, 1/8, 1/4, 1/2, 1, 5, 20, +inf]``.
- ``DISTANCE_BAND_EDGES_KM`` — ``[0, 25, 50, 100, 200, 400, +inf]``.

Both band sets are returned in the response so the frontend never
re-types the edges.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.canonical import PROPERTY_TYPES
from app.schemas.counties import PropertyTypeCount

# Re-export so existing imports from this module keep working.
__all__ = [
    "PROPERTY_TYPES",
    "SIZE_BAND_EDGES_ACRES",
    "DISTANCE_BAND_EDGES_KM",
    "PropertyTypeCount",
]

# ----------------------------------------------------------------------
# Canonical lists (single source of truth)
# ----------------------------------------------------------------------

#: Size-band edges (acres).  Bands are [lower, upper) for every edge
#: except the final one which is [lower, +inf].  Matches the design's
#: 1/8, 1/4, 1/2, 1, 5, 20+ acre breakpoints — with a separate 5-20 ac
#: band so the design's two right-most vertex labels ("5 Ac" and "20+ Ac")
#: each map to a distinct band.  Labels below are human-readable; the
#: raw edges are returned in the response so the frontend never re-types them.
SIZE_BAND_EDGES_ACRES: list[float] = [0.0, 0.125, 0.25, 0.5, 1.0, 5.0, 20.0, float("inf")]

#: Distance-band edges (km).  Matches the design's 0-25, 25-50, 50-100,
#: 100-200, 200-400, 400+ km axis labels.
DISTANCE_BAND_EDGES_KM: list[float] = [0.0, 25.0, 50.0, 100.0, 200.0, 400.0, float("inf")]


# ----------------------------------------------------------------------
# Sub-blocks
# ----------------------------------------------------------------------


class FiltersBlock(BaseModel):
    """Echo of the applied county / prop_type filters, plus the canonical
    property-type list with the per-type row count under the CURRENT
    county filter so the Overview dropdown can be rendered from data."""

    county: str | None = Field(None, description="Applied county filter (case-insensitive match)")
    prop_type: str | None = Field(None, description="Applied property-type filter (canonical)")
    property_types: list[PropertyTypeCount] = Field(
        ...,
        description="Canonical property types with per-type row counts under the current county filter",
    )


# (PropertyTypeCount is imported from app.schemas.counties — single source
#  of truth.  Previously this module re-declared a duplicate class, which
#  caused pydantic v2 to emit TWO schema entries with non-deterministic
#  short vs. long names depending on import order, flaking the snapshot
#  test.)


class TotalsBlock(BaseModel):
    """Aggregate counters + median/IQR for the filtered selection."""

    n_listings: int = Field(..., ge=0, description="Usable rows after filters")
    n_flagged: int = Field(..., ge=0, description="Rows with data_quality_flag=true")
    median_price_per_acre_ksh: float | None = Field(
        None, description="Median listed_price_per_acre_ksh across the filtered selection"
    )
    q1_price_per_acre_ksh: float | None = Field(
        None, description="25th percentile of listed_price_per_acre_ksh"
    )
    q3_price_per_acre_ksh: float | None = Field(
        None, description="75th percentile of listed_price_per_acre_ksh"
    )
    n_counties_with_data: int = Field(
        ..., ge=0, description="Distinct counties in the filtered selection"
    )
    n_counties_meeting_threshold: int = Field(
        ...,
        ge=0,
        description=(
            "Distinct counties in the filtered selection with n_listings >= "
            "the coverage min_county_n from /meta's coverage rules."
        ),
    )


class VerdictsBlock(BaseModel):
    """Counts + shares of the stored ``verdict`` column (Underpriced /
    Fair / Overpriced).  Shares are computed from the filtered usable
    rows and sum (with n_unknown) to n_listings."""

    underpriced: int = Field(..., ge=0)
    fair: int = Field(..., ge=0)
    overpriced: int = Field(..., ge=0)
    n_unknown: int = Field(
        ..., ge=0, description="Rows whose verdict is not one of the three known values"
    )
    underpriced_share: float | None = Field(
        None, description="underpriced / n_listings (null when n_listings=0)"
    )
    fair_share: float | None = Field(None, description="fair / n_listings")
    overpriced_share: float | None = Field(None, description="overpriced / n_listings")
    n_listings: int = Field(
        ..., ge=0, description="Filtered usable row count (shares are over this)"
    )
    n_suspect: int = Field(
        0,
        ge=0,
        description=(
            "Part B suspect-listing gate.  Suspects (listed_over_predicted "
            "outside [0.05, 20.0] or non-finite size) are reported here "
            "SEPARATELY and EXCLUDED from the underpriced/fair/overpriced "
            "counts above.  Shares stay over n_listings (the full filtered "
            "usable count)."
        ),
    )


class PropertyTypeStat(BaseModel):
    """One bar in the Price-by-property-type card.  ``n`` may be 0 (the
    frontend renders an empty/muted bar, never a zero-height bar that
    reads as a price)."""

    name: str
    n: int = Field(..., ge=0)
    median_price_per_acre_ksh: float | None = Field(
        None, description="Null when n=0 (no data for this type)"
    )
    q1_price_per_acre_ksh: float | None = None
    q3_price_per_acre_ksh: float | None = None


class ByPropertyTypeBlock(BaseModel):
    """The three canonical type bars + the leader summary that feeds the
    footer line ``<Leader> leads premium by +X%``."""

    types: list[PropertyTypeStat] = Field(
        ..., description="One row per canonical type, in PROPERTY_TYPES order"
    )
    leader: str | None = Field(
        None,
        description=(
            "Canonical type with the highest median.  Null when fewer than 2 "
            "types have data (no comparison possible)."
        ),
    )
    leader_premium_pct: float | None = Field(
        None,
        description=(
            "(leader_median - median_of_all_other_types_with_data) / "
            "median_of_all_other_types_with_data * 100, rounded to 1 decimal. "
            "Positive means the leader is more expensive per acre than the "
            "combined median of the other types with data.  Null when fewer "
            "than 2 types have data."
        ),
    )


class SizeBand(BaseModel):
    """One vertex on the Price-by-size-band line chart."""

    label: str = Field(..., description="Human label, e.g. '<1/8 ac', '20+ ac'")
    lower_acres: float = Field(..., description="Lower edge (acres)")
    upper_acres: float | None = Field(
        None,
        description=(
            "Upper edge (acres); ``null`` for the final open-ended band "
            "(the '+inf' tail).  JSON-serialisable alternative to +inf."
        ),
    )
    n: int = Field(..., ge=0)
    median_price_per_acre_ksh: float | None = Field(
        None, description="Null when n=0 or low_support and no median can be computed"
    )
    low_support: bool = Field(
        ...,
        description=(
            "True when n < the coverage min_county_n (the same threshold /meta "
            "reports).  The frontend draws low-support bands hollow with a "
            "tooltip rather than hiding them."
        ),
    )


class BySizeBandBlock(BaseModel):
    """The size-band series for the filtered selection (county-filtered if
    a county is selected, otherwise national) plus, when a county is
    selected, a ``comparison`` series for the national view so the chart
    can draw both lines."""

    bands: list[SizeBand]
    comparison: list[SizeBand] | None = Field(
        None,
        description=(
            "National series for the same bands, only present when a county "
            "filter is applied (so the chart can draw the dashed benchmark)."
        ),
    )
    bulk_discount_pct: float | None = Field(
        None,
        description=(
            "Percentage drop in median per acre from the smallest populated "
            "band to the largest populated band: "
            "(smallest_median - largest_median) / smallest_median * 100, "
            "rounded to 1 decimal.  Null when fewer than 2 bands have a "
            "median (i.e. fewer than 2 populated bands)."
        ),
    )


class DistanceBand(BaseModel):
    """One corridor on the Price-by-distance-from-Nairobi band overlay."""

    label: str = Field(..., description="Human label, e.g. '0-25 km', '400+ km'")
    lower_km: float = Field(..., description="Lower edge (km)")
    upper_km: float | None = Field(
        None,
        description=("Upper edge (km); ``null`` for the final open-ended band ('400+ km')."),
    )
    n: int = Field(..., ge=0)
    median_price_per_acre_ksh: float | None = None
    q1_price_per_acre_ksh: float | None = None
    q3_price_per_acre_ksh: float | None = None
    low_support: bool


class ByDistanceBandBlock(BaseModel):
    """Per-band median + IQR for the filtered selection, used by the chart's
    band overlay + the pinned tooltip card."""

    bands: list[DistanceBand]


class TrendBlock(BaseModel):
    """Log-linear fit of price per acre against distance over ALL filtered
    rows (so the chart's trend line does not depend on the scatter sample).

    Model: ``log(price) = slope * distance_km + intercept``.  ``r2`` is the
    coefficient of determination of the fit (1.0 = perfect, 0.0 = no
    linear relationship, negative = worse than predicting the mean)."""

    slope: float | None = Field(None, description="Slope (per km).  Null when < 2 rows.")
    intercept: float | None = Field(
        None, description="log(price) at distance=0.  Null when < 2 rows."
    )
    r2: float | None = Field(None, description="Coefficient of determination.  Null when < 2 rows.")
    n: int = Field(..., ge=0, description="Rows used in the fit")


class ScatterPoint(BaseModel):
    """One point in the deterministic scatter sample."""

    listing_no: str | None = None
    county: str | None = None
    distance_km: float | None = Field(None, description="NaN-coalesced to null")
    price_per_acre_ksh: float
    verdict: str | None = None


class ScatterSampleBlock(BaseModel):
    """Deterministic, UNBIASED random sample of the filtered selection."""

    points: list[ScatterPoint]
    n_total: int = Field(..., ge=0, description="Total filtered rows the sample was drawn from")
    n_returned: int = Field(
        ..., ge=0, description="Rows actually returned (min(sample_limit, n_total))"
    )
    sample_limit: int = Field(
        ..., ge=0, description="The cap applied (query param scatter_limit, default 400, max 1000)"
    )


class CountyStat(BaseModel):
    """One named county row in the top-N list."""

    county: str
    n: int = Field(..., ge=0)
    median_price_per_acre_ksh: float | None = None


class OthersBlock(BaseModel):
    """The combined ``Others`` entry: every county below the top-N cutoff
    rolled together so the honeycomb legend can render one summary row."""

    counties: list[str] = Field(..., description="Names of the counties rolled into 'Others'")
    n: int = Field(..., ge=0, description="Combined listing count")
    median_price_per_acre_ksh: float | None = Field(
        None, description="Median of per-acre prices across all 'Others' rows"
    )


class CountiesBlock(BaseModel):
    """Top-N counties by listing count + the combined ``Others`` entry."""

    top: list[CountyStat]
    others: OthersBlock
    top_n: int = Field(..., ge=1, description="The N used (query param top_n_counties, default 3)")


class OverviewSummaryResponse(BaseModel):
    """GET /api/v1/overview/summary response."""

    model_config = ConfigDict(protected_namespaces=())

    # ---- Echo of inputs + canonical lists ----
    filters: FiltersBlock
    property_types_canonical: list[str] = Field(
        ..., description="The canonical property-type list (so the frontend never re-types it)"
    )
    size_band_edges_acres: list[float | None] = Field(
        ...,
        description=(
            "Canonical size-band edges (lower edges).  The final edge is "
            "``null`` rather than ``+inf`` so the value is JSON-serialisable; "
            "the corresponding label ('20+ ac') communicates the open tail."
        ),
    )
    size_band_labels: list[str] = Field(..., description="Human labels for the size bands")
    distance_band_edges_km: list[float | None] = Field(
        ...,
        description=(
            "Canonical distance-band edges (lower edges).  The final edge is "
            "``null`` rather than ``+inf``; the corresponding label ('400+ km') "
            "communicates the open tail."
        ),
    )
    distance_band_labels: list[str] = Field(..., description="Human labels for the distance bands")
    unmapped_prop_type_rows: int = Field(
        ...,
        ge=0,
        description=(
            "Rows whose prop_type is not in PROPERTY_TYPES.  These are NOT "
            "silently dropped or relabelled — the count is surfaced here and "
            "logged so the operator can decide to map, exclude, or fix upstream."
        ),
    )

    # ---- Computed blocks ----
    totals: TotalsBlock
    national: TotalsBlock = Field(
        ..., description="Unfiltered totals (always national, regardless of filters)"
    )
    n_counties_total: int = Field(
        ...,
        ge=0,
        description=(
            "Total county count, from the county boundaries service (or the "
            "summary fallback when boundaries are not loaded).  Never a literal."
        ),
    )
    verdicts: VerdictsBlock
    by_property_type: ByPropertyTypeBlock
    by_size_band: BySizeBandBlock
    by_distance_band: ByDistanceBandBlock
    trend: TrendBlock
    scatter_sample: ScatterSampleBlock
    counties: CountiesBlock
    generated_from: str | None = Field(
        None, description="Data date (same source /meta uses; null when artifacts are missing)"
    )


# Forward refs (FiltersBlock references PropertyTypeCount via string)
FiltersBlock.model_rebuild()
