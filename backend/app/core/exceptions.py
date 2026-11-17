"""Standardised error model and exception handlers.

Every error response — whether from a raised ``AppError``, a validation
422, or an unhandled 500 — uses the same JSON body shape:

    {
        "error": {
            "code": "RESOURCE_NOT_FOUND",
            "message": "Artifact file not found",
            "details": {"filename": "xgb_model.json"},
            "request_id": "abc-123"
        }
    }
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Base application error with an HTTP status and machine-readable code."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 500,
        details: dict[str, Any] | None = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


class ArtifactNotLoadedError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(
            code="ARTIFACT_NOT_LOADED",
            message=message,
            status_code=503,
            details=details or {},
        )


def _error_body(
    request: Request,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the standard error envelope, pulling request_id from headers."""
    request_id = request.headers.get("x-request-id", "")
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "request_id": request_id,
        }
    }


def register_exception_handlers(app: FastAPI) -> None:
    """Wire all exception handlers onto the FastAPI app."""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(request, exc.code, exc.message, exc.details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(
                request,
                code=f"HTTP_{exc.status_code}",
                message=str(exc.detail),
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Pydantic v2 includes the original ValueError/TypeError instance in
        # each error's ``ctx`` when a field_validator raises.  ``json.dumps``
        # cannot serialise those, so we stringify the ctx up-front (this is
        # what FastAPI's own default handler does via jsonable_encoder).
        errors = []
        for err in exc.errors():
            ctx = err.get("ctx")
            if ctx and isinstance(ctx, dict):
                err = {**err, "ctx": {k: str(v) for k, v in ctx.items()}}
            errors.append(err)
        return JSONResponse(
            status_code=422,
            content=_error_body(
                request,
                code="VALIDATION_ERROR",
                message="Request validation failed",
                details={"errors": errors},
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        # Log the full traceback; the client only sees a generic message
        from app.core.logging import get_logger

        logger = get_logger("app.errors")
        logger.error("unhandled_exception", error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content=_error_body(
                request,
                code="INTERNAL_ERROR",
                message="An unexpected error occurred",
            ),
        )
