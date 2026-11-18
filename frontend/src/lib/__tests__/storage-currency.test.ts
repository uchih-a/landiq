/**
 * P8b-J storage + currency store tests.
 *
 * (c) A localStorage that THROWS on every access must not crash any of
 *     the three consumers (storage helper, currency store, language
 *     init) — the helper falls back to in-memory storage and everything
 *     keeps working within the session.
 *
 * The throw-probe runs when the module is FIRST imported, so each case
 * uses vi.resetModules() + a fresh dynamic import with a poisoned
 * window.localStorage installed beforehand.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The ORIGINAL localStorage descriptor, captured before any poisoning. */
const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

/** A storage implementation that throws on every access (private mode). */
function poisonLocalStorage() {
  const throwing = {
    get length() {
      throw new Error('SecurityError');
    },
    clear() {
      throw new Error('SecurityError');
    },
    getItem() {
      throw new Error('SecurityError');
    },
    key() {
      throw new Error('SecurityError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('SecurityError');
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => throwing,
  });
}

function restoreLocalStorage() {
  // Re-install the original descriptor captured before any poisoning.
  if (originalDescriptor) {
    Object.defineProperty(window, 'localStorage', originalDescriptor);
  }
}

afterEach(() => {
  restoreLocalStorage();
  vi.resetModules();
  window.localStorage.clear();
});

describe('P8b-J: safe storage under a throwing localStorage', () => {
  it('(c) the storage helper works (in-memory) instead of crashing', async () => {
    poisonLocalStorage();
    const { storageGet, storageSet, storageRemove } = await import('@/lib/storage');
    expect(() => storageSet('k', 'v')).not.toThrow();
    expect(storageGet('k')).toBe('v');
    expect(() => storageRemove('k')).not.toThrow();
    expect(storageGet('k')).toBeNull();
    expect(storageGet('never-set')).toBeNull();
  });

  it('(c) the currency store works without crashing (and keeps KSh)', async () => {
    poisonLocalStorage();
    const { getCurrency, setCurrency, setFxFromMeta, formatMoney } = await import(
      '@/lib/currency/format'
    );
    expect(getCurrency()).toBe('KSH');
    expect(() => setCurrency('USD')).not.toThrow();
    expect(getCurrency()).toBe('USD');
    // No rate configured -> USD renders as KSh (honest display fallback).
    setFxFromMeta(null);
    expect(formatMoney(1_000, 'USD')).toMatch(/Ksh|KSh/i);
    // With a rate, USD converts by it.
    setFxFromMeta({ ksh_per_usd: 100, as_of: null, source: null });
    expect(formatMoney(1_000, 'USD')).toContain('$10');
    // back to KSh for later tests
    setCurrency('KSH');
  });

  it('(c) the language init does not crash (i18n still initialises)', async () => {
    poisonLocalStorage();
    // i18n init reads storageGet('lang') at import — with poisoned
    // storage that returns null and the default language applies.
    const mod = await import('@/lib/i18n');
    expect(mod.default.language).toBe('en');
    expect(mod.default.t('nav.overview')).toBe('Overview');
  });
});

describe('P8b-J: storage with working localStorage (sanity)', () => {
  it('persists across reads within the session', async () => {
    restoreLocalStorage();
    const { storageGet, storageSet, storageRemove } = await import('@/lib/storage');
    storageSet('lang', 'sw');
    expect(storageGet('lang')).toBe('sw');
    storageRemove('lang');
    expect(storageGet('lang')).toBeNull();
  });
});
