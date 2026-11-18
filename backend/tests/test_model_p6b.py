"""Tests for the P6b Explainability backend additions:

  - /model/explainability serves a ``models`` list ordered by ensemble
    weight (from the loaded registry when present) + ``default_model``.
  - The ``ensemble_shap_coverage`` block is recomputed from the loaded
    ensemble's weights (source="recomputed") with member lists that match
    the ensemble; falls back to the normalised manifest values
    (source="manifest") with null member lists.
  - Shares are fractions in [0, 1] and sum within tolerance on both paths.
  - 503 DATA_UNAVAILABLE still returned when files are missing.
  - No NaN / inf anywhere in the JSON.
  - The load-time typical price is null unless the explanation service
    provides base values.

Reuses the tiny fixtures from tests/test_app_exports.
"""

from __future__ import annotations

import json
import math

import pytest

from tests.test_app_exports import (
    _all_tiny_exports,
    _tiny_manifest,
    _write_app_exports,
)

# Shares are renormalised weights, so tree + tabnet must sum to 1 within
# rounding of 6 decimal places.
SUM_TOLERANCE = 1e-5


def _exports_with_manifest(overrides: dict) -> dict:
    """The full tiny export set with the manifest patched by ``overrides``."""
    exports = _all_tiny_exports()
    manifest = dict(_tiny_manifest())
    manifest.update(overrides)
    exports["manifest.json"] = manifest
    return exports


class _FakeRegistry:
    """A minimal registry stand-in: only the attributes the P6b service
    reads (kept_members / kept_weights / loaded)."""

    def __init__(self, members: list[str], weights: dict[str, float]):
        self.kept_members = members
        self.kept_weights = weights
        self.loaded = True


class _FakeExplanationService:
    """Stand-in for LiveExplanationService: member_base_value only."""

    def __init__(self, base_values: dict[str, float]):
        self._base_values = base_values

    def member_base_value(self, member: str) -> float:
        return self._base_values[member]


def _reload_exports(app, tmp_path, exports):
    from app.services.app_exports import AppExportsRegistry

    _write_app_exports(tmp_path, exports)
    app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
    return app


def _get(client):
    resp = client.get("/api/v1/model/explainability")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _assert_no_nan(body_text: str) -> None:
    assert "NaN" not in body_text
    assert "Infinity" not in body_text


def _assert_valid_shares(cov: dict) -> None:
    tree = cov["tree_share_explained_by_shap"]
    tab = cov["tabnet_share_not_covered"]
    assert tree is not None and 0.0 <= tree <= 1.0
    assert tab is not None and 0.0 <= tab <= 1.0
    assert math.isclose(tree + tab, 1.0, abs_tol=SUM_TOLERANCE)


# ----------------------------------------------------------------------
# Manifest path (registry not loaded) — the pre-P6b default
# ----------------------------------------------------------------------


