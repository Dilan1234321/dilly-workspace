"""Internal voice output extraction endpoint (cron/async queue only)."""

from __future__ import annotations

import os

from fastapi import APIRouter, Body, HTTPException

from projects.dilly.api.extract_conversation_outputs import run_extract_outputs

router = APIRouter(prefix="/internal/voice", tags=["voice"])


def _require_internal_secret(token: str) -> None:
    secret = (os.environ.get("CRON_SECRET") or "").strip()
    if not secret or (token or "").strip() != secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


@router.post("/extract-outputs")
async def internal_extract_outputs(body: dict = Body(...), token: str = ""):
    _require_internal_secret(token)
    uid = str(body.get("uid") or "").strip()
    conv_id = str(body.get("conv_id") or "").strip()
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    if not uid or not conv_id or not messages:
        raise HTTPException(status_code=400, detail="uid, conv_id, and messages required.")
    return run_extract_outputs(uid, conv_id, messages)
