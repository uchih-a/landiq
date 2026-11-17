"""Rate limiting for POST /api/v1/predict.

Uses ``slowapi`` (already in requirements.txt) with a custom key function
that respects ``X-Forwarded-For`` behind Railway's proxy, and a custom 429
handler that returns the B0 error body shape (``{error: {code, message,
details, request_id}}``) with a ``Retry-After`` header.

**X-Forwarded-For / client IP determination for Railway:**
Railway runs the app behind a proxy that terminates TLS and forwards the
real client IP in ``X-Forwarded-For``.  Starlette's ``request.client.host``
returns the **proxy's** IP (the immediate connection), not the real client —
so using it as the rate-limit key would collapse all clients into one bucket.
The custom key function below reads ``X-Forwarded-For`` and takes the first
address (the original client), falling back to ``request.client.host`` when
the header is absent (direct connection in local dev / CI).

Railway does NOT set ``X-Real-IP`` (that's an nginx convention); it uses the
standard ``X-Forwarded-For`` header.  This was determined from Railway's
public docs (https://docs.railway.app/deploy/exposing-your-app#headers) and
the fact that the app's own ``request.client.host`` in production logs would
show Railway's internal proxy range, not user IPs.

**Storage:**
In-memory by default (single Railway replica).  When ``REDIS_URL`` is set,
slowapi switches to a shared Redis backend so multiple replicas count
against the same limit.  **Single-replica limitation**: with the default
in-memory storage, deploying 2+ Railway replicas means each replica has its
own counter — a client hitting N replicas gets N× the limit.  Set
``REDIS_URL`` before scaling horizontally.

**Limit justification:**
20 req/min per IP.  B6 measured the live-SHAP path at ~7ms median / ~15ms
first-call (including TreeExplainer construction) — so the cost is not the
latency of a single request but the cumulative CPU burn under load.  20/min
= one prediction every 3 seconds, which is generous for a human user
interacting with the form but blocks scripted scraping at 100+ req/min.
This is a **conservative starting point without production traffic data**;
tune via ``PREDICT_RATE_LIMIT_PER_MINUTE``.
"""

from __future__ import annotations

from typing import Any

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger("app.rate_limit")

REQUEST_ID_HEADER = "x-request-id"


def get_client_ip(request: Request) -> str:
    """Rate-limit key: the real client IP, respecting X-Forwarded-For.

    Railway's proxy sets ``X-Forwarded-For`` with the original client IP as
    the first entry.  We take that first entry (the original client) rather
    than the last (which would be the proxy).  When the header is absent
    (local dev, CI), fall back to ``request.client.host`` (the direct
    connection).

    **Spoofing note**: ``X-Forwarded-For`` can be spoofed by the client.
    Railway's proxy overwrites it on every inbound request, so in production
    the value is trustworthy.  In local dev / CI the header is absent and
    the fallback is used — not a security concern for rate limiting.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # X-Forwarded-For: client, proxy1, proxy2, ... — take the first
        return xff.split(",")[0].strip()
    # Direct connection (no proxy) — use the socket peer
    return get_remote_address(request)


def make_limiter(redis_url: str = "") -> Limiter:
    """Build a slowapi Limiter with the right storage backend.

    When ``redis_url`` is empty, slowapi uses in-memory storage (default).
    When set, it uses a shared Redis backend so multiple Railway replicas
    count against the same limit.
    """
    if redis_url:
        try:
            limiter = Limiter(key_func=get_client_ip, storage_uri=redis_url)
            logger.info(
                "rate_limiter_redis",
                redis_url=redis_url.split("@")[-1] if "@" in redis_url else redis_url,
            )
            return limiter
        except Exception as e:
            logger.warning(
                "rate_limiter_redis_unavailable",
                error=str(e),
                msg="Redis storage init failed — falling back to in-memory",
            )
    return Limiter(key_func=get_client_ip)


# Module-level limiter for the @limiter.limit(...) decorator on routes.
# The actual runtime limiter is set in create_app() via app.state.limiter;
# SlowAPIMiddleware reads app.state.limiter at request time, not decoration
# time, so this module-level instance is just a placeholder for the decorator.
_limiter = Limiter(key_func=get_client_ip)


def get_predict_limit_string() -> str:
    """Callable for slowapi's @limiter.limit(...) — reads the limit from
    settings so it's tunable via PREDICT_RATE_LIMIT_PER_MINUTE without a
    code change."""
    from app.core.config import get_settings

    return f"{get_settings().predict_rate_limit_per_minute}/minute"


# Expose the limiter + limit callable for the predict router
limiter = _limiter
predict_limit = get_predict_limit_string


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom 429 handler — returns the B0 error body shape + Retry-After.

    slowapi's default handler returns a plain-text response; this one returns
    the standard error envelope so the frontend's error handling is uniform.
    """
    request_id = request.headers.get(REQUEST_ID_HEADER, "")
    # slowapi attaches retry info to the exception; extract it defensively.
    retry_after = 60
    limit_str = ""
    if hasattr(exc, "limit") and exc.limit:
        # slowapi's Limit object has a `limit` string attribute (e.g. "20/minute")
        limit_str = str(getattr(exc.limit, "limit", ""))
        # Try to extract the numeric amount for the Retry-After calculation
        try:
            parts = limit_str.split("/")
            if parts:
                retry_after = 60  # default 1 minute window
        except Exception:
            pass
    # Also check for retry_after directly on the exception
    if hasattr(exc, "retry_after") and exc.retry_after:
        import contextlib

        with contextlib.suppress(TypeError, ValueError):
            retry_after = int(exc.retry_after)

    details: dict[str, Any] = {
        "limit": limit_str,
        "scope": "per_client_ip",
        "retry_after_seconds": int(retry_after),
    }
    return JSONResponse(
        status_code=429,
        headers={
            "Retry-After": str(int(retry_after)),
        },
        content={
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": (
                    f"Rate limit exceeded: too many /predict requests. "
                    f"Retry after {int(retry_after)} seconds."
                ),
                "details": details,
                "request_id": request_id,
            }
        },
    )


# Re-export the default handler for non-predict routes (unused now but
# available if a future route needs a simpler 429).
__all__ = [
    "get_client_ip",
    "make_limiter",
    "rate_limit_exceeded_handler",
    "_rate_limit_exceeded_handler",
]
