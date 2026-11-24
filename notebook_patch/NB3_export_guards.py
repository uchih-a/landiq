"""Part 4 — drop-in export-guard cells for Notebook 3 (``03_modelling.ipynb``).

The notebook itself is NOT part of this repo (it lives in the modelling
environment); these are labelled blocks to paste into it.  They close the
export-loop gaps that let a wrong serving manifest ship live:

  GAP 1 (env drift)     — the notebook ran with newer library versions than
                          the backend serves with (xgboost 3.x writes a
                          ``base_score`` format xgboost 2.x misreads; package
                          drift silently moves member predictions).
  GAP 2 (save fidelity) — the models were saved but never reloaded and
                          compared, so a save/load asymmetry (version,
                          format, dtype) shipped unnoticed.
  GAP 3 (manifest)      — serving_manifest.json's weights were written from
                          a stale variable instead of PRODUCTION_RUN["weights"],
                          so the backend served 0.6211/0.2929/0.0860 while
                          ensemble_weights.json (and the stored ensemble)
                          said 0.2295316/0.6682573/0.1022111.

Cell map (paste each block into the matching location):

  CELL A (first cell of the notebook, before any imports):
      pins the exact package versions the backend serves with, then asserts
      xgboost == 2.1.1.
  CELL B (immediately after Cell 8.2 — the model-save cell):
      reloads the saved XGBoost / CatBoost / TabNet files with the installed
      libraries and asserts max |reloaded - in-memory| < 1e-6 on 50 dev rows.
  CELL C (immediately after Cell 9.8, before the manifest is written — or
      as the last block INSIDE Cell 9.8, just before ``json.dump``):
      asserts the manifest's weights equal PRODUCTION_RUN["weights"] (and
      therefore ensemble_weights.json) to 1e-9.

Variable names match the notebook: ``PRODUCTION_RUN``, ``MODEL_ORDER``,
``ENS_DIR``, ``dev_df``, ``TARGET``, ``serving_manifest``, ``models_to_load``.
If your notebook names differ, adjust the names but keep the assertions.
"""

# ======================================================================
# CELL A — pin + verify the serving environment (FIRST cell of the notebook)
# ======================================================================
CELL_A = r'''
# --- Export guard A: pin the exact versions the backend serves with -------
# The backend's Part 2 guards assume xgboost 2.x reads these files.  A newer
# xgboost (>=3) serialises learner_model_param.base_score as a list, which
# xgboost 2.x silently reads as 0.5 — shifting every XGBoost prediction by
# (base_score - 0.5) on the log scale.  Install the pinned set FIRST, then
# restart the runtime if anything was upgraded, and only then re-run the
# notebook top to bottom.
%pip install -q xgboost==2.1.1 catboost==1.2.5 scikit-learn==1.5.1 \
                 pytorch-tabnet==4.1.0 numpy==1.26.4 pandas==2.2.2 pyarrow==15.0.2

import xgboost
assert xgboost.__version__ == "2.1.1", (
    f"xgboost {xgboost.__version__} is installed but the backend serves with "
    "2.1.1. xgboost>=3 writes base_score in a list format that 2.x misreads "
    "as 0.5 (every XGBoost prediction silently shifts). Restart the runtime "
    "after the install above and re-run this cell."
)
print(f"export-guard A OK — xgboost {xgboost.__version__}")
'''

