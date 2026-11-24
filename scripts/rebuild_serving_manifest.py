"""Rebuild serving_manifest.json from the artifacts the CURRENT retrain produced.

Why: the live manifest was written by an older Notebook 3 run (created
2026-11-15), while ensemble_weights.json / preprocessing.json / the model files
come from the 2026-11-21 retrain. The manifest therefore served stale ensemble
weights and stale imputation values. scripts/repair_serving_manifest.py only
fixes the weights and (by design) refuses when the imputation values also differ.
This script rebuilds everything that Notebook 3 Cell 9.8 derives from the
production run, using the files that Cell 8.2 saved from that same run:

  models_to_load[k].weight_after_renormalisation  <- ensemble_weights.json
  pruning.original_weights / kept_weights_renormalised <- ensemble_weights.json
  imputation_values                               <- preprocessing.json preprocessor.medians
  feature_list[*].default_at_serving              <- medians (numeric) / last level (categorical)
  category_levels                                 <- preprocessing.json preprocessor.levels
  pruning.oof_rmse / pruning.test_rmse            <- null (cannot be recomputed offline)

Kept as-is: target, prediction_scale, ensemble text, model file entries,
feature names/types/dtypes/availability.

    python scripts/rebuild_serving_manifest.py [--artifacts-dir ./artifacts] [--dry-run]

Refuses (exit 2, nothing written) when: members were pruned; the model set differs
from ensemble_weights.json; feature names/order differ from the preprocessor's
feature_cols; a model file is missing; a numeric feature has no median.
A timestamped backup is written before any change; running it twice changes nothing.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys
import time

_VOLATILE = ("created", "rebuilt_offline", "rebuilt_from", "rebuilt_note")


def _fail(msg: str) -> None:
    print(f"REFUSING to rebuild: {msg}")
    print("No file was modified.")
    sys.exit(2)


def _load(path: str) -> dict:
    with open(path) as fh:
        return json.load(fh)


def build_new_manifest(old: dict, ens: dict, prep_file: dict, artifacts_dir: str) -> dict:
    prep = (prep_file or {}).get("preprocessor") or {}
    medians = prep.get("medians")
    levels = prep.get("levels") or {}
    feature_cols = prep.get("feature_cols")
    if not medians or not feature_cols:
        _fail("preprocessing.json has no preprocessor.medians / feature_cols")

    if old.get("dropped_models"):
        _fail("the manifest has dropped_models; weights are legitimately renormalised "
              "after pruning, so re-export from Notebook 3 Cell 9.8 instead")
    order, weights = list(ens.get("model_order", [])), list(ens.get("weights", []))
    if not order or len(order) != len(weights):
        _fail("ensemble_weights.json is malformed (model_order / weights)")
    loaded = list((old.get("models_to_load") or {}).keys())
    if sorted(loaded) != sorted(order):
        _fail(f"manifest models {sorted(loaded)} differ from ensemble_weights.json {sorted(order)}")
    old_names = [f["name"] for f in old.get("feature_list", [])]
    if old_names != list(feature_cols):
        _fail(f"manifest feature_list {old_names} differs from preprocessor feature_cols "
              f"{list(feature_cols)} (different run; re-export from Notebook 3)")
    for k, entry in old["models_to_load"].items():
        fname = os.path.basename(entry.get("file", ""))
        if not fname or not os.path.exists(os.path.join(artifacts_dir, fname)):
            _fail(f"model file for '{k}' not found in {artifacts_dir}: {fname!r}")

    new = copy.deepcopy(old)
    wmap = {k: float(w) for k, w in zip(order, weights)}
    for k, entry in new["models_to_load"].items():
        entry["weight_after_renormalisation"] = wmap[k]
    new["dropped_models"] = {}
    pr = new.setdefault("pruning", {})
    pr["original_weights"] = dict(wmap)
    pr["kept_weights_renormalised"] = dict(wmap)
    pr["oof_rmse"] = None
    pr["test_rmse"] = None

    for f in new["feature_list"]:
        name = f["name"]
        if f.get("type") == "categorical":
            if name in levels and levels[name]:
                f["default_at_serving"] = levels[name][-1]
        else:
            if name not in medians:
                _fail(f"numeric feature '{name}' has no median in preprocessing.json")
            f["default_at_serving"] = float(medians[name])
    new["imputation_values"] = {c: float(v) for c, v in medians.items()}
    if levels:
        new["category_levels"] = levels

    new["created"] = time.strftime("%Y-%m-%d %H:%M:%S")
    new["rebuilt_offline"] = True
    new["rebuilt_from"] = ["ensemble_weights.json", "preprocessing.json"]
    new["rebuilt_note"] = ("Rebuilt by scripts/rebuild_serving_manifest.py; pruning.oof_rmse and "
                           "pruning.test_rmse cleared (not recomputable offline).")
    return new


def _comparable(m: dict) -> dict:
    return {k: v for k, v in m.items() if k not in _VOLATILE}


def rebuild(artifacts_dir: str, dry_run: bool = False) -> dict:
    mpath = os.path.join(artifacts_dir, "backend_exports", "serving_manifest.json")
    epath = os.path.join(artifacts_dir, "ensemble_weights.json")
    ppath = os.path.join(artifacts_dir, "preprocessing.json")
    for p in (mpath, epath, ppath):
        if not os.path.exists(p):
            _fail(f"{p} not found")
    old, ens, prep = _load(mpath), _load(epath), _load(ppath)
    new = build_new_manifest(old, ens, prep, artifacts_dir)

    if _comparable(old) == _comparable(new):
        print("Manifest already matches ensemble_weights.json and preprocessing.json - nothing to do.")
        return {"changed": False, "manifest": mpath}

    print(f"Rebuilding {mpath}")
    for k in new["models_to_load"]:
        a = old["models_to_load"][k]["weight_after_renormalisation"]
        b = new["models_to_load"][k]["weight_after_renormalisation"]
        print(f"  weight[{k}]: {a:.7f} -> {b:.7f}")
    for c, v in new["imputation_values"].items():
        a = (old.get("imputation_values") or {}).get(c)
        print(f"  imputation[{c}]: {a} -> {v}")
    print(f"  weights sum: {sum(w['weight_after_renormalisation'] for w in new['models_to_load'].values()):.10f}")
    if dry_run:
        print("DRY RUN - no file was modified.")
        return {"changed": True, "dry_run": True, "manifest": mpath, "new": new}

    backup = f"{mpath}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
    with open(backup, "w") as fh:
        json.dump(old, fh, indent=2)
    with open(mpath, "w") as fh:
        json.dump(new, fh, indent=2)

    chk = _load(mpath)
    for k, w in zip(ens["model_order"], ens["weights"]):
        assert abs(chk["models_to_load"][k]["weight_after_renormalisation"] - float(w)) < 1e-12
    for c, v in prep["preprocessor"]["medians"].items():
        assert abs(chk["imputation_values"][c] - float(v)) < 1e-12
    print(f"Manifest rebuilt. Backup: {backup}")
    print("Restart the backend; the weights and imputation guards should now pass.")
    return {"changed": True, "backup": backup, "manifest": mpath, "new": new}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Rebuild serving_manifest.json from the current retrain artifacts")
    ap.add_argument("--artifacts-dir", default="./artifacts")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    rebuild(a.artifacts_dir, dry_run=a.dry_run)
