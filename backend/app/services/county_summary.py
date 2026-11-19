"""Pure computation for GET /api/v1/counties/summary (P3b) and the
distance-profile endpoint — kept in a service module so every number is
unit-testable without HTTP.

Handles:
  - prop_type filtering (canonical, case-insensitive EXACT match)
  - per-county aggregates from the frame (median / Q1 / Q3 / n) when a
    prop_type filter is applied; the pre-aggregated county_summary.csv
    path is kept for the unfiltered call (backward compatible)
  - price bands as DATA: quintile edges of the county medians (of the
    counties that meet min_county_n), so the frontend only maps a band
    index -> colour token
  - min_county_n from the artifact config; null + data_quality flag
    when the config is missing (no typed 10 fallback masking it)
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.schemas.canonical import PROPERTY_TYPES

logger = get_logger("app.county_summary")


def canonical_prop_type_or_none(raw: str | None) -> str | None:
    """Normalise a prop_type query value to the canonical casing, or None
    when the value does not case-insensitively match one of the canonical
    types (the router raises 422 in that case — this helper is also used
    by tests)."""
    if raw is None:
        return None
    for canonical in PROPERTY_TYPES:
        if raw.lower() == canonical.lower():
            return canonical
    return None


def min_county_n_from_manifest(manifest: dict[str, Any] | None) -> int | None:
    """Read MIN_COUNTY_N from the manifest config.  Returns None when the
    manifest or the config block lacks it — P3b fix: no typed 10 fallback
    that would mask a missing artifact."""
    if not manifest:
        return None
    config = manifest.get("config")
    if not isinstance(config, dict):
        return None
    value = config.get("MIN_COUNTY_N")
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        logger.warning("manifest_min_county_n_invalid", value=value)
        return None


def compute_property_type_counts(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Per-type row counts over the FULL (unfiltered) frame — the counts
    the dropdown renders, so the user sees corpus-level support per type."""
    lower_types = df["prop_type"].fillna("").str.lower()
    counts: list[dict[str, Any]] = []
    for name in PROPERTY_TYPES:
        counts.append({"name": name, "n": int((lower_types == name.lower()).sum())})
    return counts


def count_unmapped_prop_types(df: pd.DataFrame) -> int:
    """Rows whose prop_type is not one of the canonical types."""
    lower_types = df["prop_type"].fillna("").str.lower()
    canonical_lower = {n.lower() for n in PROPERTY_TYPES}
    unmapped_mask = ~lower_types.isin(canonical_lower)
    n = int(unmapped_mask.sum())
    if n > 0:
        logger.warning(
            "county_summary_unmapped_prop_type_rows",
            n=n,
            distinct_values=sorted(
                str(v) for v in df.loc[unmapped_mask, "prop_type"].dropna().unique().tolist()
            ),
        )
    return n


def compute_price_bands(
    medians: list[float], n_bands: int = 5
) -> tuple[list[dict[str, Any]], str | None]:
    """Compute the colour-band edges as quintiles of the county medians.

    Method (documented per the brief): the band edges are the quantile
    cut points of the medians of the counties that meet min_county_n —
    i.e. ``n_bands`` bands of equal county-frequency, so each colour
    holds roughly the same number of counties.  The edges are recomputed
    whenever the filter changes so the legend always matches the map.

    Returns ``(bands, reason)`` where ``bands`` is a list of
    ``{index, lower, upper}`` dicts (``upper=None`` means the open top
    band) and ``reason`` is set when the bands could not be computed
    (fewer eligible counties than bands, no medians, degenerate spread).
    """
    arr = np.asarray([m for m in medians if m is not None and np.isfinite(m)], dtype=float)
    if arr.size == 0:
        return [], "no_counties_with_data"
    if arr.size < n_bands:
        return [], "fewer_counties_than_bands"
    # Equal-frequency quantile edges (includes min and max as outer edges).
    qs = np.quantile(arr, np.linspace(0.0, 1.0, n_bands + 1))
    # If every median is identical the bands are degenerate — still
    # technically computable, but the map would be one flat colour;
    # surface it as a reason rather than pretending the bands mean anything.
    if float(qs.max() - qs.min()) <= 0.0:
        return [], "degenerate_median_spread"
    bands: list[dict[str, Any]] = []
    for i in range(n_bands):
        lower = float(qs[i])
        upper = float(qs[i + 1]) if i < n_bands - 1 else None
        # Guard zero-width middle bands (duplicate quantiles) by nudging
        # the upper edge up by the smallest representable step so each
        # band holds at least one county.
        if upper is not None and upper <= lower:
            upper = np.nextafter(lower, np.inf)
            upper = float(upper)
        bands.append({"index": i, "lower": lower, "upper": upper})
    return bands, None


def summarize_frame_by_county(df: pd.DataFrame, min_county_n: int | None) -> pd.DataFrame:
    """Aggregate the (already prop_type-filtered) frame per county.

    Mirrors the county_summary.csv columns the frontend consumes
    (county / n_listings / median / q1 / q3 / n_below_min_county_n).
    ``mean_log_price_per_acre`` is computed from the frame's log prices;
    ``water_body_distance_share`` is NOT available in the frame (the CSV
    path carries it from the notebook) so it is left NaN — the field is
    nullable in the schema and unused by the Market Insights UI.
    """
    columns = [
        "county",
        "n_listings",
        "median_price_per_acre_ksh",
        "q1_price_per_acre_ksh",
        "q3_price_per_acre_ksh",
        "mean_log_price_per_acre",
        "water_body_distance_share",
        "n_below_min_county_n",
    ]
    if len(df) == 0:
        return pd.DataFrame(columns=columns)
    prices_all = df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    usable_mask = np.isfinite(prices_all) & (prices_all > 0)

    records = []
    for county_name, g in df.groupby(df["county"].fillna("(unknown)"), dropna=False):
        g_idx = g.index
        usable_pos = [
            i
            for i, m in zip(
                range(len(g)), usable_mask[[df.index.get_loc(j) for j in g_idx]], strict=False
            )
            if m
        ]
        usable = (
            g["listed_price_per_acre_ksh"].to_numpy(dtype=float)[usable_pos]
            if usable_pos
            else np.array([])
        )
        n = int(len(g))
        if usable.size == 0:
            med = q1 = q3 = mean_log = float("nan")
        else:
            q1, med, q3 = np.percentile(usable, [25, 50, 75])
            mean_log = float(np.mean(np.log(usable)))
        records.append(
            {
                "county": str(county_name),
                "n_listings": n,
                "median_price_per_acre_ksh": float(med),
                "q1_price_per_acre_ksh": float(q1),
                "q3_price_per_acre_ksh": float(q3),
                "mean_log_price_per_acre": mean_log,
                "water_body_distance_share": float("nan"),
                "n_below_min_county_n": (
                    bool(n < min_county_n) if min_county_n is not None else False
                ),
            }
        )
    return pd.DataFrame.from_records(records, columns=columns)
