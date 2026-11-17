"""Metadata endpoint — returns model version, data date, and coverage thresholds."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas.health import CoverageThresholds, MetaResponse

router = APIRouter(tags=["meta"])


@router.get("/meta", response_model=MetaResponse)
async def meta(request: Request) -> MetaResponse:
    """Return lightweight artifact metadata.

    When artifacts are not loaded (degraded mode) all fields are ``null``.
    """
    reg = request.app.state.registry

    coverage = None
    if reg.coverage_rules:
        coverage = CoverageThresholds(
            min_county_n=reg.coverage_rules.get("COVERAGE_MIN_COUNTY_N", 10),
            min_nearby_n=reg.coverage_rules.get("COVERAGE_MIN_NEARBY_N", 5),
            radius_km=reg.coverage_rules.get("COVERAGE_RADIUS_KM", 50),
        )

    return MetaResponse(
        model_version=reg.model_version,
        data_date=reg.data_date,
        coverage=coverage,
        ensemble_weights=reg.ensemble_weights,
    )
