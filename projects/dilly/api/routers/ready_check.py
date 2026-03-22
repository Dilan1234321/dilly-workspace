"""Ready-check APIs: create verdicts, history, compare, action updates."""

from __future__ import annotations

import fnmatch
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Request

from projects.dilly.api import deps
from projects.dilly.api.audit_history import get_audits
from projects.dilly.api.company_criteria import get_all_companies
from projects.dilly.api.generate_ready_check_verdict import generate_ready_check_verdict
from projects.dilly.api.peer_benchmark import get_cohort_stats
from projects.dilly.api.profile_store import get_profile
from projects.dilly.api.ready_check_store import (
    compare_two_recent,
    create_ready_check,
    get_ready_check,
    group_history_by_company,
    mark_follow_up_opened,
    mark_rechecked_after_follow_up,
    update_action_completed,
)

router = APIRouter(tags=["ready_check"])


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(round(float(value)))
    except Exception:
        return default


def _extract_company_bars(company: str, latest_audit: dict | None, cohort_stats: dict | None) -> tuple[dict[str, int], str]:
    rules = get_all_companies()
    company_norm = (company or "").strip().lower()
    for row in rules:
        if not isinstance(row, dict):
            continue
        display = str(row.get("display_name") or "").strip()
        if not display:
            continue
        if display.lower() == company_norm or fnmatch.fnmatch(company_norm, f"*{display.lower()}*"):
            scores = row.get("meridian_scores") if isinstance(row.get("meridian_scores"), dict) else {}
            if scores:
                bars = {
                    "smart_min": _to_int(scores.get("min_smart"), 65),
                    "grit_min": _to_int(scores.get("min_grit"), 65),
                    "build_min": _to_int(scores.get("min_build"), 65),
                    "final_min": _to_int(scores.get("min_final_score"), 68),
                }
                signals = str(row.get("criteria_source") or "") + " " + str(row.get("source") or "")
                return bars, signals.strip()
    # fallback bars from cohort p75 + slight uplift
    p75 = (cohort_stats or {}).get("p75") if isinstance((cohort_stats or {}).get("p75"), dict) else {}
    smart = _to_int(p75.get("smart"), 66)
    grit = _to_int(p75.get("grit"), 66)
    build = _to_int(p75.get("build"), 66)
    final_min = int(round((smart + grit + build) / 3))
    return {"smart_min": smart, "grit_min": grit, "build_min": build, "final_min": final_min}, "cohort benchmark fallback"


@router.post("/ready-check")
async def post_ready_check(request: Request, body: dict = Body(...)):
    deps.require_subscribed(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    company = str(body.get("company") or body.get("target") or "").strip()
    role = (str(body.get("role") or "").strip() or None)
    follow_up_from = str(body.get("follow_up") or "").strip() or None
    if not company:
        raise HTTPException(status_code=400, detail="company is required")

    audits = get_audits(email)
    latest = audits[0] if audits else None
    if not latest:
        raise HTTPException(status_code=400, detail="Run an audit first.")
    scores = latest.get("scores") if isinstance(latest.get("scores"), dict) else {}
    user_scores = {
        "smart": _to_int(scores.get("smart")),
        "grit": _to_int(scores.get("grit")),
        "build": _to_int(scores.get("build")),
        "final": _to_int(latest.get("final_score")),
    }
    track = (latest.get("detected_track") or "").strip() or (body.get("track") or "").strip() or "general"
    cohort = get_cohort_stats(track)
    profile = get_profile(email) or {}
    company_bars, company_signals = _extract_company_bars(company, latest, cohort)
    recs = latest.get("recommendations") if isinstance(latest.get("recommendations"), list) else []
    verdict = generate_ready_check_verdict(
        company=company,
        role=role,
        profile=profile,
        user_scores=user_scores,
        company_bars=company_bars,
        cohort_stats=cohort,
        company_signals=company_signals,
        top_recommendations=[r for r in recs if isinstance(r, dict)][:3],
    )
    row = create_ready_check(
        email,
        {
            "company": company,
            "role": role,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "verdict": verdict.get("verdict"),
            "verdict_label": verdict.get("verdict_label"),
            "summary": verdict.get("summary"),
            "user_scores": user_scores,
            "company_bars": company_bars,
            "dimension_gaps": verdict.get("dimension_gaps"),
            "dimension_narratives": verdict.get("dimension_narratives"),
            "actions": verdict.get("actions"),
            "timeline_weeks": verdict.get("timeline_weeks"),
            "timeline_note": verdict.get("timeline_note"),
            "follow_up_sent": False,
            "follow_up_sent_at": None,
            "follow_up_opened": bool(follow_up_from),
            "re_checked_after_follow_up": False,
        },
    )
    if follow_up_from:
        mark_follow_up_opened(email, follow_up_from)
        mark_rechecked_after_follow_up(email, follow_up_from)
    return row


@router.get("/ready-check/history")
async def get_ready_check_history(request: Request):
    deps.require_subscribed(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    return {"groups": group_history_by_company(email)}


@router.patch("/ready-check/{check_id}/actions/{action_id}")
async def patch_ready_action(request: Request, check_id: UUID, action_id: UUID, body: dict = Body(...)):
    deps.require_subscribed(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    completed = bool(body.get("completed"))
    row = update_action_completed(email, str(check_id), str(action_id), completed=completed)
    if not row:
        raise HTTPException(status_code=404, detail="Action not found")
    return row


@router.get("/ready-check/compare")
async def get_ready_compare(request: Request, company: str = ""):
    deps.require_subscribed(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not company.strip():
        raise HTTPException(status_code=400, detail="company is required")
    now, previous = compare_two_recent(email, company)
    return {"now": now, "previous": previous}


@router.get("/ready-check/{check_id}")
async def get_ready_check_endpoint(request: Request, check_id: UUID):
    deps.require_subscribed(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    row = get_ready_check(email, str(check_id))
    if not row:
        raise HTTPException(status_code=404, detail="ReadyCheck not found")
    return row

