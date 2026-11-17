"""CI check: regenerate the OpenAPI schema and diff against the committed snapshot.

A diff fails CI with a clear message — forcing a deliberate decision: update
the snapshot (if the change is intentional and the frontend will be told) or
fix the code (if it wasn't intentional).

**Breaking vs additive changes**: this check flags ALL changes equally —
including additive, backward-compatible ones (a new optional field).  The
point is visibility before merge, not auto-approval of "safe" changes.  A
new optional field IS flagged for review because the frontend team needs to
know about it even if it doesn't break existing code.  Breaking vs additive
distinction is NOT made in the failure message — the diff output itself
shows what changed, and the human decides which kind it is.

Usage (from CI or locally)::

    python scripts/check_openapi_snapshot.py
    # exit 0 = no diff; exit 1 = diff found (CI fails)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def main() -> int:
    # Ensure backend + src are importable
    repo_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(repo_root / "backend"))
    sys.path.insert(0, str(repo_root / "src"))
    os.environ.setdefault("APP_ENV", "test")
    os.environ.setdefault("ARTIFACTS_DIR", str(repo_root / "artifacts"))

    from app.main import create_app

    app = create_app()
    current_spec = app.openapi()

    snapshot_path = repo_root / "docs" / "openapi.snapshot.json"
    if not snapshot_path.exists():
        print("ERROR: docs/openapi.snapshot.json not found — run `make openapi-snapshot` first.")
        return 1

    with open(snapshot_path) as f:
        committed_spec = json.load(f)

    current_str = json.dumps(current_spec, indent=2, sort_keys=True)
    committed_str = json.dumps(committed_spec, indent=2, sort_keys=True)

    if current_str == committed_str:
        print("OpenAPI snapshot: no diff — schema matches the committed snapshot.")
        return 0

    # Diff found — write the current spec to a temp file + show a diff
    print("=" * 60)
    print("OpenAPI SNAPSHOT DIFF DETECTED")
    print("=" * 60)
    print()
    print("The OpenAPI schema generated from the current code does NOT match")
    print("the committed snapshot at docs/openapi.snapshot.json.")
    print()
    print("This is a DELIBERATE gate (B10) — the frontend is written against")
    print("the committed snapshot, so any change to the API contract must be")
    print("a conscious decision.")
    print()
    print("ALL changes are flagged equally — additive (new optional field) and")
    print("breaking (renamed/removed field) changes both fail this check.")
    print("The point is visibility before merge, not auto-approval of 'safe' changes.")
    print()
    print("To resolve:")
    print("  1. If the change is intentional: run `make openapi-snapshot` to")
    print("     update docs/openapi.snapshot.json, then commit it alongside")
    print("     the code change.  Tell the frontend team about the change.")
    print("  2. If the change was NOT intentional: fix the code so the schema")
    print("     matches the committed snapshot again.")
    print()

    # Write a diff for human inspection
    import difflib

    diff = difflib.unified_diff(
        committed_str.splitlines(keepends=True),
        current_str.splitlines(keepends=True),
        fromfile="docs/openapi.snapshot.json (committed)",
        tofile="docs/openapi.snapshot.json (generated)",
        n=3,
    )
    diff_text = "".join(diff)
    # Truncate very long diffs for the CI log
    if len(diff_text) > 5000:
        diff_text = diff_text[:5000] + "\n... (truncated — run locally for full diff)\n"
    print("Diff (first 5000 chars):")
    print(diff_text)

    return 1


if __name__ == "__main__":
    sys.exit(main())
