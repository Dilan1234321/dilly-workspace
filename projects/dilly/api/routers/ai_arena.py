"""
AI Arena — the command center for AI readiness.

Endpoints:
  POST /ai-arena/scan          — bullet-by-bullet AI vulnerability scan
  POST /ai-arena/replace-test  — AI attempts to replicate each bullet
  POST /ai-arena/simulate      — career path simulation with AI factored in
  GET  /ai-arena/shield        — overall AI readiness shield score
  GET  /ai-arena/disruption    — cohort disruption data
"""

import json
import os
import re
import sys
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from projects.dilly.api import deps, errors

router = APIRouter(tags=["ai-arena"])


# ── AI Threat Report (zero LLM cost) ────────────────────────────────────
# Role-based threat content that makes AI Arena useful to everyone — not
# just students with a resume. Content lives in dilly_core.ai_threat_report
# and is hand-curated quarterly. This endpoint is a free, cache-friendly
# lookup that works for any role the user identifies with.

@router.get("/ai-arena/threat-report")
async def get_threat_report(request: Request, role: str = ""):
    """Return the AI threat profile for a role. Free for all tiers.

    Accepts free-form role strings ("software engineer", "I'm an accountant",
    "RN") and resolves to a canonical entry. If no match, returns a list of
    supported roles so the caller can show a picker.

    Auth optional — this endpoint works for logged-out users too so the
    landing page and marketing site can embed threat reports publicly.
    """
    from projects.dilly.api.ai_threat_report_helpers import lookup, available_roles

    report = lookup(role) if role else None
    if report:
        return {"ok": True, "role": role, "report": report}

    # No match or no role provided — return the picker list so the caller
    # can show the user options.
    return {
        "ok": True,
        "role": role,
        "report": None,
        "available_roles": available_roles(),
    }


@router.get("/ai-arena/weekly-signal")
async def get_weekly_signal(request: Request, role: str = ""):
    """Return this week's hand-curated market signal for a role.

    Feeds the 'This Week in Your Field' card on the Arena. Zero-LLM
    lookup into dilly_core.weekly_signals. Free for every tier;
    auth optional so the card can render even on a logged-out demo.

    If no role is given, infer from profile (when authed). Falls back
    to the 'all_roles' generic signal.
    """
    from dilly_core.weekly_signals import signal_for_role
    from projects.dilly.api.ai_threat_report_helpers import lookup as lookup_role

    role_key: str | None = None
    if role:
        report = lookup_role(role)
        if report:
            role_key = report["role_key"]

    # If caller is authed and didn't send a role, infer from profile.
    if not role_key:
        try:
            user = deps.require_auth(request)
            email = (user.get("email") or "").strip().lower()
            if email:
                from projects.dilly.api.profile_store import get_profile
                profile = get_profile(email) or {}
                for candidate in (
                    profile.get("current_role"),
                    profile.get("current_job_title"),
                    profile.get("title"),
                    profile.get("field"),
                    profile.get("major"),
                ):
                    if candidate:
                        r = lookup_role(str(candidate))
                        if r:
                            role_key = r["role_key"]
                            break

                # Cohort fallback: role aliases don't cover majors like "Finance" or
                # "Data Science" directly, but major taxonomy does. Translate to the
                # nearest signal role key so students get field-relevant content.
                if not role_key:
                    _COHORT_TO_SIGNAL: dict[str, str] = {
                        "tech_data_science": "data_analyst",
                        "tech_software_engineering": "software_engineer",
                        "tech_cybersecurity": "software_engineer",
                        "business_accounting": "accountant",
                        "business_finance": "operations",
                        "business_consulting": "project_manager",
                        "business_marketing": "marketing_manager",
                        "pre_health": "nurse",
                        "health_nursing_allied": "nurse",
                        "pre_law": "lawyer",
                        "humanities_communications": "writer_copywriter",
                        "arts_design": "graphic_designer",
                        "quantitative_math_stats": "data_analyst",
                    }
                    _ALL_COHORT_KEYS = frozenset(_COHORT_TO_SIGNAL.keys()) | frozenset({
                        "science_research", "social_sciences", "sport_management",
                    })
                    from dilly_core.major_taxonomy import lookup_major as _lookup_major
                    for cand in (profile.get("cohort"), profile.get("major"), profile.get("track")):
                        if not cand:
                            continue
                        cand_str = str(cand).strip()
                        cohort_key = cand_str if cand_str in _ALL_COHORT_KEYS else None
                        if not cohort_key:
                            try:
                                res = _lookup_major(cand_str)
                                if res:
                                    cohort_key = res[1]
                            except Exception:
                                pass
                        if cohort_key and cohort_key in _COHORT_TO_SIGNAL:
                            role_key = _COHORT_TO_SIGNAL[cohort_key]
                            break
        except Exception:
            pass  # anonymous is fine; fall through to all_roles

    # Surface the role display name so the UI can show "This week in
    # Accounting" and the user sees their content is personalized.
    from dilly_core.ai_threat_report import ROLE_THREAT_REPORT
    role_display = (ROLE_THREAT_REPORT.get(role_key or "") or {}).get("display") if role_key else None
    return {
        "ok": True,
        "role_key": role_key,
        "role_display": role_display,
        "signal": signal_for_role(role_key),
    }


