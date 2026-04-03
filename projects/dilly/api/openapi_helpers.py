"""
OpenAPI helpers: shared error response docs for 4xx/5xx.
Use responses=ERROR_RESPONSES on routes so /docs shows the ErrorResponse envelope.
"""
from projects.dilly.api.schemas import ErrorResponse

ERROR_RESPONSES = {
    400: {"description": "Bad request or validation error", "model": ErrorResponse},
    401: {"description": "Unauthorized (sign in required)", "model": ErrorResponse},
    403: {"description": "Forbidden (e.g. not subscribed)", "model": ErrorResponse},
    404: {"description": "Not found", "model": ErrorResponse},
    429: {"description": "Rate limited", "model": ErrorResponse},
    500: {"description": "Internal error", "model": ErrorResponse},
    503: {"description": "Service unavailable", "model": ErrorResponse},
}
