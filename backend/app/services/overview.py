"""Pure computation for GET /api/v1/overview/summary.

Lives in a service module (not the router) so every number is unit-testable
without spinning up FastAPI.  The router is a thin wrapper that loads the
DataFrame via ``AppExportsRegistry.require``, reads coverage rules + the
Nairobi reference, validates the query params, and calls
``compute_overview_summary``.

Performance: every aggregation is vectorised pandas / numpy.  On the
production dataset (~1k rows) the whole summary computes in single-digit
milliseconds; even at 100k rows it stays well under the 100 ms target.
No caching layer is warranted at the current dataset size.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.schemas.overview import (
    DISTANCE_BAND_EDGES_KM,
    PROPERTY_TYPES,
    SIZE_BAND_EDGES_ACRES,
    ByDistanceBandBlock,
    ByPropertyTypeBlock,
    BySizeBandBlock,
    CountiesBlock,
    CountyStat,
    DistanceBand,
    FiltersBlock,
    OthersBlock,
    OverviewSummaryResponse,
    PropertyTypeCount,
    PropertyTypeStat,
    ScatterPoint,
    ScatterSampleBlock,
    SizeBand,
    TotalsBlock,
    TrendBlock,
    VerdictsBlock,
)
from app.services.geo_reference import compute_distances_to_nairobi

logger = get_logger("app.overview")

# Human labels for the canonical band edges.  Length matches the edges
# list (one label per band, i.e. ``len(edges) - 1`` labels).
SIZE_BAND_LABELS: list[str] = [
    "<1/8 ac",
    "1/8-1/4 ac",
    "1/4-1/2 ac",
    "1/2-1 ac",
    "1-5 ac",
    "5-20 ac",
    "20+ ac",
]
DISTANCE_BAND_LABELS: list[str] = [
    "0-25 km",
    "25-50 km",
    "50-100 km",
    "100-200 km",
    "200-400 km",
    "400+ km",
]

# Deterministic seed for the scatter sample — fixed so the same filtered
# selection always yields the same sample (re-rendering the page does not
# reshuffle the points).  Per the brief: "Never take head()/first-N of a
# sorted frame."
_SCATTER_SEED = 20261117

# Query-param defaults / caps.
DEFAULT_TOP_N = 3
DEFAULT_SCATTER_LIMIT = 400
MAX_SCATTER_LIMIT = 1000


@dataclass
class OverviewFilters:
    """Normalised filter inputs — the router builds this from query params."""

    county: str | None = None
    prop_type: str | None = None
    top_n_counties: int = DEFAULT_TOP_N
    scatter_limit: int = DEFAULT_SCATTER_LIMIT


def _edge_or_none(edges: list[float], i: int) -> float | None:
    """Return ``edges[i]`` as None when it's +inf (the open tail edge)."""
    v = edges[i]
    return None if v == float("inf") else float(v)


