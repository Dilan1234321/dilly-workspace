"""
AI router: Dilly AI chat with full student context integration.
Calls Claude claude-sonnet-4-6 via the Anthropic SDK.
Requires ANTHROPIC_API_KEY in .env.

Endpoints:
  POST /ai/chat       — chat with full context
  GET  /ai/context    — rich student snapshot for the overlay
"""

import json
import os
import re
import sys
import time

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from projects.dilly.api import deps, errors
from projects.dilly.api.system_prompt_rules import (
    DILLY_PERSONALITY,
    DILLY_STYLE_RULES,
    DILLY_CONTEXT_INSTRUCTIONS,
    DILLY_MODEL_API,
)

router = APIRouter(tags=["ai"])


class ChatMessage(BaseModel):
    role: str
    content: str

class StudentContext(BaseModel):
    name: Optional[str] = None
    cohort: Optional[str] = None
    score: Optional[float] = None
    smart: Optional[float] = None
    grit: Optional[float] = None
    build: Optional[float] = None
    gap: Optional[float] = None
    cohort_bar: Optional[float] = None
    reference_company: Optional[str] = None

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    mode: str = "coaching"
    system: Optional[str] = None
    student_context: Optional[StudentContext] = None
    rich_context: Optional[Dict[str, Any]] = None
    conv_id: Optional[str] = None  # Conversation session ID for profile extraction

class ChatResponse(BaseModel):
    content: str