@router.get("/ai-arena/threat-report/infer")
async def infer_threat_report(request: Request):
    """Infer the user's role from their Dilly Profile and return the
    corresponding threat report. Falls back to student_general if the
    profile doesn't name a current role yet.

    Auth required — this reads profile data. Cheap: no LLM, just a
    profile lookup + alias match.
    """
    from projects.dilly.api.ai_threat_report_helpers import lookup, ROLE_THREAT_REPORT

    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile
    profile = get_profile(email) or {}

    # Priority: explicit current_role > user_type heuristic > user_path > major
    candidates = [
        profile.get("current_role"),
        profile.get("current_job_title"),
        profile.get("title"),
        profile.get("field"),
        profile.get("major"),
    ]
    for c in candidates:
        if not c:
            continue
        report = lookup(str(c))
        if report:
            return {"ok": True, "inferred_from": c, "report": report}

    # Students without a named field → student_general
    path = str(profile.get("user_path") or "").lower()
    if path == "student" or path == "first_gen_college" or path == "international_grad":
        return {"ok": True, "inferred_from": "student path", "report": {**ROLE_THREAT_REPORT["student_general"], "role_key": "student_general"}}

    # No match — the caller will show a role picker.
    return {"ok": True, "inferred_from": None, "report": None}


def _require_paid_for_arena_tool(email: str, tool_name: str) -> None:
    """Block free-tier users from AI Arena tools (scan / replace-test / simulate).
    Returns nothing on success; raises 402 on free tier with a friendly message."""
    try:
        from projects.dilly.api.profile_store import get_profile as _gp
        plan = ((_gp(email) or {}).get("plan") or "starter").lower().strip()
    except Exception:
        plan = "starter"
    if plan not in ("dilly", "pro"):
        raise HTTPException(
            status_code=402,
            detail={
                "code": "PLAN_REQUIRED",
                "message": f"{tool_name} is a Dilly feature. Upgrade to use AI Arena tools.",
                "required_plan": "dilly",
            },
        )


# ── Tiered Shield Cache ───────────────────────────────────────────────────────
# AI Arena's LLM scoring is the second-most-expensive call after resume gen
# (~$0.02/call). Cache aggressively per-tier:
#   Free tier: refresh once a month (unix time bucket)
#   Dilly:     refresh once a week (Monday morning local)
#   Pro:       always fresh, no cache
# Cache lives in the user's profile_json.ai_arena_cache so it survives
# restarts and is per-user.
import time as _time
import datetime as _dt
from collections import OrderedDict
from typing import Any

_FREE_REFRESH_DAYS = 30
_DILLY_REFRESH_DAYS = 7

def _refresh_period_for_plan(plan: str) -> int | None:
    """Return refresh window in seconds, or None for unlimited (Pro)."""
    p = (plan or "starter").lower().strip()
    if p == "pro":
        return None  # always fresh
    if p == "dilly":
        return _DILLY_REFRESH_DAYS * 86400
    return _FREE_REFRESH_DAYS * 86400  # starter / unknown

def _next_refresh_label(plan: str, last_ts: float) -> str:
    """Human-readable 'come back' message."""
    p = (plan or "starter").lower().strip()
    if p == "pro":
        return ""
    period = _refresh_period_for_plan(p) or 0
    next_ts = last_ts + period
    next_dt = _dt.datetime.fromtimestamp(next_ts)
    if p == "dilly":
        return f"Refreshes Monday {next_dt.strftime('%b %-d')}"
    return f"Updates again {next_dt.strftime('%b %-d')}"


# ── Shield Score ──────────────────────────────────────────────────────────────

