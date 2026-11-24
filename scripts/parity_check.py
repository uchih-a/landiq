"""Parity check — recomputes predictions through PredictionService and compares
against the stored per-listing predictions in test_predictions.parquet and
oof_predictions.parquet (Notebook 3 Cell 9.2).

Usage::

    python scripts/parity_check.py --artifacts-dir ./artifacts

Size handling (FIXED).  The parcel size for every row comes from
``parity_fixture.parquet`` joined on ``listing_no`` (compared as str);
``size_acres = exp(log_size_acres)`` and the parcel checklist is rebuilt from
the fixture row's ``infra_*`` columns.  A row with **no fixture match** or a
**NaN log_size_acres** is skipped and counted in the report as
``skipped_no_size`` — the script never invents a size.  (The previous
implementation fell back to ``exp(train_median_log)`` from preprocessing.json,
but ``train_median_log`` is the median of the TARGET (log price per acre,
~17.37), not of size — every row received a ~35,000,000-acre parcel, which is
invalid for any model that uses ``log_size_acres``.)

Three parity layers are checked per row and in aggregate:

  (a) FEATURE parity — the backend-computed value (``result.frame``) vs the
      fixture value for every name in ``registry.feature_names`` except
      ``log_size_acres`` (which is an *input* here, supplied from the
      fixture, not an output to verify);
  (b) MEMBER parity — ``result.log_predictions[k]`` vs the stored
      ``pred_xgb`` / ``pred_catboost`` / ``pred_tabnet``;
  (c) ENSEMBLE parity — ``result.log_ensemble`` vs ``pred_weighted_ensemble``.

A pass-rate line is printed for each feature, each member, and the ensemble,
so a failure shows which layer diverges.

Pass rule (unchanged): at least 99% of comparable rows in
**test_predictions.parquet** must match the stored ``pred_weighted_ensemble``
within ``--tolerance`` (default 1e-3 on the log scale, i.e. ~0.1% on the KSh
scale).  Below 99% the script prints the cause of the worst mismatches and
exits 1; it never silently widens the tolerance.

The script skips gracefully when ``test_predictions.parquet``, the model
files or ``parity_fixture.parquet`` are absent, so it can run in CI without
the large artefacts (CI runs the tiny-fixture tests in
``backend/tests/test_parity_check.py`` instead).
"""

from __future__ import annotations

import argparse
import json
import math
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
# expects them.  Used to rebuild parcel_features from the fixture row's
# ``infra_*`` presence columns (Notebook 1 Cell 10.4 carries them in
# parity_fixture.parquet precisely so serving can reproduce the checklist).
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
    """Rebuild the parcel_features dict from a fixture row.

    Notebook 1's Cell 10.4 carries the ten ``infra_<item>`` presence columns
    in parity_fixture.parquet.  When a value is present we use it; a missing
    / NaN column becomes ``None`` ("not sure"), which makes B1's
    InfrastructureCalculator fall back to the county-median path — the same
    behaviour a real user who skips the checklist gets.
    """
    out: dict[str, int | None] = {}
    for item in _INFRA_ITEMS:
        col = f"infra_{item}"
        if col in row.index and pd.notna(row[col]):
            out[item] = int(row[col])
        else:
            out[item] = None
    return out


def _listing_key(value: Any) -> str | None:
    """Normalise a listing_no to a string join key.

    Handles integer, integral-float (``117077054.0``) and string listing
    numbers so a parquet that stored the column as float64 still joins the
    fixture's integer key.  Returns ``None`` for null values.
    """
    if value is None:
        return None
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, (float, np.floating)):
        if math.isnan(value):
            return None
        if float(value).is_integer():
            return str(int(value))
        return str(value)
    s = str(value).strip()
    return s if s else None


