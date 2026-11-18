/**
 * csv-export — P4b: the client-side page-walking exporter (EXPORT_ROW_CAP
 * + window.alert) is DELETED.  The export now streams from the
 * server-side endpoint `GET /listings/scored/export.csv` (same filters +
 * sort; UTF-8 BOM; money columns raw; truncation surfaced via the
 * X-Export-* headers instead of silently cutting).
 *
 * The URL builder lives in `@/lib/api/hooks` (`buildListingsExportUrl`)
 * so the table query and the export share one serialization.  This module
 * keeps only the blob-download helper (anchor creation + cleanup) so
 * existing imports keep working; it performs NO network walking and
 * enforces NO typed cap.
 */
import type { ListingsScoredFilters } from '@/lib/api/types';
import { buildListingsExportUrl } from '@/lib/api/hooks';

export interface ExportResult {
  truncated: boolean;
  totalAvailable: number | null;
}

/** Trigger the streaming export for the given filters.  Returns the
 * truncation info from the response headers (never a typed cap). */
export async function exportAllListingsCsv(
  filters: ListingsScoredFilters,
): Promise<ExportResult> {
  const url = buildListingsExportUrl(filters);
  const resp = await fetch(`/api/v1${url}`);
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Export failed (${resp.status}).`);
  }
  const truncated = resp.headers.get('X-Export-Truncated') === 'true';
  const totalHeader = resp.headers.get('X-Export-Total');
  const blob = await resp.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = 'listings.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
  return {
    truncated,
    totalAvailable: totalHeader != null ? Number(totalHeader) : null,
  };
}

// Re-export for callers that still import the builder from here.
export { buildListingsExportUrl };