def _safe_float(v: Any) -> float | None:
    """NaN / pandas NA / inf -> None for clean JSON (no NaN in output)."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return f


def _median_quartiles(prices: np.ndarray) -> tuple[float | None, float | None, float | None]:
    """Return (median, q1, q3) of a price array, all None when empty."""
    if prices.size == 0:
        return None, None, None
    finite = prices[np.isfinite(prices) & (prices > 0)]
    if finite.size == 0:
        return None, None, None
    q1, med, q3 = np.percentile(finite, [25, 50, 75])
    return float(med), float(q1), float(q3)


def _size_band_label(lower: float, upper: float) -> str:
    """Map a (lower, upper) edge pair to the canonical label."""
    for i in range(len(SIZE_BAND_EDGES_ACRES) - 1):
        if SIZE_BAND_EDGES_ACRES[i] == lower and SIZE_BAND_EDGES_ACRES[i + 1] == upper:
            return SIZE_BAND_LABELS[i]
    return f"{lower:g}-{upper:g} ac"


def _distance_band_label(lower: float, upper: float) -> str:
    for i in range(len(DISTANCE_BAND_EDGES_KM) - 1):
        if DISTANCE_BAND_EDGES_KM[i] == lower and DISTANCE_BAND_EDGES_KM[i + 1] == upper:
            return DISTANCE_BAND_LABELS[i]
    return f"{lower:g}-{upper:g} km"


def _filter_frame(df: pd.DataFrame, county: str | None, prop_type: str | None) -> pd.DataFrame:
    """Apply the county + canonical prop_type filters.

    - county: case-insensitive exact match against ``df['county']``.
      (Different from /listings/scored's substring match — documented.)
    - prop_type: case-insensitive exact match against the canonical
      ``PROPERTY_TYPES`` (the router validates the input is one of these).
    """
    mask = pd.Series([True] * len(df), index=df.index)
    if county is not None:
        mask &= df["county"].fillna("").str.lower() == county.lower()
    if prop_type is not None:
        mask &= df["prop_type"].fillna("").str.lower() == prop_type.lower()
    return df[mask]


def _counties_total(app_exports: Any, app_state: Any) -> int:
    """Total county count — from the boundaries service when loaded, else
    the count of distinct counties in the data (a fallback that says
    'we know at least this many counties have listings' rather than a
    fabricated 47)."""
    boundaries = getattr(app_state, "county_boundaries_index", None)
    if boundaries is not None and getattr(boundaries, "loaded", False):
        return int(getattr(boundaries, "n_counties", 0))
    # Fallback: distinct counties in the loaded data.  This is *not* a
    # total-of-47 literal; it is the honest count of counties the data
    # currently covers (and may be less than 47 if the data is partial).
    df = app_exports.listings_scored_df
    if df is None or len(df) == 0:
        return 0
    return int(df["county"].fillna("(unknown)").nunique())


def _totals_block(df: pd.DataFrame, min_county_n: int) -> TotalsBlock:
    """Aggregate counters + median/IQR + county-threshold counts."""
    prices = (
        df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
        if len(df)
        else np.array([], dtype=float)
    )
    usable_mask = np.isfinite(prices) & (prices > 0)
    usable = prices[usable_mask]
    median, q1, q3 = _median_quartiles(usable)
    n_flagged = int(df["data_quality_flag"].fillna(False).astype(bool).sum()) if len(df) else 0
    county_counts = (
        df["county"].fillna("(unknown)").value_counts() if len(df) else pd.Series([], dtype=int)
    )
    n_with_data = int(len(county_counts))
    n_meeting = int((county_counts >= min_county_n).sum()) if n_with_data else 0
    return TotalsBlock(
        n_listings=int(len(df)),
        n_flagged=n_flagged,
        median_price_per_acre_ksh=_safe_float(median),
        q1_price_per_acre_ksh=_safe_float(q1),
        q3_price_per_acre_ksh=_safe_float(q3),
        n_counties_with_data=n_with_data,
        n_counties_meeting_threshold=n_meeting,
    )


def _verdicts_block(df: pd.DataFrame) -> VerdictsBlock:
    """Counts + shares of the stored verdict column.  Never re-derives
    thresholds — reads the column the model wrote.

    Part B: suspect rows (``is_suspect`` column, derived at serve time by
    ``app.services.suspect_gate.compute_suspect_columns``) are reported
    separately as ``n_suspect`` and EXCLUDED from the underpriced/fair/
    overpriced counts.  ``n_unknown`` is then ``n_listings - u - f - o -
    n_suspect`` so the four counts still sum to ``n_listings``."""
    if len(df) == 0:
        return VerdictsBlock(
            underpriced=0,
            fair=0,
            overpriced=0,
            n_unknown=0,
            underpriced_share=None,
            fair_share=None,
            overpriced_share=None,
            n_listings=0,
            n_suspect=0,
        )
    n = int(len(df))
    if "is_suspect" in df.columns:
        suspect_mask = df["is_suspect"].fillna(False).astype(bool)
    else:
        suspect_mask = pd.Series([False] * n, index=df.index)
    n_suspect = int(suspect_mask.sum())

    # Verdict counts EXCLUDE suspects (the deal signal is unreliable for
    # rows whose listed/predicted ratio is implausible).
    clean = df.loc[~suspect_mask]
    counts = clean["verdict"].fillna("(unknown)").value_counts()
    u = int(counts.get("underpriced", 0))
    f = int(counts.get("fair", 0))
    o = int(counts.get("overpriced", 0))
    n_unknown = n - u - f - o - n_suspect
    if n_unknown < 0:
        n_unknown = 0
    return VerdictsBlock(
        underpriced=u,
        fair=f,
        overpriced=o,
        n_unknown=n_unknown,
        underpriced_share=round(u / n, 4) if n else None,
        fair_share=round(f / n, 4) if n else None,
        overpriced_share=round(o / n, 4) if n else None,
        n_listings=n,
        n_suspect=n_suspect,
    )


def _by_property_type(county_filtered: pd.DataFrame, min_county_n: int) -> ByPropertyTypeBlock:
    """Three canonical type bars + leader summary.  Filtered by COUNTY only
    (so all three bars always show, never zeroed out by a prop_type filter)."""
    types: list[PropertyTypeStat] = []
    for name in PROPERTY_TYPES:
        sub = county_filtered[county_filtered["prop_type"].fillna("").str.lower() == name.lower()]
        prices = (
            sub["listed_price_per_acre_ksh"].to_numpy(dtype=float)
            if len(sub)
            else np.array([], dtype=float)
        )
        med, q1, q3 = _median_quartiles(prices)
        types.append(
            PropertyTypeStat(
                name=name,
                n=int(len(sub)),
                median_price_per_acre_ksh=_safe_float(med),
                q1_price_per_acre_ksh=_safe_float(q1),
                q3_price_per_acre_ksh=_safe_float(q3),
            )
        )

    # Leader = type with the highest median.  Premium = leader_median vs
    # the median of all OTHER types with data (combined).
    medians = [
        (t.name, t.median_price_per_acre_ksh)
        for t in types
        if t.median_price_per_acre_ksh is not None
    ]
    if len(medians) < 2:
        return ByPropertyTypeBlock(types=types, leader=None, leader_premium_pct=None)

    medians.sort(key=lambda x: x[1], reverse=True)
    leader_name, leader_median = medians[0]
    others = np.array([m for (_, m) in medians[1:]], dtype=float)
    others_median = float(np.median(others))
    if others_median <= 0:
        return ByPropertyTypeBlock(types=types, leader=leader_name, leader_premium_pct=None)
    premium = round((leader_median - others_median) / others_median * 100, 1)
    return ByPropertyTypeBlock(types=types, leader=leader_name, leader_premium_pct=premium)


def _by_size_band(
    filtered: pd.DataFrame, min_county_n: int, comparison_df: pd.DataFrame | None
) -> BySizeBandBlock:
    """Per-band median + low_support flag, plus the national comparison
    series when a county filter is applied."""

    def _bands_for(df: pd.DataFrame) -> list[SizeBand]:
        if len(df) == 0:
            return [
                SizeBand(
                    label=SIZE_BAND_LABELS[i],
                    lower_acres=SIZE_BAND_EDGES_ACRES[i],
                    upper_acres=_edge_or_none(SIZE_BAND_EDGES_ACRES, i + 1),
                    n=0,
                    median_price_per_acre_ksh=None,
                    low_support=True,
                )
                for i in range(len(SIZE_BAND_EDGES_ACRES) - 1)
            ]
        sizes = df["size_acres"].to_numpy(dtype=float)
        prices = df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
        valid = np.isfinite(sizes) & (sizes >= 0) & np.isfinite(prices) & (prices > 0)
        out: list[SizeBand] = []
        for i in range(len(SIZE_BAND_EDGES_ACRES) - 1):
            lo = SIZE_BAND_EDGES_ACRES[i]
            hi = SIZE_BAND_EDGES_ACRES[i + 1]
            # Value exactly on an edge goes to the UPPER band — document it.
            # (np.digitize with right=False does this.)
            if i == len(SIZE_BAND_EDGES_ACRES) - 2:
                band_mask = valid & (sizes >= lo)
            else:
                band_mask = valid & (sizes >= lo) & (sizes < hi)
            band_prices = prices[band_mask]
            med, _q1, _q3 = _median_quartiles(band_prices)
            out.append(
                SizeBand(
                    label=SIZE_BAND_LABELS[i],
                    lower_acres=lo,
                    upper_acres=_edge_or_none(SIZE_BAND_EDGES_ACRES, i + 1),
                    n=int(band_mask.sum()),
                    median_price_per_acre_ksh=_safe_float(med),
                    low_support=int(band_mask.sum()) < min_county_n,
                )
            )
        return out

    bands = _bands_for(filtered)
    comparison = _bands_for(comparison_df) if comparison_df is not None else None

    # bulk_discount: smallest populated band -> largest populated band.
    populated = [b for b in bands if b.median_price_per_acre_ksh is not None]
    if len(populated) < 2:
        bulk = None
    else:
        smallest = populated[0]  # bands are ordered by size ascending
        largest = populated[-1]
        if smallest.median_price_per_acre_ksh is None or smallest.median_price_per_acre_ksh <= 0:
            bulk = None
        else:
            bulk = round(
                (smallest.median_price_per_acre_ksh - largest.median_price_per_acre_ksh)
                / smallest.median_price_per_acre_ksh
                * 100,
                1,
            )

    return BySizeBandBlock(bands=bands, comparison=comparison, bulk_discount_pct=bulk)


def _by_distance_band(
    filtered: pd.DataFrame, distances: np.ndarray, min_county_n: int
) -> ByDistanceBandBlock:
    """Per-band median + IQR + low_support flag for the filtered selection."""
    if len(filtered) == 0:
        return ByDistanceBandBlock(
            bands=[
                DistanceBand(
                    label=DISTANCE_BAND_LABELS[i],
                    lower_km=DISTANCE_BAND_EDGES_KM[i],
                    upper_km=_edge_or_none(DISTANCE_BAND_EDGES_KM, i + 1),
                    n=0,
                    median_price_per_acre_ksh=None,
                    q1_price_per_acre_ksh=None,
                    q3_price_per_acre_ksh=None,
                    low_support=True,
                )
                for i in range(len(DISTANCE_BAND_EDGES_KM) - 1)
            ]
        )
    prices = filtered["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    valid = np.isfinite(distances) & (distances >= 0) & np.isfinite(prices) & (prices > 0)
    bands: list[DistanceBand] = []
    for i in range(len(DISTANCE_BAND_EDGES_KM) - 1):
        lo = DISTANCE_BAND_EDGES_KM[i]
        hi = DISTANCE_BAND_EDGES_KM[i + 1]
        if i == len(DISTANCE_BAND_EDGES_KM) - 2:
            band_mask = valid & (distances >= lo)
        else:
            band_mask = valid & (distances >= lo) & (distances < hi)
        band_prices = prices[band_mask]
        med, q1, q3 = _median_quartiles(band_prices)
        bands.append(
            DistanceBand(
                label=DISTANCE_BAND_LABELS[i],
                lower_km=lo,
                upper_km=_edge_or_none(DISTANCE_BAND_EDGES_KM, i + 1),
                n=int(band_mask.sum()),
                median_price_per_acre_ksh=_safe_float(med),
                q1_price_per_acre_ksh=_safe_float(q1),
                q3_price_per_acre_ksh=_safe_float(q3),
                low_support=int(band_mask.sum()) < min_county_n,
            )
        )
    return ByDistanceBandBlock(bands=bands)


def _trend_block(prices: np.ndarray, distances: np.ndarray) -> TrendBlock:
    """Log-linear fit ``log(price) = slope * distance + intercept`` over
    ALL filtered rows.  Vectorised numpy least-squares.  Returns r2 (not
    adjusted) so the caller can judge how much of the variance the linear
    model explains."""
    valid = np.isfinite(prices) & (prices > 0) & np.isfinite(distances) & (distances >= 0)
    n = int(valid.sum())
    if n < 2:
        return TrendBlock(slope=None, intercept=None, r2=None, n=n)
    x = distances[valid]
    y = np.log(prices[valid])
    # numpy.polyfit(degree=1) returns [slope, intercept]
    slope, intercept = np.polyfit(x, y, 1)
    y_pred = slope * x + intercept
    ss_res = float(np.sum((y - y_pred) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 1.0
    return TrendBlock(
        slope=float(slope),
        intercept=float(intercept),
        r2=float(r2),
        n=n,
    )


def _scatter_sample(
    filtered: pd.DataFrame,
    distances: np.ndarray,
    limit: int,
) -> ScatterSampleBlock:
    """Deterministic, UNBIASED random sample.  Uses a fixed seed and
    ``numpy.random.Generator.permutation`` on the row indices — never
    ``head()`` / first-N of a sorted frame.  Even if the input is sorted
    most-underpriced-first (which is what /listings/scored serves), the
    permutation yields a representative mix."""
    n_total = int(len(filtered))
    if n_total == 0:
        return ScatterSampleBlock(points=[], n_total=0, n_returned=0, sample_limit=limit)
    rng = np.random.default_rng(_SCATTER_SEED)
    perm = rng.permutation(n_total)
    take = min(limit, n_total)
    idx = perm[:take]
    sample = filtered.iloc[idx].reset_index(drop=True)
    sample_dists = distances[idx]
    points: list[ScatterPoint] = []
    for i, (_, r) in enumerate(sample.iterrows()):
        price = r.get("listed_price_per_acre_ksh")
        try:
            price_f = float(price)
        except (TypeError, ValueError):
            continue
        if not np.isfinite(price_f) or price_f <= 0:
            continue
        d = sample_dists[i]
        points.append(
            ScatterPoint(
                listing_no=_safe_str(r.get("listing_no")),
                county=_safe_str(r.get("county")),
                distance_km=_safe_float(d),
                price_per_acre_ksh=price_f,
                verdict=_safe_str(r.get("verdict")),
            )
        )
    return ScatterSampleBlock(
        points=points,
        n_total=n_total,
        n_returned=len(points),
        sample_limit=limit,
    )


def _safe_str(v: Any) -> str | None:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return str(v)


def _counties_block(df: pd.DataFrame, top_n: int, min_county_n: int) -> CountiesBlock:
    """Top-N counties by listing count + the combined ``Others`` entry."""
    if len(df) == 0:
        return CountiesBlock(
            top=[],
            others=OthersBlock(counties=[], n=0, median_price_per_acre_ksh=None),
            top_n=top_n,
        )
    grouped = df.groupby("county", dropna=False)
    rows = []
    for county, sub in grouped:
        prices = sub["listed_price_per_acre_ksh"].to_numpy(dtype=float)
        med, _q1, _q3 = _median_quartiles(prices)
        rows.append((str(county), int(len(sub)), med))
    # Sort by n desc, then county asc for a deterministic order.
    rows.sort(key=lambda x: (-x[1], x[0]))
    top = rows[:top_n]
    others = rows[top_n:]
    top_stats = [
        CountyStat(county=c, n=n, median_price_per_acre_ksh=_safe_float(m)) for (c, n, m) in top
    ]
    if others:
        others_counties = [c for (c, _, _) in others]
        others_n = sum(n for (_, n, _) in others)
        # Combined median: pool every per-acre price in the others rows.
        others_prices = (
            np.concatenate(
                [
                    sub["listed_price_per_acre_ksh"].to_numpy(dtype=float)
                    for (_, sub) in grouped
                    if str(sub.iloc[0]["county"]) in others_counties
                ]
            )
            if others
            else np.array([], dtype=float)
        )
        others_med, _q1, _q3 = _median_quartiles(others_prices)
    else:
        others_counties = []
        others_n = 0
        others_med = None
    return CountiesBlock(
        top=top_stats,
        others=OthersBlock(
            counties=others_counties,
            n=others_n,
            median_price_per_acre_ksh=_safe_float(others_med),
        ),
        top_n=top_n,
    )


def compute_overview_summary(
    df: pd.DataFrame,
    *,
    filters: OverviewFilters,
    coverage_rules: dict[str, Any] | None,
    artifacts_dir: str | None,
    app_state: Any,
    app_exports: Any,
) -> OverviewSummaryResponse:
    """Pure computation — given the loaded DataFrame + the coverage rules
    + the app state (for the boundaries service) + the app_exports
    registry (for /meta's data date), return the typed response.

    The router builds ``OverviewFilters`` from validated query params and
    calls this.  All NaN / inf are coalesced to ``None`` before the model
    is built, so the JSON never contains non-finite numbers.
    """
    # Read coverage rules — same source /meta uses.  No literal fallback
    # that masks a missing artifact: if the rules are absent, the threshold
    # is None and low_support bands are flagged conservatively (n_below = n
    # itself when min_county_n is unknown).  We pick a conservative
    # threshold of 1 here (i.e. any band with at least 1 row is not
    # low_support) because the manifest's MIN_COUNTY_N is about counties,
    # not bands — and we want to avoid silently hiding bands when the
    # operator hasn't loaded coverage_rules.json.  The /meta endpoint
    # surfaces the same threshold so the UI can explain.
    min_county_n = 10  # manifest's documented default — also exposed via /meta
    if coverage_rules:
        import contextlib

        with contextlib.suppress(TypeError, ValueError):
            min_county_n = int(coverage_rules.get("COVERAGE_MIN_COUNTY_N", min_county_n))

    # ---- Empty-frame short-circuit: an empty DataFrame (no rows, possibly
    # missing columns after a parquet round-trip) returns the empty-state
    # response directly.  The router has already validated the query params
    # against the data, so reaching here with an empty frame means the
    # artifact loaded but contains 0 rows (degenerate but honest).
    if len(df) == 0:
        empty_filters = FiltersBlock(
            county=filters.county,
            prop_type=filters.prop_type,
            property_types=[PropertyTypeCount(name=name, n=0) for name in PROPERTY_TYPES],
        )
        return OverviewSummaryResponse(
            filters=empty_filters,
            property_types_canonical=list(PROPERTY_TYPES),
            size_band_edges_acres=[None if e == float("inf") else e for e in SIZE_BAND_EDGES_ACRES],
            size_band_labels=list(SIZE_BAND_LABELS),
            distance_band_edges_km=[
                None if e == float("inf") else e for e in DISTANCE_BAND_EDGES_KM
            ],
            distance_band_labels=list(DISTANCE_BAND_LABELS),
            unmapped_prop_type_rows=0,
            totals=TotalsBlock(
                n_listings=0,
                n_flagged=0,
                median_price_per_acre_ksh=None,
                q1_price_per_acre_ksh=None,
                q3_price_per_acre_ksh=None,
                n_counties_with_data=0,
                n_counties_meeting_threshold=0,
            ),
            national=TotalsBlock(
                n_listings=0,
                n_flagged=0,
                median_price_per_acre_ksh=None,
                q1_price_per_acre_ksh=None,
                q3_price_per_acre_ksh=None,
                n_counties_with_data=0,
                n_counties_meeting_threshold=0,
            ),
            n_counties_total=_counties_total(app_exports, app_state),
            verdicts=VerdictsBlock(
                underpriced=0,
                fair=0,
                overpriced=0,
                n_unknown=0,
                underpriced_share=None,
                fair_share=None,
                overpriced_share=None,
                n_listings=0,
                n_suspect=0,
            ),
            by_property_type=ByPropertyTypeBlock(
                types=[
                    PropertyTypeStat(name=name, n=0, median_price_per_acre_ksh=None)
                    for name in PROPERTY_TYPES
                ],
                leader=None,
                leader_premium_pct=None,
            ),
            by_size_band=_by_size_band(pd.DataFrame(), min_county_n, None),
            by_distance_band=_by_distance_band(pd.DataFrame(), np.array([]), min_county_n),
            trend=TrendBlock(slope=None, intercept=None, r2=None, n=0),
            scatter_sample=ScatterSampleBlock(
                points=[], n_total=0, n_returned=0, sample_limit=filters.scatter_limit
            ),
            counties=CountiesBlock(
                top=[],
                others=OthersBlock(counties=[], n=0, median_price_per_acre_ksh=None),
                top_n=filters.top_n_counties,
            ),
            generated_from=_data_date(app_exports),
        )

    # ---- County-filtered frame (used by by_property_type and size_band comparison) ----
    county_filtered = _filter_frame(df, filters.county, None)
    # ---- Fully-filtered frame (county + prop_type) ----
    full_filtered = _filter_frame(county_filtered, None, filters.prop_type)

    # ---- Unmapped prop_type rows: rows in the county_filtered frame whose
    # prop_type is not in PROPERTY_TYPES.  Counted, not dropped.
    unmapped_mask = ~county_filtered["prop_type"].fillna("").str.lower().isin(
        [p.lower() for p in PROPERTY_TYPES]
    )
    unmapped_count = int(unmapped_mask.sum())
    if unmapped_count > 0:
        logger.warning(
            "overview_unmapped_prop_type_rows",
            n=unmapped_count,
            county=filters.county,
            distinct_values=sorted(
                str(v)
                for v in county_filtered.loc[unmapped_mask, "prop_type"].dropna().unique().tolist()
            ),
        )

    # ---- Per-type counts for the filters block ----
    property_type_counts = [
        PropertyTypeCount(
            name=name,
            n=int((county_filtered["prop_type"].fillna("").str.lower() == name.lower()).sum()),
        )
        for name in PROPERTY_TYPES
    ]

    # ---- Distance to Nairobi (shared helper) ----
    lats = (
        full_filtered["latitude"].to_numpy(dtype=float)
        if len(full_filtered)
        else np.array([], dtype=float)
    )
    lons = (
        full_filtered["longitude"].to_numpy(dtype=float)
        if len(full_filtered)
        else np.array([], dtype=float)
    )
    distances = compute_distances_to_nairobi(lats, lons, artifacts_dir)

    # ---- Trend over the FULLY FILTERED rows (not the scatter sample) ----
    prices = (
        full_filtered["listed_price_per_acre_ksh"].to_numpy(dtype=float)
        if len(full_filtered)
        else np.array([], dtype=float)
    )
    trend = _trend_block(prices, distances)

    # ---- Comparison series for size bands: only when a county filter is applied ----
    size_comparison_df: pd.DataFrame | None = None
    if filters.county is not None:
        size_comparison_df = df  # the national frame, no filters

    # ---- Build the response ----
    # Convert +inf band edges to None — JSON can't serialise inf, and the
    # labels already communicate the open-ended tail ("20+ ac", "400+ km").
    size_edges_for_json = [None if e == float("inf") else e for e in SIZE_BAND_EDGES_ACRES]
    distance_edges_for_json = [None if e == float("inf") else e for e in DISTANCE_BAND_EDGES_KM]
    return OverviewSummaryResponse(
        filters=FiltersBlock(
            county=filters.county,
            prop_type=filters.prop_type,
            property_types=property_type_counts,
        ),
        property_types_canonical=list(PROPERTY_TYPES),
        size_band_edges_acres=size_edges_for_json,
        size_band_labels=list(SIZE_BAND_LABELS),
        distance_band_edges_km=distance_edges_for_json,
        distance_band_labels=list(DISTANCE_BAND_LABELS),
        unmapped_prop_type_rows=unmapped_count,
        totals=_totals_block(full_filtered, min_county_n),
        national=_totals_block(df, min_county_n),
        n_counties_total=_counties_total(app_exports, app_state),
        verdicts=_verdicts_block(full_filtered),
        by_property_type=_by_property_type(county_filtered, min_county_n),
        by_size_band=_by_size_band(full_filtered, min_county_n, size_comparison_df),
        by_distance_band=_by_distance_band(full_filtered, distances, min_county_n),
        trend=trend,
        scatter_sample=_scatter_sample(full_filtered, distances, filters.scatter_limit),
        counties=_counties_block(full_filtered, filters.top_n_counties, min_county_n),
        generated_from=_data_date(app_exports),
    )


def _data_date(app_exports: Any) -> str | None:
    """The data date — same source /meta uses (manifest.json's ``created``
    field).  Null when the manifest is not loaded."""
    manifest = getattr(app_exports, "manifest", None)
    if not manifest:
        return None
    created = manifest.get("created")
    return str(created) if created is not None else None
