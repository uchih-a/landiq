# P7b + P8b delivery report — Data Explorer correctness + About/Settings data-driven copy

Date: 2026-11-18. Scope: correctness, honest states, and data-driven values.
No redesign; visuals match the existing builds (verified by render + vision check).

Snapshot note honoured: every item below was re-verified against the current
tree before fixing. The repo had moved past the briefs' snapshot (P1b–P6b
merged; an "O3" sweep had already partially reshaped FX/Settings) — the
differences are called out per item.

---

## PART 1 — P7b: DATA EXPLORER

### Per-item status

| Item | Status | Notes |
|---|---|---|
| A. `?? 10` threshold fallback + "≥ 10 listings" badge | **RESOLVED** | Threshold comes from /meta only. Null → badge, divider, "Model Ready / Not enough data" statuses, and the ready/not-ready split all hidden; "Threshold not available" shown instead. The counties/summary backend null-return was already landed by P3b (`min_county_n_from_manifest`) — noted, not redone. |
| B. SEVERE_MISSING_PCT=50 severity accent | **RESOLVED (option 2 — removed)** | No configured "too much missing" notion exists on the backend (verified by search), so the severity styling was removed per the brief's option 2. Plain values, `missing_pct` unmodified, excluded marker from `in_selected_set`. |
| C. Typed tab labels + "Coming soon" | **RESOLVED** | Labels via i18n (`de.tab.*`, en+sw). The four undesigned tabs render DISABLED non-interactive-looking pills, reachable by URL (?tab=), with translated honest placeholders naming the missing endpoint each needs. [architecture-decision] list for the four tabs: known-gaps #162. |
| D. Colour ramp hexes + thresholds | **RESOLVED** | Hexes single-sourced in `lib/ui/chart-tokens.ts` (CHART_COLOR_RAMP_PALE/LIGHT/MID/DEEP + CHART_COLOR_OUTLINE, tailwind-token mirror documented). Ramp cut-offs in one `PRICE_RAMP_CUTOFFS` constant commented "presentation constants, not data facts". |
| E. Axis bounds / percentile markers / clamps | **RESOLVED** | Markers positioned from response percentiles on the response-derived log10 axis. The three width clamps kept only as commented VISUAL MINIMUMS; counts always printed as text so no clamp can misrepresent a county's count. |
| F. `toLocaleString('en-KE')` + non-currency-aware `compactKSh` | **RESOLVED** | All call-sites use the `useFormatNumber()` locale helper (one stray literal in Model Performance swept too). `compactKSh`/`shortNum` removed in favour of the shared `formatCompactMoney` (currency-aware; components subscribe via `useCurrency()`). |
| G. English-only fact copy | **RESOLVED** | ~60 new `de.*` i18n keys (en+sw), all interpolated (threshold, counts, flag window). Sanitization tile explains the flag from `flag_definition` — never typed "1st-99th". |
| H. "of N total" counties | **RESOLVED** | `n_counties_total` from /counties/summary (boundaries) on the coverage tile ("4 of 47 counties"); never a typed 47. |
| I. Missing-values card provenance | **VERIFIED, no change needed** | Sort = missing_pct desc; excluded marker = `in_selected_set`; labels from feature_labels; pct unmodified. Only (B)'s severity removal touched it. |
| J. CSV download | **RESOLVED** | BOM, RFC-4180 quoted+escaped county names, plain locale-independent numbers, blank cells for null/unknown, filename date from /meta. Unit-tested. |
| K. Card states | **RESOLVED (already mostly present)** | Loading/error+retry/empty per card; one failing query leaves the rest rendered (test + render proof). |
| L. Accessibility | **RESOLVED** | Proper tablist (role=tab, aria-selected, roving tabindex + arrow keys on enabled tabs); sr-only text alternatives for the county bars and the county table; sr-only histogram summary (n, median, p10–p90); colour never the only encoding. |
| Backend: `flag_definition` | **DONE** | Served on /data/price-distribution AND /meta from new canonical constants FLAG_LOWER_PCT/FLAG_UPPER_PCT (mirrors the notebook Cell 9.6 rule the /listings/scored docs describe — the notebook itself is not in the repo; canonical.py is the one definition now). Tests: present + matches constants + degenerate case. OpenAPI regenerated. |
| `missing_severe_pct` backend field | **NOT ADDED (option 2 chosen)** | No configured notion existed; severity removed instead. |

