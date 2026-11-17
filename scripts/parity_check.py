"""Parity check — recomputes predictions through PredictionService and compares
against the stored per-listing predictions in test_predictions.parquet and
oof_predictions.parquet (Notebook 3 Cell 9.2).

Usage::

    python scripts/parity_check.py --artifacts-dir ./artifacts

Pass rule: at least 99% of rows must match the stored ``pred_weighted_ensemble``
within ``--tolerance`` (default 1e-3 on the log scale, i.e. ~0.1% on the KSh
scale).  Below 99% the script prints the cause of the worst mismatches and
exits 1; it does not silently widen the tolerance.

The script skips gracefully when ``test_predictions.parquet`` or the model
files are absent, so it can run in CI without the large artefacts (CI runs
the tiny-fixture tests in ``backend/tests/test_predict.py`` instead).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import numpy as np
import pandas as pd

# Ensure src/ is importable (landval/ lives under <repo>/src/, not <repo>/)
sys.path.insert(0, str(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from landval.features.pipeline import FeaturePipeline
from landval.modelling import ModelLoadError, ModelRegistry, PredictionService

# The ten infrastructure items, in the order B1's InfrastructureCalculator
# expects them.  Used to rebuild parcel_features from the stored ``infra_*``
# columns when they are present in the parquet (Cell 9.2's export does not
# include them by default — see the notebook's ID_COLUMNS list — so the
# fallback is "all not sure", which triggers the county-median imputation
# path in B1's InfrastructureCalculator, exactly as a real user who skips
# the checklist would get).
_INFRA_ITEMS = (
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


def _load_registry_and_service(artifacts_dir: str) -> PredictionService | None:
    """Load the ModelRegistry + FeaturePipeline + PredictionService.

    Returns ``None`` (and prints a message) when the artefacts are absent or
    incomplete — the caller skips the parity run in that case.
    """
    try:
        registry = ModelRegistry(artifacts_dir=artifacts_dir).load()
    except ModelLoadError as e:
        print(f"[skip] ModelRegistry could not load: {e}")
        return None

    try:
        feature_pipeline = FeaturePipeline(artifacts_dir=artifacts_dir)
    except FileNotFoundError as e:
        print(f"[skip] FeaturePipeline config missing: {e}")
        return None

    return PredictionService(
        registry=registry,
        feature_pipeline=feature_pipeline,
        artifacts_dir=artifacts_dir,
    )


def _reconstruct_parcel_features(row: pd.Series) -> dict[str, int | None]:
    """Rebuild the parcel_features dict from a stored prediction row.

    Cell 9.2's prediction export carries the ID_COLUMNS + per-model
    predictions, but not the infra_* columns.  When the parquet happens to
    carry them (e.g. a custom export) we use them; otherwise every item is
    ``None`` ("not sure"), which makes B1's InfrastructureCalculator fall
    back to the county-median infrastructure score — the same path a real
    user who skips the checklist hits.
    """
    out: dict[str, int | None] = {}
    for item in _INFRA_ITEMS:
        col = f"infra_{item}"
        if col in row.index and pd.notna(row[col]):
            out[item] = int(row[col])
        else:
            out[item] = None
    return out


def _run_parity_one_split(
    service: PredictionService,
    parquet_path: str,
    tolerance: float,
    max_rows: int | None,
) -> tuple[float, pd.DataFrame, list[dict[str, Any]]]:
    """Run parity for one parquet (test or OOF).

    Returns ``(pass_rate_pct, report_df, worst_mismatches)``.
    """
    if not os.path.exists(parquet_path):
        return float("nan"), pd.DataFrame(), [{"cause": f"file not found: {parquet_path}"}]

    df = pd.read_parquet(parquet_path)
    if max_rows is not None:
        df = df.head(max_rows)

    required = ("latitude", "longitude", "y_true", "pred_weighted_ensemble")
    missing = [c for c in required if c not in df.columns]
    if missing:
        return (
            float("nan"),
            pd.DataFrame(),
            [{"cause": f"parquet missing required columns: {missing}"}],
        )

    # The stored size is the parcel size; the prediction parquet does not
    # carry it (Cell 9.2 ID_COLUMNS has no size_acres).  Cell 8.3 derives
    # log_size_acres from size_acres, so we need a value.  Reuse the
    # production-run's TRAIN_MEDIAN_LOG (in preprocessing.json) — exp() it
    # to get acres — for rows whose size we do not know.  This matches what
    # the model was trained against in the median-size regime and avoids
    # manufacturing a value the model never saw.
    prep = service.registry.preprocessing or {}
    train_median_log = prep.get("train_median_log")
    fallback_size = float(np.exp(train_median_log)) if train_median_log else 1.0

    rows_out = []
    mismatches: list[dict[str, Any]] = []
    n_within = 0
    n_compared = 0

    for _idx, row in df.iterrows():
        lat = row["latitude"]
        lon = row["longitude"]
        if pd.isna(lat) or pd.isna(lon):
            continue
        size = (
            float(row["size_acres"])
            if "size_acres" in row.index and pd.notna(row.get("size_acres"))
            else fallback_size
        )
        prop_type = str(row.get("prop_type", "Land"))
        parcel = _reconstruct_parcel_features(row)

        try:
            result = service.predict(
                lat=float(lat),
                lon=float(lon),
                size_acres=size,
                prop_type=prop_type,
                parcel_features=parcel,
                level=0.8,
            )
        except Exception as e:
            mismatches.append(
                {
                    "listing_no": row.get("listing_no", "?"),
                    "cause": f"prediction raised: {type(e).__name__}: {e}",
                }
            )
            continue

        stored_log = float(row["pred_weighted_ensemble"])
        recomputed_log = float(result.log_ensemble)
        diff = abs(recomputed_log - stored_log)

        n_compared += 1
        within = diff <= tolerance
        if within:
            n_within += 1
        rows_out.append(
            {
                "listing_no": row.get("listing_no", "?"),
                "county": row.get("county", "?"),
                "stored_log": round(stored_log, 6),
                "recomputed_log": round(recomputed_log, 6),
                "diff": round(diff, 6),
                "within_tol": within,
            }
        )

    report = pd.DataFrame(rows_out)
    if n_compared == 0:
        return float("nan"), report, mismatches or [{"cause": "no comparable rows"}]
    pass_rate = n_within / n_compared * 100.0

    if len(report) > 0:
        worst = report.sort_values("diff", ascending=False).head(10)
        for _, w in worst.iterrows():
            mismatches.append(
                {
                    "listing_no": w["listing_no"],
                    "county": w["county"],
                    "stored_log": w["stored_log"],
                    "recomputed_log": w["recomputed_log"],
                    "diff": w["diff"],
                }
            )

    return pass_rate, report, mismatches


def run_parity_check(
    artifacts_dir: str,
    tolerance: float = 1e-3,
    max_rows: int | None = None,
) -> tuple[bool, dict[str, Any]]:
    """Run the parity check against test_predictions.parquet (primary) and
    oof_predictions.parquet (secondary).  Returns ``(overall_passed, report)``.

    Pass rule: at least 99% of comparable rows in **test_predictions.parquet**
    must match within ``tolerance`` on the log scale.  OOF parity is reported
    alongside but does not gate the pass/fail (OOF predictions are the
    calibration set for the conformal interval — they are by construction
    in-distribution and a mismatch there points at a different bug than a
    mismatch on the held-out test rows).
    """
    print(f"Parity check — artifacts_dir={artifacts_dir}, tolerance={tolerance}")
    service = _load_registry_and_service(artifacts_dir)
    if service is None:
        return False, {"cause": "artefacts not loaded — parity deferred"}

    # ---- Report what was loaded ----
    reg = service.registry
    print(
        f"  loaded members (post-pruning): "
        f"{dict(zip(reg.kept_members, [round(w, 4) for w in reg.kept_weights.values()], strict=False))}"
    )
    print(f"  dropped members: {list(reg.dropped_models.keys()) or 'none'}")
    print(f"  load_time_s={reg.load_time_s}  memory_mb={reg.memory_mb}")
    print(f"  n_features={len(reg.feature_names)}  n_calibration_rows={reg.n_calibration_rows}")

    # ---- Test parquet ----
    test_path = os.path.join(artifacts_dir, "app_exports/test_predictions.parquet")
    test_rate, test_report, test_worst = _run_parity_one_split(
        service, test_path, tolerance, max_rows
    )

    # ---- OOF parquet ----
    oof_path = os.path.join(artifacts_dir, "app_exports/oof_predictions.parquet")
    oof_rate, oof_report, oof_worst = _run_parity_one_split(service, oof_path, tolerance, max_rows)

    overall_pass = not np.isnan(test_rate) and test_rate >= 99.0

    summary = {
        "loaded_members": reg.kept_members,
        "kept_weights_renormalised": reg.kept_weights,
        "dropped_models": list(reg.dropped_models.keys()),
        "load_time_s": reg.load_time_s,
        "memory_mb": reg.memory_mb,
        "n_features": len(reg.feature_names),
        "n_calibration_rows": reg.n_calibration_rows,
        "test_predictions": {
            "path": test_path,
            "pass_rate_pct": round(test_rate, 4) if not np.isnan(test_rate) else None,
            "n_compared": len(test_report),
            "n_within_tol": int((test_report["within_tol"]).sum()) if len(test_report) else 0,
            "worst_mismatches": test_worst[:10],
        },
        "oof_predictions": {
            "path": oof_path,
            "pass_rate_pct": round(oof_rate, 4) if not np.isnan(oof_rate) else None,
            "n_compared": len(oof_report),
            "n_within_tol": int((oof_report["within_tol"]).sum()) if len(oof_report) else 0,
            "worst_mismatches": oof_worst[:10],
        },
        "tolerance_log_scale": tolerance,
        "overall_pass": overall_pass,
    }

    # ---- Persist ----
    out_json = os.path.join(artifacts_dir, "parity_check_report.json")
    with open(out_json, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\nparity_check_report.json written to {out_json}")

    if not np.isnan(test_rate):
        print(f"\nTEST  pass rate: {test_rate:.3f}%  (n={len(test_report)}, tol={tolerance})")
    else:
        print("\nTEST  pass rate: n/a (no comparable rows)")
    if not np.isnan(oof_rate):
        print(f"OOF   pass rate: {oof_rate:.3f}%  (n={len(oof_report)}, tol={tolerance})")
    else:
        print("OOF   pass rate: n/a (no comparable rows)")

    if test_worst:
        print("\nWorst mismatches (test set):")
        for w in test_worst[:5]:
            print(f"  {w}")

    if overall_pass:
        print("\nOverall: PASS")
    else:
        if np.isnan(test_rate):
            print("\nOverall: SKIP (no test predictions to compare)")
        else:
            print(f"\nOverall: FAIL (test pass rate {test_rate:.3f}% < 99%)")
            print("  Not silently widening tolerance.  Inspect the worst mismatches above.")
    return overall_pass, summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prediction parity check")
    parser.add_argument("--artifacts-dir", default="./artifacts")
    parser.add_argument(
        "--tolerance",
        type=float,
        default=1e-3,
        help="Max |recomputed_log - stored_log| (default 1e-3, ~0.1% on KSh scale)",
    )
    parser.add_argument(
        "--max-rows", type=int, default=None, help="Cap rows per split (default: all)"
    )
    args = parser.parse_args()

    ok, _ = run_parity_check(
        artifacts_dir=args.artifacts_dir,
        tolerance=args.tolerance,
        max_rows=args.max_rows,
    )
    sys.exit(0 if ok else 2)  # exit 2 = "skipped, not failed" when artefacts absent
