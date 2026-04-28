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


@router.get("/memory/graph")
async def get_memory_graph(request: Request):
    """Memory tab data — same items as /memory but enriched with the
    cross-category CONNECTIONS that make the Profile feel like a
    knowledge graph rather than a flat list. This is the surface that
    crystallizes Dilly's positioning: the user's career second-brain.

    Returns:
      - total: total facts
      - categories: count per category
      - clusters: items grouped + ranked by impact-for-resume
      - connections: list of cross-category links Dilly noticed
        (e.g., "Sarah" mentioned in a fact that also mentions "Goldman")
      - growth: counts at d-30 / d-7 / now so the UI can show
        "Dilly knew 12 things about you 30 days ago. Now: 187."
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    surface = get_memory_surface(email)
    items = surface.get("items") or []

    # ── Group by category ──────────────────────────────────────────
    grouped: dict[str, list[dict[str, Any]]] = {}
    for it in items:
        cat = str(it.get("category") or "other")
        grouped.setdefault(cat, []).append(it)

    categories = [
        {"category": cat, "count": len(rows)}
        for cat, rows in sorted(grouped.items(), key=lambda kv: -len(kv[1]))
    ]

    # ── Cross-category connections ─────────────────────────────────
    # Naive but effective: for each pair of items in different
    # categories, if one's label appears in the other's value, mark
    # a connection. This catches "Sarah → Goldman" when the person
    # fact's value is "Sarah from Goldman" or the company fact's
    # value mentions "Sarah". User sees a small "Dilly noticed"
    # callout in the Memory UI that's hard to fake.
    connections: list[dict[str, Any]] = []
    seen_pairs: set[tuple[str, str]] = set()
    for a in items[:200]:
        a_label = (a.get("label") or "").strip()
        a_cat = (a.get("category") or "").lower()
        if not a_label or len(a_label) < 3:
            continue
        a_label_low = a_label.lower()
        for b in items[:200]:
            if b is a:
                continue
            b_cat = (b.get("category") or "").lower()
            if a_cat == b_cat:
                continue
            b_value = (b.get("value") or "").lower()
            b_label = (b.get("label") or "").strip()
            if not b_value or not b_label:
                continue
            if a_label_low in b_value:
                key = (str(a.get("id")), str(b.get("id")))
                rev = (key[1], key[0])
                if key in seen_pairs or rev in seen_pairs:
                    continue
                seen_pairs.add(key)
                connections.append({
                    "from": {"id": a.get("id"), "category": a_cat, "label": a_label},
                    "to": {"id": b.get("id"), "category": b_cat, "label": b_label},
                    "evidence": (b.get("value") or "")[:160],
                })
                if len(connections) >= 30:
                    break
        if len(connections) >= 30:
            break

    # ── Growth: how many facts at d-30, d-7, now ───────────────────
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)

    def _ts(it: dict) -> datetime | None:
        raw = it.get("created_at") or it.get("captured_at") or it.get("ts")
        if not isinstance(raw, str):
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            return None

    count_now = len(items)
    count_7 = sum(1 for it in items if (t := _ts(it)) is not None and t <= d7)
    count_30 = sum(1 for it in items if (t := _ts(it)) is not None and t <= d30)
    # Items without timestamps (legacy) are counted as "always there"
    # for d-30 and d-7 — undercounts growth, conservative on the win.
    untimed = sum(1 for it in items if _ts(it) is None)
    count_7 += untimed
    count_30 += untimed

    return {
        "total": count_now,
        "categories": categories,
        "clusters": grouped,
        "connections": connections,
        "growth": {
            "now": count_now,
            "d7": count_7,
            "d30": count_30,
            "added_last_7d": max(0, count_now - count_7),
            "added_last_30d": max(0, count_now - count_30),
        },
        "narrative": surface.get("narrative"),
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

    # Free-tier cap: 20 manually-added facts per calendar month. We
    # only count items with source=="profile" (manual adds from the
    # My Dilly UI); chat-derived facts are unmetered because the
    # chat quota already gates them.
    try:
        plan = ((get_profile(email) or {}).get("plan") or "starter").lower().strip()
    except Exception:
        plan = "starter"
    if plan == "starter":
        try:
            surface = get_memory_surface(email) or {}
            items = surface.get("items") or []
            now = datetime.now(timezone.utc)
            ym = f"{now.year:04d}-{now.month:02d}"
            def _is_this_month(it):
                ts = str(it.get("created_at") or "")
                return ts.startswith(ym) and (it.get("source") == "profile")
            used = sum(1 for it in items if _is_this_month(it))
            if used >= 20:
                return JSONResponse(
                    content={
                        "detail": {
                            "code": "PLAN_LIMIT_REACHED",
                            "message": "You've added 20 facts this month on the free plan. Upgrade to Dilly for unlimited.",
                            "feature": "Manual adds",
                            "required_plan": "dilly",
                            "used": used,
                            "limit": 20,
                        }
                    },
                    status_code=402,
                )
        except Exception:
            # Fail-open: never block a user because the counter blew up.
            pass

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

