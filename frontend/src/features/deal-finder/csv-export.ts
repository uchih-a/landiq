/**
 * Client-side CSV export for the Deal Finder table.
 *
 * Two entry points:
 *  - `exportListingsCsv(rows)` — serialise a pre-fetched page of rows to
 *    CSV and trigger a browser download. No network round-trip.
 *  - `exportAllListingsCsv(filters, apiClient)` — page through every
 *    matching row server-side (page_size=200) up to a hard 2000-row cap,
 *    then call `exportListingsCsv` on the collected batch. Returns
 *    `{ totalExported, capped, totalAvailable }` so the caller can show
 *    a "capped at N rows" notice when the cap is hit.
 */
import type { ApiClient } from '@/lib/api/client';
import { buildListingsScoredQuery } from '@/lib/api/hooks';
import type {
  ListingsScoredFilters,
  ListingsScoredResponse,
  ListingsScoredRow,
} from '@/lib/api/types';

/** Hard ceiling on the number of rows `exportAllListingsCsv` will fetch. */
export const EXPORT_ROW_CAP = 2000;

/** Page size used when iterating through all pages for export. */
const EXPORT_PAGE_SIZE = 200;

export interface ExportAllResult {
  totalExported: number;
  capped: boolean;
  totalAvailable: number;
}

/** CSV-escape a single cell — wraps in quotes if it contains comma, quote, or newline. */
function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const COLUMNS: { key: keyof ListingsScoredRow; header: string }[] = [
  { key: 'listing_no', header: 'listing_no' },
  { key: 'title', header: 'title' },
  { key: 'location', header: 'location' },
  { key: 'county', header: 'county' },
  { key: 'prop_type', header: 'prop_type' },
  { key: 'size_acres', header: 'size_acres' },
  { key: 'listed_price_per_acre_ksh', header: 'listed_price_per_acre_ksh' },
  { key: 'predicted_price_per_acre_ksh', header: 'predicted_price_per_acre_ksh' },
  { key: 'low_price_per_acre_ksh', header: 'low_price_per_acre_ksh' },
  { key: 'high_price_per_acre_ksh', header: 'high_price_per_acre_ksh' },
  { key: 'listed_over_predicted', header: 'listed_over_predicted' },
  { key: 'verdict', header: 'verdict' },
  { key: 'listing_url', header: 'listing_url' },
];

/**
 * Serialise the supplied rows to CSV and trigger a browser download via
 * a synthesised `<a download>` element. No network round-trip.
 */
export function exportListingsCsv(rows: ListingsScoredRow[]): void {
  const lines: string[] = [];
  lines.push(COLUMNS.map((c) => c.header).join(','));
  for (const r of rows) {
    lines.push(COLUMNS.map((c) => csvEscape(r[c.key])).join(','));
  }
  const blob = new Blob([lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kenya-listings-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Iterate through every page of `/listings/scored` matching `filters`
 * (page_size=200), collecting rows until `total_rows` are gathered or
 * the `EXPORT_ROW_CAP` hard ceiling is hit. Then serialise + download
 * the collected batch via `exportListingsCsv`.
 *
 * Returns `{ totalExported, capped, totalAvailable }` so the caller can
 * surface a "capped at N rows" notice when the cap kicked in.
 *
 * The filters' `page` / `page_size` / `sort` are honoured for the FIRST
 * request's sort, but the iterator overrides `page` and `page_size` for
 * subsequent requests to walk through the result set.
 */
export async function exportAllListingsCsv(
  filters: ListingsScoredFilters,
  apiClient: ApiClient,
): Promise<ExportAllResult> {
  const allRows: ListingsScoredRow[] = [];
  let totalAvailable = 0;
  let page = 1;
  let capped = false;

  // We deliberately preserve every other filter (county, prop_type,
  // verdict, scored_by, data_quality_flag, near_amenity, radius_km,
  // sort) so the export matches exactly what the table is showing.
  while (true) {
    const pageFilters: ListingsScoredFilters = {
      ...filters,
      page,
      page_size: EXPORT_PAGE_SIZE,
    };
    const path = buildListingsScoredQuery(pageFilters);
    const res = await apiClient.get<ListingsScoredResponse>(path);
    totalAvailable = res.pagination.total_rows;
    allRows.push(...res.listings);

    if (allRows.length >= EXPORT_ROW_CAP) {
      // Trim to the cap so the CSV never exceeds the hard limit.
      allRows.length = EXPORT_ROW_CAP;
      capped = totalAvailable > EXPORT_ROW_CAP;
      break;
    }
    if (allRows.length >= totalAvailable) {
      capped = false;
      break;
    }
    if (res.listings.length === 0) {
      // Defensive: a 0-row page means we've drained the result set even
      // if the total_rows counter disagrees (e.g. concurrent deletes).
      capped = false;
      break;
    }
    page += 1;
  }

  exportListingsCsv(allRows);
  return {
    totalExported: allRows.length,
    capped,
    totalAvailable,
  };
}
