"""Internal cron endpoint for ReadyCheck follow-ups."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from projects.dilly.api.jobs.ready_check_followups import run_ready_check_follow_ups

router = APIRouter(prefix="/internal/ready-check", tags=["ready_check"])


def _require_internal_secret(token: str) -> None:
    secret = (os.environ.get("CRON_SECRET") or "").strip()
    if not secret or (token or "").strip() != secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


@router.post("/follow-ups")
async def internal_ready_check_followups(token: str = ""):
    _require_internal_secret(token)
    return run_ready_check_follow_ups()

