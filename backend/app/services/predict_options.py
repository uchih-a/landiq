"""Pure computation for GET /api/v1/predict/options (P2b).

Lives in a service module (not the router) so the computation is
unit-testable without HTTP.  The router is a thin wrapper that loads
the DataFrame via ``AppExportsRegistry.require`` and calls
``compute_predict_options``.

Performance: vectorised pandas.  On the production frame (~1k rows)
this is sub-millisecond; no caching warranted.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.schemas.canonical import (
    ALLOWED_CONFIDENCE_LEVELS,
    DEFAULT_CONFIDENCE_LEVEL,
    PARCEL_CHECKLIST_FIELDS,
    PROPERTY_TYPES,
)
from app.schemas.predict_options import (
    PredictOptionsResponse,
    PropertyTypeOption,
    SizeAcresBounds,
)

logger = get_logger("app.predict_options")


def _safe_float(v: Any) -> float:
    """Coerce to float; raises TypeError/ValueError on bad input (caller catches)."""
    return float(v)


def compute_predict_options(df: pd.DataFrame) -> PredictOptionsResponse:
    """Build the options response from the loaded listings_scored frame.

    Assumes the frame is non-empty and has the ``prop_type`` + ``size_acres``
    columns (the router's ``require`` call guards the frame; the column
    presence is asserted here so a malformed frame surfaces clearly).
    """
    if len(df) == 0:
        # Degenerate but honest: the frame loaded with 0 rows.  Return
        # zeros / canonical defaults rather than 500-ing — the frontend
        # can still render the (empty) pills + the canonical defaults.
        return PredictOptionsResponse(
            property_types=[PropertyTypeOption(name=n, n=0) for n in PROPERTY_TYPES],
            unmapped_prop_type_rows=0,
            size_acres=SizeAcresBounds(min=0.0, max=0.0, median=0.0),
            default_confidence_level=DEFAULT_CONFIDENCE_LEVEL,
            allowed_confidence_levels=list(ALLOWED_CONFIDENCE_LEVELS),
            parcel_features=list(PARCEL_CHECKLIST_FIELDS),
            property_types_canonical=list(PROPERTY_TYPES),
        )

    # ---- Per-type row counts ----
    lower_types = df["prop_type"].fillna("").str.lower()
    type_counts: list[PropertyTypeOption] = []
    for name in PROPERTY_TYPES:
        n = int((lower_types == name.lower()).sum())
        type_counts.append(PropertyTypeOption(name=name, n=n))

    # ---- Unmapped rows: prop_type not in the canonical list ----
    canonical_lower = {n.lower() for n in PROPERTY_TYPES}
    unmapped_mask = ~lower_types.isin(canonical_lower)
    unmapped_count = int(unmapped_mask.sum())
    if unmapped_count > 0:
        logger.warning(
            "predict_options_unmapped_prop_type_rows",
            n=unmapped_count,
            distinct_values=sorted(
                str(v) for v in df.loc[unmapped_mask, "prop_type"].dropna().unique().tolist()
            ),
        )

    # ---- Size bounds (1st/99th percentile; median) ----
    sizes = df["size_acres"].to_numpy(dtype=float)
    finite = sizes[np.isfinite(sizes) & (sizes > 0)]
    if finite.size == 0:
        # No usable sizes — return zeros so the frontend disables submit
        # with an "options unavailable" message rather than crashing.
        size_bounds = SizeAcresBounds(min=0.0, max=0.0, median=0.0)
    else:
        p1, p50, p99 = np.percentile(finite, [1, 50, 99])
        size_bounds = SizeAcresBounds(
            min=_safe_float(p1),
            max=_safe_float(p99),
            median=_safe_float(p50),
        )

    return PredictOptionsResponse(
        property_types=type_counts,
        unmapped_prop_type_rows=unmapped_count,
        size_acres=size_bounds,
        default_confidence_level=DEFAULT_CONFIDENCE_LEVEL,
        allowed_confidence_levels=list(ALLOWED_CONFIDENCE_LEVELS),
        parcel_features=list(PARCEL_CHECKLIST_FIELDS),
        property_types_canonical=list(PROPERTY_TYPES),
    )