@router.get("/ai-arena/shield")
async def get_shield_score(request: Request):
    """Get the user's overall AI readiness shield score, tier-cached."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    # Load profile text from multiple sources (Dilly Profile first, resume as fallback)
    resume_text = ""
    cohort = "General"
    plan = "starter"
    profile: dict = {}
    try:
        from projects.dilly.api.profile_store import get_profile, save_profile
        profile = get_profile(email) or {}
        cohort = profile.get("cohort") or profile.get("track") or "General"
        plan = (profile.get("plan") or "starter").lower().strip()

        # Tier cache check — if within refresh window, return the cached payload
        # plus a "next_refresh" hint so the mobile UI can render the
        # "come back next month" / "refreshes Monday" copy.
        period = _refresh_period_for_plan(plan)
        cached = profile.get("ai_arena_cache") or {}
        cached_ts = float(cached.get("ts") or 0)
        cached_payload = cached.get("payload")
        if period is not None and cached_payload and (_time.time() - cached_ts) < period:
            # Pull delta info from history so cached returns also render
            # the "your score changed" indicator correctly.
            _hist = cached.get("history") or [] if isinstance(cached, dict) else []
            _prev_score = None
            _delta = None
            try:
                if isinstance(_hist, list) and len(_hist) >= 2:
                    _prev_score = int(_hist[-2].get("score") or 0) or None
                    _curr = int(_hist[-1].get("score") or 0) or None
                    if _prev_score is not None and _curr is not None:
                        _delta = _curr - _prev_score
            except Exception:
                pass
            return {
                **cached_payload,
                "plan": plan,
                "cached": True,
                "next_refresh": _next_refresh_label(plan, cached_ts),
                "tools_unlocked": plan in ("dilly", "pro"),
                "previous_score": _prev_score,
                "score_delta": _delta,
                "history": _hist if isinstance(_hist, list) else [],
            }

        # Source 1: Dilly Profile memory surface (preferred — this is the Dilly Profile)
        try:
            from projects.dilly.api.memory_surface_store import get_memory_surface
            surface = get_memory_surface(email)
            if surface:
                facts = surface.get("items") or []
                narrative = (surface.get("narrative") or "").strip()
                if facts:
                    lines = []
                    for f in facts:
                        lines.append(f"{f.get('label', '')}: {f.get('value', '')}")
                    resume_text = narrative + "\n" + "\n".join(lines) if narrative else "\n".join(lines)
        except Exception:
            pass

        # Source 2: Parsed resume text (fallback)
        if not resume_text or len(resume_text.strip()) < 50:
            try:
                from projects.dilly.api.dilly_profile_txt import get_dilly_profile_txt_content
                resume_text = get_dilly_profile_txt_content(email, max_chars=15000) or resume_text
            except Exception:
                pass

        # Source 3: Saved resume sections (last resort)
        if not resume_text or len(resume_text.strip()) < 50:
            try:
                from projects.dilly.api.routers.resume import _load_resume, _sections_to_text, ResumeSection
                saved = _load_resume(email)
                if saved and saved.get("sections"):
                    sections_typed = [ResumeSection(**s) for s in saved["sections"]]
                    resume_text = _sections_to_text(sections_typed)
            except Exception:
                pass
    except Exception:
        pass

    if not resume_text or len(resume_text.strip()) < 30:
        # Even with no text, return cohort disruption data (not zeros)
        from dilly_core.ai_disruption import get_cohort_disruption
        disruption = get_cohort_disruption(cohort)
        return {
            "shield_score": 0,
            "shield_label": "Tell Dilly more",
            "cracks": 0,
            "total_bullets": 0,
            "safe_bullets": 0,
            "at_risk_bullets": 0,
            "cohort": cohort,
            "disruption_pct": disruption.get("disruption_pct", 30),
            "disruption_headline": disruption.get("headline", ""),
            "ai_resistant_skills": disruption.get("ai_resistant_skills", [])[:5],
            "ai_vulnerable_skills": disruption.get("ai_vulnerable_skills", [])[:5],
            "what_to_do": disruption.get("what_to_do", ""),
            "recommendation": "Talk to Dilly to build your profile. The more Dilly knows, the better your AI readiness score.",
        }

    from dilly_core.ai_disruption import score_ai_readiness, get_cohort_disruption, score_ai_readiness_llm
    from dilly_core.llm_client import is_llm_available

    # Prefer LLM-based scoring (more accurate), fall back to keyword-based
    if is_llm_available():
        try:
            readiness = score_ai_readiness_llm(resume_text, cohort)
        except Exception:
            readiness = score_ai_readiness(resume_text, cohort)
    else:
        readiness = score_ai_readiness(resume_text, cohort)
    disruption = get_cohort_disruption(cohort)

    # Count bullets
    lines = [l.strip() for l in resume_text.split("\n") if l.strip() and len(l.strip()) > 15]
    bullet_lines = [l for l in lines if l.startswith(("-", "•", "·", "*")) or re.match(r"^\d+\.", l)]
    total = len(bullet_lines) or len(lines)

    shield = readiness["ai_readiness"]
    safe = len(readiness.get("resistant_signals", []))
    at_risk = len(readiness.get("vulnerable_signals", []))
    cracks = at_risk

    if shield >= 80:
        label = "Fortified"
    elif shield >= 60:
        label = "Strong"
    elif shield >= 40:
        label = "Exposed"
    else:
        label = "Vulnerable"

    payload = {
        "shield_score": shield,
        "shield_label": label,
        "cracks": cracks,
        "total_bullets": total,
        "safe_bullets": safe,
        "at_risk_bullets": at_risk,
        "resistant_signals": readiness.get("resistant_signals", [])[:5],
        "vulnerable_signals": readiness.get("vulnerable_signals", [])[:5],
        "cohort": cohort,
        "disruption_pct": disruption.get("disruption_pct", 30),
        "disruption_headline": disruption.get("headline", ""),
        "ai_resistant_skills": disruption.get("ai_resistant_skills", [])[:5],
        "ai_vulnerable_skills": disruption.get("ai_vulnerable_skills", [])[:5],
        "what_to_do": disruption.get("what_to_do", ""),
        "recommendation": readiness.get("recommendation", ""),
    }

    # ── Delta tracking ────────────────────────────────────────────────
    # Compare this score to the previous one so the mobile UI can show a
    # "Your score changed" indicator. Keeps a rolling history of the last
    # 12 scores (≈ a year at monthly refresh, ≈ 3 months at weekly).
    previous_score: int | None = None
    previous_ts: float | None = None
    delta: int | None = None
    try:
        history_raw = (cached.get("history") if isinstance(cached, dict) else None) or []
        if isinstance(history_raw, list) and history_raw:
            last = history_raw[-1]
            if isinstance(last, dict):
                previous_score = int(last.get("score") or 0) or None
                previous_ts = float(last.get("ts") or 0) or None
        if previous_score is not None and shield is not None:
            delta = int(shield) - int(previous_score)
    except Exception:
        pass

    # Build the new history array (cap at 12 entries)
    try:
        prev_history = (cached.get("history") if isinstance(cached, dict) else None) or []
        if not isinstance(prev_history, list):
            prev_history = []
        new_history = list(prev_history) + [{
            "ts": _time.time(),
            "score": int(shield),
            "label": label,
        }]
        new_history = new_history[-12:]
    except Exception:
        new_history = []

    # Persist to per-user cache so we don't re-compute until the tier window expires
    try:
        if _refresh_period_for_plan(plan) is not None:
            save_profile(email, {
                "ai_arena_cache": {
                    "ts": _time.time(),
                    "payload": payload,
                    "history": new_history,
                },
            })
    except Exception:
        pass

    return {
        **payload,
        "plan": plan,
        "cached": False,
        "next_refresh": _next_refresh_label(plan, _time.time()) if _refresh_period_for_plan(plan) is not None else "",
        "tools_unlocked": plan in ("dilly", "pro"),
        # Delta info so the mobile can show "Your score went up 4 points since last refresh"
        "previous_score": previous_score,
        "score_delta": delta,
        "history": new_history,
    }


# ── Bullet Scan ───────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    bullets: Optional[list[str]] = None  # If None, scan from saved resume


@router.post("/ai-arena/scan")
async def scan_bullets(request: Request, body: ScanRequest):
    """Scan each resume bullet for AI vulnerability. Rule-based, instant."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    _require_paid_for_arena_tool(email, "Threat Scanner")

    bullets = body.bullets or []

    # If no bullets provided, extract from saved resume
    if not bullets:
        try:
            from projects.dilly.api.routers.resume import _load_resume
            saved = _load_resume(email)
            if saved and saved.get("sections"):
                for s in saved["sections"]:
                    if isinstance(s, dict):
                        for exp in (s.get("experiences") or s.get("projects") or []):
                            if isinstance(exp, dict):
                                for b in (exp.get("bullets") or []):
                                    text = b.get("text", "") if isinstance(b, dict) else str(b)
                                    if text.strip() and len(text.strip()) > 10:
                                        bullets.append(text.strip())
        except Exception:
            pass

    if not bullets:
        return {"bullets": [], "summary": {"safe": 0, "at_risk": 0, "total": 0}}

    # AI-resistant keywords (leadership, judgment, creativity, human skills)
    RESISTANT = {
        "led", "managed", "designed", "architected", "negotiated", "mentored",
        "facilitated", "presented", "persuaded", "collaborated", "stakeholder",
        "strategy", "vision", "creative", "user research", "client",
        "cross-functional", "empathy", "crisis", "conflict", "public speaking",
        "workshop", "coached", "innovated", "pioneered", "founded",
    }

    # AI-vulnerable keywords (routine, template, data entry, reporting)
    VULNERABLE = {
        "data entry", "spreadsheet", "template", "routine", "generated reports",
        "compiled", "transcribed", "formatted", "scheduled meetings", "filed",
        "sorted", "cataloged", "basic", "maintained records", "updated database",
        "copied", "organized files", "processed", "entered data",
    }

    results = []
    safe_count = 0
    risk_count = 0

    for bullet in bullets[:30]:  # Cap at 30
        bl = bullet.lower()
        resistant_hits = [kw for kw in RESISTANT if kw in bl]
        vulnerable_hits = [kw for kw in VULNERABLE if kw in bl]

        if len(vulnerable_hits) > len(resistant_hits):
            status = "at_risk"
            reason = f"Contains AI-automatable tasks: {', '.join(vulnerable_hits[:2])}"
            risk_count += 1
        elif len(resistant_hits) > 0:
            status = "safe"
            reason = f"Shows human skills: {', '.join(resistant_hits[:2])}"
            safe_count += 1
        else:
            # Neutral — check for metrics (humans add context, AI doesn't)
            has_metric = bool(re.search(r'\d+[%$kKmM]|\d{2,}', bullet))
            has_verb = bool(re.match(r'^(Led|Built|Designed|Created|Launched|Grew|Improved|Reduced|Increased|Developed|Managed|Negotiated)', bullet))
            if has_metric and has_verb:
                status = "safe"
                reason = "Strong action verb + quantified impact — distinctly human"
                safe_count += 1
            else:
                status = "neutral"
                reason = "Could go either way — add a leadership verb or metric to strengthen"

        results.append({
            "text": bullet[:200],
            "status": status,
            "reason": reason,
        })

    return {
        "bullets": results,
        "summary": {
            "safe": safe_count,
            "at_risk": risk_count,
            "neutral": len(results) - safe_count - risk_count,
            "total": len(results),
            "shield_impact": f"+{safe_count * 3}" if safe_count > risk_count else f"-{risk_count * 5}",
        },
    }