# ======================================================================
# CELL B — save-fidelity check (immediately AFTER Cell 8.2)
# ======================================================================
CELL_B = r'''
# --- Export guard B: reload the saved model files and compare -------------
# Catches save/load asymmetries (version, format, dtype) BEFORE anything is
# exported downstream.  Runs on 50 development rows through the production
# preprocessor exactly as the backend will serve them; asserts
# max |reloaded - in-memory| < 1e-6 per member and for the weighted ensemble.
import numpy as np
import xgboost as xgb
from catboost import CatBoostRegressor
from pytorch_tabnet.tab_model import TabNetRegressor

_dev_rows = dev_df.iloc[:50]
_frame_in = pd.DataFrame([{c: _dev_rows.iloc[i][c] for c in PRODUCTION_RUN["features"]}
                          for i in range(len(_dev_rows))])
_prep = PRODUCTION_RUN["prep"]

_xgb_mem  = PRODUCTION_RUN["models"]["xgb"]
_cat_mem  = PRODUCTION_RUN["models"]["catboost"]
_tab_mem  = PRODUCTION_RUN["models"]["tabnet"]

_xgb_re = xgb.XGBRegressor()
_xgb_re.load_model(f"{ENS_DIR}/xgb_model.json")
_xgb_re.set_params(enable_categorical=True, tree_method="hist")
_cat_re = CatBoostRegressor(); _cat_re.load_model(f"{ENS_DIR}/catboost_model.cbm")
_tab_re = TabNetRegressor();   _tab_re.load_model(f"{ENS_DIR}/tabnet_model.zip")

_mem = {"xgb":      _xgb_mem.predict(_prep.transform_xgb(_frame_in)),
        "catboost": _cat_mem.predict(_prep.transform_catboost(_frame_in)),
        "tabnet":   (_tab_mem.predict(
                        _prep.transform_tabnet(_frame_in).values.astype(np.float32)
                    ).ravel()
                     * float(PRODUCTION_RUN["tabnet_target"]["tabnet_target_std"])
                     + float(PRODUCTION_RUN["tabnet_target"]["tabnet_target_mean"]))}
_rel = {"xgb":      _xgb_re.predict(_prep.transform_xgb(_frame_in)),
        "catboost": _cat_re.predict(_prep.transform_catboost(_frame_in)),
        "tabnet":   (_tab_re.predict(
                        _prep.transform_tabnet(_frame_in).values.astype(np.float32)
                    ).ravel()
                     * float(PRODUCTION_RUN["tabnet_target"]["tabnet_target_std"])
                     + float(PRODUCTION_RUN["tabnet_target"]["tabnet_target_mean"]))}

_w = np.asarray(PRODUCTION_RUN["weights"], float)
_ens_mem = sum(_w[i] * _mem[k] for i, k in enumerate(MODEL_ORDER))
_ens_rel = sum(_w[i] * _rel[k] for i, k in enumerate(MODEL_ORDER))

print("Export guard B — reloaded vs in-memory (50 dev rows):")
for _k in MODEL_ORDER:
    _d = float(np.max(np.abs(np.asarray(_rel[_k], float) - np.asarray(_mem[_k], float))))
    print(f"  {_k:<10s} max|diff| = {_d:.3e}")
    assert _d < 1e-6, (
        f"member {_k}: reloaded predictions differ from in-memory by {_d:.3e} "
        f"(>= 1e-6). The saved { _k } file does not reproduce the fitted model — "
        "do not export. Check the xgboost/catboost/pytorch-tabnet versions "
        "(guard A) and re-save via Cell 8.2."
    )
_d_ens = float(np.max(np.abs(_ens_rel - _ens_mem)))
print(f"  ensemble   max|diff| = {_d_ens:.3e}")
assert _d_ens < 1e-6, (
    f"weighted ensemble: reloaded differs from in-memory by {_d_ens:.3e} (>= 1e-6). "
    "Do not export until the save/load round-trip is exact."
)
print("Export guard B OK — every saved model file reproduces the fitted model.")
'''

# ======================================================================
# CELL C — manifest weight guard (last block INSIDE Cell 9.8, just before
#          json.dump(serving_manifest, ...); or a cell right after it)
# ======================================================================
CELL_C = r'''
# --- Export guard C: the manifest must carry PRODUCTION_RUN's weights ------
# The live incident: models_to_load carried stale weights (0.6211/0.2929/
# 0.0860) while ensemble_weights.json — written from PRODUCTION_RUN["weights"]
# — said 0.2295316/0.6682573/0.1022111, and the backend served the wrong
# ensemble.  This guard refuses to write a manifest whose weights disagree
# with the production run (and therefore with ensemble_weights.json) by more
# than 1e-9.  Run it as the LAST block before ``json.dump(serving_manifest, f)``.
import json as _json

_ens_path = f"{ENS_DIR}/ensemble_weights.json"
with open(_ens_path) as _f:
    _ens_file = _json.load(_f)
_w_prod = {k: float(PRODUCTION_RUN["weights"][MODEL_ORDER.index(k)])
           for k in MODEL_ORDER}
_w_ens  = {k: float(_ens_file["weights"][_ens_file["model_order"].index(k)])
           for k in MODEL_ORDER}

for _name, _vec in [("PRODUCTION_RUN['weights']", _w_prod),
                    ("ensemble_weights.json",      _w_ens)]:
    _diffs = {k: abs(models_to_load[k]["weight_after_renormalisation"] - _vec[k])
              for k in models_to_load}
    _worst = max(_diffs.values())
    print(f"Export guard C — manifest vs {_name}: worst |diff| = {_worst:.3e}")
    assert _worst <= 1e-9, (
        f"REFUSING to write serving_manifest.json — models_to_load weights "
        f"differ from {_name} by up to {_worst:.3e} (> 1e-9):\n"
        + "\n".join(f"  {k}: manifest={models_to_load[k]['weight_after_renormalisation']:.7f} "
                    f"vs {_name}={_vec[k]:.7f}"
                    for k in _diffs if _diffs[k] > 1e-9)
        + "\nCell 9.8 must compute weight_after_renormalisation from "
          "PRODUCTION_RUN['weights'] (renormalised over the kept members), "
          "not from a stale variable."
    )
# The pruning bookkeeping must agree too.
for _k, _w in _w_prod.items():
    assert abs(serving_manifest["pruning"]["original_weights"][_k] - _w) <= 1e-9, (
        f"pruning.original_weights[{_k}] does not match PRODUCTION_RUN['weights']"
    )
assert abs(sum(models_to_load[k]["weight_after_renormalisation"]
               for k in models_to_load) - 1.0) <= 1e-9, (
    "kept weights must sum to 1.0 after renormalisation"
)
print("Export guard C OK — the manifest carries the production run's weights.")
'''

# ----------------------------------------------------------------------
# Programmatic export: a dict so a cell-injector can pull the source
# strings by label.
# ----------------------------------------------------------------------
EXPORT_GUARD_CELLS = {
    "A_pin_versions": CELL_A,
    "B_reload_fidelity": CELL_B,
    "C_manifest_weights": CELL_C,
}

if __name__ == "__main__":
    import json

    print(json.dumps(EXPORT_GUARD_CELLS, indent=2))
