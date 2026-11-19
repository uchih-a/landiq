"""Tests for /meta's flag_definition + methodology blocks (P7b/P8b).

- ``flag_definition`` — the data-quality-flag percentile window, served
  from the canonical constants so the UI never re-types "1st–99th".
  Assert the served values equal ``app.schemas.canonical.FLAG_*`` (the
  one definition the whole stack reads).
- ``methodology`` — the plain-language pipeline copy (sources note,
  verifiable cleaning steps, feature groups) from the canonical module.
- Both are code constants (not artifact-derived), so they are served
  even in degraded mode.
- No NaN/inf anywhere in the JSON.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.schemas.canonical import (
    FLAG_LOWER_PCT,
    FLAG_UPPER_PCT,
    METHODOLOGY,
)


def test_flag_definition_served_from_canonical_constants(client: TestClient):
    body = client.get("/api/v1/meta").json()
    fd = body["flag_definition"]
    assert fd is not None
    assert fd["lower_pct"] == FLAG_LOWER_PCT
    assert fd["upper_pct"] == FLAG_UPPER_PCT
    # The canonical window mirrors the notebook's Cell 9.6 rule (also
    # documented in the /listings/scored filter docs): 1st–99th.
    assert (fd["lower_pct"], fd["upper_pct"]) == (1, 99)


def test_methodology_served_from_canonical_module(client: TestClient):
    body = client.get("/api/v1/meta").json()
    m = body["methodology"]
    assert m is not None
    assert m["sources_note"] == METHODOLOGY["sources_note"]
    assert m["cleaning_steps"] == METHODOLOGY["cleaning_steps"]
    assert m["feature_groups"] == METHODOLOGY["feature_groups"]
    # Non-empty, plain-language copy.
    assert isinstance(m["sources_note"], str) and m["sources_note"]
    assert len(m["cleaning_steps"]) >= 1
    assert len(m["feature_groups"]) >= 1


def test_methodology_has_no_unverifiable_claims():
    """Claims the repo cannot verify (duplicate removal, coordinate
    mismatch checks — notebook-only ETL steps) must NOT be in the served
    copy; the P8b brief removes unverifiable statements."""
    joined = " ".join(METHODOLOGY["cleaning_steps"]).lower()
    assert "duplicate" not in joined
    assert "mismatched coordinate" not in joined


def test_meta_json_has_no_nan_or_inf(client: TestClient):
    """Deep-scan the /meta JSON for NaN/inf leaks (invalid JSON)."""
    raw = client.get("/api/v1/meta").text
    for bad in ("NaN", "Infinity", "-Infinity"):
        assert bad not in raw
