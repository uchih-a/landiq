"""Deal Finder endpoints — serve ``listings_scored.parquet`` (Cell 9.6).

GET /api/v1/listings/scored
    Paginated + filtered listing rows with SERVER-SIDE sorting (P4b:
    the ``order`` param + a deterministic ``listing_no`` tiebreaker make
    pages globally consistent — page N+1 asc starts where page N asc
    ended; desc is the exact reverse of asc).

Query parameters
----------------
page, page_size
    Standard pagination (1-indexed page).  Default page=1; page_size is
    capped at ``MAX_PAGE_SIZE``.  The allowed page-size options + default
    + max are served by ``/api/v1/listings/options``.
county
    Filter by county.  **P4b: EXACT case-insensitive match against a
    county in the data** (was a substring match); unknown county -> 422
    with the ``allowed`` list.
prop_type
    Filter by property type.  **P4b: EXACT case-insensitive match against
    the canonical types** (Land / Farm / Commercial; was a substring
    match, so "Land" also matched any type containing "land"); unknown
    value -> 422 with ``allowed``.
verdict
    Filter by verdict — one of ``underpriced``, ``fair``, ``overpriced``.
scored_by
    Filter by scored-by — one of ``oof``, ``test``.
data_quality_flag
    When ``true``, return only rows whose log price per acre is outside the
    development target's 1st-99th percentile window.  When ``false``, return
    only clean rows.  When absent, return both.
near_amenity / radius_km
    Filter to listings within ``radius_km`` of a chosen amenity type (from
    ``AmenityProximityService.SUPPORTED_AMENITIES``).  The per-listing
    distance is recomputed from the stored lat/lon via B1's BallTrees.
    Returns 503 ``AMENITY_FILTER_UNAVAILABLE`` when the POI / roads GPKG
    is missing.  The canonical amenity + radius lists are served by
    ``/api/v1/listings/options`` (with an ``amenity_filter_available``
    flag so the UI can disable the control with a reason instead of
    failing at click time).
sort
    Sort key — one of ``listed_over_predicted``,
    ``listed_price_per_acre_ksh``, ``predicted_price_per_acre_ksh``,
    ``size_acres``.
order : "asc" | "desc"  (P4b)
    Sort direction.  Defaults to each key's historical default so
    existing callers see no change (asc for the ratio + price keys, desc
    for size).  Sort is stable with a ``listing_no`` tiebreaker.

GET /api/v1/listings/options (P4b)
    Read-only options: canonical property types with counts, exact
    county names with counts, verdict definitions (rules derived from
    the frame's conformal-interval columns — see the router), amenity +
    radius lists + availability, page sizes, sort keys, export cap.

GET /api/v1/listings/{listing_no}/nearby (P4b)
    Real nearest listings by haversine to the given listing (excluding
    itself), with distances.

GET /api/v1/listings/scored/export.csv (P4b)
    Streaming CSV of every row matching the current filters (server-side;
    no client page-walking).  UTF-8 with BOM; money columns are raw KSh
    numbers; a row cap only when configured via ``LISTINGS_EXPORT_MAX_ROWS``
    (default: no cap), surfaced via ``X-Export-Truncated`` headers rather
    than silently cutting.

DB-vs-in-memory decision
------------------------
``listings_scored.parquet`` is the modelling frame — Cell 9.7's manifest
reports its row count.  At the dataset's current size (~1k–10k rows × 19
columns) an in-memory pandas DataFrame is ~1–5 MB and filters in
microseconds; no database or external index is warranted.
"""

from __future__ import annotations

import math
from typing import Any, Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.schemas.app_exports import (
    ListingsScoredResponse,
    ListingsScoredRow,
    PaginationMeta,
)
from app.schemas.canonical import PROPERTY_TYPES
from app.schemas.listings_options import (
    ListingsOptionsResponse,
    NearbyListing,
    NearbyListingsResponse,
)

router = APIRouter(tags=["deal-finder"])
logger = get_logger("app.listings")

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
# Page-size options the UI renders.  Backend-owned (single definition);
# /listings/options returns them so the frontend never re-types the list.
PAGE_SIZE_OPTIONS = (10, 20, 50, 100, 200)

