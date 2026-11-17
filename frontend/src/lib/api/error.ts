/**
 * Error model for the Kenya Land Valuation API client.
 *
 * Mirrors the backend's standard error body shape (B0's
 * `app/core/exceptions.py:_error_body`):
 *
 *     {
 *       "error": {
 *         "code": "DATA_UNAVAILABLE",
 *         "message": "Artifact file not found",
 *         "details": { ... },
 *         "request_id": "abc-123"
 *       }
 *     }
 *
 * Two concrete classes:
 * - `ApiError`        — every non-2xx response with a parseable body.
 * - `RateLimitError`  — HTTP 429 specifically. Subclass of ApiError, but
 *                       also exposes `retryAfterSeconds` (parsed from the
 *                       `Retry-After` header by the client) so the UI can
 *                       surface "try again in N seconds" without re-parsing.
 *
 * Why a class hierarchy (rather than a discriminated union):
 *   the rest of the app needs `error instanceof RateLimitError` checks to
 *   short-circuit the generic "Something went wrong" fallback into the
 *   specialized "Too many requests" copy — a union + switch is more
 *   verbose at every call site.
 */

import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;
  requestId: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
    this.requestId = body.error.request_id;
  }
}

export class RateLimitError extends ApiError {
  retryAfterSeconds: number;

  constructor(body: ApiErrorBody, retryAfterSeconds: number) {
    super(429, body);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