# ── Replace Me Test ───────────────────────────────────────────────────────────

class ReplaceRequest(BaseModel):
    bullet: str


@router.post("/ai-arena/replace-test")
async def replace_me_test(request: Request, body: ReplaceRequest):
    """
    AI attempts to replicate a resume bullet. Returns whether it could.
    Uses Claude to actually try writing the bullet from scratch, then
    compares quality. This is the "wow" feature.
    """
    user = deps.require_auth(request)
    _require_paid_for_arena_tool((user.get("email") or "").strip().lower(), "Replace Me")

    bullet = body.bullet.strip()
    if not bullet or len(bullet) < 10:
        raise errors.validation_error("Provide a resume bullet to test.")

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=(
                "You are evaluating whether AI can replicate a resume bullet point. "
                "Given a bullet, do two things:\n"
                "1. Try to write an equivalent bullet that an AI could generate without knowing the person.\n"
                "2. Rate how replaceable this bullet is on a scale of 1-10 (10 = AI can easily write this, 1 = only a human could write this).\n\n"
                "Return ONLY valid JSON: {\"ai_version\": \"...\", \"replaceability\": N, \"why\": \"one sentence\", \"verdict\": \"replaceable\" | \"human-only\" | \"borderline\"}"
            ),
            messages=[{"role": "user", "content": f"Resume bullet: \"{bullet}\""}],
        )
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response(email, FEATURES.AI_ARENA, response,
                                        metadata={"op": "bullet_replace"})
        except Exception:
            pass

        raw = response.content[0].text.strip()
        # Parse JSON from response
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)
        return {
            "original": bullet,
            "ai_version": result.get("ai_version", ""),
            "replaceability": min(10, max(1, int(result.get("replaceability", 5)))),
            "why": result.get("why", ""),
            "verdict": result.get("verdict", "borderline"),
        }
    except json.JSONDecodeError:
        # Claude didn't return valid JSON — provide a rule-based fallback
        bl = bullet.lower()
        has_metric = bool(re.search(r'\d+[%$]|\d{3,}', bullet))
        has_leadership = any(w in bl for w in ["led", "managed", "founded", "negotiated", "mentored"])
        has_specific = any(w in bl for w in ["at", "for", "with", "across"])

        if has_leadership and has_metric:
            return {"original": bullet, "ai_version": "(AI cannot replicate specific leadership + metrics)", "replaceability": 2, "why": "Leadership with quantified impact is uniquely human", "verdict": "human-only"}
        elif has_metric:
            return {"original": bullet, "ai_version": "(AI can generate similar structure but not your specific numbers)", "replaceability": 4, "why": "The metric is yours, but the framing could be templated", "verdict": "borderline"}
        else:
            return {"original": bullet, "ai_version": "(AI could write a generic version of this)", "replaceability": 7, "why": "No specific metrics or leadership — could be anyone's bullet", "verdict": "replaceable"}
    except Exception as e:
        raise errors.internal(f"Replace test failed: {type(e).__name__}")


