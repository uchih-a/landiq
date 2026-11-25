# Documentation index

Two-line summary: the reading order for a 5–10 minute review, then the
full reference set. Everything is plain Markdown with relative links.

For: reviewers (start at the top) and maintainers (jump to the reference
you need).

## Reviewer path (in order)

1. [README](../README.md) — the pitch, hero screenshot, quickstart
   (clone → install → train → copy artifacts → run), user help.
2. [Architecture](architecture.md) — scrape → Notebooks 1–3 → artifacts →
   backend → frontend; which layer owns which logic; the frontend
   section (pages, verdict + Suspect data chips, en/sw i18n).
3. [Model card](model-card.md) — target, the three production features,
   ensemble, metrics, the 80% range, limitations, intended use. Read the
   asking-price caveat.
4. [Evidence](evidence.md) — test results at a dated commit, the parity
   check, four sample predictions (one Suspect data case), degraded-mode
   behaviour, and what is explicitly *not* evidenced.
5. [Decisions and incidents](decisions.md) — the judgement calls
   (parsing rules, three-feature rule, suspect thresholds 0.05/20,
   convert-vs-flag) and the three incidents (bad size/price reads,
   XGBoost 3.x `base_score`, stale serving manifest).
6. [Data and legal notes](data-and-legal.md) — sources, personal-data
   findings (1,115 phone rows / 252 email rows measured 2026-11-25), the
   OWNER TO VERIFY checklist.

## Reference (maintainer)

| Doc | What it covers |
|---|---|
| [Data dictionary](data-dictionary.md) | every column, units, size-parsing order, price-basis rules, flags, cleaning row counts |
| [Artifacts reference](artifacts.md) | every file under `artifacts/`, which notebook cell produces it, the same-run rule |
| [Retrain and release runbook](retrain-runbook.md) | notebooks → validation → parity → versioned promotion → rollback |
| [API guide](api.md) | all 24 endpoints, shapes, error format, prediction flow |
| [Configuration](configuration.md) | every env variable with defaults |
| [Troubleshooting](troubleshooting.md) | every on-purpose error string with cause + fix |
| [Contributing](../CONTRIBUTING.md) | ground rules + PR checklist |
| [Known gaps](known-gaps.md) | the consolidated "reported, not fixed" list (B0–B12, F0–F10) |
| ADRs | [0001 FastAPI](decisions/0001-use-fastapi.md), [0002 model versioning](decisions/0002-model-versioning.md) |
| Existing deep docs | [features](features.md), [api-contract](api-contract.md), [deployment](deploy_railway_vercel.md), [hardcoded-values audit](hardcoded-values-audit.md) |

## Assets

- Screenshots: [assets/screenshots/](assets/screenshots/) (5 files, each
  captioned in [evidence.md](evidence.md))
- Diagrams: [assets/diagrams/](assets/diagrams/) — four PNGs
  (system architecture, data and model pipeline, prediction request flow,
  artifacts and version-pin map), referenced from architecture, model
  card, data dictionary, api, artifacts, and the runbook. Each is followed
  by a one-line caption; values shown are owner-provided (2026-11-25).
- Interactive architecture board (Miro, view-only): **TBC — owner to
  provide the link** (also noted in [architecture.md](architecture.md)).
