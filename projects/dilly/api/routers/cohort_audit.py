"""
Cohort-specific profile gap analysis (Option A — separate from /audit/v2).

POST /audit/cohort              — run LLM gap analysis for a cohort
GET  /audit/cohort/list         — list all cached results for user
GET  /audit/cohort/{slug}       — get a specific cached result
POST /audit/cohort/{slug}/unlock — permanently unlock an interest cohort
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import threading
import time

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Body, HTTPException, Request
from projects.dilly.api import deps

router = APIRouter()

_PROFILES_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
_lock = threading.Lock()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _uid(email: str) -> str:
    return hashlib.sha256(email.encode()).hexdigest()[:16]


def _cohort_dir(email: str) -> str:
    return os.path.join(_PROFILES_DIR, _uid(email), "cohort_audits")


def _slug(cohort_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", cohort_name.lower()).strip("-")


def _cache_path(email: str, cohort_name: str) -> str:
    return os.path.join(_cohort_dir(email), f"{_slug(cohort_name)}.json")


def _read_cache(email: str, cohort_name: str) -> dict | None:
    path = _cache_path(email, cohort_name)
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def _write_cache(email: str, cohort_name: str, data: dict) -> None:
    dir_ = _cohort_dir(email)
    os.makedirs(dir_, exist_ok=True)
    path = _cache_path(email, cohort_name)
    with _lock:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)


def _get_resume_and_signals(email: str) -> tuple[str | None, dict]:
    """Return (resume_text, scoring_signals) from the most recent audit."""
    uid = _uid(email)
    history_path = os.path.join(_PROFILES_DIR, uid, "audit_history.json")
    if not os.path.exists(history_path):
        return None, {}
    try:
        with open(history_path) as f:
            history = json.load(f)
        if not history:
            return None, {}
        history.sort(key=lambda x: x.get("ts", 0), reverse=True)
        recent = history[0]
        text = recent.get("resume_text") or recent.get("text") or ""
        signals = recent.get("scoring_signals") or {}
        return (text or None), signals
    except Exception:
        return None, {}


# ── LLM ───────────────────────────────────────────────────────────────────────

def _fallback_result(cohort_name: str) -> dict:
    return {
        "dilly_take": (
            f"Your profile has potential for {cohort_name} roles. "
            "Add field-specific experiences, certifications, and leadership roles to your Dilly profile "
            "to close the gaps recruiters care about most."
        ),
        "profile_gaps": [
            {
                "title": "Field-specific experience gaps",
                "description": f"Recruiters for {cohort_name} roles look for direct experience in the field. Log any relevant internships, projects, or coursework.",
                "priority": "high",
            },
            {
                "title": "Certifications not logged",
                "description": "Certifications signal commitment to the field. Make sure any relevant credentials are in your Dilly profile.",
                "priority": "medium",
            },
        ],
        "profile_additions": [
            {
                "title": "Log field-relevant certifications",
                "description": f"Certifications are a strong signal for {cohort_name} recruiters.",
                "action": "Go to your Dilly profile and add any certifications you hold.",
            },
            {
                "title": "Add quantifiable achievements",
                "description": "Impact with numbers is what separates top candidates.",
                "action": "Log specific accomplishments with measurable outcomes to your profile.",
            },
        ],
        "resume_for_cohort": {
            "include": [
                {"title": "Quantifiable impact bullets", "why": "Every cohort values outcomes over tasks."},
                {"title": "Field-relevant technical skills", "why": f"Show you speak the language of {cohort_name}."},
            ],
            "exclude": [
                {"title": "Unrelated extracurriculars", "why": "Space is scarce — cut what doesn't speak to this field."},
            ],
            "reframe": [],
        },
    }


def _run_cohort_llm(
    cohort_name: str,
    cohort_cfg: dict,
    cohort_score_data: dict,
    resume_text: str,
    signals: dict,
    profile: dict,
) -> dict:
    from dilly_core.llm_client import get_chat_completion

    name = profile.get("name") or "the student"
    majors = ", ".join(profile.get("majors") or ([profile.get("major")] if profile.get("major") else []))
    minors = ", ".join(profile.get("minors") or [])
    school = profile.get("school_id") or "university"

    weights = cohort_cfg.get("weights", {})
    smart_w = round(weights.get("smart", 0.33) * 100)
    grit_w = round(weights.get("grit", 0.33) * 100)
    build_w = round(weights.get("build", 0.34) * 100)
    recruiter_bar = cohort_cfg.get("recruiter_bar", 70)
    expected_gpa = cohort_cfg.get("expected_gpa", 3.0)
    activity_kws = cohort_cfg.get("activity_keywords", [])[:12]

    cs = round(cohort_score_data.get("smart") or 0)
    cg = round(cohort_score_data.get("grit") or 0)
    cb = round(cohort_score_data.get("build") or 0)
    cd = round(cohort_score_data.get("dilly_score") or 0)

    certs = ", ".join(signals.get("certifications_list") or []) or "none logged"
    career_goal = profile.get("career_goal") or "not specified"
    app_target = profile.get("application_target") or "internship"
    locations = ", ".join(profile.get("job_locations") or []) or "not specified"

    system = f"""You are Dilly's career intelligence engine. Dilly is a platform where everything about a student is stored — resume, GPA, experiences, achievements, certifications, and more. Dilly replaces the resume: once a student builds a complete Dilly profile, Dilly generates the perfect resume for any specific job.

