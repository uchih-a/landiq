# ADR 0002: Model versioning and safe promotion

## Status

Accepted

## Context

Notebook 3 produces a fresh `serving_manifest.json` and model set each time
it's rerun.  Before this ADR there was no safe way to get a new run into
production:

- No versioning — the notebook overwrites `models/ensemble/` in place, so a
  new run destroys the previous one.
- No validation gate — a new model could be worse than the one it replaces,
  and nobody would know until users see bad predictions.
- No rollback — even if the new model is worse, the old one is gone, so
  recovery means re-running the notebook (hours) or restoring from a backup.

This backend must never regress prediction behavior silently.

## Decision

### Versioning scheme: notebook-native

Reuse the version identifier the notebook already stamps — **`production_run`
from `metadata.json` (Cell 8.2) and `manifest.json` (Cell 9.7)**.  This is a
human-readable run name (e.g. `"Run A"`) the notebook assigns based on its
CV-metric selection logic.  No new scheme is invented.

### Version-qualified artifact paths

Store artifacts under `models/ensemble/<version>/` rather than overwriting
`models/ensemble/` in place.  The `ACTIVE_MODEL_VERSION` setting (env var,
B0 pydantic-settings pattern) points at which version is active; the
`ArtifactRegistry` loads from `ARTIFACTS_DIR/models/ensemble/<version>/` at
startup.

When `ACTIVE_MODEL_VERSION` is empty (dev / CI), the registry falls back to
the flat `ARTIFACTS_DIR` layout so existing tests keep working without
version subdirectories.

### Redeploy-to-switch (not hot-reload)

Changing the active version requires a **Railway redeploy**, not a hot-reload.
Rationale:

- **Railway's deployment model** is image-based: each deploy is a new
  container from the Docker image, with env vars injected at startup.  The
  `ACTIVE_MODEL_VERSION` env var is read once at startup (in the lifespan
  hook); changing it triggers a new deploy, which is Railway's normal flow.
- **The app's traffic pattern** is a prediction API for a land valuation
  frontend — not a high-frequency trading system where seconds of downtime
  during a redeploy matter.  A Railway redeploy takes ~30–60 seconds and
  keeps the old replica serving until the new one is healthy.
- **Hot-reload would require** either (a) a file watcher that re-runs the
  registry's `load()` on a signal (complex, race-prone, and the model files
  are multi-MB so the reload would block the event loop), or (b) a
  `/admin/reload` endpoint (security surface — no auth system exists).
  Both add complexity that doesn't match the traffic pattern.

Redeploy-to-switch is simpler and sufficient.  The operator's flow is:
1. Copy the new run's artifacts to `models/ensemble/<new_version>/`
2. Run `make validate-version VERSION=<new_version>` locally
3. If parity passes, set `ACTIVE_MODEL_VERSION=<new_version>` in Railway's env
4. Railway redeploys; the new version loads at startup

### Validation gate: on-demand, not automatic

Before a new version can become active, run B2's parity validation
(`scripts/parity_check.py`) against that version's own
`test_predictions.parquet` / `oof_predictions.parquet`.  This is wired as a
Make target:

```bash
make validate-version VERSION="Run A"
```

The check exits 0 if pass rate ≥ 99% (within tolerance on the log scale),
exits 1 with worst mismatches if below.  **It does NOT auto-promote** —
a human reviews the output and decides whether to set the env var.
Auto-promotion without a human in the loop is explicitly out of scope until
asked for.

### Previous version stays available

Version-qualified paths mean old versions are never deleted on promotion.
Rolling back is setting `ACTIVE_MODEL_VERSION` back to the previous value +
redeploying — the artifacts are still there.  No re-deploy from scratch, no
backup restore.

## Consequences

- Artifact disk usage grows with each version (~50–200 MB per model set).
  Clean up old versions manually when disk pressure mounts; keep at least
  the previous one.
- The `ACTIVE_MODEL_VERSION` env var must be set in Railway for production.
  When unset, the app uses the flat `ARTIFACTS_DIR` layout (dev / CI mode).
- Parity validation is a human-in-the-loop step — the operator must remember
  to run it before promoting.  CI does not run it automatically (it needs
  the real model files, which aren't in the repo).
