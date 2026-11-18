"""Pure computation for GET /api/v1/listings/options (P4b).

The verdict ``rule`` is derived EMPIRICALLY from the loaded frame: the
notebook computed each row's verdict from its conformal interval
(``low_price_per_acre_ksh`` / ``high_price_per_acre_ksh`` columns), so
the honest definition is the comparison that reproduces the stored
verdict on the data itself:

    listed < low   -> underpriced
    listed > high  -> overpriced
    otherwise      -> fair

We verify that comparison against every row with usable bounds and
report the ``match_rate``; when the interval columns are absent (or the
match rate is poor) we fall back to reporting the empirical ratio
cut-offs (max listed_over_predicted among underpriced rows / min among
overpriced rows) — still data-derived numbers, never typed.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.schemas.canonical import PROPERTY_TYPES
from app.schemas.listings_options import (
    AmenityOption,
    ListingsCountyOption,
    ListingsOptionsResponse,
    ListingsPropertyType,
    SortKeyOption,
    VerdictOption,
    VerdictRule,
)

logger = get_logger("app.listings_options")

# i18n label keys for the verdict chips + amenity pills (labels stay in
# the frontend's i18n files, keyed by these — the VALUES are the data).
_VERDICT_LABEL_KEYS = {
    "underpriced": "deals.verdict.underpriced",
    "fair": "deals.verdict.fair",
    "overpriced": "deals.verdict.overpriced",
}
_AMENITY_LABEL_KEYS = {
    "school": "deals.amenity.school",
    "hospital": "deals.amenity.hospital",
    "tarmac_road": "deals.amenity.tarmacRoad",
}


def _maybe(v: Any) -> Any:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


def _safe_float(v: Any) -> float | None:
    f = _maybe(v)
    if f is None:
        return None
    try:
        f = float(f)
    except (TypeError, ValueError):
        return None
    return f if np.isfinite(f) else None


def compute_verdict_rules(df: pd.DataFrame) -> list[VerdictOption]:
    """Build the verdict list with data-derived rules.

    Basis check: does ``listed < low -> underpriced; listed > high ->
    overpriced; else fair`` reproduce the stored verdict?  The match rate
    is reported so the UI (and the person) can see how exact the rule is.
    """
    verdicts: list[VerdictOption] = []
    stored = df["verdict"].fillna("(unknown)")
    present = set(stored.unique().tolist())

    # Interval comparison check (only over rows with usable bounds).
    listed = df["listed_price_per_acre_ksh"].to_numpy(dtype=float)
    low = df.get("low_price_per_acre_ksh")
    high = df.get("high_price_per_acre_ksh")
    match_rate: float | None = None
    if low is not None and high is not None:
        low_arr = pd.to_numeric(low, errors="coerce").to_numpy(dtype=float)
        high_arr = pd.to_numeric(high, errors="coerce").to_numpy(dtype=float)
        usable = (
            np.isfinite(listed)
            & np.isfinite(low_arr)
            & np.isfinite(high_arr)
            & (low_arr <= high_arr)
        )
        if usable.any():
            derived = np.where(
                listed[usable] < low_arr[usable],
                "underpriced",
                np.where(listed[usable] > high_arr[usable], "overpriced", "fair"),
            )
            match_rate = float(np.mean(derived == stored.to_numpy()[usable]))

    # Empirical ratio cut-offs (data-derived).
    ratio = pd.to_numeric(df.get("listed_over_predicted"), errors="coerce")
    under_ratio_max = (
        _safe_float(ratio[stored == "underpriced"].max()) if "underpriced" in present else None
    )
    over_ratio_min = (
        _safe_float(ratio[stored == "overpriced"].min()) if "overpriced" in present else None
    )

    for value in ("underpriced", "fair", "overpriced"):
        verdicts.append(
            VerdictOption(
                value=value,
                label_key=_VERDICT_LABEL_KEYS[value],
                rule=VerdictRule(
                    basis="conformal_interval" if match_rate is not None else None,
                    match_rate=match_rate,
                    under_ratio_max=under_ratio_max,
                    over_ratio_min=over_ratio_min,
                    interval_low_ref="low_price_per_acre_ksh" if match_rate is not None else None,
                    interval_high_ref="high_price_per_acre_ksh" if match_rate is not None else None,
                ),
            )
        )
    return verdicts


def compute_listings_options(
    df: pd.DataFrame,
    *,
    amenity_service: Any,
    allowed_radius_km: list[int],
    page_size_options: list[int],
    default_page_size: int,
    max_page_size: int,
    sort_keys: list[dict[str, Any]],
    export_max_rows: int | None,
) -> ListingsOptionsResponse:
    """Build the options response from the loaded frame + services."""
    lower_types = df["prop_type"].fillna("").str.lower()
    property_types = [
        ListingsPropertyType(name=name, n=int((lower_types == name.lower()).sum()))
        for name in PROPERTY_TYPES
    ]

    canonical_lower = {n.lower() for n in PROPERTY_TYPES}
    unmapped_mask = ~lower_types.isin(canonical_lower)
    unmapped = int(unmapped_mask.sum())
    if unmapped > 0:
        logger.warning(
            "listings_options_unmapped_prop_type_rows",
            n=unmapped,
            distinct_values=sorted(
                str(v) for v in df.loc[unmapped_mask, "prop_type"].dropna().unique().tolist()
            ),
        )

    county_counts = df["county"].fillna("(unknown)").value_counts()
    counties = [ListingsCountyOption(name=str(name), n=int(n)) for name, n in county_counts.items()]

    verdicts = compute_verdict_rules(df)

    # Amenity list from the service's SUPPORTED_AMENITIES (single source
    # of truth); availability false when the service is absent.
    if amenity_service is not None:
        supported = list(getattr(amenity_service, "SUPPORTED_AMENITIES", ()))
        available = True
    else:
        supported = []
        available = False
    amenities = [
        AmenityOption(value=a, label_key=_AMENITY_LABEL_KEYS[a])
        for a in supported
        if a in _AMENITY_LABEL_KEYS
    ]

    return ListingsOptionsResponse(
        property_types=property_types,
        unmapped_prop_type_rows=unmapped,
        counties=counties,
        verdicts=verdicts,
        amenities=amenities,
        radii_km=allowed_radius_km,
        amenity_filter_available=available,
        page_sizes=page_size_options,
        default_page_size=default_page_size,
        max_page_size=max_page_size,
        sort_keys=[SortKeyOption(**k) for k in sort_keys],
        export_max_rows=export_max_rows,
    )
