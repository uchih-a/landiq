"""LiveExplanationService — per-request SHAP driver breakdown.

Builds ``shap.TreeExplainer`` against the loaded XGBoost and CatBoost models
(**not TabNet — it isn't tree-based**) on the single computed feature row,
combines member SHAP values using the SAME renormalised weights
``PredictionService`` used (the post-pruning weights from
``serving_manifest.json``), and turns each into a money-effect label via
``explain_spec.md``'s rule:

    effect(f) = exp(s_f) - 1

i.e. the multiplicative change in the typical price per acre attributable
to feature f for that listing.  Positive s_f → price-increasing;
negative → price-decreasing.

The combined per-feature SHAP value is the weighted sum of the member
SHAP values, exactly as Cell 9.4's additivity note describes:

    combined_s_f = sum over tree members m of (w_m * s_m_f)
    combined_base = sum over tree members m of (w_m * base_m)
    tree_part(log_ens) = combined_base + sum_f combined_s_f

The "shares" returned are recomputed from whichever members actually got
loaded (after pruning), NOT the notebook's static numbers from
``manifest.json:ensemble_shap_coverage``:

    tree_share_explained_by_shap = w_xgb + w_cat   (sum of tree-member weights)
    tabnet_share_not_covered      = w_tab           (0 if TabNet was pruned)

If TabNet was pruned (typical case), ``tree_share`` is 1.0 and the SHAP
values explain the entire ensemble.  If TabNet was kept, the tree share
covers only its fraction of the blend; the TabNet fraction is the
unexplained residual.

This is a **live** computation per request — not a lookup in
``shap_values.parquet`` (which covers only the modelling-set rows, not
arbitrary new map points).  ``shap.TreeExplainer`` is exact for tree
models and cheap to rebuild at first use; ``shap_values()`` on a single
row is sub-millisecond to a few milliseconds.  Per-request latency is
measured and returned in the response so the operator can see it.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from landval.modelling.registry import ModelRegistry

# Cell 9.10 — the rule for turning a SHAP value into a money effect.
# Hardcoded from explain_spec.md (the file is documentation for the app;
# the rule itself is too small to parse from markdown every request).
#   effect(f) = exp(s_f) - 1   (multiplicative change in typical price per acre)
# Cell 9.4 — the log-scale ensemble is a weighted average, so the weighted
# sum of member SHAP values explains the tree-model part of the ensemble
# exactly; TabNet's share is not covered.

# Tree models that shap.TreeExplainer supports.  TabNet is excluded by
# construction — it's a neural net, not a tree model.
TREE_MEMBERS = ("xgb", "catboost")


@dataclass
class DriverContribution:
    """One feature's contribution to the prediction."""

    feature: str
    label: str
    shap_value: float  # combined, log scale
    effect_pct: float  # (exp(shap_value) - 1) * 100
    direction: str  # "price-increasing" / "price-decreasing" / "neutral"

    def to_dict(self) -> dict[str, Any]:
        return {
            "feature": self.feature,
            "label": self.label,
            "shap_value": self.shap_value,
            "effect_pct": self.effect_pct,
            "direction": self.direction,
        }


@dataclass
class LiveExplanationResult:
    """The full live-explanation payload (driver breakdown + shares)."""

    drivers: list[DriverContribution] = field(default_factory=list)
    # ---- Recomputed from whichever members actually got loaded ----
    tree_share_explained_by_shap: float = 0.0
    tabnet_share_not_covered: float = 0.0
    # ---- Combined base value (log scale) and typical price ----
    combined_base_value: float = 0.0
    typical_price_per_acre_ksh: float = 0.0
    # ---- Latency ----
    latency_ms: float = 0.0
    # ---- Diagnostics ----
    explained_members: list[str] = field(default_factory=list)
    unexplained_members: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "drivers": [d.to_dict() for d in self.drivers],
            "tree_share_explained_by_shap": self.tree_share_explained_by_shap,
            "tabnet_share_not_covered": self.tabnet_share_not_covered,
            "combined_base_value": self.combined_base_value,
            "typical_price_per_acre_ksh": self.typical_price_per_acre_ksh,
            "latency_ms": self.latency_ms,
            "explained_members": self.explained_members,
            "unexplained_members": self.unexplained_members,
        }


