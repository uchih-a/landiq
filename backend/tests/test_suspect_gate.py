"""Part B — tests for the suspect-listing gate.

Loads ``listings_scored.parquet`` (a fixture built from the real CSV via
``tests.fixtures.listings_scored_fixture`` — no retrain, no artifact edit),
independently computes ``n_suspect`` with pandas, and asserts the API's
count matches.  Also asserts the real-row gate fires on the lowest-ratio
row and on listing 110468626, and that a mid-ratio row is NOT suspect.
"""

from __future__ import annotations

import csv as csvlib
import io
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.schemas.canonical import SUSPECT_RATIO_HIGH, SUSPECT_RATIO_LOW
from app.services.suspect_gate import compute_suspect_columns, n_suspect
from tests.fixtures.listings_scored_fixture import build_fixture_df
from tests.test_app_exports import _write_app_exports

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "property24_kenya_finals.csv"


@pytest.fixture
def scored_df() -> pd.DataFrame:
    return build_fixture_df(CSV_PATH)


@pytest.fixture
def df_app(app, tmp_path, scored_df):
    """Write the fixture parquet into tmp_path/app_exports and reload the
    registry so ``client`` serves it."""
    _write_app_exports(tmp_path, {"listings_scored.parquet": scored_df})
    from app.services.app_exports import AppExportsRegistry

    app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    yield app


# ----------------------------------------------------------------------
# Independent computation vs the API's count
# ----------------------------------------------------------------------

def _independent_n_suspect(df: pd.DataFrame) -> int:
    """Recompute n_suspect straight from the parquet with pandas — the
    reference the API's count is asserted against."""
    ratio = pd.to_numeric(df["listed_over_predicted"], errors="coerce")
    size = pd.to_numeric(df["size_acres"], errors="coerce")
    size_bad = ~size.apply(lambda v: math.isfinite(float(v))) | (size <= 0)
    return int(((ratio < SUSPECT_RATIO_LOW) | (ratio > SUSPECT_RATIO_HIGH) | size_bad).sum())


def test_api_n_suspect_matches_independent_pandas(df_app, client, scored_df):
    independent = _independent_n_suspect(scored_df)
    via_helper = n_suspect(scored_df)
    assert via_helper == independent  # the helper and the literal agree

    # /listings/scored?is_suspect=true total_rows == n_suspect
    resp = client.get("/api/v1/listings/scored?is_suspect=true&page_size=1")
    assert resp.status_code == 200
    body = resp.json()
    api_n_suspect = body["pagination"]["total_rows"]
    assert api_n_suspect == independent, (
        f"API n_suspect={api_n_suspect} != independent={independent}"
    )

    # /api/v1/overview/summary verdicts.n_suspect == n_suspect
    ov = client.get("/api/v1/overview/summary").json()
    assert ov["verdicts"]["n_suspect"] == independent

    # is_suspect=false total_rows == len - n_suspect
    resp2 = client.get("/api/v1/listings/scored?is_suspect=false&page_size=1")
    assert resp2.json()["pagination"]["total_rows"] == len(scored_df) - independent

    print(
        f"\nB: n_suspect (independent pandas) = {independent}; "
        f"API /listings/scored?is_suspect=true = {api_n_suspect}; "
        f"overview verdicts.n_suspect = {ov['verdicts']['n_suspect']}"
    )


# ----------------------------------------------------------------------
# Real-row gate
# ----------------------------------------------------------------------

def test_listing_110468626_is_suspect_below_model(df_app, client, scored_df):
    """110468626 is a per-acre listing (KSh 250k/acre for 4000 acres) whose
    listed per-acre price is far below the model baseline -> suspect."""
    # The CSV export streams every suspect row in one response.
    resp = client.get("/api/v1/listings/scored/export.csv?is_suspect=true")
    assert resp.status_code == 200
    reader = csvlib.reader(io.StringIO(resp.content.decode("utf-8-sig")))
    header = next(reader)
    i_no = header.index("listing_no")
    i_sus = header.index("is_suspect")
    i_rea = header.index("suspect_reason")
    rows = {r[i_no]: (r[i_sus], r[i_rea]) for r in reader}

    assert "110468626" in rows, "110468626 not in suspect export"
    sus, reason = rows["110468626"]
    assert sus == "true"
    assert reason == "listed_far_below_model"

    # Independent pandas agrees.
    row = compute_suspect_columns(scored_df)
    r = row[row["listing_no"] == "110468626"].iloc[0]
    assert bool(r["is_suspect"]) is True
    assert r["suspect_reason"] == "listed_far_below_model"
    print(
        f"\n110468626: ratio={r['listed_over_predicted']:.6f} "
        f"is_suspect={r['is_suspect']} reason={r['suspect_reason']}"
    )


