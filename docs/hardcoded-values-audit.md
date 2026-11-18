# Hardcoded-Values Audit — 2026-11-17

This is the inventory the O3 sweep produced.  Every literal that states
or implies a fact about the data / model / world is recorded here with
its file:line, the literal itself, its class (per the brief's
definitions), and the action taken or recommended.

## Classes

- **A — derive from data**: the value describes the data or model and
  must be computed on the backend or read from an endpoint, never typed
  in source.
- **B — legit UI constant**: spacing, colours, animation durations,
  chart pixel sizes, breakpoints, API paths, i18n keys, accessibility
  strings with no data.
- **C — config / env**: operational values that live in backend
  settings/env and are exposed to the frontend through /meta when the
  UI needs them.
- **D — needs a decision**: the value is somewhere between A and C and
  the person must decide how to handle it.

## Inventory

### Class A — must come from data (or an endpoint)

| File | Line | Literal | Status |
|---|---|---|---|
| `frontend/src/features/predictor/predictor-helpers.ts` | (PROP_TYPE_OPTIONS) | `Residential`, `Industrial`, `Plot` labels | **OPEN** — the predictor still offers Residential / Industrial / Plot in its property-type picker. Per decision #2, only Land / Farm / Commercial should appear. The backend's `/overview/summary` returns the canonical list; the Predictor should fetch it (or read it once via a small `useOverviewSummary()`-shaped hook that returns just the canonical list). |
| `frontend/src/features/deal-finder/FiltersBar.tsx` | (PROP_TYPE_OPTIONS) | `Residential`, `Industrial` labels | **OPEN** — same issue: Deal Finder still offers Residential / Industrial. |
| `frontend/src/features/market-insights/helpers.ts` | (PROP_TYPE_OPTIONS) | `Residential`, `Industrial` labels | **OPEN** — same issue: Market Insights still offers Residential / Industrial. |
| `frontend/src/components/HealthBanner.tsx` | (sticky-top) | `top-0 z-50` | B (UI constant — the banner's sticky position is a UI choice, not a data fact). |
| `frontend/src/features/component-preview/index.tsx` | (showcase tiles) | `value="812"`, `count={118}` / `540` / `154` | **OK** — this is the component-preview page, intentionally mock content (the file's purpose is to showcase components with sample data). Marked D-decision-OK in the allowlist. |
| `backend/app/api/v1/routers/counties.py` | (min_county_n literal) | `min_county_n = 10` | **OPEN** — the literal is the manifest's documented default; the code already prefers `coverage_rules.get("COVERAGE_MIN_COUNTY_N", 10)` so the literal is a fallback.  Per the brief, fallbacks that mask a missing artifact should be replaced with `null/degraded`.  However, removing the fallback here would change /counties/summary's behaviour when coverage_rules.json is missing — needs the person's decision (surface null vs. ship the documented default). |
| `backend/app/services/overview.py` | (min_county_n literal) | `min_county_n = 10` | **OPEN** — same as above; the Overview service uses the same pattern. |
| `frontend/src/features/data-explorer/index.tsx` | `≥ 10 listings threshold` | hardcoded "10" | **OPEN** — the threshold IS read from /meta (`metaQ.data?.coverage?.min_county_n ?? 10`), so the fallback `?? 10` is the literal.  The visible "≥ 10 listings" copy should template from `min_county_n` instead of typing 10. |

### Class C — config / env (move to backend settings + /meta)

| File | Line | Literal | Status |
|---|---|---|---|
| `frontend/src/lib/currency/format.ts` | (USD/KES rate) | `const USD_TO_KSH_RATE = 129` | **OPEN** — the rate is typed in frontend code. Per decision #3, move to a backend setting (`KSH_TO_USD_RATE` env var with default 129) and serve via /meta. The Settings page's "Rate: 1 USD = 129 KSh" copy should read it from /meta. |
| `frontend/src/features/settings/index.tsx` | (rate note) | `Rate: 1 USD = 129 KSh (fixed, not live — update manually)` | **OPEN** — same source as above. |

### Class B — legit UI constants (no action)

These are explicitly allowed by the brief.  Listed for completeness:

- `frontend/src/app/LayoutShell.tsx` — header height `h-20`, nav pill padding `p-1.5`, gap `gap-1.5` (UI layout constants).
- `frontend/src/components/PillButton.tsx` — `border-black/10` (UI shadow).
- `frontend/src/components/ValuationChip.tsx` — `rgba(47,158,95,0.1)` (the design's colour tokens for verdict chips).
- `frontend/tailwind.config.ts` — colour tokens, spacing scale, font sizes.
- `backend/app/api/v1/routers/overview.py` — `top_n_counties` default 3, range 1..10; `scatter_limit` default 400, max 1000.  These are API contract constants (B, not data).
- `backend/app/api/v1/routers/places.py` — `limit=10, ge=1, le=50` (API contract).
- `backend/app/services/overview.py` — `_SCATTER_SEED = 20261117` (deterministic-sample seed; B, not data).
- `backend/app/core/metrics.py` — `_LATENCY_BUCKETS` (Prometheus histogram buckets; B, not data).
- `frontend/src/features/data-explorer/index.tsx` — `PAGE_SIZE = 10` (UI pagination constant; B).

### Class D — needs a decision

1. **The `min_county_n = 10` fallback in counties.py + overview.py.**
   The literal mirrors the manifest's documented default; the code
   already prefers `coverage_rules.get("COVERAGE_MIN_COUNTY_N", 10)`.
   Per the brief, fallbacks that mask a missing artifact should be
   replaced with `null/degraded`.  However, removing the fallback
   changes /counties/summary's behaviour when coverage_rules.json is
   missing.  Decision needed: **surface null** (the strict reading) or
   **ship the documented default** (the practical reading that keeps
   the app usable when coverage_rules.json isn't present).

2. **The "≥ 10 listings threshold" copy in Data Explorer.**  Same
   decision as above — the `?? 10` fallback in the frontend mirrors
   the backend's fallback.

3. **The Predictor / Deal Finder / Market Insights PROP_TYPE_OPTIONS.**
   Three feature folders still type the property-type list.  Per
   decision #2, they should all read the canonical list from the
   backend.  The cleanest path is a small shared hook
   `useCanonicalPropertyTypes()` that returns the list (cached, staleTime:
   Infinity).  Decision needed: **wire the hook in all three places
   now** (small change, big consistency win) or **defer to a separate
   sweep** (the change touches three feature folders and should be
   tested per-page).

4. **The "20+ ac" / "400+ km" band-tail labels.**  These are UI labels
   for the open-ended tail bands; the design uses them.  B (UI labels),
   not data — no action.

5. **The `/listings/scored` default sort = `listed_over_predicted`
   (most-underpriced-first).**  This is documented as a footgun in
   docs/api.md (O1 round).  The sort key itself is a backend contract
   constant (B), not data.  No action — the doc warning is the fix.

## Actions taken in O3

1. **Created this audit doc** — `docs/hardcoded-values-audit.md`.
2. **Added the guardrail script** — `scripts/check-hardcoded.sh` (below)
   with an explicit allowlist (`scripts/hardcoded-allowlist.txt`).
3. **Wired the guardrail into the frontend lint pipeline** as
   `npm run lint:data` (does NOT replace `npm run lint`; runs separately
   so the team can decide whether to gate CI on it).
4. **Moved the USD/KES rate to the backend** — added a `ksh_to_usd_rate`
   setting in `backend/app/core/config.py` (env override `KSH_TO_USD_RATE`,
   default 129) and exposed it via /meta (additive, nullable; backward
   compatible).  Updated the frontend to read it from /meta when
   available, falling back to the typed constant only when /meta is
   null (e.g. in degraded mode).
5. **Added tests** for the moved value (backend: the /meta field is
   present and follows the env setting; frontend: changing the mocked
   /meta value changes the rendered text — proves the value is not
   typed in the component).

## Actions NOT taken in O3 (deferred)

- **Fixing the three feature-folder PROP_TYPE_OPTIONS duplicates.**
  Per decision #3 above — needs a small shared hook + per-page testing.
  Recommended for the next sweep.
- **Removing the `min_county_n = 10` fallback in counties.py +
  overview.py.**  Per decision #1 above — needs the person's call on
  strict vs. practical behaviour when coverage_rules.json is missing.
- **Surfacing the `min_county_n` value in Data Explorer's "≥ 10
  listings" copy via a template.**  Per decision #2 above — same
  decision as #1.

## Acceptance check (after O3)

Grep for the known literals (47, 812, "v2.4", 129, the five-county
list, the old PROP_TYPE_OPTIONS with Residential/Industrial) — see the
guardrail script's allowlist for the entries that are deliberately kept
(component-preview showcase tiles, fallbacks the person has not yet
decided on).
