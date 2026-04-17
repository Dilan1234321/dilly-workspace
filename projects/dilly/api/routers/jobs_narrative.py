"""
Fit Narrative - personalized job fit assessment based on Dilly Profile.
No scores, no numbers. Just honest narrative feedback.
"""

import hashlib
import json
import os
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request

from projects.dilly.api import deps

router = APIRouter(tags=["jobs"])

# ---------------------------------------------------------------------------
# Narrative cache (module-level, LRU, TTL 7 days)
# ---------------------------------------------------------------------------
_NARRATIVE_CACHE_TTL_SEC = 7 * 86400  # 7 days
_NARRATIVE_CACHE_MAX = 2000
_NARRATIVE_CACHE: OrderedDict[str, dict] = OrderedDict()


def _cache_get(key: str, profile_hash: str) -> dict | None:
    entry = _NARRATIVE_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > _NARRATIVE_CACHE_TTL_SEC:
        _NARRATIVE_CACHE.pop(key, None)
        return None
    if entry["profile_hash"] != profile_hash:
        _NARRATIVE_CACHE.pop(key, None)
        return None
    # Move to end (most recently used)
    _NARRATIVE_CACHE.move_to_end(key)
    return entry["response"]


def _cache_set(key: str, response: dict, profile_hash: str) -> None:
    _NARRATIVE_CACHE[key] = {
        "response": response,
        "ts": time.time(),
        "profile_hash": profile_hash,
    }
    _NARRATIVE_CACHE.move_to_end(key)
    while len(_NARRATIVE_CACHE) > _NARRATIVE_CACHE_MAX:
        _NARRATIVE_CACHE.popitem(last=False)


# ---------------------------------------------------------------------------
# Plan limits
# ---------------------------------------------------------------------------
_PLAN_LIMITS = {
    "starter": 20,
    "dilly": 100,
    "pro": -1,  # unlimited
}


def _get_plan_limit(plan: str) -> int:
    return _PLAN_LIMITS.get(plan, 10)


# ---------------------------------------------------------------------------
# Profile text builder (reuses logic from audit.py)
# ---------------------------------------------------------------------------
def _build_profile_text(profile: dict, facts: list[dict]) -> str:
    """Assemble profile data into a structured text block for the LLM."""
    parts: list[str] = []

    # Identity
    name = profile.get("name") or profile.get("full_name") or "Unknown"
    parts.append(f"Name: {name}")
    school = profile.get("school") or ""
    if school:
        parts.append(f"School: {school}")
    major = profile.get("major") or ""
    minors = profile.get("minors") or profile.get("minor") or ""
    if major:
        parts.append(f"Major: {major}")
    if minors:
        parts.append(f"Minor(s): {minors if isinstance(minors, str) else ', '.join(minors)}")
    gpa = profile.get("gpa") or profile.get("transcript_gpa")
    if gpa:
        parts.append(f"GPA: {gpa}")
    class_year = profile.get("class_year") or profile.get("graduation_year") or ""
    if class_year:
        parts.append(f"Class Year: {class_year}")
    target = profile.get("application_target") or "exploring"
    parts.append(f"Application Target: {target}")

    # Cohorts
    cohorts = profile.get("cohorts") or []
    if cohorts:
        parts.append(f"Cohorts: {', '.join(cohorts)}")

    # Profile facts (organized by category)
    if facts:
        by_cat: dict[str, list[str]] = {}
        for f in facts:
            cat = f.get("category", "other")
            text = f"{f.get('label', '')}: {f.get('value', '')}".strip()
            if text and text != ":":
                by_cat.setdefault(cat, []).append(text)
        for cat, items in sorted(by_cat.items()):
            parts.append(f"\n[{cat.upper()}]")
            for item in items[:30]:
                parts.append(f"  - {item}")

    # Beyond resume (voice-captured)
    beyond = profile.get("beyond_resume") or []
    if beyond:
        parts.append("\n[ADDITIONAL INFO (shared with Dilly)]")
        for item in beyond[:20]:
            if isinstance(item, dict):
                t = item.get("type", "")
                text = item.get("text", "")
                if text:
                    parts.append(f"  - [{t}] {text}")

    # Experience expansion
    expansion = profile.get("experience_expansion") or []
    if expansion:
        parts.append("\n[EXPERIENCE DETAILS]")
        for entry in expansion[:10]:
            if not isinstance(entry, dict):
                continue
            role = entry.get("role_label", "")
            org = entry.get("organization", "")
            label = f"{role} at {org}" if org else role
            if not label:
                continue
            parts.append(f"  {label}")
            skills = entry.get("skills") or []
            if skills:
                parts.append(f"    Skills: {', '.join(skills[:15])}")
            tools = entry.get("tools_used") or []
            if tools:
                parts.append(f"    Tools: {', '.join(tools[:15])}")
            omitted = entry.get("omitted") or []
            if omitted:
                parts.append(f"    Not on resume: {'; '.join(omitted[:5])}")

    # Goals
    goals = profile.get("goals") or []
    if goals:
        parts.append(f"\nGoals: {', '.join(str(g) for g in goals[:5])}")

    return "\n".join(parts)


