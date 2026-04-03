"""Daily proactive notifications job."""

from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from dilly_core.ats_company_lookup import lookup_company_ats
from projects.dilly.api.ats_score_history import get_ats_scores
from projects.dilly.api.audit_history_pg import get_audits
from projects.dilly.api.auth_store_pg import list_active_subscribed_users
from projects.dilly.api.generate_notification_message import generate_notification_message
from projects.dilly.api.notification_deeplink import get_deep_link
from projects.dilly.api.notification_store import (
    get_last_trigger_notification,
    get_preferences,
    list_notifications,
    log_notification,
    get_push_token,
)
from projects.dilly.api.notification_triggers import (
    TRIGGERS,
    days_between,
    get_peer_percentile_for_prompt,
)
from projects.dilly.api.cohort_pulse_store import get_current_user_pulse
from projects.dilly.api.profile_store import get_profile, get_profile_folder_path
from projects.dilly.api.send_push_notification import send_push_notification


def _load_applications(email: str) -> list[dict]:
    folder = get_profile_folder_path(email)
    if not folder:
        return []
    path = os.path.join(folder, "applications.json")
    if not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if isinstance(data, dict):
        apps = data.get("applications")
        return apps if isinstance(apps, list) else []
    return data if isinstance(data, list) else []


def _build_company_ats_map(deadlines: list[dict], applications: list[dict]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for row in (deadlines or []):
        if not isinstance(row, dict):
            continue
        label = str(row.get("label") or "").strip()
        if not label:
            continue
        hit = lookup_company_ats(label)
        if hit:
            mapping[label] = hit[1]
    for row in (applications or []):
        if not isinstance(row, dict):
            continue
        company = str(row.get("company") or "").strip()
        if not company:
            continue
        hit = lookup_company_ats(company)
        if hit:
            mapping[company] = hit[1]
    return mapping


def _is_quiet_hours(now_local: datetime, prefs: dict) -> bool:
    start = int(prefs.get("quiet_hours_start", 22))
    end = int(prefs.get("quiet_hours_end", 8))
    hour = now_local.hour
    if start == end:
        return False
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


def _is_local_run_hour(now_local: datetime) -> bool:
    # Daily run target is 9 AM local; allow the full 9th hour.
    return now_local.hour == 9


def _sent_today(last_notifications: list[dict], now_local: datetime) -> bool:
    for n in last_notifications:
        sent = str((n or {}).get("sent_at") or "").strip()
        if not sent:
            continue
        try:
            dt = datetime.fromisoformat(sent.replace("Z", "+00:00")).astimezone(now_local.tzinfo or timezone.utc)
        except Exception:
            continue
        if dt.date() == now_local.date():
            return True
    return False


def build_notification_context(uid: str, now_utc: datetime) -> dict[str, Any]:
    profile = get_profile(uid) or {}
    audit_history = get_audits(uid)
    latest_audit = audit_history[0] if audit_history else None
    applications = _load_applications(uid)
    deadlines = profile.get("deadlines") if isinstance(profile.get("deadlines"), list) else []
    beyond_resume = profile.get("beyond_resume")
    voice_notes = profile.get("voice_notes") if isinstance(profile.get("voice_notes"), list) else []
    track = (
        (profile.get("track") or "").strip()
        or ((latest_audit or {}).get("detected_track") or "").strip()
        or "general"
    )

    try:
        from projects.dilly.api.peer_benchmark import get_cohort_stats
        cohort_stats = get_cohort_stats(track)
    except Exception:
        cohort_stats = None

    last_7_notifications = list_notifications(uid, limit=7)
    ats_scores = get_ats_scores(uid)
    ats_score = ats_scores[0].get("score") if ats_scores else None
    company_ats_map = _build_company_ats_map(deadlines, applications)
    peer_percentile = get_peer_percentile_for_prompt(latest_audit)

    prefs = get_preferences(uid)
    tz_name = prefs.get("timezone") or "America/New_York"
    try:
        now_local = now_utc.astimezone(ZoneInfo(tz_name))
    except Exception:
        now_local = now_utc
    current_cohort_pulse = get_current_user_pulse(uid, now_local)

    try:
        from projects.dilly.api.conversation_output_store import list_active_actions
        action_items = list_active_actions(uid)
    except Exception:
        action_items = []

    return {
        "uid": uid,
        "profile": profile,
        "today": now_local.date(),
        "now_local": now_local,
        "notification_prefs": prefs,
        "audit_history": audit_history,
        "latest_audit": latest_audit,
        "applications": applications,
        "deadlines": deadlines,
        "beyond_resume": beyond_resume,
        "voice_notes": voice_notes,
        "cohort_stats": cohort_stats,
        "last_7_notifications": last_7_notifications,
        "company_ats_map": company_ats_map,
        "peer_percentile": peer_percentile,
        "ats_score": ats_score,
        "current_cohort_pulse": current_cohort_pulse,
        "action_items": action_items,
    }


def process_user_notification(uid: str, now_utc: datetime) -> dict[str, Any]:
    result = {"processed": 1, "sent": 0, "suppressed": 0, "reason": "none"}
    try:
        ctx = build_notification_context(uid, now_utc)
        prefs = ctx.get("notification_prefs") or {}
        if not bool(prefs.get("enabled", True)):
            result["suppressed"] = 1
            result["reason"] = "disabled"
            return result
        now_local: datetime = ctx["now_local"]
        if _is_quiet_hours(now_local, prefs):
            result["suppressed"] = 1
            result["reason"] = "quiet_hours"
            return result
        if not _is_local_run_hour(now_local):
            result["suppressed"] = 1
            result["reason"] = "not_run_hour"
            return result
        if _sent_today(ctx.get("last_7_notifications") or [], now_local):
            result["suppressed"] = 1
            result["reason"] = "already_sent_today"
            return result

        selected_trigger = None
        selected_data: dict[str, Any] = {}
        for trigger in sorted(TRIGGERS, key=lambda t: t.priority):
            last = get_last_trigger_notification(uid, trigger.id)
            if last:
                try:
                    last_dt = datetime.fromisoformat(str(last.get("sent_at", "")).replace("Z", "+00:00"))
                    days_since = days_between(last_dt.date(), now_local.date())
                    if days_since < trigger.cooldown_days:
                        continue
                except Exception:
                    pass
            eval_result = trigger.evaluate(ctx)
            if eval_result.get("fired"):
                selected_trigger = trigger
                data = eval_result.get("data")
                selected_data = data if isinstance(data, dict) else {}
                break
        if selected_trigger is None:
            result["suppressed"] = 1
            result["reason"] = "no_trigger"
            return result

        message = generate_notification_message(uid, selected_trigger.id, selected_data, ctx)
        if not message:
            result["suppressed"] = 1
            result["reason"] = "message_validation_failed"
            return result
        if not get_push_token(uid):
            result["suppressed"] = 1
            result["reason"] = "missing_push_token"
            return result

        notification_id = str(uuid.uuid4())
        deep_link = get_deep_link(selected_trigger.id, selected_data, uid)
        pushed = send_push_notification(
            uid,
            message,
            {
                "trigger_id": selected_trigger.id,
                "deep_link": deep_link,
                "notification_id": notification_id,
            },
        )
        if not pushed:
            result["suppressed"] = 1
            result["reason"] = "push_not_sent"
            return result

        log_notification(
            uid,
            notification_id=notification_id,
            trigger_id=selected_trigger.id,
            message=message,
            sent_at=now_utc.isoformat().replace("+00:00", "Z"),
            data_snapshot=selected_data,
            deep_link=deep_link,
        )
        result["sent"] = 1
        result["reason"] = "sent"
        return result
    except Exception:
        result["suppressed"] = 1
        result["reason"] = "error"
        return result


def run_daily_notifications() -> dict[str, int]:
    users = list_active_subscribed_users()
    now_utc = datetime.now(timezone.utc)
    processed = 0
    sent = 0
    suppressed = 0
    for uid in users:
        row = process_user_notification(uid, now_utc)
        processed += int(row.get("processed", 0))
        sent += int(row.get("sent", 0))
        suppressed += int(row.get("suppressed", 0))
    return {"processed": processed, "sent": sent, "suppressed": suppressed}