### P7b frontend tests (all in `features/data-explorer/__tests__/`)
(a) threshold text follows mock 25→12; (b) null hides statuses + badge, shows
"Threshold not available"; (c) tab labels from i18n + ?tab= restores the
honest placeholder + disabled pills; (d) CSV builder (BOM/header/escaping/
plain numbers/blank model_ready); (e) median marker follows currency + rate
changes + honest KSh with no rate; (f) failing feature-evaluation or
price-distribution query leaves other cards; (g) rowsForMissing has no
severity field, excluded marker from in_selected_set.

---

## PART 2 — P8b: ABOUT + SETTINGS

### About — per-item status

| Item | Status | Notes |
|---|---|---|
| A. Pipeline copy facts | **RESOLVED** | Sources note / cleaning steps / feature groups from /meta's new `methodology` block (one backend copy in `canonical.py`, claims verifiable in-repo). Model names from /model/metrics `model_info`. Interval level from `default_interval_level`. UNVERIFIABLE claims REMOVED: "duplicate listings" and "mismatched coordinates" are notebook-ETL-only — deleted, reported. |
| B. FAQ numbers | **RESOLVED** | MedAPE one decimal; level from response; coverage at that level; flag window from `flag_definition` (ordinal-suffixed: "1st–99th"); refusal thresholds from /meta with a numbers-free fallback; sources answer = methodology note. |
| C. MdAPE/MedAPE inconsistency | **RESOLVED** | "MedAPE" app-wide via i18n. Glossary entries templated (interval level interpolated). |
| D. Footer stats | **RESOLVED** | All from APIs; "Counties Covered" = "N of TOTAL" from /counties/summary `n_counties_total` (typed 47 gone); "not available" per stat. |
| E. isDegraded logic | **RESOLVED** | Four distinct states: loading (neutral), ok, degraded, unreachable (error) — distinct copy for each. |
| F. Report-a-listing | **KEPT, open decision reported** | VITE_REPORT_EMAIL-gated mailto; no address invented. Email vs backend /reports endpoint = [architecture-decision] (known-gaps #176, decision #3). |
| G. i18n + accordion a11y | **RESOLVED** | All strings en+sw (~55 `about.*` keys). Accordion keeps button + aria-expanded + aria-controls; chevron icons aria-hidden so accessible names are clean. |

### Settings + shared — per-item status

| Item | Status | Notes |
|---|---|---|
| H. County options + stale reset | **RESOLVED** | From /counties/row_counts (n>0, sorted) + "All counties" (O3 had the list; this pass added the stale reset). Stale stored county → cleared to "All counties" + honest notice; never a blank select. |
| I. FX rate | **RESOLVED (supersedes O3 shape)** | No default rate in code: fx = null until FX_KSH_PER_USD set; served as {ksh_per_usd, as_of, source}. Frontend module store (subscribe/getSnapshot) + `useCurrency()` (useSyncExternalStore) → all consumers re-render on rate arrival / toggle. No rate → USD pill disabled + tooltip + honest note; stored USD preference renders as KSh (kept, not deleted). Settings note from the response; fixed vs live via `source`. The O3-era fields (ksh_to_usd_rate/usd_to_ksh_rate/is_live, 129 default, KSH_TO_USD_RATE env) were REPLACED — they were never in a released contract (same delivery stream); all consumers/tests/mocks updated together. |
| J. Safe storage | **RESOLVED** | `lib/storage.ts` (try/catch + in-memory fallback); currency, language, default county all through it; i18n init included. |
| K. useDefaultCounty hook | **RESOLVED** | `lib/county-preference.ts` with validation against the live county list. Consumed by Settings (stale clear) + Overview (initial filter via the safe accessor — Overview already consumed the setting; its bare localStorage read was swept). Deal Finder / Market Insights wiring deliberately left (product decision #7). |
| L. Language options | **RESOLVED** | From registered i18n resources + Intl.DisplayNames native names. No "Reset to defaults" (no design). |
| M. Shell | **RESOLVED** | Version text from /meta (null → hidden; O2 had done the v2.4 removal; verified + test). Rail notification dot REMOVED (mobile header dot was already gone). |

### P8b frontend tests
(a) county options equal mocked row_counts + change with mock + stale cleared;
(b) USD disabled when fx null; converted values follow the mocked rate
(settings note + Model Performance MAE tile); (c) throwing localStorage never
crashes storage / currency / i18n (poisoned-storage dynamic-import tests);
(d) About stats + FAQ follow mocked MedAPE/coverage/level/models/flag-window
(changing mocks changes text); (e) four distinct health-state copy assertions;
(f) shell version text follows /meta (null → no version text; no "v2.4").

### Backend additions (additive, backward compatible at the MetaResponse level)
- `canonical.py`: FLAG_LOWER_PCT/FLAG_UPPER_PCT + METHODOLOGY block.
- `health.py`: FlagDefinition, MethodologyBlock, FxBlock reshape, MetaResponse fields.
- `data_explorer.py` schema + router: flag_definition.
- `config.py`: FX_KSH_PER_USD / FX_AS_OF / FX_SOURCE (no defaults that look like data).
- `.env.example` + `docs/api.md` updated; OpenAPI snapshot regenerated.
- Tests: test_meta_fx.py rewritten; test_meta_p8b.py new; test_data_explorer.py extended.

---

## Verification summary

- Backend: `PYTHONPATH=backend:src uv run python -m pytest backend/tests/` →
  **307 passed, 1 skipped**; `ruff check` + `ruff format --check` clean.
- Frontend: `npm run typecheck` + `npm run lint` clean; `npm run build` OK
  (pre-existing maplibre chunk-size advisory only); `npm run test` →
  **135 passed** (was 98; +37 new).
- `scripts/check-hardcoded.sh` → **no violations**.
- Render (Playwright via agent-browser, local Outfit + Material Symbols
  woff2): 20 captures at 1440 + 390 in `work/screenshots/p78-final/`
  — default / no-threshold / ?tab=prices / dist-error / eval-error /
  alt-values / USD / sw / About (default, alt, degraded, unreachable) /
  Settings (default, fx-null, stale-county) / mobile captures with
  scrollWidth = 390 = innerWidth on all. Text-level assertions proved the
  threshold (≥12), flag window (1st–99th vs 2nd–97th under the alt mock),
  MedAPE/level/models, rate note, USD-disabled, and stale-county copy all
  follow the mocked API. Vision inspection of the key pages found no broken
  layout (the mobile "Help & Support" card is simply below the fold of the
  1100px capture, not clipped in-app).
- Search proofs (outside tests/mocks/documented UI constants): `?? 10` —
  comments only; `≥ 10` — none; `SEVERE_MISSING_PCT` — gone (comment mentions
  remain); `'en-KE'` — only the locale helper + currency formatter;
  `'Data quality'` / tab labels — i18n only; `Coming soon` — gone;
  `'Kajiado'/'Mombasa'` in settings — gone; `129` — none in app code
  (backend default REMOVED; only test mocks); `v2.4` — comments only;
  `CatBoost, XGBoost, and TabNet` — gone; `1st-99th`/`1st–99th` in UI — gone
  (backend canonical + docs only); `localStorage` outside the storage helper —
  none.

## Shared-component / cross-feature edits (explicit)

- `lib/currency/format.ts` — REWRITTEN (module store + useCurrency; no rate
  fallback; formatters keep signatures; `currentUsdToKshRate` now returns
  `number | null`, `kshToUsd` returns `number | null` — no external users).
- `lib/storage.ts`, `lib/county-preference.ts`, `lib/ordinal.ts` — NEW shared modules.
- `lib/api/types.ts` — FxBlock reshape + MetaResponse/PriceDistributionResponse additions.
- `lib/i18n/index.ts` — ~115 new keys (en+sw) + safe-storage language init.
- `lib/ui/chart-tokens.ts` — ramp tokens + PRICE_RAMP_CUTOFFS.
- `components/PillButton.tsx`, `components/PillDropdown.tsx` — icon spans
  aria-hidden (accessible names no longer include icon ligature text).
- `app/LayoutShell.tsx` (FX hook comment), `app/nav-config.ts` (hasDot removed).
- `features/overview/index.tsx` — reads the default county via the safe
  accessor (behaviour unchanged).
- `features/model-performance/index.tsx` — one `toLocaleString('en-KE')` →
  locale helper (P7b-F's literal).
- Tests updated for the FX reshape: `KpiRow.test.tsx` (mock shape),
  `metrics-helpers.test.ts` (rate via store, honest KSh with no rate).
- Backend format-only sweep: `app_exports.py`, `explainability.py`,
  `test_model_p6b.py` (pre-existing ruff-format drift, whitespace only —
  keeps `make lint` green).
- Docs: `known-gaps.md` (entries 159–184), `api.md`, `.env.example`,
  `openapi.snapshot.json`.

## Design-vs-data discrepancies (reported, not built)

- The design's "Observed corpus" tile has no backend number (raw pre-cleaning
  count is not recorded anywhere the backend loads) — the tile keeps its
  honest "not available" state.
- The design's provenance shares (68/24/8, 72/21/7, 84/16 splits) are not
  recorded in the exported dataset — the card keeps the muted "shape exists,
  numbers unavailable" treatment (row titles are i18n UI labels with an
  explicit not-available caption; see decision #8).
- The design's "23 counties meet the ≥10 listings threshold" caption is now
  interpolated from the real threshold/count.
- The four undesigned tabs have no design; each placeholder names the
  endpoint it would need (see the [architecture-decision] list in known-gaps
  #162).

## Not done, and why

- `missing_severe_pct` backend field — not added (option 2 chosen: severity
  removed; no configured backend notion existed).
- Live FX feed, report-a-listing backend, auth — out of scope, reported as
  decisions.
- Wiring `useDefaultCounty()` into Deal Finder / Market Insights — their
  county controls are exploratory pickers; changing their default view is a
  product decision (#7).
- The four undesigned Data Explorer tabs — explicitly out of scope.

## Decisions for the person (numbered)

1. **FX env rename/reshape**: KSH_TO_USD_RATE (O3) → FX_KSH_PER_USD with
   NO default (fx null until set). If any deployment set the O3 var, re-set
   it as FX_KSH_PER_USD. The old FxBlock field names no longer exist.
2. **Live FX feed** — still an open [architecture-decision]; the rate is
   operator-maintained, read at startup.
3. **Report-a-listing destination** — email (VITE_REPORT_EMAIL) vs a backend
   /reports endpoint with storage: [architecture-decision].
4. **/meta's inner coverage-rule defaults** (`.get("COVERAGE_MIN_COUNTY_N", 10)`):
   the documented B0-era OPEN allowlist item — fires only when
   coverage_rules.json lacks the key; decide strict-null vs documented default.
5. **Flag window provenance**: FLAG_LOWER_PCT/FLAG_UPPER_PCT (1/99) document
   the notebook's Cell 9.6 rule (the notebook is not in this repo; listings.py
   docstrings describe the same rule). If the notebook rule ever changes,
   change the two constants — they are the one definition the stack reads.
6. **Missing-values severity accent**: add a configured `missing_severe_pct`
   to /meta first if you want the orange accent back.
7. **Default county in Deal Finder / Market Insights**: wire `useDefaultCounty()`
   into those pages only if you want the saved county to shape their initial view.
8. **The four undesigned tabs** (#162): each needs a design + endpoint
   decision (prices-by-group / location aggregates / seeded sampled scatter /
   raw-dataset serving with row-count honesty).
9. **Kiswahili native review** for all sw keys added since P2b (incl. the
   ~115 new keys this round).
