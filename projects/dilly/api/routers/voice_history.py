"""Voice conversation history APIs."""

from __future__ import annotations

from fastapi import APIRouter, Request

from projects.dilly.api import deps, errors
from projects.dilly.api.conversation_output_store import (
    get_conversation_output,
    list_conversation_outputs,
)

router = APIRouter(tags=["voice"])


@router.get("/voice/history")
async def get_voice_history(request: Request, limit: int = 30, search: str = ""):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    items = list_conversation_outputs(email, limit=max(1, min(200, int(limit))), search=str(search or ""))
    return {"items": items, "count": len(items)}


@router.get("/voice/history/{conv_id}")
async def get_voice_history_detail(request: Request, conv_id: str):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    row = get_conversation_output(email, conv_id)
    if not row:
        raise errors.not_found("Conversation output not found.")
    return row
