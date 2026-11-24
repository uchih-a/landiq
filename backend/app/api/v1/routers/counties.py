"""Market Insights endpoints.

GET /api/v1/counties/summary
    Per-county aggregate stats from ``county_summary.csv`` (Cell 9.5) —
    listing count, median / Q1 / Q3 price per acre, mean log price,
    water-body share, small-n flag.  **This is the single source of truth
    for the ranked list and deep-dive cards' median/IQR figures** — the
    per-listing endpoint below does NOT recompute medians.

GET /api/v1/counties/boundaries
    Simplified GeoJSON of Kenya's 47 county boundaries (GADM Level 1,
    Cell 4.9's source, simplified via Douglas-Peucker for page-load
    rendering).  Returns the raw GeoJSON string cached at startup.

GET /api/v1/counties/{county}/listings
    Per-listing scatter-plot data for one county: price per acre, distance
    from Nairobi (recomputed from lat/lon via B1's haversine), size, verdict.
    Paginated.  Backed by ``listings_scored.parquet`` (Cell 9.6) — the only
    export that carries ``listed_price_per_acre_ksh`` + ``size_acres``
    together.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query, Request

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.schemas.app_exports import (
    CountySummaryResponse,
    CountySummaryRow,
    PaginationMeta,
)
from app.schemas.canonical import PROPERTY_TYPES
from app.schemas.counties import (
    CountyDistanceProfileResponse,
    CountyListingScatterRow,
    CountyListingsResponse,
    CountyRowCount,
    CountyRowCountsResponse,
    DistanceProfilePoint,
    DistanceProfileTrend,
    PriceBandEdge,
)
from app.services.county_summary import (
    canonical_prop_type_or_none,
    compute_price_bands,
    compute_property_type_counts,
    count_unmapped_prop_types,
    min_county_n_from_manifest,
    summarize_frame_by_county,
)
from app.services.geo_reference import compute_distances_to_nairobi
from app.services.overview import _SCATTER_SEED, _trend_block

router = APIRouter(tags=["market-insights"])
logger = get_logger("app.counties")

# Number of colour bands the choropleth legend renders (matches the
# five-step orange scale in the design).  UI/display constant — the band
# EDGES themselves are computed from the data (see county_summary).
N_PRICE_BANDS = 5


@router.get("/counties/summary", response_model=CountySummaryResponse)
async def county_summary(
    request: Request,
    prop_type: str | None = Query(
        None,
        description=(
            "Case-insensitive EXACT match against one of the canonical "
            "property types (Land, Farm, Commercial).  Unknown -> 422 "
            "with `allowed`.  When set, per-county aggregates are computed "
            "on the filtered rows of listings_scored.parquet."
        ),
    ),
) -> CountySummaryResponse:
    """One row per county (optionally filtered by prop_type), plus the
    canonical property-type list, data-driven price bands, and the
    min_county_n threshold from the artifact config.

    **Filtering:** when ``prop_type`` is set, the per-county aggregates
    are recomputed from the filtered ``listings_scored`` frame (the
    pre-aggregated ``county_summary.csv`` cannot be filtered).  The two
    paths agree on the shared columns; the frame path leaves
    ``water_body_distance_share`` null (that column is notebook-only).

    **Price bands (P3b):** the band edges are quintiles of the medians
    of the counties that meet ``min_county_n`` — equal county-frequency
    bands, recomputed when the filter changes so the legend always
    matches the map.
    """
    app_exports = request.app.state.app_exports
    canonical = canonical_prop_type_or_none(prop_type)
    if prop_type is not None and canonical is None:
        raise AppError(
            code="VALIDATION_ERROR",
            message=(
                f"prop_type must be one of {PROPERTY_TYPES} (case-insensitive "
                f"exact match), got {prop_type!r}."
            ),
            status_code=422,
            details={"allowed": PROPERTY_TYPES},
        )

    # ---- Shared corpus-level stats (property types, unmapped rows). ----
    # The scored frame is loaded LAZILY (only required when prop_type is
    # set — the filtered path needs it): on the unfiltered CSV path a
    # missing parquet degrades property_types to an empty list rather
    # than 500-ing the whole summary (backward compatibility with the
    # pre-P3b degraded behaviour, which 503'd on county_summary.csv).
    scored_df = getattr(app_exports, "listings_scored_df", None)
    if scored_df is None and canonical is not None:
        app_exports.require("listings_scored_df", "listings_scored.parquet")
        scored_df = app_exports.listings_scored_df
    if scored_df is not None:
        property_types = compute_property_type_counts(scored_df)
        unmapped = count_unmapped_prop_types(scored_df)
    else:
        property_types = []
        unmapped = 0

    # ---- Part B3: per-county suspect counts (best-effort).  The Locations
    #      tab's "share suspect" choropleth metric needs n_suspect per
    #      county.  The suspect gate is derived at serve time (never
    #      persisted); when the scored frame is unavailable the fields stay
    #      null (the UI renders "not available" rather than a 0 that implies
    #      "no suspects").  The prop_type filter is NOT applied here — the
    #      Locations tab shows the WHOLE county's suspect share, matching
    #      the n_listings it already shows (also unfiltered on the CSV path).
    suspect_by_county: dict[str, int] = {}
    scored_for_suspect = getattr(app_exports, "listings_scored_df", None)
    if scored_for_suspect is None:
        # Best-effort load: a missing parquet leaves suspect fields null
        # (the summary still serves from county_summary.csv).
        try:
            app_exports.require("listings_scored_df", "listings_scored.parquet")
            scored_for_suspect = app_exports.listings_scored_df
        except Exception:
            scored_for_suspect = None
    if scored_for_suspect is not None:
        from app.services.suspect_gate import compute_suspect_columns

        suspect_df = compute_suspect_columns(scored_for_suspect)
        if "county" in suspect_df.columns and "is_suspect" in suspect_df.columns:
            suspect_only = suspect_df[suspect_df["is_suspect"].fillna(False).astype(bool)]
            if len(suspect_only) > 0:
                counts = suspect_only.groupby("county").size()
                suspect_by_county = {str(k): int(v) for k, v in counts.items()}

    # ---- min_county_n from the manifest config (P3b fix: no typed-10
    #      fallback masking a missing artifact — null + data_quality). ----
    min_county_n = min_county_n_from_manifest(app_exports.manifest)
    data_quality = "min_county_n_missing" if min_county_n is None else None

    # ---- Per-county rows: CSV path (unfiltered) or frame path (filtered). ----
    def _suspect_fields(county_name: str, n_listings: int) -> dict:
        """Attach n_suspect + share_suspect when the scored frame loaded."""
        if scored_for_suspect is None:
            return {"n_suspect": None, "share_suspect": None}
        n_susp = int(suspect_by_county.get(county_name, 0))
        share = (n_susp / n_listings) if n_listings > 0 else None
        return {"n_suspect": n_susp, "share_suspect": share}

    if canonical is None:
        df = app_exports.require("county_summary_df", "county_summary.csv")
        rows = [
            CountySummaryRow(
                county=str(r["county"]),
                n_listings=int(r["n_listings"]),
                median_price_per_acre_ksh=float(r["median_price_per_acre_ksh"]),
                q1_price_per_acre_ksh=float(r["q1_price_per_acre_ksh"]),
                q3_price_per_acre_ksh=float(r["q3_price_per_acre_ksh"]),
                mean_log_price_per_acre=float(r["mean_log_price_per_acre"]),
                water_body_distance_share=_maybe_float(r["water_body_distance_share"]),
                n_below_min_county_n=(
                    None if min_county_n is None else bool(r["n_below_min_county_n"])
                ),
                **_suspect_fields(str(r["county"]), int(r["n_listings"])),
            )
            for _, r in df.iterrows()
        ]
    else:
        mask = scored_df["prop_type"].fillna("").str.lower() == canonical.lower()
        filtered = scored_df[mask]
        agg = summarize_frame_by_county(filtered, min_county_n)
        rows = [
            CountySummaryRow(
                county=str(r["county"]),
                n_listings=int(r["n_listings"]),
                median_price_per_acre_ksh=_maybe_float(r["median_price_per_acre_ksh"]),
                q1_price_per_acre_ksh=_maybe_float(r["q1_price_per_acre_ksh"]),
                q3_price_per_acre_ksh=_maybe_float(r["q3_price_per_acre_ksh"]),
                mean_log_price_per_acre=_maybe_float(r["mean_log_price_per_acre"]),
                water_body_distance_share=None,
                n_below_min_county_n=(
                    None if min_county_n is None else bool(r["n_below_min_county_n"])
                ),
                **_suspect_fields(str(r["county"]), int(r["n_listings"])),
            )
            for _, r in agg.iterrows()
        ]

    # ---- Price bands: quintiles of the medians of eligible counties. ----
    eligible_medians = [
        r.median_price_per_acre_ksh
        for r in rows
        if not r.n_below_min_county_n  # None (unknown threshold) -> excluded too
    ]
    bands, bands_reason = compute_price_bands(eligible_medians, N_PRICE_BANDS)

    # ---- County totals: from the boundaries service when loaded. ----
    boundaries = getattr(request.app.state, "county_boundaries_index", None)
    n_total = (
        int(getattr(boundaries, "n_counties", 0))
        if boundaries is not None and getattr(boundaries, "loaded", False)
        else None
    )

    return CountySummaryResponse(
        counties=rows,
        n_counties=len(rows),
        min_county_n=min_county_n,
        prop_type=canonical,
        property_types=property_types,
        price_bands=[
            PriceBandEdge(index=b["index"], lower=b["lower"], upper=b["upper"]) for b in bands
        ],
        bands_reason=bands_reason,
        data_quality=data_quality,
        n_counties_with_data=len(rows),
        n_counties_total=n_total,
        unmapped_prop_type_rows=unmapped,
    )


@router.get(
    "/counties/{county}/distance-profile",
    response_model=CountyDistanceProfileResponse,
)
async def county_distance_profile(
    request: Request,
    county: str,
    prop_type: str | None = Query(
        None,
        description=(
            "Case-insensitive EXACT canonical match (Land / Farm / Commercial). "
            "Unknown -> 422 with `allowed`."
        ),
    ),
    limit: int = Query(
        400,
        ge=1,
        le=1000,
        description="Cap on the deterministic scatter sample (default 400, max 1000).",
    ),
) -> CountyDistanceProfileResponse:
    """Whole-county distance profile (P3b): n, ranges, server-side OLS
    trend on log(price) vs distance-to-Nairobi, and a deterministic
    UNBIASED sample of the county's rows (never head()/first-N of a
    sorted frame — the frame is sorted most-underpriced-first, so a
    page-based sample would be biased).

    A county below ``min_county_n`` returns the data but sets
    ``low_support: true`` and omits the trend (null) so the UI can show a
    "limited data" note instead of a misleading line.
    """
    import numpy as np

    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    canonical = canonical_prop_type_or_none(prop_type)
    if prop_type is not None and canonical is None:
        raise AppError(
            code="VALIDATION_ERROR",
            message=(
                f"prop_type must be one of {PROPERTY_TYPES} (case-insensitive "
                f"exact match), got {prop_type!r}."
            ),
            status_code=422,
            details={"allowed": PROPERTY_TYPES},
        )

    settings = request.app.state.settings
    min_county_n = min_county_n_from_manifest(app_exports.manifest)

    county_mask = df["county"].fillna("") == county
    if int(county_mask.sum()) == 0:
        # Unknown county -> 422 with the allowed list (per the brief).
        allowed = sorted(str(v) for v in df["county"].dropna().unique().tolist())
        raise AppError(
            code="VALIDATION_ERROR",
            message=(f"county must match a county in the data (exact match), got {county!r}."),
            status_code=422,
            details={"allowed": allowed},
        )

    sub = df[county_mask]
    if canonical is not None:
        sub = sub[sub["prop_type"].fillna("").str.lower() == canonical.lower()]

    n = int(len(sub))
    low_support = bool(min_county_n is not None and n < min_county_n)

    lats = sub["latitude"].to_numpy(dtype=float)
    lons = sub["longitude"].to_numpy(dtype=float)
    dists = compute_distances_to_nairobi(lats, lons, settings.versioned_artifacts_dir)
    prices = sub["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    valid = np.isfinite(dists) & (dists >= 0) & np.isfinite(prices) & (prices > 0)

    distance_range = (
        [float(np.min(dists[valid])), float(np.max(dists[valid]))] if valid.any() else None
    )
    price_range = (
        [float(np.min(prices[valid])), float(np.max(prices[valid]))] if valid.any() else None
    )

    # Trend is omitted (null) when the county is low-support, per the brief.
    tb = None if low_support else _trend_block(prices, dists)
    trend = (
        DistanceProfileTrend(slope=tb.slope, intercept=tb.intercept, r2=tb.r2, n=tb.n)
        if tb is not None
        else None
    )

    # Deterministic unbiased sample: fixed seed + permutation of the row
    # indices (never head()/first-N of a sorted frame).  Rebuilt inline so
    # each point carries its prop_type (the shared helper's point type
    # doesn't include it).
    rng = np.random.default_rng(_SCATTER_SEED)
    perm = rng.permutation(n)
    take = min(limit, n)
    idx = perm[:take]
    sample_rows = sub.iloc[idx].reset_index(drop=True)
    sample_dists = dists[idx]
    sample: list[DistanceProfilePoint] = []
    for i, (_, r) in enumerate(sample_rows.iterrows()):
        price = r.get("listed_price_per_acre_ksh")
        try:
            price_f = float(price)
        except (TypeError, ValueError):
            continue
        if not np.isfinite(price_f) or price_f <= 0:
            continue
        sample.append(
            DistanceProfilePoint(
                listing_no=_maybe_str(r.get("listing_no")),
                distance_km=_maybe_float(sample_dists[i]),
                price_per_acre_ksh=price_f,
                verdict=_maybe_str(r.get("verdict")),
                prop_type=_maybe_str(r.get("prop_type")),
            )
        )

    return CountyDistanceProfileResponse(
        county=county,
        prop_type=canonical,
        n=n,
        low_support=low_support,
        min_county_n=min_county_n,
        distance_range_km=distance_range,
        price_range=price_range,
        trend=trend,
        sample=sample,
        n_total=n,
        n_returned=len(sample),
        sample_limit=limit,
    )


@router.get("/counties/boundaries")
async def county_boundaries(request: Request) -> Any:
    """Simplified GeoJSON of Kenya's 47 county boundaries for the choropleth.

    Returns the raw GeoJSON (cached at startup).  The GeoJSON is simplified
    via Douglas-Peucker (tolerance reported in the manifest) to keep the
    file light for page-load rendering.
    """
    boundaries = getattr(request.app.state, "county_boundaries_index", None)
    if boundaries is None or not boundaries.loaded:
        raise AppError(
            code="DATA_UNAVAILABLE",
            message=(
                "County boundaries GeoJSON is not loaded. Run "
                "scripts/download_county_boundaries.py to produce "
                "kenya_counties_simplified.geojson, then restart."
            ),
            status_code=503,
            details={"file": "kenya_counties_simplified.geojson"},
        )
    # Return the cached GeoJSON string as a raw JSON response (no re-serialisation)
    from fastapi.responses import JSONResponse

    return JSONResponse(
        content=boundaries.get_geojson_dict(),
        media_type="application/geo+json",
        headers={"Cache-Control": "public, max-age=86400"},  # cache for 1 day
    )


@router.get("/counties/row_counts", response_model=CountyRowCountsResponse)
async def county_row_counts(request: Request) -> CountyRowCountsResponse:
    """Per-county listing counts from ``listings_scored.parquet`` — for the
    scatter-plot tab's county picker + the "N listings" label.

    This does NOT return medians (those come from /counties/summary).  It
    only reports how many listings each county has in the per-listing
    endpoint's backing frame, so the frontend can warn when a county's
    coverage is thin.
    """
    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    counts = df["county"].fillna("(unknown)").value_counts()
    rows = [CountyRowCount(county=str(name), n_listings=int(n)) for name, n in counts.items()]
    return CountyRowCountsResponse(
        counties=rows,
        total_listings=int(len(df)),
        n_counties=len(rows),
    )


@router.get("/counties/{county}/listings", response_model=CountyListingsResponse)
async def county_listings(
    request: Request,
    county: str,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=200, description="Rows per page (default 50, max 200)"),
) -> CountyListingsResponse:
    """Per-listing scatter-plot data for one county.

    Returns ``price_per_acre_ksh``, ``dist_to_nairobi_km`` (recomputed from
    lat/lon via B1's haversine), ``size_acres``, and ``verdict`` for each
    listing in the county.  Backed by ``listings_scored.parquet`` (Cell 9.6)
    — the only export that carries ``listed_price_per_acre_ksh`` +
    ``size_acres`` together.  The prediction parquets (oof/test) lack
    ``size_acres`` and only carry ``y_true`` (log scale), not the asking
    price per acre.

    **Medians / IQR for the ranked list and deep-dive cards come from
    /counties/summary (county_summary.csv) — this endpoint does NOT
    recompute them.**
    """

    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    # Filter to the requested county (exact match — the path parameter is
    # case-sensitive; the frontend's county picker uses the names from
    # /counties/row_counts so the casing matches).
    mask = df["county"].fillna("") == county
    county_df = df[mask]

    total_rows = int(len(county_df))
    if total_rows == 0:
        # County not found — return an empty page (not an error; the county
        # may simply have no listings in the modelling frame).
        return CountyListingsResponse(
            county=county,
            pagination=PaginationMeta(
                page=page,
                page_size=page_size,
                total_rows=0,
                total_pages=0,
                filters={"county": county},
            ),
            listings=[],
        )

    # Recompute dist_to_nairobi_km from lat/lon — the column didn't survive
    # into listings_scored.parquet (Cell 9.6 only carries ID_COLUMNS + price
    # columns, not feature columns).  Uses the shared geo_reference helper
    # (Cell 4.2's haversine formula, same earth radius 6371.0 km, Nairobi
    # reference point read from scoring_params.json with the canonical
    # -1.2921 / 36.8219 fallback) so the result agrees with the Overview
    # endpoint's distance-band summary.
    settings = request.app.state.settings
    lats = county_df["latitude"].to_numpy(dtype=float)
    lons = county_df["longitude"].to_numpy(dtype=float)
    dists = compute_distances_to_nairobi(lats, lons, settings.versioned_artifacts_dir)

    # Sort by dist_to_nairobi_km ascending (the scatter plot's X axis) so
    # the first page shows the listings closest to Nairobi.
    sort_order = np.argsort(dists, kind="stable")
    county_df = county_df.iloc[sort_order].reset_index(drop=True)
    dists = dists[sort_order]

    # Paginate
    total_pages = int(math.ceil(total_rows / page_size)) if page_size else 0
    start = (page - 1) * page_size
    end = start + page_size
    page_df = county_df.iloc[start:end]
    page_dists = dists[start:end]

    rows = []
    for i, (_, r) in enumerate(page_df.iterrows()):
        rows.append(
            CountyListingScatterRow(
                listing_no=_maybe(r.get("listing_no")),
                title=_maybe(r.get("title")),
                latitude=_maybe(r.get("latitude")),
                longitude=_maybe(r.get("longitude")),
                listed_price_per_acre_ksh=float(r["listed_price_per_acre_ksh"]),
                dist_to_nairobi_km=(
                    round(float(page_dists[i]), 2) if np.isfinite(page_dists[i]) else None
                ),
                size_acres=float(r["size_acres"]),
                verdict=str(r["verdict"]),
                data_quality_flag=bool(r["data_quality_flag"]),
            )
        )

    return CountyListingsResponse(
        county=county,
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total_rows=total_rows,
            total_pages=total_pages,
            filters={"county": county},
        ),
        listings=rows,
    )


def _maybe(v: Any) -> Any:
    """NaN / pandas NA -> None for clean JSON."""
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


def _maybe_float(v: Any) -> float | None:
    """Coerce to a finite float or None (no NaN/inf in JSON)."""
    f = _maybe(v)
    if f is None:
        return None
    try:
        f = float(f)
    except (TypeError, ValueError):
        return None
    return f if np.isfinite(f) else None


def _maybe_str(v: Any) -> str | None:
    """Coerce to a trimmed string or None."""
    s = _maybe(v)
    if s is None:
        return None
    return str(s)
