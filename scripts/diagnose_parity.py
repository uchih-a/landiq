"""Diagnose a parity failure: which ensemble member diverges, and is the cause the
features (FeaturePipeline) or the models / preprocessing (ModelRegistry)?

    uv run python scripts/diagnose_parity.py                      # 3 default worst rows
    uv run python scripts/diagnose_parity.py 117077054 112146807  # chosen listing_no values
"""
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parity_check as pc  # noqa: E402

ART = "./artifacts"
svc = pc._load_registry_and_service(ART)
reg = svc.registry

print("== registry ==")
print("features:", [(f["name"], f.get("type")) for f in reg.serving_manifest.get("feature_list", [])])
print("members / weights:", reg.kept_weights)
print("tabnet_target:", reg.tabnet_target)
print("preprocessing.json keys:", sorted((reg.preprocessing or {}).keys()))
import catboost  # noqa: E402
import xgboost  # noqa: E402

print("installed: xgboost", xgboost.__version__, "| catboost", catboost.__version__)
try:
    with open(f"{ART}/xgb_model.json") as fh:
        print("xgb_model.json was written by xgboost:", json.load(fh).get("version"))
except Exception as e:  # noqa: BLE001
    print("could not read xgb_model.json version:", e)

test = pd.read_parquet(f"{ART}/app_exports/test_predictions.parquet")
pred_cols = [c for c in test.columns if c.startswith("pred_")]
print("stored prediction columns:", pred_cols)
fix = pd.read_parquet(f"{ART}/parity_fixture.parquet")
print("model features missing from parity_fixture:", [c for c in reg.feature_names if c not in fix.columns])
print("parity_fixture has size_acres:", "size_acres" in fix.columns)

ids = [int(a) for a in sys.argv[1:]] or [117077054, 112146807, -18]
median_size = float(np.exp((reg.preprocessing or {}).get("train_median_log", 0.0)))
print("size used by parity_check for every row (median):", round(median_size, 4), "acres")

for ln in ids:
    row = test[test["listing_no"].astype(str) == str(ln)]
    print(f"\n===== listing {ln} =====")
    if row.empty:
        print("not in test_predictions.parquet")
        continue
    row = row.iloc[0]
    print("STORED (notebook):", {c: round(float(row[c]), 3) for c in pred_cols})

    # A) full serving path, exactly as parity_check does it
    res = svc.predict(
        lat=float(row["latitude"]), lon=float(row["longitude"]), size_acres=median_size,
        prop_type=str(row.get("prop_type", "Land")),
        parcel_features=pc._reconstruct_parcel_features(row),
    )
    print("A) SERVICE members:", {k: round(v, 3) for k, v in res.log_predictions.items()},
          "| ensemble", round(res.log_ensemble, 3))
    print("   features the backend computed:", res.frame.iloc[0].to_dict())

    # B) bypass FeaturePipeline: feed the NOTEBOOK's own feature values to the models
    fr = fix[fix["listing_no"].astype(str) == str(ln)]
    if fr.empty:
        print("B) (listing not in parity_fixture.parquet)")
        continue
    feats = fr.iloc[0].to_dict()
    frame = svc._prepare_input_frame(feats, size_acres=feats.get("size_acres"))
    stack = {
        "features": reg.feature_names, "prep": reg.preprocessor,
        "tabnet_target": reg.tabnet_target, "models": reg.models,
        "model_order": reg.model_order, "weights": reg.weights_array,
    }
    lp = svc._member_log_predictions(frame, stack)
    print("B) NOTEBOOK features -> models:", {k: round(float(np.ravel(v)[0]), 3) for k, v in lp.items()})
    print("   notebook feature values:", frame.iloc[0].to_dict())
    tab = reg.preprocessor.transform_tabnet(frame)
    print("   TabNet input min/max:", float(tab.values.min()), float(tab.values.max()),
          "(training-standardised inputs should be roughly -5..+5)")
