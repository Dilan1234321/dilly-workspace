"""Persistent storage for ReadyCheck and ReadyCheckAction records."""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any

from projects.dilly.api.profile_store import get_profile_folder_path

_READY_CHECKS_FILENAME = "ready_checks.json"
_MAX_READY_CHECKS = 300


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _path(email: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        return ""
    return os.path.join(folder, _READY_CHECKS_FILENAME)


def _safe_dt(value: Any) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return datetime.fromtimestamp(0, tz=timezone.utc)


def _load(email: str) -> list[dict[str, Any]]:
    path = _path(email)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    rows = [x for x in data if isinstance(x, dict)]
    rows.sort(key=lambda x: _safe_dt(x.get("created_at")), reverse=True)
    return rows


def _save(email: str, rows: list[dict[str, Any]]) -> None:
    path = _path(email)
    if not path:
        raise ValueError("Invalid email for ready-check store")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(rows[:_MAX_READY_CHECKS], f, indent=2)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def normalize_company(company: str) -> str:
    return " ".join((company or "").strip().lower().split())


def list_ready_checks(email: str) -> list[dict[str, Any]]:
    return _load(email)


def get_ready_check(email: str, check_id: str) -> dict[str, Any] | None:
    target = (check_id or "").strip()
    if not target:
        return None
    for row in _load(email):
        if str(row.get("id") or "").strip() == target:
            return row
    return None


def create_ready_check(email: str, payload: dict[str, Any]) -> dict[str, Any]:
    now = _now_iso()
    company = str(payload.get("company") or "").strip()
    check_id = str(payload.get("id") or uuid.uuid4())
    actions_in = payload.get("actions") if isinstance(payload.get("actions"), list) else []
    actions: list[dict[str, Any]] = []
    for idx, action in enumerate(actions_in):
        if not isinstance(action, dict):
            continue
        actions.append(
            {
                "id": str(action.get("id") or uuid.uuid4()),
                "ready_check_id": check_id,
                "priority": int(action.get("priority") or (idx + 1)),
                "title": str(action.get("title") or "").strip()[:120],
                "description": str(action.get("description") or "").strip()[:400],
                "dimension": str(action.get("dimension") or "grit"),
                "estimated_pts": int(action.get("estimated_pts") or 0),
                "effort": str(action.get("effort") or "medium"),
                "action_type": str(action.get("action_type") or "").strip(),
                "action_payload": action.get("action_payload") if isinstance(action.get("action_payload"), dict) else {},
                "completed": bool(action.get("completed", False)),
                "completed_at": action.get("completed_at"),
            }
        )
    row = {
        "id": check_id,
        "uid": email,
        "company": company,
        "role": payload.get("role"),
        "created_at": payload.get("created_at") or now,
        "verdict": payload.get("verdict"),
        "verdict_label": payload.get("verdict_label"),
        "summary": payload.get("summary"),
        "user_scores": payload.get("user_scores") if isinstance(payload.get("user_scores"), dict) else {},
        "company_bars": payload.get("company_bars") if isinstance(payload.get("company_bars"), dict) else {},
        "dimension_gaps": payload.get("dimension_gaps") if isinstance(payload.get("dimension_gaps"), dict) else {},
        "dimension_narratives": payload.get("dimension_narratives") if isinstance(payload.get("dimension_narratives"), dict) else {},
        "actions": actions[:4],
        "timeline_weeks": payload.get("timeline_weeks"),
        "timeline_note": payload.get("timeline_note"),
        "follow_up_sent": bool(payload.get("follow_up_sent", False)),
        "follow_up_sent_at": payload.get("follow_up_sent_at"),
        "follow_up_opened": bool(payload.get("follow_up_opened", False)),
        "re_checked_after_follow_up": bool(payload.get("re_checked_after_follow_up", False)),
    }
    rows = _load(email)
    rows.insert(0, row)
    _save(email, rows)
    return row


def update_action_completed(email: str, check_id: str, action_id: str, completed: bool) -> dict[str, Any] | None:
    rows = _load(email)
    now = _now_iso()
    updated: dict[str, Any] | None = None
    for row in rows:
        if str(row.get("id") or "") != str(check_id or ""):
            continue
        actions = row.get("actions")
        if not isinstance(actions, list):
            break
        for action in actions:
            if not isinstance(action, dict):
                continue
            if str(action.get("id") or "") != str(action_id or ""):
                continue
            action["completed"] = bool(completed)
            action["completed_at"] = now if completed else None
            updated = row
            break
    if updated is None:
        return None
    _save(email, rows)
    return updated


def mark_follow_up_sent(email: str, check_id: str, sent_at: str | None = None) -> dict[str, Any] | None:
    rows = _load(email)
    out: dict[str, Any] | None = None
    for row in rows:
        if str(row.get("id") or "") != str(check_id or ""):
            continue
        row["follow_up_sent"] = True
        row["follow_up_sent_at"] = sent_at or _now_iso()
        out = row
        break
    if out is None:
        return None
    _save(email, rows)
    return out


def mark_follow_up_opened(email: str, check_id: str) -> None:
    rows = _load(email)
    changed = False
    for row in rows:
        if str(row.get("id") or "") != str(check_id or ""):
            continue
        if not row.get("follow_up_opened"):
            row["follow_up_opened"] = True
            changed = True
        break
    if changed:
        _save(email, rows)


def mark_rechecked_after_follow_up(email: str, prior_check_id: str) -> None:
    rows = _load(email)
    changed = False
    for row in rows:
        if str(row.get("id") or "") != str(prior_check_id or ""):
            continue
        if not row.get("re_checked_after_follow_up"):
            row["re_checked_after_follow_up"] = True
            changed = True
        break
    if changed:
        _save(email, rows)


def has_ready_check_for_company(email: str, company: str) -> bool:
    key = normalize_company(company)
    if not key:
        return False
    for row in _load(email):
        if normalize_company(str(row.get("company") or "")) == key:
            return True
    return False


def has_newer_company_check(email: str, company: str, created_at_iso: str) -> bool:
    key = normalize_company(company)
    anchor = _safe_dt(created_at_iso)
    for row in _load(email):
        if normalize_company(str(row.get("company") or "")) != key:
            continue
        if _safe_dt(row.get("created_at")) > anchor:
            return True
    return False


def group_history_by_company(email: str) -> list[dict[str, Any]]:
    rows = _load(email)
    grouped: dict[str, list[dict[str, Any]]] = {}
    display: dict[str, str] = {}
    for row in rows:
        key = normalize_company(str(row.get("company") or ""))
        if not key:
            continue
        grouped.setdefault(key, []).append(row)
        if key not in display:
            display[key] = str(row.get("company") or "")
    out: list[dict[str, Any]] = []
    for key, items in grouped.items():
        items.sort(key=lambda x: _safe_dt(x.get("created_at")), reverse=True)
        out.append({"company_key": key, "company": display.get(key) or key.title(), "checks": items})
    out.sort(key=lambda g: _safe_dt(g["checks"][0].get("created_at")) if g["checks"] else datetime.fromtimestamp(0, tz=timezone.utc), reverse=True)
    return out


def compare_two_recent(email: str, company: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    key = normalize_company(company)
    matches = [row for row in _load(email) if normalize_company(str(row.get("company") or "")) == key]
    matches.sort(key=lambda x: _safe_dt(x.get("created_at")), reverse=True)
    now = matches[0] if len(matches) >= 1 else None
    prev = matches[1] if len(matches) >= 2 else None
    return now, prev

