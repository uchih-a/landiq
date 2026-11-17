"""Prometheus metrics for the /metrics endpoint (B9).

Exposes:
  - Per-route request latency histogram (``http_request_duration_seconds``)
  - Per-route response status counter (``http_requests_total``) labeled by
    status class (2xx / 4xx / 5xx)
  - Predict-specific instrumentation:
    - ``predict_inference_seconds`` — the model-inference portion (Cell 8.3
      weighted ensemble + Cell 9.1 conformal interval)
    - ``predict_shap_seconds`` — the live-SHAP portion (TreeExplainer +
      shap_values + money-effect combine)
    - ``predict_low_support_total`` — labeled counter for the product signal:
      whether the response carried a low-support/unsupported coverage flag
      (B2), labeled by ``county`` and ``is_low_support``.  This is the
      product signal mentioned in B9's context — how often the model is
      extrapolating beyond its training coverage.

The /metrics endpoint itself is excluded from rate limiting (B7) and from
the request-id middleware's structured log noise (it'll be polled frequently
by a scraper).
"""

from __future__ import annotations

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Histogram,
    generate_latest,
)

# ---- Per-route metrics (all routes) ----
# Buckets tuned for a prediction API: 1ms to 10s.
_LATENCY_BUCKETS = (0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 5.0, 10.0)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency per route",
    labelnames=("method", "route", "status_class"),
    buckets=_LATENCY_BUCKETS,
)

http_requests_total = Counter(
    "http_requests_total",
    "HTTP requests total per route + status class",
    labelnames=("method", "route", "status_class"),
)

# ---- Predict-specific metrics ----
predict_inference_seconds = Histogram(
    "predict_inference_seconds",
    "Model inference time (Cell 8.3 weighted ensemble + Cell 9.1 conformal)",
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

predict_shap_seconds = Histogram(
    "predict_shap_seconds",
    "Live SHAP computation time (TreeExplainer + shap_values + money-effect)",
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

# The product signal: how often /predict returns a low-support/unsupported
# result.  Labeled by county + is_low_support so the dashboard can show
# "what fraction of predictions for <county> are low-support" — a signal
# for where the model is extrapolating beyond its training coverage.
predict_low_support_total = Counter(
    "predict_low_support_total",
    "Predictions flagged as low-support (B2 CoverageWarning), labeled by county",
    labelnames=("county", "is_low_support"),
)


def render_metrics() -> tuple[str, str]:
    """Return (body, content_type) for the /metrics endpoint."""
    return generate_latest().decode("utf-8"), CONTENT_TYPE_LATEST


def status_class(code: int) -> str:
    """2xx / 4xx / 5xx / etc."""
    return f"{code // 100}xx"
