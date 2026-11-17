"""Deal Finder endpoint — serves ``listings_scored.parquet`` (Cell 9.6).

GET /api/v1/listings/scored
    Paginated + filtered listing rows.  Every modelling listing carries the
    identifier columns, the size, the listed / predicted / low / high
    per-acre prices, the listed-over-predicted ratio, the scored-by tag
    (``oof`` for development rows — predicted by models that never trained
    on the row; ``test`` for test rows — predicted by the
    development-fitted models), the verdict (``underpriced`` /
    ``overpriced`` / ``fair``) and a data-quality flag.

Query parameters
----------------
page, page_size
    Standard pagination (1-indexed page).  Default page=1, page_size=50;
    page_size capped at 200 to keep response bodies bounded.
county
    Filter by county (case-insensitive substring match against the stored
    value, so ``Nairobi`` matches ``nairobi``).
prop_type
    Filter by property type (case-insensitive substring match).
verdict
    Filter by verdict — one of ``underpriced``, ``fair``, ``overpriced``.
scored_by
    Filter by scored-by — one of ``oof``, ``test``.
data_quality_flag
    When ``true``, return only rows whose log price per acre is outside the
    development target's 1st-99th percentile window.  When ``false``, return
    only clean rows.  When absent, return both.
near_amenity
    Filter to listings within ``radius_km`` of a chosen amenity type —
    one of ``school``, ``hospital``, ``tarmac_road``.  The per-listing raw
    distance is recomputed from the stored lat/lon via B1's
    ``AmenitiesCalculator`` / ``AccessibilityCalculator`` BallTrees (the
    raw ``dist_to_*_km`` columns did not survive into the export — see
    ``backend/app/services/amenity_proximity.py``).  Returns 503
    ``AMENITY_FILTER_UNAVAILABLE`` when the POI / roads GPKG file is
    missing or the amenity isn't configured in ``scoring_params.json``.
radius_km
    The radius for the ``near_amenity`` filter — one of ``1``, ``3``, ``5``.
    Ignored when ``near_amenity`` is absent.
sort
    Sort key — one of ``listed_price_per_acre_ksh``, ``predicted_price_per_acre_ksh``,
    ``listed_over_predicted``, ``size_acres`` (default ``listed_over_predicted``
    ascending — most underpriced first).

DB-vs-in-memory decision
------------------------
``listings_scored.parquet`` is the modelling frame — Cell 9.7's manifest
reports its row count.  At the dataset's current size (~1k–10k rows × 19
columns) an in-memory pandas DataFrame is ~1–5 MB and filters in
microseconds; no database or external index is warranted.  If the dataset
ever grows past ~100k rows or accumulates per-listing text columns (full
descriptions), switch to DuckDB over the parquet file (zero-server,
columnar, still file-backed) before introducing a managed DB.
"""

from __future__ import annotations

import math
from typing import Any, Literal

import pandas as pd
from fastapi import APIRouter, Query, Request

from app.core.exceptions import AppError
from app.schemas.app_exports import (
    ListingsScoredResponse,
    ListingsScoredRow,
    PaginationMeta,
)

router = APIRouter(tags=["deal-finder"])

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

# Whitelisted sort keys -> (column, ascending-default) — Cell 9.6's columns.
_SORT_KEYS = {
    "listed_over_predicted": ("listed_over_predicted", True),  # underpriced first
    "listed_price_per_acre_ksh": ("listed_price_per_acre_ksh", True),
    "predicted_price_per_acre_ksh": ("predicted_price_per_acre_ksh", True),
    "size_acres": ("size_acres", False),  # largest first
}

# User-facing amenity enum — mirrors AmenityProximityService.SUPPORTED_AMENITIES.
# Inlined as a Literal in the Query annotation below (rather than a type alias)
# because ruff's B008 check flags Query() in argument defaults when the type
# annotation is a complex alias — the existing params (verdict, scored_by) use
# the same Query-in-default pattern with plain types and aren't flagged.
_ALLOWED_RADIUS_KM = (1, 3, 5)