# Whitelisted sort keys -> (column, ascending-default) — Cell 9.6's columns.
# P4b: the default direction per key is preserved (asc for the ratio and
# price keys — most underpriced / cheapest first; desc for size — largest
# first) so existing callers see no change.
_SORT_KEYS: dict[str, tuple[str, bool]] = {
    "listed_over_predicted": ("listed_over_predicted", True),  # underpriced first
    "listed_price_per_acre_ksh": ("listed_price_per_acre_ksh", True),
    "predicted_price_per_acre_ksh": ("predicted_price_per_acre_ksh", True),
    "size_acres": ("size_acres", False),  # largest first
}

_SORT_KEY_LABEL_KEYS: dict[str, str] = {
    "listed_over_predicted": "deals.sort.listedOverPredicted",
    "listed_price_per_acre_ksh": "deals.sort.listedPrice",
    "predicted_price_per_acre_ksh": "deals.sort.predictedPrice",
    "size_acres": "deals.sort.size",
}

# User-facing amenity enum — mirrors AmenityProximityService.SUPPORTED_AMENITIES.
# Inlined as a Literal in the Query annotation below (rather than a type alias)
# because ruff's B008 check flags Query() in argument defaults when the type
# annotation is a complex alias.
_ALLOWED_RADIUS_KM = (1, 3, 5)
_ALLOWED_ORDERS = ("asc", "desc")


def _canonical_prop_type(raw: str) -> str | None:
    """Case-insensitive EXACT match against the canonical types."""
    for canonical in PROPERTY_TYPES:
        if raw.lower() == canonical.lower():
            return canonical
    return None


# ----------------------------------------------------------------------
# GET /api/v1/listings/scored
# ----------------------------------------------------------------------


