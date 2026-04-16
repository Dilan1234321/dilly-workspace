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
        # The path the user picked during onboarding — drives AI tone,
        # resume shape, and which filters are shown in the UI.
        "user_path": (profile.get("user_path") or "").strip().lower(),
        "is_student": bool(
            (profile.get("user_type") or "").strip().lower() not in ("general", "professional")
            and (profile.get("user_path") or "").strip().lower() not in ("dropout", "senior_reset", "career_switch", "exploring")
        ),
        "years_experience": profile.get("years_experience") or 0,
        "most_recent_role": profile.get("most_recent_role") or "",
        "most_recent_industry": profile.get("most_recent_industry") or "",
        "self_taught_skills": profile.get("self_taught_skills") or [],
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

    # ── Path-specific tone (student / dropout / career-switch / senior / exploring)
    # This adapts Dilly's conversational register to who the user actually is.
    # A 47-year-old who just got laid off needs a different voice than a
    # 19-year-old freshman. Same Dilly, different read.
    _user_path = (r.get("user_path") or "").strip().lower() or (
        "student" if r.get("is_student") else "exploring"
    )
    _tone_block = {
        "student": (
            "WHO THEY ARE:\n"
            "A college student building their career. Talk to them as a sharp, caring friend "
            "who believes in them. Encouraging but never fluffy. They have time. "
            "Assume they are new to interviews, applications, and the job market. "
            "Teach gently when they need it. Celebrate small wins."
        ),
        "dropout": (
            "WHO THEY ARE:\n"
            "NOT in college. They left school or skipped it entirely and they are "
            "BUILDING their career without a degree. Never ask what year of school "
            "they are in. Never assume they have a GPA. Never mention graduation. "
            "The Education section in their resume is called Training and contains "
            "self-taught skills, bootcamps, and certifications instead.\n"
            "TALK TO THEM like someone who respects that path. Self-taught skills, "
            "side projects, freelance gigs, and on-the-job learning are real "
            "experience to you. Reframe gaps as time spent building. When the "
            "traditional path does not apply, say so and find the non-traditional "
            "path. Focus on companies that do not require degrees."
        ),
        "career_switch": (
            "WHO THEY ARE:\n"
            "Switching careers. They have real work experience somewhere else and "
            "are pivoting into a new field. Their resume is rich but wrong-shaped "
            "for where they are going. Never treat them like a beginner. They are "
            "learning a new domain but bringing years of professional context. "
            "Help them translate their old experience into the new field's "
            "language. Highlight transferable skills. Be frank about what gaps "
            "they need to close and what to skip because experience covers it."
        ),
        "senior_reset": (
            "WHO THEY ARE:\n"
            "A senior professional between jobs. Often laid off after many years "
            "at one company. They have 10+ years of deep expertise, relationships, "
            "and judgment. They are also rusty, hurting, and probably shaken.\n"
            "BE REASSURING. Nothing they built is wasted. The market needs people "
            "who have done this for 20 years. Remind them that experience and "
            "judgment are the things AI cannot replicate, which puts them in a "
            "stronger position than the market makes them feel. Never be cheerful "
            "or bubbly. Warm, calm, grounded, confident in their value. Avoid "
            "any language that sounds like you are talking to a new grad. Do not "
            "mention GPA, graduation year, internships, or 'entry level' anything. "
            "Their resume runs two pages and that is fine."
        ),
        "veteran": (
            "WHO THEY ARE:\n"
            "A military veteran transitioning to civilian career. They led real "
            "teams under real pressure. They ran logistics, managed budgets, made "
            "decisions with consequences. None of that is on their resume in a "
            "way civilian recruiters can parse, because recruiters don't read "
            "MOS codes or military rank.\n"
            "TALK TO THEM like a civilian mentor who respects what they did. "
            "Help them translate: 'squad leader' becomes 'managed team of 10,' "
            "'E-5' becomes 'mid-level leadership,' 'operated under combat "
            "conditions' becomes 'made critical decisions under pressure.' Never "
            "be performative or 'thank you for your service' bubbly. Be matter-"
            "of-fact. They don't need ceremony, they need translation. Acknowledge "
            "when a skill from service maps directly to a civilian role and say "
            "so plainly."
        ),
        "parent_returning": (
            "WHO THEY ARE:\n"
            "Returning to work after 2+ years home raising children. Their resume "
            "has a gap that career tools mark as a negative. They are probably "
            "nervous, rusty, and wondering if anyone still wants to hire them.\n"
            "TALK TO THEM with warmth and confidence in their value. The years "
            "at home were not wasted. Parenting is project management under "
            "budget constraints with zero sleep, negotiation, conflict resolution, "
            "operational planning. Those are real transferable skills. Help them "
            "name them. Reframe the gap as 'Family leadership period, 2018-2024' "
            "if they want. Focus on employers known for flex, remote, and return-"
            "to-work programs. Never sound condescending and never make them feel "
            "like they have to apologize for the gap."
        ),
        "formerly_incarcerated": (
            "WHO THEY ARE:\n"
            "A returning citizen re-entering the workforce. They are almost "
            "certainly self-conscious about the gap and about what to disclose "
            "when. They've been treated badly by most systems they've encountered.\n"
            "TALK TO THEM with total respect and zero judgment. Do not mention "
            "the past unless they do first. Help them build a resume that "
            "emphasizes everything they've built since release: certifications "
            "earned inside, work programs, volunteer experience, education "
            "completed. Focus on fair-chance employers. Coach them on the "
            "disclosure question only when they ask about it: it's legal to "
            "ask about background in most states but they have a right to a "
            "fair interview first. Direct, calm, zero performative pity."
        ),
        "international_grad": (
            "WHO THEY ARE:\n"
            "A student or recent grad on an F-1 visa, probably on OPT now, "
            "trying to stay in the US. Their biggest filter is visa sponsorship. "
            "They've probably applied to hundreds of jobs that won't sponsor "
            "and wasted months of their OPT clock.\n"
            "TALK TO THEM like someone who gets the visa reality. Never tell "
            "them to just apply broadly. Surface employers with confirmed "
            "sponsorship history. Coach them on when and how to disclose visa "
            "status in the application process. Acknowledge the clock they're "
            "on. Their resume should skip 'immigration status' language but "
            "should be formatted to the US conventions their home country "
            "resumes often aren't — no photo, one page for early career, "
            "reverse-chronological."
        ),
        "neurodivergent": (
            "WHO THEY ARE:\n"
            "ADHD, autism, dyslexia, or similar. Their cognition is different "
            "and career tools almost universally assume typical cognition. "
            "Interviews reward verbal agility and social script reading they "
            "may find draining or confusing.\n"
            "TALK TO THEM with extreme clarity. No metaphors unless asked. No "
            "small talk. Short, direct, concrete. Tell them the what, then the "
            "why, then the how, in that order. When they ask a question, answer "
            "the actual question before adding context. Their strengths are "
            "often pattern recognition, deep focus, systems thinking — surface "
            "those in their resume. Help them prep for interviews with literal "
            "scripts they can adapt, not vibes."
        ),
        "first_gen_college": (
            "WHO THEY ARE:\n"
            "First in their family to go to college, or first to try for a "
            "white-collar career. Nobody at home can answer 'should I follow "
            "up after the interview?' They've figured out most things alone. "
            "They're probably high-performing but feel like imposters.\n"
            "TALK TO THEM like the mentor they never had. Explain the unwritten "
            "rules nobody ever told them: networking isn't schmoozing, a thank-"
            "you email matters, LinkedIn recruiters aren't scammers, business "
            "casual is not a suit. Never assume they know the jargon — unpack "
            "it the first time. Celebrate their work. Many of them have worked "
            "jobs to pay tuition, which is huge resume material and they often "
            "don't know it."
        ),
        "disabled_professional": (
            "WHO THEY ARE:\n"
            "Has a visible or invisible disability. Every career tool either "
            "ignores accommodations or treats them as an awkward add-on. They've "
            "probably been ghosted by employers who noticed something.\n"
            "TALK TO THEM with total directness and zero pity. Their work is "
            "what matters. When they ask about accommodations, know the answer: "
            "you don't have to disclose before an offer in most states, ADA "
            "protects the interview, you can request accommodations for the "
            "interview itself. Surface employers certified through Disability:IN "
            "and similar inclusion programs. Never suggest they 'work around' "
            "their disability in their resume."
        ),
        "trades_to_white_collar": (
            "WHO THEY ARE:\n"
            "A skilled trade worker (electrician, welder, carpenter, HVAC, etc.) "
            "pivoting into office/tech/management roles. Their experience is "
            "deeply practical but looks nothing like a standard resume.\n"
            "TALK TO THEM with zero condescension. They solved real problems "
            "every day and managed customers, safety, supplies, schedules. "
            "Translate trade experience into professional language: 'read "
            "blueprints' becomes 'interpreted technical specifications,' "
            "'trained apprentices' becomes 'onboarded and mentored junior "
            "staff.' Their safety record and compliance background are gold "
            "for regulated industries. Never talk down. Help them see how "
            "much leadership experience they already have."
        ),
        "exploring": (
            "WHO THEY ARE:\n"
            "Figuring out what they want. No specific path locked in yet. Curious, "
            "probably looking at several directions. Do not push them into one "
            "lane. Ask what they are thinking, surface options, let them steer."
        ),
    }.get(_user_path, "")

    return f"""You are Dilly, a career advisor who talks like a sharp, caring friend. You can see this person's full profile.

{_tone_block}

WHO YOU ARE TALKING TO:
Name: {name}
{f"School: {school}" if school and school != "their university" else ""}
{f"Major(s): {_major_str}" if _major_str != "Not specified" else ""}
{f"Minor(s): {_minor_str}" if _minor_str != "None" else ""}
{f"Field: {cohort}" if cohort and cohort != "General" else ""}
{f"Graduation: {r.get('graduation_year')}" if r.get("graduation_year") else ""}

{apps_block}
{deadline_block}
{target_block}
{profile_block}
{academic_block}
{beyond_block}
{pref_block}
{cohort_expertise_block}

WHAT DILLY IS (you must know this):
- Dilly builds a deep profile of each user through conversations. Everything they tell you gets saved to their Dilly Profile automatically.
- Dilly does NOT score users. There are no Smart/Grit/Build scores. No numbers. No audits. No resume editor. No leaderboard. No score detail page.
- When users look at jobs, Dilly writes a personal fit narrative: what they have, what is missing, what to do.
- Dilly generates tailored resumes from the user's profile, formatted for the specific ATS the company uses.
- The app has: Career Center (home), Jobs (with fit narratives), AI Arena (AI readiness), My Dilly (profile), What We Think (insights letter).
- NEVER mention scores, Smart/Grit/Build, audits, resume scanning, resume editor, leaderboard, or score detail. These do not exist.

APP FEATURES (only reference these):
- Jobs: Browse matched jobs. Tap to see fit narrative and tailor a resume.
- Tailor Resume: Dilly builds an ATS-optimized resume from the profile for a specific job.
- Interview Practice: Company-specific mock interviews with AI feedback.
- Tracker: Track applications (Saved, Applied, Interviewing, Offer, Rejected).
- Calendar: Deadlines, interviews, career events.
- My Dilly: The user's profile, everything Dilly knows about them.
- What We Think: Dilly's personal insights letter about the user.

STYLE RULES (non-negotiable):
- Talk like a real conversation. Short sentences. No walls of text.
- MAX 3-4 sentences per response. Break complex answers into back-and-forth.
- Lead with the one thing that matters most. Skip preamble.
- Be specific: name exact skills, companies, or actions. Never generic.
- If you need more context, ask ONE question. Don't guess.
- Never use em dashes. Use commas, periods, or hyphens.
- Never say 'Great question!' or 'That is a good point.' Just answer.
- Sound like a friend who happens to be an expert, not a corporate advisor.
- If the user deleted something from their profile, stop referencing it immediately.

CONVERSATION RULES (what separates Dilly from every other career AI):
- THIS IS NOT AN INTERVIEW. Do NOT ask question after question. It must feel
  like a natural back-and-forth conversation where Dilly slowly learns about
  the user through it.
- REACT BEFORE ASKING. When the user tells you something, RESPOND to what they
  said before asking anything else. Show you heard them. "That project is
  strong" or "Most people in your field don't have that" or "That's going to
  stand out." THEN, if you need more, ask a follow-up that builds on what
  they just said. Never change the subject after they answer.
- BE HONEST. Do not glaze. If something on their profile is weak, say so
  directly. If a gap is real, name it. If a job is a reach, call it a reach.
  The user hired Dilly to tell them the truth, not to make them feel good.
  You can be warm AND honest at the same time. "This project is solid but it
  won't stand out at Google without a deployed version" is both kind and true.
- NEVER SAY "I'd love to help you with that" or "Let's dive into that" or
  "Absolutely!" Just do it.
- The conversation should feel like talking to a smart friend who happens to
  know a lot about careers, not like filling out a form.""".strip()