Your job is NOT to grade the resume. Your job is to analyze what Dilly knows about this student and:
1. Identify GAPS in their Dilly profile for [{cohort_name}] roles
2. Tell them what to ADD to their Dilly profile to fill those gaps
3. Tell them how to tailor their resume SPECIFICALLY for [{cohort_name}] roles

The more complete a student's Dilly profile, the better their auto-generated resume for any job. Your analysis drives that improvement loop.

--- COHORT CONTEXT: {cohort_name} ---
Recruiter threshold: {recruiter_bar}/100
Scoring weights: Smart (academic, field knowledge) {smart_w}% | Grit (leadership, persistence) {grit_w}% | Build (projects, outputs) {build_w}%
Expected GPA for this cohort: {expected_gpa}
Key activity keywords: {', '.join(activity_kws) if activity_kws else 'leadership, impact, field-relevant experience'}

--- OUTPUT FORMAT ---
You MUST return ONLY valid JSON. No markdown fences, no explanation outside the JSON.

{{
  "dilly_take": "2-3 sentence honest assessment of this student for {cohort_name} roles. Be direct and specific — mention their actual name, real scores, and the most important gap or strength. Do NOT be generic.",
  "profile_gaps": [
    {{
      "title": "Short gap title",
      "description": "What is missing and why it matters specifically for {cohort_name} recruiters",
      "priority": "high"
    }}
  ],
  "profile_additions": [
    {{
      "title": "What to add",
      "description": "Why this matters for {cohort_name}",
      "action": "Specific instruction: 'Log your X to Dilly profile', 'Add Y certification', etc."
    }}
  ],
  "resume_for_cohort": {{
    "include": [
      {{"title": "What to include or lead with", "why": "Why this works for {cohort_name}"}}
    ],
    "exclude": [
      {{"title": "What to remove or de-emphasize", "why": "Why this hurts for {cohort_name}"}}
    ],
    "reframe": [
      {{"current": "Current phrasing or section type", "suggested": "How to reframe it for {cohort_name}", "why": "Why this framing works better"}}
    ]
  }}
}}

Rules:
- 3-5 profile_gaps (prioritized high/medium/low)
- 3-4 profile_additions with specific actions
- 2-3 include items, 1-3 exclude items, 0-2 reframe items
- Reference ACTUAL content from their resume and profile — be specific, not generic
- The dilly_take must mention their name and be frank about their biggest gap"""

    user = f"""Student: {name}
Major: {majors}{f' | Minor: {minors}' if minors else ''}
School: {school}
GPA: {signals.get('gpa') or 'unknown'} (cohort expected: {expected_gpa})
Career goal: {career_goal}
Applying for: {app_target} | Target locations: {locations}

Cohort: {cohort_name}
Current Dilly scores for this cohort:
  Smart {cs}/100  |  Grit {cg}/100  |  Build {cb}/100  |  Dilly {cd}/100
  Recruiter bar: {recruiter_bar}/100  |  Gap: {max(0, recruiter_bar - cd)} points

Profile signals (from resume extraction):
  Work experiences: {signals.get('work_entry_count', 0)}
  Leadership roles: {signals.get('leadership_density', 0)}
  Quantifiable impacts: {signals.get('quantifiable_impact_count', 0)}
  Research experience: {signals.get('has_research', False)}
  Honors/awards count: {signals.get('honors_count', 0)}
  Deployed apps/live links: {signals.get('deployed_app_or_live_link', False)}
  Hackathon participation: {signals.get('hackathon_mention', False)}
  Certifications logged: {certs}
  International markers: {signals.get('international_markers', False)}

