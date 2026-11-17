"""Structured JSON logging via structlog.

In production every log line is a single JSON object so that Railway's
log drain (or any log aggregator) can parse fields without regex.
In development the output is pretty-printed for readability.
"""

from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(log_level: str, json_output: bool = True) -> None:
    """Configure structlog + stdlib logging once at startup.

    Parameters
    ----------
    log_level : str
        e.g. ``"DEBUG"``, ``"INFO"``.
    json_output : bool
        ``True`` in production (JSON lines), ``False`` in development (console).
    """
    # Shared processors (add_logger_name requires stdlib LoggerFactory, not PrintLogger)
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if json_output:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Route stdlib logging through structlog so uvicorn / starlette logs
    # are also structured.
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(message)s",
        stream=sys.stdout,
        force=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Return a bound logger."""
    return structlog.get_logger(name)
