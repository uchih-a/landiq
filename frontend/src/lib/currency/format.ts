/**
 * Currency formatting utility — KSh ↔ USD toggle, applied globally.
 *
 * The exchange rate is a FIXED, CONFIGURABLE constant — NOT live/fetched.
 * Source: approximate mid-market rate as of November 2024.
 * The person must update this manually or wire a real FX source later.
 *
 * Rate: 1 USD = 129 KSh (Kenya Shilling)
 * This is a reasonable approximation but will drift over time.
 */

const KSH_TO_USD_RATE = 1 / 129; // 1 KSh = 0.00775 USD
const USD_TO_KSH_RATE = 129; // 1 USD = 129 KSh

export type Currency = 'KSH' | 'USD';

const STORAGE_KEY = 'currency';

export function getCurrency(): Currency {
  if (typeof localStorage === 'undefined') return 'KSH';
  return (localStorage.getItem(STORAGE_KEY) as Currency) || 'KSH';
}

export function setCurrency(currency: Currency): void {
  localStorage.setItem(STORAGE_KEY, currency);
}

/**
 * Format a KSh amount in the user's preferred currency.
 * Input is always KSh (the backend's native currency); output adapts.
 */
export function formatMoney(kshValue: number, currency: Currency = getCurrency()): string {
  if (currency === 'USD') {
    const usd = kshValue * KSH_TO_USD_RATE;
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
  const suffix = currency === 'USD' ? '/acre' : '/eka';
  return `${formatMoney(kshValue, currency)}${suffix}`;
}

/** Convert KSh to USD (for charts that need raw numbers) */
export function kshToUsd(kshValue: number): number {
  return kshValue * KSH_TO_USD_RATE;
}

/**
 * Compact money formatter for table cells and tight layouts.
 * Produces "KSh 3.4M" / "KSh 250K" / "KSh 1.2B" instead of the full
 * "KES 3,400,000" that `formatMoney` returns.
 *
 * P4: added for the Deal Finder table where column width is limited and
 * the full formatMoney output causes horizontal clipping.
 */
export function formatCompactMoney(kshValue: number, currency: Currency = getCurrency()): string {
  if (!Number.isFinite(kshValue)) return '—';
  if (currency === 'USD') {
    const usd = kshValue * KSH_TO_USD_RATE;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
    return `$${Math.round(usd)}`;
  }
  if (kshValue >= 1_000_000_000) return `KSh ${(kshValue / 1_000_000_000).toFixed(1)}B`;
  if (kshValue >= 1_000_000) return `KSh ${(kshValue / 1_000_000).toFixed(1)}M`;
  if (kshValue >= 1_000) return `KSh ${Math.round(kshValue / 1_000)}K`;
  return `KSh ${Math.round(kshValue)}`;
}

export { USD_TO_KSH_RATE };