def _is_nan(value: Any) -> bool:
    """Scalar NaN test that never raises on strings / arrays-free values."""
    if value is None:
        return True
    if isinstance(value, (str, bytes, bool)):
        return False
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def _compare_values(computed: Any, stored: Any, tolerance: float) -> tuple[bool, float | None]:
    """Compare a computed feature value against the stored fixture value.

    Returns ``(ok, numeric_diff_or_None)``:

    - two NaNs match; NaN on either side alone is a mismatch;
    - numeric pairs compare with ``abs(a - b) <= tolerance``;
    - anything else (categoricals such as ``county`` / ``prop_type``)
      compares as strings — ``numeric_diff`` is ``None`` for those.
    """
    c_nan, s_nan = _is_nan(computed), _is_nan(stored)
    if c_nan and s_nan:
        return True, None
    if c_nan or s_nan:
        return False, None
    try:
        a, b = float(computed), float(stored)
    except (TypeError, ValueError):
        return str(computed) == str(stored), None
    diff = abs(a - b)
    return diff <= tolerance, diff


def _load_fixture_lookup(
    artifacts_dir: str, feature_names: list[str]
) -> tuple[dict[str, dict[str, Any] | None], int]:
    """Build ``{listing_key -> fixture info}`` from parity_fixture.parquet.

    Each mapped value carries the parcel size (``exp(log_size_acres)``), the
    parcel checklist rebuilt from the ``infra_*`` columns, and the fixture's
    stored values for every model feature.  A fixture row whose
    ``log_size_acres`` is NaN maps to ``None`` — rows referencing it must be
    skipped, never given an invented size.

    Returns ``(lookup, n_fixture_rows)``; the lookup is empty when the
    fixture file is absent.
    """
    path = os.path.join(artifacts_dir, "parity_fixture.parquet")
    if not os.path.exists(path):
        return {}, 0
    fixture = pd.read_parquet(path)
    lookup: dict[str, dict[str, Any] | None] = {}
    for _, row in fixture.iterrows():
        key = _listing_key(row.get("listing_no"))
        if key is None or key in lookup:
            continue
        lsa = row.get("log_size_acres")
        if _is_nan(lsa):
            # No usable size — map to None so referencing rows are skipped
            # and counted under skipped_no_size.
            lookup[key] = None
            continue
        lookup[key] = {
            "size_acres": float(np.exp(float(lsa))),
            "parcel_features": _reconstruct_parcel_features(row),
            "features": {f: row.get(f) for f in feature_names if f in row.index},
        }
    return lookup, len(fixture)


