/**
 * Currency formatting + the currency store (P8b-I) — KSh ↔ USD toggle,
 * applied globally.
 *
 * NO TYPED RATE FALLBACK (P8b): the KSh↔USD rate exists only when the
 * backend serves it via /meta (`fx.ksh_per_usd`, set from the
 * FX_KSH_PER_USD env var).  Until it arrives the rate is `null` — the
 * USD toggle is disabled with an honest "not available" note, and a
 * stored USD preference renders as KSh (display-level fallback only;
 * the preference itself is kept).  Nothing here invents a plausible
 * rate.
 *
 * Because getCurrency/formatMoney are called from non-React helpers,
 * the module keeps a tiny external store (subscribe/getSnapshot) so
 * `useCurrency()` (useSyncExternalStore) re-renders every consumer when
 * the rate arrives from /meta or the user toggles the currency — a
 * plain module variable could not do that.
 *
 * Persistence goes through the shared safe-storage helper (P8b-J), so
 * Safari private mode cannot crash any consumer.
 *
 * A live FX feed is a separate architecture decision (not built): the
 * rate is read at startup and is manually maintained (see
 * `fx.source`).
 */

import { useSyncExternalStore } from 'react';

import { storageGet, storageRemove, storageSet } from '@/lib/storage';

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type Currency = 'KSH' | 'USD';

/** The /meta `fx` block (P8b shape — see lib/api/types.ts FxBlock). */
export interface FxState {
  ksh_per_usd: number | null;
  as_of: string | null;
  source: string | null;
}

/** What the store keeps — the UI state every formatter reads. */
export interface CurrencySnapshot {
  currency: Currency;
  /** KSh per 1 USD from /meta; null when the backend hasn't served one. */
  kshPerUsd: number | null;
  asOf: string | null;
  source: string | null;
}

const STORAGE_KEY = 'currency';

// ----------------------------------------------------------------------
// Module-level store (subscribe/getSnapshot)
// ----------------------------------------------------------------------

function initialCurrency(): Currency {
  const stored = storageGet(STORAGE_KEY);
  return stored === 'USD' ? 'USD' : 'KSH';
}

let snapshot: CurrencySnapshot = {
  currency: initialCurrency(),
  kshPerUsd: null,
  asOf: null,
  source: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A broken listener must never break the store.
    }
  }
}

function setSnapshot(next: CurrencySnapshot): void {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CurrencySnapshot {
  return snapshot;
}

function getServerSnapshot(): CurrencySnapshot {
  // SSR: no storage, no fetched rate — always the KSh default.
  return { currency: 'KSH', kshPerUsd: null, asOf: null, source: null };
}

/** React hook — the live currency state; consumers re-render on change. */
export function useCurrency(): CurrencySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ----------------------------------------------------------------------
// Mutators
// ----------------------------------------------------------------------

export function getCurrency(): Currency {
  return snapshot.currency;
}

export function setCurrency(currency: Currency): void {
  if (currency === 'KSH') {
    storageRemove(STORAGE_KEY);
  } else {
    storageSet(STORAGE_KEY, currency);
  }
  setSnapshot({ ...snapshot, currency });
}

/**
 * Push the /meta `fx` block into the store (called by LayoutShell once
 * /meta resolves).  `null` / a non-positive rate resets the rate to
 * "unavailable" — never a fallback number.
 */
export function setFxFromMeta(fx: FxState | null): void {
  const raw = fx?.ksh_per_usd ?? null;
  const rate =
    raw != null && Number.isFinite(raw) && raw > 0 ? raw : null;
  setSnapshot({
    ...snapshot,
    kshPerUsd: rate,
    asOf: fx?.as_of ?? null,
    source: fx?.source ?? null,
  });
}

// ----------------------------------------------------------------------
// Rate accessors
// ----------------------------------------------------------------------

/** True when a usable KSh↔USD rate has arrived from /meta. */
export function fxAvailable(): boolean {
  return snapshot.kshPerUsd != null && snapshot.kshPerUsd > 0;
}

/**
 * The configured KSh-per-USD rate (null when unavailable — never a
 * plausible default).  Surfaced so the Settings page renders
 * "1 USD = N KSh" from the same source the formatters use.
 */
export function currentUsdToKshRate(): number | null {
  return snapshot.kshPerUsd;
}

/** The /meta fx block verbatim (as_of + source for the Settings note). */
export function currentFxState(): FxState {
  return { ksh_per_usd: snapshot.kshPerUsd, as_of: snapshot.asOf, source: snapshot.source };
}

// ----------------------------------------------------------------------
// Formatters (signatures unchanged from the pre-P8b module)
// ----------------------------------------------------------------------

/**
 * The currency actually rendered: a stored USD preference falls back to
 * KSh DISPLAY while no configured rate exists (the preference itself is
 * kept — this is the honest "cannot convert right now" state, not a
 * fabricated rate).
 */
function effectiveCurrency(currency: Currency): Currency {
  return currency === 'USD' && !fxAvailable() ? 'KSH' : currency;
}

/**
 * Format a KSh amount in the user's preferred currency.
 * Input is always KSh (the backend's native currency); output adapts.
 */
export function formatMoney(kshValue: number, currency: Currency = getCurrency()): string {
  const c = effectiveCurrency(currency);
  if (c === 'USD') {
    const rate = snapshot.kshPerUsd ?? 0;
    const usd = kshValue / rate;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(usd);
  }
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(kshValue);
}

/** Format with "/acre" suffix */
export function formatMoneyPerAcre(kshValue: number, currency: Currency = getCurrency()): string {
  const c = effectiveCurrency(currency);
  const suffix = c === 'USD' ? '/acre' : '/eka';
  return `${formatMoney(kshValue, currency)}${suffix}`;
}

/**
 * Compact money formatter for table cells and tight layouts.
 * Produces "KSh 3.4M" / "KSh 250K" / "KSh 1.2B" instead of the full
 * "KES 3,400,000" that `formatMoney` returns — and the $ equivalents
 * when a configured rate exists and USD is selected.
 */
export function formatCompactMoney(kshValue: number, currency: Currency = getCurrency()): string {
  if (!Number.isFinite(kshValue)) return '—';
  const c = effectiveCurrency(currency);
  if (c === 'USD') {
    const rate = snapshot.kshPerUsd ?? 0;
    const usd = kshValue / rate;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
    return `$${Math.round(usd)}`;
  }
  if (kshValue >= 1_000_000_000) return `KSh ${(kshValue / 1_000_000_000).toFixed(1)}B`;
  if (kshValue >= 1_000_000) return `KSh ${(kshValue / 1_000_000).toFixed(1)}M`;
  if (kshValue >= 1_000) return `KSh ${Math.round(kshValue / 1_000)}K`;
  return `KSh ${Math.round(kshValue)}`;
}

/** Convert KSh to USD (for charts that need raw numbers); null when no
 * configured rate exists (the honest unavailable state — never a
 * guess). */
export function kshToUsd(kshValue: number): number | null {
  const rate = snapshot.kshPerUsd;
  return rate != null && rate > 0 ? kshValue / rate : null;
}
