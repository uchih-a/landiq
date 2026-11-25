# Contributing

Two-line summary: how to propose a change — run the checks, keep numbers
out of the UI, and read the decisions log before touching a rule. Small,
focused PRs preferred.

For: contributors.

## Setup

```bash
uv sync --extra dev
cp .env.example .env
make test    # backend: pytest (379 tests)
make lint    # ruff + format check
cd frontend && bun install && bun run test   # 155 tests
```

## Ground rules

1. **No typed numbers in the UI.** Thresholds, county lists, model facts
   come from the API or `backend/app/schemas/canonical.py` — never a
   literal in a component.
2. **Don't touch the model contract casually.** `docs/openapi.snapshot.json`
   must be regenerated (`make openapi-snapshot`) when an endpoint changes;
   CI fails on drift.
3. **Cleaning and gate rules are decisions, not bugs.** Read
   [docs/decisions.md](docs/decisions.md) before changing size parsing,
   price-basis handling, or the suspect thresholds (0.05 / 20).
4. **Every user-facing string in both languages.** `en` and `sw` keys stay
   in parity (`frontend/src/lib/i18n/index.ts`; a vitest test enforces
   it).
5. **States, not blank pages.** Every data card has loading / error+retry
   / empty states; a failed query never blanks the page.
6. **Report, don't silently fix.** If you find a gap, add it to
   [docs/known-gaps.md](docs/known-gaps.md) or open an issue describing
   the tradeoff.

## Checklist for a PR

- [ ] Backend tests + frontend tests pass; ruff clean.
- [ ] `python scripts/check_openapi_snapshot.py` — no unexpected diff.
- [ ] New strings in both `en` and `sw`.
- [ ] If a decision changed: entry added to `docs/decisions.md`.
- [ ] If a gap remains: entry added to `docs/known-gaps.md`.
