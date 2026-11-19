/**
 * Default-county preference (P8b-K) — the storage-backed value the
 * Settings screen saves and the Overview reads as its initial filter.
 *
 * Reads/writes go through the shared safe-storage helper (P8b-J), so a
 * throwing localStorage never crashes a consumer.  `useDefaultCounty()`
 * validates the stored value against the LIVE county list from
 * /counties/row_counts and returns '' (All counties) when the stored
 * county is stale — a saved county that no longer exists in the data
 * must not silently filter a page to nothing.
 *
 * Consumers: Settings (render + clear stale) and Overview (initial
 * filter — see features/overview/index.tsx).  Deal Finder / Market
 * Insights wiring is deliberately NOT done: their county controls are
 * exploratory pickers, not persistent filters, and changing what those
 * pages show by default is a product decision for the person (reported).
 */

import { useCountyRowCounts } from '@/lib/api/hooks';
import { storageGet, storageRemove, storageSet } from '@/lib/storage';

const DEFAULT_COUNTY_KEY = 'defaultCounty';

/** The Settings-persisted default county ('' when unset / unreadable). */
export function getStoredDefaultCounty(): string {
  return storageGet(DEFAULT_COUNTY_KEY) ?? '';
}

/** Persist (or clear, when '') the default county. */
export function setStoredDefaultCounty(county: string): void {
  if (county) {
    storageSet(DEFAULT_COUNTY_KEY, county);
  } else {
    storageRemove(DEFAULT_COUNTY_KEY);
  }
}

/**
 * The validated default county: '' (All counties) when unset or stale.
 * While the county list is loading the stored value is returned as-is
 * (the validation simply hasn't happened yet); once loaded, a county
 * missing from the list is treated as stale.
 */
export function useDefaultCounty(): string {
  const stored = getStoredDefaultCounty();
  const rowCountsQ = useCountyRowCounts();
  const known = rowCountsQ.data?.counties.map((c) => c.county);
  if (!stored) return '';
  if (known == null) return stored;
  return known.includes(stored) ? stored : '';
}