def _profile_hash(profile: dict, facts: list[dict]) -> str:
    """Quick hash to detect profile changes for cache invalidation."""
    updated = profile.get("updated_at") or ""
    fact_count = len(facts)
    return hashlib.md5(f"{updated}|{fact_count}".encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Narrative count tracking
# ---------------------------------------------------------------------------
def _get_narrative_usage(email: str) -> tuple[int, str]:
    """Return (count_this_month, reset_date) from the users table."""
    from projects.dilly.api.database import get_db
    import psycopg2.extras

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT narrative_count_month, narrative_count_reset_date FROM users WHERE email = %s",
            (email,),
        )
        row = cur.fetchone()
        if not row:
            return 0, ""
        return row.get("narrative_count_month") or 0, row.get("narrative_count_reset_date") or ""


def _increment_narrative_count(email: str) -> int:
    """Increment the monthly narrative count, resetting if month changed. Returns new count."""
    from projects.dilly.api.database import get_db

    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")

    count, reset_date = _get_narrative_usage(email)

    # Reset if different month
    if reset_date != current_month:
        count = 0

    count += 1

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """UPDATE users
               SET narrative_count_month = %s, narrative_count_reset_date = %s
               WHERE email = %s""",
            (count, current_month, email),
        )
        conn.commit()

    return count


# ---------------------------------------------------------------------------
# Load job from database
# ---------------------------------------------------------------------------
def _load_job(job_id: str) -> dict | None:
    from projects.dilly.api.database import get_db
    import psycopg2.extras

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT i.title, i.description, c.name as company,
                      i.location_city, i.location_state,
                      i.quick_glance, i.cohort_requirements
               FROM internships i
               JOIN companies c ON i.company_id = c.id
               WHERE i.id = %s""",
            (job_id,),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.get("/jobs/fit-narrative/usage")
async def fit_narrative_usage(request: Request):
    """Read-only ticker endpoint: how many narratives the user has used this month
    + their plan limit. Used by the Jobs page header to show 'X / Y this month'."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    try:
        from projects.dilly.api.profile_store import get_profile as _gp
        plan = ((_gp(email) or {}).get("plan") or "starter").lower().strip()
    except Exception:
        plan = "starter"
    limit = _get_plan_limit(plan)
    used, _reset = _get_narrative_usage(email)
    remaining = -1 if limit < 0 else max(0, limit - used)
    return {
        "plan": plan,
        "used": used,
        "limit": limit,
        "remaining": remaining,
        "unlimited": limit < 0,
    }


