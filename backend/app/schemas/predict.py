"""Request and response schemas for POST /api/v1/predict.

The parcel checklist accepts, per B1's ``infrastructure.py``:
  - ``true``/``false`` (booleans) for "present" / "absent"
  - the string ``"not_sure"`` for "I don't know"

Internally B1 works with 0/1/None, so the API layer converts booleans to
0/1 and ``"not_sure"`` to None before handing the dict to the feature
pipeline.  The ten items match ``scoring_params.json:infra_items`` and
B1's ``InfrastructureCalculator`` (see ``test_features.py``).

prop_type validation (P2b): the request validates ``prop_type`` against
the canonical list ``["Land", "Farm", "Commercial"]`` (case-insensitive,
normalised to canonical casing).  Unknown values return 422 with the
``allowed`` list in details.  The model's preprocessor groups unseen
categorical values into "Other" at transform time, so this validation
does NOT change inference for the canonical three — it only stops the
client from sending values the model treats as "Other" anyway.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.canonical import PARCEL_CHECKLIST_FIELDS, PROPERTY_TYPES

# Re-export so existing imports from this module keep working.
__all__ = ["PARCEL_CHECKLIST_FIELDS", "PredictRequest", "PredictResponse"]

# The ten infrastructure checklist items — same names as
# ``scoring_params.json:infra_items`` and B1's InfrastructureCalculator.
# Imported from app.schemas.canonical (single source of truth).

# A single checklist value: True / False / "not_sure" (or null, treated as
# "not_sure").  Pydantic v2 accepts bool before str when the union is written
# this way, so ``true``/``false`` parse as booleans and ``"not_sure"`` as the
# string literal.
ChecklistValue = bool | Literal["not_sure"] | None


def _canonical_prop_type(v: str | None) -> str | None:
    """Normalise a prop_type value to the canonical casing.

    Returns the canonical-cased value when the input matches one of
    ``PROPERTY_TYPES`` case-insensitively, else returns the input
    unchanged (the field_validator below then raises 422).
    """
    if v is None:
        return v
    for canonical in PROPERTY_TYPES:
        if v.lower() == canonical.lower():
            return canonical
    return v


class PredictRequest(BaseModel):
    """POST /api/v1/predict request body."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "lat": -1.2921,
                "lon": 36.8219,
                "size_acres": 1.5,
                "prop_type": "Land",
                "parcel_features": {
                    "borehole": True,
                    "piped_water": False,
                    "river_water": "not_sure",
                    "water_tank": False,
                    "grid_electric": True,
                    "solar_electric": False,
                    "full_fence": True,
                    "partial_fence": False,
                    "structures": False,
                    "internal_road": "not_sure",
                },
                "confidence_level": 0.8,
            }
        }
    )

    lat: float = Field(..., ge=-90, le=90, description="Latitude (WGS84)")
    lon: float = Field(..., ge=-180, le=180, description="Longitude (WGS84)")
    size_acres: float = Field(..., gt=0, description="Parcel size in acres")
    prop_type: str = Field("Land", description="Property type (Land / Farm / Commercial)")
    parcel_features: dict[str, ChecklistValue] = Field(
        default_factory=dict,
        description=(
            "Infrastructure checklist. Keys are the ten item names "
            "(borehole, piped_water, river_water, water_tank, grid_electric, "
            "solar_electric, full_fence, partial_fence, structures, "
            "internal_road). Values are true / false / 'not_sure' (or null)."
        ),
    )
    confidence_level: float = Field(
        0.8,
        gt=0,
        lt=1,
        description=(
            "Confidence level for the multiplicative conformal interval. "
            "0.50 / 0.80 / 0.90 are pre-calibrated; any value in (0, 1) is "
            "accepted (q recomputed from OOF residuals)."
        ),
    )

    @field_validator("prop_type")
    @classmethod
    def _check_prop_type(cls, v: str) -> str:
        """Validate prop_type against the canonical list (case-insensitive).

        Returns the canonical-cased value (so downstream code can compare
        against the canonical list without re-normalising).  Raises
        ValueError → 422 with the allowed list when the value is not one
        of the canonical three.
        """
        canonical = _canonical_prop_type(v)
        if canonical is None or canonical not in PROPERTY_TYPES:
            raise ValueError(
                f"prop_type must be one of {PROPERTY_TYPES} (case-insensitive), got {v!r}."
            )
        return canonical

    @field_validator("parcel_features")
    @classmethod
    def _check_keys(cls, v: dict[str, Any]) -> dict[str, Any]:
        unknown = set(v) - set(PARCEL_CHECKLIST_FIELDS)
        if unknown:
            raise ValueError(
                f"unknown parcel_features keys: {sorted(unknown)}. "
                f"Allowed: {list(PARCEL_CHECKLIST_FIELDS)}"
            )
        return v

    def to_parcel_dict(self) -> dict[str, int | None]:
        """Convert API values to B1's 0/1/None convention."""
        out: dict[str, int | None] = {}
        for key in PARCEL_CHECKLIST_FIELDS:
            val = self.parcel_features.get(key)
            if val is True:
                out[key] = 1
            elif val is False:
                out[key] = 0
            elif val == "not_sure" or val is None:
                out[key] = None
            else:  # pragma: no cover - pydantic guards this
                raise ValueError(f"parcel_features[{key!r}] must be true/false/'not_sure'")
        return out


