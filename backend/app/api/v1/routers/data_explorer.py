"""Data Explorer endpoints — read-only summaries over ``listings_scored.parquet``.

GET /api/v1/data/price-distribution
    Log-scale histogram bins + percentile set (p1/p10/p50/p90/p99) of the
    usable per-acre asking prices, plus the corpus counters the Data
    Explorer stat tiles need (``n_usable``, ``n_flagged``).

GET /api/v1/data/price-by-group
    Per-group (prop_type or size-band) price-per-acre summary: n, median,
    p10, p90 of listed price/acre + median predicted price/acre.  Groups
    with n < ``MIN_GROUP_N`` return null stats + ``insufficient=True``.

GET /api/v1/data/relationships
    size_acres vs listed price/acre: Spearman rho over the full usable
    frame, median price/acre per log-size decile, and a deterministic
    uniform random sample of ``RELATIONSHIPS_SAMPLE_N`` rows.

This endpoint family exists so the Data Explorer's "Prices", "Table" and
"Relationships" tabs do not have to paginate through ``/listings/scored``
client-side — the backend already holds the whole frame in memory and the
summaries are a handful of vectorised pandas calls.  It adds no new state
and writes nothing.

``flag_definition`` (P7b) serves the flagged-listing percentile window
from the canonical constants so the UI never re-types "1st–99th".

The raw pre-cleaning "observed corpus" count is deliberately NOT exposed:
that number does not exist anywhere the backend loads (the parquet holds
only the usable modelling rows), so the frontend marks that tile
unavailable rather than this endpoint inventing a value.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query, Request

from app.schemas.canonical import (
    FLAG_LOWER_PCT,
    FLAG_UPPER_PCT,
    MIN_GROUP_N,
    PROPERTY_TYPES,
    RELATIONSHIPS_SAMPLE_N,
    RELATIONSHIPS_SAMPLE_SEED,
    SIZE_BANDS_ACRES,
    SIZE_BAND_LABELS,
)
from app.schemas.data_explorer import (
    FlagDefinition,
    PriceBin,
    PriceByGroupResponse,
    PriceByGroupRow,
    PriceDistributionResponse,
    PricePercentiles,
    RelationshipsDecilePoint,
    RelationshipsResponse,
    RelationshipsSamplePoint,
)
from app.services.suspect_gate import compute_suspect_columns

router = APIRouter(tags=["data"])

# Number of log-spaced bins between the clean floor/ceiling of the price
# range.  The web design renders ~23 bars over a 300k→100M axis, so 24
# bins gives the same visual density without tuning per breakpoint.
N_BINS = 24


@router.get("/data/price-distribution", response_model=PriceDistributionResponse)
async def price_distribution(request: Request) -> PriceDistributionResponse:
    """Log-scale price histogram + percentiles over the usable listings.

    ``flag_definition`` (P7b) carries the flagged-listing rule (the
    percentile window from the canonical constants) so the frontend can
    explain what "flagged as possible errors" means without typing
    "1st–99th".
    """
    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    prices = df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    # Only finite, strictly-positive prices can sit on a log axis.
    usable = prices[np.isfinite(prices) & (prices > 0)]

    n_flagged = int(df["data_quality_flag"].fillna(False).astype(bool).sum())
    n_usable = int(len(usable))

    flag_definition = FlagDefinition(lower_pct=FLAG_LOWER_PCT, upper_pct=FLAG_UPPER_PCT)

    if n_usable == 0:
        # Degenerate but honest: an empty histogram rather than a 503 — the
        # file loaded, it simply has no usable prices.
        return PriceDistributionResponse(
            n_bins=0,
            bins=[],
            percentiles=PricePercentiles(p1=0.0, p10=0.0, p50=0.0, p90=0.0, p99=0.0),
            n_usable=0,
            n_flagged=n_flagged,
            flag_definition=flag_definition,
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
        flag_definition=flag_definition,
    )


# ----------------------------------------------------------------------
# Part B1 — GET /api/v1/data/price-by-group
# ----------------------------------------------------------------------


def _usable_frame(df: pd.DataFrame, include_suspect: bool) -> pd.DataFrame:
    """The usable frame: finite, strictly-positive listed price/acre, with
    the Part B suspect gate derived at serve time (never persisted).

    Suspects are excluded unless ``include_suspect`` is true — the same rule
    the Deal Finder's corpus counts use, so the two views agree on what
    counts as a "real" listing.
    """
    frame = compute_suspect_columns(df)
    price = frame["listed_price_per_acre_ksh"]
    mask = np.isfinite(price) & (price.to_numpy(dtype=float) > 0)
    if not include_suspect:
        mask &= ~frame["is_suspect"].fillna(False).astype(bool).to_numpy()
    return frame[mask]


@router.get("/data/price-by-group", response_model=PriceByGroupResponse)
async def price_by_group(
    request: Request,
    group: str = Query(
        ...,
        description="Group dimension: 'prop_type' or 'size_band'",
    ),
    include_suspect: bool = Query(
        False,
        description="Include suspect listings (default: exclude, as the Deal Finder corpus does)",
    ),
) -> PriceByGroupResponse:
    """Per-group price-per-acre summary over the usable frame.

    Groups come from the canonical ``PROPERTY_TYPES`` list
    (``group=prop_type``) or the canonical ``SIZE_BANDS_ACRES`` edges
    (``group=size_band``) — the router never invents a group.  Groups with
    fewer than ``MIN_GROUP_N`` usable listings return null stats and
    ``insufficient=True`` (an honest "not enough data" rather than a noisy
    median on two rows); ``n`` is always the real count.
    """
    if group not in {"prop_type", "size_band"}:
        from app.core.exceptions import AppError

        raise AppError(
            code="VALIDATION_ERROR",
            message=f"group must be 'prop_type' or 'size_band', got {group!r}",
            status_code=422,
            details={"allowed": ["prop_type", "size_band"]},
        )

    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")
    usable = _usable_frame(df, include_suspect)

    rows: list[PriceByGroupRow] = []
    if group == "prop_type":
        # Canonical order (Land, Farm, Commercial); an unmapped prop_type
        # is counted under its raw value AFTER the canonical three, so the
        # UI can surface "other" rows without the router inventing a label.
        canonical = list(PROPERTY_TYPES)
        present = [str(v) for v in usable["prop_type"].dropna().unique().tolist()]
        extras = sorted(p for p in present if p not in canonical)
        order = canonical + extras
        for pt in order:
            sub = usable[usable["prop_type"].fillna("").astype(str) == pt]
            rows.append(_group_row(pt, sub))
    else:  # size_band
        # Edges from the canonical constant; labels are i18n keys the
        # frontend renders (the router never types a band label).
        for i in range(len(SIZE_BANDS_ACRES) - 1):
            lo = float(SIZE_BANDS_ACRES[i])
            hi = float(SIZE_BANDS_ACRES[i + 1])
            sizes = usable["size_acres"]
            sub = usable[(sizes >= lo) & (sizes < hi)]
            rows.append(_group_row(SIZE_BAND_LABELS[i], sub))

    return PriceByGroupResponse(
        group=group,
        include_suspect=include_suspect,
        n_usable=int(len(usable)),
        min_group_n=MIN_GROUP_N,
        bands=rows,
    )


def _group_row(label: str, sub: pd.DataFrame) -> PriceByGroupRow:
    """Build one PriceByGroupRow from a group's usable sub-frame."""
    n = int(len(sub))
    if n < MIN_GROUP_N:
        return PriceByGroupRow(group=label, n=n, insufficient=True)
    listed = sub["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    predicted = sub.get("predicted_price_per_acre_ksh")
    med_listed = float(np.median(listed))
    p10 = float(np.percentile(listed, 10))
    p90 = float(np.percentile(listed, 90))
    med_pred = (
        float(np.nanmedian(predicted.to_numpy(dtype=float)))
        if predicted is not None
        else None
    )
    # Never serialise NaN/inf — a non-finite predicted median becomes null.
    if med_pred is not None and not np.isfinite(med_pred):
        med_pred = None
    return PriceByGroupRow(
        group=label,
        n=n,
        insufficient=False,
        median_listed_per_acre_ksh=med_listed,
        p10_listed_per_acre_ksh=p10,
        p90_listed_per_acre_ksh=p90,
        median_predicted_per_acre_ksh=med_pred,
    )


# ----------------------------------------------------------------------
# Part B2 — GET /api/v1/data/relationships
# ----------------------------------------------------------------------


@router.get("/data/relationships", response_model=RelationshipsResponse)
async def relationships(request: Request) -> RelationshipsResponse:
    """size_acres vs listed price/acre over the usable frame.

    Returns:

    - ``spearman_rho`` — ``df.corr(method='spearman')`` over the FULL
      usable frame (not the sample);
    - ``deciles`` — 10 equal-count log-size bins of the usable frame, each
      with its median listed price/acre + count;
    - ``sample`` — a DETERMINISTIC uniform random sample of
      ``RELATIONSHIPS_SAMPLE_N`` usable rows (seeded; never top-N or
      first-N) carrying listing_no, size_acres, listed_price_per_acre_ksh,
      is_suspect, data_quality_flag.

    Usable = finite size_acres AND finite, strictly-positive listed
    price/acre.  Suspects are INCLUDED (the scatter's "hide suspect" toggle
    is a client-side filter; the backend returns the full picture so the
    toggle can show/hide without a refetch).
    """
    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")
    frame = compute_suspect_columns(df)
    n_total = int(len(frame))

    price = frame["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    size = frame["size_acres"].to_numpy(dtype=float)
    usable_mask = np.isfinite(price) & (price > 0) & np.isfinite(size)
    usable = frame[usable_mask]
    n_usable = int(len(usable))

    # ---- Spearman rho over the full usable frame ----
    if n_usable >= 2:
        rho = float(
            usable[["size_acres", "listed_price_per_acre_ksh"]]
            .corr(method="spearman")
            .iloc[0, 1]
        )
        if not np.isfinite(rho):
            rho = None
    else:
        rho = None

    # ---- Deciles by log-size (equal-count, 1=smallest) ----
    deciles: list[RelationshipsDecilePoint] = []
    if n_usable > 0:
        log_size = np.log(usable["size_acres"].to_numpy(dtype=float))
        # np.quantile gives the 10 decile cut-points (0.1..0.9); np.digitize
        # bins every row into 1..10.  Equal-count by construction.
        cuts = np.quantile(log_size, np.arange(1, 10) / 10.0)
        bins = np.digitize(log_size, cuts, right=False) + 1  # 1..10
        for d in range(1, 11):
            sub = usable[bins == d]
            n_d = int(len(sub))
            if n_d == 0:
                deciles.append(RelationshipsDecilePoint(decile=d, n=0))
            else:
                deciles.append(
                    RelationshipsDecilePoint(
                        decile=d,
                        n=n_d,
                        median_listed_per_acre_ksh=float(
                            np.median(sub["listed_price_per_acre_ksh"].to_numpy(dtype=float))
                        ),
                        median_size_acres=float(
                            np.median(sub["size_acres"].to_numpy(dtype=float))
                        ),
                    )
                )

    # ---- Deterministic uniform sample ----
    if n_usable > 0:
        rng = np.random.default_rng(RELATIONSHIPS_SAMPLE_SEED)
        take = min(RELATIONSHIPS_SAMPLE_N, n_usable)
        # A full permutation then take the first `take` is a uniform random
        # sample without replacement (NOT top-N by any column).
        perm = rng.permutation(n_usable)[:take]
        sampled = usable.iloc[perm]
        sample = [
            RelationshipsSamplePoint(
                listing_no=(None if pd.isna(r.get("listing_no")) else str(r.get("listing_no"))),
                size_acres=float(r["size_acres"]),
                listed_price_per_acre_ksh=float(r["listed_price_per_acre_ksh"]),
                is_suspect=bool(r.get("is_suspect") or False),
                data_quality_flag=bool(r.get("data_quality_flag") or False),
            )
            for _, r in sampled.iterrows()
        ]
    else:
        sample = []

    return RelationshipsResponse(
        n_usable=n_usable,
        n_total=n_total,
        spearman_rho=rho,
        deciles=deciles,
        sample=sample,
        sample_n=len(sample),
        sample_seed=RELATIONSHIPS_SAMPLE_SEED,
        min_group_n=MIN_GROUP_N,
    )