# ── Career Simulation ─────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    job_title: str
    company: Optional[str] = None


@router.post("/ai-arena/simulate")
async def simulate_career(request: Request, body: SimulateRequest):
    """
    Simulate a career path forward 5 years with AI factored in.
    Uses Claude for the narrative but structures the output.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    _require_paid_for_arena_tool(email, "Career Simulator")

    job_title = body.job_title.strip()
    company = (body.company or "a leading company").strip()

    if not job_title:
        raise errors.validation_error("job_title is required.")

    # Get user's cohort for context
    cohort = "General"
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        cohort = profile.get("cohort") or profile.get("track") or "General"
    except Exception:
        pass

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            system=(
                "You are a career futurist analyzing how AI will transform a specific job role over 5 years. "
                "Be specific, data-driven, and honest — not alarmist but not sugarcoating. "
                "Return ONLY valid JSON with this exact structure:\n"
                "{\n"
                "  \"years\": [\n"
                "    {\"year\": 1, \"title\": \"current title\", \"ai_overlap_pct\": 15, \"description\": \"one sentence\", \"risk_level\": \"low\"},\n"
                "    {\"year\": 2, ...},\n"
                "    {\"year\": 3, ...},\n"
                "    {\"year\": 5, \"title\": \"evolved title\", \"ai_overlap_pct\": 60, \"description\": \"...\", \"risk_level\": \"high\"}\n"
                "  ],\n"
                "  \"skills_to_develop\": [\"skill1\", \"skill2\", \"skill3\"],\n"
                "  \"verdict\": \"one sentence summary of the career outlook\",\n"
                "  \"survival_strategy\": \"one sentence of what to do NOW\"\n"
                "}"
            ),
            messages=[{
                "role": "user",
                "content": f"Simulate the career path for: {job_title} at {company}. The person is in the {cohort} field. Show years 1, 2, 3, and 5.",
            }],
        )
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response(email, FEATURES.AI_ARENA, response,
                                        metadata={"op": "career_simulator", "cohort": cohort})
        except Exception:
            pass

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)
        return {
            "job_title": job_title,
            "company": company,
            "cohort": cohort,
            **result,
        }
    except json.JSONDecodeError:
        return {
            "job_title": job_title,
            "company": company,
            "cohort": cohort,
            "years": [
                {"year": 1, "title": job_title, "ai_overlap_pct": 20, "description": "Standard role with AI tools becoming common.", "risk_level": "low"},
                {"year": 2, "title": job_title, "ai_overlap_pct": 35, "description": "Routine tasks increasingly automated. Focus shifts to judgment calls.", "risk_level": "medium"},
                {"year": 3, "title": f"Senior {job_title}", "ai_overlap_pct": 45, "description": "Role evolves. Those who leverage AI advance; those who don't stagnate.", "risk_level": "medium"},
                {"year": 5, "title": f"AI-Augmented {job_title}", "ai_overlap_pct": 60, "description": "Role fundamentally transformed. Human judgment + AI execution is the new standard.", "risk_level": "high"},
            ],
            "skills_to_develop": ["AI-human workflow design", "Strategic judgment", "Stakeholder communication"],
            "verdict": "This role will exist in 5 years, but it will look very different. Adapt now.",
            "survival_strategy": "Build skills AI can't replicate: leadership, client relationships, and creative problem-solving.",
        }
    except Exception as e:
        raise errors.internal(f"Simulation failed: {type(e).__name__}")


# ── Field Intel — AI Arena V2 center screen ──────────────────────────────────

@router.get("/ai-arena/field-intel")
async def get_field_intel(request: Request):
    """Cohort-level AI disruption + pulse for the Arena V2 field-intel screen.

    Resolves cohort from user profile, returns threat/opportunity data from
    COHORT_AI_DISRUPTION, tries live pulse from cohort_pulse_store, falls
    back to synthesized pulse from disruption rankings. Zero LLM.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    # ── 1. Resolve cohort display name ────────────────────────────────────────
    cohort_raw = "General"
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        cohort_raw = profile.get("cohort") or profile.get("track") or "General"
    except Exception:
        pass

    from dilly_core.ai_disruption import get_cohort_disruption, COHORT_AI_DISRUPTION
    from projects.dilly.api.cohort_pulse_store import current_week_start_iso

    # COHORT_AI_DISRUPTION keys are display names ("Finance & Accounting").
    # Profiles may store an internal key ("business_finance") or a fuzzy match.
    _INTERNAL_TO_DISPLAY: dict[str, str] = {
        "tech_software_engineering": "Software Engineering & CS",
        "tech_data_science": "Data Science & Analytics",
        "tech_cybersecurity": "Software Engineering & CS",
        "business_finance": "Finance & Accounting",
        "business_accounting": "Finance & Accounting",
        "business_consulting": "Consulting & Strategy",
        "business_marketing": "Marketing & Advertising",
        "pre_health": "Healthcare & Clinical",
        "health_nursing_allied": "Healthcare & Clinical",
        "arts_design": "Design & Creative",
        "pre_law": "Legal & Compliance",
        "humanities_communications": "Consulting & Strategy",
        "quantitative_math_stats": "Data Science & Analytics",
        "science_research": "Data Science & Analytics",
        "management_operations": "Management & Operations",
        "social_sciences": "Consulting & Strategy",
        "education": "Education & Teaching",
        "sport_management": "Management & Operations",
    }

    cohort_display = cohort_raw
    if cohort_raw not in COHORT_AI_DISRUPTION:
        mapped = _INTERNAL_TO_DISPLAY.get(cohort_raw.lower().replace(" ", "_").replace("&", "and"))
        if mapped:
            cohort_display = mapped
        else:
            # Case-insensitive direct match
            for key in COHORT_AI_DISRUPTION:
                if key.lower() == cohort_raw.lower():
                    cohort_display = key
                    break
            else:
                # Substring match ("Finance" → "Finance & Accounting")
                for key in COHORT_AI_DISRUPTION:
                    if cohort_raw.lower() in key.lower():
                        cohort_display = key
                        break

    disruption = get_cohort_disruption(cohort_display)
    week_start = current_week_start_iso()

    # ── 2. Threat & Opportunity (from COHORT_AI_DISRUPTION) ──────────────────
    threat_opportunity = {
        "disruption_pct": disruption.get("disruption_pct", 30),
        "trend": disruption.get("trend", "stable"),
        "headline": disruption.get("headline", ""),
        "threats": (disruption.get("ai_vulnerable_skills") or [])[:5],
        "opportunities": (disruption.get("ai_resistant_skills") or [])[:5],
        "what_to_do": disruption.get("what_to_do", ""),
        "live_total_listings": 0,
        "live_ai_pct": disruption.get("disruption_pct", 30),
    }

    # ── 3. Pulse — live first, synthesised fallback ───────────────────────────
    pulse = None
    try:
        from projects.dilly.api.cohort_pulse_store import get_current_user_pulse
        pulse_row = get_current_user_pulse(email)
        if pulse_row:
            cp = pulse_row.get("cohort") or {}
            pulse = {
                "headline": cp.get("headline") or disruption.get("headline", ""),
                "ai_fluency_pct": cp.get("ai_fluency_pct") or disruption.get("disruption_pct", 30),
                "total_listings": cp.get("total_listings") or 0,
                "ai_listings": cp.get("ai_listings") or 0,
                "cross_cohort_rank": cp.get("cross_cohort_rank") or 1,
                "cross_cohort_total": cp.get("cross_cohort_total") or len(COHORT_AI_DISRUPTION),
                "above_average": bool(cp.get("above_average", False)),
                "week_start": str(pulse_row.get("week_start") or week_start),
            }
    except Exception:
        pass

    if pulse is None:
        ranked = sorted(
            COHORT_AI_DISRUPTION.items(),
            key=lambda x: x[1].get("disruption_pct", 0),
            reverse=True,
        )
        rank = next(
            (i + 1 for i, (k, _) in enumerate(ranked) if k == cohort_display),
            len(COHORT_AI_DISRUPTION),
        )
        all_pcts = [v.get("disruption_pct", 0) for v in COHORT_AI_DISRUPTION.values()]
        avg_pct = sum(all_pcts) / len(all_pcts) if all_pcts else 30
        pulse = {
            "headline": disruption.get("headline", ""),
            "ai_fluency_pct": disruption.get("disruption_pct", 30),
            "total_listings": 0,
            "ai_listings": 0,
            "cross_cohort_rank": rank,
            "cross_cohort_total": len(COHORT_AI_DISRUPTION),
            "above_average": disruption.get("disruption_pct", 30) > avg_pct,
            "week_start": week_start,
        }

    # ── 4. Cross-cohort rankings (disruption_pct as ai_fluency proxy) ─────────
    cross_cohort = [
        {
            "cohort": k,
            "ai_fluency_pct": v.get("disruption_pct", 0),
            "total_listings": 0,
        }
        for k, v in sorted(
            COHORT_AI_DISRUPTION.items(),
            key=lambda x: x[1].get("disruption_pct", 0),
            reverse=True,
        )
    ]

    return {
        "cohort": cohort_display,
        "week_start": week_start,
        "data_ready": True,
        "pulse": pulse,
        "threat_opportunity": threat_opportunity,
        "role_radar": [],  # populated by future cron; empty renders gracefully
        "cross_cohort": cross_cohort,
    }


