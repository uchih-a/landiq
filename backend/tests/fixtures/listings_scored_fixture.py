"""Part B test fixture — builds a realistic ``listings_scored`` frame from
the real CSV (no retrain).

The real ``listings_scored.parquet`` is Notebook 3's output and is not in
this repo (the model artifacts were not shipped).  Rather than retrain
(forbidden by the hard constraints), this builder produces a frame with
the EXACT column shape the API expects, using:

* real rows from ``property24_kenya_finals.csv`` (listing_no, title,
  location, prop_type, listing_url, description carried verbatim);
* the corrected A1 size + A2 price basis (so ``listed_price_per_acre_ksh``
  and ``size_acres`` reflect the fixes this PR makes);
* a deterministic ``predicted_price_per_acre_ksh`` = the GLOBAL MEDIAN of
  the corrected listed per-acre prices (a location-aware baseline would
  need the model — this heuristic is NOT a retrain, just a constant
  baseline so the ``listed_over_predicted`` ratios are realistic and the
  suspect-gate has rows to fire on).

This is a TEST FIXTURE, not a production artifact: it is written to
``tests/fixtures/listings_scored.parquet`` (or to a test's tmp_path) and
never under ``artifacts/``.  The suspect-gate LOGIC — the thing Part B
tests — is identical whether the predicted comes from the real model or
this median baseline, because the gate reads only ``listed_over_predicted``
and ``size_acres``.

The 8 A1/A2 fixture listings are forced into the frame (even if their
cleaned size/price is NaN — those rows still exercise the gate's
non-finite-size branch).  Three synthetic edge rows (``EDGE_LOW_RATIO``,
``EDGE_HIGH_RATIO``, ``EDGE_ZERO_SIZE``) deterministically exercise every
``suspect_reason``.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from landval.cleaning.price_basis import detect_price_basis, resolve_prices
from landval.cleaning.size import clean_size_record
from tests.fixtures.legacy_cleaning import clean_price as legacy_clean_price

# The 8 real fixture listings from the A1 + A2 tests.
FIXTURE_LISTINGS = [
    110468626,
    111974793,
    116939884,
    116457878,
    116846923,
    -6,
    117099203,
    117101654,
]


def _safe_float(v: Any) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return float("nan")
    return f if math.isfinite(f) else float("nan")


def build_fixture_df(csv_path: Path | str) -> pd.DataFrame:
    """Build the listings_scored fixture DataFrame from the real CSV."""
    raw = pd.read_csv(csv_path, encoding="utf-8", encoding_errors="replace")

    rows: list[dict] = []
    for _, r in raw.iterrows():
        price, _flag = legacy_clean_price(r["price"])
        rec = clean_size_record(r["size"], r["erf_size"], r["description"])
        basis, _conf = detect_price_basis(price, r["description"])
        resolved = resolve_prices(price, rec.size_acres, basis, "convert")
        listed_ppa = resolved.price_per_acre
        total = resolved.total_price_ksh
        rows.append(
            {
                "listing_no": str(r["listing_no"]),
                "listing_url": r.get("listing_url"),
                "title": r.get("title"),
                "location": r.get("location"),
                "county": None,  # county is derived in Notebook 1 cells 60-100; not in CSV
                "prop_type": r.get("prop_type"),
                "latitude": float("nan"),
                "longitude": float("nan"),
                "price_ksh": _safe_float(total),
                "size_acres": _safe_float(rec.size_acres),
                "listed_price_per_acre_ksh": _safe_float(listed_ppa),
                # predicted filled below (global median)
                "predicted_price_per_acre_ksh": float("nan"),
                "low_price_per_acre_ksh": float("nan"),
                "high_price_per_acre_ksh": float("nan"),
                "listed_over_predicted": float("nan"),
                "scored_by": "oof",
                "verdict": "fair",
                "data_quality_flag": False,
            }
        )

    df = pd.DataFrame(rows)

    # ---- predicted = global median of finite, positive listed ppa ----
    ppa = df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    usable = ppa[np.isfinite(ppa) & (ppa > 0)]
    predicted = float(np.median(usable)) if len(usable) else 1_000_000.0
    df["predicted_price_per_acre_ksh"] = predicted
    df["low_price_per_acre_ksh"] = predicted * 0.6
    df["high_price_per_acre_ksh"] = predicted * 1.5
    with np.errstate(divide="ignore", invalid="ignore"):
        df["listed_over_predicted"] = (
            df["listed_price_per_acre_ksh"].astype(float) / predicted
        )

    # ---- verdict from the interval columns (matches the options rule) ----
    listed = df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    low = df["low_price_per_acre_ksh"].to_numpy(dtype=float)
    high = df["high_price_per_acre_ksh"].to_numpy(dtype=float)
    finite = np.isfinite(listed) & np.isfinite(low) & np.isfinite(high)
    verdict = np.where(
        ~finite, "fair",
        np.where(listed < low, "underpriced",
                 np.where(listed > high, "overpriced", "fair")),
    )
    df["verdict"] = verdict

    # ---- data_quality_flag = 1st-99th percentile trim of log ppa ----
    log_ppa = np.log(ppa)
    finite_log = log_ppa[np.isfinite(log_ppa)]
    if len(finite_log):
        lo, hi = np.percentile(finite_log, [1, 99])
        df["data_quality_flag"] = (~np.isfinite(log_ppa)) | (log_ppa < lo) | (log_ppa > hi)
    else:
        df["data_quality_flag"] = False
    df["data_quality_flag"] = df["data_quality_flag"].astype(bool)

    # ---- ensure the 8 fixture listings are present (they are — from CSV) ----
    present = set(df["listing_no"].astype(str))
    missing = [ln for ln in FIXTURE_LISTINGS if str(ln) not in present]
    if missing:
        # Should not happen (CSV has all 8), but add stubs if ever needed.
        for ln in missing:
            df = pd.concat([df, pd.DataFrame([{
                "listing_no": str(ln), "listing_url": None, "title": f"stub {ln}",
                "location": None, "county": None, "prop_type": "Land",
                "latitude": float("nan"), "longitude": float("nan"),
                "price_ksh": float("nan"), "size_acres": float("nan"),
                "listed_price_per_acre_ksh": float("nan"),
                "predicted_price_per_acre_ksh": predicted,
                "low_price_per_acre_ksh": predicted * 0.6,
                "high_price_per_acre_ksh": predicted * 1.5,
                "listed_over_predicted": float("nan"), "scored_by": "oof",
                "verdict": "fair", "data_quality_flag": True,
            }])], ignore_index=True)

    # ---- synthetic edge rows to deterministically exercise every reason ----
    edge_rows = [
        {
            "listing_no": "EDGE_LOW_RATIO", "listing_url": None,
            "title": "edge low ratio (0.02)", "location": None, "county": None,
            "prop_type": "Land", "latitude": float("nan"), "longitude": float("nan"),
            "price_ksh": 1000.0, "size_acres": 1.0,
            "listed_price_per_acre_ksh": 1000.0,
            "predicted_price_per_acre_ksh": 50_000.0,
            "low_price_per_acre_ksh": 30_000.0,
            "high_price_per_acre_ksh": 75_000.0,
            "listed_over_predicted": 0.02, "scored_by": "oof",
            "verdict": "underpriced", "data_quality_flag": True,
        },
        {
            "listing_no": "EDGE_HIGH_RATIO", "listing_url": None,
            "title": "edge high ratio (30)", "location": None, "county": None,
            "prop_type": "Land", "latitude": float("nan"), "longitude": float("nan"),
            "price_ksh": 30_000_000.0, "size_acres": 1.0,
            "listed_price_per_acre_ksh": 30_000_000.0,
            "predicted_price_per_acre_ksh": 1_000_000.0,
            "low_price_per_acre_ksh": 600_000.0,
            "high_price_per_acre_ksh": 1_500_000.0,
            "listed_over_predicted": 30.0, "scored_by": "oof",
            "verdict": "overpriced", "data_quality_flag": True,
        },
        {
            "listing_no": "EDGE_ZERO_SIZE", "listing_url": None,
            "title": "edge zero size", "location": None, "county": None,
            "prop_type": "Land", "latitude": float("nan"), "longitude": float("nan"),
            "price_ksh": 5_000_000.0, "size_acres": 0.0,
            "listed_price_per_acre_ksh": float("nan"),
            "predicted_price_per_acre_ksh": 1_000_000.0,
            "low_price_per_acre_ksh": 600_000.0,
            "high_price_per_acre_ksh": 1_500_000.0,
            "listed_over_predicted": float("nan"), "scored_by": "oof",
            "verdict": "fair", "data_quality_flag": True,
        },
        {
            "listing_no": "EDGE_MID_RATIO", "listing_url": None,
            "title": "edge mid ratio (1.0)", "location": None, "county": None,
            "prop_type": "Land", "latitude": float("nan"), "longitude": float("nan"),
            "price_ksh": 1_000_000.0, "size_acres": 1.0,
            "listed_price_per_acre_ksh": 1_000_000.0,
            "predicted_price_per_acre_ksh": 1_000_000.0,
            "low_price_per_acre_ksh": 600_000.0,
            "high_price_per_acre_ksh": 1_500_000.0,
            "listed_over_predicted": 1.0, "scored_by": "oof",
            "verdict": "fair", "data_quality_flag": False,
        },
    ]
    df = pd.concat([df, pd.DataFrame(edge_rows)], ignore_index=True)

    # Cast listing_no to plain str (mixed int/-6/strings -> uniform str).
    df["listing_no"] = df["listing_no"].astype(str)
    return df


def write_fixture_parquet(csv_path: Path | str, out_path: Path | str) -> Path:
    df = build_fixture_df(csv_path)
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    return out
