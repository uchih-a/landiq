/**
 * Safe localStorage wrapper (P8b-J) — the ONE place that touches
 * `window.localStorage`.
 *
 * Why: Safari private mode and storage-disabled browsers THROW on every
 * localStorage access.  The Settings / currency / language / default-county
 * reads previously ran on the render path with a bare
 * `localStorage.getItem(...)` — a throwing access there crashed the page.
 *
 * Every read/write goes through try/catch here.  When the underlying
 * storage is unavailable (throws, or is absent — SSR / jsdom edge
 * cases), the helper falls back to an in-memory Map so set/get/remove
 * still work within the session; the persistence is simply lost.  No
 * consumer needs its own try/catch, and no consumer may call
 * `localStorage` directly (grep-able rule).
 */

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory fallback used only when real storage is unavailable. */
function makeMemoryStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

/** Probe once: real storage when it works, in-memory when it throws. */
function resolveStorage(): KeyValueStorage {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return makeMemoryStorage();
  }
  try {
    // A harmless write+delete probe — in private mode the SETITEM is what
    // throws (getItem alone can succeed), so probe both.
    window.localStorage.setItem('__storage_probe__', '1');
    window.localStorage.removeItem('__storage_probe__');
    return window.localStorage;
  } catch {
    return makeMemoryStorage();
  }
}

const storage = resolveStorage();

/** Read a stored string (null when absent or storage unavailable). */
export function storageGet(key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a stored string (no-op persistence when storage unavailable). */
export function storageSet(key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // In-memory fallback already captured the write; persistence is
    // simply unavailable — never crash the caller.
  }
}

/** Remove a stored key. */
export function storageRemove(key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Same as storageSet — a storage failure must not surface.
  }
}