# ── Disruption Data ───────────────────────────────────────────────────────────

@router.get("/ai-arena/disruption")
async def get_disruption(request: Request):
    """Get AI disruption data for the user's cohort."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    cohort = "General"
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        cohort = profile.get("cohort") or profile.get("track") or "General"
    except Exception:
        pass

    from dilly_core.ai_disruption import get_cohort_disruption, COHORT_AI_DISRUPTION

    primary = get_cohort_disruption(cohort)

    # Also return top 5 most/least disrupted cohorts for comparison
    ranked = sorted(
        COHORT_AI_DISRUPTION.items(),
        key=lambda x: x[1]["disruption_pct"],
        reverse=True,
    )

    return {
        "cohort": cohort,
        **primary,
        "all_cohorts": [
            {"cohort": k, "disruption_pct": v["disruption_pct"], "trend": v["trend"]}
            for k, v in ranked[:10]
        ],
    }


# ── Field Intel Cache (in-process, 6h TTL per cohort) ────────────────────────
import threading as _threading_arena

_FIELD_INTEL_CACHE: dict = {}
_FIELD_INTEL_LOCK = _threading_arena.Lock()
_FIELD_INTEL_TTL_SEC = 6 * 3600  # 6 hours


def _get_field_intel_cached(cohort: str) -> dict | None:
    with _FIELD_INTEL_LOCK:
        entry = _FIELD_INTEL_CACHE.get(cohort)
        if entry and (_time.time() - entry.get("ts", 0)) < _FIELD_INTEL_TTL_SEC:
            return entry.get("data")
    return None


def _set_field_intel_cached(cohort: str, data: dict) -> None:
    with _FIELD_INTEL_LOCK:
        _FIELD_INTEL_CACHE[cohort] = {"ts": _time.time(), "data": data}


def _invalidate_field_intel_cache() -> None:
    """Bust the per-cohort 6h cache. Called by cron jobs after classification
    or skill-list regeneration so the next request sees fresh data."""
    with _FIELD_INTEL_LOCK:
        _FIELD_INTEL_CACHE.clear()


# ── /ai-arena/field-intel ─────────────────────────────────────────────────────

@router.get("/ai-arena/field-intel")
async def get_field_intel(request: Request):
    """8-section AI readiness report for the authenticated user's cohort.

    Auth required (401 if not signed in). Cached in-process per cohort for
    6 hours; invalidated when /cron/classify-roles or
    /cron/regenerate-cohort-skills complete.

    Returns data_ready: false when cohort_skill_lists has no data yet for this
    month (prime it by hitting /cron/regenerate-cohort-skills).

    Each section is independently guarded — a missing DB table or empty
    column returns a sensible default rather than a 500.

    Response shape:
        {
          "data_ready": bool,
          "cohort": str,
          "cached": bool,
          "sections": {
            "cohort_pulse":       {...},
            "threat_opportunity": {...},
            "role_radar":         {...},
            "impact_score":       {...},
            "playbook":           {...},
            "day_in_2027":        {...},
            "chapter_prompt":     {...}
          }
        }
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    # ── Resolve cohort ────────────────────────────────────────────────────────
    cohort = "General"
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        cohort = profile.get("cohort") or profile.get("track") or "General"
    except Exception:
        pass

    # ── Cache hit ─────────────────────────────────────────────────────────────
    cached = _get_field_intel_cached(cohort)
    if cached is not None:
        return {**cached, "cached": True}

    # ── Pull DB data (single connection, two queries) ─────────────────────────
    import datetime as _dt_fi
    import psycopg2.extras as _pex_fi
    from projects.dilly.api.database import get_db as _get_db_fi

    month = _dt_fi.datetime.utcnow().strftime("%Y-%m")
    skills: list[dict] = []
    role_radar: list[dict] = []
    data_ready = False

    try:
        with _get_db_fi() as conn:
            cur = conn.cursor(cursor_factory=_pex_fi.RealDictCursor)

            # Per-cohort AI-resilient skill list for this month
            cur.execute(
                """
                SELECT skill, weight
                FROM cohort_skill_lists
                WHERE cohort = %s AND month = %s
                ORDER BY weight DESC
                LIMIT 15
                """,
                (cohort, month),
            )
            skills = [
                {"skill": r["skill"], "weight": float(r["weight"])}
                for r in cur.fetchall()
            ]
            data_ready = len(skills) > 0

            # Role radar: top active role_clusters by posting volume × ai_fluency
            cur.execute(
                """
                SELECT role_cluster, ai_fluency, COUNT(*) AS n
                FROM internships
                WHERE status = 'active'
                  AND role_cluster IS NOT NULL
                  AND ai_fluency IS NOT NULL
                GROUP BY role_cluster, ai_fluency
                ORDER BY n DESC
                LIMIT 20
                """
            )
            role_radar = [
                {
                    "role_cluster": r["role_cluster"],
                    "ai_fluency": r["ai_fluency"],
                    "count": int(r["n"]),
                }
                for r in cur.fetchall()
            ]
    except Exception:
        pass  # DB not available or tables not yet created — sections fall back to defaults

    # ── Disruption baseline ───────────────────────────────────────────────────
    disruption: dict = {}
    try:
        from dilly_core.ai_disruption import get_cohort_disruption
        disruption = get_cohort_disruption(cohort) or {}
    except Exception:
        pass

    disruption_pct: int = int(disruption.get("disruption_pct") or 30)

    # ── Build sections (each independently guarded) ───────────────────────────
    sections: dict = {}

    # 1. cohort_pulse — weekly headline for the cohort
    try:
        sections["cohort_pulse"] = {
            "headline": disruption.get("headline") or f"AI is reshaping the {cohort} landscape.",
            "disruption_pct": disruption_pct,
            "trend": disruption.get("trend") or "rising",
            "ai_resistant_skills": (disruption.get("ai_resistant_skills") or [])[:3],
        }
    except Exception:
        sections["cohort_pulse"] = {
            "headline": f"AI is transforming {cohort}.",
            "disruption_pct": disruption_pct,
            "trend": "rising",
            "ai_resistant_skills": [],
        }

    # 2. threat_opportunity — split % derived from role_radar ai_fluency mix
    try:
        high_n = sum(1 for r in role_radar if r.get("ai_fluency") == "high")
        med_n = sum(1 for r in role_radar if r.get("ai_fluency") == "medium")
        total_n = len(role_radar) or 1
        threat_pct = min(100, round(((high_n + med_n * 0.5) / total_n) * 100))
        sections["threat_opportunity"] = {
            "threat_pct": threat_pct,
            "opportunity_pct": 100 - threat_pct,
            "threat_label": "Roles where AI is displacing human work",
            "opportunity_label": "Roles where human judgment still wins",
        }
    except Exception:
        sections["threat_opportunity"] = {
            "threat_pct": disruption_pct,
            "opportunity_pct": 100 - disruption_pct,
            "threat_label": "Roles at risk",
            "opportunity_label": "Roles with opportunity",
        }

    # 3. role_radar — dot list of clusters × ai_fluency for the mobile chart
    sections["role_radar"] = {
        "roles": role_radar[:12],
        "cohort": cohort,
        "note": "Top active role clusters by posting volume, colored by AI-fluency level",
    }

    # 4. impact_score — gauge 0–100 (disruption_pct is our proxy score)
    try:
        label = (
            "High impact" if disruption_pct >= 60
            else "Medium impact" if disruption_pct >= 35
            else "Lower impact"
        )
        sections["impact_score"] = {
            "score": disruption_pct,
            "label": label,
            "description": disruption.get("what_to_do") or "Focus on uniquely human skills.",
        }
    except Exception:
        sections["impact_score"] = {
            "score": disruption_pct,
            "label": "Impact pending",
            "description": "Focus on uniquely human skills.",
        }

    # 5. playbook — AI-resilient skills from cohort_skill_lists
    sections["playbook"] = {
        "skills": skills,
        "data_ready": data_ready,
        "month": month,
        "title": f"AI-Resilient Skills for {cohort}",
    }

    # 6. day_in_2027 — short narrative about what the role looks like in 2027
    try:
        top_skills = [s["skill"] for s in skills[:2]]
        if not top_skills:
            top_skills = (disruption.get("ai_resistant_skills") or [])[:2]
        skills_str = " and ".join(top_skills) if top_skills else "domain expertise and judgment"
        what_to_do = (disruption.get("what_to_do") or "").strip()
        narrative = (
            f"By 2027, a typical day in {cohort} centers on {skills_str}. "
            f"AI handles the repetitive groundwork; your edge is what AI can't replicate. "
            + (f"{what_to_do}" if what_to_do else "")
        ).strip()
        sections["day_in_2027"] = {"narrative": narrative, "cohort": cohort}
    except Exception:
        sections["day_in_2027"] = {
            "narrative": (
                f"In 2027, the most valued people in {cohort} combine deep domain expertise "
                "with AI fluency."
            ),
            "cohort": cohort,
        }

    # 7. chapter_prompt — reflective question for the user
    try:
        top_skill = skills[0]["skill"] if skills else "strategic judgment"
        sections["chapter_prompt"] = {
            "prompt": (
                f"What evidence do you have that you can do what AI can't — "
                f"especially around {top_skill}?"
            ),
            "cohort": cohort,
        }
    except Exception:
        sections["chapter_prompt"] = {
            "prompt": "What makes you irreplaceable in your field?",
            "cohort": cohort,
        }

    result = {
        "data_ready": data_ready,
        "cohort": cohort,
        "cached": False,
        "sections": sections,
    }

    _set_field_intel_cached(cohort, result)
    return result
