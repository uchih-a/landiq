# Data and legal notes

Two-line summary: where the listing data came from, what personal details
the committed CSV actually contains (measured, not guessed), and the
disclaimers that apply. This is an engineering note, not legal advice.

For: the repository owner, and reviewers assessing data provenance and
risk. **You are not a lawyer and neither is this document** — the
checklist at the end marks every item that needs a human decision.

## Sources

- **Property24 Kenya** (property24.co.ke) — the primary source; the
  committed `property24_kenya_finals.csv` (5,875 rows) is scraped from
  it. Sample `listing_url`:
  `https://www.property24.co.ke/vacant-land-plot-for-sale-in-naivasha-114301476`.
- **BuyRentKenya** — a secondary source scraped by the same scraper; the
  committed CSV in this snapshot carries the Property24 rows.
- The scraper itself is a **separate repository**:
  [github.com/uchih-a/scrapper](https://github.com/uchih-a/scrapper).
  Its logic, scheduling, and robots.txt handling are documented there,
  not here. This repo only consumes its CSV output.

## Scrape date range

The committed data carries no single scrape date column. `list_date` is
populated for 2,284 of 5,875 rows and spans **2017-11-08 to 2026-04-09**
(parsed with `dayfirst=True`; the max is later than the repo's last
commit, so at least some values are portal re-list dates, not scrape
dates — derived from `property24_kenya_finals.csv`). The actual scrape
window is a scraper-repo fact: **TBC — owner to confirm from the scraper
run logs.** `data_date` served by `/meta` comes from
`artifacts/metadata.json`, which the notebooks write at training time.

## Row counts

| Stage | Rows |
|---|---|
| Committed CSV | 5,875 |
| Usable `price_per_acre` after corrected cleaning | 3,958 |
| Fixture-built `listings_scored.parquet` | 5,879 (5,875 + synthetic edge rows) |
| Non-suspect / suspect | 3,544 / 2,335 |

Full cleaning funnel: [data-dictionary.md](data-dictionary.md).

## Personal details in the committed data (measured 2026-11-25, commit `e1584c1`)

The CSV was re-scanned (free-text columns: `title`, `location`,
`street_address`, `description`, `listing_url`) without modifying it.
**The data was NOT edited — these findings are reported for the owner to
decide on.** Counts are regex matches and so are a lower bound (formatted
or split numbers may be missed).

| Finding | Count | Where |
|---|---|---|
| Rows containing Kenyan phone-number patterns (`07xx…`, `+254…`, `254…`) | **1,115 of 5,875 (19.0%)** — 1,460 matches, 288 distinct numbers | almost all in `description` (agent contact lines) |
| Rows containing email addresses | **252 of 5,875 (4.3%)** — 254 matches, 17 distinct addresses | `description`; mostly agent/business inboxes (gmail.com and agency domains) |
| Rows with phone or email | 1,178 (20.1%) | |
| Rows with agent/agency/contact keywords (`agent`, `contact`, `call`, `whatsapp`, `dealer`, `realtor`, `broker`, `seller`) | 1,820 (31.0%) | mostly `description` |

Agent/agency business names appear in contact lines (e.g. "Talma Homes",
"Real Time Properties", "Waga Holdings", "The Rising Sun Realty"). The
emails are predominantly business contacts (real-estate agencies) rather
than private individuals, but some phone numbers may belong to individual
sellers. No formal personal-name prefixes (Mr/Mrs/Ms/Dr) and no other
personal-data categories (ID numbers, financial accounts) were observed.

## Position on scraping (what the repo supports)

This repo documents no robots.txt compliance check, no Terms-of-Service
review, and no licensing agreement with either portal. Whether scraping
these portals is permitted by their terms is a question the **owner must
answer** — see the checklist. The app itself only re-serves aggregated
statistics and per-listing asking prices, and every export carries the
`listing_url` for traceability.

## Handling of personal details in listing text

**Owner decision (per FACTS): pending — TBC.** The committed CSV currently
**keeps** every phone number, email, and agent/business name as-scraped;
nothing is redacted or masked. The owner has not yet confirmed whether to
keep the data or to redact/mask it before wider publication — that
decision is recorded as open in the checklist below (item 3). If the data
is kept, the lawful basis must be recorded under Kenya's Data Protection
Act (2019); if it is redacted, the scan above is the pre-redaction
baseline.

- The cleaning pipeline keeps `title`, `location`, `description` as
  scraped; it does not redact phone numbers, emails, or names from the
  descriptions (the model does not use free-text features in
  production, but the raw columns ride along into exports where the
  notebooks carry them).
- The app's user-facing surfaces (Deal Finder table, detail panels) show
  `title` and `location`, not `description`, so contact details are not
  rendered in the UI.
- The CSV export (`/listings/scored/export.csv`) serves the scored
  columns (identifier, prices, verdict, flags), not free text.

## Disclaimers

- **This app does not produce a valuation certificate.** Estimates are
  statistical, built on asking prices, and carry a model 80% range.
- Prices are **asking prices**, not sale prices; they embed seller
  optimism and strategy.
- The data is scraped and cleaned automatically; despite the size/price
  parsing rules and the suspect gate, individual rows can still be wrong.
  Suspect and data-quality-flagged rows are marked, not silently fixed.

## OWNER TO VERIFY checklist

These need a human decision before any public deployment:

1. [ ] **Scrape legality**: confirm Property24 Kenya's and BuyRentKenya's
   Terms of Service and robots.txt permit the scraping the external repo
   performs (and at the rate it performs it).
2. [ ] **Scrape date range**: confirm the actual scrape window from the
   scraper repo's run logs; the `list_date` column is unreliable for this
   (see above).
3. [ ] **Personal data retention**: decide whether the 1,115
   phone-number rows and 252 email rows should stay in the committed CSV
   (public repo) or be redacted/masked before wider publication. If kept,
   record the lawful basis. Consider Kenya's Data Protection Act (2019)
   obligations for processing personal data.
4. [ ] **Attribution/licensing**: confirm whether the portals' content
   terms require attribution or prohibit redistribution of listing data.
5. [ ] **Contact-detail exposure via exports**: confirm the
   `/listings/scored/export.csv` and any future dataset releases exclude
   free-text columns (they currently do).
6. [ ] **FX source**: if `FX_KSH_PER_USD` is set in production, record
   who maintains the rate and the date (`FX_AS_OF`), since the UI
   displays it as provenance.