@router.get("/listings/scored", response_model=ListingsScoredResponse)
async def listings_scored(
    request: Request,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Rows per page"),
    county: str | None = Query(None, description="Case-insensitive substring filter"),
    prop_type: str | None = Query(None, description="Case-insensitive substring filter"),
    verdict: str | None = Query(
        None,
        description="One of 'underpriced', 'fair', 'overpriced'",
    ),
    scored_by: str | None = Query(None, description="One of 'oof' (development) or 'test'"),
    data_quality_flag: bool | None = Query(
        None,
        description=(
            "true = only flagged rows (outside the dev 1st-99th percentile); "
            "false = only clean rows; absent = both."
        ),
    ),
    near_amenity: Literal["school", "hospital", "tarmac_road"] | None = Query(  # noqa: B008
        None,
        description=(
            "Filter to listings within radius_km of an amenity — one of "
            "'school', 'hospital', 'tarmac_road'.  Recomputes the per-listing "
            "distance from stored lat/lon via B1's BallTrees (raw distances "
            "did not survive into listings_scored.parquet)."
        ),
    ),
    radius_km: int | None = Query(
        None,
        description="Radius (km) for the near_amenity filter — one of 1, 3, 5.",
    ),
    sort: str = Query(
        "listed_over_predicted",
        description=(
            "Sort key: 'listed_over_predicted' (default, ascending — most "
            "underpriced first), 'listed_price_per_acre_ksh', "
            "'predicted_price_per_acre_ksh', 'size_acres'."
        ),
    ),
) -> ListingsScoredResponse:
    """Paginated + filtered Deal Finder table."""
    # ---- Validate near_amenity / radius_km up front (before the data load)
    # so a malformed amenity filter returns 422, not 503 DATA_UNAVAILABLE
    # when the parquet happens to be missing. ----
    if radius_km is not None and radius_km not in _ALLOWED_RADIUS_KM:
        raise AppError(
            code="VALIDATION_ERROR",
            message=(f"radius_km must be one of {list(_ALLOWED_RADIUS_KM)}, " f"got {radius_km!r}"),
            status_code=422,
            details={"allowed": list(_ALLOWED_RADIUS_KM)},
        )
    # near_amenity without radius_km (or vice versa) is a usage error — the
    # filter needs both to be meaningful.
    if (near_amenity is None) != (radius_km is None):
        raise AppError(
            code="VALIDATION_ERROR",
            message=(
                "near_amenity and radius_km must be supplied together — "
                "one without the other is meaningless."
            ),
            status_code=422,
            details={"near_amenity": near_amenity, "radius_km": radius_km},
        )

    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    # ---- Validate the other enum-like filters ----
    if verdict is not None and verdict not in {"underpriced", "fair", "overpriced"}:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"verdict must be one of underpriced/fair/overpriced, got {verdict!r}",
            status_code=422,
            details={"allowed": ["underpriced", "fair", "overpriced"]},
        )
    if scored_by is not None and scored_by not in {"oof", "test"}:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"scored_by must be one of oof/test, got {scored_by!r}",
            status_code=422,
            details={"allowed": ["oof", "test"]},
        )
    if sort not in _SORT_KEYS:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"sort must be one of {sorted(_SORT_KEYS)}, got {sort!r}",
            status_code=422,
            details={"allowed": sorted(_SORT_KEYS)},
        )

    # ---- Apply amenity-proximity filter first (it narrows the row set
    # before the cheaper column-level filters run, and it is the only
    # filter that can fail with 503 when the spatial data is absent). ----
    filters: dict[str, Any] = {}
    if near_amenity is not None and radius_km is not None:
        amenity_svc = getattr(request.app.state, "amenity_proximity_service", None)
        if amenity_svc is None:
            raise AppError(
                code="AMENITY_FILTER_UNAVAILABLE",
                message=(
                    "The amenity-proximity filter is not available — the "
                    "feature pipeline (which loads the POI / roads spatial "
                    "indexes) is not initialised. Copy kenya_pois.gpkg / "
                    "kenya_roads.gpkg into ARTIFACTS_DIR and restart."
                ),
                status_code=503,
                details={"near_amenity": near_amenity, "radius_km": radius_km},
            )
        df = amenity_svc.filter_by_amenity(df, near_amenity, int(radius_km))
        filters["near_amenity"] = near_amenity
        filters["radius_km"] = int(radius_km)

    # ---- Apply column-level filters ----
    mask = pd.Series([True] * len(df), index=df.index)
    if county is not None:
        filters["county"] = county
        mask &= df["county"].fillna("").str.lower().str.contains(county.lower(), regex=False)
    if prop_type is not None:
        filters["prop_type"] = prop_type
        mask &= df["prop_type"].fillna("").str.lower().str.contains(prop_type.lower(), regex=False)
    if verdict is not None:
        filters["verdict"] = verdict
        mask &= df["verdict"] == verdict
    if scored_by is not None:
        filters["scored_by"] = scored_by
        mask &= df["scored_by"] == scored_by
    if data_quality_flag is not None:
        filters["data_quality_flag"] = data_quality_flag
        mask &= df["data_quality_flag"] == data_quality_flag

    filtered = df[mask]

    # ---- Sort ----
    sort_col, default_asc = _SORT_KEYS[sort]
    filtered = filtered.sort_values(sort_col, ascending=default_asc, na_position="last")

    # ---- Paginate ----
    total_rows = int(len(filtered))
    total_pages = int(math.ceil(total_rows / page_size)) if page_size else 0
    start = (page - 1) * page_size
    end = start + page_size
    page_df = filtered.iloc[start:end]

    rows = [_listings_row_from_series(r) for _, r in page_df.iterrows()]
    return ListingsScoredResponse(
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total_rows=total_rows,
            total_pages=total_pages,
            filters=filters,
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


def _listings_row_from_series(r: pd.Series) -> ListingsScoredRow:
    """Build a ListingsScoredRow from a pandas Series."""
    return ListingsScoredRow(
        listing_url=_maybe(r.get("listing_url")),
        listing_no=_maybe(r.get("listing_no")),
        title=_maybe(r.get("title")),
        location=_maybe(r.get("location")),
        county=_maybe(r.get("county")),
        prop_type=_maybe(r.get("prop_type")),
        latitude=_maybe(r.get("latitude")),
        longitude=_maybe(r.get("longitude")),
        price_ksh=_maybe(r.get("price_ksh")),
        size_acres=float(r["size_acres"]),
        listed_price_per_acre_ksh=float(r["listed_price_per_acre_ksh"]),
        predicted_price_per_acre_ksh=float(r["predicted_price_per_acre_ksh"]),
        low_price_per_acre_ksh=float(r["low_price_per_acre_ksh"]),
        high_price_per_acre_ksh=float(r["high_price_per_acre_ksh"]),
        listed_over_predicted=float(r["listed_over_predicted"]),
        scored_by=str(r["scored_by"]),
        verdict=str(r["verdict"]),
        data_quality_flag=bool(r["data_quality_flag"]),
    )