def _run_parity_one_split(
    service: PredictionService,
    parquet_path: str,
    fixture_lookup: dict[str, dict[str, Any] | None],
    tolerance: float,
    max_rows: int | None,
) -> dict[str, Any]:
    """Run the three-layer parity check for one parquet (test or OOF).

    Returns a summary dict with per-feature / per-member / ensemble pass
    rates, the skip counts, and the worst ensemble mismatches.
    """
    if not os.path.exists(parquet_path):
        return {"path": parquet_path, "cause": f"file not found: {parquet_path}"}

    df = pd.read_parquet(parquet_path)
    if max_rows is not None:
        df = df.head(max_rows)

    required = ("latitude", "longitude", "pred_weighted_ensemble")
    missing = [c for c in required if c not in df.columns]
    if missing:
        return {"path": parquet_path, "cause": f"parquet missing required columns: {missing}"}

    reg = service.registry
    # (a) FEATURE parity covers every model feature except log_size_acres —
    # that one is an INPUT here (joined from the fixture), not an output to
    # verify.  Restrict to the features the fixture actually carries.
    parity_features = [f for f in reg.feature_names if f != "log_size_acres"]
    _fixture_cols = set()
    if fixture_lookup:
        _sample = next((v for v in fixture_lookup.values() if v), None)
        if _sample:
            _fixture_cols = set(_sample["features"].keys())
    if _fixture_cols:
        parity_features = [f for f in parity_features if f in _fixture_cols]
    member_names = [k for k in ("xgb", "catboost", "tabnet") if f"pred_{k}" in df.columns]

    # ---- accumulators ----
    feat_n: dict[str, int] = {f: 0 for f in parity_features}
    feat_within: dict[str, int] = {f: 0 for f in parity_features}
    feat_max_diff: dict[str, float] = {f: 0.0 for f in parity_features}
    feat_str_mismatch: dict[str, int] = {f: 0 for f in parity_features}
    mem_n: dict[str, int] = {k: 0 for k in member_names}
    mem_within: dict[str, int] = {k: 0 for k in member_names}
    mem_max_diff: dict[str, float] = {k: 0.0 for k in member_names}
    ens_n = 0
    ens_within = 0
    ens_max_diff = 0.0

    n_skipped_no_size = 0
    n_skipped_no_match = 0
    n_skipped_nan_size = 0
    n_skipped_no_coords = 0
    skipped_examples: list[str] = []
    rows_out: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for _idx, row in df.iterrows():
        key = _listing_key(row.get("listing_no"))
        fixture_row = fixture_lookup.get(key) if key is not None else None
        if key is None or key not in fixture_lookup:
            # No fixture match — NEVER invent a size; skip and count it.
            n_skipped_no_size += 1
            n_skipped_no_match += 1
            if len(skipped_examples) < 10:
                skipped_examples.append(str(row.get("listing_no", "?")))
            continue
        if fixture_row is None:
            # Fixture row exists but its log_size_acres is NaN.
            n_skipped_no_size += 1
            n_skipped_nan_size += 1
            if len(skipped_examples) < 10:
                skipped_examples.append(str(row.get("listing_no", "?")))
            continue

        lat, lon = row["latitude"], row["longitude"]
        if pd.isna(lat) or pd.isna(lon):
            n_skipped_no_coords += 1
            continue

        prop_type = str(row.get("prop_type", "Land"))
        try:
            result = service.predict(
                lat=float(lat),
                lon=float(lon),
                size_acres=fixture_row["size_acres"],
                prop_type=prop_type,
                parcel_features=fixture_row["parcel_features"],
                level=0.8,
            )
        except Exception as e:
            errors.append(
                {
                    "listing_no": row.get("listing_no", "?"),
                    "cause": f"prediction raised: {type(e).__name__}: {e}",
                }
            )
            continue

        # ---- (a) FEATURE parity: result.frame vs fixture ----
        feature_diffs: dict[str, Any] = {}
        for f in parity_features:
            computed = None
            if result.frame is not None and f in result.frame.columns:
                computed = result.frame[f].iloc[0]
            stored = fixture_row["features"].get(f)
            ok, diff = _compare_values(computed, stored, tolerance)
            feat_n[f] += 1
            if ok:
                feat_within[f] += 1
            else:
                if diff is None:
                    feat_str_mismatch[f] += 1
                    feature_diffs[f] = f"{computed!r} != {stored!r}"
                else:
                    feat_max_diff[f] = max(feat_max_diff[f], diff)
                    feature_diffs[f] = round(diff, 6)

        # ---- (b) MEMBER parity: log_predictions vs pred_<member> ----
        member_diffs: dict[str, float] = {}
        for k in member_names:
            if k not in result.log_predictions:
                continue
            stored = row.get(f"pred_{k}")
            if _is_nan(stored):
                continue
            recomputed = float(result.log_predictions[k])
            diff = abs(recomputed - float(stored))
            mem_n[k] += 1
            if diff <= tolerance:
                mem_within[k] += 1
            mem_max_diff[k] = max(mem_max_diff[k], diff)
            member_diffs[k] = round(diff, 6)

        # ---- (c) ENSEMBLE parity: log_ensemble vs pred_weighted_ensemble ----
        stored_log = float(row["pred_weighted_ensemble"])
        recomputed_log = float(result.log_ensemble)
        diff = abs(recomputed_log - stored_log)
        ens_n += 1
        within = diff <= tolerance
        if within:
            ens_within += 1
        ens_max_diff = max(ens_max_diff, diff)

        rows_out.append(
            {
                "listing_no": row.get("listing_no", "?"),
                "county": row.get("county", "?"),
                "size_acres": round(fixture_row["size_acres"], 6),
                "stored_log": round(stored_log, 6),
                "recomputed_log": round(recomputed_log, 6),
                "diff": round(diff, 6),
                "within_tol": within,
                "feature_diffs": feature_diffs,
                "member_diffs": member_diffs,
            }
        )

    def _rate(within: int, n: int) -> float | None:
        return round(within / n * 100.0, 4) if n else None

    report = pd.DataFrame(rows_out)
    worst: list[dict[str, Any]] = []
    if len(report) > 0:
        for _, w in report.sort_values("diff", ascending=False).head(10).iterrows():
            worst.append(
                {
                    "listing_no": w["listing_no"],
                    "county": w["county"],
                    "size_acres": w["size_acres"],
                    "stored_log": w["stored_log"],
                    "recomputed_log": w["recomputed_log"],
                    "diff": w["diff"],
                    "member_diffs": w["member_diffs"],
                }
            )

    return {
        "path": parquet_path,
        "n_rows": int(len(df)),
        "n_compared": ens_n,
        "n_skipped_no_size": n_skipped_no_size,
        "skipped_no_size_breakdown": {
            "no_fixture_match": n_skipped_no_match,
            "fixture_nan_log_size_acres": n_skipped_nan_size,
        },
        "skipped_no_size_examples": skipped_examples,
        "n_skipped_no_coords": n_skipped_no_coords,
        "n_prediction_errors": len(errors),
        "prediction_errors": errors[:10],
        "feature_parity": {
            f: {
                "n": feat_n[f],
                "within": feat_within[f],
                "pass_rate_pct": _rate(feat_within[f], feat_n[f]),
                "max_diff": round(feat_max_diff[f], 6) if feat_n[f] else None,
                "n_categorical_mismatch": feat_str_mismatch[f],
            }
            for f in parity_features
        },
        "member_parity": {
            k: {
                "n": mem_n[k],
                "within": mem_within[k],
                "pass_rate_pct": _rate(mem_within[k], mem_n[k]),
                "max_diff": round(mem_max_diff[k], 6) if mem_n[k] else None,
            }
            for k in member_names
        },
        "ensemble_parity": {
            "n": ens_n,
            "within": ens_within,
            "pass_rate_pct": _rate(ens_within, ens_n),
            "max_diff": round(ens_max_diff, 6) if ens_n else None,
        },
        "worst_mismatches": worst,
    }