class TestManifestPath:
    def test_source_flag_and_normalised_shares(self, app, tmp_path, client):
        _reload_exports(app, tmp_path, _all_tiny_exports())
        body = _get(client)
        cov = body["ensemble_shap_coverage"]
        assert cov["source"] == "manifest"
        assert cov["tree_share_explained_by_shap"] == pytest.approx(0.85)
        assert cov["tabnet_share_not_covered"] == pytest.approx(0.15)
        _assert_valid_shares(cov)
        # The manifest does not record member lists — null, never invented.
        assert cov["explained_members"] is None
        assert cov["unexplained_members"] is None
        _assert_no_nan(json.dumps(body))

    def test_manifest_percent_values_are_normalised(self, app, tmp_path, client):
        """A manifest that writes 85 / 15 (percentages) normalises to 0.85/0.15."""
        exports = _exports_with_manifest(
            {
                "ensemble_shap_coverage": {
                    "tree_share_explained_by_shap": 85.0,
                    "tabnet_share_not_covered": 15.0,
                }
            }
        )
        _reload_exports(app, tmp_path, exports)
        cov = _get(client)["ensemble_shap_coverage"]
        assert cov["tree_share_explained_by_shap"] == pytest.approx(0.85)
        assert cov["tabnet_share_not_covered"] == pytest.approx(0.15)

    def test_manifest_invalid_share_is_null_not_clamped(self, app, tmp_path, client):
        """A share that cannot be a fraction (e.g. 1.2 after /100 attempts)
        reports null — never clamped into a plausible number."""
        exports = _exports_with_manifest(
            {
                "ensemble_shap_coverage": {
                    "tree_share_explained_by_shap": 0.85,
                    "tabnet_share_not_covered": 140.0,
                }
            }
        )
        _reload_exports(app, tmp_path, exports)
        cov = _get(client)["ensemble_shap_coverage"]
        assert cov["tabnet_share_not_covered"] is None
        assert cov["source"] == "manifest"

    def test_manifest_note_passed_through(self, app, tmp_path, client):
        _reload_exports(app, tmp_path, _all_tiny_exports())
        cov = _get(client)["ensemble_shap_coverage"]
        assert cov["note"] == "weighted sum of member SHAP explains the tree share exactly"

    def test_models_from_shap_csv_when_registry_absent(self, app, tmp_path, client):
        """Without a registry the member list is the distinct models in
        shap_global.csv (xgb then catboost in file order), weights null."""
        _reload_exports(app, tmp_path, _all_tiny_exports())
        body = _get(client)
        models = body["models"]
        assert [m["key"] for m in models] == ["xgb", "catboost"]
        assert all(m["ensemble_weight"] is None for m in models)
        assert all(m["has_shap"] is True for m in models)
        assert models[0]["display_name"] == "XGBoost"
        assert models[0]["family"] == "tree"
        # No weights: default = first SHAP-covered member in file order.
        assert body["default_model"] == "xgb"
        _assert_no_nan(json.dumps(body))

    def test_typical_price_null_without_explanation_service(self, app, tmp_path, client):
        _reload_exports(app, tmp_path, _all_tiny_exports())
        body = _get(client)
        assert body["typical_price_per_acre_ksh"] is None
        assert body["combined_base_value"] is None


# ----------------------------------------------------------------------
# Recomputed path (registry loaded)
# ----------------------------------------------------------------------