class LiveExplanationService:
    """One instance per process — holds the loaded registry + feature labels.

    Parameters
    ----------
    registry : ModelRegistry
        Already-loaded ensemble (must be ``loaded=True`` and contain at
        least one tree member — xgb or catboost).
    feature_labels_json : dict | None
        Parsed ``app_exports/feature_labels.json`` (Cell 9.4).  When
        ``None`` or missing a feature, the label falls back to the raw
        feature name.
    top_n : int
        How many drivers to return (sorted by |shap_value| descending).
        Default 10.
    """

    def __init__(
        self,
        registry: ModelRegistry,
        feature_labels_json: dict[str, Any] | None,
        top_n: int = 10,
    ):
        self.registry = registry
        self.top_n = int(top_n)
        # feature_labels.json:features is a dict {feature_name: {label, unit, ...}}.
        if isinstance(feature_labels_json, dict):
            self._labels: dict[str, Any] = feature_labels_json.get("features", {})
        else:
            self._labels = {}
        # Lazy: built on first explain() call, cached for the process lifetime.
        # shap.TreeExplainer is deterministic for a given model, so caching is safe.
        self._explainers: dict[str, Any] = {}

    # ------------------------------------------------------------------ public
    def explain(self, frame: pd.DataFrame) -> LiveExplanationResult:
        """Compute the live driver breakdown for one prepared input row.

        ``frame`` is the same DataFrame ``PredictionService.predict()``
        builds (Cell 8.3's ``_prepare_input_frame`` output) — same columns,
        same order, one row.  Reusing it avoids recomputing the derived
        features (``log_size_acres`` etc.) and guarantees the SHAP values
        align with the prediction's feature order.
        """
        t0 = time.perf_counter()

        prep = self.registry.preprocessor
        if prep is None:
            raise RuntimeError(
                "LiveExplanationService: registry.preprocessor is None — "
                "PipelinePreprocessor not loaded."
            )

        weights = self.registry.kept_weights  # {member: renormalised weight}
        feature_names = list(self.registry.feature_names)

        # ---- Per-tree-member SHAP values + base values ----
        member_shap: dict[str, tuple[np.ndarray, float]] = {}
        for member in self.registry.kept_members:
            if member not in TREE_MEMBERS:
                continue  # TabNet is not tree-based; shap.TreeExplainer cannot explain it.
            if member not in self.registry.models:
                continue  # safety net — should not happen if registry loaded
            expl = self._get_explainer(member)
            # Cell 9.4: transform_xgb for xgb (categoricals as pandas category),
            # transform_catboost for catboost (plain strings, NaNs kept).
            X = prep.transform_xgb(frame) if member == "xgb" else prep.transform_catboost(frame)
            sv = np.asarray(expl.shap_values(X), float)
            # shap_values can be (1, n_features) or (n_features,) for one-row
            # regression input — ravel to a flat 1-D array of length n_features.
            sv = sv.ravel()
            base = float(np.asarray(expl.expected_value, float).ravel()[0])
            member_shap[member] = (sv, base)

        # ---- Combine: weighted sum using the SAME renormalised weights ----
        # Cell 9.4: log_ens = sum_i w_i * (base_i + sum_f s_i_f)
        #         = (sum_i w_i * base_i) + sum_f (sum_i w_i * s_i_f)
        # Tree members contribute their (w * base) and (w * s_f); TabNet
        # contributes nothing to the SHAP-explained part but its weight is
        # reported as the unexplained share.
        combined_shap = np.zeros(len(feature_names), dtype=float)
        combined_base = 0.0
        tree_share = 0.0
        tabnet_share = 0.0
        explained_members: list[str] = []
        unexplained_members: list[str] = []

        for member in self.registry.kept_members:
            w = float(weights.get(member, 0.0))
            if member in member_shap:
                sv, base = member_shap[member]
                combined_shap += w * sv
                combined_base += w * base
                tree_share += w
                explained_members.append(member)
            else:
                tabnet_share += w
                unexplained_members.append(member)

        # ---- Money-effect rule (explain_spec.md, Cell 9.10) ----
        # effect(f) = exp(s_f) - 1
        drivers: list[DriverContribution] = []
        for i, feat in enumerate(feature_names):
            s_f = float(combined_shap[i])
            effect_pct = (math.exp(s_f) - 1.0) * 100.0
            if s_f > 1e-9:
                direction = "price-increasing"
            elif s_f < -1e-9:
                direction = "price-decreasing"
            else:
                direction = "neutral"
            label_info = self._labels.get(feat, {}) if isinstance(self._labels, dict) else {}
            label = str(label_info.get("label", feat)) if isinstance(label_info, dict) else feat
            drivers.append(
                DriverContribution(
                    feature=feat,
                    label=label,
                    shap_value=s_f,
                    effect_pct=effect_pct,
                    direction=direction,
                )
            )

        # Sort by |shap_value| descending; take top_n
        drivers.sort(key=lambda d: abs(d.shap_value), reverse=True)
        top = drivers[: self.top_n]

        latency_ms = round((time.perf_counter() - t0) * 1000.0, 3)
        typical_price = float(np.exp(combined_base)) if combined_base != 0.0 else 0.0

        return LiveExplanationResult(
            drivers=top,
            tree_share_explained_by_shap=round(tree_share, 6),
            tabnet_share_not_covered=round(tabnet_share, 6),
            combined_base_value=round(combined_base, 6),
            typical_price_per_acre_ksh=typical_price,
            latency_ms=latency_ms,
            explained_members=explained_members,
            unexplained_members=unexplained_members,
        )

    # ------------------------------------------------------------------ priv
    def _get_explainer(self, member: str) -> Any:
        """Build (once) and cache the TreeExplainer for ``member``.

        ``shap.TreeExplainer`` is exact for tree models and deterministic
        for a given booster, so caching is safe.  First-call cost is a few
        ms; subsequent calls hit the cache.
        """
        if member not in self._explainers:
            import shap  # local import — shap is heavy and optional in CI

            model = self.registry.models[member]
            self._explainers[member] = shap.TreeExplainer(model)
        return self._explainers[member]
