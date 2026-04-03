"""Deep-link routing for proactive notifications."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from projects.dilly.api.ready_check_store import has_ready_check_for_company


_ROUTES: dict[str, str] = {
    "DEADLINE_CRITICAL": "/dashboard?tab=calendar",
    "DEADLINE_ATS_RISK": "/ats/overview",
    "COHORT_PULSE_MONDAY": "/?tab=center",
    "ACTION_ITEMS_PENDING": "/actions",
    "TOP_25_WITHIN_REACH": "/dashboard?tab=hiring&view=report",
    "AUDIT_STALE_RECRUITING": "/dashboard?tab=hiring&view=upload",
    "APPLIED_ATS_MISMATCH": "/ats/vendors",
    "APPLICATION_SILENCE": "/applications",
    "COHORT_MOVING_USER_FLAT": "/dashboard?tab=hiring&view=insights",
    "RELATIONSHIP_FOLLOWUP": "/career",
    "RITUAL_MISSED": "/voice?prompt=weekly_review",
    "DEEP_DIVE_OVERDUE": "/voice?prompt=resume_deep_dive",
}


def get_deep_link(trigger_id: str, data: dict[str, Any] | None = None, uid: str | None = None) -> str:
    tid = (trigger_id or "").strip()
    payload = data if isinstance(data, dict) else {}
    # When deadline pressure ties to a company and no ReadyCheck exists, route to new check.
    if tid in {"DEADLINE_ATS_RISK", "DEADLINE_APPROACHING_SCORE_GAP"}:
        company = str(payload.get("deadline_label") or payload.get("company") or "").strip()
        if company and uid and not has_ready_check_for_company(uid, company):
            return f"/ready-check/new?company={quote(company)}"
    return _ROUTES.get(tid, "/dashboard")

