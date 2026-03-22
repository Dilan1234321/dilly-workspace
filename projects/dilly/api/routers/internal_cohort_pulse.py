"""Internal cohort pulse generation endpoint (cron only)."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException

from projects.dilly.api.jobs.generate_weekly_pulses import generate_weekly_pulses

router = APIRouter(prefix="/internal/cohort-pulse", tags=["cohort_pulse"])


def _require_internal_secret(token: str) -> None:
    secret = (os.environ.get("CRON_SECRET") or "").strip()
    if not secret or (token or "").strip() != secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


@router.post("/generate")
async def internal_generate_cohort_pulse(token: str = ""):
    _require_internal_secret(token)
    return generate_weekly_pulses()