def _aggregate_rates(splits: list[dict[str, Any]]) -> dict[str, Any]:
    """Sum the per-split counters into aggregate feature/member/ensemble rates."""
    agg: dict[str, Any] = {"feature_parity": {}, "member_parity": {}, "ensemble_parity": {}}
    feat: dict[str, list[int]] = {}
    mem: dict[str, list[int]] = {}
    ens = [0, 0]
    for s in splits:
        if "cause" in s:
            continue
        for f, d in s.get("feature_parity", {}).items():
            feat.setdefault(f, [0, 0])
            feat[f][0] += d["within"]
            feat[f][1] += d["n"]
        for k, d in s.get("member_parity", {}).items():
            mem.setdefault(k, [0, 0])
            mem[k][0] += d["within"]
            mem[k][1] += d["n"]
        e = s.get("ensemble_parity", {})
        ens[0] += e.get("within", 0)
        ens[1] += e.get("n", 0)

    def _rate(pair: list[int]) -> float | None:
        return round(pair[0] / pair[1] * 100.0, 4) if pair[1] else None

    agg["feature_parity"] = {f: _rate(p) for f, p in feat.items()}
    agg["member_parity"] = {k: _rate(p) for k, p in mem.items()}
    agg["ensemble_parity"] = _rate(ens)
    return agg


def _print_split_report(label: str, s: dict[str, Any], tolerance: float) -> None:
    """Print the per-layer pass-rate lines for one split."""
    if "cause" in s:
        print(f"\n{label}  {s['cause']}")
        return
    print(f"\n{label}  rows={s['n_rows']}  compared={s['n_compared']}  tol={tolerance}")
    if s["n_skipped_no_size"]:
        print(
            f"  skipped_no_size          : {s['n_skipped_no_size']} "
            f"({s['skipped_no_size_breakdown']})  e.g. "
            f"{s['skipped_no_size_examples'][:5]}"
        )
    if s["n_skipped_no_coords"]:
        print(f"  skipped_no_coords        : {s['n_skipped_no_coords']}")
    if s["n_prediction_errors"]:
        print(f"  prediction errors        : {s['n_prediction_errors']}")
    def _fmt_rate(v: float | None) -> str:
        return "n/a" if v is None else f"{v:.3f}%"

    for f, d in s["feature_parity"].items():
        line = (
            f"  FEATURE parity {f:<28s}: {_fmt_rate(d['pass_rate_pct']):>9}  "
            f"(n={d['n']}, max_diff={d['max_diff']})"
        )
        if d["n_categorical_mismatch"]:
            line += f"  [categorical mismatches: {d['n_categorical_mismatch']}]"
        print(line)
    for k, d in s["member_parity"].items():
        print(
            f"  MEMBER parity  {k:<28s}: {_fmt_rate(d['pass_rate_pct']):>9}  "
            f"(n={d['n']}, max_diff={d['max_diff']})"
        )
    d = s["ensemble_parity"]
    print(
        f"  ENSEMBLE parity{'':<28s}: {_fmt_rate(d['pass_rate_pct']):>9}  "
        f"(n={d['n']}, max_diff={d['max_diff']})"
    )


