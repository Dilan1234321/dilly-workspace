"""Internal endpoints for Dilly agent intent detection/execution/confirmation."""

from __future__ import annotations

import os
from datetime import date

from fastapi import APIRouter, Body, HTTPException

from projects.dilly.api.dilly_agent.detect_intents import detect_intents
from projects.dilly.api.dilly_agent.execute_action import execute_action
from projects.dilly.api.dilly_agent.execute_intents import execute_intents
from projects.dilly.api.dilly_agent.pending_confirmations import (
    get_active_pending_confirmation,
    resolve_pending_confirmation,
)
from projects.dilly.api.profile_store import get_profile
from projects.dilly.api.routers.applications import _load_applications
from projects.dilly.api.conversation_output_store import list_actions

router = APIRouter(prefix="/internal/voice", tags=["voice"])


def _require_cron_secret(token: str) -> None:
    secret = (os.environ.get("CRON_SECRET") or "").strip()
    if not secret or (token or "").strip() != secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


@router.post("/detect-intents")
async def internal_detect_intents(body: dict = Body(...), token: str = ""):
    _require_cron_secret(token)
    uid = str(body.get("uid") or "").strip().lower()
    message = str(body.get("message") or "").strip()
    if not uid or not message:
        raise HTTPException(status_code=400, detail="uid and message required.")
    today = body.get("today") or date.today().isoformat()
    conv_history = body.get("conversation_history") if isinstance(body.get("conversation_history"), list) else []
    profile = get_profile(uid) or {}
    deadlines = profile.get("deadlines") if isinstance(profile.get("deadlines"), list) else []
    applications = _load_applications(uid)
    actions = list_actions(uid)
    intents = detect_intents(message, today, profile, conv_history, deadlines, applications, actions)
    return {"intents": intents}


@router.post("/execute-intents")
async def internal_execute_intents(body: dict = Body(...), token: str = ""):
    _require_cron_secret(token)
    uid = str(body.get("uid") or "").strip().lower()
    conv_id = str(body.get("conv_id") or "").strip()
    intents = body.get("intents") if isinstance(body.get("intents"), list) else []
    if not uid or not conv_id:
        raise HTTPException(status_code=400, detail="uid and conv_id required.")
    profile = get_profile(uid) or {}
    results = execute_intents(intents, uid, conv_id, date.today(), profile)
    return {"results": results}


@router.post("/resolve-confirmation")
async def internal_resolve_confirmation(body: dict = Body(...), token: str = ""):
    _require_cron_secret(token)
    uid = str(body.get("uid") or "").strip().lower()
    conv_id = str(body.get("conv_id") or "").strip()
    resolution = str(body.get("resolution") or "").strip().lower()
    if not uid or not conv_id or resolution not in {"confirmed", "denied"}:
        raise HTTPException(status_code=400, detail="uid, conv_id and valid resolution required.")
    active = get_active_pending_confirmation(uid, conv_id)
    if not active:
        return {"result": None}
    resolved = resolve_pending_confirmation(uid, str(active.get("id") or ""), resolution)
    if not resolved:
        return {"result": None}
    if resolution == "confirmed":
        intent = resolved.get("intent") if isinstance(resolved.get("intent"), dict) else {}
        action = str(intent.get("action") or "").strip().upper()
        extracted = intent.get("extracted_data") if isinstance(intent.get("extracted_data"), dict) else {}
        out = execute_action(action, extracted, uid, conv_id=conv_id, confirmed=True)
        return {"result": {"action": action, "status": "executed", "result": out}}
    return {"result": {"action": str((resolved.get("intent") or {}).get("action") or ""), "status": "skipped"}}


@router.get("/pending-confirmation/{conv_id}")
async def internal_pending_confirmation(conv_id: str, uid: str, token: str = ""):
    _require_cron_secret(token)
    user_id = str(uid or "").strip().lower()
    if not user_id:
        raise HTTPException(status_code=400, detail="uid required.")
    row = get_active_pending_confirmation(user_id, conv_id)
    return {"pending_confirmation": row}

