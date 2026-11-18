"""Tests for GET /api/v1/predict/options + POST /api/v1/predict prop_type
validation (P2b no-hardcoded-values sweep).

Covers:
  - options shape + values from a synthetic frame
  - per-type row counts
  - unmapped prop_type rows counted + warning logged
  - size bounds (1st/99th percentile + median)
  - canonical lists returned verbatim
  - degraded mode 503 when listings_scored is missing
  - empty frame returns zeros (not 500)
  - no NaN in JSON output

Plus POST /predict prop_type validation:
  - unknown prop_type -> 422
  - case-insensitive match (land / LAND / Land all accepted, normalised)
  - the three canonical types succeed validation (the existing
    test_200_with_injected_stub_service covers the full path; here we
    assert only the validation layer accepts the three).
"""

from __future__ import annotations

import math

import pandas as pd
import pytest

from tests.test_app_exports import _tiny_manifest, _write_app_exports

# ----------------------------------------------------------------------
# Fixture: a richer frame than _tiny_listings_scored so the percentile
# computation has enough rows to be meaningful.
# ----------------------------------------------------------------------


def _predict_options_frame() -> pd.DataFrame:
    """Hand-built frame with known answers.

    12 rows: 5 Land, 4 Farm, 2 Commercial, 1 Residential (unmapped).
    Sizes span 0.25-50 acres so the 1st/99th percentiles are non-trivial.
    """
    rows = []
    # 5 Land rows
    for i, size in enumerate([0.5, 1.0, 2.0, 5.0, 10.0], start=1):
        rows.append(
            {
                "listing_no": f"L{i:03d}",
                "prop_type": "Land",
                "size_acres": float(size),
                "county": "Nairobi",
            }
        )
    # 4 Farm rows
    for i, size in enumerate([1.0, 5.0, 20.0, 50.0], start=6):
        rows.append(
            {
                "listing_no": f"L{i:03d}",
                "prop_type": "Farm",
                "size_acres": float(size),
                "county": "Kiambu",
            }
        )
    # 2 Commercial rows
    for i, size in enumerate([0.25, 1.0], start=10):
        rows.append(
            {
                "listing_no": f"L{i:03d}",
                "prop_type": "Commercial",
                "size_acres": float(size),
                "county": "Nairobi",
            }
        )
    # 1 unmapped Residential row
    rows.append(
        {
            "listing_no": "L012",
            "prop_type": "Residential",
            "size_acres": 0.5,
            "county": "Nairobi",
        }
    )
    return pd.DataFrame(rows)


def _predict_options_exports() -> dict:
    return {
        "manifest.json": _tiny_manifest(),
        "listings_scored.parquet": _predict_options_frame(),
    }


@pytest.fixture
def app_with_options(app, tmp_path):
    _write_app_exports(tmp_path, _predict_options_exports())
    from app.services.app_exports import AppExportsRegistry

    new_reg = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    app.state.app_exports = new_reg
    yield app


# ----------------------------------------------------------------------
# Options endpoint
# ----------------------------------------------------------------------


