"""Pure computation for GET /api/v1/model/explainability's P6b additions —
kept in a service module so every value is unit-testable without HTTP.

Builds:
  - ``build_coverage_block`` — the ``ensemble_shap_coverage`` block.
    Recomputed from the actually-loaded ensemble's weights when the model
    registry is loaded (via the ONE shared function
    ``landval.modelling.coverage.shap_coverage_from_weights``, the same
    computation the live /predict coverage block uses); falls back to the
    notebook-time manifest values, normalised to fractions.  The ``source``
    flag records which path produced the numbers so the UI can say so —
    the frontend never guesses.
  - ``build_models_list`` — the ensemble member list (key, display_name,
    family, ensemble_weight, has_shap) ordered by weight descending, and
    ``default_model`` (the highest-weight SHAP-covered member).
  - ``compute_typical_price`` — the load-time baseline (combined base value
    + typical price per acre), stable at load time because TreeExplainer's
    expected value is a constant of the loaded model.  Null when the
    registry / explanation service is unavailable — never invented.
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from app.schemas.app_exports import ExplainabilityCoverage, ExplainabilityModel
from app.schemas.canonical import MODEL_INFO


def _registry_loaded(registry: object | None) -> bool:
    """True when a registry object is present and reports itself loaded."""
    return registry is not None and bool(getattr(registry, "loaded", False))


def normalise_share(v: Any) -> float | None:
    """Normalise one manifest share to a fraction in [0, 1].

    The notebook's manifest writes fractions (0.85 / 0.15 in the real file);
    a value above 1 is treated as a percentage and divided by 100.  A value
    that still falls outside [0, 1] after normalising (or a non-numeric
    value) returns None — the endpoint then reports the share as missing
    rather than clamping garbage into a plausible-looking number.
    """
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    if f > 1.0:
        f = f / 100.0
    if 0.0 <= f <= 1.0:
        return round(f, 6)
    return None


def build_coverage_block(
    manifest: dict[str, Any] | None,
    registry: object | None,
) -> ExplainabilityCoverage:
    """Build the coverage block — recomputed when possible, manifest otherwise.

    The recomputed path (registry loaded) uses the ONE shared function, so
    the Explainability donut, the registry's own report and every /predict
    response agree by construction.  The manifest path normalises the
    notebook's pre-pruning values and leaves the member lists null — the
    manifest does not record them and the backend never invents names.
    """
    if _registry_loaded(registry):
        from landval.modelling.coverage import shap_coverage_from_weights

        cov = shap_coverage_from_weights(
            getattr(registry, "kept_members", None),
            getattr(registry, "kept_weights", None),
        )
        return ExplainabilityCoverage(
            tree_share_explained_by_shap=cov["tree_share_explained_by_shap"],
            tabnet_share_not_covered=cov["tabnet_share_not_covered"],
            explained_members=cov["explained_members"],
            unexplained_members=cov["unexplained_members"],
            source="recomputed",
        )

    raw: dict[str, Any] = {}
    if isinstance(manifest, dict):
        maybe = manifest.get("ensemble_shap_coverage")
        if isinstance(maybe, dict):
            raw = maybe
    note = raw.get("note") if isinstance(raw.get("note"), str) else None
    return ExplainabilityCoverage(
        tree_share_explained_by_shap=normalise_share(raw.get("tree_share_explained_by_shap")),
        tabnet_share_not_covered=normalise_share(raw.get("tabnet_share_not_covered")),
        explained_members=None,
        unexplained_members=None,
        source="manifest" if raw else None,
        note=note,
    )


def build_models_list(
    shap_df: pd.DataFrame,
    registry: object | None,
) -> tuple[list[ExplainabilityModel], str | None]:
    """Build the member list + default model.

    Members come from the loaded registry when available (the real kept
    members), else from the distinct models in shap_global.csv.  ``has_shap``
    is True for members with rows in shap_global.csv.  Ordering: ensemble
    weight descending (ties + weightless members keep their original order —
    Python's sort is stable); weightless members sort last.  ``default_model``
    is the highest-weight member with SHAP rows (first SHAP-covered member in
    list order when no weights are available); None when no member has SHAP
    rows.
    """
    shap_models: list[str] = []
    if shap_df is not None and "model" in getattr(shap_df, "columns", []):
        for m in shap_df["model"].astype(str):
            if m not in shap_models:
                shap_models.append(m)

    members: list[str] = []
    weights: dict[str, float] = {}
    if _registry_loaded(registry):
        members = [str(m) for m in getattr(registry, "kept_members", None) or []]
        raw_weights = getattr(registry, "kept_weights", None) or {}
        weights = {str(k): float(v) for k, v in raw_weights.items()}
    else:
        members = list(shap_models)

    seen: set[str] = set()
    ordered_members = [m for m in members if not (m in seen or seen.add(m))]

    entries: list[ExplainabilityModel] = []
    for key in ordered_members:
        info = MODEL_INFO.get(key, {})
        entries.append(
            ExplainabilityModel(
                key=key,
                display_name=str(info.get("display_name", key)),
                family=str(info["family"]) if info.get("family") else None,
                ensemble_weight=weights.get(key) if key in weights else None,
                has_shap=key in shap_models,
            )
        )

    # Weight descending; members without a weight keep file/member order after
    # the weighted ones (stable sort).
    entries.sort(
        key=lambda e: (
            e.ensemble_weight is None,
            -(e.ensemble_weight or 0.0),
        )
    )

    default_model: str | None = None
    for e in entries:
        if e.has_shap:
            default_model = e.key
            break

    return entries, default_model


def compute_typical_price(
    registry: object | None,
    explanation_service: object | None,
) -> tuple[float | None, float | None]:
    """The load-time baseline: (combined_base_value, typical_price_per_acre_ksh).

    combined_base = sum over kept tree members of (w_m * base_m) — the same
    quantity every /predict response reports, because TreeExplainer's
    expected value does not depend on the input row.  Requires the registry
    AND the explanation service (the base values come from its cached
    TreeExplainers).  Any failure (shap not installed, member not loaded)
    returns (None, None) — the endpoint then reports the baseline as
    missing rather than inventing one.
    """
    if not _registry_loaded(registry) or explanation_service is None:
        return None, None

    from landval.modelling.coverage import TREE_MEMBERS

    members = [str(m) for m in getattr(registry, "kept_members", None) or []]
    weights = getattr(registry, "kept_weights", None) or {}

    combined_base = 0.0
    n_base = 0
    try:
        for member in members:
            if member not in TREE_MEMBERS:
                continue
            w = float(weights.get(member, 0.0))
            base = float(explanation_service.member_base_value(member))
            combined_base += w * base
            n_base += 1
    except Exception:
        return None, None
    if n_base == 0:
        return None, None

    return round(combined_base, 6), float(math.exp(combined_base))
