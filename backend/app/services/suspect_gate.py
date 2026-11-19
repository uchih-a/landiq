"""Part B — suspect-listing gate (computed at serve time, never persisted).

A listing is "suspect" when its ``listed_over_predicted`` ratio falls
outside ``[SUSPECT_RATIO_LOW, SUSPECT_RATIO_HIGH]`` (canonical.py) or its
``size_acres`` is non-finite / non-positive.  The gate reads only columns
that already exist in ``listings_scored.parquet`` (Cell 9.6) — it writes
nothing to the artifacts and requires no retrain.

Used by:
  - ``app.api.v1.routers.listings`` (``/listings/scored``, the CSV export,
    and the per-row ``ListingsScoredRow``).
  - ``app.services.overview`` (the verdicts block reports ``n_suspect``
    and excludes suspects from the underpriced/fair/overpriced counts).
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from app.schemas.canonical import SUSPECT_RATIO_HIGH, SUSPECT_RATIO_LOW

REASON_BELOW = "listed_far_below_model"
REASON_ABOVE = "listed_far_above_model"
REASON_SIZE = "non_finite_size"


def _is_finite_num(v: Any) -> bool:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return False
    return math.isfinite(f)


def compute_suspect_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of `df` with ``is_suspect`` (bool) and
    ``suspect_reason`` (str | None) columns added/overwritten.

    The two columns are derived purely from ``listed_over_predicted`` and
    ``size_acres``; nothing is written back to disk.
    """
    out = df.copy()
    ratio = pd.to_numeric(out.get("listed_over_predicted"), errors="coerce")
    size = pd.to_numeric(out.get("size_acres"), errors="coerce")

    size_bad = ~size.apply(_is_finite_num) | (size <= 0)
    below = ratio < SUSPECT_RATIO_LOW
    above = ratio > SUSPECT_RATIO_HIGH

    is_suspect = size_bad | below | above
    # Reason priority: size issue first (it invalidates the ratio), then
    # below, then above.
    reason = pd.Series([None] * len(out), index=out.index, dtype=object)
    reason.loc[size_bad] = REASON_SIZE
    reason.loc[below & ~size_bad] = REASON_BELOW
    reason.loc[above & ~size_bad] = REASON_ABOVE

    out["is_suspect"] = is_suspect.astype(bool)
    out["suspect_reason"] = reason.where(is_suspect.astype(bool), None)
    return out


def n_suspect(df: pd.DataFrame) -> int:
    """Count suspect rows in a frame that already has (or will get) the
    ``is_suspect`` column.  Independent of the API path — used by tests to
    assert the API's count matches a direct pandas computation.
    """
    if "is_suspect" in df.columns:
        return int(df["is_suspect"].fillna(False).astype(bool).sum())
    return int(compute_suspect_columns(df)["is_suspect"].fillna(False).astype(bool).sum())
