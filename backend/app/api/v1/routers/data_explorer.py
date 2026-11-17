"""Data Explorer endpoint — read-only summary over ``listings_scored.parquet``.

GET /api/v1/data/price-distribution
    Log-scale histogram bins + percentile set (p1/p10/p50/p90/p99) of the
    usable per-acre asking prices, plus the corpus counters the Data
    Explorer stat tiles need (``n_usable``, ``n_flagged``).

This endpoint exists so the Data Explorer's "Price per acre distribution"
card does not have to paginate through ``/listings/scored`` to build a
histogram client-side — the backend already holds the whole frame in
memory and the summary is a handful of vectorised pandas calls.  It adds
no new state and writes nothing.

The raw pre-cleaning "observed corpus" count is deliberately NOT exposed:
that number does not exist anywhere the backend loads (the parquet holds
only the usable modelling rows), so the frontend marks that tile
unavailable rather than this endpoint inventing a value.
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Request

from app.schemas.data_explorer import (
    PriceBin,
    PriceDistributionResponse,
    PricePercentiles,
)

router = APIRouter(tags=["data"])

# Number of log-spaced bins between the clean floor/ceiling of the price
# range.  The web design renders ~23 bars over a 300k→100M axis, so 24
# bins gives the same visual density without tuning per breakpoint.
N_BINS = 24


@router.get("/data/price-distribution", response_model=PriceDistributionResponse)
async def price_distribution(request: Request) -> PriceDistributionResponse:
    """Log-scale price histogram + percentiles over the usable listings."""
    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    prices = df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    # Only finite, strictly-positive prices can sit on a log axis.
    usable = prices[np.isfinite(prices) & (prices > 0)]

    n_flagged = int(df["data_quality_flag"].fillna(False).astype(bool).sum())
    n_usable = int(len(usable))

    if n_usable == 0:
        # Degenerate but honest: an empty histogram rather than a 503 — the
        # file loaded, it simply has no usable prices.
        return PriceDistributionResponse(
            n_bins=0,
            bins=[],
            percentiles=PricePercentiles(p1=0.0, p10=0.0, p50=0.0, p90=0.0, p99=0.0),
            n_usable=0,
            n_flagged=n_flagged,
        )

    pct = np.percentile(usable, [1, 10, 50, 90, 99])
    p1, p10, p50, p90, p99 = (float(v) for v in pct)

    # Bin over the log10 range clipped to the 0.5th-99.5th percentile so a
    # single extreme tail listing doesn't stretch the axis (the design's
    # axis runs 300k→100M with the tails visually de-emphasised).
    lo = float(np.percentile(usable, 0.5))
    hi = float(np.percentile(usable, 99.5))
    if hi <= lo:
        # All prices equal — one bin covering everything.
        hi = lo * 1.0000001 if lo > 0 else 1.0

    edges = np.logspace(np.log10(lo), np.log10(hi), N_BINS + 1)
    counts, _ = np.histogram(usable, bins=edges)
    # Clamp both tails so every usable price is counted even when the
    # percentile clipping puts the extreme min/max outside the bin range:
    # values below the first edge join the first bin, values above the last
    # edge join the last bin.
    counts[0] += int(np.sum(usable < edges[0]))
    counts[-1] += int(np.sum(usable > edges[-1]))

    bins = [
        PriceBin(lower_ksh=float(edges[i]), upper_ksh=float(edges[i + 1]), count=int(counts[i]))
        for i in range(N_BINS)
    ]

    return PriceDistributionResponse(
        n_bins=N_BINS,
        bins=bins,
        percentiles=PricePercentiles(p1=p1, p10=p10, p50=p50, p90=p90, p99=p99),
        n_usable=n_usable,
        n_flagged=n_flagged,
    )
