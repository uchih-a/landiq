# API Contract Workflow

## Why this exists

The React frontend (not yet built) will be written against whatever response
shapes the backend actually produces.  Nothing currently stops a later change
— in this backend or in a future "fix" — from silently altering a field name,
type, or removing a field, which would break the frontend without any backend
test failing.

The OpenAPI snapshot check (B10) is a **visibility gate**: it forces every API
contract change to be a conscious decision, not a side-effect.

## How it works

1. **Snapshot file**: `docs/openapi.snapshot.json` — a committed copy of the
   OpenAPI schema generated from the running app.  This is the **contract**
   the frontend is written against.

2. **CI check**: `.github/workflows/ci.yml` runs
   `python scripts/check_openapi_snapshot.py` on every push + PR.  The script
   regenerates the schema from the current code and diffs it against the
   committed snapshot.  A diff fails CI with a clear message — not a silent
   pass.

3. **All changes are flagged equally**: additive (new optional field) and
   breaking (renamed/removed field) changes both fail the check.  The point
   is visibility before merge, not auto-approval of "safe" changes.  The diff
   output itself shows what changed; the human decides which kind it is and
   whether the frontend needs to be told.

## How to update the snapshot deliberately

When you intentionally change the API contract (add a field, change a type,
add a new endpoint):

```bash
make openapi-snapshot
```

This regenerates `docs/openapi.snapshot.json` from the current code.  Commit
the updated snapshot alongside the code change, and tell the frontend team
about the change.

## How to fix an unintentional diff

If the CI check fails and the change was NOT intentional, fix the code so the
schema matches the committed snapshot again.  Do NOT update the snapshot to
match the code — that would silently approve the unintended change.

## Where things live

| File | Purpose |
|---|---|
| `docs/openapi.snapshot.json` | The committed schema snapshot (the contract) |
| `scripts/check_openapi_snapshot.py` | CI check script — regenerates + diffs |
| `Makefile` `openapi-snapshot` target | One-command snapshot regeneration |
| `.github/workflows/ci.yml` `openapi-snapshot` job | CI gate |
