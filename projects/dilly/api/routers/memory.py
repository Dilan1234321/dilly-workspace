"""Memory surface APIs for user-facing routes."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from projects.dilly.api import deps
from projects.dilly.api.audit_history import get_audits
from projects.dilly.api.memory_extraction import regenerate_narrative
from projects.dilly.api.memory_surface_store import (
    add_memory_item,
    delete_memory_item,
    get_memory_surface,
    get_session_capture,
    mark_items_seen,
    save_memory_surface,
    update_memory_item,
)
from projects.dilly.api.profile_store import get_profile

router = APIRouter(tags=["memory"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _relative_label(ts: str | None) -> str:
    if not ts:
        return "Never"
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return "Recently"
    delta = datetime.now(timezone.utc) - dt
    if delta.total_seconds() < 3600:
        mins = max(1, int(delta.total_seconds() // 60))
        return f"{mins}m ago"
    if delta.total_seconds() < 86400:
        hours = max(1, int(delta.total_seconds() // 3600))
        return f"{hours}h ago"
    days = int(delta.total_seconds() // 86400)
    return "Yesterday" if days == 1 else f"{days}d ago"


@router.get("/memory")
async def get_memory(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    surface = get_memory_surface(email)
    items = surface.get("items") or []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        cat = str(item.get("category") or "other")
        grouped.setdefault(cat, []).append(item)
    return {
        "narrative": surface.get("narrative"),
        "narrative_updated_at": surface.get("narrative_updated_at"),
        "narrative_updated_relative": _relative_label(surface.get("narrative_updated_at")),
        "items": items,
        "grouped": grouped,
    }


@router.post("/memory/items")
async def create_memory_item(request: Request, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    category = str(body.get("category") or "").strip()
    label = str(body.get("label") or "").strip()
    value = str(body.get("value") or "").strip()
    if not category or not label or not value:
        return JSONResponse(content={"error": "category, label, value required"}, status_code=400)
    row = add_memory_item(
        email,
        {
            "category": category,
            "label": label,
            "value": value,
            "source": "profile",
            "confidence": "high",
            "shown_to_user": True,
        },
    )
    if not row:
        return JSONResponse(content={"error": "invalid memory item"}, status_code=400)
    return {"item": row}


@router.patch("/memory/items/mark-seen")
async def patch_memory_mark_seen(request: Request, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    ids = body.get("item_ids") or []
    if not isinstance(ids, list):
        return JSONResponse(content={"error": "item_ids must be array"}, status_code=400)
    changed = mark_items_seen(email, [str(x) for x in ids])
    return {"updated": changed}


@router.patch("/memory/items/{item_id}")
async def patch_memory_item(item_id: str, request: Request, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    patch = {
        "label": body.get("label"),
        "value": body.get("value"),
    }
    row = update_memory_item(email, item_id, patch)
    if not row:
        return JSONResponse(content={"error": "not found"}, status_code=404)
    return {"item": row}


@router.delete("/memory/items/{item_id}")
async def remove_memory_item(item_id: str, request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    ok = delete_memory_item(email, item_id)
    return {"deleted": ok}


@router.get("/memory/session-capture/{conv_id}")
async def get_memory_session_capture(conv_id: str, request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    cap = get_session_capture(email, conv_id)
    if not cap:
        return {"capture": None}
    items_by_id = {str(i.get("id")): i for i in get_memory_surface(email).get("items") or []}
    item_ids = [str(x) for x in (cap.get("items_added") or [])]
    cap_items = [items_by_id[x] for x in item_ids if x in items_by_id]
    return {"capture": {**cap, "items": cap_items}}


@router.post("/memory/regenerate-narrative")
async def post_memory_regenerate_narrative(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    profile = get_profile(email) or {}
    surface = get_memory_surface(email)
    items = surface.get("items") or []

    # Per-user rate limit: once per hour.
    key = "dilly_narrative_regen_requested_at"
    now = time.time()
    last_raw = profile.get(key)
    try:
        last_ts = float(last_raw)
    except Exception:
        last_ts = 0.0
    if now - last_ts < 3600:
        return JSONResponse(content={"error": "rate_limited"}, status_code=429)

    latest_audit = (get_audits(email) or [None])[0]
    peer_percentile = None
    try:
        percs = (latest_audit or {}).get("peer_percentiles") or {}
        vals = [percs.get("smart"), percs.get("grit"), percs.get("build")]
        nums = [float(v) for v in vals if isinstance(v, (int, float))]
        if nums:
            peer_percentile = int(round(max(1, min(100, 100 - (sum(nums) / len(nums))))))
    except Exception:
        peer_percentile = None
    narrative = regenerate_narrative(profile, items, latest_audit, peer_percentile)
    if not narrative:
        return JSONResponse(content={"error": "narrative_unavailable"}, status_code=500)
    save_memory_surface(email, narrative=narrative, narrative_updated_at=_now_iso())
    from projects.dilly.api.profile_store import save_profile

    save_profile(email, {key: now})
    return {"narrative": narrative}

