"""Backend-side geo reference helper — single source of truth for the
Nairobi reference point the Overview and Counties endpoints use to
recompute ``dist_to_nairobi_km`` from stored lat/lon.

The canonical default lives in ``landval.features.geo`` (no app
dependencies).  ``load_nairobi_reference`` reads ``scoring_params.json``
under the app's artifacts directory and returns the canonical default
when the file is missing or doesn't override the point — so the
Overview and Counties endpoints never disagree with the model's
training feature.
"""

from __future__ import annotations

import json
import os
from typing import Any

from app.core.logging import get_logger
from landval.features.geo import (
    NAIROBI_REFERENCE_LAT,
    NAIROBI_REFERENCE_LON,
    haversine_km_vectorised,
)

logger = get_logger("app.geo_reference")

__all__ = [
    "NAIROBI_REFERENCE_LAT",
    "NAIROBI_REFERENCE_LON",
    "load_nairobi_reference",
    "compute_distances_to_nairobi",
    "haversine_km_vectorised",
]


def load_nairobi_reference(artifacts_dir: str | None) -> tuple[float, float]:
    """Return (lat, lon) of the Nairobi reference point used by the model.

    Reads ``scoring_params.json`` under ``artifacts_dir`` if present
    (Cell 3.4's file — the feature pipeline reads the same file via
    ``FeaturePipeline``).  When the file is missing or the
    ``nairobi_reference_point`` block is absent, returns the canonical
    default so the Overview and Counties endpoints still produce a
    sensible distance.
    """
    if not artifacts_dir:
        return NAIROBI_REFERENCE_LAT, NAIROBI_REFERENCE_LON
    path = os.path.join(artifacts_dir, "scoring_params.json")
    if not os.path.exists(path):
        return NAIROBI_REFERENCE_LAT, NAIROBI_REFERENCE_LON
    try:
        with open(path) as f:
            params: dict[str, Any] = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("scoring_params_unreadable", path=path, error=str(exc))
        return NAIROBI_REFERENCE_LAT, NAIROBI_REFERENCE_LON
    ref = params.get("nairobi_reference_point") or params.get("ref") or {}
    lat = ref.get("latitude", NAIROBI_REFERENCE_LAT)
    lon = ref.get("longitude", NAIROBI_REFERENCE_LON)
    try:
        return float(lat), float(lon)
    except (TypeError, ValueError):
        logger.warning("scoring_params_bad_ref", path=path, ref=ref)
        return NAIROBI_REFERENCE_LAT, NAIROBI_REFERENCE_LON


def compute_distances_to_nairobi(
    lats,
    lons,
    artifacts_dir: str | None,
):
    """Vectorised haversine from each (lat, lon) to the Nairobi reference.

    Returns a float numpy array (same length as ``lats``) where rows whose
    lat/lon is NaN/inf are NaN — matching the Counties router's existing
    behaviour.  The Nairobi reference is read once via
    ``load_nairobi_reference`` so the result agrees with the model's
    ``dist_to_nairobi_km`` feature.
    """
    import numpy as np

    ref_lat, ref_lon = load_nairobi_reference(artifacts_dir)
    lats = np.asarray(lats, dtype=float)
    lons = np.asarray(lons, dtype=float)
    out = np.full(lats.shape, float("nan"), dtype=float)
    valid = np.isfinite(lats) & np.isfinite(lons)
    if valid.any():
        out[valid] = haversine_km_vectorised(lats[valid], lons[valid], ref_lat, ref_lon)
    return out
