"""GET /metrics — Prometheus text format endpoint (B9).

Exposes the metrics collected by the middleware + predict-specific
instrumentation.  Excluded from rate limiting (B7) and from the request-id
middleware's structured log noise (polled frequently by a scraper).

Format: Prometheus text format — the standard default.  Railway's hosting
doesn't impose a different format; Prometheus text format is scrapeable by
any standard monitoring stack (Railway's own metrics, Grafana, VictoriaMetrics,
etc.).  No external SaaS APM dependency added — the person decides whether to
wire a dashboard on top later.
"""

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from app.core.metrics import render_metrics

router = APIRouter(tags=["metrics"])


@router.get("/metrics", include_in_schema=False)
async def metrics() -> PlainTextResponse:
    """Prometheus text format metrics for scraping."""
    body, content_type = render_metrics()
    return PlainTextResponse(content=body, media_type=content_type)
