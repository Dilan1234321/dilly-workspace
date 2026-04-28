"""
/career-plan/90-day — generates a structured 12-week plan from the user's
current Profile + scores to their stated target role.

Strategic role: cluster-3 P-lift. Career path planners (RoadMap.sh,
CareerExplorer) were B for Dilly because Future page only routed users
to chat. Now Future shows an actual checkable 12-week plan, generated
from REAL data:

  - User's latest audit scores (smart/grit/build vs cohort bar)
  - Target role / playbook from Future page
  - Profile facts to know what they've already done
  - Career archetype (if taken) to shape the recommendation style

Each week has: title, one concrete move, why-it-matters, completed flag.
Plan is persisted on the profile so the user can come back and check
items off as they ship.

Cost: one Haiku call per generation (~$0.01). Re-generates only when
the user explicitly taps "Regenerate" or 7+ days have passed since
the last plan was created.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request

from projects.dilly.api import deps, errors

router = APIRouter(tags=["career-plan"])


def _user_context(email: str) -> dict[str, Any]:
    """Pull everything we need to generate a meaningful plan."""
    out: dict[str, Any] = {"facts": [], "scores": None, "track": None, "career_archetype": None}
    try:
        from projects.dilly.api.profile_store import get_profile
        p = get_profile(email) or {}
        out["track"] = (p.get("track") or "General").strip()
        out["career_archetype"] = p.get("career_archetype")
        out["target_role"] = p.get("career_goal") or p.get("target_role")
    except Exception:
        pass
    try:
        from projects.dilly.api.audit_history import get_audits
        audits = get_audits(email) or []
        latest = audits[0] if audits else {}
        out["scores"] = latest.get("scores") or None
    except Exception:
        pass
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = get_memory_surface(email) or {}
        items = surface.get("items") or []
        # Pull the 30 most-recent items for context (the LLM doesn't
        # need everything — just enough to know what NOT to suggest).
        out["facts"] = [
            {"category": i.get("category"), "label": i.get("label"), "value": i.get("value")}
            for i in items[:30]
        ]
    except Exception:
        pass
    return out


@router.get("/career-plan/90-day")
async def get_90_day_plan(request: Request):
    """Return the user's stored 90-day plan, or a sentinel telling the
    UI to call POST /career-plan/90-day to generate one."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        plan = profile.get("career_plan_90d")
        if plan and isinstance(plan, dict):
            return plan
    except Exception:
        pass
    return {"weeks": [], "generated_at": None, "stale": True}


@router.post("/career-plan/90-day")
async def generate_90_day_plan(request: Request, body: dict = Body(default={})):
    """Generate (or regenerate) the 12-week plan. One Haiku call.
    Body (optional): { target_role: "Product Manager at Stripe" }
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    ctx = _user_context(email)
    target = (body.get("target_role") or ctx.get("target_role") or "").strip() or "their next role"

    # Build the LLM input.
    facts_text = "\n".join(
        f"- [{f.get('category')}] {f.get('label')}: {f.get('value')}"
        for f in (ctx.get("facts") or [])[:25]
    ) or "(no profile facts yet — keep recommendations general)"
    scores = ctx.get("scores") or {}
    score_line = (
        f"Smart: {scores.get('smart')} | Grit: {scores.get('grit')} | Build: {scores.get('build')}"
        if scores else "(no audit scores yet)"
    )
    archetype = ctx.get("career_archetype") or "(not taken)"

    system = (
        "You generate a focused 12-week career plan for a college student "
        "who's working toward a specific target role. Each week gets ONE "
        "concrete move — not a list of 10 things. The user is going to "
        "check these off as they happen, so each move must be actionable "
        "in 2-5 hours of focused effort. Plans should escalate: weeks 1-4 "
        "are foundation (skills, profile, prep), 5-8 are execution "
        "(applications, projects, outreach), 9-12 are landing (interviews, "
        "negotiation, decisions). Reference the user's actual profile "
        "facts when relevant; do NOT invent things they haven't done. "
        "Never use em dashes. Output JSON only.\n\n"
        "Schema:\n"
        "{\n"
        '  "summary": "1-2 sentences on the overall arc of these 12 weeks",\n'
        '  "weeks": [\n'
        "    {\n"
        '      "week": 1,\n'
        '      "title": "Short headline (4-6 words)",\n'
        '      "move": "One specific action in 1-2 sentences",\n'
        '      "why": "Why this matters for the target role (1 sentence)"\n'
        "    },\n"
        "    ... 12 entries total\n"
        "  ]\n"
        "}"
    )
    user_msg = (
        f"TARGET ROLE: {target}\n"
        f"TRACK: {ctx.get('track') or 'General'}\n"
        f"CURRENT SCORES: {score_line}\n"
        f"CAREER ARCHETYPE: {archetype}\n\n"
        f"PROFILE FACTS (so you don't suggest things they've already done):\n"
        f"{facts_text}\n\n"
        "Generate the 12-week plan now."
    )

    try:
        from dilly_core.llm_client import get_chat_completion
        raw = get_chat_completion(
            system, user_msg,
            model="claude-haiku-4-5-20251001",
            max_tokens=1500, temperature=0.4,
            log_email=email, log_feature="career_plan",
        )
    except Exception:
        return {"error": "LLM not available"}, 503

    if not raw:
        return {"error": "Could not generate plan"}, 500

    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        js = cleaned.find("{")
        je = cleaned.rfind("}") + 1
        parsed = json.loads(cleaned[js:je]) if js >= 0 else {}
    except Exception:
        return {"error": "Invalid plan format"}, 500

    weeks = parsed.get("weeks") or []
    # Normalize and add `completed: false` to each week (user toggles
    # this client-side, persisted via PATCH below).
    plan = {
        "target_role": target,
        "summary": str(parsed.get("summary") or "")[:400],
        "weeks": [
            {
                "week": int(w.get("week") or i + 1),
                "title": str(w.get("title") or "")[:100],
                "move": str(w.get("move") or "")[:300],
                "why": str(w.get("why") or "")[:200],
                "completed": False,
            }
            for i, w in enumerate(weeks[:12])
            if isinstance(w, dict)
        ],
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stale": False,
    }

    # Persist
    try:
        from projects.dilly.api.profile_store import save_profile
        save_profile(email, {"career_plan_90d": plan})
    except Exception:
        pass

    return plan


@router.patch("/career-plan/90-day/week/{week_num}")
async def toggle_week(week_num: int, request: Request, body: dict = Body(...)):
    """Toggle the completed flag on a specific week of the user's plan."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    completed = bool(body.get("completed"))
    try:
        from projects.dilly.api.profile_store import get_profile, save_profile
        profile = get_profile(email) or {}
        plan = profile.get("career_plan_90d")
        if not isinstance(plan, dict) or not plan.get("weeks"):
            raise errors.not_found("plan")
        for w in plan["weeks"]:
            if isinstance(w, dict) and int(w.get("week") or 0) == int(week_num):
                w["completed"] = completed
        save_profile(email, {"career_plan_90d": plan})
        return {"ok": True, "weeks": plan["weeks"]}
    except HTTPException:
        raise
    except Exception:
        return {"error": "Could not update"}, 500
