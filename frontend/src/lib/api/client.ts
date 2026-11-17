/**
 * Typed HTTP client for the Kenya Land Valuation API.
 *
 * Single entry point used by every React Query hook in `hooks.ts`. Wraps
 * `fetch` with:
 *
 *  - Base URL resolution from `import.meta.env.VITE_API_BASE_URL`
 *    (falls back to `/api/v1` so a same-origin deployment with the
 *    Caddyfile gateway works without an env var).
 *  - `get<T>` and `post<T>` methods with the response typed by the caller.
 *  - Standard error parsing — every non-2xx response is surfaced as an
 *    `ApiError` (or `RateLimitError` on HTTP 429), so the UI's error
 *    handling is uniform across resources.
 *  - `Retry-After` header parsing for 429 responses — the client reads the
 *    header (seconds form only; the HTTP-date form is treated as the
 *    default 60s) and stores it on the `RateLimitError` as
 *    `retryAfterSeconds` so screens can render "try again in N seconds".
 *
 * The backend's error body shape lives in `app/core/exceptions.py` —
 * `{error: {code, message, details, request_id}}`. The 429 handler in
 * `app/core/rate_limit.py` is the only one that emits a `Retry-After`
 * header (slowapi's window).
 */

import { ApiError, RateLimitError } from './error';
import type { ApiErrorBody } from './types';

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

/** Default retry-after (seconds) when the header is absent or unparseable. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

/**
 * Parse the `Retry-After` header.
 *
 * RFC 7231 allows two forms:
 *   1. delta-seconds (a non-negative integer) — what slowapi emits.
 *   2. HTTP-date (e.g. "Wed, 21 Oct 2015 07:28:00 GMT").
 *
 * The backend only ever emits the integer form, so we attempt integer
 * parsing first. If the header is an HTTP-date we fall back to computing
 * the difference from `Date.now()`; if that yields a non-positive number
 * (the date is in the past) we fall back to the default 60s. A missing
 * or malformed header also falls back to the default.
 */
function parseRetryAfter(headerValue: string | null): number {
  if (!headerValue) return DEFAULT_RETRY_AFTER_SECONDS;

  const trimmed = headerValue.trim();
  if (trimmed === '') return DEFAULT_RETRY_AFTER_SECONDS;

  // Integer (delta-seconds) form.
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
  }

  // HTTP-date form — compute seconds from now.
  const target = Date.parse(trimmed);
  if (Number.isFinite(target)) {
    const diff = Math.ceil((target - Date.now()) / 1000);
    return diff > 0 ? diff : DEFAULT_RETRY_AFTER_SECONDS;
  }

  return DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * Build a sentinel error body when the backend response isn't valid JSON
 * or doesn't match the B0 envelope (e.g. a gateway timeout from Caddy
 * returning HTML). Keeps the public contract uniform: every thrown error
 * is an `ApiError` with `code`/`message`/`details`/`requestId`.
 */
function synthesizeErrorBody(
  status: number,
  raw: unknown,
  request_id: string,
): ApiErrorBody {
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { error?: unknown }).error === 'object' &&
    (raw as { error: Record<string, unknown> }).error !== null
  ) {
    // Already conforms to the B0 envelope — return as-is (the type assertion
    // is sound because the client only reads `.error.{code,message,...}`
    // which all default to string/empty if a field is missing).
    const err = (raw as { error: Record<string, unknown> }).error;
    return {
      error: {
        code: typeof err.code === 'string' ? err.code : `HTTP_${status}`,
        message:
          typeof err.message === 'string'
            ? err.message
            : `Request failed with status ${status}`,
        details:
          err.details && typeof err.details === 'object'
            ? (err.details as Record<string, unknown>)
            : {},
        request_id:
          typeof err.request_id === 'string' ? err.request_id : request_id,
      },
    };
  }

  // Non-JSON or unexpected shape — synthesize a uniform body.
  let message = `Request failed with status ${status}`;
  if (typeof raw === 'string' && raw.length > 0) {
    message = raw.slice(0, 500);
  }
  return {
    error: {
      code: `HTTP_${status}`,
      message,
      details: { raw },
      request_id,
    },
  };
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // strip trailing slash
  }

  /** GET a JSON resource. Throws `ApiError` (or `RateLimitError`) on non-2xx. */
  async get<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    return this.handleResponse<T>(res);
  }

  /** POST a JSON body. Throws `ApiError` (or `RateLimitError`) on non-2xx. */
  async post<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(res);
  }

  /**
   * Inspect a fetch Response: on 2xx, parse JSON as T; on 429, throw
   * `RateLimitError` (with the parsed `Retry-After`); on any other non-2xx,
   * throw `ApiError` carrying the B0 envelope.
   */
  private async handleResponse<T>(res: Response): Promise<T> {
    if (res.ok) {
      // 204 No Content / empty bodies — coerce to `null as T` so callers
      // that know they're hitting an empty-returning endpoint can type T
      // as `void | null` without a JSON parse error.
      if (res.status === 204) return null as T;
      const text = await res.text();
      if (text === '') return null as T;
      return JSON.parse(text) as T;
    }

    const raw = await this.safeReadBody(res);
    const requestId =
      res.headers.get('x-request-id') ??
      (raw &&
      typeof raw === 'object' &&
      typeof (raw as { error?: { request_id?: string } }).error?.request_id ===
        'string'
        ? (raw as { error: { request_id: string } }).error.request_id
        : '');

    if (res.status === 429) {
      const body = synthesizeErrorBody(res.status, raw, requestId);
      const retryAfterSeconds = parseRetryAfter(res.headers.get('retry-after'));
      throw new RateLimitError(body, retryAfterSeconds);
    }

    const body = synthesizeErrorBody(res.status, raw, requestId);
    throw new ApiError(res.status, body);
  }

  /**
   * Read the response body as JSON when possible, falling back to text,
   * then null. Never throws — used only for building error context, where
   * a thrown parse error would mask the real network failure.
   */
  private async safeReadBody(res: Response): Promise<unknown> {
    try {
      return await res.clone().json();
    } catch {
      try {
        return await res.text();
      } catch {
        return null;
      }
    }
  }
}

export const apiClient = new ApiClient();