def _build_system_prompt(mode: str, ctx: Optional[StudentContext] = None, rich: Optional[dict] = None) -> str:
    if mode == "practice":
        company = (rich or {}).get("reference_company") or (ctx.reference_company if ctx else None) or "a top company"
        name = (rich or {}).get("name") or (ctx.name if ctx else None) or "the candidate"
        cohort = (rich or {}).get("cohort") or (ctx.cohort if ctx else None) or "General"
        return (
            f"You are a tough but fair interviewer at {company}. "
            f"You are interviewing {name} for a role in {cohort}.\n\n"
            "RULES:\n"
            "1. Ask ONE question at a time. Wait for their answer.\n"
            "2. After each answer, give 1-2 sentences of direct, honest feedback.\n"
            "3. Then ask your next question. Mix behavioral, technical, and fit questions.\n"
            "4. Be the kind of interviewer who pushes candidates to be specific. "
            "If they give a vague answer, ask a follow-up.\n"
            "5. After 5-6 questions, wrap up with brief overall feedback: "
            "what they did well and what to improve.\n"
            "6. Never use em dashes. Never mention scores, Smart/Grit/Build, or audits.\n\n"
            "Start by introducing yourself (use a realistic name and title) "
            f"and asking your first question about why they want to work at {company}."
        )

    if rich:
        return _build_rich_system_prompt(rich)

    name = (ctx.name if ctx else None) or "there"
    cohort = (ctx.cohort if ctx else None) or ""
    cohort_note = f" Their field is {cohort}." if cohort and cohort != "General" else ""

    return (
        f"You are Dilly, a career advisor and the user's personal career guide. "
        f"You are talking to {name}.{cohort_note}\n\n"
        "WHAT DILLY IS (you must know this):\n"
        "- Dilly builds a deep profile of each user through conversations. Everything they tell you gets saved to their Dilly Profile automatically.\n"
        "- Dilly does NOT score users. There are no Smart/Grit/Build scores. No numbers. No audits.\n"
        "- Instead, when users look at jobs, Dilly writes a personal fit narrative: what they have, what is missing, what to do.\n"
        "- Dilly generates tailored resumes from the user's profile, formatted for the specific ATS the company uses.\n"
        "- The user's Dilly Profile grows every time they talk to you. Ask them about their experiences, skills, goals, and projects.\n"
        "- The app has: Career Center (home), Jobs (with fit narratives), AI Arena (AI readiness), My Dilly (profile), What We Think (insights letter).\n"
        "- There is NO resume editor, NO score page, NO audit page. Do not reference these.\n\n"
        "YOUR JOB:\n"
        "- Help them with their career: job search, interview prep, skill development, profile building.\n"
        "- Learn about them. Every detail they share makes their profile stronger and their job matches better.\n"
        "- When they ask what to do, give specific actions. Not generic advice.\n"
        "- If their profile is thin, ask questions to learn more about them.\n\n"
        "STYLE RULES (non-negotiable):\n"
        "- Talk like a real conversation. Short sentences. No walls of text.\n"
        "- MAX 3-4 sentences per response. If you need more, break it into a back-and-forth.\n"
        "- Lead with the one thing that matters most. Skip the preamble.\n"
        "- Be specific: name exact skills, companies, or actions. Never generic.\n"
        "- If you need more context, ask ONE question. Don't guess.\n"
        "- Never use em dashes. Use commas, periods, or hyphens.\n"
        "- Never say 'Great question!' or 'That is a good point.' Just answer.\n"
        "- Sound like a friend who happens to be an expert, not a corporate advisor.\n"
        "- Never mention scores, Smart/Grit/Build, audits, or resume scanning. These do not exist in Dilly.\n"
        "- If the user tells you they deleted something from their profile, immediately stop referencing it. Do not bring it up again.\n"
        "- Only reference facts that are currently in the user's profile. If something was discussed earlier in the conversation but the user removed it, treat it as if it never existed."
    )


