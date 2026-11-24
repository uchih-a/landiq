"""Artifact-gated parity tests — run LOCALLY with the real ``artifacts/``
folder present.  Every test in this module is skipped automatically (and
reported as skipped, not failed) when the required artefact files are
absent, so CI stays green.

Run locally from the repo root::

    PYTHONPATH=backend:src python -m pytest backend/tests/test_parity_gated.py -v -rs

    # or the full parity script (same checks, plus the CLI report):
    python scripts/parity_check.py --artifacts-dir ./artifacts

Expected numbers (from the production run's stored predictions — the
assertions pin them so a regression cannot hide behind "runs without
error"):

    listing      ensemble   xgb       catboost   tabnet
    117077054    17.620     17.451    17.762     17.072
    112146807    19.647     22.369    19.044     17.479
    -18          19.799     19.547    19.987     19.137

    (all within +-1e-3 of the recomputed values)

These tests do NOT retrain anything and do NOT write into artifacts/
(the only write is artifacts/parity_check_report.json, the CLI report).
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))

_REPO = Path(__file__).resolve().parent.parent.parent
ARTIFACTS = _REPO / "artifacts"

# The gate: every test needs the model files + prediction parquets.
pytestmark = pytest.mark.skipif(
    not (ARTIFACTS / "xgb_model.json").exists()
    or not (ARTIFACTS / "app_exports" / "test_predictions.parquet").exists(),
    reason="artifacts/xgb_model.json (+ test_predictions.parquet) not present — "
    "run locally with the real artefacts",
)

# The pinned expected values (from the task's stored predictions).
_EXPECTED = {
    "117077054": {"ensemble": 17.620, "xgb": 17.451, "catboost": 17.762, "tabnet": 17.072},
    "112146807": {"ensemble": 19.647, "xgb": 22.369, "catboost": 19.044, "tabnet": 17.479},
    "-18": {"ensemble": 19.799, "xgb": 19.547, "catboost": 19.987, "tabnet": 19.137},
}
_TOL = 1e-3


class TestRealArtifactsParity:
    def test_pinned_listings_reproduce(self):
        """The three pinned listings: recomputed member + ensemble log
        predictions match the stored values within 1e-3."""
        from scripts.parity_check import recompute_for_listings

        out = recompute_for_listings(
            str(ARTIFACTS), list(_EXPECTED.keys()), tolerance=_TOL
        )
        missing = [k for k in _EXPECTED if k not in out]
        assert not missing, (
            f"pinned listings missing from the parquets/fixture join: {missing} — "
            "they must be present in test/oof_predictions.parquet AND "
            "parity_fixture.parquet with a usable log_size_acres"
        )
        for key, exp in _EXPECTED.items():
            r = out[key]
            for layer, expected in exp.items():
                got = r["recomputed"][layer]
                assert got == pytest.approx(expected, abs=_TOL), (
                    f"listing {key} layer {layer}: recomputed {got} vs expected "
                    f"{expected} (stored {r['stored'][layer]})"
                )
            # And the stored values themselves match the pinned table.
            for layer, expected in exp.items():
                assert r["stored"][layer] == pytest.approx(expected, abs=_TOL), (
                    f"listing {key} layer {layer}: STORED value "
                    f"{r['stored'][layer]} disagrees with the pinned expectation "
                    f"{expected} — if the parquets changed legitimately, update "
                    "_EXPECTED in this test; do not silently accept the change."
                )

    def test_full_parity_passes_99pct(self):
        """The full CLI parity run: >= 99% of comparable test rows within
        1e-3 on the ensemble layer, with per-layer pass rates reported."""
        from scripts.parity_check import run_parity_check

        ok, report = run_parity_check(artifacts_dir=str(ARTIFACTS))
        assert ok is True, (
            f"parity failed — aggregate rates: {report.get('aggregate_pass_rates')}"
        )
        t = report["test_predictions"]
        ens = t["ensemble_parity"]
        assert ens["pass_rate_pct"] >= 99.0
        # Members must be near-perfect too (a member failure points at a
        # model file, an ensemble-only failure at the weights).
        for k, d in t["member_parity"].items():
            assert d["pass_rate_pct"] >= 99.0, f"member {k} parity below 99%: {d}"
        # Skips must be explainable, not silent drops.
        assert t["n_skipped_no_size"] + t["n_compared"] + t["n_skipped_no_coords"] >= t["n_rows"]

    def test_fixture_sizes_are_plausible(self):
        """The sizes joined from parity_fixture must be real acres (say
        1e-4 .. 1e5), proving the exp(log_size_acres) join replaced the
        exp(train_median_log) ~35M-acre bug."""
        import numpy as np
        import pandas as pd

        fixture = pd.read_parquet(ARTIFACTS / "parity_fixture.parquet")
        lsa = pd.to_numeric(fixture["log_size_acres"], errors="coerce")
        usable = lsa.dropna()
        assert len(usable) > 0, "parity_fixture has no usable log_size_acres"
        sizes = np.exp(usable.to_numpy(dtype=float))
        # The old bug produced ~exp(17.37) = 3.5e7 acres for EVERY row.
        assert sizes.max() < 1e5, (
            f"fixture sizes go up to {sizes.max():.3g} acres — the exp() join "
            "looks wrong (the old bug produced ~3.5e7)"
        )
        assert sizes.min() > 1e-4, f"fixture sizes go down to {sizes.min():.3g} acres"


class TestRealArtifactsGuards:
    def test_registry_loads_with_guards_passing(self):
        """The real artefact tree loads and every applicable guard passes
        (or is explicitly skipped with a reason)."""
        from landval.modelling.registry import ModelRegistry

        reg = ModelRegistry(artifacts_dir=str(ARTIFACTS)).load()
        assert reg.loaded is True
        for name, outcome in reg.guards.items():
            assert outcome == "pass" or outcome.startswith("pass") or outcome.startswith("skipped:"), (
                f"startup guard {name} has unexpected outcome {outcome!r}"
            )

    def test_manifest_weights_match_ensemble_weights(self):
        """The Part 2a guard against the live artefacts: if this FAILS, run
        scripts/repair_serving_manifest.py."""
        import json

        manifest = json.loads(
            (ARTIFACTS / "backend_exports" / "serving_manifest.json").read_text()
        )
        ens = json.loads((ARTIFACTS / "ensemble_weights.json").read_text())
        if manifest.get("dropped_models"):
            pytest.skip("members were pruned — renormalised weights legitimately differ")
        order = ens["model_order"]
        weights = ens["weights"]
        for k, entry in manifest["models_to_load"].items():
            if k not in order:
                continue
            expected = weights[order.index(k)]
            got = entry["weight_after_renormalisation"]
            assert got == pytest.approx(expected, abs=1e-6), (
                f"manifest weight for {k} is {got} but ensemble_weights.json says "
                f"{expected} — run scripts/repair_serving_manifest.py"
            )

    def test_no_infinite_or_zero_sizes_in_join(self):
        """Parity rows must never produce inf/0 sizes after the join (the
        two failure modes of the old division-based target)."""
        from scripts.parity_check import _load_fixture_lookup, _listing_key

        import pandas as pd

        lookup, n = _load_fixture_lookup(str(ARTIFACTS), ["log_size_acres"])
        assert n > 0, "parity_fixture.parquet missing"
        df = pd.read_parquet(ARTIFACTS / "app_exports" / "test_predictions.parquet")
        joined = 0
        for _, row in df.iterrows():
            key = _listing_key(row.get("listing_no"))
            info = lookup.get(key)
            if info is None:
                continue
            joined += 1
            assert math.isfinite(info["size_acres"]) and info["size_acres"] > 0, (
                f"listing {key}: joined size {info['size_acres']} is not finite/positive"
            )
        assert joined > 0, "no test rows joined the fixture at all"