class CoverageWarningResponse(BaseModel):
    is_low_support: bool
    county_listings: int
    nearby_listings: int
    radius_km: int
    min_county_n: int
    min_nearby_n: int
    reason: str


# ----------------------------------------------------------------------
# Live explanation (Cell 9.4 + Cell 9.10's explain_spec.md rule)
# ----------------------------------------------------------------------


class DriverContributionResponse(BaseModel):
    """One feature's contribution to the prediction.

    The SHAP value is on the log scale (log KSh per acre).  The effect %
    follows explain_spec.md's rule (Cell 9.10):

        effect(f) = exp(s_f) - 1   (multiplicative change in typical price
                                    per acre attributable to feature f)
    """

    feature: str
    label: str = Field(..., description="Human-readable label from feature_labels.json")
    shap_value: float = Field(..., description="Combined SHAP value (log scale)")
    effect_pct: float = Field(
        ..., description="(exp(shap_value) - 1) * 100 — multiplicative effect on typical price"
    )
    direction: str = Field(..., description="'price-increasing' / 'price-decreasing' / 'neutral'")


class EnsembleShapCoverage(BaseModel):
    """Recomputed from whichever members actually got loaded (post-pruning),
    NOT the notebook's static manifest values."""

    tree_share_explained_by_shap: float = Field(
        ..., description="Sum of tree-member (xgb + catboost) weights in the loaded ensemble"
    )
    tabnet_share_not_covered: float = Field(
        ...,
        description="TabNet's weight in the loaded ensemble (0 if pruned). The TabNet share of the blend is NOT covered by SHAP.",
    )
    explained_members: list[str] = Field(
        ..., description="Which members the SHAP values cover (xgb, catboost)"
    )
    unexplained_members: list[str] = Field(
        ..., description="Which members are NOT covered (tabnet, if loaded)"
    )
    combined_base_value: float = Field(
        ...,
        description="Combined base value on the log scale (weighted sum of member base values)",
    )
    typical_price_per_acre_ksh: float = Field(
        ...,
        description="exp(combined_base_value) — the typical KSh per acre before per-feature adjustments",
    )
    latency_ms: float = Field(
        ...,
        description=(
            "Wall-clock latency of this request's live SHAP computation. "
            "TreeExplainer is built once (cached for the process); shap_values "
            "on a single row is typically sub-millisecond to a few ms."
        ),
    )


class LiveExplanationResponse(BaseModel):
    """The driver breakdown + recomputed shares for one prediction."""

    drivers: list[DriverContributionResponse] = Field(
        ..., description="Top N drivers sorted by |shap_value| descending"
    )
    coverage: EnsembleShapCoverage


# ----------------------------------------------------------------------
# Comparables (Cell 9.6 listings_scored.parquet)
# ----------------------------------------------------------------------


class ComparableListingResponse(BaseModel):
    """One nearby listing returned as a comparable.

    Note: ``list_date`` / ``days_ago`` is intentionally OMITTED — Notebook
    1's ``list_date`` is empty for every listing, so fabricating a value
    would mislead the user.  See the comparables.py docstring.
    """

    listing_no: str | None
    title: str | None
    location: str | None
    county: str | None
    size_acres: float
    listed_price_per_acre_ksh: float
    predicted_price_per_acre_ksh: float
    verdict: str = Field(..., description="'underpriced' / 'fair' / 'overpriced'")
    distance_km: float = Field(..., description="Haversine distance from the predicted point")


