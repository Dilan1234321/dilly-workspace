"""Storage for weekly CohortPulse and per-user UserCohortPulse records."""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

_WORKSPACE_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
_STORE_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "cohort_pulses.json")
_LOCK_PATH = _STORE_PATH + ".lock"
_EMPTY = {"cohort_pulses": [], "user_pulses": []}


def _ensure_dir() -> None:
    os.makedirs(os.path.dirname(_STORE_PATH), exist_ok=True)


def _to_week_start(dt: datetime | date) -> str:
    if isinstance(dt, datetime):
        d = dt.date()
    else:
        d = dt
    monday = d - timedelta(days=d.weekday())
    return monday.isoformat()


def current_week_start_iso(now: datetime | None = None) -> str:
    return _to_week_start(now or datetime.now(timezone.utc))


class _StoreLock:
    def __enter__(self):
        _ensure_dir()
        self._f = open(_LOCK_PATH, "w")
        fcntl.flock(self._f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *_):
        fcntl.flock(self._f, fcntl.LOCK_UN)
        self._f.close()


def _load() -> dict[str, list[dict[str, Any]]]:
    if not os.path.isfile(_STORE_PATH):
        return {**_EMPTY}
    try:
        with open(_STORE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {**_EMPTY}
    cohort = data.get("cohort_pulses") if isinstance(data.get("cohort_pulses"), list) else []
    user = data.get("user_pulses") if isinstance(data.get("user_pulses"), list) else []
    return {"cohort_pulses": cohort, "user_pulses": user}


def _save(data: dict[str, list[dict[str, Any]]]) -> None:
    _ensure_dir()
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(_STORE_PATH), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, _STORE_PATH)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def upsert_cohort_pulse(pulse: dict[str, Any]) -> dict[str, Any]:
    with _StoreLock():
        data = _load()
        week_start = str(pulse.get("week_start") or "")
        track = str(pulse.get("track") or "").strip().lower()
        school = str(pulse.get("school_id") or "").strip().lower()
        out = dict(pulse)
        out["id"] = str(out.get("id") or uuid.uuid4())
        replaced = False
        for i, row in enumerate(data["cohort_pulses"]):
            if (
                str(row.get("week_start") or "") == week_start
                and str(row.get("track") or "").strip().lower() == track
                and str(row.get("school_id") or "").strip().lower() == school
            ):
                out["id"] = str(row.get("id") or out["id"])
                data["cohort_pulses"][i] = out
                replaced = True
                break
        if not replaced:
            data["cohort_pulses"].append(out)
        _save(data)
        return out


def upsert_user_pulse(user_pulse: dict[str, Any]) -> dict[str, Any]:
    with _StoreLock():
        data = _load()
        week_start = str(user_pulse.get("week_start") or "")
        uid = str(user_pulse.get("uid") or "").strip().lower()
        out = dict(user_pulse)
        out["id"] = str(out.get("id") or uuid.uuid4())
        replaced = False
        for i, row in enumerate(data["user_pulses"]):
            if (
                str(row.get("week_start") or "") == week_start
                and str(row.get("uid") or "").strip().lower() == uid
            ):
                out["id"] = str(row.get("id") or out["id"])
                data["user_pulses"][i] = out
                replaced = True
                break
        if not replaced:
            data["user_pulses"].append(out)
        _save(data)
        return out


def get_current_user_pulse(uid: str, now: datetime | None = None) -> dict[str, Any] | None:
    week_start = current_week_start_iso(now)
    key = (uid or "").strip().lower()
    data = _load()
    user_row = next(
        (
            row
            for row in data["user_pulses"]
            if str(row.get("uid") or "").strip().lower() == key
            and str(row.get("week_start") or "") == week_start
        ),
        None,
    )
    if not user_row:
        return None
    cohort = next(
        (
            row
            for row in data["cohort_pulses"]
            if str(row.get("id") or "") == str(user_row.get("pulse_id") or "")
        ),
        None,
    )
    if not cohort:
        return None
    return {**user_row, "cohort": cohort}


def list_user_pulse_history(uid: str, limit: int = 8) -> list[dict[str, Any]]:
    key = (uid or "").strip().lower()
    data = _load()
    rows = [row for row in data["user_pulses"] if str(row.get("uid") or "").strip().lower() == key]
    rows.sort(key=lambda x: str(x.get("week_start") or ""), reverse=True)
    out: list[dict[str, Any]] = []
    for row in rows[: max(1, min(20, int(limit)))]:
        cohort = next(
            (
                c
                for c in data["cohort_pulses"]
                if str(c.get("id") or "") == str(row.get("pulse_id") or "")
            ),
            None,
        )
        if cohort:
            out.append({**row, "cohort": cohort})
    return out


def mark_user_pulse_seen(uid: str, user_pulse_id: str) -> dict[str, Any] | None:
    target_uid = (uid or "").strip().lower()
    pid = (user_pulse_id or "").strip()
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    with _StoreLock():
        data = _load()
        updated: dict[str, Any] | None = None
        for row in data["user_pulses"]:
            if str(row.get("id") or "") != pid:
                continue
            if str(row.get("uid") or "").strip().lower() != target_uid:
                continue
            row["seen"] = True
            row["seen_at"] = now_iso
            updated = row
            break
        if not updated:
            return None
        _save(data)
        cohort = next(
            (
                c
                for c in data["cohort_pulses"]
                if str(c.get("id") or "") == str(updated.get("pulse_id") or "")
            ),
            None,
        )
        return {**updated, "cohort": cohort} if cohort else updated


def mark_user_pulse_acted(uid: str, user_pulse_id: str) -> dict[str, Any] | None:
    target_uid = (uid or "").strip().lower()
    pid = (user_pulse_id or "").strip()
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    with _StoreLock():
        data = _load()
        updated: dict[str, Any] | None = None
        for row in data["user_pulses"]:
            if str(row.get("id") or "") != pid:
                continue
            if str(row.get("uid") or "").strip().lower() != target_uid:
                continue
            row["acted"] = True
            row["acted_at"] = now_iso
            updated = row
            break
        if not updated:
            return None
        _save(data)
        cohort = next(
            (
                c
                for c in data["cohort_pulses"]
                if str(c.get("id") or "") == str(updated.get("pulse_id") or "")
            ),
            None,
        )
        return {**updated, "cohort": cohort} if cohort else updated

