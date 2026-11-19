"""Dump the API response for a suspect row (Part B report artefact)."""
from __future__ import annotations

import csv as csvlib
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, "backend")
sys.path.insert(0, "src")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from tests.fixtures.listings_scored_fixture import build_fixture_df  # noqa: E402
from tests.test_app_exports import _write_app_exports  # noqa: E402
import tempfile  # noqa: E402

csv_path = "property24_kenya_finals.csv"
tmp = Path(tempfile.mkdtemp())
_write_app_exports(tmp, {"listings_scored.parquet": build_fixture_df(csv_path)})

import os  # noqa: E402

os.environ["APP_ENV"] = "test"
os.environ["ARTIFACTS_DIR"] = str(tmp)
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000"
os.environ["ALLOWED_ORIGINS_REGEX"] = ""

from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()
app = create_app()
app.state.app_exports = __import__("app.services.app_exports", fromlist=["AppExportsRegistry"]).AppExportsRegistry(
    artifacts_dir=str(tmp)
).load()

with TestClient(app) as client:
    # Lowest-ratio suspect row (real) — first row of asc sort, is_suspect=true.
    r = client.get(
        "/api/v1/listings/scored?is_suspect=true&sort=listed_over_predicted&order=asc&page_size=1"
    )
    row = r.json()["listings"][0]
    print("LOWEST-RATIO SUSPECT ROW (ListingsScoredRow JSON):")
    print(json.dumps(row, indent=2))

    # 110468626 specifically — pull from the suspect CSV export.
    resp = client.get("/api/v1/listings/scored/export.csv?is_suspect=true")
    reader = csvlib.reader(io.StringIO(resp.content.decode("utf-8-sig")))
    header = next(reader)
    idx = {h: i for i, h in enumerate(header)}
    target = None
    for rec in reader:
        if rec[idx["listing_no"]] == "110468626":
            target = {h: rec[i] for h, i in idx.items()}
            break
    print("\n110468626 (from /listings/scored/export.csv?is_suspect=true):")
    print(json.dumps(target, indent=2))

    # Overview verdicts block (n_suspect + excluded counts).
    ov = client.get("/api/v1/overview/summary").json()
    print("\nOVERVIEW verdicts block:")
    print(json.dumps(ov["verdicts"], indent=2))
