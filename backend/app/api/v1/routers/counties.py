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
from app.schemas.counties import (
    CountyListingScatterRow,
    CountyListingsResponse,
    CountyRowCount,
    CountyRowCountsResponse,
)

router = APIRouter(tags=["market-insights"])
logger = get_logger("app.counties")

# Nairobi CBD reference point — same as B1's scoring_params.json:nairobi_reference_point
# (lat -1.2921, lon 36.8219).  Using the same point keeps the recomputed
# dist_to_nairobi_km consistent with the model's dist_to_nairobi_km feature.
NAIROBI_LAT = -1.2921
NAIROBI_LON = 36.8219


@router.get("/counties/summary", response_model=CountySummaryResponse)
async def county_summary(request: Request) -> CountySummaryResponse:
    """One row per county, sorted by listing count descending (Cell 9.5).

    **This is the single source of truth for medians / IQR** — the per-listing
    endpoint does NOT recompute them, to avoid two sources of truth drifting apart.
    """
    app_exports = request.app.state.app_exports
    df = app_exports.require("county_summary_df", "county_summary.csv")

    # CONFIG.MIN_COUNTY_N from the manifest (Cell 9.7's config block).
    min_county_n = 10
    if app_exports.manifest:
        min_county_n = int(app_exports.manifest.get("config", {}).get("MIN_COUNTY_N", min_county_n))

    rows = [
        CountySummaryRow(
            county=str(r["county"]),
            n_listings=int(r["n_listings"]),
            median_price_per_acre_ksh=float(r["median_price_per_acre_ksh"]),
            q1_price_per_acre_ksh=float(r["q1_price_per_acre_ksh"]),
            q3_price_per_acre_ksh=float(r["q3_price_per_acre_ksh"]),
            mean_log_price_per_acre=float(r["mean_log_price_per_acre"]),
            water_body_distance_share=float(r["water_body_distance_share"]),
            n_below_min_county_n=bool(r["n_below_min_county_n"]),
        )
        for _, r in df.iterrows()
    ]
    return CountySummaryResponse(counties=rows, n_counties=len(rows), min_county_n=min_county_n)


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
    from landval.features.geo import haversine_km_vectorised

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
    # columns, not feature columns).  Uses B1's haversine_km_vectorised
    # (Cell 4.2's formula, same earth radius 6371.0 km).
    lats = county_df["latitude"].to_numpy(dtype=float)
    lons = county_df["longitude"].to_numpy(dtype=float)
    valid = np.isfinite(lats) & np.isfinite(lons)
    dists = np.full(len(county_df), np.nan, dtype=float)
    if valid.any():
        dists[valid] = haversine_km_vectorised(lats[valid], lons[valid], NAIROBI_LAT, NAIROBI_LON)

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
