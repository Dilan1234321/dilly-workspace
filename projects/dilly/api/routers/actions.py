"""Action item APIs."""

from __future__ import annotations

from fastapi import APIRouter, Body, Request

from projects.dilly.api import deps, errors
from projects.dilly.api.conversation_output_store import (
    count_undone_actions,
    list_active_actions,
    list_completed_actions,
    update_action,
)

router = APIRouter(tags=["voice"])


@router.get("/actions")
async def get_actions(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    undone = list_active_actions(email)
    completed = list_completed_actions(email, days=14)
    return {"undone": undone, "completed": completed}


@router.get("/actions/count")
async def get_actions_count(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    return {"undone": count_undone_actions(email)}


@router.patch("/actions/{action_id}")
async def patch_action(request: Request, action_id: str, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    patch = {
        k: body.get(k)
        for k in ("done", "done_at", "dismissed", "snoozed_until", "acted", "acted_at")
        if k in body
    }
    if not patch:
        raise errors.validation_error("No valid patch fields.")
    row = update_action(email, action_id, patch)
    if not row:
        raise errors.not_found("Action item not found.")
    return {"ok": True, "item": row}

