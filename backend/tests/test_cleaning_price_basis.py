"""A2 — tests for the corrected price-basis detection
(``landval.cleaning.price_basis``).

Every assertion is on a REAL row of ``property24_kenya_finals.csv``,
combined with the A1 size parse.  Default mode is ``"convert"``.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import pandas as pd
import pytest

from landval.cleaning.price_basis import (
    PRICE_BASIS_MODE,
    detect_price_basis,
    resolve_prices,
)
from landval.cleaning.size import clean_size_record
from tests.fixtures.legacy_cleaning import clean_price as legacy_clean_price

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = Path(os.environ.get("LANDVAL_CSV", REPO_ROOT / "property24_kenya_finals.csv"))


@pytest.fixture(scope="module")
def df() -> pd.DataFrame:
    return pd.read_csv(CSV_PATH, encoding="utf-8", encoding_errors="replace")


def _row(df: pd.DataFrame, listing_no) -> pd.Series:
    sub = df[df["listing_no"].astype(str) == str(listing_no)]
    assert len(sub) == 1, f"listing {listing_no} not found ({len(sub)})"
    return sub.iloc[0]


def _price_size_basis(df, listing_no, mode="convert"):
    row = _row(df, listing_no)
    price, _flag = legacy_clean_price(row["price"])
    rec = clean_size_record(row["size"], row["erf_size"], row["description"])
    basis, conflict = detect_price_basis(price, row["description"])
    resolved = resolve_prices(price, rec.size_acres, basis, mode)
    return basis, conflict, resolved.price_per_acre, resolved.total_price_ksh, rec.size_acres


# ----------------------------------------------------------------------
# Spec A2 TESTS — default mode "convert"
# ----------------------------------------------------------------------

def test_110468626_per_acre(df):
    basis, conflict, ppa, total, _ = _price_size_basis(df, 110468626)
    assert basis == "per_acre"
    assert conflict is False
    assert ppa == pytest.approx(250_000, rel=1e-4)
    assert total == pytest.approx(1_000_000_000, rel=1e-4)


def test_111974793_per_acre(df):
    basis, conflict, ppa, total, _ = _price_size_basis(df, 111974793)
    assert basis == "per_acre"
    assert ppa == pytest.approx(220_000, rel=1e-4)
    assert total == pytest.approx(456_940_000, rel=1e-4)


def test_116939884_per_acre(df):
    basis, conflict, ppa, total, _ = _price_size_basis(df, 116939884)
    assert basis == "per_acre"
    assert ppa == pytest.approx(550_000, rel=1e-4)
    assert total == pytest.approx(2_475_000, rel=1e-4)


def test_116457878_per_acre_description_size_12(df):
    basis, conflict, ppa, total, size = _price_size_basis(df, 116457878)
    assert basis == "per_acre"
    assert size == pytest.approx(12.0, rel=1e-4)
    assert ppa == pytest.approx(25_000_000, rel=1e-4)
    assert total == pytest.approx(300_000_000, rel=1e-4)


def test_116846923_total_conflict_ppa_7m(df):
    # "7m per acre and total 5 acres at 35m" -> basis total, conflict=True;
    # ppa = 35m / 5 = 7m.
    basis, conflict, ppa, total, _ = _price_size_basis(df, 116846923)
    assert basis == "total"
    assert conflict is True
    assert ppa == pytest.approx(7_000_000, rel=1e-4)


def test_negative_6_listing_total(df):
    # listing_no == -6 (price 500m, "100m per acre total 500m", size 5):
    # basis total; ppa 100m.
    basis, conflict, ppa, total, size = _price_size_basis(df, -6)
    assert basis == "total"
    assert conflict is True
    assert size == pytest.approx(5.0, rel=1e-4)
    assert ppa == pytest.approx(100_000_000, rel=1e-4)


def test_117099203_no_per_acre_phrase_total(df):
    basis, conflict, ppa, total, _ = _price_size_basis(df, 117099203)
    assert basis == "total"
    assert conflict is False
    assert ppa == pytest.approx(19_000_000, rel=1e-4)


def test_117101654_no_per_acre_phrase_total(df):
    # 1,299,000 / 0.12 = 10,825,000.
    basis, conflict, ppa, total, _ = _price_size_basis(df, 117101654)
    assert basis == "total"
    assert conflict is False
    assert ppa == pytest.approx(10_825_000, rel=1e-4)


# ----------------------------------------------------------------------
# Mode tests on 110468626 (per_acre row)
# ----------------------------------------------------------------------

def test_mode_exclude_makes_per_acre_ppa_nan(df):
    basis, conflict, ppa, total, _ = _price_size_basis(df, 110468626, mode="exclude")
    assert basis == "per_acre"
    assert math.isnan(ppa)
    assert math.isnan(total)


def test_mode_flag_only_keeps_today_behaviour_but_basis_per_acre(df):
    # flag_only: price_per_acre == price / size (62.5) but price_basis
    # still "per_acre".
    basis, conflict, ppa, total, _ = _price_size_basis(df, 110468626, mode="flag_only")
    assert basis == "per_acre"
    assert ppa == pytest.approx(62.5, rel=1e-4)


def test_default_mode_is_convert():
    assert PRICE_BASIS_MODE == "convert"
