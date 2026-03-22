"""Internal notification-run endpoint (cron only)."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from projects.dilly.api.jobs.daily_notifications import run_daily_notifications

router = APIRouter(prefix="/internal/notifications", tags=["notifications"])


def _require_internal_secret(token: str) -> None:
    secret = (os.environ.get("CRON_SECRET") or "").strip()
    if not secret or (token or "").strip() != secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


@router.post("/daily-run")
async def internal_daily_run(token: str = ""):
    _require_internal_secret(token)
    return run_daily_notifications()

