"""Schema for GET /api/v1/predict/options (P2b no-hardcoded-values sweep).

A read-only response that gives the Predictor page every list + bound +
default it needs, computed from the loaded ``listings_scored.parquet``
frame and the canonical constants in ``app.schemas.canonical``.  The
frontend never re-types any of these values.

Returned blocks:

- ``property_types`` — the canonical list (``["Land", "Farm", "Commercial"]``)
  with a per-type row count from the loaded frame, plus
  ``unmapped_prop_type_rows`` counting rows whose ``prop_type`` is not in
  the canonical list (never silently dropped or relabelled).
- ``size_acres`` — ``{min, max, median}`` computed from the frame's
  ``size_acres`` column.  Min/max use the 1st-99th percentile to avoid a
  single extreme outlier stretching the input's supported range; the
  choice is documented in the field descriptions.
- ``default_confidence_level`` + ``allowed_confidence_levels`` — from
  the canonical constants (the model's pre-calibrated levels).
- ``parcel_features`` — the ten checklist keys in order, so the frontend
  iterates the response rather than keeping its own copy.  Labels stay
  in i18n, keyed by these keys.

Degraded mode: when ``listings_scored.parquet`` is not loaded, returns
503 ``DATA_UNAVAILABLE`` (the canonical lists cannot be population-
checked without the frame).  The frontend shows an error state with
retry and disables submit — it does NOT fall back to a built-in list.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.canonical import PARCEL_CHECKLIST_FIELDS, PROPERTY_TYPES


class PropertyTypeOption(BaseModel):
    """One entry in ``property_types`` — the canonical name plus the
    row count from the loaded frame."""

    name: str = Field(..., description="Canonical property-type name")
    n: int = Field(..., ge=0, description="Rows of this type in the loaded frame")


class SizeAcresBounds(BaseModel):
    """Bounds for the parcel-size input, computed from the loaded frame.

    Min/max use the 1st / 99th percentile rather than the absolute min /
    max so a single extreme outlier (a 0.001-acre error or a 5000-acre
    farm) doesn't stretch the supported range.  ``median`` is the 50th
    percentile — the frontend can use it as a neutral placeholder hint
    rather than typing a fake "1.5".
    """

    min: float = Field(..., description="1st percentile of size_acres (acres)")
    max: float = Field(..., description="99th percentile of size_acres (acres)")
    median: float = Field(..., description="50th percentile of size_acres (acres)")


class PredictOptionsResponse(BaseModel):
    """GET /api/v1/predict/options response."""

    property_types: list[PropertyTypeOption] = Field(
        ...,
        description=(
            "The canonical property types (Land / Farm / Commercial) with "
            "per-type row counts from the loaded frame.  This is THE list "
            "the frontend renders — never re-typed."
        ),
    )
    unmapped_prop_type_rows: int = Field(
        ...,
        ge=0,
        description=(
            "Rows whose prop_type is not in PROPERTY_TYPES.  Counted and "
            "logged as a warning; never silently dropped or relabelled."
        ),
    )
    size_acres: SizeAcresBounds = Field(
        ...,
        description=(
            "Bounds for the parcel-size input, computed from the loaded "
            "frame's size_acres column (1st/99th percentile for min/max)."
        ),
    )
    default_confidence_level: float = Field(
        ...,
        description=(
            "The app's standard confidence level (the '80% range').  The "
            "frontend uses this as the request's confidence_level when the "
            "user hasn't picked a different one."
        ),
    )
    allowed_confidence_levels: list[float] = Field(
        ...,
        description=(
            "The three pre-calibrated confidence levels the model ships "
            "with.  Informational — the request still accepts any value in "
            "(0, 1)."
        ),
    )
    parcel_features: list[str] = Field(
        ...,
        description=(
            "The ten infrastructure checklist item keys in order.  The "
            "frontend iterates this list rather than keeping its own copy. "
            "Labels stay in i18n, keyed by these keys "
            "('predictor.feature.borehole' etc.)."
        ),
    )
    # Re-export the canonical list so the frontend has a single field to
    # read for "what property types exist" without having to map over
    # property_types just to extract the names.
    property_types_canonical: list[str] = Field(
        ...,
        description="The canonical property-type list (names only, no counts).",
    )


# Re-export the canonical lists so router/service imports have one place.
__all__ = [
    "PredictOptionsResponse",
    "PropertyTypeOption",
    "SizeAcresBounds",
    "PARCEL_CHECKLIST_FIELDS",
    "PROPERTY_TYPES",
]