def _build_rich_context(email: str) -> dict:
    from projects.dilly.api.profile_store import get_profile, get_profile_folder_path
    from projects.dilly.api.audit_history import get_audits
    from projects.dilly.api.resume_loader import load_parsed_resume_for_voice

    profile = get_profile(email) or {}
    name = (profile.get("name") or "").strip() or "the student"
    first_name = name.split()[0] if name != "the student" else "there"
    cohort = profile.get("track") or profile.get("cohort") or "General"
    school = "University of Tampa" if profile.get("school_id") == "utampa" else (profile.get("school_id") or "Unknown")
    # All majors and minors (full list, not just first)
    majors_list = profile.get("majors") or ([profile.get("major")] if profile.get("major") else [])
    majors_list = [m for m in majors_list if m]
    major = majors_list[0] if majors_list else ""
    minors_list = profile.get("minors") or []
    minors_list = [m for m in minors_list if m]
    minor = minors_list[0] if minors_list else ""
    interests_list = profile.get("interests") or []
    career_goal = profile.get("career_goal") or ""
    industry_target = profile.get("industry_target") or ""
    target_companies = profile.get("target_companies") or []
    tagline = profile.get("profile_tagline") or ""
    bio = profile.get("profile_bio") or ""
    linkedin = profile.get("linkedin_url") or ""
    pronouns = profile.get("pronouns") or ""

    audits = get_audits(email)
    latest_audit = audits[0] if audits else None
    previous_audit = audits[1] if len(audits) > 1 else None
    current_score = latest_audit.get("final_score") if latest_audit else None
    scores = latest_audit.get("scores", {}) if latest_audit else {}
    smart = scores.get("smart", 0)
    grit = scores.get("grit", 0)
    build = scores.get("build", 0)
    dilly_take = (latest_audit.get("dilly_take") or latest_audit.get("meridian_take") or "") if latest_audit else ""
    previous_score = previous_audit.get("final_score") if previous_audit else None
    score_delta = (current_score - previous_score) if (current_score is not None and previous_score is not None) else None
    audit_count = len(audits)
    last_audit_ts = latest_audit.get("ts") if latest_audit else None
    days_since_audit = int((time.time() - last_audit_ts) / 86400) if last_audit_ts else None

    audit_history = []
    for a in audits[:5]:
        audit_history.append({
            "score": a.get("final_score"),
            "scores": a.get("scores", {}),
            "date": time.strftime("%Y-%m-%d", time.gmtime(a["ts"])) if a.get("ts") else None,
            "dilly_take": a.get("dilly_take") or a.get("meridian_take") or "",
        })

    COHORT_BARS = {"Tech": {"bar": 75, "company": "Google"}, "Finance": {"bar": 72, "company": "Goldman Sachs"}, "Health": {"bar": 68, "company": "Mayo Clinic"}, "Quantitative": {"bar": 75, "company": "Jane Street"}, "General": {"bar": 65, "company": "top companies"}}
    cohort_cfg = COHORT_BARS.get(cohort, COHORT_BARS["General"])
    bar = cohort_cfg["bar"]
    reference_company = cohort_cfg["company"]
    gap = bar - (current_score or 0) if current_score else None
    cleared_bar = current_score is not None and current_score >= bar

    weakest = strongest = None
    if smart and grit and build:
        dims = {"Smart": smart, "Grit": grit, "Build": build}
        weakest = min(dims, key=dims.get)
        strongest = max(dims, key=dims.get)

    applications = []
    folder = get_profile_folder_path(email)
    if folder:
        try:
            app_path = os.path.join(folder, "applications.json")
            if os.path.isfile(app_path):
                with open(app_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    applications = data.get("applications", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        except Exception:
            pass

    app_counts = {"saved": 0, "applied": 0, "interviewing": 0, "offer": 0, "rejected": 0}
    for a in applications:
        s = a.get("status", "saved")
        if s in app_counts: app_counts[s] += 1

    interviewing_at = [a.get("company") for a in applications if a.get("status") == "interviewing" and a.get("company")]
    applied_companies = [a.get("company") for a in applications if a.get("status") == "applied" and a.get("company")]
    silent_apps = []
    for a in applications:
        if a.get("status") == "applied" and a.get("applied_at"):
            try:
                from datetime import datetime
                ad = datetime.fromisoformat(a["applied_at"].replace("Z", "+00:00"))
                days = (time.time() - ad.timestamp()) / 86400
                if days > 14: silent_apps.append(a.get("company", "Unknown"))
            except Exception: pass

    deadlines = profile.get("deadlines") or []
    upcoming_deadlines = []
    for d in deadlines:
        if not isinstance(d, dict) or d.get("completedAt"): continue
        label = (d.get("label") or d.get("title") or "").strip()
        date_str = d.get("date", "")
        if not label or not date_str: continue
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            days_until = int((dt.timestamp() - time.time()) / 86400)
            if -1 <= days_until <= 30:
                upcoming_deadlines.append({"label": label, "date": date_str[:10], "days_until": days_until, "type": d.get("type", "deadline")})
        except Exception: pass
    upcoming_deadlines.sort(key=lambda x: x["days_until"])

    resume_text = load_parsed_resume_for_voice(email, max_chars=6000) or ""
    has_resume = len(resume_text.strip()) > 50
    has_editor_resume = False

    # ── New context fields from voice/profile ──────────────────────
    beyond_resume = profile.get("beyond_resume") or []
    experience_expansion = profile.get("experience_expansion") or []
    transcript_gpa = profile.get("transcript_gpa")
    transcript_courses = profile.get("transcript_courses") or []
    transcript_honors = profile.get("transcript_honors") or []
    job_locations = profile.get("job_locations") or []
    job_location_scope = profile.get("job_location_scope") or ""
    target_school = profile.get("target_school") or ""
    voice_onboarding_answers = profile.get("voice_onboarding_answers") or []
    voice_biggest_concern = profile.get("voice_biggest_concern") or ""
    pre_professional = profile.get("preProfessional") or profile.get("pre_professional_track") or False
    graduation_year = profile.get("graduation_year") or profile.get("grad_year") or ""

    # Achievements — unlocked achievement names
    achievements_raw = profile.get("achievements") or {}
    unlocked_achievements = [k for k, v in achievements_raw.items() if isinstance(v, dict) and v.get("unlockedAt")] if isinstance(achievements_raw, dict) else []

    # Dilly Profile facts — everything Dilly has learned about this user
    profile_facts_text = ""
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = get_memory_surface(email)
        facts = surface.get("items") or []
        narrative = surface.get("narrative") or ""
        if facts:
            grouped: dict[str, list] = {}
            for f in facts:
                cat = f.get("category", "other")
                if cat not in grouped:
                    grouped[cat] = []
                grouped[cat].append(f)
            lines = []
            cat_labels = {
                "achievement": "Achievements", "goal": "Goals", "target_company": "Target Companies",
                "skill_unlisted": "Skills (not on resume)", "project_detail": "Projects (beyond resume)",
                "motivation": "What drives them", "personality": "Personality & style",
                "soft_skill": "Soft skills", "hobby": "Interests & hobbies",
                "life_context": "Background & life context", "company_culture_pref": "Workplace preferences",
                "strength": "Strengths", "weakness": "Growth areas", "challenge": "Challenges",
                "availability": "Availability", "preference": "Preferences",
                "concern": "Concerns", "deadline": "Deadlines", "interview": "Interviews",
                "rejection": "Rejections", "mentioned_but_not_done": "Said they'd do but haven't",
                "person_to_follow_up": "People to follow up with",
            }
            for cat, items in grouped.items():
                label = cat_labels.get(cat, cat.replace("_", " ").title())
                entries = "; ".join(f"{i['label']}: {i['value']}" for i in items[:8])
                lines.append(f"  {label}: {entries}")
            profile_facts_text = "\n".join(lines)
    except Exception:
        pass
    if folder:
        has_editor_resume = os.path.isfile(os.path.join(folder, "resume_edited.json"))

    nudges = []
    for dl in upcoming_deadlines:
        if dl.get("type") == "interview" and dl["days_until"] <= 1:
            nudges.append({"priority": "urgent", "message": f"You have an interview{'  today' if dl['days_until'] == 0 else ' tomorrow'}: {dl['label']}. Want me to help you prep?"})
    for dl in upcoming_deadlines:
        if dl.get("type") != "interview" and 0 <= dl["days_until"] <= 2:
            nudges.append({"priority": "high", "message": f"Your deadline '{dl['label']}' is {'today' if dl['days_until'] == 0 else 'tomorrow' if dl['days_until'] == 1 else 'in 2 days'}."})
    if days_since_audit and days_since_audit > 14:
        nudges.append({"priority": "medium", "message": f"It's been {days_since_audit} days since your last audit. Your resume may have changed. Want to run a new one?"})
    if silent_apps:
        nudges.append({"priority": "medium", "message": f"No response from {', '.join(silent_apps[:3])} in 2+ weeks. Want help drafting a follow-up?"})
    if gap and gap > 0 and weakest:
        nudges.append({"priority": "medium", "message": f"You're {int(gap)} points below the {reference_company} bar. Your {weakest} score is the biggest opportunity."})
    if sum(app_counts.values()) == 0 and current_score is not None:
        nudges.append({"priority": "low", "message": "You haven't added any applications yet. Want me to help you build your pipeline?"})

    # Pull per-cohort scores from the students DB so AI knows exact field-by-field breakdown
    cohort_scores_for_ai: dict = {}
    try:
        import psycopg2, psycopg2.extras as _pge, json as _json
        _pw = os.environ.get("DILLY_DB_PASSWORD", "")
        if not _pw:
            try: _pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
            except: pass
        _sc = psycopg2.connect(
            host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
            database="dilly", user="dilly_admin", password=_pw, sslmode="require"
        )
        _scur = _sc.cursor(cursor_factory=_pge.RealDictCursor)
        _scur.execute("SELECT cohort_scores FROM students WHERE LOWER(email) = LOWER(%s)", (email,))
        _srow = _scur.fetchone()
        if _srow and _srow["cohort_scores"]:
            cs = _srow["cohort_scores"]
            if isinstance(cs, str):
                cs = _json.loads(cs)
            cohort_scores_for_ai = cs or {}
        _sc.close()
    except Exception:
        pass

    return {
        "name": name, "first_name": first_name, "cohort": cohort, "school": school,
        "major": major, "minor": minor,
        "majors_list": majors_list, "minors_list": minors_list, "interests_list": interests_list,
        "cohort_scores": cohort_scores_for_ai,
        "pronouns": pronouns, "career_goal": career_goal,
        "industry_target": industry_target, "target_companies": target_companies,
        "tagline": tagline, "bio": bio, "linkedin": linkedin,
        "current_score": current_score, "smart": smart, "grit": grit, "build": build,
        "previous_score": previous_score, "score_delta": score_delta,
        "weakest_dimension": weakest, "strongest_dimension": strongest,
        "cohort_bar": bar, "reference_company": reference_company,
        "gap": gap, "cleared_bar": cleared_bar, "dilly_take": dilly_take,
        "audit_count": audit_count, "days_since_audit": days_since_audit,
        "audit_history": audit_history,
        "app_counts": app_counts, "total_applications": sum(app_counts.values()),
        "interviewing_at": interviewing_at, "applied_companies": applied_companies[:10],
        "silent_apps": silent_apps,
        "upcoming_deadlines": upcoming_deadlines[:10],
        "has_resume": has_resume, "has_editor_resume": has_editor_resume,
        "resume_snippet": resume_text[:5000] if resume_text else "",
        "nudges": nudges,
        "profile_facts_text": profile_facts_text,
        "beyond_resume": beyond_resume,
        "experience_expansion": experience_expansion,
        "transcript_gpa": transcript_gpa,
        "transcript_courses": transcript_courses,
        "transcript_honors": transcript_honors,
        "job_locations": job_locations,
        "job_location_scope": job_location_scope,
        "target_school": target_school,
        "voice_onboarding_answers": voice_onboarding_answers,
        "voice_biggest_concern": voice_biggest_concern,
        "achievements": unlocked_achievements,
        "preProfessional": pre_professional,
        "graduation_year": graduation_year,
    }


def _build_rich_system_prompt(r: dict) -> str:
    name = r.get("name", "the student")
    cohort = r.get("cohort", "General")
    school = r.get("school", "their university")
    major = r.get("major", "")
    score = r.get("current_score")
    smart = r.get("smart", 0)
    grit = r.get("grit", 0)
    build = r.get("build", 0)
    bar = r.get("cohort_bar", 65)
    ref_company = r.get("reference_company", "top companies")
    gap = r.get("gap")
    cleared = r.get("cleared_bar", False)
    weakest = r.get("weakest_dimension")
    strongest = r.get("strongest_dimension")
    delta = r.get("score_delta")
    days_since = r.get("days_since_audit")
    dilly_take = r.get("dilly_take", "")
    apps = r.get("app_counts", {})
    total_apps = r.get("total_applications", 0)
    interviewing = r.get("interviewing_at", [])
    silent = r.get("silent_apps", [])
    deadlines = r.get("upcoming_deadlines", [])
    resume_snippet = r.get("resume_snippet", "")
    audit_history = r.get("audit_history", [])
    career_goal = r.get("career_goal", "")
    industry = r.get("industry_target", "")
    target_companies = r.get("target_companies", [])

    score_block = ""
    if score is not None:
        score_block = f"CURRENT SCORE: {int(score)}/100\nDimensions: Smart {int(smart)}, Grit {int(grit)}, Build {int(build)}\nCohort bar ({ref_company}): {int(bar)}/100\n"
        if cleared:
            score_block += "ABOVE the bar. Recruiter ready.\n"
        else:
            score_block += f"BELOW the bar by {int(gap)} points. {weakest} is the weakest dimension.\n"
        if strongest: score_block += f"Strongest dimension: {strongest}\n"
        if delta: score_block += f"Score changed by {'+' if delta > 0 else ''}{int(delta)} since last audit.\n"
        if days_since: score_block += f"Last audited {days_since} days ago.\n"
        if dilly_take: score_block += f"Last audit insight: {dilly_take}\n"
    else:
        score_block = "NO SCORE YET. Student has not run their first audit.\n"

    apps_block = ""
    if total_apps > 0:
        apps_block = f"APPLICATION PIPELINE: {total_apps} total\nSaved: {apps.get('saved',0)} | Applied: {apps.get('applied',0)} | Interviewing: {apps.get('interviewing',0)} | Offers: {apps.get('offer',0)} | Rejected: {apps.get('rejected',0)}\n"
        if interviewing: apps_block += f"Currently interviewing at: {', '.join(interviewing)}\n"
        if silent: apps_block += f"WARNING: No response from {', '.join(silent[:3])} in 2+ weeks.\n"
    else:
        apps_block = "APPLICATION PIPELINE: Empty. Student hasn't started tracking applications.\n"

    deadline_block = ""
    if deadlines:
        dl_lines = []
        for dl in deadlines[:5]:
            days = dl["days_until"]
            urgency = "TODAY" if days == 0 else "TOMORROW" if days == 1 else f"in {days} days"
            dl_lines.append(f"  - {dl['label']} ({urgency}, {dl['date']})")
        deadline_block = "UPCOMING DEADLINES:\n" + "\n".join(dl_lines) + "\n"
    else:
        deadline_block = "UPCOMING DEADLINES: None scheduled.\n"

    target_block = ""
    parts = []
    if career_goal: parts.append(f"Career goal: {career_goal}")
    if industry: parts.append(f"Industry target: {industry}")
    if target_companies: parts.append(f"Target companies: {', '.join(target_companies[:5])}")
    if parts: target_block = "CAREER TARGETS:\n" + "\n".join(f"  - {p}" for p in parts) + "\n"

    history_block = ""
    if len(audit_history) > 1:
        h_lines = [f"  - {h.get('date','?')}: {h.get('score','?')}/100" for h in audit_history[:5]]
        history_block = "SCORE HISTORY:\n" + "\n".join(h_lines) + "\n"

    resume_block = f"FULL RESUME TEXT (reference specific bullets and sections — never ask what is on their resume):\n{resume_snippet[:5000]}\n" if resume_snippet else ""

    profile_facts = r.get("profile_facts_text", "")
    profile_block = ""
    if profile_facts:
        profile_block = f"""DILLY PROFILE (what you've learned about this student beyond their resume — from conversations, onboarding, and their own additions. Reference these naturally. NEVER re-ask things you already know here):
{profile_facts}
"""

    # ── Academic profile block ────────────────────────────────────
    academic_parts: list[str] = []
    if r.get("transcript_gpa"):
        academic_parts.append(f"GPA: {r['transcript_gpa']}")
    if r.get("graduation_year"):
        academic_parts.append(f"Graduation year: {r['graduation_year']}")
    if r.get("preProfessional"):
        pre = r["preProfessional"]
        label = pre if isinstance(pre, str) else "Yes"
        academic_parts.append(f"Pre-professional track: {label}")
    if r.get("target_school"):
        academic_parts.append(f"Target graduate/professional school: {r['target_school']}")
    if r.get("transcript_courses"):
        academic_parts.append(f"Key courses: {', '.join(str(c) for c in r['transcript_courses'][:10])}")
    if r.get("transcript_honors"):
        academic_parts.append(f"Honors/Awards: {', '.join(str(h) for h in r['transcript_honors'][:10])}")
    academic_block = ""
    if academic_parts:
        academic_block = "ACADEMIC PROFILE:\n" + "\n".join(f"  - {p}" for p in academic_parts) + "\n"

    # ── Beyond resume block ───────────────────────────────────────
    beyond_block = ""
    beyond_resume = r.get("beyond_resume") or []
    experience_expansion = r.get("experience_expansion") or []
    if beyond_resume or experience_expansion:
        br_lines: list[str] = []
        if beyond_resume:
            by_type: dict[str, list[str]] = {}
            for item in beyond_resume:
                if not isinstance(item, dict):
                    continue
                t = (item.get("type") or "other").strip().lower()
                text = (item.get("text") or "").strip()[:120]
                if text:
                    by_type.setdefault(t, []).append(text)
            for t_name, label in [("skill", "Skills"), ("project", "Projects"), ("experience", "Experiences"), ("person", "People mentioned"), ("company", "Companies"), ("other", "Other")]:
                if t_name in by_type:
                    br_lines.append(f"  - {label}: {', '.join(by_type[t_name][:15])}")
        if experience_expansion:
            for entry in experience_expansion[:6]:
                if not isinstance(entry, dict):
                    continue
                role = (entry.get("role_label") or "").strip()
                org = (entry.get("organization") or "").strip()
                label_exp = f"{role} at {org}" if org else role
                if not label_exp:
                    continue
                sub: list[str] = []
                skills = [s for s in (entry.get("skills") or []) if s][:10]
                tools = [t for t in (entry.get("tools_used") or []) if t][:10]
                if skills:
                    sub.append("skills: " + ", ".join(str(s) for s in skills))
                if tools:
                    sub.append("tools: " + ", ".join(str(t) for t in tools))
                if sub:
                    br_lines.append(f"  - {label_exp}: {'; '.join(sub)}")
        if br_lines:
            beyond_block = "BEYOND THE RESUME (captured skills, tools, projects from conversations):\n" + "\n".join(br_lines) + "\n"

    # ── Preferences block ─────────────────────────────────────────
    pref_parts: list[str] = []
    if r.get("job_locations"):
        pref_parts.append(f"Preferred work locations: {', '.join(str(l) for l in r['job_locations'][:8])}")
    if r.get("job_location_scope"):
        pref_parts.append(f"Location scope: {r['job_location_scope']}")
    if r.get("voice_biggest_concern"):
        pref_parts.append(f"Biggest concern: {r['voice_biggest_concern'][:200]}")
    pref_block = ""
    if pref_parts:
        pref_block = "PREFERENCES:\n" + "\n".join(f"  - {p}" for p in pref_parts) + "\n"

    # ── Achievements block ────────────────────────────────────────
    achievements_block = ""
    achievements = r.get("achievements") or []
    if achievements:
        achievements_block = f"UNLOCKED ACHIEVEMENTS: {', '.join(str(a) for a in achievements[:15])}. Celebrate these when relevant.\n"

    # ── Cohort expertise block ────────────────────────────────────
    cohort_expertise_block = ""
    try:
        from projects.dilly.api.voice_prompt_constants import COHORT_EXPERTISE_DEEP
        from projects.dilly.academic_taxonomy import MAJOR_TO_COHORT
        # Resolve rich cohorts from major/minor
        rich_cohorts: list[str] = []
        seen_cohorts: set[str] = set()
        track_to_rich: dict[str, str] = {
            "Tech": "Software Engineering & CS", "Finance": "Finance & Accounting",
            "Consulting": "Consulting & Strategy", "Business": "Management & Operations",
            "Science": "Life Sciences & Research", "Pre-Health": "Healthcare & Clinical",
            "Pre-Law": "Law & Government", "Communications": "Media & Communications",
            "Education": "Education", "Arts": "Design & Creative Arts",
            "Humanities": "Humanities & Liberal Arts",
        }
        if cohort in track_to_rich:
            c = track_to_rich[cohort]
            if c not in seen_cohorts:
                seen_cohorts.add(c)
                rich_cohorts.append(c)
        for m in ([major] if major else []):
            c = MAJOR_TO_COHORT.get(m)
            if c and c != "General" and c not in seen_cohorts:
                seen_cohorts.add(c)
                rich_cohorts.append(c)
        if rich_cohorts:
            ce_lines = [f"You have deep expertise in {', '.join(rich_cohorts)}."]
            for rc in rich_cohorts[:3]:
                expertise = COHORT_EXPERTISE_DEEP.get(rc)
                if expertise:
                    ce_lines.append(expertise[:500])
            cohort_expertise_block = "FIELD EXPERTISE:\n" + "\n".join(ce_lines) + "\n"
    except Exception:
        pass

    # Build identity block with full majors / minors / interests / cohort scores
    _majors_list = r.get("majors_list") or ([major] if major else [])
    _minors_list = r.get("minors_list") or ([r.get("minor")] if r.get("minor") else [])
    _interests_list = r.get("interests_list") or []
    _cohort_scores = r.get("cohort_scores") or {}

    _major_str = ", ".join(_majors_list) if _majors_list else "Not specified"
    _minor_str = ", ".join(_minors_list) if _minors_list else "None"
    _interest_str = ", ".join(_interests_list) if _interests_list else "None listed"

    # Per-cohort scores block (only if we have Claude-scored entries)
    _cohort_scores_block = ""
    if _cohort_scores:
        _cs_lines = []
        for _cname, _cv in _cohort_scores.items():
            if not isinstance(_cv, dict):
                continue
            _lvl = _cv.get("level", "")
            _s = _cv.get("smart", "?")
            _g = _cv.get("grit", "?")
            _b = _cv.get("build", "?")
            _d = _cv.get("dilly_score", "?")
            _cs_lines.append(f"  - {_cname} ({_lvl}): Smart {_s}, Grit {_g}, Build {_b}, Overall {_d}")
        if _cs_lines:
            _cohort_scores_block = "PER-COHORT SCORES (how the student scores in each of their fields):\n" + "\n".join(_cs_lines) + "\nUse these when asked about scores by field. Never say 'major unknown'.\n"

    return f"""You are Dilly, an AI career coach embedded in a career acceleration app for college students. You are not just a chatbot. You are the student's personal career strategist who can see their entire dashboard.

STUDENT: {name}
{f"Pronouns: {r.get('pronouns')}" if r.get("pronouns") else ""}
School: {school}
Major(s): {_major_str}
Minor(s): {_minor_str}
Interests/Additional fields: {_interest_str}
Primary cohort: {cohort}
{f"Graduation: {r.get('graduation_year')}" if r.get("graduation_year") else ""}
{f"Tagline: {r.get('tagline')}" if r.get("tagline") else ""}

{score_block}
{_cohort_scores_block}
{apps_block}
{deadline_block}
{target_block}
{history_block}
{resume_block}
{profile_block}
{academic_block}
{beyond_block}
{pref_block}
{achievements_block}
{cohort_expertise_block}
APP FEATURES YOU CAN REFERENCE (tell the student to use these by name):
- Resume Editor: Edit resume sections with live bullet scoring. Each bullet gets scored 0-100 in real time.
- New Audit: Upload a PDF or re-audit from the editor. Shows before/after score comparison.
- Internship Tracker: Pipeline view (Saved > Applied > Interviewing > Offer > Rejected). Track companies and get interview prep.
- Calendar: Month view with deadlines, interviews, career fairs.
- Score Detail: Full breakdown of Smart/Grit/Build with evidence and recommendations.
- Leaderboard: Cohort ranking with movement indicators.
- Jobs: Matched job listings by skill alignment.
- Profile: Career card showing score, achievements, and career targets.

YOUR PERSONALITY AND RULES:
{DILLY_STYLE_RULES}

CRITICAL: {DILLY_CONTEXT_INSTRUCTIONS}""".strip()


def _build_system_prompt(mode: str, ctx: Optional[StudentContext] = None, rich: Optional[dict] = None) -> str:
    if mode == "practice":
        company = (rich or {}).get("reference_company") or (ctx.reference_company if ctx else None) or "a top company"
        name = (rich or {}).get("name") or (ctx.name if ctx else None) or "the student"
        cohort = (rich or {}).get("cohort") or (ctx.cohort if ctx else None) or "General"
        smart = ctx.smart if ctx else None
        grit = ctx.grit if ctx else None
        build = ctx.build if ctx else None
        score_note = ""
        if smart is not None and grit is not None and build is not None:
            weakest = min([("Smart", smart), ("Grit", grit), ("Build", build)], key=lambda x: x[1])
            score_note = (
                f"\n\nThe student's scores: Smart {int(smart)}, Grit {int(grit)}, Build {int(build)}. "
                f"Their weakest area is {weakest[0]} ({int(weakest[1])}). "
                f"Focus some questions on probing this weakness — but don't tell them you're doing it."
            )
        return (
            f"You are a tough but fair interviewer at {company}. "
            f"You are interviewing {name} for an internship or entry-level role in {cohort}.\n\n"
            "RULES:\n"
            "1. Ask ONE question at a time. Wait for their answer.\n"
            "2. After each answer, give 1-2 sentences of direct, honest feedback.\n"
            "3. Then ask your next question. Mix behavioral, technical, and fit questions.\n"
            "4. Be the kind of interviewer who pushes candidates to be specific — "
            "if they give a vague answer, ask a follow-up.\n"
            "5. After 5-6 questions, wrap up with brief overall feedback: "
            "what they did well, what to improve, and a score out of 10.\n\n"
            "Start by introducing yourself (use a realistic name and title) "
            f"and asking your first question about why they want to work at {company}."
            f"{score_note}"
        )

    if rich:
        return _build_rich_system_prompt(rich)

    name = (ctx.name if ctx else None) or "the student"
    cohort = (ctx.cohort if ctx else None) or "General"
    company = (ctx.reference_company if ctx else None) or "top companies"
    score = ctx.score if ctx else None
    smart = ctx.smart if ctx else None
    grit = ctx.grit if ctx else None
    build = ctx.build if ctx else None
    bar = ctx.cohort_bar if ctx else None
    score_info = f"Overall Dilly Score: {int(score)}/100. " if score else ""
    dim_info = f"Dimension scores: Smart {int(smart)}, Grit {int(grit)}, Build {int(build)}. " if (smart is not None and grit is not None and build is not None) else ""
    bar_info = f"The recruiter bar at {company} is {int(bar)}/100. " if bar and company else ""

    return (
        "You are Dilly, a career advisor who talks like a sharp, caring friend, not a textbook. "
        f"You are coaching {name}, who is in {cohort}. "
        f"{score_info}{dim_info}{bar_info}\n\n"
        "STYLE RULES (non-negotiable):\n"
        "- Talk like a real conversation. Short sentences. No walls of text.\n"
        "- MAX 3-4 sentences per response. If you need more, break it into a back-and-forth.\n"
        "- Lead with the one thing that matters most. Skip the preamble.\n"
        "- Be specific: name exact skills, companies, or actions. Never generic.\n"
        "- If you need more context, ask ONE question. Don't guess.\n"
        "- Never use em dashes. Use commas, periods, or hyphens.\n"
        "- Never say 'Great question!' or 'That's a good point.' Just answer.\n"
        "- Sound like a friend who happens to be an expert, not a corporate advisor."
    )


@router.get("/ai/context")
async def get_ai_context(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        ctx = _build_rich_context(email)
        return ctx
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Could not build context: {str(e)[:200]}")


def _run_profile_extraction_background(email: str, conv_id: str, messages: list[dict]) -> None:
    """Fire-and-forget: extract profile facts from conversation and store them.
    Runs in a background thread so it never blocks the chat response.

    Extraction failures must never surface to the user, but they MUST be logged
    so we can actually debug when memory silently stops working. Previously
    this was `except Exception: pass` which silently swallowed every failure —
    meaning if the extraction LLM call crashed, the DB write failed, or the
    prompt format drifted, we would never know until a real student noticed
    the coach forgetting things. Now we log to stderr with enough context
    (email prefix, conv_id, exception type) that the failure is findable in
    server logs, and we still never raise to the caller.
    """
    import traceback
    import sys
    import time as _time
    try:
        from projects.dilly.api.memory_extraction import run_extraction
        run_extraction(email, conv_id, messages)
    except Exception as exc:
        # Redact email to a short prefix for privacy in logs
        _email_hint = (email.split("@")[0][:6] + "***") if email and "@" in email else "unknown"
        sys.stderr.write(
            f"[memory_extraction_failed] ts={_time.time():.0f} "
            f"email={_email_hint} conv_id={conv_id[:12] if conv_id else 'none'} "
            f"exc_type={type(exc).__name__} msg={str(exc)[:200]}\n"
        )
        # Include traceback so we can find the exact line that broke
        try:
            traceback.print_exc(file=sys.stderr)
        except Exception:
            pass
        # Deliberately do not re-raise — extraction must never surface to the user


@router.post("/ai/chat", response_model=ChatResponse)
async def ai_chat(request: Request, body: ChatRequest):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="Anthropic SDK not installed. Run: pip install anthropic")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not set")

    # Always build rich context server-side from the authenticated user's profile.
    # This ensures the AI always knows the student's full profile (majors, minors,
    # resume, cohort scores, applications, deadlines) regardless of what the client sends.
    # Client-provided rich_context or system string is used only as override / fallback.
    if body.mode == "practice":
        # Interview practice mode uses a lightweight prompt
        system = _build_system_prompt(body.mode, body.student_context, body.rich_context)
    elif body.system:
        # Caller passed an explicit system string (rare — usually from desktop)
        system = body.system
    else:
        # Standard coaching: always pull full profile from DB, ignore client-side context
        try:
            _server_rich = _build_rich_context(email)
            # Merge any extra fields the client sent (e.g. reference_company from jobs screen)
            if body.rich_context and isinstance(body.rich_context, dict):
                for _k, _v in body.rich_context.items():
                    if _v and not _server_rich.get(_k):
                        _server_rich[_k] = _v
            if body.student_context:
                if body.student_context.reference_company and not _server_rich.get("reference_company"):
                    _server_rich["reference_company"] = body.student_context.reference_company
            system = _build_rich_system_prompt(_server_rich)
        except Exception:
            # Fallback to client context if server-side build fails
            system = _build_system_prompt(body.mode, body.student_context, body.rich_context)

    messages = [{"role": m.role, "content": m.content} for m in body.messages if m.role in ("user", "assistant") and m.content.strip()]
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(model=DILLY_MODEL_API, max_tokens=400, system=system, messages=messages)
        content = response.content[0].text if response.content else ""

        # ── Background profile extraction ────────────────────────────
        # Fire-and-forget: extract everything Dilly learned about the user
        # from this conversation and store it in their Dilly Profile.
        if email and len(messages) >= 2:
            import hashlib
            import threading
            conv_id = body.conv_id or hashlib.sha256(
                f"{email}:{messages[0].get('content', '')[:100]}".encode()
            ).hexdigest()[:16]
            # Include the assistant reply in the extraction context
            full_messages = messages + [{"role": "assistant", "content": content.strip()}]
            thread = threading.Thread(
                target=_run_profile_extraction_background,
                args=(email, conv_id, full_messages[-12:]),
                daemon=True,
            )
            thread.start()

        # ── Auto-attach visual cards based on response content ─────────
        visual = _detect_visual(content, body.student_context, body.mode, email)

        return ChatResponse(content=content.strip(), visual=visual)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")


def _detect_visual(content: str, ctx, mode: str, email: str) -> Optional[dict]:
    """Auto-detect which visual card to show based on the AI response content."""
    if mode == "practice":
        return None  # Interview mode is text-only

    text = content.lower()
    score = ctx.score if ctx else None
    smart = ctx.smart if ctx else None
    grit = ctx.grit if ctx else None
    build = ctx.build if ctx else None
    cohort = ctx.cohort if ctx else "General"
    bar = ctx.cohort_bar if ctx else 70

    # If discussing scores and we have data → show score breakdown
    score_keywords = ["your score", "smart score", "grit score", "build score", "dilly score", "your smart", "your grit", "your build"]
    if any(kw in text for kw in score_keywords) and smart is not None and grit is not None and build is not None:
        return {
            "type": "score_breakdown",
            "overall": int(score or ((smart + grit + build) / 3)),
            "smart": int(smart),
            "grit": int(grit),
            "build": int(build),
            "bar": int(bar or 70),
            "cohort": str(cohort),
        }

    # If giving a weekly plan or step-by-step plan → show weekly plan card
    plan_keywords = ["this week", "your plan", "here's what to do", "step 1", "day 1", "monday", "tuesday"]
    if any(kw in text for kw in plan_keywords):
        # Try to extract numbered steps
        steps = re.findall(r'(?:^|\n)\s*(?:\d+[\.\)]\s*|[-*]\s*)(.*?)(?=\n|$)', content)
        if len(steps) >= 3:
            days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            plan_days = []
            for i, step in enumerate(steps[:7]):
                plan_days.append({
                    "day": days[i] if i < len(days) else f"Day {i+1}",
                    "task": step.strip()[:100],
                })
            return {
                "type": "weekly_plan",
                "title": "YOUR ACTION PLAN",
                "days": plan_days,
            }

    # If recommending the editor, audit, or other app features → action buttons
    action_keywords = {
        "open the editor": ("/(app)/resume-editor", "Open Resume Editor"),
        "run an audit": ("/(app)/new-audit", "Run Audit"),
        "resume editor": ("/(app)/resume-editor", "Open Resume Editor"),
        "tailor your resume": ("/(app)/resume-editor", "Tailor Resume"),
        "check the jobs": ("/(app)/jobs", "Browse Jobs"),
        "practice interview": ("/(app)/interview-practice", "Practice Interview"),
    }
    buttons = []
    for keyword, (route, label) in action_keywords.items():
        if keyword in text and not any(b["label"] == label for b in buttons):
            buttons.append({"label": label, "route": route})
    if buttons:
        return {"type": "action_buttons", "buttons": buttons[:3]}

    # If discussing a before/after bullet rewrite → bullet comparison
    before_after = re.findall(r'(?:before|original|old)[:\s]*["\u201c](.+?)["\u201d]', text, re.IGNORECASE) if True else []
    before_match = re.search(r'(?:before|original|old)[:\s]*["\u201c](.+?)["\u201d]', text, re.IGNORECASE)
    after_match = re.search(r'(?:after|improved|new|rewritten)[:\s]*["\u201c](.+?)["\u201d]', text, re.IGNORECASE)
    if before_match and after_match:
        return {
            "type": "bullet_comparison",
            "before": before_match.group(1)[:200],
            "after": after_match.group(1)[:200],
            "dimension": "overall",
            "impact": "Stronger action verb + quantified metric",
        }

    # If the AI learned something new about the user → profile update visual
    profile_keywords = ["i'll remember", "i've noted", "saved to your profile", "added to your dilly",
                        "i'll keep that in mind", "noted!", "got it, i", "i've saved"]
    if any(kw in text for kw in profile_keywords):
        learned = re.search(r'(?:you|your)\s+(\w+(?:\s+\w+){1,8})', content[:400])
        if learned:
            return {
                "type": "profile_update",
                "category": "general",
                "label": "Added to your Dilly",
                "value": learned.group(0)[:120],
                "icon": "sparkles",
                "color": "#1652F0",
            }

    return None
