"""Part 3 — replay the legacy vs corrected cleaning pipeline on the real CSV.

Prints:
  (1) a before/after table for the fixture listings (size, basis, ppa, total)
  (2) legacy vs new aggregates: usable price_per_acre rows, size==0 rows,
      inf rows, rows whose size changed, rows with size_conflict, counts
      per size_source, counts per price_basis, and price_per_acre
      percentiles (1/5/25/50/75/95/99).

Run::

    python scripts/replay_cleaning.py
    python scripts/replay_cleaning.py --csv /path/to/property24_kenya_finals.csv
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))
sys.path.insert(0, str(REPO_ROOT / "backend"))

from landval.cleaning.price_basis import (  # noqa: E402
    detect_price_basis,
    resolve_prices,
)
from landval.cleaning.size import clean_size_record, clean_sizes  # noqa: E402
from tests.fixtures.legacy_cleaning import (  # noqa: E402
    clean_price as legacy_clean_price,
    clean_size as legacy_clean_size,
    extract_size_from_description as legacy_extract,
    legacy_pipeline,
)

# The fixture listings referenced by the A1 + A2 tests (union).
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


def _legacy_size(row) -> float:
    v, _ = legacy_clean_size(row["size"])
    if v is None or (isinstance(v, float) and math.isnan(v)):
        v, _ = legacy_extract(row["description"])
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return float("nan")
    return float(v)


def _new_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    """Run the corrected size + price-basis pipeline."""
    out = df.copy()
    # ---- Price (Cell 28 — unchanged) ----
    price_pairs = out["price"].apply(legacy_clean_price)
    out["price_ksh"] = price_pairs.apply(lambda x: x[0])
    out["price_flag"] = price_pairs.apply(lambda x: x[1])

    # ---- Size (A1) ----
    sizes = clean_sizes(out[["size", "erf_size", "description"]])
    for col in ("size_acres", "size_source", "size_note", "size_conflict", "size_multi_match"):
        out[col] = sizes[col].to_numpy()

    # ---- Price basis (A2) + price_per_acre (Cell 167 replacement) ----
    out["price_listed_raw_ksh"] = out["price_ksh"]
    bases, conflicts, ppas, totals = [], [], [], []
    for price, size, desc in zip(
        out["price_ksh"].tolist(), out["size_acres"].tolist(), out["description"].tolist()
    ):
        basis, conflict = detect_price_basis(price, desc)
        resolved = resolve_prices(price, size, basis, "convert")
        bases.append(basis)
        conflicts.append(conflict)
        ppas.append(resolved.price_per_acre)
        totals.append(resolved.total_price_ksh)
    out["price_basis"] = bases
    out["price_basis_conflict"] = conflicts
    out["price_per_acre"] = ppas
    out["price_ksh"] = totals  # downstream price_ksh = corrected TOTAL
    return out


def _before_after_table(legacy: pd.DataFrame, new: pd.DataFrame, df: pd.DataFrame) -> str:
    lines = []
    header = (
        f"{'listing':>12} | {'size_legacy':>12} {'size_new':>12} | "
        f"{'basis_legacy':>13} {'basis_new':>10} | "
        f"{'ppa_legacy':>14} {'ppa_new':>14} | "
        f"{'total_legacy':>16} {'total_new':>16}"
    )
    lines.append(header)
    lines.append("-" * len(header))
    for ln in FIXTURE_LISTINGS:
        mask = df["listing_no"].astype(str) == str(ln)
        if int(mask.sum()) != 1:
            lines.append(f"{ln:>12} | (not found in CSV)")
            continue
        idx = df.index[mask][0]
        lsize = float(legacy.at[idx, "size_acres"])
        nrec = clean_size_record(
            df.at[idx, "size"], df.at[idx, "erf_size"], df.at[idx, "description"]
        )
        nsize = nrec.size_acres
        price, _ = legacy_clean_price(df.at[idx, "price"])
        basis, _conf = detect_price_basis(price, df.at[idx, "description"])
        res = resolve_prices(price, nsize, basis, "convert")
        # legacy ppa / total (price treated as total)
        lppa = price / lsize if lsize and math.isfinite(lsize) and lsize > 0 else float("nan")
        ltotal = price
        nppa = res.price_per_acre
        ntotal = res.total_price_ksh
        def fmt(v, w):
            if v is None or (isinstance(v, float) and math.isnan(v)):
                return f"{'NaN':>{w}}"
            if math.isfinite(v):
                return f"{v:>{w},.2f}"
            return f"{'inf':>{w}}"
        lines.append(
            f"{str(ln):>12} | {fmt(lsize,12)} {fmt(nsize,12)} | "
            f"{'total':>13} {str(basis):>10} | "
            f"{fmt(lppa,14)} {fmt(nppa,14)} | "
            f"{fmt(ltotal,16)} {fmt(ntotal,16)}"
        )
    return "\n".join(lines)


def _aggregates(legacy: pd.DataFrame, new: pd.DataFrame) -> str:
    lines = []
    lines.append("LEGACY vs NEW — corpus aggregates")
    lines.append("-" * 60)

    def usable_ppa(frame):
        v = frame["price_per_acre"].to_numpy(dtype=float)
        return int(np.sum(np.isfinite(v) & (v > 0)))

    lines.append(f"rows with usable price_per_acre   legacy={usable_ppa(legacy):>6}  new={usable_ppa(new):>6}")

    def zero_size(frame):
        s = frame["size_acres"].to_numpy(dtype=float)
        return int(np.sum(s == 0.0))

    lines.append(f"rows with size_acres == 0         legacy={zero_size(legacy):>6}  new={zero_size(new):>6}")

    def inf_ppa(frame):
        with np.errstate(divide="ignore", invalid="ignore"):
            ppa = frame["price_per_acre"].to_numpy(dtype=float)
        return int(np.sum(np.isinf(ppa)))

    lines.append(f"rows with inf price_per_acre      legacy={inf_ppa(legacy):>6}  new={inf_ppa(new):>6}")

    # rows whose size changed (finite on both sides and differ > 1%)
    ls = legacy["size_acres"].to_numpy(dtype=float)
    ns = new["size_acres"].to_numpy(dtype=float)
    both = np.isfinite(ls) & np.isfinite(ns)
    changed = int(np.sum(both & (np.abs(ls - ns) > 0.01 * np.maximum(np.abs(ls), 1e-9))))
    lines.append(f"rows whose size changed (>1%)             = {changed:>6}")
    lines.append(f"rows with size_conflict (new)             = {int(new['size_conflict'].sum()):>6}")

    lines.append("")
    lines.append("size_source counts (new):")
    for k, v in new["size_source"].value_counts(dropna=False).items():
        lines.append(f"  {str(k):<20} {int(v):>6}")

    lines.append("")
    lines.append("price_basis counts (new):")
    for k, v in new["price_basis"].value_counts(dropna=False).items():
        lines.append(f"  {str(k):<20} {int(v):>6}")

    lines.append("")
    lines.append("price_per_acre percentiles (KSh/acre, finite & >0 only):")
    for frame, tag in ((legacy, "legacy"), (new, "new")):
        v = frame["price_per_acre"].to_numpy(dtype=float)
        v = v[np.isfinite(v) & (v > 0)]
        if len(v) == 0:
            lines.append(f"  {tag:>6}: (none)")
            continue
        pcts = np.percentile(v, [1, 5, 25, 50, 75, 95, 99])
        lines.append(
            f"  {tag:>6}: "
            + "  ".join(f"p{q}={val:,.0f}" for q, val in zip([1, 5, 25, 50, 75, 95, 99], pcts))
        )
    return "\n".join(lines)


def main() -> int:
    csv_default = REPO_ROOT / "property24_kenya_finals.csv"
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(csv_default))
    args = ap.parse_args()

    df = pd.read_csv(args.csv, encoding="utf-8", encoding_errors="replace")
    print(f"Loaded {len(df):,} rows from {args.csv}")
    print()

    legacy = legacy_pipeline(df)
    new = _new_pipeline(df)

    print("=" * 100)
    print("BEFORE / AFTER TABLE — fixture listings")
    print("=" * 100)
    print(_before_after_table(legacy, new, df))
    print()
    print("=" * 100)
    print("AGGREGATES")
    print("=" * 100)
    print(_aggregates(legacy, new))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