class TestPredictOptions:
    def test_status_and_shape(self, app_with_options, client):
        resp = client.get("/api/v1/predict/options")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        for key in (
            "property_types",
            "unmapped_prop_type_rows",
            "size_acres",
            "default_confidence_level",
            "allowed_confidence_levels",
            "parcel_features",
            "property_types_canonical",
        ):
            assert key in body, f"missing key: {key}"

    def test_canonical_property_types_returned(self, app_with_options, client):
        body = client.get("/api/v1/predict/options").json()
        # The canonical list is exactly the three.
        assert body["property_types_canonical"] == ["Land", "Farm", "Commercial"]
        # Each entry has a name + a count.
        names = [pt["name"] for pt in body["property_types"]]
        assert names == ["Land", "Farm", "Commercial"]
        # Per-type counts from the fixture: 5 Land, 4 Farm, 2 Commercial.
        counts = {pt["name"]: pt["n"] for pt in body["property_types"]}
        assert counts == {"Land": 5, "Farm": 4, "Commercial": 2}

    def test_unmapped_prop_type_rows_counted(self, app_with_options, client):
        """The 1 Residential row in the fixture is counted under
        unmapped_prop_type_rows — never silently dropped."""
        body = client.get("/api/v1/predict/options").json()
        assert body["unmapped_prop_type_rows"] == 1

    def test_size_acres_bounds(self, app_with_options, client):
        """Size bounds from the fixture's 12 size_acres values.

        The 1 Residential row's size (0.5) is INCLUDED in the size
        computation — unmapped prop_type only excludes rows from the
        per-type counts, not from the size bounds (the size input
        validates against the WHOLE corpus's range, not per-type).
        So we have 12 sizes: [0.5, 1, 2, 5, 10, 1, 5, 20, 50, 0.25, 1, 0.5].
        Sorted: [0.25, 0.5, 0.5, 1, 1, 1, 2, 5, 5, 10, 20, 50].

        numpy.percentile default method='linear' interpolates:
          p1  ≈ 0.25 + 0.01*(0.5-0.25)/1 ≈ 0.2525  (between index 0 and 1)
          p50 = (1 + 2) / 2 = 1.5  (median of 12 values, between index 5 and 6)
          p99 ≈ 50 - 0.01*(50-20) = 49.7  → numpy gives 46.7 with its
                actual interpolation (verified empirically).  Assert a
                loose range that's correct for either method.
        """
        body = client.get("/api/v1/predict/options").json()
        sa = body["size_acres"]
        # Loose bounds — the exact percentile interpolation method
        # (numpy default 'linear') may give slightly different values
        # than the hand calc; assert the shape + rough magnitude.
        assert 0.2 < sa["min"] < 0.4, f"min: {sa['min']}"
        assert 45.0 < sa["max"] < 50.1, f"max: {sa['max']}"
        assert 1.0 < sa["median"] < 2.0, f"median: {sa['median']}"

    def test_default_confidence_level_from_canonical(self, app_with_options, client):
        body = client.get("/api/v1/predict/options").json()
        assert body["default_confidence_level"] == 0.8
        assert body["allowed_confidence_levels"] == [0.5, 0.8, 0.9]

    def test_parcel_features_keys_returned(self, app_with_options, client):
        """The ten infrastructure checklist keys are returned in order."""
        body = client.get("/api/v1/predict/options").json()
        assert body["parcel_features"] == [
            "borehole",
            "piped_water",
            "river_water",
            "water_tank",
            "grid_electric",
            "solar_electric",
            "full_fence",
            "partial_fence",
            "structures",
            "internal_road",
        ]

    def test_degraded_mode_503(self, app, client):
        """When listings_scored.parquet is missing, returns 503 DATA_UNAVAILABLE."""
        resp = client.get("/api/v1/predict/options")
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "DATA_UNAVAILABLE"

    def test_empty_frame_returns_zeros(self, app, tmp_path):
        """An empty frame (0 rows) returns zeros + canonical defaults, not 500."""
        df = _predict_options_frame().iloc[0:0].copy()
        _write_app_exports(
            tmp_path, {"manifest.json": _tiny_manifest(), "listings_scored.parquet": df}
        )
        from fastapi.testclient import TestClient

        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        with TestClient(app) as client:
            body = client.get("/api/v1/predict/options").json()
            assert body["unmapped_prop_type_rows"] == 0
            assert body["size_acres"] == {"min": 0.0, "max": 0.0, "median": 0.0}
            assert [pt["n"] for pt in body["property_types"]] == [0, 0, 0]
            # Canonical lists still returned even when the frame is empty.
            assert body["property_types_canonical"] == ["Land", "Farm", "Commercial"]
            assert body["default_confidence_level"] == 0.8

    def test_no_nan_in_json(self, app_with_options, client):
        """The JSON body must never contain NaN / Infinity."""
        import json

        body_text = client.get("/api/v1/predict/options").text
        body = json.loads(body_text)
        assert body is not None

        def _walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    _walk(v)
            elif isinstance(o, list):
                for v in o:
                    _walk(v)
            elif isinstance(o, float):
                assert math.isfinite(o), f"non-finite float: {o}"

        _walk(body)


# ----------------------------------------------------------------------
# POST /predict prop_type validation
# ----------------------------------------------------------------------


class TestPredictPropTypeValidation:
    """The validation is a 422 at the schema layer; the existing
    test_200_with_injected_stub_service covers the full path.  Here we
    assert only the validation behaviour — the model doesn't need to be
    loaded for these to 422 (validation runs before the model-not-loaded
    check)."""

    def _body(self, prop_type: str) -> dict:
        return {
            "lat": -1.29,
            "lon": 36.82,
            "size_acres": 1.0,
            "prop_type": prop_type,
            "parcel_features": {"borehole": True},
            "confidence_level": 0.8,
        }

    def test_unknown_prop_type_returns_422(self, client):
        resp = client.post("/api/v1/predict", json=self._body("Residential"))
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"
        # The error message mentions the allowed list.
        assert "Land" in str(body["error"]["details"])

    def test_industrial_returns_422(self, client):
        resp = client.post("/api/v1/predict", json=self._body("Industrial"))
        assert resp.status_code == 422

    def test_plot_returns_422(self, client):
        resp = client.post("/api/v1/predict", json=self._body("Plot"))
        assert resp.status_code == 422

    def test_land_succeeds_validation(self, client):
        """Land is canonical — validation passes (then 503 MODEL_NOT_LOADED
        because the test client has no model loaded, but that proves the
        validation layer accepted it)."""
        resp = client.post("/api/v1/predict", json=self._body("Land"))
        assert resp.status_code != 422, "Land should pass validation"

    def test_farm_succeeds_validation(self, client):
        resp = client.post("/api/v1/predict", json=self._body("Farm"))
        assert resp.status_code != 422

    def test_commercial_succeeds_validation(self, client):
        resp = client.post("/api/v1/predict", json=self._body("Commercial"))
        assert resp.status_code != 422

    def test_case_insensitive_land(self, client):
        resp = client.post("/api/v1/predict", json=self._body("land"))
        assert resp.status_code != 422

    def test_case_insensitive_farm_uppercase(self, client):
        resp = client.post("/api/v1/predict", json=self._body("FARM"))
        assert resp.status_code != 422

    def test_case_insensitive_commercial_mixed(self, client):
        resp = client.post("/api/v1/predict", json=self._body("CoMmErCiAl"))
        assert resp.status_code != 422
