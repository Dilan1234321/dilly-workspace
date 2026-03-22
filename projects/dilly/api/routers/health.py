"""
Health check for dashboards and load balancers.
"""
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health", summary="Health check")
def health():
    """Confirm backend is reachable. Used by dashboard 'Test Connection' and health probes."""
    return {"status": "ok", "backend": "Dilly API"}