def test_lowest_ratio_real_row_is_suspect(df_app, client, scored_df):
    """The lowest-ratio real row (excluding the synthetic EDGE_* rows) is
    suspect with reason 'listed_far_below_model'."""
    real = scored_df[~scored_df["listing_no"].astype(str).str.startswith("EDGE_")]
    finite = real[np.isfinite(real["listed_over_predicted"].astype(float))]
    idx = finite["listed_over_predicted"].astype(float).idxmin()
    lowest = finite.loc[idx]
    gated = compute_suspect_columns(scored_df)
    g = gated.loc[idx]
    assert bool(g["is_suspect"]) is True
    assert g["suspect_reason"] == "listed_far_below_model"
    print(
        f"\nlowest-ratio real row: listing={lowest['listing_no']} "
        f"ratio={lowest['listed_over_predicted']:.3e} "
        f"is_suspect={g['is_suspect']} reason={g['suspect_reason']}"
    )


def test_mid_ratio_row_not_suspect(df_app, client, scored_df):
    """A row with 0.5 < ratio < 2 is NOT suspect."""
    gated = compute_suspect_columns(scored_df)
    mid = gated[
        (gated["listed_over_predicted"] > 0.5)
        & (gated["listed_over_predicted"] < 2.0)
        & (~gated["is_suspect"])
    ]
    assert len(mid) > 0
    r = mid.iloc[0]
    assert bool(r["is_suspect"]) is False
    assert r["suspect_reason"] is None or (isinstance(r["suspect_reason"], float) and math.isnan(r["suspect_reason"]))
    # Also the synthetic EDGE_MID_RATIO (ratio 1.0) is not suspect and is
    # NOT in the is_suspect=true export.
    resp = client.get("/api/v1/listings/scored/export.csv?is_suspect=true")
    reader = csvlib.reader(io.StringIO(resp.content.decode("utf-8-sig")))
    header = next(reader)
    i_no = header.index("listing_no")
    nos = {r[i_no] for r in reader}
    assert "EDGE_MID_RATIO" not in nos


# ----------------------------------------------------------------------
# Verdict counts: underpriced before vs after excluding suspects
# ----------------------------------------------------------------------

def test_underpriced_count_excludes_suspects(df_app, client, scored_df):
    """The API's verdicts.underpriced EXCLUDES suspects.  Report the
    before/after counts."""
    gated = compute_suspect_columns(scored_df)
    sus = gated["is_suspect"].fillna(False).astype(bool)
    before = int((scored_df["verdict"] == "underpriced").sum())
    after = int(((scored_df["verdict"] == "underpriced") & ~sus).sum())

    ov = client.get("/api/v1/overview/summary").json()
    assert ov["verdicts"]["underpriced"] == after
    print(
        f"\nunderpriced: before={before} (full df) "
        f"after={after} (excluding suspects) "
        f"API verdicts.underpriced={ov['verdicts']['underpriced']}"
    )


# ----------------------------------------------------------------------
# Edge rows exercise every suspect_reason via the API
# ----------------------------------------------------------------------

def test_edge_rows_surface_every_reason(df_app, client):
    resp = client.get("/api/v1/listings/scored/export.csv?is_suspect=true")
    reader = csvlib.reader(io.StringIO(resp.content.decode("utf-8-sig")))
    header = next(reader)
    i_no = header.index("listing_no")
    i_rea = header.index("suspect_reason")
    rows = {r[i_no]: r[i_rea] for r in reader}
    assert rows["EDGE_LOW_RATIO"] == "listed_far_below_model"
    assert rows["EDGE_HIGH_RATIO"] == "listed_far_above_model"
    assert rows["EDGE_ZERO_SIZE"] == "non_finite_size"