class PredictNamedPOI(BaseModel):
    """A named POI near the predicted point — for the 'Nearby & Infrastructure' list.

    Sourced from kenya_pois_named.gpkg (Cell 5.2's ogr2ogr with `name` added
    to the -select list).  POIs without a name in OSM fall back to
    '<category> near <nearest town>' — these are labels, not real names.
    The ``is_fallback`` flag is True for those fallback labels so the frontend
    can style them distinctly (lighter text / "approximate" tag).
    """

    name: str
    category: str
    distance_km: float
    is_fallback: bool = Field(
        False,
        description="True when the name is a generated fallback label ('<category> near <town>') rather than a real OSM name.",
    )


class PredictResponse(BaseModel):
    """POST /api/v1/predict response — Cell 8.3 + Cell 9.1 + total + warning
    + live driver breakdown + comparables + named POIs."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "price_per_acre_ksh": 4_500_000,
                "price_per_acre_low_ksh": 2_800_000,
                "price_per_acre_high_ksh": 7_200_000,
                "total_price_ksh": 6_750_000,
                "total_price_low_ksh": 4_200_000,
                "total_price_high_ksh": 10_800_000,
                "confidence_level": 0.8,
                "county": "Nairobi",
                "coverage": {
                    "is_low_support": False,
                    "county_listings": 412,
                    "nearby_listings": 87,
                    "radius_km": 50,
                    "min_county_n": 10,
                    "min_nearby_n": 5,
                    "reason": "",
                },
                "ensemble_members": {"xgb": 0.45, "catboost": 0.55},
                "diagnostics": {},
                "explanation": {
                    "drivers": [
                        {
                            "feature": "log_size_acres",
                            "label": "Log parcel size",
                            "shap_value": 0.21,
                            "effect_pct": 23.4,
                            "direction": "price-increasing",
                        }
                    ],
                    "coverage": {
                        "tree_share_explained_by_shap": 1.0,
                        "tabnet_share_not_covered": 0.0,
                        "explained_members": ["xgb", "catboost"],
                        "unexplained_members": [],
                        "combined_base_value": 15.32,
                        "typical_price_per_acre_ksh": 4_500_000,
                        "latency_ms": 7.3,
                    },
                },
                "comparables": [
                    {
                        "listing_no": "L001",
                        "title": "1 acre in Karen",
                        "location": "Karen, Nairobi",
                        "county": "Nairobi",
                        "size_acres": 1.0,
                        "listed_price_per_acre_ksh": 4_500_000,
                        "predicted_price_per_acre_ksh": 5_000_000,
                        "verdict": "underpriced",
                        "distance_km": 1.23,
                    }
                ],
                "named_pois": [
                    {"name": "St. Joseph Academy", "category": "school", "distance_km": 0.8},
                    {"name": "Ruiru Level 4 Hospital", "category": "hospital", "distance_km": 2.1},
                ],
            }
        }
    )

    price_per_acre_ksh: float
    price_per_acre_low_ksh: float
    price_per_acre_high_ksh: float
    total_price_ksh: float
    total_price_low_ksh: float
    total_price_high_ksh: float
    confidence_level: float
    county: str | None
    coverage: CoverageWarningResponse
    ensemble_members: dict[str, float] = Field(
        default_factory=dict,
        description="Which members were actually loaded (post-pruning) and their renormalised weights.",
    )
    diagnostics: dict[str, Any] = Field(
        default_factory=dict,
        description="B1's diagnostics: nearest places, infra source, spatial-index load state.",
    )
    explanation: LiveExplanationResponse | None = Field(
        None,
        description=(
            "Live driver breakdown (Cell 9.4 SHAP + Cell 9.10 money-effect rule). "
            "Null when no tree models are loaded or the explanation service is "
            "unavailable."
        ),
    )
    comparables: list[ComparableListingResponse] = Field(
        default_factory=list,
        description=(
            "Nearby listings from listings_scored.parquet within 50 km, ranked "
            "by distance.  Empty when listings_scored.parquet is not loaded."
        ),
    )
    named_pois: list[PredictNamedPOI] = Field(
        default_factory=list,
        description=(
            "Named POIs within 5 km of the predicted point (hospital, school, "
            "market, etc.) from kenya_pois_named.gpkg.  Empty when the "
            "named-POI layer is not loaded."
        ),
    )
