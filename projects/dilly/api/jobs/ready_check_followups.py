"""Follow-up notifications for ReadyCheck records."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from projects.dilly.api.audit_history import get_audits
from projects.dilly.api.auth_store import list_active_subscribed_users
from projects.dilly.api.notification_store import log_notification
from projects.dilly.api.ready_check_store import (
    has_newer_company_check,
    list_ready_checks,
    mark_follow_up_sent,
)
from projects.dilly.api.send_push_notification import send_push_notification


def _to_dt(value: Any) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return datetime.fromtimestamp(0, tz=timezone.utc)


def _days_ago(created_at: str, now: datetime) -> int:
    return int((now - _to_dt(created_at)).total_seconds() // 86400)


def _trim_message(text: str, company: str) -> str:
    msg = text.replace("!", "").strip()
    if company.lower() not in msg.lower():
        msg = f"{company}: {msg}"
    if len(msg) > 110:
        msg = msg[:110].rstrip()
    if not any(ch.isdigit() for ch in msg):
        msg = f"{msg} 1 step."
    if len(msg) > 110:
        msg = msg[:110].rstrip()
    return msg


def _build_follow_up_message(verdict: str, company: str, score_delta: int, grit_delta: int) -> str:
    if score_delta >= 5:
        return _trim_message(f"{company}: your score is up {score_delta} pts. Re-check now to see if you crossed the bar.", company)
    if score_delta == 0 and verdict == "almost":
        return _trim_message(f"{company}: still at the same score. You are close - one fix can change this in 7 days.", company)
    if score_delta == 0 and verdict == "stretch":
        return _trim_message(f"{company}: no movement yet. Your stretch gap is unchanged; do 2 roadmap actions this week.", company)
    if score_delta < 0:
        return _trim_message(f"{company}: score dipped {abs(score_delta)} pts. Re-check and reset your highest-impact action.", company)
    return _trim_message(f"{company}: +{score_delta} final and +{grit_delta} grit since last check. Re-run readiness now.", company)


def run_ready_check_follow_ups() -> dict[str, int]:
    users = list_active_subscribed_users()
    now = datetime.now(timezone.utc)
    processed = 0
    sent = 0
    for uid in users:
        checks = list_ready_checks(uid)
        for row in checks:
            processed += 1
            if bool(row.get("follow_up_sent")):
                continue
            created_at = str(row.get("created_at") or "")
            days = _days_ago(created_at, now)
            if days < 13 or days > 15:
                continue
            company = str(row.get("company") or "").strip()
            if not company:
                continue
            if has_newer_company_check(uid, company, created_at):
                continue
            latest = (get_audits(uid) or [None])[0]
            latest_final = int(round(float((latest or {}).get("final_score") or 0)))
            latest_grit = int(round(float(((latest or {}).get("scores") or {}).get("grit") or 0)))
            old_final = int(round(float(((row.get("user_scores") or {}).get("final") or 0))))
            old_grit = int(round(float(((row.get("user_scores") or {}).get("grit") or 0))))
            score_delta = latest_final - old_final
            grit_delta = latest_grit - old_grit
            msg = _build_follow_up_message(str(row.get("verdict") or ""), company, score_delta, grit_delta)
            deep_link = f"/ready-check/new?company={quote(company)}&follow_up={quote(str(row.get('id') or ''))}"
            pushed = send_push_notification(
                uid,
                msg,
                {
                    "trigger_id": "READY_CHECK_FOLLOW_UP",
                    "deep_link": deep_link,
                    "ready_check_id": str(row.get("id") or ""),
                },
            )
            if not pushed:
                continue
            mark_follow_up_sent(uid, str(row.get("id") or ""), sent_at=now.isoformat().replace("+00:00", "Z"))
            log_notification(
                uid,
                trigger_id="READY_CHECK_FOLLOW_UP",
                message=msg,
                sent_at=now.isoformat().replace("+00:00", "Z"),
                data_snapshot={
                    "company": company,
                    "score_delta": score_delta,
                    "grit_delta": grit_delta,
                    "ready_check_id": str(row.get("id") or ""),
                },
                deep_link=deep_link,
            )
            sent += 1
    return {"processed": processed, "sent": sent}

