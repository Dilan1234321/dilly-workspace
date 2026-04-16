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
            return {
                **cached_payload,
                "plan": plan,
                "cached": True,
                "next_refresh": _next_refresh_label(plan, cached_ts),
                "tools_unlocked": plan in ("dilly", "pro"),
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

    # Persist to per-user cache so we don't re-compute until the tier window expires
    try:
        if _refresh_period_for_plan(plan) is not None:
            save_profile(email, {"ai_arena_cache": {"ts": _time.time(), "payload": payload}})
    except Exception:
        pass

    return {
        **payload,
        "plan": plan,
        "cached": False,
        "next_refresh": _next_refresh_label(plan, _time.time()) if _refresh_period_for_plan(plan) is not None else "",
        "tools_unlocked": plan in ("dilly", "pro"),
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
            model="claude-sonnet-4-6",
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
            model="claude-sonnet-4-6",
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
