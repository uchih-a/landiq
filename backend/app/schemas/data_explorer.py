"""Schema for GET /api/v1/data/price-distribution (P-fidelity Data Explorer round).

A read-only summary over ``listings_scored.parquet`` — the DataFrame the
AppExportsRegistry already loads.  The endpoint computes the log-scale
histogram bins and percentile set the Data Explorer's "Price per acre
distribution" card renders, plus the two corpus counters the stat tiles
need (usable rows and data-quality-flagged rows).

Field names below are what the frontend consumes verbatim — keep the
frontend ``PriceDistributionResponse`` in
``frontend/src/lib/api/types.ts`` in sync.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.health import FlagDefinition

__all__ = [
    "FlagDefinition",
    "PriceBin",
    "PricePercentiles",
    "PriceDistributionResponse",
    "PriceByGroupRow",
    "PriceByGroupResponse",
    "RelationshipsDecilePoint",
    "RelationshipsSamplePoint",
    "RelationshipsResponse",
]


class PriceBin(BaseModel):
    """One histogram bin on the log10 price axis.

    ``lower_ksh`` / ``upper_ksh`` are the bin edges in KSh per acre
    (inclusive-exclusive, except the final bin which includes its upper
    edge).  ``count`` is the number of usable listings in the bin.
    """

    lower_ksh: float = Field(..., description="Bin lower edge (KSh per acre)")
    upper_ksh: float = Field(..., description="Bin upper edge (KSh per acre)")
    count: int = Field(..., ge=0, description="Usable listings in this bin")


class PricePercentiles(BaseModel):
    """Percentile set of the usable per-acre asking prices (KSh).

    Web shows p1 / p50 / p99; mobile m12 shows p10 / p50 / p90 — both come
    from this single block so the two breakpoints never disagree.
    """

    p1: float = Field(..., description="1st percentile (KSh per acre)")
    p10: float = Field(..., description="10th percentile (KSh per acre)")
    p50: float = Field(..., description="Median (KSh per acre)")
    p90: float = Field(..., description="90th percentile (KSh per acre)")
    p99: float = Field(..., description="99th percentile (KSh per acre)")


class PriceDistributionResponse(BaseModel):
    """GET /api/v1/data/price-distribution response.

    ``n_usable`` powers the Modeling Yield tile; ``n_flagged`` (rows whose
    ``data_quality_flag`` is true) powers the Sanitization tile.  The raw
    pre-cleaning "observed corpus" count is NOT here — that number does not
    exist anywhere the backend loads; the frontend marks that tile
    unavailable.

    ``flag_definition`` (P7b) carries the flagged-listing percentile window
    (from the canonical constants) so the UI can explain the flag without
    typing "1st–99th".
    """

    n_bins: int = Field(..., description="Number of histogram bins returned")
    bins: list[PriceBin] = Field(..., description="Log-spaced histogram bins")
    percentiles: PricePercentiles
    n_usable: int = Field(
        ..., description="Usable listings (rows in listings_scored with a finite per-acre price)"
    )
    n_flagged: int = Field(
        ..., description="Listings flagged by data_quality_flag (excluded from training)"
    )
    flag_definition: FlagDefinition | None = Field(
        None,
        description=(
            "The flag rule (percentile window) from the canonical constants — "
            "always served by the router; nullable for schema-level backward "
            "compatibility."
        ),
    )


# ----------------------------------------------------------------------
# Part B1 — GET /api/v1/data/price-by-group
# ----------------------------------------------------------------------


class PriceByGroupRow(BaseModel):
    """One group's price-per-acre summary.

    ``insufficient`` is true (and every stat null) when the group has fewer
    than ``MIN_GROUP_N`` usable listings — a noisy median on two rows is
    worse than an honest "not enough data".  ``n`` is always the real count
    (even when insufficient) so the UI can show "n=3, not enough data".
    """

    group: str = Field(..., description="Group label (prop_type value or size-band label key)")
    n: int = Field(..., ge=0, description="Usable listings in this group")
    insufficient: bool = Field(
        ..., description="True when n < MIN_GROUP_N (stats are null)"
    )
    median_listed_per_acre_ksh: float | None = Field(
        None, description="Median listed price per acre (KSh); null when insufficient"
    )
    p10_listed_per_acre_ksh: float | None = Field(
        None, description="10th percentile of listed price per acre (KSh); null when insufficient"
    )
    p90_listed_per_acre_ksh: float | None = Field(
        None, description="90th percentile of listed price per acre (KSh); null when insufficient"
    )
    median_predicted_per_acre_ksh: float | None = Field(
        None,
        description="Median predicted price per acre (KSh); null when insufficient",
    )


class PriceByGroupResponse(BaseModel):
    """GET /api/v1/data/price-by-group response.

    Usable = finite, strictly-positive ``listed_price_per_acre_ksh`` (and
    not ``is_suspect`` unless ``include_suspect=true``).  The groups come
    from the canonical ``PROPERTY_TYPES`` list (``group=prop_type``) or the
    canonical ``SIZE_BANDS_ACRES`` edges (``group=size_band``) — never
    invented in the router.  ``min_group_n`` echoes the canonical threshold
    so the UI never re-types it.
    """

    group: str = Field(..., description="The group dimension requested")
    include_suspect: bool
    n_usable: int = Field(..., description="Total usable rows the groups were built from")
    min_group_n: int = Field(..., description="MIN_GROUP_N from canonical.py")
    bands: list[PriceByGroupRow] = Field(..., description="One row per canonical group, in canonical order")


# ----------------------------------------------------------------------
# Part B2 — GET /api/v1/data/relationships
# ----------------------------------------------------------------------


class RelationshipsDecilePoint(BaseModel):
    """Median listed price/acre for one log-size decile of the usable frame."""

    decile: int = Field(..., ge=1, le=10, description="Decile index 1..10 (1 = smallest log-size)")
    n: int = Field(..., ge=0, description="Usable rows in this decile")
    median_listed_per_acre_ksh: float | None = Field(
        None, description="Median listed price/acre (KSh); null when n=0"
    )
    median_size_acres: float | None = Field(
        None, description="Median size (acres) in this decile; null when n=0"
    )


class RelationshipsSamplePoint(BaseModel):
    """One row of the deterministic uniform sample.

    ``data_quality_flag`` is the parquet's flag (the 1st-99th percentile
    trim); ``is_suspect`` is the Part B gate.  Both are surfaced so the UI's
    "hide suspect" toggle and the flag styling both work off the sample.
    """

    listing_no: str | None
    size_acres: float
    listed_price_per_acre_ksh: float
    is_suspect: bool
    data_quality_flag: bool


class RelationshipsResponse(BaseModel):
    """GET /api/v1/data/relationships response.

    ``spearman_rho`` is computed over the FULL usable frame (not the
    sample) with ``df.corr(method='spearman')``.  ``deciles`` split the
    usable frame into 10 equal-count log-size bins and give each decile's
    median price/acre + count.  ``sample`` is a deterministic uniform
    random draw of ``RELATIONSHIPS_SAMPLE_N`` rows (seeded) — never top-N
    or first-N — so the scatter is unbiased and reproducible.
    """

    n_usable: int = Field(..., description="Usable rows (finite size + finite positive price)")
    n_total: int = Field(..., description="Total rows in the frame (before the usable filter)")
    spearman_rho: float | None = Field(
        None,
        description="Spearman rho of size_acres vs listed_price_per_acre_ksh over the full usable frame; null when <2 usable rows",
    )
    deciles: list[RelationshipsDecilePoint]
    sample: list[RelationshipsSamplePoint]
    sample_n: int = Field(..., description="Rows actually returned (min(RELATIONSHIPS_SAMPLE_N, n_usable))")
    sample_seed: int = Field(..., description="The deterministic seed (RELATIONSHIPS_SAMPLE_SEED)")
    min_group_n: int = Field(..., description="MIN_GROUP_N from canonical.py (echoed for the UI)")