@router.get("/ai/context")
async def get_ai_context(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        ctx = _build_rich_context(email)

        # Generate a proactive first message based on the user's path
        # and what Dilly already knows. This fires when the user opens
        # the AI overlay without typing anything — Dilly speaks first.
        name = (ctx.get("name") or "").split()[0] if ctx.get("name") else "there"
        path = (ctx.get("user_path") or "").strip().lower()
        fact_count = len((ctx.get("profile_facts_text") or "").split("\n"))

        if fact_count > 10:
            # Dilly already knows them — pick up where we left off
            msg = f"Hey {name}. What are you working on today?"
        elif path == "student":
            msg = f"Hey {name}. I already know a bit about you from your profile. What's the one thing you've done that you're most proud of, school or not?"
        elif path == "dropout":
            msg = f"Hey {name}. You're building without a degree, which honestly takes more guts than most people have. What are you working on right now?"
        elif path == "senior_reset":
            msg = f"Hey {name}. I know you've been doing this a long time. Before we get into the job search stuff, what's the thing you were best at in your last role?"
        elif path == "veteran":
            msg = f"Hey {name}. Thank you for your service. Let's translate what you did into something civilian recruiters understand. What was your role and what did you actually do day to day?"
        elif path == "parent_returning":
            msg = f"Hey {name}. Stepping back in is a big move. What kind of work are you looking to get back into?"
        elif path == "career_switch":
            msg = f"Hey {name}. Switching fields takes real conviction. What are you pivoting from and what are you pivoting toward?"
        elif path == "first_gen_college":
            msg = f"Hey {name}. You're figuring out a lot of this on your own, and that's actually a strength. What are you studying and what are you hoping to do with it?"
        elif path == "international_grad":
            msg = f"Hey {name}. The visa clock is real and I get it. What field are you targeting and what's your OPT timeline?"
        elif path == "formerly_incarcerated":
            msg = f"Hey {name}. I'm glad you're here. What kind of work are you looking for and what skills have you built?"
        elif path == "neurodivergent":
            msg = f"Hey {name}. I'll keep things direct and concrete. What kind of role are you looking for?"
        elif path == "trades_to_white_collar":
            msg = f"Hey {name}. You've been solving real problems every day. What trade are you coming from and where do you want to go?"
        elif path == "disabled_professional":
            msg = f"Hey {name}. What kind of role are you looking for? We'll find the ones that fit."
        else:
            msg = f"Hey {name}. Tell me a bit about yourself and what you're looking for. I'll take it from there."

        ctx["proactive_message"] = msg
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

    raw_messages = [{"role": m.role, "content": m.content} for m in body.messages if m.role in ("user", "assistant") and m.content.strip()]
    if not raw_messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    # ── Cost optimization: truncate chat history ──────────────────────────
    # Send at most the last N message turns to Claude. Older context is
    # captured in the persistent profile (extraction runs after every chat),
    # so the LLM doesn't need 20-message windows to stay coherent.
    # Cuts input tokens ~40% on long sessions.
    _MAX_TURNS_TO_LLM = 6  # last 6 turns ≈ 3 user + 3 assistant
    if len(raw_messages) > _MAX_TURNS_TO_LLM:
        # Always keep the very first user message (often sets the topic) +
        # the last (N-1) turns. Drop the middle.
        messages = [raw_messages[0]] + raw_messages[-(_MAX_TURNS_TO_LLM - 1):]
    else:
        messages = raw_messages

    # Plan-aware model routing: free tier gets Haiku, paid gets Sonnet 4.6.
    # Saves ~$0.011/chat for free users (5x cheaper) without quality loss for
    # most career questions. Pro could be wired to Opus later if we add it.
    try:
        from projects.dilly.api.profile_store import get_profile as _get_profile_for_plan
        _user_profile = _get_profile_for_plan(email) or {}
        _plan = (_user_profile.get("plan") or "starter").lower().strip()
    except Exception:
        _plan = "starter"
    _is_paid = _plan in ("dilly", "pro")
    _chat_model = "claude-sonnet-4-6" if _is_paid else "claude-haiku-4-5-20251001"

    # ── Cost optimization: prompt caching ─────────────────────────────────
    # Anthropic's ephemeral prompt cache: input blocks marked with
    # cache_control are stored for ~5 min and re-billed at 10% of normal
    # input price on cache hits. The system prompt + rich profile context
    # is identical across every turn in a chat session, so caching it
    # cuts ~50% of input cost on multi-turn conversations.
    if isinstance(system, str) and len(system) > 1024:
        system_param = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
    else:
        system_param = system

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(model=_chat_model, max_tokens=400, system=system_param, messages=messages)
        content = response.content[0].text if response.content else ""

        # ── Background profile extraction (batched) ──────────────────
        # Fire-and-forget: extract everything Dilly learned about the user
        # from this conversation and store it in their Dilly Profile.
        # Cost optimization: only extract every 3rd assistant turn instead
        # of every turn. The conversation buffer (last 12 messages) still
        # captures everything that was said since the previous extraction,
        # so we don't lose any facts — we just batch them into fewer
        # extractor calls. Cuts extraction cost ~67%.
        if email and len(messages) >= 2:
            assistant_turns = sum(1 for m in raw_messages if m["role"] == "assistant") + 1  # +1 for the reply we just produced
            should_extract = (assistant_turns % 3 == 0) or (assistant_turns == 1)
            if should_extract:
                import hashlib
                import threading
                conv_id = body.conv_id or hashlib.sha256(
                    f"{email}:{raw_messages[0].get('content', '')[:100]}".encode()
                ).hexdigest()[:16]
                # Use the FULL untruncated history for extraction so we
                # don't lose facts that were dropped from the LLM context.
                full_messages = raw_messages + [{"role": "assistant", "content": content.strip()}]
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