def run_parity_check(
    artifacts_dir: str,
    tolerance: float = 1e-3,
    max_rows: int | None = None,
) -> tuple[bool, dict[str, Any]]:
    """Run the parity check against test_predictions.parquet (primary) and
    oof_predictions.parquet (secondary).  Returns ``(overall_passed, report)``.

    Pass rule (unchanged): at least 99% of comparable rows in
    **test_predictions.parquet** must match the stored
    ``pred_weighted_ensemble`` within ``tolerance`` on the log scale.
    Feature and member pass rates are reported alongside so a failure shows
    which layer diverges, but only the ensemble-on-test rate gates the pass.
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

    # ---- Fixture join (the ONLY source of parcel size) ----
    fixture_lookup, n_fixture_rows = _load_fixture_lookup(artifacts_dir, reg.feature_names)
    if n_fixture_rows == 0:
        print(
            "\n[warn] parity_fixture.parquet not found — every row will be "
            "skipped as skipped_no_size (the script never invents a size)."
        )
    else:
        print(f"  parity fixture rows      : {n_fixture_rows:,}")

    # ---- Test parquet ----
    test_path = os.path.join(artifacts_dir, "app_exports/test_predictions.parquet")
    test_summary = _run_parity_one_split(service, test_path, fixture_lookup, tolerance, max_rows)

    # ---- OOF parquet ----
    oof_path = os.path.join(artifacts_dir, "app_exports/oof_predictions.parquet")
    oof_summary = _run_parity_one_split(service, oof_path, fixture_lookup, tolerance, max_rows)

    test_rate = test_summary.get("ensemble_parity", {}).get("pass_rate_pct")
    overall_pass = test_rate is not None and test_rate >= 99.0
    aggregate = _aggregate_rates([test_summary, oof_summary])

    summary = {
        "loaded_members": reg.kept_members,
        "kept_weights_renormalised": reg.kept_weights,
        "dropped_models": list(reg.dropped_models.keys()),
        "load_time_s": reg.load_time_s,
        "memory_mb": reg.memory_mb,
        "n_features": len(reg.feature_names),
        "n_calibration_rows": reg.n_calibration_rows,
        "n_fixture_rows": n_fixture_rows,
        "test_predictions": test_summary,
        "oof_predictions": oof_summary,
        "aggregate_pass_rates": aggregate,
        "tolerance_log_scale": tolerance,
        "overall_pass": overall_pass,
    }

    # ---- Persist ----
    out_json = os.path.join(artifacts_dir, "parity_check_report.json")
    with open(out_json, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\nparity_check_report.json written to {out_json}")

    _print_split_report("TEST", test_summary, tolerance)
    _print_split_report("OOF ", oof_summary, tolerance)

    print("\nAggregate pass rates (test + OOF combined):")
    for f, r in aggregate["feature_parity"].items():
        print(f"  FEATURE parity {f:<28s}: {r}")
    for k, r in aggregate["member_parity"].items():
        print(f"  MEMBER parity  {k:<28s}: {r}")
    print(f"  ENSEMBLE parity{'':<28s}: {aggregate['ensemble_parity']}")

    if test_summary.get("worst_mismatches"):
        print("\nWorst mismatches (test set):")
        for w in test_summary["worst_mismatches"][:5]:
            print(f"  {w}")

    if overall_pass:
        print("\nOverall: PASS")
    else:
        if test_rate is None:
            print("\nOverall: SKIP (no test predictions to compare)")
        else:
            print(f"\nOverall: FAIL (test pass rate {test_rate:.3f}% < 99%)")
            print("  Not silently widening tolerance.  Inspect the layer that")
            print("  diverges above: features point at the feature pipeline, a")
            print("  single member at that model file, all members at the")
            print("  preprocessor / size join, ensemble-only at the weights.")
    return overall_pass, summary


def recompute_for_listings(
    artifacts_dir: str,
    listing_nos: list[Any],
    tolerance: float = 1e-3,
) -> dict[str, dict[str, Any]]:
    """Recompute predictions for specific listings (debug / gated tests).

    Loads the real artefacts, joins ``parity_fixture.parquet`` for the parcel
    size exactly as the parity check does, and returns, per listing found in
    the test/OOF parquets::

        {"<listing_no>": {
            "split": "test" | "oof",
            "size_acres": float,
            "stored": {"ensemble": ..., "xgb": ..., "catboost": ..., "tabnet": ...},
            "recomputed": {"ensemble": ..., "xgb": ..., "catboost": ..., "tabnet": ...},
            "within_tol": {"ensemble": bool, ...},
        }}

    Listings missing from both parquets (or skipped for lack of a fixture
    size) are absent from the result.
    """
    service = _load_registry_and_service(artifacts_dir)
    if service is None:
        return {}
    lookup, _ = _load_fixture_lookup(artifacts_dir, service.registry.feature_names)
    wanted = {k for k in (_listing_key(x) for x in listing_nos) if k is not None}
    out: dict[str, dict[str, Any]] = {}

    for split_name, fname in (("test", "test_predictions.parquet"), ("oof", "oof_predictions.parquet")):
        path = os.path.join(artifacts_dir, "app_exports", fname)
        if not os.path.exists(path):
            continue
        df = pd.read_parquet(path)
        for _, row in df.iterrows():
            key = _listing_key(row.get("listing_no"))
            if key is None or key not in wanted or key in out:
                continue
            fixture_row = lookup.get(key)
            if fixture_row is None:
                continue
            lat, lon = row["latitude"], row["longitude"]
            if pd.isna(lat) or pd.isna(lon):
                continue
            result = service.predict(
                lat=float(lat),
                lon=float(lon),
                size_acres=fixture_row["size_acres"],
                prop_type=str(row.get("prop_type", "Land")),
                parcel_features=fixture_row["parcel_features"],
                level=0.8,
            )
            stored = {"ensemble": float(row["pred_weighted_ensemble"])}
            recomputed = {"ensemble": float(result.log_ensemble)}
            for k in ("xgb", "catboost", "tabnet"):
                col = f"pred_{k}"
                if col in row.index and not _is_nan(row[col]) and k in result.log_predictions:
                    stored[k] = float(row[col])
                    recomputed[k] = float(result.log_predictions[k])
            within = {
                layer: abs(recomputed[layer] - stored[layer]) <= tolerance
                for layer in stored
            }
            out[key] = {
                "split": split_name,
                "size_acres": round(fixture_row["size_acres"], 6),
                "stored": {k: round(v, 6) for k, v in stored.items()},
                "recomputed": {k: round(v, 6) for k, v in recomputed.items()},
                "within_tol": within,
            }
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prediction parity check")
    parser.add_argument("--artifacts-dir", default="./artifacts")
    parser.add_argument(
        "--tolerance",
        type=float,
        default=1e-3,
        help="Max |recomputed_log - stored_log| (default 1e-3, ~0.1%% on KSh scale)",
    )
    parser.add_argument(
        "--max-rows", type=int, default=None, help="Cap rows per split (default: all)"
    )
    args = parser.parse_args()

    ok, report = run_parity_check(
        artifacts_dir=args.artifacts_dir,
        tolerance=args.tolerance,
        max_rows=args.max_rows,
    )
    if report.get("cause") == "artefacts not loaded — parity deferred":
        sys.exit(2)  # skipped, not failed
    sys.exit(0 if ok else 1)