@router.get("/listings/scored", response_model=ListingsScoredResponse)
async def listings_scored(
    request: Request,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Rows per page"),
    county: str | None = Query(
        None,
        description=(
            "EXACT case-insensitive match against a county in the data. "
            "Unknown -> 422 with `allowed`."
        ),
    ),
    prop_type: str | None = Query(
        None,
        description=(
            "EXACT case-insensitive match against the canonical types "
            "(Land / Farm / Commercial).  Unknown -> 422 with `allowed`."
        ),
    ),
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
            "'school', 'hospital', 'tarmac_road' (from "
            "AmenityProximityService.SUPPORTED_AMENITIES).  The canonical "
            "list is served by /api/v1/listings/options."
        ),
    ),
    radius_km: int | None = Query(
        None,
        description="Radius (km) for the near_amenity filter — one of the allowed values.",
    ),
    sort: str = Query(
        "listed_over_predicted",
        description=(
            "Sort key: 'listed_over_predicted' (default), "
            "'listed_price_per_acre_ksh', 'predicted_price_per_acre_ksh', "
            "'size_acres'."
        ),
    ),
    order: str = Query(
        None,
        description=(
            "Sort direction: 'asc' or 'desc'.  Defaults to each key's "
            "historical default (asc for listed_over_predicted + price "
            "keys, desc for size_acres) so existing callers see no change."
        ),
    ),
) -> ListingsScoredResponse:
    """Paginated + filtered Deal Finder table with server-side sorting."""
    # ---- Validate near_amenity / radius_km up front (before the data load)
    # so a malformed amenity filter returns 422, not 503 DATA_UNAVAILABLE
    # when the parquet happens to be missing. ----
    if radius_km is not None and radius_km not in _ALLOWED_RADIUS_KM:
        raise AppError(
            code="VALIDATION_ERROR",
            message=(f"radius_km must be one of {list(_ALLOWED_RADIUS_KM)}, got {radius_km!r}"),
            status_code=422,
            details={"allowed": list(_ALLOWED_RADIUS_KM)},
        )
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

    # ---- Validate the enum-like filters ----
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
    if order is not None and order not in _ALLOWED_ORDERS:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"order must be one of {list(_ALLOWED_ORDERS)}, got {order!r}",
            status_code=422,
            details={"allowed": list(_ALLOWED_ORDERS)},
        )

    # ---- P4b: prop_type is an EXACT canonical match (was substring). ----
    canonical_type: str | None = None
    if prop_type is not None:
        canonical_type = _canonical_prop_type(prop_type)
        if canonical_type is None:
            raise AppError(
                code="VALIDATION_ERROR",
                message=(
                    f"prop_type must be one of {PROPERTY_TYPES} (case-insensitive "
                    f"exact match), got {prop_type!r}."
                ),
                status_code=422,
                details={"allowed": PROPERTY_TYPES},
            )

    # ---- P4b: county is an EXACT case-insensitive match against the data. ----
    if county is not None:
        known_lower = df["county"].fillna("").str.lower()
        if county.lower() not in set(known_lower):
            allowed = sorted(str(v) for v in df["county"].dropna().unique().tolist())
            raise AppError(
                code="VALIDATION_ERROR",
                message=(
                    f"county must match a county in the data (case-insensitive "
                    f"exact match), got {county!r}."
                ),
                status_code=422,
                details={"allowed": allowed},
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
        mask &= df["county"].fillna("").str.lower() == county.lower()
    if canonical_type is not None:
        filters["prop_type"] = canonical_type
        mask &= df["prop_type"].fillna("").str.lower() == canonical_type.lower()
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

    # ---- Sort (P4b): server-side, with the per-key default direction and
    #      a deterministic listing_no tiebreaker so pages are globally
    #      consistent and desc is the exact reverse of asc. ----
    sort_col, default_asc = _SORT_KEYS[sort]
    ascending = default_asc if order is None else (order == "asc")
    filtered = filtered.sort_values(
        by=[sort_col, "listing_no"], ascending=[ascending, True], na_position="last"
    )
    # ---- Paginate (filters echo only the explicit filter params, not
    #      the sort defaults — backward compatibility). ----
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


# ----------------------------------------------------------------------
# GET /api/v1/listings/options (P4b)
# ----------------------------------------------------------------------


@router.get("/listings/options", response_model=ListingsOptionsResponse)
async def listings_options(request: Request) -> ListingsOptionsResponse:
    """Read-only option lists + limits + availability flags for the Deal
    Finder UI.  Everything the filters bar renders comes from here — the
    frontend never re-types a list."""
    from app.services.listings_options import compute_listings_options

    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")
    amenity_svc = getattr(request.app.state, "amenity_proximity_service", None)
    export_max = getattr(request.app.state.settings, "listings_export_max_rows", None)
    return compute_listings_options(
        df,
        amenity_service=amenity_svc,
        allowed_radius_km=list(_ALLOWED_RADIUS_KM),
        page_size_options=list(PAGE_SIZE_OPTIONS),
        default_page_size=DEFAULT_PAGE_SIZE,
        max_page_size=MAX_PAGE_SIZE,
        sort_keys=[
            {
                "value": value,
                "label_key": _SORT_KEY_LABEL_KEYS[value],
                "default_order": "asc" if asc else "desc",
            }
            for value, (_, asc) in _SORT_KEYS.items()
        ],
        export_max_rows=export_max,
    )


# ----------------------------------------------------------------------
# GET /api/v1/listings/{listing_no}/nearby (P4b)
# ----------------------------------------------------------------------


@router.get("/listings/{listing_no}/nearby", response_model=NearbyListingsResponse)
async def listing_nearby(
    request: Request,
    listing_no: str,
    radius_km: float = Query(
        50,
        gt=0,
        description="Search radius around the listing (km).  No cap — the allowed values are served by /listings/options (nearby_defaults).",
    ),
    limit: int = Query(
        50,
        ge=1,
        le=200,
        description="Max nearby listings to return (default 50, max 200).",
    ),
) -> NearbyListingsResponse:
    """Real nearest listings by haversine to the given listing (same
    shared geo reference conventions as the rest of the backend),
    excluding the listing itself.  Unknown listing -> 404; a listing with
    missing coordinates -> an empty list with a ``reason``."""
    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    match_mask = df["listing_no"].astype(str).fillna("") == listing_no
    if int(match_mask.sum()) == 0:
        raise AppError(
            code="RESOURCE_NOT_FOUND",
            message=f"No listing with listing_no {listing_no!r}.",
            status_code=404,
            details={"listing_no": listing_no},
        )
    origin = df[match_mask].iloc[0]
    lat0 = origin.get("latitude")
    lon0 = origin.get("longitude")
    if lat0 is None or lon0 is None:
        return NearbyListingsResponse(
            listing_no=listing_no,
            radius_km=radius_km,
            reason="no_coordinates",
            nearby=[],
            n_returned=0,
        )
    lat0 = float(lat0)
    lon0 = float(lon0)
    if not (np.isfinite(lat0) and np.isfinite(lon0)):
        return NearbyListingsResponse(
            listing_no=listing_no,
            radius_km=radius_km,
            reason="no_coordinates",
            nearby=[],
            n_returned=0,
        )

    # Distances to every OTHER listing with usable coordinates + price.
    lats = df["latitude"].to_numpy(dtype=float)
    lons = df["longitude"].to_numpy(dtype=float)
    from landval.features.geo import haversine_km_vectorised

    dists = np.full(len(df), np.inf)
    valid = np.isfinite(lats) & np.isfinite(lons)
    dists[valid] = haversine_km_vectorised(lats[valid], lons[valid], lat0, lon0)

    # Exclude self + rows beyond the radius.
    self_mask = match_mask.to_numpy()
    in_radius = np.isfinite(dists) & (dists <= radius_km) & ~self_mask & (dists > 0)

    # Sort by distance, take `limit`.
    order = np.argsort(dists[in_radius], kind="stable")
    idx_in = np.where(in_radius)[0][order][:limit]

    nearby: list[NearbyListing] = []
    for i in idx_in:
        r = df.iloc[int(i)]
        nearby.append(
            NearbyListing(
                listing_no=_maybe_str(r.get("listing_no")),
                latitude=_maybe(r.get("latitude")),
                longitude=_maybe(r.get("longitude")),
                verdict=str(r["verdict"]),
                listed_price_per_acre_ksh=float(r["listed_price_per_acre_ksh"]),
                distance_km=round(float(dists[i]), 2),
            )
        )
    return NearbyListingsResponse(
        listing_no=listing_no,
        radius_km=radius_km,
        reason=None,
        nearby=nearby,
        n_returned=len(nearby),
    )


# ----------------------------------------------------------------------
# GET /api/v1/listings/scored/export.csv (P4b)
# ----------------------------------------------------------------------


@router.get("/listings/scored/export.csv")
async def listings_scored_export(
    request: Request,
    county: str | None = Query(None, description="EXACT case-insensitive county match"),
    prop_type: str | None = Query(None, description="EXACT canonical prop_type match"),
    verdict: str | None = Query(None, description="underpriced / fair / overpriced"),
    scored_by: str | None = Query(None, description="oof / test"),
    data_quality_flag: bool | None = Query(None, description="true/false/absent"),
    sort: str = Query("listed_over_predicted", description="Sort key"),
    order: str = Query(None, description="asc / desc (per-key default when absent)"),
) -> StreamingResponse:
    """Streaming CSV of every row matching the current filters.

    - Same filter/sort semantics as /listings/scored (single source of
      truth — the same validation code path runs).
    - Header row, UTF-8 with BOM (Excel-friendly); money columns are raw
      KSh numbers so Excel can sum them.
    - A row cap ONLY when configured via the ``LISTINGS_EXPORT_MAX_ROWS``
      setting (default: no cap).  When the cap truncates the export, the
      response carries ``X-Export-Truncated: true`` and
      ``X-Export-Total`` headers rather than silently cutting.
    - ``Content-Disposition`` filename is built from the active filters.
    """
    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    # ---- Reuse the same validation (422s on bad values). ----
    canonical_type: str | None = None
    if prop_type is not None:
        canonical_type = _canonical_prop_type(prop_type)
        if canonical_type is None:
            raise AppError(
                code="VALIDATION_ERROR",
                message=f"prop_type must be one of {PROPERTY_TYPES}, got {prop_type!r}.",
                status_code=422,
                details={"allowed": PROPERTY_TYPES},
            )
    if county is not None:
        known_lower = df["county"].fillna("").str.lower()
        if county.lower() not in set(known_lower):
            allowed = sorted(str(v) for v in df["county"].dropna().unique().tolist())
            raise AppError(
                code="VALIDATION_ERROR",
                message=f"county must match a county in the data, got {county!r}.",
                status_code=422,
                details={"allowed": allowed},
            )
    if verdict is not None and verdict not in {"underpriced", "fair", "overpriced"}:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"verdict must be one of underpriced/fair/overpriced, got {verdict!r}.",
            status_code=422,
            details={"allowed": ["underpriced", "fair", "overpriced"]},
        )
    if sort not in _SORT_KEYS:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"sort must be one of {sorted(_SORT_KEYS)}, got {sort!r}.",
            status_code=422,
            details={"allowed": sorted(_SORT_KEYS)},
        )

    # ---- Filter (same masks as /listings/scored). ----
    mask = pd.Series([True] * len(df), index=df.index)
    if county is not None:
        mask &= df["county"].fillna("").str.lower() == county.lower()
    if canonical_type is not None:
        mask &= df["prop_type"].fillna("").str.lower() == canonical_type.lower()
    if verdict is not None:
        mask &= df["verdict"] == verdict
    if scored_by is not None:
        mask &= df["scored_by"] == scored_by
    if data_quality_flag is not None:
        mask &= df["data_quality_flag"] == data_quality_flag
    filtered = df[mask]

    # ---- Sort (same semantics). ----
    sort_col, default_asc = _SORT_KEYS[sort]
    ascending = default_asc if order is None else (order == "asc")
    filtered = filtered.sort_values(
        by=[sort_col, "listing_no"], ascending=[ascending, True], na_position="last"
    )

    # ---- Truncation cap (only when configured). ----
    max_rows = getattr(request.app.state.settings, "listings_export_max_rows", None)
    total = int(len(filtered))
    truncated = False
    if max_rows is not None and total > int(max_rows):
        filtered = filtered.iloc[: int(max_rows)]
        truncated = True

    # ---- Stream the CSV (generator so large frames don't double-buffer). ----
    import csv
    import io

    def _row_cells(r: pd.Series) -> list[str]:
        return [
            _csv_cell(r.get("listing_no")),
            _csv_cell(r.get("title")),
            _csv_cell(r.get("county")),
            _csv_cell(r.get("location")),
            _csv_cell(r.get("prop_type")),
            _csv_cell(r.get("listing_url")),
            _csv_num(r.get("size_acres")),
            _csv_num(r.get("price_ksh")),
            _csv_num(r.get("listed_price_per_acre_ksh")),
            _csv_num(r.get("predicted_price_per_acre_ksh")),
            _csv_num(r.get("low_price_per_acre_ksh")),
            _csv_num(r.get("high_price_per_acre_ksh")),
            _csv_num(r.get("listed_over_predicted")),
            _csv_cell(r.get("verdict")),
            _csv_cell(r.get("scored_by")),
            "true" if bool(r.get("data_quality_flag")) else "false",
        ]

    header = [
        "listing_no",
        "title",
        "county",
        "location",
        "prop_type",
        "listing_url",
        "size_acres",
        "price_ksh",
        "listed_price_per_acre_ksh",
        "predicted_price_per_acre_ksh",
        "low_price_per_acre_ksh",
        "high_price_per_acre_ksh",
        "listed_over_predicted",
        "verdict",
        "scored_by",
        "data_quality_flag",
    ]

    def _iter_csv():
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\r\n")
        writer.writerow(header)
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        for _, r in filtered.iterrows():
            writer.writerow(_row_cells(r))
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    # Filename from the active filters (keeps exports identifiable).
    parts = ["listings"]
    if county:
        parts.append(county.lower().replace(" ", "-"))
    if canonical_type:
        parts.append(canonical_type.lower())
    if verdict:
        parts.append(verdict)
    filename = "-".join(parts) + ".csv"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "text/csv; charset=utf-8",
    }
    if truncated:
        headers["X-Export-Truncated"] = "true"
        headers["X-Export-Total"] = str(total)

    # BOM first (Excel-friendly UTF-8), then the streamed rows.
    def _iter_bom():
        yield "\ufeff"
        yield from _iter_csv()

    return StreamingResponse(_iter_bom(), headers=headers, media_type="text/csv")


def _csv_cell(v: Any) -> str:
    """Stringify a cell; empty for null/NaN."""
    s = _maybe(v)
    return "" if s is None else str(s)


def _csv_num(v: Any) -> str:
    """Stringify a numeric cell; empty for null/NaN."""
    f = _maybe(v)
    if f is None:
        return ""
    try:
        f = float(f)
    except (TypeError, ValueError):
        return str(f)
    return repr(f) if not float(f).is_integer() else str(int(f))


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


def _maybe_str(v: Any) -> str | None:
    """NaN / pandas NA -> None; otherwise coerce to str.

    ``listing_no`` is numeric in the source parquet (e.g. ``105784428``,
    ``-835``) but is typed ``str | None`` in the API schemas, so every
    call site that surfaces it to a response model must go through this
    instead of the plain ``_maybe`` (which passes the raw int through and
    fails Pydantic validation).
    """
    v = _maybe(v)
    return None if v is None else str(v)


def _listings_row_from_series(r: pd.Series) -> ListingsScoredRow:
    """Build a ListingsScoredRow from a pandas Series."""
    return ListingsScoredRow(
        listing_url=_maybe(r.get("listing_url")),
        listing_no=_maybe_str(r.get("listing_no")),
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
