"""Cross-cutting middleware: request-id injection, structured access logs,
and Prometheus metrics recording (B9)."""

from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger
from app.core.metrics import http_request_duration_seconds, http_requests_total, status_class

logger = get_logger("app.middleware")

# Header name used for both accepting an upstream id and returning it
REQUEST_ID_HEADER = "x-request-id"

# Paths excluded from the structured access log (polled frequently by a scraper,
# would flood the logs — B9).
_LOG_EXCLUDED_PATHS = {"/metrics", "/health"}


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Ensure every request has an ``x-request-id``.

    If the incoming request already carries one (from an API gateway or
    load balancer) it is reused; otherwise a fresh UUID4 is generated.
    The id is placed in the response header and in the structlog context
    so it appears in every structured log line for that request.

    Also records Prometheus metrics (per-route latency + status counter) for
    every request — this is the single instrumentation point that covers all
    routes uniformly.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())

        # Bind to structlog context so all logs for this request carry the id
        from structlog import contextvars

        contextvars.bind_contextvars(request_id=request_id)

        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id

        # Duration
        process_time_ms = (
            (time.perf_counter() - request.state._start_time) * 1000
            if hasattr(request.state, "_start_time")
            else 0
        )

        # ---- Prometheus metrics (B9) ----
        # Use the matched route template (e.g. "/api/v1/counties/{county}/listings")
        # rather than the raw path so high-cardinality paths don't explode the
        # label space.  Fall back to the raw path when there's no route match
        # (404s, /metrics itself).
        route = request.url.path
        scope = request.scope
        if "route" in scope and hasattr(scope["route"], "path"):
            route = scope["route"].path
        sclass = status_class(response.status_code)
        http_request_duration_seconds.labels(
            method=request.method,
            route=route,
            status_class=sclass,
        ).observe(process_time_ms / 1000.0)
        http_requests_total.labels(
            method=request.method,
            route=route,
            status_class=sclass,
        ).inc()

        # Structured access log — skip /metrics + /health to avoid log flooding
        if request.url.path not in _LOG_EXCLUDED_PATHS:
            logger.info(
                "request",
                method=request.method,
                path=request.url.path,
                route=route,
                status_code=response.status_code,
                duration_ms=round(process_time_ms, 2),
            )

        contextvars.unbind_contextvars("request_id")
        return response


class TimingMiddleware(BaseHTTPMiddleware):
    """Record the start time so RequestIDMiddleware can log duration + record metrics."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request.state._start_time = time.perf_counter()
        return await call_next(request)