@router.post("/jobs/fit-narrative")
async def fit_narrative(request: Request, body: dict = Body(...)):
    """Generate a personalized fit narrative for a specific job.

    Instead of Smart/Grit/Build scores, returns a written assessment of what the
    user has, what is missing, and concrete next steps.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    job_id = (body.get("job_id") or "").strip()
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required.")

    # Load profile and facts
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.memory_surface_store import get_memory_surface

    profile = get_profile(email) or {}
    surface = get_memory_surface(email)
    facts = surface.get("items") or []

    # Check plan limits
    # NOTE: No plan column in DB yet (Stripe/RevenueCat not wired).
    # Default to "dilly" (250/month) until payment system is live.
    plan = profile.get("plan") or "dilly"
    limit = _get_plan_limit(plan)
    count, reset_date = _get_narrative_usage(email)

    # Reset count if month changed
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    if reset_date != current_month:
        count = 0

    if limit > 0 and count >= limit:
        raise HTTPException(
            status_code=403,
            detail="You've used all your fit assessments this month.",
        )

    # Build profile text
    profile_text = _build_profile_text(profile, facts)
    if len(profile_text.split()) < 20:
        raise HTTPException(
            status_code=400,
            detail="Your Dilly Profile doesn't have enough information yet. "
            "Tell Dilly about your experiences, skills, and goals first.",
        )

    # Load job
    job = _load_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Check cache
    p_hash = _profile_hash(profile, facts)
    cache_key = f"{email}:{job_id}"
    cached = _cache_get(cache_key, p_hash)
    if cached:
        # Still increment count for cached results
        new_count = _increment_narrative_count(email)
        remaining = max(0, limit - new_count) if limit > 0 else -1
        return {
            **cached,
            "narratives_used": new_count,
            "narratives_remaining": remaining,
            "cached": True,
        }

    # Build job context
    job_title = job.get("title") or "Unknown"
    company = job.get("company") or "Unknown"
    location_city = job.get("location_city") or ""
    location_state = job.get("location_state") or ""
    location = f"{location_city}, {location_state}".strip(", ") if location_city or location_state else "Not specified"
    job_description = (job.get("description") or "")[:3000]

    # Build quick glance bullets
    quick_glance = job.get("quick_glance")
    if isinstance(quick_glance, str):
        try:
            quick_glance = json.loads(quick_glance)
        except Exception:
            quick_glance = None
    quick_glance_bullets = ""
    if isinstance(quick_glance, list):
        quick_glance_bullets = "\n".join(f"- {item}" for item in quick_glance[:10])
    elif isinstance(quick_glance, dict):
        quick_glance_bullets = "\n".join(
            f"- {k}: {v}" for k, v in quick_glance.items()
        )

    # Call Claude Haiku
    system_prompt = (
        "You are Dilly's career advisor. Read this person's profile and this job posting, "
        "then write a short, honest fit assessment. Never use em dashes. Use hyphens, commas, or periods.\n\n"
        "Respond with JSON only:\n"
        "{\n"
        '  "fit_color": "green" | "amber" | "red",\n'
        '  "what_you_have": "2-3 sentences citing SPECIFIC things from their profile that match what this job needs. '
        'Name exact experiences, skills, or facts.",\n'
        '  "whats_missing": "1-2 sentences about gaps. If they\'re a strong fit, say \'Nothing major stands out as missing.\' '
        'Be honest but not discouraging.",\n'
        '  "what_to_do": "1-2 concrete, specific actions. Not generic advice. '
        'Name the exact skill to learn, project to build, or experience to add."\n'
        "}\n\n"
        "Rules:\n"
        "- fit_color: green = strong fit (most requirements met), amber = partial fit (some gaps), "
        "red = significant gaps\n"
        "- Only cite facts that are actually in the profile. Never invent.\n"
        '- Be specific: "your Python work at [Company]" not "your technical skills"\n'
        "- Be honest: if they're missing something major, say it plainly\n"
        '- Be actionable: "build a deployed ML project" not "gain more experience"\n'
        "- Never use em dashes"
    )

    user_message = (
        f"---PROFILE---\n{profile_text}\n---END PROFILE---\n\n"
        f"---JOB---\n"
        f"Title: {job_title}\n"
        f"Company: {company}\n"
        f"Location: {location}\n"
        f"Description: {job_description}\n"
        f"Key Requirements: {quick_glance_bullets}\n"
        f"---END JOB---"
    )

    try:
        import anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="AI service not configured.")

        client = anthropic.Anthropic(api_key=api_key)
        # Prompt caching: fit-narrative system prompts are large (~2-3k
        # tokens) and identical across all users generating a narrative
        # for the same role type. Caching shaves ~90% off input cost
        # for the second+ user in a 5-min window.
        _sys_param = (
            [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}]
            if isinstance(system_prompt, str) and len(system_prompt) >= 4000
            else system_prompt
        )
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            temperature=0.3,
            system=_sys_param,
            messages=[{"role": "user", "content": user_message}],
        )

        raw = response.content[0].text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()

        parsed = json.loads(raw)

    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned an invalid response. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FIT-NARRATIVE] Error calling Claude: {e}", flush=True)
        raise HTTPException(status_code=502, detail="AI service error. Please try again.")

    # Validate response shape
    fit_color = parsed.get("fit_color", "amber")
    if fit_color not in ("green", "amber", "red"):
        fit_color = "amber"

    narrative_response = {
        "fit_color": fit_color,
        "what_you_have": parsed.get("what_you_have", ""),
        "whats_missing": parsed.get("whats_missing", ""),
        "what_to_do": parsed.get("what_to_do", ""),
    }

    # Cache it
    _cache_set(cache_key, narrative_response, p_hash)

    # Increment usage
    new_count = _increment_narrative_count(email)
    remaining = max(0, limit - new_count) if limit > 0 else -1

    return {
        **narrative_response,
        "narratives_used": new_count,
        "narratives_remaining": remaining,
        "cached": False,
    }
