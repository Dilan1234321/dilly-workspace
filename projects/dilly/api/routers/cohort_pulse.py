"""Cohort pulse user-facing APIs."""

from __future__ import annotations

from fastapi import APIRouter, Body, Request

from projects.dilly.api import deps, errors
from projects.dilly.api.cohort_pulse_store import (
    get_current_user_pulse,
    list_user_pulse_history,
    mark_user_pulse_acted,
    mark_user_pulse_seen,
)

router = APIRouter(tags=["cohort_pulse"])


@router.get("/cohort-pulse/current")
async def get_cohort_pulse_current(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    row = get_current_user_pulse(email)
    return row if row else None


@router.patch("/cohort-pulse/{pulse_id}/seen")
async def patch_cohort_pulse_seen(request: Request, pulse_id: str):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    row = mark_user_pulse_seen(email, pulse_id)
    if not row:
        raise errors.not_found("Cohort pulse not found.")
    return {"ok": True, "item": row}


@router.patch("/cohort-pulse/{pulse_id}/acted")
async def patch_cohort_pulse_acted(request: Request, pulse_id: str, body: dict = Body(default={})):
    _ = body
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    row = mark_user_pulse_acted(email, pulse_id)
    if not row:
        raise errors.not_found("Cohort pulse not found.")
    return {"ok": True, "item": row}


@router.get("/cohort-pulse/history")
async def get_cohort_pulse_history(request: Request, limit: int = 8):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    rows = list_user_pulse_history(email, limit=max(1, min(20, int(limit))))
    score_history = [
        {
            "week_start": r.get("week_start"),
            "user_score": r.get("user_score"),
            "cohort_avg_score": (r.get("cohort") or {}).get("cohort_avg_score"),
        }
        for r in rows
    ]
    return {"items": rows, "score_history": score_history, "count": len(rows)}

