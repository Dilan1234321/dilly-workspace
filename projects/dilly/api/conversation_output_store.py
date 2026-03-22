"""Persistent storage for Voice ConversationOutput and ActionItem records."""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from projects.dilly.api.profile_store import get_profile_folder_path

_OUTPUTS_FILENAME = "conversation_outputs.json"
_ACTIONS_FILENAME = "action_items.json"
_MAX_OUTPUTS = 500
_MAX_ACTIONS = 1200


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_dt(value: Any) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return datetime.fromtimestamp(0, tz=timezone.utc)


def _path(email: str, filename: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        return ""
    return os.path.join(folder, filename)


def _load_list(path: str) -> list[dict[str, Any]]:
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [row for row in data if isinstance(row, dict)]


def _save_list(path: str, rows: list[dict[str, Any]], max_rows: int) -> None:
    if not path:
        raise ValueError("Invalid store path")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(rows[:max_rows], f, indent=2)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class _FileLock:
    def __init__(self, lock_path: str):
        self._lock_path = lock_path
        self._f = None

    def __enter__(self):
        os.makedirs(os.path.dirname(self._lock_path), exist_ok=True)
        self._f = open(self._lock_path, "w")
        fcntl.flock(self._f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *_):
        if self._f:
            fcntl.flock(self._f, fcntl.LOCK_UN)
            self._f.close()


def _action_payload_with_route(action_type: str | None, payload: dict[str, Any] | None) -> dict[str, str]:
    p = payload if isinstance(payload, dict) else {}
    route = str(p.get("route") or "").strip()
    if not route:
        if action_type == "open_bullet_practice":
            route = "/voice?prompt=bullet_practice"
        elif action_type == "open_certifications":
            route = "/certifications"
        elif action_type == "open_templates":
            route = "/templates"
        elif action_type == "open_ats":
            route = "/ats/overview"
        elif action_type == "open_am_i_ready":
            company = str(p.get("company") or "").strip()
            route = f"/ready-check/new?company={company}" if company else "/ready-check/new"
        elif action_type == "open_interview_prep":
            route = "/practice?mode=interview"
        else:
            route = "/actions"
    out = {k: str(v) for k, v in p.items() if isinstance(v, (str, int, float))}
    out["route"] = route
    return out


def create_action_items(email: str, conv_id: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    path = _path(email, _ACTIONS_FILENAME)
    if not path or not items:
        return []
    lock_path = path + ".lock"
    now = _now_iso()
    created: list[dict[str, Any]] = []
    with _FileLock(lock_path):
        existing = _load_list(path)
        dedupe = {
            (str(row.get("conv_id") or "").strip(), str(row.get("text") or "").strip().lower())
            for row in existing
        }
        for raw in items:
            if not isinstance(raw, dict):
                continue
            text = str(raw.get("text") or "").strip()
            if not text:
                continue
            key = (conv_id, text.lower())
            if key in dedupe:
                continue
            dedupe.add(key)
            action_type = raw.get("action_type")
            action_type = str(action_type).strip() if action_type else None
            payload = _action_payload_with_route(action_type, raw.get("action_payload"))
            created.append(
                {
                    "id": str(raw.get("id") or uuid.uuid4()),
                    "uid": email,
                    "conv_id": conv_id,
                    "text": text[:220],
                    "dimension": raw.get("dimension") if raw.get("dimension") in {"smart", "grit", "build"} else None,
                    "estimated_pts": float(raw.get("estimated_pts")) if isinstance(raw.get("estimated_pts"), (int, float)) else None,
                    "effort": raw.get("effort") if raw.get("effort") in {"low", "medium", "high"} else "medium",
                    "action_type": action_type,
                    "action_payload": payload,
                    "done": bool(raw.get("done", False)),
                    "done_at": raw.get("done_at"),
                    "created_at": str(raw.get("created_at") or now),
                    "snoozed_until": raw.get("snoozed_until"),
                    "dismissed": bool(raw.get("dismissed", False)),
                    "acted": bool(raw.get("acted", False)),
                    "acted_at": raw.get("acted_at"),
                }
            )
        merged = [*created, *existing]
        merged.sort(key=lambda x: _safe_dt(x.get("created_at")), reverse=True)
        _save_list(path, merged, _MAX_ACTIONS)
    return created


def list_actions(email: str) -> list[dict[str, Any]]:
    path = _path(email, _ACTIONS_FILENAME)
    rows = _load_list(path)
    rows.sort(key=lambda x: _safe_dt(x.get("created_at")), reverse=True)
    return rows


def list_active_actions(email: str, now: datetime | None = None) -> list[dict[str, Any]]:
    ref = now or datetime.now(timezone.utc)
    out: list[dict[str, Any]] = []
    for row in list_actions(email):
        if bool(row.get("done")) or bool(row.get("dismissed")):
            continue
        snoozed_until = row.get("snoozed_until")
        if snoozed_until and _safe_dt(snoozed_until) > ref:
            continue
        out.append(row)
    return out


def list_completed_actions(email: str, days: int = 14) -> list[dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))
    out: list[dict[str, Any]] = []
    for row in list_actions(email):
        if not bool(row.get("done")):
            continue
        if _safe_dt(row.get("done_at")) < cutoff:
            continue
        out.append(row)
    out.sort(key=lambda x: _safe_dt(x.get("done_at")), reverse=True)
    return out


def count_undone_actions(email: str) -> int:
    return len(list_active_actions(email))


def update_action(email: str, action_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    path = _path(email, _ACTIONS_FILENAME)
    if not path:
        return None
    target = str(action_id or "").strip()
    if not target:
        return None
    lock_path = path + ".lock"
    now_iso = _now_iso()
    with _FileLock(lock_path):
        rows = _load_list(path)
        updated: dict[str, Any] | None = None
        for row in rows:
            if str(row.get("id") or "") != target:
                continue
            if str(row.get("uid") or "").strip().lower() != str(email or "").strip().lower():
                continue
            if "done" in patch:
                row["done"] = bool(patch.get("done"))
                row["done_at"] = patch.get("done_at") or (now_iso if row["done"] else None)
            if "dismissed" in patch:
                row["dismissed"] = bool(patch.get("dismissed"))
            if "snoozed_until" in patch:
                row["snoozed_until"] = patch.get("snoozed_until")
            if "acted" in patch:
                row["acted"] = bool(patch.get("acted"))
                row["acted_at"] = patch.get("acted_at") or (now_iso if row["acted"] else row.get("acted_at"))
            updated = row
            break
        if not updated:
            return None
        _save_list(path, rows, _MAX_ACTIONS)
        return updated


def delete_action(email: str, action_id: str) -> bool:
    path = _path(email, _ACTIONS_FILENAME)
    if not path:
        return False
    target = str(action_id or "").strip()
    if not target:
        return False
    lock_path = path + ".lock"
    with _FileLock(lock_path):
        rows = _load_list(path)
        before = len(rows)
        rows = [row for row in rows if str(row.get("id") or "") != target or str(row.get("uid") or "").strip().lower() != str(email or "").strip().lower()]
        if len(rows) == before:
            return False
        _save_list(path, rows, _MAX_ACTIONS)
    return True


def save_conversation_output(email: str, payload: dict[str, Any]) -> dict[str, Any]:
    path = _path(email, _OUTPUTS_FILENAME)
    if not path:
        raise ValueError("Invalid email for conversation output store")
    lock_path = path + ".lock"
    conv_id = str(payload.get("conv_id") or "").strip()
    now = _now_iso()
    row = {
        "id": str(payload.get("id") or uuid.uuid4()),
        "uid": email,
        "conv_id": conv_id,
        "generated_at": str(payload.get("generated_at") or now),
        "action_items_created": payload.get("action_items_created") if isinstance(payload.get("action_items_created"), list) else [],
        "deadlines_created": payload.get("deadlines_created") if isinstance(payload.get("deadlines_created"), list) else [],
        "profile_updates": payload.get("profile_updates") if isinstance(payload.get("profile_updates"), list) else [],
        "memory_items_added": payload.get("memory_items_added") if isinstance(payload.get("memory_items_added"), list) else [],
        "companies_added": payload.get("companies_added") if isinstance(payload.get("companies_added"), list) else [],
        "score_impact": payload.get("score_impact") if isinstance(payload.get("score_impact"), dict) else None,
        "summary_lines": payload.get("summary_lines") if isinstance(payload.get("summary_lines"), list) else [],
        "session_title": str(payload.get("session_title") or "Voice session").strip()[:80],
        "session_topic": str(payload.get("session_topic") or "general").strip()[:40],
    }
    with _FileLock(lock_path):
        rows = _load_list(path)
        replaced = False
        for i, existing in enumerate(rows):
            if str(existing.get("conv_id") or "").strip() == conv_id and conv_id:
                row["id"] = str(existing.get("id") or row["id"])
                rows[i] = row
                replaced = True
                break
        if not replaced:
            rows.insert(0, row)
        rows.sort(key=lambda x: _safe_dt(x.get("generated_at")), reverse=True)
        _save_list(path, rows, _MAX_OUTPUTS)
    return row


def list_conversation_outputs(email: str, limit: int = 30, search: str = "") -> list[dict[str, Any]]:
    path = _path(email, _OUTPUTS_FILENAME)
    rows = _load_list(path)
    q = str(search or "").strip().lower()
    if q:
        rows = [
            row
            for row in rows
            if q in str(row.get("session_title") or "").lower()
            or q in str(row.get("session_topic") or "").lower()
        ]
    rows.sort(key=lambda x: _safe_dt(x.get("generated_at")), reverse=True)
    return rows[: max(1, min(200, int(limit)))]


def get_conversation_output(email: str, conv_id: str) -> dict[str, Any] | None:
    target = str(conv_id or "").strip()
    if not target:
        return None
    for row in list_conversation_outputs(email, limit=500):
        if str(row.get("conv_id") or "").strip() == target:
            return row
    return None

