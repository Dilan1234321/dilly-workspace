"""
Central error handling for the Meridian API.
Use these helpers so every error returns a consistent envelope: { error, code, detail, request_id }.
Frontend can branch on `code` for UX (e.g. show "Sign in" for UNAUTHORIZED).
"""
from typing import Any, Optional

from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Stable error codes (frontend can rely on these)
# ---------------------------------------------------------------------------
class ErrorCode:
    VALIDATION = "VALIDATION_ERROR"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    RATE_LIMITED = "RATE_LIMITED"
    CONFLICT = "CONFLICT"
    BAD_REQUEST = "BAD_REQUEST"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    INTERNAL = "INTERNAL_ERROR"
    # HTTP status-based fallback when no code given
    HTTP_400 = "HTTP_400"
    HTTP_401 = "HTTP_401"
    HTTP_403 = "HTTP_403"
    HTTP_404 = "HTTP_404"
    HTTP_429 = "HTTP_429"
    HTTP_500 = "HTTP_500"


def _detail_with_code(code: str, message: str) -> dict:
    """Structured detail so the exception handler can set envelope.code and envelope.error."""
    return {"code": code, "message": message}


def validation_error(message: str, status_code: int = 400) -> HTTPException:
    """Invalid input (missing field, bad format, etc.)."""
    return HTTPException(
        status_code=status_code,
        detail=_detail_with_code(ErrorCode.VALIDATION, message),
    )


def unauthorized(message: str = "Sign in to continue.") -> HTTPException:
    """Not authenticated (no or invalid token)."""
    return HTTPException(
        status_code=401,
        detail=_detail_with_code(ErrorCode.UNAUTHORIZED, message),
    )


def forbidden(message: str = "You don't have access to this.") -> HTTPException:
    """Authenticated but not allowed (e.g. not subscribed)."""
    return HTTPException(
        status_code=403,
        detail=_detail_with_code(ErrorCode.FORBIDDEN, message),
    )


def not_found(message: str = "Not found.") -> HTTPException:
    """Resource doesn't exist or link expired."""
    return HTTPException(
        status_code=404,
        detail=_detail_with_code(ErrorCode.NOT_FOUND, message),
    )


def rate_limited(message: str = "Too many requests. Please wait a minute and try again.") -> HTTPException:
    """Rate limit exceeded."""
    return HTTPException(
        status_code=429,
        detail=_detail_with_code(ErrorCode.RATE_LIMITED, message),
    )


def conflict(message: str) -> HTTPException:
    """Conflict (e.g. duplicate, invalid state)."""
    return HTTPException(
        status_code=409,
        detail=_detail_with_code(ErrorCode.CONFLICT, message),
    )


def bad_request(message: str) -> HTTPException:
    """Generic bad request when validation_error doesn't fit."""
    return HTTPException(
        status_code=400,
        detail=_detail_with_code(ErrorCode.BAD_REQUEST, message),
    )


def service_unavailable(message: str) -> HTTPException:
    """External service failed (e.g. email send)."""
    return HTTPException(
        status_code=503,
        detail=_detail_with_code(ErrorCode.SERVICE_UNAVAILABLE, message),
    )


def internal(message: str = "Something went wrong. Please try again.") -> HTTPException:
    """Unhandled server error (log and return generic message)."""
    return HTTPException(
        status_code=500,
        detail=_detail_with_code(ErrorCode.INTERNAL, message),
    )


def http_exception(status_code: int, message: str, code: Optional[str] = None) -> HTTPException:
    """Raise with a specific status and optional stable code."""
    return HTTPException(
        status_code=status_code,
        detail=_detail_with_code(code or f"HTTP_{status_code}", message),
    )


def is_structured_detail(detail: Any) -> bool:
    """True if detail is our { code, message } shape so handler can use it."""
    return isinstance(detail, dict) and "code" in detail and "message" in detail


def get_message(detail: Any) -> str:
    """Extract user-facing message from HTTPException.detail."""
    if is_structured_detail(detail):
        return detail.get("message") or str(detail)
    return str(detail) if detail is not None else ""


def get_code(detail: Any, status_code: int) -> str:
    """Extract stable code from HTTPException.detail, or derive from status."""
    if is_structured_detail(detail):
        return detail.get("code") or f"HTTP_{status_code}"
    return f"HTTP_{status_code}"
