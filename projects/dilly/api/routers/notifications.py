"""Notification preferences/history/opened APIs."""

from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Request

from projects.dilly.api import deps, errors
from projects.dilly.api.notification_store import (
    get_preferences,
    update_preferences,
    list_notifications,
    mark_notification_opened,
)

router = APIRouter(tags=["notifications"])


@router.get("/notifications/preferences")
async def get_notification_preferences(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    return get_preferences(email)


@router.patch("/notifications/preferences")
async def patch_notification_preferences(request: Request, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    payload = {
        k: body.get(k)
        for k in ("enabled", "quiet_hours_start", "quiet_hours_end", "timezone")
        if k in (body or {})
    }
    if not payload:
        return get_preferences(email)
    return update_preferences(email, payload)


@router.get("/notifications/history")
async def get_notification_history(request: Request, limit: int = 7):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    limit = max(1, min(50, int(limit)))
    rows = list_notifications(email, limit=limit)
    return {"items": rows, "count": len(rows)}


@router.post("/notifications/opened")
async def post_notification_opened(request: Request, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    notification_id = str((body or {}).get("notification_id") or "").strip()
    if not notification_id:
        raise errors.validation_error("notification_id required.")
    row = mark_notification_opened(email, notification_id)
    if not row:
        raise errors.not_found("Notification not found.")
    return {"ok": True, "item": row}

