/**
 * Last-estimate store (P6b problem G — the "One estimate" mode).
 *
 * A tiny module-level store that keeps the LAST successful /predict
 * response together with the request that produced it (plus the place
 * name and timestamp from the client context, which the response itself
 * does not carry).  The Explainability screen's "One estimate" mode
 * renders this estimate's drivers by reusing the Predictor's
 * DriversList; without a stored estimate it shows an empty state with a
 * link to the Predictor.
 *
 * Persistence: sessionStorage (cleared when the browser session ends —
 * exactly the lifetime the brief specifies).  Every storage access is
 * wrapped in try/catch: Safari private mode and storage-disabled browsers
 * throw on access, and a storage failure must never crash the app — the
 * store then simply behaves as empty / write-only.
 *
 * This is a UI-side cache of a backend response — no values are invented
 * here; consumers read the stored request/response verbatim.
 */
import { useSyncExternalStore } from 'react';

import type { PredictRequest, PredictResponse } from '@/lib/api/types';

/** What the store keeps for one estimate. */
export interface StoredEstimate {
  /** The request body exactly as POSTed to /predict. */
  request: PredictRequest;
  /** The successful /predict response, verbatim. */
  response: PredictResponse;
  /** Place name from the Predictor's selected search result (null when the
   *  user dragged the pin / the name is unavailable).  Client context —
   *  the response does not carry it. */
  placeName: string | null;
  /** ISO timestamp of when the estimate succeeded (client clock). */
  createdAt: string;
}

const STORAGE_KEY = 'lastEstimate';

// ---- Module-level store -------------------------------------------------

let cached: StoredEstimate | null = null;
let initialised = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // A broken listener must never break the store.
    }
  }
}

function readStorage(): StoredEstimate | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEstimate;
    if (parsed && typeof parsed === 'object' && parsed.request && parsed.response) {
      return parsed;
    }
    return null;
  } catch {
    // Storage unavailable / quota / parse failure -> treat as empty.
    return null;
  }
}

function writeStorage(value: StoredEstimate | null): void {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    // Storage throwing (private mode / disabled) — in-memory state still
    // updates; the "session-lifetime" persistence is simply unavailable.
  }
}

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;
  cached = readStorage();
}

/** Store the last successful estimate (called from the Predictor's
 *  mutation onSuccess).  Safe against storage failures. */
export function saveLastEstimate(estimate: StoredEstimate): void {
  ensureInitialised();
  cached = estimate;
  writeStorage(estimate);
  emit();
}

/** Clear the stored estimate (e.g. tests, or an explicit "forget"). */
export function clearLastEstimate(): void {
  ensureInitialised();
  cached = null;
  writeStorage(null);
  emit();
}

function subscribe(listener: () => void): () => void {
  ensureInitialised();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StoredEstimate | null {
  ensureInitialised();
  return cached;
}

/** React hook — the current stored estimate (null when none).  Uses
 *  useSyncExternalStore so every save re-renders live consumers. */
export function useLastEstimate(): StoredEstimate | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function getServerSnapshot(): StoredEstimate | null {
  // SSR: nothing is stored server-side.
  return null;
}
