"""Canonical domain constants — the single source of truth for lists
the API exposes to the frontend so it never re-types them.

This module is the ONE place in the backend where domain lists live.
Routers and schemas import from here; the frontend reads the lists via
the endpoints that return them (``/overview/summary`` and
``/predict/options``).

Currently canonical:

- ``PROPERTY_TYPES`` — ``["Land", "Farm", "Commercial"]``.  Replaces the
  design's Agricultural / Residential / Commercial / Industrial labels
  (mock content).  Every prop_type selector in the app renders only
  these three.  Rows in the loaded frame whose ``prop_type`` is not in
  this list are counted under ``unmapped_prop_type_rows`` (never
  silently dropped or relabelled) — see the Overview and Predict
  endpoints for the surfacing.
- ``PARCEL_CHECKLIST_FIELDS`` — the ten infrastructure checklist item
  keys (same names as ``scoring_params.json:infra_items`` and B1's
  ``InfrastructureCalculator``).  Kept here rather than in
  ``app.schemas.predict`` so the options endpoint can return the list
  without importing the request schema.
- ``DEFAULT_CONFIDENCE_LEVEL`` — ``0.8`` (the app's standard 80% range).
  The model accepts any value in (0, 1); the three pre-calibrated
  levels (0.50 / 0.80 / 0.90) are exposed via
  ``ALLOWED_CONFIDENCE_LEVELS`` for the frontend's reference, but the
  request still accepts any value in the open interval.
- ``FLAG_LOWER_PCT`` / ``FLAG_UPPER_PCT`` — the data-quality-flag
  percentile window, served on ``/meta`` and ``/data/price-distribution``
  as ``flag_definition`` so the UI never re-types "1st–99th".
- ``METHODOLOGY`` — the plain-language methodology block served by
  ``/meta`` (P8b): one backend place for the data-sources note, the
  verifiable cleaning steps, and the feature groups.
"""

from __future__ import annotations

from typing import Any

#: Canonical property-type enum.  The Overview filter, the
#: Price-by-property-type card, the Predictor's Step-2 pills, and every
#: future prop_type selector render only these three.  The design's
#: Agricultural / Residential / Commercial / Industrial labels are mock
#: content and are NOT used.
PROPERTY_TYPES: list[str] = ["Land", "Farm", "Commercial"]

#: The ten infrastructure checklist item keys — same names as
#: ``scoring_params.json:infra_items`` and B1's ``InfrastructureCalculator``.
#: The frontend iterates this list (returned by ``/predict/options``) so
#: it never keeps its own copy of the key list.  Labels stay in i18n,
#: keyed by these keys (``predictor.feature.borehole`` etc.).
PARCEL_CHECKLIST_FIELDS: tuple[str, ...] = (
    "borehole",
    "piped_water",
    "river_water",
    "water_tank",
    "grid_electric",
    "solar_electric",
    "full_fence",
    "partial_fence",
    "structures",
    "internal_road",
)

#: The app's standard confidence level (the "80% range").  Any value in
#: (0, 1) is accepted by the model (the conformal q is recomputed from
#: OOF residuals for non-calibrated levels); this is just the default
#: the UI uses when the user hasn't picked a different one.
DEFAULT_CONFIDENCE_LEVEL: float = 0.8

#: The three pre-calibrated confidence levels the model ships with.
#: Exposed via ``/predict/options`` so the frontend can show them in a
#: future "select confidence level" affordance.  The request still
#: accepts any value in (0, 1) — this list is informational, not a
#: validation gate.
ALLOWED_CONFIDENCE_LEVELS: tuple[float, ...] = (0.50, 0.80, 0.90)

#: Per-model display names + families (P5b).  Facts about the model
#: implementations (which library each member is), documented here so
#: the frontend never re-derives them by substring-matching model names.
#: ``family`` values: "tree" (gradient-boosted trees), "neural"
#: (TabNet), "ensemble" (the weighted blend), "baseline".
MODEL_INFO: dict[str, dict[str, str]] = {
    "xgb": {"display_name": "XGBoost", "family": "tree"},
    "catboost": {"display_name": "CatBoost", "family": "tree"},
    "tabnet": {"display_name": "TabNet", "family": "neural"},
    "weighted_ensemble": {"display_name": "Weighted ensemble", "family": "ensemble"},
    "simple_average": {"display_name": "Simple average", "family": "baseline"},
}

#: The interval method the modeling code implements (documented backend
#: constant, P5b).  ``src/landval/modelling/predict.py`` computes the
#: multiplicative split-conformal interval from the exported conformal
#: q's — surfaced so the UI only claims "conformal" when the backend
#: says so.
INTERVAL_METHOD: str = "multiplicative split-conformal"

#: Data-quality flag window (P7b/P8b).  Listings whose price per acre
#: falls outside the LOWER..UPPER percentile window of the development
#: target carry ``data_quality_flag = True`` in ``listings_scored.parquet``
#: (Notebook 3 Cell 9.6's export rule — the same rule the
#: ``/listings/scored`` filter docs describe) and are excluded from model
#: training.  The notebook is not part of this repo, so this module is the
#: canonical place the numbers live; the API serves them (on ``/meta`` and
#: ``/data/price-distribution``) so the UI never re-types "1st–99th".
#: If the notebook rule ever changes, change these two constants — they
#: are the one definition the whole stack reads.
FLAG_LOWER_PCT: int = 1
FLAG_UPPER_PCT: int = 99

#: Methodology copy served by ``/meta`` (P8b) — the ONE backend place
#: that describes the pipeline in plain language.  Every claim below is
#: verifiable in this repo:
#: - "usable price and size"      — the modelling frame requires finite
#:   positive per-acre prices (see ``data_explorer.py: n_usable``) and a
#:   parsed ``size_acres``;
#: - the outlier flag window      — ``FLAG_LOWER_PCT`` / ``FLAG_UPPER_PCT``
#:   above (mirrors the notebook's Cell 9.6 rule the listings filter
#:   docstrings describe);
#: - "distance to Nairobi / county town" — ``landval.features.proximity``
#:   (``dist_to_nairobi_km``, ``dist_to_county_town_km``);
#: - "road access"                — ``landval.features.accessibility``
#:   (road-class BallTrees);
#: - "utility and amenity proximity" — ``landval.features.amenities``
#:   (POI BallTrees) + the parcel infrastructure checklist
#:   (``PARCEL_CHECKLIST_FIELDS``);
#: - "parcel size" / "county"    — model features in
#:   ``feature_manifest.json``.
#: Claims the repo CANNOT verify (duplicate-listing removal, mismatched
#: coordinate checks) are deliberately absent — they belong to the
#: notebook's ETL and were removed from the About copy (P8b report).
METHODOLOGY: dict[str, Any] = {
    "sources_note": (
        "Asking prices from public real estate listings collected across "
        "the counties the dataset covers. Estimates reflect market "
        "sentiment, not official registry transactions."
    ),
    "cleaning_steps": [
        "Only listings with a usable price and size enter the modelling set.",
        "Listings whose per-acre price falls outside the dataset's "
        "1st–99th percentile window are flagged as possible errors and "
        "excluded from model training.",
    ],
    "feature_groups": [
        "Distance to Nairobi",
        "Distance to the county town",
        "Road access",
        "Utility and amenity proximity",
        "Parcel size",
        "County baseline",
    ],
}
