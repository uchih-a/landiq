"""Haversine great-circle distance — identical to Notebook 1 Cell 4.2.

The earth radius is 6371.0 km, matching both the Cell 4.2 haversine function
and the EARTH_RADIUS_KM constant used by the BallTree in Cells 5.4 and 6.3.

Vectorised version accepts numpy arrays so it can be used in batch parity
checks; the scalar version is byte-for-byte the notebook's formula.
"""

from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt

import numpy as np

# Cell 4.2 and Cell 5.0 / 6.1 — the single earth radius used everywhere.
EARTH_RADIUS_KM = 6371.0

# Cell 3.3 — Kenya bounding box (used for point validation)
KE_BOUNDS = {"lat": (-4.72, 4.62), "lon": (33.91, 41.91)}

# Nairobi CBD reference point — the canonical default every endpoint uses
# when scoring_params.json is absent or doesn't override it.  Matches
# Notebook 3's ``nairobi_reference_point`` fallback.  The backend's
# ``app.services.geo_reference.load_nairobi_reference`` reads
# ``scoring_params.json`` and returns this default when the file is missing.
NAIROBI_REFERENCE_LAT = -1.2921
NAIROBI_REFERENCE_LON = 36.8219


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in km between two points.

    Identical to Notebook 1 Cell 4.2 ``haversine_km``.
    """
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def haversine_km_vectorised(
    lat1: np.ndarray,
    lon1: np.ndarray,
    lat2: np.ndarray | float,
    lon2: np.ndarray | float,
) -> np.ndarray:
    """Vectorised haversine using numpy — same formula, same R.

    Scalars for lat2/lon2 are broadcast so a single reference point can be
    compared against an array of coordinates.
    """
    R = EARTH_RADIUS_KM
    lat1_r = np.radians(lat1)
    lon1_r = np.radians(lon1)
    lat2_r = np.radians(lat2)
    lon2_r = np.radians(lon2)
    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2) ** 2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