class TestRecomputedPath:
    def test_source_recomputed_and_members_match_ensemble(self, app, tmp_path, client):
        _reload_exports(app, tmp_path, _all_tiny_exports())
        app.state.model_registry = _FakeRegistry(
            ["xgb", "catboost", "tabnet"], {"xgb": 0.3, "catboost": 0.4, "tabnet": 0.3}
        )
        body = _get(client)
        cov = body["ensemble_shap_coverage"]
        assert cov["source"] == "recomputed"
        assert cov["tree_share_explained_by_shap"] == pytest.approx(0.7)
        assert cov["tabnet_share_not_covered"] == pytest.approx(0.3)
        assert cov["explained_members"] == ["xgb", "catboost"]
        assert cov["unexplained_members"] == ["tabnet"]
        _assert_valid_shares(cov)
        _assert_no_nan(json.dumps(body))

    def test_models_ordered_by_weight_and_default_model(self, app, tmp_path, client):
        _reload_exports(app, tmp_path, _all_tiny_exports())
        app.state.model_registry = _FakeRegistry(
            ["xgb", "catboost", "tabnet"], {"xgb": 0.3, "catboost": 0.4, "tabnet": 0.3}
        )
        body = _get(client)
        models = body["models"]
        # Ordered by ensemble weight descending: catboost, xgb, tabnet.
        assert [m["key"] for m in models] == ["catboost", "xgb", "tabnet"]
        assert models[0]["ensemble_weight"] == pytest.approx(0.4)
        assert [m["display_name"] for m in models] == ["CatBoost", "XGBoost", "TabNet"]
        assert [m["family"] for m in models] == ["tree", "tree", "neural"]
        # tabnet is in the list but has no SHAP rows.
        assert [m["has_shap"] for m in models] == [True, True, False]
        # default = highest-weight SHAP-covered member.
        assert body["default_model"] == "catboost"

    def test_pruned_tabnet_case(self, app, tmp_path, client):
        """TabNet pruned (the typical production case): tree share = 1.0."""
        _reload_exports(app, tmp_path, _all_tiny_exports())
        app.state.model_registry = _FakeRegistry(
            ["xgb", "catboost"], {"xgb": 0.45, "catboost": 0.55}
        )
        body = _get(client)
        cov = body["ensemble_shap_coverage"]
        assert cov["tree_share_explained_by_shap"] == pytest.approx(1.0)
        assert cov["tabnet_share_not_covered"] == pytest.approx(0.0)
        assert cov["unexplained_members"] == []
        assert body["default_model"] == "catboost"

    def test_registry_without_tree_members(self, app, tmp_path, client):
        """A degenerate registry with only tabnet: no SHAP-covered member,
        so default_model is null (honest) and the coverage explains 0."""
        _reload_exports(app, tmp_path, _all_tiny_exports())
        app.state.model_registry = _FakeRegistry(["tabnet"], {"tabnet": 1.0})
        body = _get(client)
        assert body["default_model"] is None
        models = body["models"]
        assert [m["key"] for m in models] == ["tabnet"]
        assert models[0]["has_shap"] is False
        cov = body["ensemble_shap_coverage"]
        assert cov["tree_share_explained_by_shap"] == pytest.approx(0.0)
        assert cov["tabnet_share_not_covered"] == pytest.approx(1.0)

    def test_typical_price_from_explanation_service(self, app, tmp_path, client):
        """With the explanation service present, the baseline is
        exp(sum w_m * base_m) over the kept tree members."""
        _reload_exports(app, tmp_path, _all_tiny_exports())
        app.state.model_registry = _FakeRegistry(["xgb", "catboost"], {"xgb": 0.5, "catboost": 0.5})
        app.state.explanation_service = _FakeExplanationService(
            {"xgb": math.log(2_000_000.0), "catboost": math.log(6_000_000.0)}
        )
        body = _get(client)
        expected_base = 0.5 * math.log(2_000_000.0) + 0.5 * math.log(6_000_000.0)
        assert body["combined_base_value"] == pytest.approx(expected_base, rel=1e-6)
        assert body["typical_price_per_acre_ksh"] == pytest.approx(
            math.exp(expected_base), rel=1e-6
        )
        _assert_no_nan(json.dumps(body))

    def test_typical_price_null_when_service_raises(self, app, tmp_path, client):
        """A failing explanation service degrades to null — never a 500."""

        class _Broken:
            def member_base_value(self, member: str) -> float:
                raise RuntimeError("shap not installed")

        _reload_exports(app, tmp_path, _all_tiny_exports())
        app.state.model_registry = _FakeRegistry(["xgb"], {"xgb": 1.0})
        app.state.explanation_service = _Broken()
        body = _get(client)
        assert body["typical_price_per_acre_ksh"] is None
        assert body["combined_base_value"] is None


# ----------------------------------------------------------------------
# 503 still raised when files are missing
# ----------------------------------------------------------------------


class TestDegraded:
    def test_503_when_shap_global_missing(self, app, tmp_path, client):
        _write_app_exports(
            tmp_path,
            {
                "feature_importance.csv": _all_tiny_exports()["feature_importance.csv"],
                "feature_labels.json": _all_tiny_exports()["feature_labels.json"],
                "manifest.json": _tiny_manifest(),
            },
        )
        from app.services.app_exports import AppExportsRegistry

        app.state.app_exports = AppExportsRegistry(artifacts_dir=str(tmp_path)).load()
        app.state.model_registry = _FakeRegistry(["xgb"], {"xgb": 1.0})
        resp = client.get("/api/v1/model/explainability")
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "DATA_UNAVAILABLE"
        assert "shap_global.csv" in resp.json()["error"]["details"]["file"]
