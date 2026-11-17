"""PredictionService — reproduces Notebook 3 Cell 8.3 + Cell 9.1 verbatim.

The service combines B1's feature pipeline (``FeaturePipeline.compute_features``)
with the loaded ensemble from ``ModelRegistry`` to produce, for one map point:

  1. the weighted ensemble **log-scale** prediction (Cell 8.3's
     ``sum(w[i] * log_preds[k] for i, k in enumerate(model_order))``);
  2. the multiplicative split-conformal confidence range at a requested level
     (Cell 9.1's ``exp(log_ens +/- q)`` on the KSh/acre scale);
  3. a total parcel price estimate (per-acre point and bounds multiplied by
     ``size_acres``);
  4. a low-support warning derived from ``coverage_rules.json`` (county listing
     count and listings within ``COVERAGE_RADIUS_KM`` of the point).

The math is copied line-for-line from the notebook — see the inline comments
citing Cell 8.3 and Cell 9.1 — so a saved test prediction round-trips through
this service within the parity tolerance checked by ``scripts/parity_check.py``.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from landval.features.geo import haversine_km_vectorised
from landval.features.pipeline import FeaturePipeline
from landval.modelling.registry import ModelRegistry


@dataclass
class CoverageWarning:
    """Low-support flag returned alongside every prediction."""

    is_low_support: bool
    county_listings: int
    nearby_listings: int
    radius_km: int
    min_county_n: int
    min_nearby_n: int
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_low_support": self.is_low_support,
            "county_listings": self.county_listings,
            "nearby_listings": self.nearby_listings,
            "radius_km": self.radius_km,
            "min_county_n": self.min_county_n,
            "min_nearby_n": self.min_nearby_n,
            "reason": self.reason,
        }


@dataclass
class PredictionResult:
    """The full prediction response (Cell 8.3 + Cell 9.1 + total + warning)."""

    # ---- Per-acre (KSh) ----
    price_per_acre_ksh: float
    price_per_acre_low_ksh: float
    price_per_acre_high_ksh: float
    # ---- Total parcel (KSh) ----
    total_price_ksh: float
    total_price_low_ksh: float
    total_price_high_ksh: float
    # ---- Confidence level actually used ----
    confidence_level: float
    # ---- Geo context ----
    county: str | None
    coverage: CoverageWarning
    # ---- Diagnostics from B1 (nearest places, infra source) ----
    diagnostics: dict[str, Any] = field(default_factory=dict)
    # ---- Per-member log predictions (debug / SHAP-proxy) ----
    log_predictions: dict[str, float] = field(default_factory=dict)
    log_ensemble: float = 0.0
    conformal_q: float = 0.0
    # ---- Which members contributed ----
    ensemble_members: dict[str, float] = field(default_factory=dict)
    # ---- The prepared input frame (one row) — handed to LiveExplanationService
    # so it can re-transform for SHAP without recomputing derived features.
    # NOT serialised by the Pydantic response model (it stays server-side).
    frame: pd.DataFrame | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "price_per_acre_ksh": self.price_per_acre_ksh,
            "price_per_acre_low_ksh": self.price_per_acre_low_ksh,
            "price_per_acre_high_ksh": self.price_per_acre_high_ksh,
            "total_price_ksh": self.total_price_ksh,
            "total_price_low_ksh": self.total_price_low_ksh,
            "total_price_high_ksh": self.total_price_high_ksh,
            "confidence_level": self.confidence_level,
            "county": self.county,
            "coverage": self.coverage.to_dict(),
            "diagnostics": self.diagnostics,
            "log_predictions": self.log_predictions,
            "log_ensemble": self.log_ensemble,
            "conformal_q": self.conformal_q,
            "ensemble_members": self.ensemble_members,
        }


class PredictionService:
    """One instance per process — holds the loaded registry + feature pipeline.

    Parameters
    ----------
    registry : ModelRegistry
        Already-loaded ensemble (must be ``loaded=True``).
    feature_pipeline : FeaturePipeline
        B1's pipeline (already initialised with the same ``artifacts_dir``).
    artifacts_dir : str
        Used to locate ``oof_predictions.parquet`` and ``test_predictions.parquet``
        for the support counts and the on-demand conformal q computation.
    """

    def __init__(
        self,
        registry: ModelRegistry,
        feature_pipeline: FeaturePipeline,
        artifacts_dir: str,
    ):
        self.registry = registry
        self.pipeline = feature_pipeline
        self.artifacts_dir = artifacts_dir
        # Lazy-loaded: the modelling-frame coordinates + county counts used
        # for the 50km nearby check and the county listing count.
        self._support_frame: pd.DataFrame | None = None
        # Lazy-loaded: OOF residuals (sorted) for the on-demand conformal q.
        self._abs_resid_sorted: np.ndarray | None = None
        self._n_cal: int = registry.n_calibration_rows

    # ------------------------------------------------------------------ public
    def predict(
        self,
        lat: float,
        lon: float,
        size_acres: float,
        prop_type: str = "Land",
        parcel_features: dict[str, int | None] | None = None,
        level: float = 0.8,
    ) -> PredictionResult:
        """Point estimate + multiplicative confidence range, in KSh.

        ``level`` defaults to 0.8 (the app's standard 80% range).  Any value
        in (0, 1) is accepted; the conformal q is taken from the exported
        ``conformal.json`` for the three calibrated levels (0.50, 0.80, 0.90)
        and recomputed from the OOF residuals for any other level — exactly
        as Cell 9.1's ``conformal_q_for`` does.
        """
        # ---- 1. features via B1 ----
        feat = self.pipeline.compute_features(
            lat=lat,
            lon=lon,
            size_acres=size_acres,
            prop_type=prop_type,
            parcel_features=parcel_features,
        )
        features_dict: dict[str, Any] = dict(feat.features)
        features_dict["size_acres"] = size_acres  # Cell 8.3 derives log_size_acres from this

        # ---- 2. build the input frame exactly as Cell 8.3's _prepare_input_frame ----
        frame = self._prepare_input_frame(features_dict, size_acres=size_acres)
        stack = {
            "features": self.registry.feature_names,
            "prep": self.registry.preprocessor,
            "tabnet_target": self.registry.tabnet_target,
            "models": self.registry.models,
            "model_order": self.registry.model_order,
            "weights": self.registry.weights_array,
        }

        # ---- 3. weighted ensemble log-scale prediction (Cell 8.3) ----
        log_preds = self._member_log_predictions(frame, stack)
        w = stack["weights"]
        # Cell 8.3: log_ens = sum(w[i] * log_preds[k] for i, k in enumerate(model_order))
        # The result is a length-1 numpy array (one-row frame); extract the
        # scalar with .item() to avoid the NumPy 1.25 deprecation on
        # float(ndarray) and to keep the rest of the function scalar-typed.
        log_ens_arr = sum(w[i] * log_preds[k] for i, k in enumerate(stack["model_order"]))
        log_ens = float(np.asarray(log_ens_arr).ravel()[0])
        ppa = float(np.exp(log_ens))  # median KSh per acre

        # ---- 4. conformal interval (Cell 9.1) ----
        q = self._conformal_q_for(level)
        ppa_low = float(np.exp(log_ens - q))
        ppa_high = float(np.exp(log_ens + q))

        # ---- 5. total parcel price (Cell 8.3 * size; Cell 9.1 multiplies bounds) ----
        size = float(size_acres)
        total = ppa * size
        total_low = ppa_low * size
        total_high = ppa_high * size

        # ---- 6. low-support flag (Cell 9.9 rules) ----
        coverage = self._coverage_warning(lat, lon, feat.county)

        return PredictionResult(
            price_per_acre_ksh=ppa,
            price_per_acre_low_ksh=ppa_low,
            price_per_acre_high_ksh=ppa_high,
            total_price_ksh=total,
            total_price_low_ksh=total_low,
            total_price_high_ksh=total_high,
            confidence_level=level,
            county=feat.county,
            coverage=coverage,
            diagnostics=feat.diagnostics,
            log_predictions={
                k: float(v[0]) if hasattr(v, "__len__") else float(v) for k, v in log_preds.items()
            },
            log_ensemble=log_ens,
            conformal_q=q,
            ensemble_members=dict(self.registry.kept_weights),
            # The prepared input frame (one row, production feature columns
            # + size_acres) — handed to LiveExplanationService so it can
            # re-transform for SHAP without recomputing derived features.
            frame=frame,
        )

    # ------------------------------------------------------------------ Cell 8.3
    def _prepare_input_frame(
        self, features: dict[str, Any], size_acres: float | None = None
    ) -> pd.DataFrame:
        """Verbatim port of Cell 8.3's ``_prepare_input_frame``.

        Only the dict-input branch is needed at serving time (the parity test
        reuses the same path through ``compute_features``).
        """
        needed = list(self.registry.feature_names)
        frame = pd.DataFrame([features])
        if size_acres is not None and "size_acres" not in frame.columns:
            frame["size_acres"] = size_acres
        # Derived features a caller may reasonably supply indirectly — Cell 8.3.
        if (
            "log_size_acres" in needed
            and "log_size_acres" not in frame.columns
            and "size_acres" in frame.columns
        ):
            frame["log_size_acres"] = np.log(frame["size_acres"].astype(float))
        if (
            "listing_year" in needed
            and "listing_year" not in frame.columns
            and "list_date" in frame.columns
        ):
            _dt = pd.to_datetime(frame["list_date"], errors="coerce")
            frame["listing_year"] = _dt.dt.year.astype(float)
            frame["listing_month"] = _dt.dt.month.astype(float)
        if (
            "has_water_body_distance" in needed
            and "has_water_body_distance" not in frame.columns
            and "dist_to_water_body_km" in frame.columns
        ):
            frame["has_water_body_distance"] = frame["dist_to_water_body_km"].notna().astype(int)
        missing = [c for c in needed if c not in frame.columns]
        if missing:
            raise ValueError(
                f"PredictionService: missing required feature columns: {missing}. "
                f"Required: {needed}. The feature pipeline should supply every "
                "production feature listed in serving_manifest.json."
            )
        cols = needed + (["size_acres"] if "size_acres" in frame.columns else [])
        return frame[cols]

    def _member_log_predictions(
        self, frame: pd.DataFrame, stack: dict[str, Any]
    ) -> dict[str, np.ndarray]:
        """Per-member log-scale predictions, exactly as Cell 8.3 computes them.

        XGBoost and CatBoost keep numeric NaNs untouched (their preprocessor
        views leave them as NaN, both learners handle missing values
        natively).  TabNet's view imputes with training medians and
        standardises — the output is on the standardised scale and must be
        multiplied by ``tabnet_target_std`` and shifted by
        ``tabnet_target_mean`` to return to the log-KSh-per-acre scale.
        """
        prep = stack["prep"]
        log_preds: dict[str, np.ndarray] = {}
        if "xgb" in stack["models"]:
            log_preds["xgb"] = np.asarray(
                stack["models"]["xgb"].predict(prep.transform_xgb(frame)), float
            )
        if "catboost" in stack["models"]:
            log_preds["catboost"] = np.asarray(
                stack["models"]["catboost"].predict(prep.transform_catboost(frame)), float
            )
        if "tabnet" in stack["models"]:
            tt = stack["tabnet_target"]
            tab_in = prep.transform_tabnet(frame).values.astype(np.float32)
            raw = np.asarray(stack["models"]["tabnet"].predict(tab_in), float).ravel()
            # Cell 8.3: tabnet.predict(...).ravel() * std + mean
            log_preds["tabnet"] = raw * float(tt["tabnet_target_std"]) + float(
                tt["tabnet_target_mean"]
            )
        return log_preds

    # ------------------------------------------------------------------ Cell 9.1
    def _conformal_q_for(self, level: float) -> float:
        """Cell 9.1's ``conformal_q_for``.

        For the three calibrated levels (0.50 / 0.80 / 0.90) the q exported in
        ``conformal.json`` is used directly — it was computed on the same OOF
        residuals by the notebook, so reusing it is byte-identical.

        For any other level in (0, 1) the q is recomputed from the OOF
        residuals (loaded lazily from ``oof_predictions.parquet``) using the
        notebook's exact formula:
        ``k = min(ceil((n+1)*level), n); q = abs_resid_sorted[k-1]``.
        """
        if not 0.0 < level < 1.0:
            raise ValueError(f"confidence level must be strictly between 0 and 1, got {level}")
        cached = self.registry.conformal_q(level)
        if cached is not None:
            return cached
        # Recompute from OOF residuals — Cell 9.1's formula.
        abs_resid = self._oof_abs_resid_sorted()
        n = len(abs_resid)
        if n == 0:
            raise RuntimeError("cannot recompute conformal q: oof_predictions.parquet not loaded")
        k = min(int(math.ceil((n + 1) * level)), n)
        return float(abs_resid[k - 1])

    def _oof_abs_resid_sorted(self) -> np.ndarray:
        """Lazily load the OOF residuals and sort them ascending.

        Uses ``y_true`` and ``pred_weighted_ensemble`` from
        ``app_exports/oof_predictions.parquet`` (Cell 9.2) — these are the
        production run's development-set OOF predictions, the same set Cell
        9.1 calibrated on.
        """
        if self._abs_resid_sorted is not None:
            return self._abs_resid_sorted
        path = os.path.join(self.artifacts_dir, "app_exports/oof_predictions.parquet")
        if not os.path.exists(path):
            self._abs_resid_sorted = np.asarray([], dtype=float)
            return self._abs_resid_sorted
        df = pd.read_parquet(path)
        y = df["y_true"].to_numpy(dtype=float)
        p = df["pred_weighted_ensemble"].to_numpy(dtype=float)
        abs_resid = np.sort(np.abs(y - p))
        self._abs_resid_sorted = abs_resid
        self._n_cal = len(abs_resid)
        return self._abs_resid_sorted

    # ------------------------------------------------------------------ Cell 9.9
    def _coverage_warning(self, lat: float, lon: float, county: str | None) -> CoverageWarning:
        """Cell 9.9 rule: a point is covered when its county has at least
        ``COVERAGE_MIN_COUNTY_N`` listings AND at least
        ``COVERAGE_MIN_NEARBY_N`` listings within ``COVERAGE_RADIUS_KM`` km.
        """
        rules = self.registry.coverage_rules or {}
        min_county = int(rules.get("COVERAGE_MIN_COUNTY_N", 10))
        min_nearby = int(rules.get("COVERAGE_MIN_NEARBY_N", 5))
        radius = int(rules.get("COVERAGE_RADIUS_KM", 50))

        sf = self._support_table()
        if sf is None or len(sf) == 0:
            # No support table -> cannot prove coverage -> low-support.
            return CoverageWarning(
                is_low_support=True,
                county_listings=0,
                nearby_listings=0,
                radius_km=radius,
                min_county_n=min_county,
                min_nearby_n=min_nearby,
                reason="support table not loaded — cannot confirm coverage",
            )

        county_n = 0
        if county is not None:
            county_n = int((sf["county"] == county).sum())

        nearby_n = self._listings_within_radius(sf, lat, lon, radius)

        reasons = []
        if county_n < min_county:
            reasons.append(
                f"county listings ({county_n}) below COVERAGE_MIN_COUNTY_N ({min_county})"
            )
        if nearby_n < min_nearby:
            reasons.append(
                f"nearby listings within {radius} km ({nearby_n}) below "
                f"COVERAGE_MIN_NEARBY_N ({min_nearby})"
            )
        return CoverageWarning(
            is_low_support=bool(reasons),
            county_listings=county_n,
            nearby_listings=nearby_n,
            radius_km=radius,
            min_county_n=min_county,
            min_nearby_n=min_nearby,
            reason="; ".join(reasons) if reasons else "",
        )

    def _support_table(self) -> pd.DataFrame | None:
        """Concatenate oof + test predictions (identifier columns + county +
        latitude + longitude) — the modelling-frame rows Cell 9.9 counts on.

        Cell 9.9 ``support_counted_on`` is "the full modelling frame (matches
        county_summary.csv)"; the OOF + test parquets together cover the
        modelling frame (development rows are OOF; test rows are the held-out
        test set; the two are disjoint positions of the modelling frame —
        Cell 9.2 asserts this).
        """
        if self._support_frame is not None:
            return self._support_frame
        cols = ["county", "latitude", "longitude"]
        frames = []
        for name in ("oof_predictions.parquet", "test_predictions.parquet"):
            path = os.path.join(self.artifacts_dir, f"app_exports/{name}")
            if os.path.exists(path):
                df = pd.read_parquet(path, columns=cols)
                frames.append(df)
        if not frames:
            self._support_frame = None
            return None
        self._support_frame = pd.concat(frames, ignore_index=True)
        return self._support_frame

    @staticmethod
    def _listings_within_radius(sf: pd.DataFrame, lat: float, lon: float, radius_km: int) -> int:
        """Count modelling-frame rows whose haversine distance to (lat, lon)
        is <= ``radius_km``.  Uses the same vectorised haversine as B1
        (``landval.features.geo.haversine_km_vectorised``) and the same earth
        radius (6371.0 km) Cell 9.9 uses for its pairwise distance matrix.
        """
        valid = sf["latitude"].notna() & sf["longitude"].notna()
        if not valid.any():
            return 0
        lats = sf["latitude"].to_numpy(dtype=float)[valid.to_numpy()]
        lons = sf["longitude"].to_numpy(dtype=float)[valid.to_numpy()]
        dists = haversine_km_vectorised(lats, lons, lat, lon)
        # Exclude the exact point itself when (lat, lon) is one of the
        # modelling rows — Cell 9.9 subtracts 1 from the self-distance.
        # We approximate "exact point" by distance < 1 m.
        within = (dists <= float(radius_km)) & (dists > 1e-4)
        return int(within.sum())