Resume (first 3000 chars):
{resume_text[:3000]}"""

    raw = get_chat_completion(system, user, model="gpt-4o", max_tokens=2000, temperature=0.2)
    if not raw:
        return _fallback_result(cohort_name)

    try:
        clean = raw.strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```[a-z]*\n?", "", clean)
            clean = re.sub(r"\n?```$", "", clean)
        result = json.loads(clean)
        # Ensure all required keys exist
        result.setdefault("dilly_take", "")
        result.setdefault("profile_gaps", [])
        result.setdefault("profile_additions", [])
        result.setdefault("resume_for_cohort", {"include": [], "exclude": [], "reframe": []})
        return result
    except Exception:
        return _fallback_result(cohort_name)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/audit/cohort/list")
async def list_cohort_audits(request: Request):
    """List all cached cohort audits for the current user."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    dir_ = _cohort_dir(email)
    results: dict[str, dict] = {}
    if os.path.isdir(dir_):
        for fname in os.listdir(dir_):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(dir_, fname)) as f:
                    data = json.load(f)
                cname = data.get("cohort_name") or fname[:-5]
                results[cname] = {
                    "cohort_name": cname,
                    "ts": data.get("ts", 0),
                    "dilly_take": data.get("dilly_take", ""),
                }
            except Exception:
                pass
    return {"cohort_audits": results}


@router.post("/audit/cohort")
async def run_cohort_audit(request: Request, body: dict = Body(...)):
    """Run (or return cached) cohort-specific profile gap analysis."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    cohort_name = (body.get("cohort_name") or "").strip()
    if not cohort_name:
        raise HTTPException(status_code=400, detail="cohort_name is required")

    force = bool(body.get("force", False))

    # Check cache (unless force refresh)
    if not force:
        cached = _read_cache(email, cohort_name)
        if cached:
            return cached

    # Need resume text
    resume_text, signals = _get_resume_and_signals(email)
    if not resume_text:
        raise HTTPException(
            status_code=400,
            detail="No resume found. Please upload your resume to get a profile analysis.",
        )

    # Get user profile + cohort config
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.cohort_config import COHORT_SCORING_CONFIG

    profile = get_profile(email) or {}
    cohort_cfg = COHORT_SCORING_CONFIG.get(cohort_name, COHORT_SCORING_CONFIG.get("General", {}))
    cohort_scores_map = profile.get("cohort_scores") or {}
    cohort_score_data = cohort_scores_map.get(cohort_name) or {}

    # LLM availability check
    from dilly_core.llm_client import is_llm_available
    if not is_llm_available():
        raise HTTPException(status_code=503, detail="AI analysis temporarily unavailable")

    # Run LLM
    result = _run_cohort_llm(cohort_name, cohort_cfg, cohort_score_data, resume_text, signals, profile)

    # Attach metadata
    result["cohort_name"] = cohort_name
    result["ts"] = time.time()
    result["cohort_score"] = {
        "smart": cohort_score_data.get("smart") or 0,
        "grit": cohort_score_data.get("grit") or 0,
        "build": cohort_score_data.get("build") or 0,
        "dilly_score": cohort_score_data.get("dilly_score") or 0,
        "level": cohort_score_data.get("level") or "interest",
    }

    _write_cache(email, cohort_name, result)
    return result


@router.get("/audit/cohort/{cohort_slug}")
async def get_cohort_audit(request: Request, cohort_slug: str):
    """Get a specific cached cohort audit by slug."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    path = os.path.join(_cohort_dir(email), f"{cohort_slug}.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No cached audit for this cohort")
    with open(path) as f:
        return json.load(f)


@router.post("/audit/cohort/{cohort_slug}/unlock")
async def unlock_cohort(request: Request, cohort_slug: str, body: dict = Body({})):
    """Permanently unlock an interest cohort (jobs + analysis enabled everywhere)."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    cohort_name = (body.get("cohort_name") or "").strip()

    from projects.dilly.api.profile_store import get_profile, save_profile

    profile = get_profile(email) or {}
    unlocked: list[str] = list(profile.get("unlocked_cohorts") or [])
    if cohort_name and cohort_name not in unlocked:
        unlocked.append(cohort_name)
        profile["unlocked_cohorts"] = unlocked
        save_profile(email, profile)

    return {"ok": True, "unlocked_cohorts": unlocked}
