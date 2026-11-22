"""Make an XGBoost 3.x model file readable by xgboost 2.x.

xgboost 3.x writes learner_model_param.base_score as a bracketed vector string,
e.g. "[1.6979546E1]". xgboost 2.x cannot parse it and silently falls back to the
default 0.5, which shifts EVERY prediction by (base_score - 0.5). Removing the
brackets restores the scalar form 2.x expects; the trees are untouched.

    python scripts/fix_xgb_base_score.py artifacts/xgb_model.json

A backup is written next to the file (xgb_model.json.bak). Run it once; running it
again on an already-fixed file does nothing.
"""
import json
import shutil
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
path = sys.argv[1]
with open(path) as fh:
    model = json.load(fh)

params = model["learner"]["learner_model_param"]
raw = str(params["base_score"]).strip()
print(f"file written by xgboost {model.get('version')} | base_score field: {raw!r}")

if not raw.startswith("["):
    print("base_score is already a scalar - nothing to do.")
    sys.exit(0)

values = [v.strip() for v in raw.strip("[]").split(",") if v.strip()]
if len(values) != 1:
    sys.exit(f"refusing to patch: {len(values)} base_score values (multi-target model).")

shutil.copy2(path, path + ".bak")
params["base_score"] = values[0]
with open(path, "w") as fh:
    json.dump(model, fh)
print(f"patched base_score -> {values[0]}   (backup: {path}.bak)")
