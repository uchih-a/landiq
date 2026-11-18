"""Overview endpoint — read-only summary over ``listings_scored.parquet``.

GET /api/v1/overview/summary
    One response giving the Overview page every number it shows:
    totals, verdicts, by-property-type / by-size-band / by-distance-band
    breakdowns, log-linear trend, deterministic scatter sample, and
    top-N counties + Others.  Computed over the WHOLE usable corpus
    (the frame already in memory) so the frontend stops deriving
    statistics from page 1 of /listings/scored (which is sorted
    most-underpriced-first and is therefore a biased sample).

Query parameters
----------------
county : str | None
    Case-insensitive EXACT match against the stored county value.
    Unknown county -> 422 with an ``allowed`` list in details.
prop_type : str | None
    Case-insensitive EXACT match against one of the canonical property
    types (Land / Farm / Commercial).  Note: this is exact-match, NOT
    the substring match /listings/scored uses — the difference is
    documented in docs/api.md.
top_n_counties : int, default 3, range 1..10
    How many named counties before the ``Others`` row.
scatter_limit : int, default 400, range 1..1000
    Cap on the scatter sample size.  The sample is deterministic
    (fixed seed) and unbiased — a frame sorted by verdict still yields
    a representative mix.

Filters apply to every block EXCEPT ``national``, which is always
unfiltered so the UI can show coverage and context regardless of the
applied filter.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.core.exceptions import AppError
from app.schemas.overview import PROPERTY_TYPES, OverviewSummaryResponse
from app.services.overview import (
    DEFAULT_SCATTER_LIMIT,
    DEFAULT_TOP_N,
    MAX_SCATTER_LIMIT,
    OverviewFilters,
    compute_overview_summary,
)

router = APIRouter(tags=["overview"])


@router.get("/overview/summary", response_model=OverviewSummaryResponse)
async def overview_summary(
    request: Request,
    county: str | None = Query(
        None,
        description=(
            "Case-insensitive EXACT match against a county in the data. "
            "Unknown county returns 422 with an `allowed` list."
        ),
    ),
    prop_type: str | None = Query(
        None,
        description=(
            "Case-insensitive EXACT match against one of the canonical "
            "property types (Land, Farm, Commercial).  Note: this is "
            "exact-match, NOT the substring match /listings/scored uses."
        ),
    ),
    top_n_counties: int = Query(
        DEFAULT_TOP_N,
        ge=1,
        le=10,
        description="How many named counties before the Others row (default 3, range 1..10).",
    ),
    scatter_limit: int = Query(
        DEFAULT_SCATTER_LIMIT,
        ge=1,
        le=MAX_SCATTER_LIMIT,
        description="Cap on the scatter sample size (default 400, max 1000).",
    ),
) -> OverviewSummaryResponse:
    """Read-only summary for the Overview page."""
    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")

    # ---- Validate prop_type against the canonical list ----
    if prop_type is not None:
        canonical_match = next((p for p in PROPERTY_TYPES if p.lower() == prop_type.lower()), None)
        if canonical_match is None:
            raise AppError(
                code="VALIDATION_ERROR",
                message=(
                    f"prop_type must be one of {PROPERTY_TYPES} (case-insensitive exact match), "
                    f"got {prop_type!r}."
                ),
                status_code=422,
                details={"allowed": PROPERTY_TYPES},
            )

    # ---- Validate county against the data ----
    if county is not None:
        known = df["county"].fillna("").str.lower().unique().tolist()
        if county.lower() not in known:
            # Build the allowed list from the stored (non-lowercased) names
            # so the client can echo them directly to the user.
            allowed = sorted(str(v) for v in df["county"].dropna().unique().tolist())
            raise AppError(
                code="VALIDATION_ERROR",
                message=(
                    f"county must match a county in the data (case-insensitive exact match), "
                    f"got {county!r}."
                ),
                status_code=422,
                details={"allowed": allowed},
            )

    settings = request.app.state.settings
    coverage_rules = None
    registry = getattr(request.app.state, "registry", None)
    if registry is not None:
        coverage_rules = getattr(registry, "coverage_rules", None)

    filters = OverviewFilters(
        county=county,
        # Use the canonical casing so downstream comparisons are stable.
        prop_type=next((p for p in PROPERTY_TYPES if p.lower() == prop_type.lower()), None)
        if prop_type is not None
        else None,
        top_n_counties=top_n_counties,
        scatter_limit=scatter_limit,
    )

    return compute_overview_summary(
        df,
        filters=filters,
        coverage_rules=coverage_rules,
        artifacts_dir=settings.versioned_artifacts_dir,
        app_state=request.app.state,
        app_exports=app_exports,
    )
