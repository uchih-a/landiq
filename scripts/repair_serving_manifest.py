"""Repair serving_manifest.json weights from ensemble_weights.json.

The live serving manifest shipped with ``weight_after_renormalisation``
0.6211/0.2929/0.0860 (xgb/catboost/tabnet) while ``ensemble_weights.json``
(the file that reproduces the stored ensemble to 7e-15) says
0.2295316/0.6682573/0.1022111 — every served ensemble prediction was wrong.
This script rewrites the manifest so the two agree::

    python scripts/repair_serving_manifest.py [--artifacts-dir ./artifacts] [--dry-run]

What it rewrites (from ``ensemble_weights.json``'s ``model_order`` + ``weights``):

  - ``models_to_load[k]["weight_after_renormalisation"]`` for every kept model
  - ``pruning.original_weights`` (the full model_order vector)
  - ``pruning.kept_weights_renormalised`` (the kept subset, same values)

PRECONDITIONS — the script refuses to run (exit 2, no file is touched) when:

  1. ``dropped_models`` is non-empty.  After pruning, the survivors' weights
     are legitimately renormalised away from the originals; blindly copying
     the un-renormalised vector would be wrong.  Re-export the manifest from
     Notebook 3 Cell 9.8 instead of repairing it.
  2. The manifest's model set differs from ``ensemble_weights.json``'s
     ``model_order``.  Same reason — the two files describe different
     ensembles.
  3. The manifest's ``imputation_values`` disagree with the medians stored in
     ``preprocessing.json["preprocessor"]["medians"]`` by more than 1e-9
     (the registry's Part 2b guard).  A weight repair cannot fix a manifest
     exported from a different preprocessor state.

The manifest is backed up to ``serving_manifest.json.bak`` (first run only —
an existing .bak is never overwritten, so the pre-repair state is always
recoverable).  The repair is idempotent: running it twice changes nothing
the second time, and a manifest already in agreement is reported as such.

``--dry-run`` prints what would change without writing anything.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

WEIGHTS_TOL = 1e-6
IMPUTATION_TOL = 1e-9


def _fail(msg: str) -> None:
    print(f"REFUSING to repair: {msg}")
    print("No file was modified.")
    sys.exit(2)


def _load_json(path: str) -> dict[str, Any]:
    with open(path) as f:
        return json.load(f)


def check_preconditions(
    manifest: dict[str, Any],
    ens: dict[str, Any],
    preprocessing: dict[str, Any] | None,
    manifest_path: str,
    ens_path: str,
) -> dict[str, float]:
    """Validate every precondition; return the target weight per model.

    Returns ``{model: new_weight}`` from ``ensemble_weights.json``.  Exits
    the process (exit 2) with a clear message when a precondition fails.
    """
    # --- Precondition 1: no pruned members --------------------------------
    dropped = manifest.get("dropped_models") or {}
    if dropped:
        _fail(
            "serving_manifest.json has dropped_models ("
            + ", ".join(f"{k}: {v.get('reason', '?')}" for k, v in dropped.items())
            + "). After pruning the survivors' weights are renormalised away "
            "from the originals, so they SHOULD differ from "
            "ensemble_weights.json. Re-export the manifest from Notebook 3 "
            "Cell 9.8 instead of repairing it."
        )

    # --- Parse ensemble_weights.json ---------------------------------------
    model_order = list(ens.get("model_order", []))
    weights = list(ens.get("weights", []))
    if not model_order or len(model_order) != len(weights):
        _fail(
            f"{ens_path} is malformed: model_order ({len(model_order)} entries) "
            f"and weights ({len(weights)} entries) must be non-empty and the "
            "same length."
        )
    target = {k: float(weights[i]) for i, k in enumerate(model_order)}

    # --- Precondition 2: same model set ------------------------------------
    manifest_models = set(manifest.get("models_to_load", {}).keys())
    ens_models = set(model_order)
    if manifest_models != ens_models:
        only_manifest = sorted(manifest_models - ens_models)
        only_ens = sorted(ens_models - manifest_models)
        _fail(
            "the manifest's model set differs from ensemble_weights.json's "
            f"model_order ({manifest_path} vs {ens_path}).\n"
            f"  only in manifest: {only_manifest or 'none'}\n"
            f"  only in ensemble_weights: {only_ens or 'none'}\n"
            "The two files describe different ensembles — re-export the "
            "manifest from Notebook 3 Cell 9.8."
        )

    # --- Precondition 3: imputation values agree with preprocessing.json ---
    imputation = manifest.get("imputation_values") or {}
    prep_medians: dict[str, Any] = {}
    if preprocessing is not None:
        prep_dict = preprocessing.get("preprocessor") or {}
        if isinstance(prep_dict, dict):
            prep_medians = prep_dict.get("medians") or {}
    if imputation and prep_medians:
        bad = [
            (c, float(v), float(prep_medians[c]))
            for c, v in imputation.items()
            if c in prep_medians and abs(float(v) - float(prep_medians[c])) > IMPUTATION_TOL
        ]
        if bad:
            lines = [
                "serving_manifest.json imputation_values disagree with "
                "preprocessing.json preprocessor medians (>1e-9):"
            ]
            for c, m_v, p_v in bad:
                lines.append(f"  - {c}: manifest={m_v!r} vs preprocessing={p_v!r}")
            lines.append(
                "A weight repair cannot fix a manifest exported from a "
                "different preprocessor state. Re-run Notebook 3 Cells 8.2 + "
                "9.8 so both come from the same production run."
            )
            _fail("\n".join(lines))
    elif not imputation:
        print("[note] manifest has no imputation_values — imputation check skipped.")
    elif not prep_medians:
        print("[note] preprocessing.json has no preprocessor medians — imputation check skipped.")

    return target


def repair_serving_manifest(
    artifacts_dir: str,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Rewrite the manifest weights from ensemble_weights.json.

    Returns a report dict: ``{"changed": bool, "changes": {model:
    {"from": .., "to": ..}}, "backup": path | None, "manifest": path}``.
    """
    manifest_path = os.path.join(artifacts_dir, "backend_exports", "serving_manifest.json")
    ens_path = os.path.join(artifacts_dir, "ensemble_weights.json")
    prep_path = os.path.join(artifacts_dir, "preprocessing.json")

    for p, what in ((manifest_path, "serving_manifest.json"), (ens_path, "ensemble_weights.json")):
        if not os.path.exists(p):
            print(f"REFUSING to repair: {what} not found at {p}")
            sys.exit(2)
    preprocessing = _load_json(prep_path) if os.path.exists(prep_path) else None

    manifest = _load_json(manifest_path)
    ens = _load_json(ens_path)
    target = check_preconditions(manifest, ens, preprocessing, manifest_path, ens_path)

    # --- Compute the changes ------------------------------------------------
    changes: dict[str, dict[str, float]] = {}
    models_to_load = manifest.get("models_to_load", {})
    for k, entry in models_to_load.items():
        old = float(entry.get("weight_after_renormalisation", float("nan")))
        new = target[k]
        if abs(old - new) > WEIGHTS_TOL:
            changes[k] = {"from": old, "to": new}

    pruning = manifest.get("pruning") or {}
    pruning_changes: dict[str, dict[str, float]] = {}
    old_original = pruning.get("original_weights") or {}
    old_kept = pruning.get("kept_weights_renormalised") or {}
    for k, new in target.items():
        if k in old_original and abs(float(old_original[k]) - new) > WEIGHTS_TOL:
            pruning_changes.setdefault(k, {})["original_from"] = float(old_original[k])
            pruning_changes[k]["original_to"] = new
        if k in old_kept and abs(float(old_kept[k]) - new) > WEIGHTS_TOL:
            pruning_changes.setdefault(k, {})["kept_from"] = float(old_kept[k])
            pruning_changes[k]["kept_to"] = new

    total_new = sum(target.values())
    if not changes and not pruning_changes:
        print("Manifest weights already agree with ensemble_weights.json — nothing to do.")
        return {
            "changed": False,
            "changes": {},
            "backup": None,
            "manifest": manifest_path,
            "weights": target,
            "weights_sum": total_new,
        }

    print(f"Repairing {manifest_path} from {ens_path}")
    for k, ch in changes.items():
        print(f"  models_to_load[{k}].weight_after_renormalisation: "
              f"{ch['from']:.7f} -> {ch['to']:.7f}")
    for k, ch in pruning_changes.items():
        if "original_from" in ch:
            print(f"  pruning.original_weights[{k}]: {ch['original_from']:.7f} -> {ch['original_to']:.7f}")
        if "kept_from" in ch:
            print(f"  pruning.kept_weights_renormalised[{k}]: {ch['kept_from']:.7f} -> {ch['kept_to']:.7f}")
    print(f"  new weight vector: { {k: round(v, 7) for k, v in target.items()} }  (sum={total_new:.10f})")

    if dry_run:
        print("DRY RUN — no file was modified.")
        return {
            "changed": True,
            "dry_run": True,
            "changes": changes,
            "pruning_changes": pruning_changes,
            "backup": None,
            "manifest": manifest_path,
            "weights": target,
            "weights_sum": total_new,
        }

    # --- Backup (never overwrite an existing .bak) --------------------------
    backup_path = manifest_path + ".bak"
    if os.path.exists(backup_path):
        print(f"  keeping existing backup {backup_path} (not overwritten)")
    else:
        with open(backup_path, "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"  backup written: {backup_path}")

    # --- Apply ---------------------------------------------------------------
    for k, entry in models_to_load.items():
        entry["weight_after_renormalisation"] = target[k]
    if pruning:
        if isinstance(pruning.get("original_weights"), dict):
            pruning["original_weights"] = {
                k: target.get(k, v) for k, v in pruning["original_weights"].items()
            }
        if isinstance(pruning.get("kept_weights_renormalised"), dict):
            pruning["kept_weights_renormalised"] = {
                k: target.get(k, v) for k, v in pruning["kept_weights_renormalised"].items()
            }

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    # --- Idempotency self-check ----------------------------------------------
    reread = _load_json(manifest_path)
    for k, entry in reread.get("models_to_load", {}).items():
        assert abs(float(entry["weight_after_renormalisation"]) - target[k]) <= WEIGHTS_TOL, (
            f"post-write verification failed for {k}"
        )
    print(f"PHASE — serving_manifest.json repaired ({len(changes)} weight(s) rewritten)")
    print("Re-run the backend; the Part 2a startup guard should now pass.")
    return {
        "changed": True,
        "changes": changes,
        "pruning_changes": pruning_changes,
        "backup": backup_path,
        "manifest": manifest_path,
        "weights": target,
        "weights_sum": total_new,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Repair serving_manifest.json weights")
    parser.add_argument("--artifacts-dir", default="./artifacts")
    parser.add_argument("--dry-run", action="store_true", help="Print changes, write nothing")
    args = parser.parse_args()

    repair_serving_manifest(artifacts_dir=args.artifacts_dir, dry_run=args.dry_run)
    sys.exit(0)
