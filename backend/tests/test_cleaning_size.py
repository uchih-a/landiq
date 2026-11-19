"""A1 — tests for the corrected size parsing (``landval.cleaning.size``).

Every assertion is on a REAL row of ``property24_kenya_finals.csv`` or a
concrete string from the spec.  Tolerances are ``rel 1e-4`` unless the
spec marks a wider one (``1e-3`` for the unit-conversion cases).
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from landval.cleaning.size import (
    clean_size_record,
    clean_size_value,
    clean_sizes,
    extract_first_description_size,
)
from tests.fixtures.legacy_cleaning import (
    clean_size as legacy_clean_size,
    extract_size_from_description as legacy_extract,
    legacy_pipeline,
)

# ----------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "property24_kenya_finals.csv"
# Allow override via env (CI may stage the CSV elsewhere) but default to the
# repo root copy the user uploaded.
CSV_PATH = Path(os.environ.get("LANDVAL_CSV", CSV_PATH))


@pytest.fixture(scope="module")
def df() -> pd.DataFrame:
    return pd.read_csv(
        CSV_PATH, encoding="utf-8", encoding_errors="replace"
    )


def _row(df: pd.DataFrame, listing_no) -> pd.Series:
    sub = df[df["listing_no"].astype(str) == str(listing_no)]
    assert len(sub) == 1, f"listing {listing_no} not unique/found ({len(sub)} rows)"
    return sub.iloc[0]


def _legacy_size(row) -> float:
    val, _src = legacy_clean_size(row["size"])
    if val is None or (isinstance(val, float) and math.isnan(val)):
        val, _src = legacy_extract(row["description"])
    return float(val) if val is not None and not (isinstance(val, float) and math.isnan(val)) else float("nan")


# ----------------------------------------------------------------------
# Real-row assertions (the spec's A1 TESTS, in order)
# ----------------------------------------------------------------------

def test_111974793_structured_077_ignored_description_2077_used(df):
    # legacy 77.0 -> new 2077.0 (structured "077 acre" ignored, description
    # "2,077 acre" used).
    row = _row(df, 111974793)
    legacy = _legacy_size(row)
    assert legacy == pytest.approx(77.0, rel=1e-4)
    rec = clean_size_record(row["size"], row["erf_size"], row["description"])
    assert rec.size_acres == pytest.approx(2077.0, rel=1e-4)
    assert rec.size_source == "nlp_description"


def test_110468626_size_unchanged_4000(df):
    row = _row(df, 110468626)
    rec = clean_size_record(row["size"], row["erf_size"], row["description"])
    assert rec.size_acres == pytest.approx(4000.0, rel=1e-4)


def test_117099203_erf_size_0_5_acres_wins(df):
    # legacy 2.0 -> new 0.5 (erf_size "0.5 acres"); size_source == "erf_size".
    row = _row(df, 117099203)
    legacy = _legacy_size(row)
    assert legacy == pytest.approx(2.0, rel=1e-4)
    rec = clean_size_record(row["size"], row["erf_size"], row["description"])
    assert rec.size_acres == pytest.approx(0.5, rel=1e-4)
    assert rec.size_source == "erf_size"
    # The description's "1/2 ACRE" -> 2.0 conflicts with erf_size 0.5 by > 2x.
    assert rec.size_conflict is True


def test_117101654_m2_label_treated_as_acres(df):
    # erf_size "0.12 m²" -> 0.12 acres, size_note == "m2_label_treated_as_acres".
    row = _row(df, 117101654)
    rec = clean_size_record(row["size"], row["erf_size"], row["description"])
    assert rec.size_acres == pytest.approx(0.12, rel=1e-4)
    assert rec.size_note == "m2_label_treated_as_acres"
    assert rec.size_source == "erf_size"


# ----------------------------------------------------------------------
# Unit / regex cases
# ----------------------------------------------------------------------

def test_4321_m2_to_acres():
    assert clean_size_value("4321 m²") == pytest.approx(1.0678, abs=1e-3)


def test_1_900_m2_keeps_thousands_separator():
    # "1 900 m²" -> 1900 m² -> 0.4695 acres (space thousands separator kept).
    assert clean_size_value("1 900 m²") == pytest.approx(0.4695, abs=1e-3)


def test_description_1000_sqm():
    assert extract_first_description_size("plot of 1,000 sqm") == pytest.approx(
        0.2471, abs=1e-3
    )


def test_000_acres_truncated_to_nan():
    # "000 Acres" with no usable description -> NaN, not 0.
    val = clean_size_value("000 Acres")
    assert val != val  # NaN check


def test_2077_acre_thousands_separator():
    assert clean_size_value("2,077 acre") == pytest.approx(2077.0, rel=1e-4)


# ----------------------------------------------------------------------
# Whole-dataset asserts
# ----------------------------------------------------------------------

def test_whole_dataset_no_zero_sizes_and_no_inf_ppa(df):
    new = clean_sizes(df[["size", "erf_size", "description"]])
    # price from legacy clean_price (price basis is Part A2; for the inf
    # check we only need any positive price — use the legacy price).
    price_pairs = df["price"].apply(legacy_clean_size_row_for_price)
    prices = price_pairs
    sizes = new["size_acres"].to_numpy(dtype=float)
    assert int(np.sum(sizes == 0.0)) == 0
    # price / size must never be inf.
    with np.errstate(divide="ignore", invalid="ignore"):
        ppa = prices / sizes
    assert int(np.sum(np.isinf(ppa))) == 0


def test_whole_dataset_erf_conflict_rows_match_erf(df):
    """Every row where the legacy value differs from a non-truncated
    acre-labelled erf_size by > 2x must now equal the erf_size value."""
    new = clean_sizes(df[["size", "erf_size", "description"]])

    def legacy_val(row):
        v, _ = legacy_clean_size(row["size"])
        if v is None or (isinstance(v, float) and math.isnan(v)):
            v, _ = legacy_extract(row["description"])
        return float(v) if v is not None and not (
            isinstance(v, float) and math.isnan(v)
        ) else float("nan")

    from landval.cleaning.size import parse_size_string

    mismatches = 0
    checked = 0
    for _, row in df.iterrows():
        erf = parse_size_string(row["erf_size"])
        if erf is None or erf.unit != "acres":
            continue
        # not truncated: parse_size_string already returns None for ^0\d+ tokens.
        lv = legacy_val(row)
        if not math.isfinite(lv) or lv <= 0 or erf.acres <= 0:
            continue
        if max(lv, erf.acres) / min(lv, erf.acres) > 2.0:
            checked += 1
            new_val = float(new.loc[row.name, "size_acres"])
            if not math.isfinite(new_val):
                mismatches += 1
                continue
            if abs(new_val - erf.acres) / erf.acres > 0.01:
                mismatches += 1
    # Report the counts even on success so the test output is informative.
    print(f"\nERF-conflict rows checked={checked} mismatches={mismatches}")
    assert mismatches == 0, f"{mismatches} erf-conflict rows did not match erf_size"


# ----------------------------------------------------------------------
# Small helper for the whole-dataset test (price parsing reuses legacy)
# ----------------------------------------------------------------------

def legacy_clean_size_row_for_price(raw):
    """Return the KSh float for a raw price via the legacy clean_price."""
    from tests.fixtures.legacy_cleaning import clean_price

    v, _flag = clean_price(raw)
    f = float(v) if v is not None and not (isinstance(v, float) and math.isnan(v)) else float("nan")
    return f
