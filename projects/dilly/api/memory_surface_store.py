"""Storage helpers for Dilly memory surface fields in profile.json."""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any

from projects.dilly.api.profile_store import get_profile, save_profile

_MEMORY_CATEGORIES = {
    # Career-specific (original)
    "target_company",
    "concern",
    "mentioned_but_not_done",
    "person_to_follow_up",
    "deadline",
    "achievement",
    "preference",
    "goal",
    "rejection",
    "interview",
    "strength",
    "weakness",
    # Expanded — Dilly Profiles: know the user beyond their resume
    "hobby",                 # interests, sports, activities outside career
    "personality",           # communication style, work preferences, thinking style
    "soft_skill",            # teamwork, leadership style, conflict resolution
    "life_context",          # family, financial constraints, location preferences, background
    "motivation",            # what drives them, why they chose their field
    "challenge",             # obstacles, struggles, things holding them back
    "project_detail",        # specific details about projects not on resume
    "skill_unlisted",        # skills mentioned in conversation but not on resume
    "company_culture_pref",  # what kind of workplace they want
    "availability",          # when they can start, schedule constraints
}

_MEMORY_ACTIONS = {
    "open_am_i_ready",
    "open_bullet_practice",
    "open_interview_prep",
    "open_templates",
    "open_calendar",
    "open_career_hub",
    "open_voice",
    "open_certifications",
    "open_ats",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_memory_item(email: str, raw: dict[str, Any]) -> dict[str, Any] | None:
    category = str(raw.get("category") or "").strip()
    label = str(raw.get("label") or "").strip()
    value = str(raw.get("value") or "").strip()
    if category not in _MEMORY_CATEGORIES or not label or not value:
        return None
    source = str(raw.get("source") or "voice").strip().lower()
    if source not in {"voice", "audit", "profile", "application"}:
        source = "voice"
    confidence = str(raw.get("confidence") or "medium").strip().lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "medium"
    action_type = raw.get("action_type")
    if action_type is not None:
        action_type = str(action_type).strip()
        if action_type not in _MEMORY_ACTIONS:
            action_type = None
    payload = raw.get("action_payload")
    if not isinstance(payload, dict):
        payload = None
    existing_id = str(raw.get("id") or "").strip()
    now = _now_iso()
    return {
        "id": existing_id or str(uuid.uuid4()),
        "uid": email,
        "category": category,
        "label": label[:50],
        "value": value[:200],
        "source": source,
        "created_at": str(raw.get("created_at") or now),
        "updated_at": str(raw.get("updated_at") or now),
        "action_type": action_type,
        "action_payload": payload,
        "confidence": confidence,
        "shown_to_user": bool(raw.get("shown_to_user", False)),
    }


def get_memory_surface(email: str) -> dict[str, Any]:
    profile = get_profile(email) or {}
    items_raw = profile.get("dilly_memory_items")
    if not isinstance(items_raw, list):
        items_raw = []
    items: list[dict[str, Any]] = []
    for item in items_raw:
        if not isinstance(item, dict):
            continue
        norm = _normalize_memory_item(email, item)
        if norm:
            items.append(norm)
    items.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
    return {
        "narrative": profile.get("dilly_narrative"),
        "narrative_updated_at": profile.get("dilly_narrative_updated_at"),
        "items": items,
        "session_captures": profile.get("voice_session_captures") if isinstance(profile.get("voice_session_captures"), list) else [],
    }


_SENTINEL = object()


def save_memory_surface(
    email: str,
    *,
    items: list[dict[str, Any]] | None = None,
    narrative: str | None | object = _SENTINEL,
    narrative_updated_at: str | None = None,
    session_captures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    update: dict[str, Any] = {}
    if items is not None:
        normalized: list[dict[str, Any]] = []
        for row in items:
            if not isinstance(row, dict):
                continue
            norm = _normalize_memory_item(email, row)
            if norm:
                normalized.append(norm)
        update["dilly_memory_items"] = normalized[-400:]
    if narrative is not _SENTINEL:
        update["dilly_narrative"] = narrative
    if narrative_updated_at is not None:
        update["dilly_narrative_updated_at"] = narrative_updated_at
    if session_captures is not None:
        clean = [row for row in session_captures if isinstance(row, dict)]
        clean.sort(key=lambda x: str(x.get("captured_at") or ""), reverse=True)
        update["voice_session_captures"] = clean[:120]
    return save_profile(email, update)


def add_memory_item(email: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    surface = get_memory_surface(email)
    item = _normalize_memory_item(email, payload)
    if not item:
        return None
    items = list(surface["items"])
    items.insert(0, item)
    save_memory_surface(email, items=items)
    return item


def update_memory_item(email: str, item_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    target = (item_id or "").strip()
    if not target:
        return None
    surface = get_memory_surface(email)
    items = list(surface["items"])
    out: dict[str, Any] | None = None
    now = _now_iso()
    for row in items:
        if row.get("id") != target:
            continue
        if "label" in patch and patch.get("label") is not None:
            row["label"] = str(patch.get("label") or "").strip()[:50]
        if "value" in patch and patch.get("value") is not None:
            row["value"] = str(patch.get("value") or "").strip()[:200]
        if "shown_to_user" in patch:
            row["shown_to_user"] = bool(patch.get("shown_to_user"))
        if "action_type" in patch:
            at = patch.get("action_type")
            if at is None:
                row["action_type"] = None
            else:
                at_s = str(at).strip()
                row["action_type"] = at_s if at_s in _MEMORY_ACTIONS else row.get("action_type")
        if "action_payload" in patch:
            payload = patch.get("action_payload")
            row["action_payload"] = payload if isinstance(payload, dict) else None
        row["updated_at"] = now
        out = row
        break
    if out is None:
        return None
    save_memory_surface(email, items=items)
    return out


def delete_memory_item(email: str, item_id: str) -> bool:
    target = (item_id or "").strip()
    if not target:
        return False
    surface = get_memory_surface(email)
    items = list(surface["items"])
    before = len(items)
    items = [row for row in items if row.get("id") != target]
    if len(items) == before:
        return False
    save_memory_surface(email, items=items)
    return True


def mark_items_seen(email: str, item_ids: list[str]) -> int:
    ids = {str(x).strip() for x in (item_ids or []) if str(x).strip()}
    if not ids:
        return 0
    surface = get_memory_surface(email)
    changed = 0
    now = _now_iso()
    items = list(surface["items"])
    for row in items:
        if row.get("id") in ids and not row.get("shown_to_user"):
            row["shown_to_user"] = True
            row["updated_at"] = now
            changed += 1
    if changed > 0:
        save_memory_surface(email, items=items)
    return changed


def get_session_capture(email: str, conv_id: str) -> dict[str, Any] | None:
    target = (conv_id or "").strip()
    if not target:
        return None
    captures = get_memory_surface(email).get("session_captures") or []
    for cap in captures:
        if str(cap.get("conv_id") or "").strip() == target:
            return cap
    return None


def upsert_session_capture(
    email: str,
    *,
    conv_id: str,
    item_ids_added: list[str],
    narrative_updated: bool,
) -> dict[str, Any]:
    conv = (conv_id or "").strip()
    surface = get_memory_surface(email)
    captures = list(surface.get("session_captures") or [])
    existing_idx = next((i for i, row in enumerate(captures) if str(row.get("conv_id") or "").strip() == conv), None)
    now = _now_iso()
    ids = [str(x).strip() for x in item_ids_added if str(x).strip()]
    if existing_idx is None:
        row = {
            "id": str(uuid.uuid4()),
            "uid": email,
            "conv_id": conv,
            "captured_at": now,
            "items_added": ids,
            "narrative_updated": bool(narrative_updated),
        }
        captures.insert(0, row)
        save_memory_surface(email, session_captures=captures)
        return row
    row = captures[existing_idx]
    merged = list(dict.fromkeys([*(row.get("items_added") or []), *ids]))
    row["items_added"] = merged
    row["captured_at"] = now
    row["narrative_updated"] = bool(row.get("narrative_updated")) or bool(narrative_updated)
    captures[existing_idx] = row
    save_memory_surface(email, session_captures=captures)
    return row


def should_regenerate_narrative(last_updated_at: str | None, new_items_count: int, now_ts: float | None = None) -> bool:
    now = now_ts if now_ts is not None else time.time()
    if not last_updated_at:
        return True
    try:
        last_ts = datetime.fromisoformat(str(last_updated_at).replace("Z", "+00:00")).timestamp()
    except Exception:
        return True
    age = now - last_ts
    if age > 7 * 86400:
        return True
    if new_items_count > 0 and age > 24 * 3600:
        return True
    return False

