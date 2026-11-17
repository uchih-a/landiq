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
