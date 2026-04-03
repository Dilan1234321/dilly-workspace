"""Internal endpoint for asynchronous memory extraction."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from projects.dilly.api.memory_extraction import run_extraction

router = APIRouter(tags=["memory"])


def _require_cron_secret(request: Request) -> None:
    expected = (os.environ.get("CRON_SECRET") or "").strip()
    if not expected:
        from projects.dilly.api import errors

        raise errors.unauthorized("cron secret unavailable")
    supplied = (request.headers.get("x-cron-secret") or request.query_params.get("secret") or "").strip()
    if supplied != expected:
        from projects.dilly.api import errors

        raise errors.unauthorized("invalid cron secret")


@router.post("/internal/memory/extract")
async def internal_memory_extract(request: Request, body: dict = Body(...)):
    _require_cron_secret(request)
    uid = str(body.get("uid") or "").strip().lower()
    conv_id = str(body.get("conv_id") or "").strip()
    messages = body.get("messages") or []
    if not uid or not conv_id or not isinstance(messages, list):
        return JSONResponse(content={"error": "uid, conv_id, messages required"}, status_code=400)
    safe_messages: list[dict[str, Any]] = []
    for row in messages[-12:]:
        if not isinstance(row, dict):
            continue
        role = str(row.get("role") or "").strip().lower()
        content = str(row.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            safe_messages.append({"role": role, "content": content[:1500]})
    result = run_extraction(uid, conv_id, safe_messages)
    return {"items_added": result.get("items_added", 0), "narrative_updated": bool(result.get("narrative_updated"))}

