"""
Resume editor endpoints.
GET  /resume/edited               — load user's saved edited resume (structured sections JSON)
POST /resume/save                 — save edited resume sections back to disk
POST /resume/audit                — re-audit from the saved edited resume text (no file upload needed)
GET  /resume/variants             — list all resume variants (cohort tabs + job-tailored)
POST /resume/variants             — create a new variant
GET  /resume/variants/{id}        — load variant content
PUT  /resume/variants/{id}        — save variant content
PATCH /resume/variants/{id}       — rename variant
DELETE /resume/variants/{id}      — delete variant
POST /resume/generate             — AI-generate a job-tailored resume (uses Dilly Profile)
"""
import asyncio
import json
import os
import re as _re
import sys
import time
import uuid as _uuid_mod

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Body, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse, Response
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from projects.dilly.api import deps, errors
from projects.dilly.api.profile_store import get_profile_folder_path, ensure_profile_exists

router = APIRouter(tags=["resume"])

# ---------------------------------------------------------------------------
# Resume generation plan limits (per calendar month)
# ---------------------------------------------------------------------------
# Starter is 0. Resume generation is a Haiku call that produces a
# full ATS-tailored resume (~$0.02/call) — two of those per free
# user per month is ~$0.04 leaked. Pushed to paid feature; the
# mobile client shows an upgrade prompt on 402.
_RESUME_PLAN_LIMITS = {"starter": 0, "building": 5, "dilly": 30, "pro": -1}

def _resume_plan_limit(plan: str) -> int:
    return _RESUME_PLAN_LIMITS.get((plan or "starter").lower().strip(), 0)


_RESUME_COLUMNS_ENSURED = False

def _ensure_resume_columns() -> None:
    """Idempotently create resume_count_month / _reset_date columns on the
    users table if they're missing. Runs at most once per process.

    Belt-and-suspenders: the cron.py bootstrap creates these, but if the
    endpoint is hit before /cron/setup-users-table has run (e.g. first
    deploy of this feature), the SELECT crashes with UndefinedColumn and
    the whole generate endpoint returns 500 'Generation Failed'. This
    guards against that."""
    global _RESUME_COLUMNS_ENSURED
    if _RESUME_COLUMNS_ENSURED:
        return
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_count_month INTEGER DEFAULT 0"
            )
            cur.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_count_reset_date TEXT DEFAULT ''"
            )
        _RESUME_COLUMNS_ENSURED = True
    except Exception as _e:
        # Never block the endpoint on a migration failure.
        import sys as _s
        _s.stderr.write(f"[_ensure_resume_columns] failed: {_e}\n")


def _get_resume_usage(email: str) -> tuple[int, str]:
    """Return (count_this_month, reset_iso). Resets on month rollover.
    Safe to call even if the resume-counter columns don't exist yet."""
    import datetime as _dt
    from projects.dilly.api.database import get_db
    today = _dt.date.today()
    month_start = today.replace(day=1).isoformat()
    _ensure_resume_columns()
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT resume_count_month, resume_count_reset_date FROM users WHERE email = %s",
                (email,),
            )
            row = cur.fetchone()
            if not row:
                return 0, month_start
            count, reset = row
            if not reset or str(reset) < month_start:
                return 0, month_start
            return int(count or 0), str(reset)
    except Exception as _e:
        # Column missing, transient DB error, etc. — fail open (no cap).
        import sys as _s
        _s.stderr.write(f"[_get_resume_usage] {type(_e).__name__}: {_e}\n")
        return 0, month_start


def _increment_resume_count(email: str) -> int:
    import datetime as _dt
    from projects.dilly.api.database import get_db
    today = _dt.date.today()
    month_start = today.replace(day=1).isoformat()
    _ensure_resume_columns()
    used, _reset = _get_resume_usage(email)
    new_count = used + 1
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "UPDATE users SET resume_count_month = %s, resume_count_reset_date = %s WHERE email = %s",
                (new_count, month_start, email),
            )
    except Exception as _e:
        import sys as _s
        _s.stderr.write(f"[_increment_resume_count] {type(_e).__name__}: {_e}\n")
    return new_count


@router.get("/resume/generate/usage")
async def resume_generate_usage(request: Request):
    """Read-only ticker for the resume page header."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    from projects.dilly.api.profile_store import get_profile as _gp
    plan = ((_gp(email) or {}).get("plan") or "starter").lower().strip()
    limit = _resume_plan_limit(plan)
    used, _ = _get_resume_usage(email)
    return {
        "plan": plan,
        "used": used,
        "limit": limit,
        "remaining": -1 if limit < 0 else max(0, limit - used),
        "unlimited": limit < 0,
    }

_RESUME_EDITED_FILENAME = "resume_edited.json"
_VARIANTS_MANIFEST_FILENAME = "resume_variants.json"
_MAX_BULLET_LEN = 600
_MAX_FIELD_LEN = 300
_MAX_SECTIONS = 20
_MAX_ENTRIES_PER_SECTION = 30
_MAX_BULLETS_PER_ENTRY = 20


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

def _gen_id() -> str:
    return _uuid_mod.uuid4().hex[:8]


class BulletItem(BaseModel):
    id: str = Field(default_factory=_gen_id)
    text: str = ""


class ExperienceEntry(BaseModel):
    id: str = Field(default_factory=_gen_id)
    company: Optional[str] = ""
    role: Optional[str] = ""
    date: Optional[str] = ""
    location: Optional[str] = ""
    bullets: List[BulletItem] = Field(default_factory=list)


class EducationEntry(BaseModel):
    id: str = Field(default_factory=_gen_id)
    university: Optional[str] = ""
    major: Optional[str] = ""
    minor: Optional[str] = ""
    graduation: Optional[str] = ""
    location: Optional[str] = ""
    honors: Optional[str] = ""
    gpa: Optional[str] = ""


class ProjectEntry(BaseModel):
    id: str = Field(default_factory=_gen_id)
    name: Optional[str] = ""
    date: Optional[str] = ""
    location: Optional[str] = ""
    bullets: List[BulletItem] = Field(default_factory=list)


class ContactSection(BaseModel):
    name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    location: Optional[str] = ""
    linkedin: Optional[str] = ""


class SimpleSection(BaseModel):
    """For Skills, Honors, Certifications, Summary, Coursework, Publications — free-text lines."""
    id: str = Field(default_factory=_gen_id)
    lines: List[str] = Field(default_factory=list)


class ResumeSection(BaseModel):
    """One canonical section of the resume."""
    key: str  # e.g. "contact", "education", "professional_experience", "skills"
    label: str = ""  # display label (defaulted so older clients that omit it don't 422)
    # Only one of these is set, depending on key
    contact: Optional[ContactSection] = None
    education: Optional[EducationEntry] = None
    experiences: Optional[List[ExperienceEntry]] = None
    projects: Optional[List[ProjectEntry]] = None
    simple: Optional[SimpleSection] = None


class SaveResumeRequest(BaseModel):
    sections: List[ResumeSection]
    source_audit_id: Optional[str] = None  # which audit this was derived from


class SaveResumeResponse(BaseModel):
    ok: bool = True
    saved_at: str
    section_count: int


class ResumeAuditRequest(BaseModel):
    application_target: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resume_path(email: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        return ""
    return os.path.join(folder, _RESUME_EDITED_FILENAME)


def _load_resume(email: str) -> dict | None:
    path = _resume_path(email)
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _save_resume(email: str, data: dict) -> None:
    path = _resume_path(email)
    if not path:
        raise ValueError("Invalid email")
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _sections_to_text(sections: List[ResumeSection]) -> str:
    """Reconstruct plain-ish resume text from structured sections for re-audit."""
    lines: List[str] = []

    for sec in sections:
        if sec.key == "contact" and sec.contact:
            c = sec.contact
            if c.name:
                lines.append(c.name)
            parts = []
            if c.email:
                parts.append(c.email)
            if c.phone:
                parts.append(c.phone)
            if c.location:
                parts.append(c.location)
            if c.linkedin:
                parts.append(c.linkedin)
            if parts:
                lines.append(" | ".join(parts))
            lines.append("")

        elif sec.key == "education" and sec.education:
            lines.append("EDUCATION")
            e = sec.education
            if e.university:
                lines.append(e.university + (" | " + e.location if e.location else ""))
            if e.major:
                lines.append(e.major)
            if e.minor:
                lines.append("Minor: " + e.minor)
            if e.graduation:
                lines.append("Expected: " + e.graduation)
            if e.gpa:
                lines.append("GPA: " + e.gpa)
            if e.honors and e.honors != "Not honors":
                lines.append(e.honors)
            lines.append("")

        elif sec.key in ("professional_experience", "research", "campus_involvement", "volunteer_experience") and sec.experiences:
            lines.append(sec.label.upper())
            for entry in sec.experiences:
                if entry.company:
                    lines.append(entry.company + (" | " + entry.location if entry.location else ""))
                if entry.role:
                    lines.append(entry.role)
                if entry.date:
                    lines.append(entry.date)
                for b in entry.bullets:
                    if b.text.strip():
                        t = b.text.strip()
                        lines.append(("• " + t) if not t.startswith("•") else t)
                lines.append("")

        elif sec.key == "projects" and sec.projects:
            lines.append("PROJECTS")
            for proj in sec.projects:
                header = proj.name or ""
                if proj.date:
                    header += " | " + proj.date
                lines.append(header)
                for b in proj.bullets:
                    if b.text.strip():
                        t = b.text.strip()
                        lines.append(("• " + t) if not t.startswith("•") else t)
                lines.append("")

        elif sec.simple:
            lines.append(sec.label.upper())
            for ln in sec.simple.lines:
                if ln.strip():
                    lines.append(ln)
            lines.append("")

    return "\n".join(lines).strip()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/resume/edited")
async def get_edited_resume(request: Request):
    """Load user's saved edited resume sections. Returns null if none saved yet."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    data = _load_resume(email)
    return {"resume": data}


@router.post("/resume/import-linkedin")
async def import_linkedin(request: Request, file: UploadFile = File(None), body: dict = Body(None)):
    """
    Import a resume from a LinkedIn PDF export or pasted LinkedIn text.
    Returns structured sections matching the editor's ResumeSection shape.

    Two modes:
      - Upload: multipart with a 'file' field (the LinkedIn PDF)
      - Paste: JSON body with {"text": "...pasted LinkedIn text..."}
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from dilly_core.linkedin_import import parse_linkedin_pdf, parse_linkedin_text

    result = None
    if file and file.filename:
        # PDF upload mode
        pdf_bytes = await file.read()
        if len(pdf_bytes) < 100:
            raise errors.validation_error("File too small to be a LinkedIn PDF.")
        if len(pdf_bytes) > 10 * 1024 * 1024:
            raise errors.validation_error("File too large (max 10MB).")
        result = parse_linkedin_pdf(pdf_bytes)
    elif body and body.get("text"):
        # Pasted text mode
        text = str(body["text"]).strip()
        if len(text) < 50:
            raise errors.validation_error("Text too short. Paste your full LinkedIn profile.")
        result = parse_linkedin_text(text)
    else:
        raise errors.validation_error("Upload a LinkedIn PDF or paste your LinkedIn text.")

    if not result or not result.get("sections"):
        raise errors.internal("Could not parse the LinkedIn data. Try uploading the PDF instead of pasting.")

    return {
        "ok": True,
        "sections": result["sections"],
        "name": result.get("name", ""),
        "email": result.get("email", ""),
        "headline": result.get("headline", ""),
        "section_count": len(result["sections"]),
    }


@router.post("/resume/save")
async def save_edited_resume(request: Request, body: SaveResumeRequest):
    """Save edited resume sections to disk. Call after any edit."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()

    # Sanitize: cap lengths to prevent abuse
    for sec in body.sections:
        if sec.contact:
            c = sec.contact
            c.name = (c.name or "")[:_MAX_FIELD_LEN]
            c.email = (c.email or "")[:_MAX_FIELD_LEN]
            c.phone = (c.phone or "")[:_MAX_FIELD_LEN]
            c.location = (c.location or "")[:_MAX_FIELD_LEN]
            c.linkedin = (c.linkedin or "")[:_MAX_FIELD_LEN]
        if sec.education:
            e = sec.education
            for attr in ("university", "major", "minor", "graduation", "location", "honors", "gpa"):
                v = getattr(e, attr, "") or ""
                setattr(e, attr, v[:_MAX_FIELD_LEN])
        if sec.experiences:
            sec.experiences = sec.experiences[:_MAX_ENTRIES_PER_SECTION]
            for entry in sec.experiences:
                for attr in ("company", "role", "date", "location"):
                    v = getattr(entry, attr, "") or ""
                    setattr(entry, attr, v[:_MAX_FIELD_LEN])
                entry.bullets = entry.bullets[:_MAX_BULLETS_PER_ENTRY]
                for b in entry.bullets:
                    b.text = (b.text or "")[:_MAX_BULLET_LEN]
        if sec.projects:
            sec.projects = sec.projects[:_MAX_ENTRIES_PER_SECTION]
            for proj in sec.projects:
                proj.name = (proj.name or "")[:_MAX_FIELD_LEN]
                proj.date = (proj.date or "")[:_MAX_FIELD_LEN]
                proj.location = (proj.location or "")[:_MAX_FIELD_LEN]
                proj.bullets = proj.bullets[:_MAX_BULLETS_PER_ENTRY]
                for b in proj.bullets:
                    b.text = (b.text or "")[:_MAX_BULLET_LEN]
        if sec.simple:
            sec.simple.lines = [ln[:_MAX_BULLET_LEN] for ln in sec.simple.lines[:_MAX_BULLETS_PER_ENTRY] if isinstance(ln, str)]

    saved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    data = {
        "sections": [s.model_dump() for s in body.sections],
        "source_audit_id": body.source_audit_id,
        "saved_at": saved_at,
    }
    try:
        await asyncio.to_thread(_save_resume, email, data)
    except Exception:
        raise errors.internal("Could not save resume.")

    return SaveResumeResponse(
        ok=True,
        saved_at=saved_at,
        section_count=len(body.sections),
    )


@router.post("/resume/sync-base")
async def sync_base_resume(request: Request):
    """
    Sync the base resume in the editor from the latest parsed resume text.
    Called after each audit so the editor always reflects the most recent version.
    Parses the profile txt into structured sections and saves as resume_edited.json.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    try:
        from projects.dilly.api.dilly_profile_txt import (
            get_dilly_profile_txt_content,
            parse_structured_experience_from_profile_txt,
        )
        profile_txt = get_dilly_profile_txt_content(email, max_chars=15000) or ""
        if not profile_txt.strip():
            return {"ok": False, "reason": "No parsed resume found"}

        # Parse structured experience from the profile text
        experiences = parse_structured_experience_from_profile_txt(profile_txt)

        # Build editor sections from the parsed data
        import re
        profile = ensure_profile_exists(email)

        sections = []

        # Contact section. Always prefer the AUTHED email (the one the
        # user is currently signed in with) over profile.email. Users
        # imported via onboarding sometimes end up with a stale
        # profile.email (e.g. a placeholder set during seed) which
        # then showed up on every generated resume — exactly the
        # wrong email at the top of a sent application. Authed email
        # is always current + deliverable.
        name = (profile.get("name") or "").strip()
        p_email = (email or profile.get("email") or "").strip()
        linkedin = (profile.get("linkedin_url") or "").strip()
        sections.append({
            "key": "contact",
            "label": "Contact",
            "contact": {"name": name, "email": p_email, "phone": "", "location": "", "linkedin": linkedin},
        })

        # Education section
        major = (profile.get("majors") or [None])[0] or profile.get("major") or ""
        minor = (profile.get("minors") or [None])[0] or ""
        if minor and minor.upper() in ("N/A", "NA", "N", "A"):
            minor = ""
        # School resolution, in priority order:
        #   1. profile.school (canonical display name, e.g. "Stanford University")
        #   2. profile.school_name (legacy alias)
        #   3. profile.university
        #   4. school_id mapping (we keep utampa and a small curated map
        #      so we don't lose the display-name for users whose profile
        #      only stored the id)
        #   5. Email-domain inference (kochhardilly@ut.edu -> UT etc.)
        # Previously the code hardcoded "University of Tampa" for
        # school_id=='utampa' and returned empty for everyone else,
        # which is why non-UT students saw a blank education block.
        school = (
            (profile.get("school") or "").strip()
            or (profile.get("school_name") or "").strip()
            or (profile.get("university") or "").strip()
        )
        if not school:
            _SCHOOL_ID_MAP = {
                "utampa": "University of Tampa",
                "stanford": "Stanford University",
                "mit": "Massachusetts Institute of Technology",
                "harvard": "Harvard University",
                "berkeley": "UC Berkeley",
                "ucla": "UCLA",
                "ut-austin": "University of Texas at Austin",
                "umich": "University of Michigan",
                "cmu": "Carnegie Mellon University",
                "columbia": "Columbia University",
                "nyu": "New York University",
                "upenn": "University of Pennsylvania",
                "cornell": "Cornell University",
                "princeton": "Princeton University",
                "yale": "Yale University",
                "duke": "Duke University",
                "northwestern": "Northwestern University",
                "gatech": "Georgia Tech",
                "illinois": "University of Illinois Urbana-Champaign",
                "washington": "University of Washington",
                "wisconsin": "University of Wisconsin-Madison",
                "purdue": "Purdue University",
                "virginia": "University of Virginia",
                "usc": "University of Southern California",
                "tufts": "Tufts University",
            }
            sid = (profile.get("school_id") or "").strip().lower()
            school = _SCHOOL_ID_MAP.get(sid, "")
        if not school:
            # Email domain inference — the onboarding already does this
            # for login, but not every profile has `school` populated
            # yet, so we re-derive from the authed email.
            try:
                domain = (email.split("@", 1)[1] if "@" in email else "").lower()
                _DOMAIN_MAP = {
                    "ut.edu": "University of Tampa",
                    "stanford.edu": "Stanford University",
                    "mit.edu": "Massachusetts Institute of Technology",
                    "harvard.edu": "Harvard University",
                    "berkeley.edu": "UC Berkeley",
                    "ucla.edu": "UCLA",
                    "utexas.edu": "University of Texas at Austin",
                    "umich.edu": "University of Michigan",
                    "andrew.cmu.edu": "Carnegie Mellon University",
                    "cmu.edu": "Carnegie Mellon University",
                    "columbia.edu": "Columbia University",
                    "nyu.edu": "New York University",
                    "upenn.edu": "University of Pennsylvania",
                    "cornell.edu": "Cornell University",
                    "princeton.edu": "Princeton University",
                    "yale.edu": "Yale University",
                    "duke.edu": "Duke University",
                    "northwestern.edu": "Northwestern University",
                    "gatech.edu": "Georgia Tech",
                    "illinois.edu": "University of Illinois Urbana-Champaign",
                    "uw.edu": "University of Washington",
                    "wisc.edu": "University of Wisconsin-Madison",
                    "purdue.edu": "Purdue University",
                    "virginia.edu": "University of Virginia",
                    "usc.edu": "University of Southern California",
                    "tufts.edu": "Tufts University",
                }
                if domain:
                    school = _DOMAIN_MAP.get(domain, "")
                    # Generic .edu catch-all — pull the 2nd-level domain
                    # and make a guess that reads reasonably.
                    if not school and domain.endswith(".edu"):
                        base = domain.rsplit(".edu", 1)[0].split(".")[-1]
                        if base and len(base) >= 3:
                            school = base.replace("-", " ").title() + " University"
            except Exception:
                pass
        # Try to extract GPA from profile text
        gpa_match = re.search(r"GPA[:\s]*([\d.]+)", profile_txt, re.IGNORECASE)
        gpa = gpa_match.group(1) if gpa_match else ""
        sections.append({
            "key": "education",
            "label": "Education",
            "education": {
                "id": str(__import__("uuid").uuid4())[:8],
                "university": school, "major": major, "minor": minor,
                "graduation": "", "location": "", "honors": "", "gpa": gpa,
            },
        })

        # Experience sections
        if experiences:
            exp_entries = []
            for exp in experiences[:10]:
                bullets = [{"id": str(__import__("uuid").uuid4())[:8], "text": b} for b in (exp.get("bullets") or [])[:8]]
                if not bullets:
                    bullets = [{"id": str(__import__("uuid").uuid4())[:8], "text": ""}]
                exp_entries.append({
                    "id": str(__import__("uuid").uuid4())[:8],
                    "company": exp.get("company", ""),
                    "role": exp.get("role", ""),
                    "date": exp.get("date", ""),
                    "location": exp.get("location", ""),
                    "bullets": bullets,
                })
            sections.append({
                "key": "professional_experience",
                "label": "Professional Experience",
                "experiences": exp_entries,
            })

        # Skills section — extract from [SKILLS] block
        skills_match = re.search(r"\[SKILLS\](.*?)(?:\[|$)", profile_txt, re.DOTALL | re.IGNORECASE)
        if skills_match:
            skills_text = skills_match.group(1).strip()
            skill_lines = [line.strip().lstrip("-• ").strip() for line in skills_text.split("\n") if line.strip()]
            sections.append({
                "key": "skills",
                "label": "Skills",
                "simple": {"id": str(__import__("uuid").uuid4())[:8], "lines": skill_lines[:10] or [""]},
            })

        if not sections:
            return {"ok": False, "reason": "Could not parse resume sections"}

        saved_at = __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime())
        data = {"sections": sections, "source_audit_id": None, "saved_at": saved_at, "synced_from_audit": True}
        _save_resume(email, data)
        return {"ok": True, "section_count": len(sections), "saved_at": saved_at}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"ok": False, "reason": str(e)[:200]}


@router.post("/resume/audit")
async def audit_from_edited_resume(request: Request, body: ResumeAuditRequest = Body(default=ResumeAuditRequest())):
    """
    Re-audit the user's saved edited resume without requiring a file upload.
    Reconstructs plain text from saved sections and runs through the audit pipeline.
    Requires subscription (same as /audit/v2).
    """
    user = deps.require_auth(request)
    # Subscription check disabled during development — all users treated as paid
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()

    saved = _load_resume(email)
    if not saved:
        raise errors.not_found("No saved resume found. Edit your resume first.")

    try:
        sections_raw = saved.get("sections") or []
        sections = [ResumeSection(**s) for s in sections_raw]
        resume_text = _sections_to_text(sections)
    except Exception:
        raise errors.internal("Could not reconstruct resume text.")

    if not resume_text or len(resume_text.split()) < 30:
        raise errors.validation_error("Resume is too short. Add more content before auditing.")

    import uuid as _uuid

    try:
        use_llm = os.environ.get("DILLY_USE_LLM", "").strip().lower() in ("1", "true", "yes")

        from projects.dilly.api.profile_store import get_profile as _get_profile
        from projects.dilly.api.constants import APPLICATION_TARGET_VALUES, AUDIT_TIMEOUT_SEC

        profile = _get_profile(email)
        candidate_name = (profile or {}).get("name") or "Unknown"
        major = (profile or {}).get("major") or ""
        if not major and isinstance((profile or {}).get("majors"), list):
            major = ((profile or {}).get("majors") or [""])[0] or ""
        gpa = None

        # Transcript GPA override
        if profile:
            tg = profile.get("transcript_gpa")
            if tg is not None:
                try:
                    gpa = float(tg)
                except (TypeError, ValueError):
                    gpa = None

        application_target = (body.application_target or "").strip() or None
        if not application_target and profile:
            application_target = (profile.get("application_target") or "").strip() or None
            if application_target not in APPLICATION_TARGET_VALUES:
                application_target = None
            if not application_target:
                goals = profile.get("goals") or []
                for g in goals:
                    if "internship" in str(g).lower():
                        application_target = "internship"
                        break
        if not application_target:
            application_target = "exploring"

        application_target_label = (profile.get("application_target_label") or "").strip() or None if profile else None

        # Build supplementary context from Voice data
        supplementary = None
        if profile:
            parts: List[str] = []
            beyond = profile.get("beyond_resume")
            if isinstance(beyond, list) and beyond:
                items = [str(b.get("text", "")).strip() for b in beyond if isinstance(b, dict) and b.get("text")]
                if items:
                    parts.append("ADDITIONAL CONTEXT (told to Dilly):\n" + "\n".join(f"- {x}" for x in items[:10]))
            expansion = profile.get("experience_expansion")
            if isinstance(expansion, list) and expansion:
                exp_lines = []
                for exp in expansion[:5]:
                    if isinstance(exp, dict):
                        label = exp.get("role_label") or exp.get("organization") or ""
                        skills = ", ".join((exp.get("skills") or [])[:8])
                        tools = ", ".join((exp.get("tools_used") or [])[:8])
                        if label:
                            exp_lines.append(f"{label}: skills={skills}; tools={tools}")
                if exp_lines:
                    parts.append("EXPERIENCE DEEP DIVE:\n" + "\n".join(exp_lines))
            supplementary = "\n\n".join(parts) if parts else None

        def _run() -> dict:
            if use_llm:
                from dilly_core.llm_client import is_llm_available
                if is_llm_available():
                    from dilly_core.llm_auditor import run_audit_llm
                    return run_audit_llm(
                        resume_text,
                        candidate_name=candidate_name,
                        major=major,
                        gpa=gpa,
                        fallback_to_rules=True,
                        filename="edited_resume.txt",
                        application_target=application_target,
                        application_target_label=application_target_label,
                        supplementary_context=supplementary,
                    )
            from dilly_core.auditor import run_audit
            return run_audit(
                resume_text,
                candidate_name=candidate_name,
                major=major,
                gpa=gpa,
                filename="edited_resume.txt",
            )

        result = await asyncio.wait_for(
            asyncio.to_thread(_run),
            timeout=AUDIT_TIMEOUT_SEC,
        )

        # ────────────────────────────────────────────────────────────────────
        # RUBRIC CUTOVER (Tier 2, 2026-04-08)
        #
        # Re-audit path — same rubric integration as /audit/v2. Score
        # the resume against the student's active cohorts, replace the
        # legacy scores with rubric output, and capture the rich
        # rubric_analysis payload for the response.
        #
        # Falls back to legacy `result` unchanged on any failure.
        # ────────────────────────────────────────────────────────────────────
        _rc_rubric_analysis_payload = None
        try:
            from dilly_core.rubric_scorer import (
                select_cohorts_for_student,
                score_for_cohorts,
                build_rubric_analysis_payload,
                rubric_to_legacy_shape,
            )
            from dilly_core.scoring import extract_scoring_signals as _rc_extract_signals

            _rc_minors = (profile or {}).get("minors") or [] if profile else []
            _rc_pre_prof = (profile or {}).get("pre_professional_track") if profile else None
            _rc_industry = (profile or {}).get("industry_target") if profile else None

            _rc_cohorts = select_cohorts_for_student(
                major=major or "",
                minors=_rc_minors,
                pre_professional_track=_rc_pre_prof,
                industry_target=_rc_industry,
            )

            if _rc_cohorts and resume_text:
                _rc_signals = _rc_extract_signals(resume_text, gpa=gpa, major=major or "")
                _rc_scores = score_for_cohorts(_rc_signals, resume_text, _rc_cohorts)

                if _rc_scores:
                    _rc_primary_cid = _rc_cohorts[0]
                    _rc_primary = _rc_scores.get(_rc_primary_cid)

                    if _rc_primary is not None:
                        # Overwrite scores on the dataclass or dict-shaped result
                        if hasattr(result, "__dataclass_fields__"):
                            result.smart_score = _rc_primary.smart
                            result.grit_score = _rc_primary.grit
                            result.build_score = _rc_primary.build
                            result.final_score = _rc_primary.composite
                            result.track = _rc_primary_cid
                            _rc_legacy = rubric_to_legacy_shape(
                                _rc_primary,
                                candidate_name=candidate_name or "Unknown",
                                major=major or "",
                            )
                            result.audit_findings = _rc_legacy.get("audit_findings") or result.audit_findings
                            result.dilly_take = _rc_legacy.get("dilly_take") or getattr(result, "dilly_take", None)
                        elif isinstance(result, dict):
                            result["smart_score"] = _rc_primary.smart
                            result["grit_score"] = _rc_primary.grit
                            result["build_score"] = _rc_primary.build
                            result["final_score"] = _rc_primary.composite
                            result["track"] = _rc_primary_cid
                            _rc_legacy = rubric_to_legacy_shape(
                                _rc_primary,
                                candidate_name=candidate_name or "Unknown",
                                major=major or "",
                            )
                            result["audit_findings"] = _rc_legacy.get("audit_findings") or result.get("audit_findings")
                            result["dilly_take"] = _rc_legacy.get("dilly_take") or result.get("dilly_take")

                        _rc_rubric_analysis_payload = build_rubric_analysis_payload(
                            _rc_primary_cid,
                            _rc_scores,
                        )
                        sys.stderr.write(
                            f"[rubric_cutover_reaudit] email={email[:6]+'***' if email and '@' in email else 'none'} "
                            f"primary={_rc_primary_cid} composite={_rc_primary.composite:.1f}\n"
                        )
        except Exception as _rc_exc:
            import traceback as _rc_tb
            sys.stderr.write(
                f"[rubric_cutover_reaudit_failed] exc={type(_rc_exc).__name__}: {str(_rc_exc)[:200]}\n"
            )
            try:
                _rc_tb.print_exc(file=sys.stderr)
            except Exception:
                pass

        # ────────────────────────────────────────────────────────────────────
        # Normalize result to canonical AuditResponseV2-compatible shape.
        #
        # The rule-based path (run_audit) returns an AuditorResult dataclass
        # with FLAT fields (smart_score, grit_score, build_score). The LLM
        # path may return a dict. The mobile client expects nested
        # `scores: {smart, grit, build}` per the AuditResponseV2 schema.
        #
        # Without this normalization, the mobile new-audit screen crashes
        # at render time when it tries Math.round(undefined) on the missing
        # nested scores field. Also: the previous `isinstance(result, dict)`
        # check below silently skipped the entire persistence branch for the
        # rule-based path, so re-audits via the editor were never being
        # saved to audit history.
        # ────────────────────────────────────────────────────────────────────
        if hasattr(result, "__dataclass_fields__"):
            from dataclasses import asdict as _dc_asdict
            result = _dc_asdict(result)
        elif not isinstance(result, dict):
            # Fallback: try .__dict__ for non-dataclass objects
            try:
                result = dict(result.__dict__)
            except Exception:
                raise errors.internal("Audit returned an unexpected result type.")

        # Build canonical nested scores dict if not already present
        if not isinstance(result.get("scores"), dict):
            result["scores"] = {
                "smart": float(result.get("smart_score", 0) or 0),
                "grit": float(result.get("grit_score", 0) or 0),
                "build": float(result.get("build_score", 0) or 0),
            }
        # Mobile expects `detected_track` field; auditor calls it `track`
        if "detected_track" not in result:
            result["detected_track"] = result.get("track") or "Unknown"

        # Attach resume text for downstream tools
        result["resume_text"] = resume_text
        result["application_target"] = application_target

        # Attach rubric_analysis payload from the cutover block above
        if _rc_rubric_analysis_payload is not None:
            result["rubric_analysis"] = _rc_rubric_analysis_payload

        # Persist to audit history so Career Center shows the new audit (same as /audit/v2)
        # NOTE: result is now guaranteed to be a dict by the normalization above.
        if isinstance(result, dict):
            import uuid as _uuid
            from projects.dilly.api.audit_history import append_audit, get_audits
            from projects.dilly.api.profile_store import get_profile, save_profile
            audit_id = _uuid.uuid4().hex
            full_audit_dict = dict(result)
            full_audit_dict["id"] = audit_id
            full_audit_dict["ts"] = time.time()
            try:
                from dilly_core.skill_tags import extract_skill_tags
                profile_for_tags = get_profile(email)
                full_audit_dict["skill_tags"] = extract_skill_tags(parsed_resume=None, audit=full_audit_dict, profile=profile_for_tags or {})
            except Exception:
                full_audit_dict["skill_tags"] = []
            audits_before = get_audits(email)
            append_audit(email, full_audit_dict)
            profile = get_profile(email)
            if profile and not profile.get("first_audit_snapshot") and len(audits_before) == 0:
                scores = full_audit_dict.get("scores") or {}
                save_profile(email, {
                    "first_audit_snapshot": {
                        "scores": {"smart": scores.get("smart", 0), "grit": scores.get("grit", 0), "build": scores.get("build", 0)},
                        "ts": full_audit_dict["ts"],
                    }
                })
            profile = get_profile(email)
            if profile and not (profile.get("name") or "").strip():
                candidate_name = (full_audit_dict.get("candidate_name") or "").strip()
                if candidate_name:
                    save_profile(email, {"name": candidate_name})
            # Return the dict with id/ts so the client has them
            result["id"] = audit_id
            result["ts"] = full_audit_dict["ts"]

        return result

    except asyncio.TimeoutError:
        raise errors.internal("Audit timed out. Please try again.")
    except Exception as exc:
        raise errors.internal(f"Audit failed: {str(exc)[:200]}")


# ---------------------------------------------------------------------------
# Bullet Score — fast rule-based scoring (sub-100ms, no LLM)
# ---------------------------------------------------------------------------

_STRONG_ACTION_VERBS = frozenset({
    "developed", "built", "designed", "implemented", "created", "launched", "led", "managed",
    "increased", "decreased", "reduced", "improved", "optimized", "automated", "deployed",
    "engineered", "architected", "delivered", "drove", "achieved", "accelerated", "generated",
    "secured", "expanded", "scaled", "trained", "mentored", "recruited", "founded", "initiated",
    "established", "streamlined", "transformed", "integrated", "analyzed", "researched",
    "published", "presented", "won", "awarded", "raised", "saved", "cut", "grew", "spearheaded",
    "collaborated", "coordinated", "executed", "negotiated", "resolved", "diagnosed", "repaired",
    "configured", "migrated", "refactored", "modeled", "simulated", "investigated", "assessed",
})

_WEAK_VERBS = frozenset({
    "helped", "assisted", "worked", "participated", "was involved", "did", "made", "used",
    "supported", "maintained", "contributed", "aided", "collaborated on", "involved in",
})

_QUANTITY_PATTERN = __import__("re").compile(
    r"\b(\d[\d,]*\.?\d*\s*(%|x|k|m|b|million|billion|thousand|percent|users|customers|hours|days|weeks|months|years|students|lines|functions|features|bugs|tests|endpoints|requests|saves|dollars|revenue|roi|nps))\b",
    __import__("re").IGNORECASE,
)

_TOOL_KEYWORDS = frozenset({
    "python", "java", "javascript", "typescript", "react", "node", "sql", "aws", "gcp", "azure",
    "tensorflow", "pytorch", "docker", "kubernetes", "git", "excel", "tableau", "powerbi",
    "figma", "photoshop", "r", "matlab", "spss", "stata", "sklearn", "pandas", "numpy",
    "restapi", "graphql", "redis", "mongodb", "postgresql", "mysql", "spark", "hadoop",
    "salesforce", "hubspot", "quickbooks", "bloomberg", "capital iq",
})


class BulletScoreRequest(BaseModel):
    bullet: str
    track: Optional[str] = None


class BulletScoreResponse(BaseModel):
    score: int  # 0-100
    label: str  # "Strong", "Good", "Needs work", "Weak"
    hints: List[str]  # max 3 short tips


@router.post("/resume/bullet-score")
async def score_bullet(request: Request, body: BulletScoreRequest):
    """
    Fast rule-based bullet scorer. Returns a 0-100 signal and short hints.
    No LLM — sub-100ms. Used by the Resume Editor for live feedback.
    """
    import re
    bullet = (body.bullet or "").strip()
    if not bullet:
        return BulletScoreResponse(score=0, label="Empty", hints=["Write your bullet first."])

    score = 0
    hints: List[str] = []

    words = bullet.lower().split()
    first_word = words[0].rstrip(".,;:") if words else ""
    bullet_lower = bullet.lower()

    # --- Action verb (up to 25pts) ---
    if first_word in _STRONG_ACTION_VERBS:
        score += 25
    elif first_word in _WEAK_VERBS:
        score += 5
        hints.append("Start with a stronger action verb (e.g. Built, Led, Developed).")
    elif bullet[0].isupper() and len(words) >= 3:
        score += 12
        hints.append("Start with an action verb (e.g. Built, Led, Developed).")
    else:
        hints.append("Start with a strong action verb.")

    # --- Quantification (up to 25pts) ---
    qty_matches = _QUANTITY_PATTERN.findall(bullet)
    if len(qty_matches) >= 3:
        score += 25
    elif len(qty_matches) == 2:
        score += 20
    elif len(qty_matches) == 1:
        score += 12
        hints.append("Add a second number (e.g. time saved, % improvement, scale).")
    else:
        score += 0
        hints.append("Add measurable impact — a number, %, or scale.")

    # --- Length and specificity (up to 15pts) ---
    word_count = len(words)
    if 15 <= word_count <= 28:
        score += 15
    elif 12 <= word_count < 15:
        score += 12
    elif 8 <= word_count < 12:
        score += 8
        hints.append("A little more detail would strengthen this bullet.")
    elif word_count > 35:
        score += 6
        hints.append("Tighten this bullet — aim for under 35 words.")
    elif word_count > 28:
        score += 11
    else:
        score += 3
        hints.append("This bullet is too short. Add context and impact.")

    # --- Tools / tech keywords (up to 12pts, scaled by count) ---
    tool_hits = sum(1 for t in _TOOL_KEYWORDS if t in bullet_lower)
    if tool_hits >= 3:
        score += 12
    elif tool_hits == 2:
        score += 9
    elif tool_hits == 1:
        score += 6

    # --- Result / outcome language (up to 10pts) ---
    _RESULT_PATTERNS = [
        "resulting in", "leading to", "which led to", "enabling", "contributing to",
        "improving", "reducing", "increasing", "generating", "saving",
        "achieving", "delivering", "driving", "accelerating", "streamlining",
    ]
    result_hits = sum(1 for p in _RESULT_PATTERNS if p in bullet_lower)
    if result_hits >= 2:
        score += 10
    elif result_hits == 1:
        score += 6

    # --- Specificity bonus (up to 8pts) ---
    # Reward concrete nouns: team sizes, proper nouns (capitalized words mid-sentence), dates
    import re as _re
    proper_nouns = len(_re.findall(r"(?<!\.\s)(?<!^)\b[A-Z][a-z]{2,}", bullet))
    if proper_nouns >= 2:
        score += 8
    elif proper_nouns == 1:
        score += 4

    # --- Deterministic per-bullet variation (up to ±5pts) ---
    # Use a hash of the bullet text so the same bullet always gets the same score,
    # but different bullets get different micro-adjustments
    text_hash = hash(bullet.strip()) % 11 - 5  # range: -5 to +5
    score += text_hash

    # Cap at 100, floor at 5
    score = max(5, min(score, 100))

    # Label
    if score >= 80:
        label = "Strong"
    elif score >= 55:
        label = "Good"
    elif score >= 30:
        label = "Needs work"
    else:
        label = "Weak"

    # Show up to 3 hints — build 66 renders them as categorized lint chips
    return BulletScoreResponse(score=score, label=label, hints=hints[:3])


# ---------------------------------------------------------------------------
# Resume Editor unified scan — ATS v2 + rubric + prioritized issue list
# ---------------------------------------------------------------------------
#
# Powers three mobile resume-editor features in a single call:
#
#   1. Per-vendor ATS sidebar (Workday / Taleo / iCIMS / Greenhouse / Lever)
#      with per-issue score lift forecasts.
#   2. Rubric dimension breakdown — Smart / Grit / Build sub-scores against
#      the student's primary cohort rubric, with per-dimension missing
#      signals.
#   3. Prioritized "Fix this first" issue list — ranks everything the user
#      should do next by estimated score lift.
#
# The editor debounces-on-blur, so this is called ~once per 500ms of idle
# time, not on every keystroke. Reuses existing dilly_core modules so there's
# no new scoring logic — just a unified surface.

class EditorScanRequest(BaseModel):
    sections: List[ResumeSection]
    track: Optional[str] = None           # cohort id override (optional)
    job_description: Optional[str] = None  # for keyword match layer
    cohort_id: Optional[str] = None        # explicit rubric cohort id — used by
                                           # the cohort switcher in the dashboard
                                           # and when scoring a variant against
                                           # a different target cohort than the
                                           # student's primary major
    variant_id: Optional[str] = None       # which variant is being scored (used
                                           # for telemetry, not scoring logic)


class CoverLetterRequest(BaseModel):
    job_title: str
    job_company: str
    job_description: Optional[str] = ""
    tone: Optional[str] = "warm_professional"  # warm_professional | enthusiastic | formal


@router.post("/resume/cover-letter")
async def generate_cover_letter(request: Request, body: CoverLetterRequest):
    """
    Generate a tailored cover letter using the user's saved resume + Dilly
    Profile + target job. Returns a base64 JSON payload with the letter
    text AND a public URL to a rendered PDF (same transient-cache pattern
    as /resume/export).
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    job_title = (body.job_title or "").strip()
    job_company = (body.job_company or "").strip()
    job_description = (body.job_description or "").strip()
    if not job_title or not job_company:
        raise errors.validation_error("job_title and job_company are required.")

    # Load the student's base resume
    saved = _load_resume(email)
    if not saved:
        raise errors.validation_error("No saved resume found. Save your resume first.")
    base_sections = saved.get("sections") or []
    base_resume_text = ""
    try:
        sections_typed = [ResumeSection(**s) for s in base_sections]
        base_resume_text = _sections_to_text(sections_typed)
    except Exception:
        base_resume_text = ""

    # Load Dilly Profile facts for personal voice
    profile_facts_text = ""
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = await asyncio.to_thread(get_memory_surface, email)
        facts = surface.get("items") or []
        narrative = (surface.get("narrative") or "").strip()
        if facts:
            lines = []
            grouped: dict[str, list] = {}
            for f in facts:
                cat = f.get("category", "other")
                grouped.setdefault(cat, []).append(f)
            for cat, items in grouped.items():
                label = cat.replace("_", " ").title()
                entries = "; ".join(f"{i['label']}: {i['value']}" for i in items[:5])
                lines.append(f"  {label}: {entries}")
            profile_facts_text = "\n".join(lines)
            if narrative:
                profile_facts_text = f"NARRATIVE: {narrative}\n\nFACTS:\n{profile_facts_text}"
    except Exception:
        pass

    # Build prompt
    tone_instructions = {
        "warm_professional": "Warm and professional. Sound like a real human, not a template. Use 'I' naturally and avoid corporate jargon.",
        "enthusiastic": "Enthusiastic and energetic. Show genuine excitement about the company and role without being over-the-top.",
        "formal": "Formal and polished. Classic business letter tone, suitable for conservative industries (finance, law, government).",
    }.get(body.tone or "warm_professional", "Warm and professional.")

    # Try to extract candidate name from the contact section
    candidate_name = ""
    for s in base_sections:
        if isinstance(s, dict) and s.get("key") == "contact":
            c = s.get("contact") or {}
            candidate_name = (c.get("name") or "").strip()
            break

    system_prompt = f"""You are Dilly's cover-letter writer. Write a tailored cover letter in plain prose.

TARGET JOB:
  Title: {job_title}
  Company: {job_company}

JOB DESCRIPTION:
{job_description[:3000] if job_description else "(Not provided — write based on the role title and company reputation.)"}

STUDENT'S DILLY PROFILE:
{profile_facts_text or "(No profile facts available — use resume only)"}

STUDENT'S RESUME:
{base_resume_text[:5000]}

TONE: {tone_instructions}

INSTRUCTIONS:
1. Write a complete cover letter — opening paragraph, 2 body paragraphs, closing paragraph, sign-off.
2. Reference SPECIFIC experiences from the resume. Use real metrics where available.
3. Connect the student's experience to the job requirements. Show why this role at THIS company.
4. Do NOT invent experience the student doesn't have.
5. Do NOT use bullet points — cover letters are prose.
6. Keep it under 400 words total. Tight, punchy, honest.
7. End with "Sincerely," followed by the student's full name: {candidate_name or "[Name]"}
8. Do NOT include a greeting line ("Dear Hiring Manager,") — the template will add it.
9. Do NOT include the student's contact info at the top — the template handles that.

Return ONLY the letter body text. No headers, no markdown, no JSON, no explanations."""

    # Call Claude
    full_text = ""
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        async with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": f"Write the cover letter body for {job_title} at {job_company}.",
            }],
        ) as stream:
            async for text in stream.text_stream:
                full_text += text
    except Exception as e:
        import sys, traceback
        sys.stderr.write(f"[cover_letter_failed] {type(e).__name__}: {str(e)[:200]}\n")
        try: traceback.print_exc(file=sys.stderr)
        except Exception: pass
        raise errors.internal(f"Cover letter generation failed: {type(e).__name__}")

    letter_text = (full_text or "").strip()
    if not letter_text:
        raise errors.internal("AI returned empty letter.")

    # Build 74: humanize the LLM output so it doesn't scream "ChatGPT wrote this".
    # Strips sycophantic openers, AI vocabulary, em dashes, filler, cliche
    # conclusions, and ~15 other deterministic patterns. Pure Python, zero
    # marginal cost, idempotent. Based on blader/humanizer (MIT).
    try:
        from dilly_core.humanize import humanize as _humanize
        letter_text = _humanize(letter_text, aggressive=True)
    except Exception as _exc:
        sys.stderr.write(f"[humanize_cover_letter_failed] {type(_exc).__name__}: {str(_exc)[:200]}\n")

    # Render the cover letter as a simple PDF — reuse the resume PDF renderer
    # with a synthetic section tree that the template can print.
    try:
        from dilly_core.resume_pdf_export import render_cover_letter_pdf
        pdf_bytes = render_cover_letter_pdf(
            letter_text=letter_text,
            candidate_name=candidate_name or "",
            contact=dict((next((s.get("contact") for s in base_sections if isinstance(s, dict) and s.get("key") == "contact"), None) or {})),
            job_company=job_company,
        )
    except Exception as e:
        import sys, traceback
        sys.stderr.write(f"[cover_letter_pdf_failed] {type(e).__name__}: {str(e)[:200]}\n")
        try: traceback.print_exc(file=sys.stderr)
        except Exception: pass
        raise errors.internal(f"PDF render failed: {type(e).__name__}")

    # Stash + return public URL (same pattern as /resume/export)
    filename = f"cover_letter_{job_company.strip().replace(' ', '_')}_{_time.strftime('%Y%m%d')}.pdf"
    token = _stash_pdf(pdf_bytes, filename)
    base_url = str(request.base_url).rstrip("/")
    public_url = f"{base_url}/resume/export/{token}"
    return {
        "filename": filename,
        "mime": "application/pdf",
        "size_bytes": len(pdf_bytes),
        "url": public_url,
        "token": token,
        "letter_text": letter_text,  # also return text for preview
    }


class BulletWorthRequest(BaseModel):
    bullet: str
    cohort_id: Optional[str] = None  # defaults to student's primary cohort


@router.post("/resume/bullet-worth")
async def bullet_worth(request: Request, body: BulletWorthRequest):
    """
    'What's this bullet worth?' — score a single resume bullet against the
    cohort's rubric signals. Returns which rubric signals the bullet hits,
    its dimension-weighted contribution, and specific suggestions for how
    to lift it.

    Powers the bottom sheet that opens when a user taps a bullet in the
    resume editor.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    bullet_text = (body.bullet or "").strip()
    if not bullet_text or len(bullet_text) < 6:
        raise HTTPException(status_code=400, detail="Bullet too short to score.")

    # 1. Determine cohort
    cohort_id = body.cohort_id or ""
    if not cohort_id and email:
        try:
            from projects.dilly.api.profile_store import get_profile
            from dilly_core.rubric_scorer import select_cohorts_for_student
            prof = get_profile(email) or {}
            majors = prof.get("majors") or ([prof.get("major")] if prof.get("major") else [])
            major = majors[0] if majors else ""
            picked = select_cohorts_for_student(major=major, minors=[], pre_professional_track=None, industry_target=None)
            if picked:
                cohort_id = picked[0]
        except Exception:
            pass
    if not cohort_id:
        cohort_id = "business_finance"  # generic fallback

    # 2. Score the bullet via rule-based heuristics (reuses /resume/bullet-score logic)
    import re as _re
    bullet_lower = bullet_text.lower()
    words = bullet_text.split()
    first_word = (words[0] if words else "").rstrip(".,;:")

    # Heuristic signal detectors
    has_strong_verb = first_word.lower() in _STRONG_ACTION_VERBS
    has_weak_verb = first_word.lower() in _WEAK_VERBS
    qty_matches = _QUANTITY_PATTERN.findall(bullet_text)
    has_quantification = len(qty_matches) > 0
    has_percent = "%" in bullet_text or "percent" in bullet_lower
    has_dollar = "$" in bullet_text
    has_outcome = any(k in bullet_lower for k in ("result", "impact", "delivered", "achieved", "improved", "increased", "reduced", "saved", "generated"))
    has_tech_keywords = bool(_re.search(r"\b(Python|JavaScript|TypeScript|Java|SQL|React|Node|AWS|Docker|Kubernetes|Tableau|PowerBI|Excel|R |Pandas|Numpy|TensorFlow|PyTorch)\b", bullet_text))
    word_count = len(words)
    is_concise = 8 <= word_count <= 28
    is_too_long = word_count > 32
    is_too_short = word_count < 6

    # 3. Build the signals hit / missing lists
    signals_hit: list = []
    signals_missing: list = []

    def add(lst, title, dimension, weight, rationale):
        lst.append({"title": title, "dimension": dimension, "weight": weight, "rationale": rationale})

    if has_strong_verb:
        add(signals_hit, "Strong action verb", "build", 3, f"Starts with '{first_word}' — a strong action verb that signals ownership.")
    elif has_weak_verb:
        add(signals_missing, "Strong action verb", "build", 3, f"Starts with '{first_word}' — replace with 'Built', 'Led', 'Shipped', 'Architected', 'Drove'.")
    else:
        add(signals_missing, "Strong action verb", "build", 3, "Start with a strong action verb like 'Built', 'Led', 'Shipped', 'Architected'.")

    if has_quantification:
        metric_str = ", ".join(qty_matches[:2])
        add(signals_hit, "Quantified impact", "build", 4, f"Contains metrics ({metric_str}) — quantified bullets score ~2x higher than vague ones.")
    else:
        add(signals_missing, "Quantified impact", "build", 4, "Add a number: team size, users affected, % improvement, time saved, dollars, or data volume.")

    if has_outcome:
        add(signals_hit, "Outcome language", "build", 2, "Mentions the result or impact, not just the activity.")
    else:
        add(signals_missing, "Outcome language", "build", 2, "Describe the OUTCOME, not just the task. What changed because of you?")

    if is_concise:
        add(signals_hit, "Concise length", "smart", 1, f"{word_count} words — the sweet spot is 10-25 for a single bullet.")
    elif is_too_long:
        add(signals_missing, "Concise length", "smart", 1, f"{word_count} words is too long — trim filler and split into two bullets if needed.")
    elif is_too_short:
        add(signals_missing, "Concise length", "smart", 1, f"{word_count} words is too short — add specifics about what, how, and the result.")

    if has_tech_keywords:
        add(signals_hit, "Technical specificity", "smart", 3, "Names specific technologies — ATS and recruiters scan for these.")
    else:
        add(signals_missing, "Technical specificity", "smart", 2, "Add a specific tool or technology you used (Python, SQL, React, etc.).")

    # 4. Total lift estimate = sum of missing signal weights
    total_lift = sum(s.get("weight", 0) for s in signals_missing) * 1.5
    current_contribution = sum(s.get("weight", 0) for s in signals_hit) * 1.5

    # 5. Cohort display name
    try:
        from dilly_core.rubric_scorer import get_rubric
        rubric = get_rubric(cohort_id) or {}
        cohort_display = rubric.get("display_name") or cohort_id
    except Exception:
        cohort_display = cohort_id

    return {
        "bullet": bullet_text,
        "cohort_id": cohort_id,
        "cohort_display": cohort_display,
        "signals_hit": signals_hit,
        "signals_missing": signals_missing,
        "current_contribution": round(current_contribution, 1),
        "potential_lift": round(total_lift, 1),
        "word_count": word_count,
    }


@router.get("/resume/cohorts")
async def list_resume_cohorts(request: Request):
    """
    Return the cohorts the editor's switcher should show. Only cohorts
    the student's latest audit actually scored are returned — primary
    cohort first, then every entry from rubric_analysis.other_cohorts.
    We don't expose the full 16-cohort rubric list because the editor
    anchors scores to the audit's stored per-cohort numbers, and
    picking a cohort that wasn't scored would fall back to primary.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    out: list = []
    seen: set = set()
    if email:
        try:
            from projects.dilly.api.audit_history import get_audits
            audits = get_audits(email) or []
            for a in audits:
                ra = a.get("rubric_analysis")
                if not isinstance(ra, dict):
                    continue
                pid = str(ra.get("primary_cohort_id") or "").strip()
                if pid and pid not in seen:
                    seen.add(pid)
                    out.append({
                        "cohort_id": pid,
                        "display_name": ra.get("primary_cohort_display_name") or pid.replace("_", " ").title(),
                    })
                for oc in (ra.get("other_cohorts") or []):
                    if not isinstance(oc, dict):
                        continue
                    cid = str(oc.get("cohort_id") or "").strip()
                    if not cid or cid in seen:
                        continue
                    seen.add(cid)
                    out.append({
                        "cohort_id": cid,
                        "display_name": oc.get("display_name") or cid.replace("_", " ").title(),
                    })
                # Only take cohorts from the single most-recent audit
                if out:
                    break
        except Exception:
            pass
    return {"cohorts": out}


@router.post("/resume/editor-scan")
async def resume_editor_scan(request: Request, body: EditorScanRequest):
    """
    Run ATS v2 + rubric scoring + issue prioritization on an in-progress
    resume from the mobile editor. Returns everything the editor sidebar,
    dimension rings, and "fix this first" list need in one payload.

    No file upload, no Claude — fully deterministic. Safe to call on a
    500ms debounce. Wrapped in try/except so any sub-scorer failure
    degrades gracefully without breaking the editor.
    """
    deps.require_auth(request)

    sections = body.sections or []
    if not sections:
        raise HTTPException(status_code=400, detail="No sections to scan.")

    # Reconstruct resume text from editor sections
    try:
        resume_text = _sections_to_text(sections)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not serialize sections.")

    if not resume_text or len(resume_text.strip()) < 30:
        raise HTTPException(status_code=400, detail="Not enough content to scan yet.")

    # Resolve student email once up front — we read stored audit + ats
    # scores from here so the editor dashboard shows the same numbers the
    # audit and /ats/scan pages show (users were seeing different numbers
    # because live recompute used different input text / different scorer
    # path than the audit).
    student_email = ""
    try:
        _u = deps.require_auth(request)
        student_email = (_u.get("email") or "").strip().lower()
    except Exception:
        pass

    # ── 1. Load latest audit's stored v2 + rubric_analysis as the source
    #      of truth so the dashboard agrees with the audit page. Live
    #      recompute from edited sections runs below only as a backup.
    audit_v2: dict = {}
    audit_rubric: dict = {}
    parsed_resume_text: str = ""
    if student_email:
        try:
            from projects.dilly.api.audit_history import get_audits
            audits = get_audits(student_email) or []
            for a in audits:
                ra = a.get("rubric_analysis")
                if isinstance(ra, dict) and (
                    ra.get("primary_smart") or ra.get("primary_grit") or ra.get("primary_build")
                ):
                    audit_rubric = ra
                    break
        except Exception:
            pass
        try:
            from projects.dilly.api.resume_loader import load_parsed_resume_for_voice
            parsed_resume_text = load_parsed_resume_for_voice(student_email, max_chars=50000) or ""
        except Exception:
            parsed_resume_text = ""
        # Re-score ATS v2 against the SAME parsed text that /ats/scan uses
        # so the two surfaces always show the same ATS number.
        if parsed_resume_text and len(parsed_resume_text) > 50:
            try:
                from dilly_core.resume_parser import parse_resume as _pr
                from dilly_core.ats_analysis import run_ats_analysis as _raa
                from dilly_core.ats_score_v2 import (
                    score_from_signals as _sfs,
                    signals_from_ats_analysis as _sfaa,
                )
                from dilly_core.ats_workday_validator import run_workday_checks as _rwc
                _parsed_a = _pr(parsed_resume_text)
                _analysis_a = _raa(raw_text=parsed_resume_text, parsed=_parsed_a)
                _sig_a = _sfaa(_analysis_a, raw_text=parsed_resume_text, file_extension="pdf")
                _wd_a = _rwc(parsed_resume_text, _parsed_a)
                audit_v2 = _sfs(_sig_a, extra_issues=_wd_a).to_dict()
            except Exception as _exc:
                import sys as _sys
                _sys.stderr.write(f"[editor_scan_audit_v2_failed] {type(_exc).__name__}: {str(_exc)[:200]}\n")

    # ── 1b. Parse + ats_analysis + v2 scorer on the LIVE edited sections.
    # Used for top_issues, keyword_cells, and reorder hints. The headline
    # ATS / dimension numbers below prefer the audit-anchored values above.
    v2: dict = {}
    rubric_summary: dict = {}
    try:
        from dilly_core.resume_parser import parse_resume
        from dilly_core.ats_analysis import run_ats_analysis
        from dilly_core.ats_score_v2 import (
            score_from_signals, signals_from_ats_analysis,
        )
        from dilly_core.ats_workday_validator import run_workday_checks

        parsed = parse_resume(resume_text)
        analysis = run_ats_analysis(raw_text=resume_text, parsed=parsed)

        # Keyword match layer (only if a JD was provided)
        kw_match = None
        kw_conf = None
        kw_missing: list = []
        kw_weak: list = []
        if body.job_description and body.job_description.strip():
            try:
                from dilly_core.resume_parser import get_sections
                from dilly_core.ats_keywords import run_keyword_analysis
                sections_map = get_sections(resume_text)
                kr = run_keyword_analysis(sections_map, job_description=body.job_description)
                jm = getattr(kr, "jd_match", None)
                if isinstance(jm, dict):
                    kw_match = float(jm.get("match_percentage") or 0)
                    kw_conf = 0.95
                    for req in (jm.get("requirements") or []):
                        if not isinstance(req, dict):
                            continue
                        if req.get("placement") == "missing" and req.get("category") == "must_have":
                            kw_missing.append(req.get("keyword"))
                        elif req.get("placement") == "adequate" or (req.get("found") and not req.get("contextual")):
                            kw_weak.append(req.get("keyword"))
            except Exception:
                pass

        sig = signals_from_ats_analysis(
            analysis, raw_text=resume_text,
            keyword_match=kw_match, keyword_confidence=kw_conf,
            keywords_missing=kw_missing, keywords_weak=kw_weak,
            file_extension="pdf",
        )
        workday_issues = run_workday_checks(resume_text, parsed)
        v2 = score_from_signals(sig, extra_issues=workday_issues).to_dict()
    except Exception as e:
        import sys, traceback
        sys.stderr.write(f"[editor_scan_v2_failed] {type(e).__name__}: {str(e)[:200]}\n")
        try: traceback.print_exc(file=sys.stderr)
        except Exception: pass

    # ── 2. Anchor the headline scores to the latest audit. ────────────
    # Users see Smart/Grit/Build on the audit page and expect the same
    # numbers on the editor dashboard. Recomputing from scratch with a
    # different scorer path produced different numbers, which read as
    # "wrong scores". The audit's stored rubric_analysis is the source
    # of truth until the user re-audits.
    #
    # Cohort switching: when body.cohort_id is set and differs from the
    # audit's primary cohort, synthesize the primary_* fields from
    # audit_rubric.other_cohorts[i] so the rings show PER-COHORT scores
    # instead of the student's overall primary-cohort scores.
    if audit_rubric:
        rubric_summary = dict(audit_rubric)
        want_cid = (body.cohort_id or "").strip()
        primary_cid = str(rubric_summary.get("primary_cohort_id") or "")
        if want_cid and want_cid != primary_cid:
            picked = None
            for oc in (rubric_summary.get("other_cohorts") or []):
                if str(oc.get("cohort_id") or "") == want_cid:
                    picked = oc
                    break
            if picked is not None:
                rubric_summary["primary_cohort_id"] = picked.get("cohort_id") or want_cid
                rubric_summary["primary_cohort_display_name"] = picked.get("display_name") or want_cid
                rubric_summary["primary_composite"] = picked.get("composite") or 0
                rubric_summary["primary_smart"] = picked.get("smart") or 0
                rubric_summary["primary_grit"] = picked.get("grit") or 0
                rubric_summary["primary_build"] = picked.get("build") or 0
                rubric_summary["recruiter_bar"] = picked.get("recruiter_bar")
                rubric_summary["above_bar"] = picked.get("above_bar", False)
                # Matched/unmatched signals are per-cohort too, but the
                # audit only stored them for the primary cohort. Live
                # re-score the target cohort against the edited resume
                # just to get the signal lists for the rings/issues.
                try:
                    from dilly_core.rubric_scorer import (
                        score_for_cohorts as _sfc, build_rubric_analysis_payload as _brap,
                    )
                    from dilly_core.scoring import extract_scoring_signals as _ess
                    _sigs = _ess(resume_text, gpa=None, major="")
                    _rc = _sfc(_sigs, resume_text, [want_cid])
                    if _rc:
                        _live = _brap(want_cid, _rc)
                        if _live:
                            rubric_summary["matched_signals"] = _live.get("matched_signals") or []
                            rubric_summary["unmatched_signals"] = _live.get("unmatched_signals") or []
                            rubric_summary["fastest_path_moves"] = _live.get("fastest_path_moves") or []
                except Exception as _exc:
                    import sys as _sys
                    _sys.stderr.write(f"[editor_scan_cohort_signals_failed] {type(_exc).__name__}: {str(_exc)[:200]}\n")
    if audit_v2 and audit_v2.get("vendors") and audit_v2.get("overall"):
        v2 = audit_v2

    # Also pull the legacy scan_resume_ats vendor scores — the dedicated
    # /ats page displays those numbers, and the editor dashboard used to
    # show different (v2) numbers. Expose a parallel 'legacy_ats_vendors'
    # map so the dashboard can display numbers that match /ats.
    legacy_ats_vendors: dict = {}
    legacy_ats_overall: Optional[float] = None
    if parsed_resume_text and len(parsed_resume_text) > 50:
        try:
            from projects.dilly.api.ats_engine import scan_resume_ats as _sra
            _legacy = _sra(parsed_resume_text).to_dict()
            legacy_ats_vendors = _legacy.get("vendors") or {}
            _ov = _legacy.get("overall_score")
            if _ov is not None:
                legacy_ats_overall = float(_ov)
        except Exception as _exc:
            import sys as _sys
            _sys.stderr.write(f"[editor_scan_legacy_ats_failed] {type(_exc).__name__}: {str(_exc)[:200]}\n")

    # ── 3. Prioritized issue list (merged + ranked by lift) ────────────
    # We DON'T show effort_minutes in the UI anymore — single bullet edits
    # can take 30 seconds and restructuring a section takes 10 minutes, and
    # there's no reliable way to predict which one applies. Showing a wrong
    # number erodes trust more than showing nothing.
    ranked_issues: list = []
    try:
        v2_issues = v2.get("issues") or []
        for iss in v2_issues:
            lifts = iss.get("lift_per_vendor") or {}
            total_lift = sum(lifts.values()) if lifts else float(iss.get("base_lift") or 0)
            avg_lift = total_lift / max(len(lifts), 1) if lifts else float(iss.get("base_lift") or 0)
            ranked_issues.append({
                "id": iss.get("id"),
                "source": "ats",
                "severity": iss.get("severity"),
                "title": iss.get("title"),
                "fix": iss.get("fix"),
                "category": iss.get("category"),
                "avg_lift": round(avg_lift, 1),
                "total_lift": round(total_lift, 1),
                "affects_vendors": iss.get("affects") or [],
                "lift_per_vendor": lifts,
            })

        # Rubric missing-signal gaps become issues too
        if rubric_summary:
            unmatched = rubric_summary.get("unmatched_signals") or []
            # Only show HIGH-impact missing signals (most actionable)
            for sig in unmatched[:8]:
                if (sig.get("tier") or "").lower() != "high":
                    continue
                ranked_issues.append({
                    "id": f"rubric_{sig.get('signal', '').replace(' ', '_')[:40]}",
                    "source": "rubric",
                    "severity": "high",
                    "title": f"Missing: {sig.get('signal')}",
                    "fix": sig.get("rationale") or "Add this to strengthen your cohort fit.",
                    "category": sig.get("dimension"),
                    "avg_lift": 6.0,
                    "total_lift": 6.0,
                    "affects_vendors": [],
                    "lift_per_vendor": {},
                })

        # Sort by total_lift descending; cap at 10
        ranked_issues.sort(key=lambda r: r["total_lift"], reverse=True)
        ranked_issues = ranked_issues[:10]
    except Exception:
        pass

    # ── 4. Keyword density (build 69) ──────────────────────────────────
    keyword_cells: list = []
    try:
        from dilly_core.resume_parser import get_sections
        from dilly_core.ats_keywords import run_keyword_analysis
        sections_map = get_sections(resume_text)
        kr = run_keyword_analysis(sections_map, job_description=body.job_description)
        # Convert KeywordDensityResult.keywords into heatmap cells
        for k in (kr.keywords or [])[:25]:
            ctx = getattr(k, "contextual_count", 0) or 0
            bare = getattr(k, "bare_count", 0) or 0
            total = ctx + bare
            if total == 0:
                continue
            placement = "strong" if ctx >= 2 else ("adequate" if ctx == 1 else "weak")
            keyword_cells.append({
                "keyword": getattr(k, "keyword", ""),
                "count": total,
                "placement": placement,
            })
    except Exception:
        keyword_cells = []

    # ── 5. Section reorder suggestion (build 69) ───────────────────────
    reorder_suggestion: Optional[dict] = None
    try:
        from dilly_core.ats_section_reorder import get_all_reorder_suggestions
        section_keys: list = []
        for sec in sections:
            if hasattr(sec, "key"):
                section_keys.append(sec.key)
            elif isinstance(sec, dict):
                section_keys.append(sec.get("key", ""))
        suggestions = get_all_reorder_suggestions([s for s in section_keys if s])
        # Pick the most-impactful one — Workday first (strictest), then Greenhouse
        for vkey in ("workday", "icims", "greenhouse", "lever"):
            if vkey in suggestions:
                s = suggestions[vkey]
                reorder_suggestion = {
                    "vendor": vkey,
                    "message": s.get("message"),
                    "current_order": s.get("current") or [],
                    "suggested_order": s.get("suggested") or [],
                }
                break
    except Exception:
        reorder_suggestion = None

    # ── 6. Build response ──────────────────────────────────────────────
    return {
        "v2": v2,
        "rubric_analysis": rubric_summary,
        "top_issues": ranked_issues,
        "keyword_cells": keyword_cells,
        "reorder_suggestion": reorder_suggestion,
        "legacy_ats_vendors": legacy_ats_vendors,
        "legacy_ats_overall": legacy_ats_overall,
        "scoring_version": "editor-scan-v2",
    }


# ---------------------------------------------------------------------------
# Resume PDF export — single-column, ATS-friendly, template-based
# ---------------------------------------------------------------------------

class ExportRequest(BaseModel):
    sections: List[ResumeSection]
    template: Optional[str] = "tech"  # 'tech' | 'business' | 'academic'
    filename: Optional[str] = None
    format: Optional[str] = "pdf"     # 'pdf' | 'docx' (build 73)


@router.post("/resume/export")
async def resume_export_pdf(request: Request, body: ExportRequest):
    """
    Render the in-editor resume sections to a downloadable PDF using one of
    three ATS-friendly templates. All templates are pure single-column,
    no tables, no text boxes, no decorative graphics — so every ATS parser
    treats them as plain text.

    Returns the PDF bytes with Content-Disposition so mobile clients can
    save/share it directly.
    """
    deps.require_auth(request)

    if not body.sections:
        raise HTTPException(status_code=400, detail="No sections to export.")

    template_name = (body.template or "tech").lower().strip()
    # Validate against the actual template registry. Both PDF and DOCX
    # renderers share the same template keys. Fall back to 'tech' for
    # unknown names so old clients never break.
    _VALID_TEMPLATES = {
        "tech", "business", "academic",
        "modern", "classic", "minimal", "executive", "startup",
        "consulting", "healthcare", "creative", "finance",
        "engineering", "clean", "bold",
    }
    if template_name not in _VALID_TEMPLATES:
        template_name = "tech"

    # Pull candidate name from contact section for the PDF metadata
    candidate_name: Optional[str] = None
    for s in body.sections:
        if s.key == "contact" and s.contact and s.contact.name:
            candidate_name = s.contact.name
            break

    fmt = (body.format or "pdf").lower().strip()
    if fmt not in ("pdf", "docx"):
        fmt = "pdf"

    # Convert Pydantic models to dicts for the renderer
    sections_dicts = [s.model_dump() if hasattr(s, "model_dump") else s.dict() for s in body.sections]

    doc_bytes: bytes
    mime: str
    ext: str
    try:
        if fmt == "docx":
            from dilly_core.resume_docx_export import render_resume_docx
            doc_bytes = render_resume_docx(sections_dicts, template_name=template_name)
            mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ext = "docx"
        else:
            from dilly_core.resume_pdf_export import render_resume_pdf
            doc_bytes = render_resume_pdf(
                sections_dicts,
                template_name=template_name,
                candidate_name=candidate_name,
            )
            mime = "application/pdf"
            ext = "pdf"
    except Exception as e:
        import sys, traceback
        sys.stderr.write(f"[{fmt}_export_failed] {type(e).__name__}: {str(e)[:200]}\n")
        try: traceback.print_exc(file=sys.stderr)
        except Exception: pass
        raise HTTPException(status_code=500, detail=f"{fmt.upper()} render failed: {type(e).__name__}")

    filename = body.filename or f"{(candidate_name or 'resume').strip().replace(' ', '_')}_{template_name}.{ext}"

    if (request.query_params.get("raw") or "").lower() in ("1", "true", "yes"):
        return Response(
            content=doc_bytes,
            media_type=mime,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    token = _stash_pdf(doc_bytes, filename, mime=mime)
    base_url = str(request.base_url).rstrip("/")
    public_url = f"{base_url}/resume/export/{token}"
    return {
        "filename": filename,
        "mime": mime,
        "size_bytes": len(doc_bytes),
        "url": public_url,
        "token": token,
        "template": template_name,
        "format": fmt,
        "expires_in_sec": _PDF_EXPORT_TTL,
    }


# ── Transient PDF export cache ─────────────────────────────────────────────
# Process-local dict. Good enough for single-instance Railway deployments;
# on multi-instance deployments the client would need to retry if the request
# lands on a different instance. For Dilly's current scale that's acceptable.

import secrets as _secrets
import time as _time
import threading as _threading
_PDF_EXPORT_CACHE: dict = {}
_PDF_EXPORT_TTL = 600  # 10 min
_PDF_EXPORT_LOCK = _threading.Lock()


def _stash_pdf(pdf_bytes: bytes, filename: str, mime: str = "application/pdf") -> str:
    """Store document bytes in the in-memory cache and return a token.
    Works for both PDFs and DOCX — the mime type is stored alongside the
    bytes so the fetch endpoint can serve either."""
    token = _secrets.token_urlsafe(24)
    with _PDF_EXPORT_LOCK:
        now = _time.time()
        expired = [k for k, v in _PDF_EXPORT_CACHE.items() if now - v.get("ts", 0) > _PDF_EXPORT_TTL]
        for k in expired:
            _PDF_EXPORT_CACHE.pop(k, None)
        _PDF_EXPORT_CACHE[token] = {
            "bytes": pdf_bytes,
            "filename": filename,
            "mime": mime,
            "ts": now,
        }
    return token


@router.get("/resume/export/{token}")
async def resume_export_fetch(token: str):
    """
    Public endpoint that streams a stashed export (PDF or DOCX) from the
    transient cache. No auth — the token is a cryptographically random
    24-byte value that only the user who just generated it has seen.
    """
    with _PDF_EXPORT_LOCK:
        entry = _PDF_EXPORT_CACHE.get(token)
        if entry is None:
            raise HTTPException(status_code=404, detail="Export expired or invalid.")
        if _time.time() - entry.get("ts", 0) > _PDF_EXPORT_TTL:
            _PDF_EXPORT_CACHE.pop(token, None)
            raise HTTPException(status_code=410, detail="Export expired — regenerate.")

    mime = entry.get("mime") or "application/pdf"
    filename = entry.get("filename") or ("resume.docx" if "word" in mime else "resume.pdf")
    # DOCX should download; PDF can render inline in Safari
    disposition = "attachment" if "word" in mime else "inline"
    return Response(
        content=entry["bytes"],
        media_type=mime,
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ---------------------------------------------------------------------------
# Resume Variants — manifest + per-variant content files
# ---------------------------------------------------------------------------
# Manifest: resume_variants.json  → { "variants": [ VariantMeta, ... ] }
# Content:  resume_variant_{id}.json → { "sections": [...], "saved_at": "..." }


class VariantMeta(BaseModel):
    id: str
    label: str
    cohort: str
    type: str = "cohort"           # "cohort" | "job"
    job_title: Optional[str] = None
    job_company: Optional[str] = None
    created_at: str


class CreateVariantRequest(BaseModel):
    label: str
    cohort: str
    type: str = "cohort"
    job_title: Optional[str] = None
    job_company: Optional[str] = None
    sections: Optional[List[ResumeSection]] = None  # seed content


class RenameVariantRequest(BaseModel):
    label: str


class SaveVariantRequest(BaseModel):
    sections: List[ResumeSection]


def _variants_manifest_path(email: str) -> str:
    folder = get_profile_folder_path(email)
    return os.path.join(folder, _VARIANTS_MANIFEST_FILENAME) if folder else ""


def _variant_content_path(email: str, variant_id: str) -> str:
    folder = get_profile_folder_path(email)
    return os.path.join(folder, f"resume_variant_{variant_id}.json") if folder else ""


def _load_manifest(email: str) -> dict:
    path = _variants_manifest_path(email)
    if path and os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"variants": []}


def _save_manifest(email: str, manifest: dict) -> None:
    path = _variants_manifest_path(email)
    if not path:
        return
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(manifest, f, separators=(",", ":"))
    os.replace(tmp, path)


def _load_variant_content(email: str, variant_id: str) -> dict | None:
    path = _variant_content_path(email, variant_id)
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _save_variant_content(email: str, variant_id: str, sections: list) -> None:
    path = _variant_content_path(email, variant_id)
    if not path:
        raise ValueError("Invalid email")
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"sections": sections, "saved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, f, separators=(",", ":"))
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Major / legacy cohort → 22 spec cohort label mapping
# ---------------------------------------------------------------------------

_MAJOR_TO_SPEC_COHORT: Dict[str, str] = {
    "Computer Science": "Software Engineering & CS",
    "Computer Information Systems": "Software Engineering & CS",
    "Software Engineering": "Software Engineering & CS",
    "Cybersecurity": "Cybersecurity & IT",
    "Information Technology": "Cybersecurity & IT",
    "Data Science": "Data Science & Analytics",
    "Statistics": "Data Science & Analytics",
    "Mathematics": "Physical Sciences & Math",
    "Physics": "Physical Sciences & Math",
    "Finance": "Finance & Accounting",
    "Accounting": "Finance & Accounting",
    "Economics": "Economics & Public Policy",
    "Government and World Affairs": "Economics & Public Policy",
    "Political Science": "Economics & Public Policy",
    "Business Administration": "Management & Operations",
    "International Business": "Management & Operations",
    "Management": "Management & Operations",
    "Marketing": "Marketing & Advertising",
    "Advertising and Public Relations": "Marketing & Advertising",
    "Biology": "Life Sciences & Research",
    "Chemistry": "Life Sciences & Research",
    "Biochemistry": "Life Sciences & Research",
    "Forensic Science": "Life Sciences & Research",
    "Marine Science": "Environmental & Sustainability",
    "Environmental Science": "Environmental & Sustainability",
    "Nursing": "Healthcare & Clinical",
    "Health Sciences": "Healthcare & Clinical",
    "Exercise Science": "Healthcare & Clinical",
    "Kinesiology": "Healthcare & Clinical",
    "Allied Health": "Healthcare & Clinical",
    "Public Health": "Healthcare & Clinical",
    "Psychology": "Social Sciences & Nonprofit",
    "Sociology": "Social Sciences & Nonprofit",
    "Criminal Justice": "Social Sciences & Nonprofit",
    "Social Work": "Social Sciences & Nonprofit",
    "History": "Social Sciences & Nonprofit",
    "Philosophy": "Social Sciences & Nonprofit",
    "Liberal Arts": "Social Sciences & Nonprofit",
    "English": "Media & Communications",
    "Journalism": "Media & Communications",
    "Communication": "Media & Communications",
    "Education": "Education & Teaching",
    "Theatre Arts": "Design & Creative",
    "Music": "Design & Creative",
    "Digital Arts and Design": "Design & Creative",
    "Sport Management": "Hospitality & Events",
}

_LEGACY_TO_SPEC_COHORT: Dict[str, str] = {
    "Tech": "Software Engineering & CS",
    "Business": "Finance & Accounting",
    "Science": "Life Sciences & Research",
    "Quantitative": "Data Science & Analytics",
    "Health": "Healthcare & Clinical",
    "Pre-Health": "Healthcare & Clinical",
    "Social Science": "Social Sciences & Nonprofit",
    "Humanities": "Media & Communications",
    "Sport": "Hospitality & Events",
    "Pre-Law": "Legal & Compliance",
    "Finance": "Finance & Accounting",
    "General": "General",
}

_SPEC_COHORT_LABELS = frozenset({
    "Software Engineering & CS", "Data Science & Analytics", "Cybersecurity & IT",
    "Finance & Accounting", "Marketing & Advertising", "Consulting & Strategy",
    "Management & Operations", "Economics & Public Policy", "Entrepreneurship & Innovation",
    "Healthcare & Clinical", "Life Sciences & Research", "Physical Sciences & Math",
    "Social Sciences & Nonprofit", "Media & Communications", "Design & Creative",
    "Legal & Compliance", "Human Resources & People", "Supply Chain & Logistics",
    "Education & Teaching", "Real Estate & Construction", "Environmental & Sustainability",
    "Hospitality & Events",
})


def _major_to_cohort_label(value: str) -> str:
    """Map a major name or legacy cohort key to a 22-spec cohort label."""
    if not value:
        return "General"
    c = _MAJOR_TO_SPEC_COHORT.get(value)
    if c:
        return c
    c = _LEGACY_TO_SPEC_COHORT.get(value)
    if c:
        return c
    if value in _SPEC_COHORT_LABELS:
        return value
    return "General"


# ---------------------------------------------------------------------------
# Parsed resume text → editor sections converter
# ---------------------------------------------------------------------------

def _split_parsed_text_blocks(text: str) -> Dict[str, str]:
    """Split stored parsed resume text into a dict keyed by lowercase section label."""
    if not text:
        return {}
    blocks: Dict[str, str] = {}
    # Top-level name line before any section header
    name_m = _re.match(r"Name:\s*(.+)", text.strip())
    if name_m:
        blocks["_name"] = name_m.group(1).strip()
    # Split on [SECTION LABEL] lines
    parts = _re.split(r"\n(\[[^\]]+\])\n", "\n" + text)
    i = 0
    while i < len(parts):
        seg = parts[i].strip()
        if seg.startswith("[") and seg.endswith("]"):
            label = seg[1:-1].strip().lower()
            content = parts[i + 1].strip() if i + 1 < len(parts) else ""
            # Multiple blocks with same canonical key get merged
            if label in blocks:
                blocks[label] = blocks[label] + "\n\n" + content
            else:
                blocks[label] = content
            i += 2
        else:
            i += 1
    return blocks


def _build_contact_section(content: str, name_hint: str) -> Dict[str, str]:
    name = name_hint or ""
    email = phone = location = linkedin = github = portfolio = ""
    for line in content.split("\n"):
        s = line.strip()
        if not s or s.lower().startswith("cohort:"):
            continue
        for prefix, target in [
            ("email:", "email"), ("phone:", "phone"), ("location:", "location"),
            ("linkedin:", "linkedin"), ("github:", "github"), ("portfolio:", "portfolio"),
        ]:
            if s.lower().startswith(prefix):
                val = s[len(prefix):].strip()
                if target == "email":
                    email = val
                elif target == "phone":
                    phone = val
                elif target == "location":
                    location = val
                elif target == "linkedin":
                    linkedin = val
                elif target == "github":
                    github = val
                elif target == "portfolio":
                    portfolio = val
                break
        else:
            # Non-labeled line → name if not already set and looks like a name
            if not name and "@" not in s and not _re.match(r"^\d", s):
                name = s
    return {
        "name": name, "email": email, "phone": phone,
        "location": location, "linkedin": linkedin,
        "github": github, "portfolio": portfolio,
    }


def _build_education_entry(content: str) -> Dict[str, Any]:
    university = major = minor = graduation = honors = gpa = location = ""
    for line in content.split("\n"):
        s = line.strip()
        if not s:
            continue
        for prefix, key in [
            ("university:", "university"), ("major(s):", "major"), ("major:", "major"),
            ("minor(s):", "minor"), ("minor:", "minor"),
            ("graduation date:", "graduation"), ("graduation:", "graduation"),
            ("honors:", "honors"), ("gpa:", "gpa"), ("location:", "location"),
        ]:
            if s.lower().startswith(prefix):
                val = s[len(prefix):].strip()
                if val.lower() in ("n/a", "not honors", ""):
                    val = ""
                if key == "university":
                    university = val
                elif key == "major":
                    major = val
                elif key == "minor":
                    minor = val
                elif key == "graduation":
                    graduation = val
                elif key == "honors":
                    honors = val
                elif key == "gpa":
                    gpa = val
                elif key == "location":
                    location = val
                break
    return {
        "id": "edu_1", "university": university, "major": major, "minor": minor,
        "graduation": graduation, "location": location, "honors": honors, "gpa": gpa,
    }


def _build_experience_entries(content: str) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    try:
        from dilly_core.structured_resume import _parse_experience_entries as _pee
        raw = _pee(content)
    except Exception:
        raw = []
    for i, e in enumerate(raw):
        desc = e.get("description", "")
        bullets = []
        for ln in desc.split("\n"):
            ln = ln.strip().lstrip("•").strip()
            if ln:
                bullets.append({"id": f"b{i}_{len(bullets)}", "text": ln})
        if not bullets:
            bullets = [{"id": f"b{i}_0", "text": ""}]
        entries.append({
            "id": f"exp_{i}",
            "company": e.get("company", "") if e.get("company", "N/A") != "N/A" else "",
            "role": e.get("role", "") if e.get("role", "N/A") != "N/A" else "",
            "date": e.get("date", ""),
            "location": e.get("location", "") if e.get("location", "N/A") != "N/A" else "",
            "bullets": bullets,
        })
    return entries


def _build_project_entries(content: str) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    try:
        from dilly_core.structured_resume import _parse_project_entries as _ppe
        raw = _ppe(content)
    except Exception:
        raw = []
    for i, e in enumerate(raw):
        desc = e.get("description", "")
        bullets = []
        for ln in desc.split("\n"):
            ln = ln.strip().lstrip("•").strip()
            if ln:
                bullets.append({"id": f"bp{i}_{len(bullets)}", "text": ln})
        if not bullets:
            bullets = [{"id": f"bp{i}_0", "text": ""}]
        entries.append({
            "id": f"proj_{i}",
            "name": e.get("project_name", "") if e.get("project_name", "N/A") != "N/A" else "",
            "date": e.get("date", "") if e.get("date", "N/A") != "N/A" else "",
            "location": e.get("location", "") if e.get("location", "N/A") != "N/A" else "",
            "bullets": bullets,
        })
    return entries


def _build_simple_section(content: str, sid: str = "s1") -> Dict[str, Any]:
    lines = [ln.strip().lstrip("•").strip() for ln in content.split("\n") if ln.strip()]
    return {"id": sid, "lines": lines}


def _parsed_text_to_editor_sections(text: str, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Convert stored parsed resume labeled text → list of ResumeSection dicts
    in the editor's JSON format. Used to seed variant content on first open.
    """
    blocks = _split_parsed_text_blocks(text)
    name_hint = blocks.get("_name") or profile.get("name") or ""
    sections: List[Dict[str, Any]] = []

    # Contact
    contact_raw = blocks.get("contact / top") or blocks.get("contact") or ""
    sections.append({
        "key": "contact", "label": "Contact",
        "contact": _build_contact_section(contact_raw, name_hint),
        "education": None, "experiences": None, "projects": None,
        "simple": None, "leadership": None,
    })

    # Education
    edu_raw = blocks.get("education") or ""
    if edu_raw:
        sections.append({
            "key": "education", "label": "Education",
            "contact": None,
            "education": _build_education_entry(edu_raw),
            "experiences": None, "projects": None, "simple": None, "leadership": None,
        })

    # Professional experience
    for block_label, sec_key, sec_display in [
        ("professional experience", "experience", "Experience"),
        ("research", "experience", "Experience"),
    ]:
        raw = blocks.get(block_label) or ""
        if raw:
            entries = _build_experience_entries(raw)
            if entries:
                sections.append({
                    "key": sec_key, "label": sec_display,
                    "contact": None, "education": None,
                    "experiences": entries,
                    "projects": None, "simple": None, "leadership": None,
                })

    # Leadership / involvement
    for block_label in ("campus involvement", "volunteer experience"):
        raw = blocks.get(block_label) or ""
        if raw:
            entries = _build_experience_entries(raw)
            if entries:
                sections.append({
                    "key": "leadership", "label": "Leadership & Activities",
                    "contact": None, "education": None, "experiences": None,
                    "projects": None, "simple": None,
                    "leadership": entries,
                })

    # Projects
    proj_raw = blocks.get("projects") or ""
    if proj_raw:
        entries = _build_project_entries(proj_raw)
        if entries:
            sections.append({
                "key": "projects", "label": "Projects",
                "contact": None, "education": None, "experiences": None,
                "projects": entries, "simple": None, "leadership": None,
            })

    # Skills
    skills_raw = blocks.get("skills") or ""
    if skills_raw:
        sections.append({
            "key": "skills", "label": "Skills",
            "contact": None, "education": None, "experiences": None,
            "projects": None,
            "simple": _build_simple_section(skills_raw, "skills_1"),
            "leadership": None,
        })

    # Optional simple sections
    for block_label, sec_key, sec_display in [
        ("honors", "honors", "Honors"),
        ("certifications", "certifications", "Certifications"),
        ("summary objective", "summary", "Summary"),
        ("relevant coursework", "coursework", "Relevant Coursework"),
        ("publications presentations", "publications", "Publications"),
    ]:
        raw = blocks.get(block_label) or ""
        if raw:
            sections.append({
                "key": sec_key, "label": sec_display,
                "contact": None, "education": None, "experiences": None,
                "projects": None,
                "simple": _build_simple_section(raw, f"{sec_key}_1"),
                "leadership": None,
            })

    return sections


def _load_parsed_resume_for_email(email: str) -> Optional[str]:
    """Load the user's stored parsed resume text file, if it exists."""
    try:
        from dilly_core.structured_resume import safe_filename_from_key, read_parsed_resume
        parsed_dir = os.path.join(_WORKSPACE_ROOT, "projects", "dilly", "parsed_resumes")
        filepath = os.path.join(parsed_dir, safe_filename_from_key(email))
        if os.path.isfile(filepath):
            return read_parsed_resume(filepath)
    except Exception as exc:
        sys.stderr.write(f"Dilly resume.py: failed to load parsed resume for {email!r}: {exc}\n")
    return None


# ---------------------------------------------------------------------------
# Variant bootstrapping
# ---------------------------------------------------------------------------

def _ensure_variants_bootstrapped(email: str, profile: Dict[str, Any]) -> dict:
    """
    If user has no variants yet, create one per major cohort + one per minor cohort,
    each seeded with content from resume_edited.json or the parsed resume file.
    """
    manifest = _load_manifest(email)
    if manifest["variants"]:
        return manifest

    # Determine ordered cohort list (primary → majors → minors, deduped)
    majors: List[str] = profile.get("majors") or []
    minors: List[str] = profile.get("minors") or []
    primary_cohort: str = profile.get("cohort") or "General"

    seen: set = set()
    cohort_list: List[str] = []
    for src in [primary_cohort] + majors + minors:
        label = _major_to_cohort_label(src)
        if label not in seen:
            seen.add(label)
            cohort_list.append(label)
    if not cohort_list:
        cohort_list = ["General"]

    # Load seed content: resume_edited.json first, then parsed resume file
    existing = _load_resume(email)
    seed_sections: Optional[list] = (existing or {}).get("sections") or None
    if not seed_sections:
        parsed_text = _load_parsed_resume_for_email(email)
        if parsed_text:
            try:
                seed_sections = _parsed_text_to_editor_sections(parsed_text, profile)
            except Exception as exc:
                sys.stderr.write(f"Dilly resume.py: parsed→editor conversion failed for {email!r}: {exc}\n")
                seed_sections = None

    # Create one variant per cohort, all seeded with the same base content
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    variants = []
    for cohort in cohort_list:
        safe_id = cohort.lower().replace(" ", "_").replace("&", "and").replace("/", "_")
        variant_id = f"cohort_{safe_id}"
        meta = {
            "id": variant_id, "label": cohort, "cohort": cohort,
            "type": "cohort", "job_title": None, "job_company": None, "created_at": now,
        }
        variants.append(meta)
        if seed_sections:
            _save_variant_content(email, variant_id, seed_sections)

    manifest["variants"] = variants
    _save_manifest(email, manifest)
    return manifest


@router.get("/resume/variants")
async def list_variants(request: Request):
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    profile = ensure_profile_exists(email)
    manifest = await asyncio.to_thread(_ensure_variants_bootstrapped, email, profile)
    return {"variants": manifest["variants"]}


@router.post("/resume/variants")
async def create_variant(request: Request, body: CreateVariantRequest):
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    manifest = _load_manifest(email)
    variant_id = _uuid_mod.uuid4().hex[:12]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    meta = {
        "id": variant_id, "label": body.label, "cohort": body.cohort,
        "type": body.type, "job_title": body.job_title, "job_company": body.job_company,
        "created_at": now,
    }
    manifest["variants"].append(meta)
    await asyncio.to_thread(_save_manifest, email, manifest)
    if body.sections:
        sections_raw = [s.model_dump() for s in body.sections]
        await asyncio.to_thread(_save_variant_content, email, variant_id, sections_raw)
    return {"variant": meta}


@router.get("/resume/variants/{variant_id}")
async def get_variant_content(request: Request, variant_id: str):
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    content = await asyncio.to_thread(_load_variant_content, email, variant_id)
    return {"sections": (content or {}).get("sections") or [], "saved_at": (content or {}).get("saved_at")}


@router.put("/resume/variants/{variant_id}")
async def save_variant_content(request: Request, variant_id: str, body: SaveVariantRequest):
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    # Verify variant exists
    manifest = _load_manifest(email)
    if not any(v["id"] == variant_id for v in manifest["variants"]):
        raise errors.not_found("Variant not found.")
    sections_raw = [s.model_dump() for s in body.sections]
    await asyncio.to_thread(_save_variant_content, email, variant_id, sections_raw)
    return {"ok": True, "saved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


@router.patch("/resume/variants/{variant_id}")
async def rename_variant(request: Request, variant_id: str, body: RenameVariantRequest):
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    manifest = _load_manifest(email)
    updated = False
    for v in manifest["variants"]:
        if v["id"] == variant_id:
            v["label"] = body.label[:80]
            updated = True
            break
    if not updated:
        raise errors.not_found("Variant not found.")
    await asyncio.to_thread(_save_manifest, email, manifest)
    return {"ok": True}


@router.delete("/resume/variants/{variant_id}")
async def delete_variant(request: Request, variant_id: str):
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    manifest = _load_manifest(email)
    before = len(manifest["variants"])
    manifest["variants"] = [v for v in manifest["variants"] if v["id"] != variant_id]
    if len(manifest["variants"]) == before:
        raise errors.not_found("Variant not found.")
    await asyncio.to_thread(_save_manifest, email, manifest)
    # Delete content file
    path = _variant_content_path(email, variant_id)
    if path and os.path.isfile(path):
        try:
            os.unlink(path)
        except OSError:
            pass
    return {"ok": True}


# ---------------------------------------------------------------------------
# AI Resume Generation
# ---------------------------------------------------------------------------

# Map job title keywords → cohort
_TITLE_COHORT_MAP = [
    (["software", "engineer", "developer", "swe", "fullstack", "backend", "frontend", "ios", "android",
      "machine learning", "ml engineer", "ai engineer", "data engineer", "devops", "sre", "cloud",
      "cybersecurity", "infosec", "it analyst", "systems", "firmware", "embedded"], "Tech"),
    (["data scientist", "data analyst", "quantitative", "quant", "actuar", "statistician"], "Quantitative"),
    (["investment banking", "investment bank", "private equity", "pe analyst", "trading", "hedge fund",
      "goldman", "jp morgan", "morgan stanley", "bulge bracket", "ib analyst"], "Business"),
    (["financial analyst", "finance", "accounting", "audit", "tax", "cpa", "controller",
      "treasury", "equity research", "credit analyst"], "Business"),
    (["marketing", "brand", "advertising", "pr ", "public relations", "growth", "content",
      "social media", "seo", "product marketing"], "Business"),
    (["consulting", "strategy", "operations", "business analyst", "management consultant",
      "associate consultant", "mbb"], "Social Science"),
    (["nurse", "nursing", "clinical", "patient care", "medical assistant", "pharmacy",
      "physician", "healthcare", "hospital", "emt", "paramedic", "health care"], "Health"),
    (["research", "lab", "biology", "chemistry", "biochem", "molecular", "neuroscience",
      "ecology", "environmental scientist", "geologist"], "Science"),
    (["journalist", "writer", "editor", "content creator", "media", "broadcast",
      "communications", "public affairs", "copywriter"], "Humanities"),
    (["athletic trainer", "sports", "recreation", "coaching", "fitness", "physical education",
      "sport management", "espn", "nfl", "nba", "mlb"], "Sport"),
]

_COMPANY_FINANCE_KEYWORDS = [
    "bank", "capital", "financial", "investments", "securities", "asset management",
    "wealth management", "insurance", "raymond james", "edward jones", "charles schwab",
    "fidelity", "vanguard", "blackrock", "pimco", "jpmorgan", "goldman", "morgan stanley",
    "wells fargo", "citigroup", "bank of america", "ubs", "credit suisse", "barclays",
]


def _detect_cohort_from_job(title: str, company: str) -> str:
    title_l = title.lower()
    company_l = company.lower()
    for keywords, cohort in _TITLE_COHORT_MAP:
        if any(kw in title_l for kw in keywords):
            # Tech role at a finance company → still Tech template, but note the company context
            return cohort
    # If no title match, fall back to company industry
    if any(kw in company_l for kw in _COMPANY_FINANCE_KEYWORDS):
        return "Business"
    return "General"


class GenerateResumeRequest(BaseModel):
    job_title: str
    job_company: str
    job_description: Optional[str] = ""
    cohort: Optional[str] = None       # override auto-detection
    base_variant_id: Optional[str] = None  # which variant to use as source material


@router.post("/resume/generate")
async def generate_resume(request: Request, body: GenerateResumeRequest):
    """
    AI-generate a job-tailored resume. Uses the user's Dilly Profile + existing resume + JD.
    Returns structured ResumeSection JSON.
    """
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()

    job_title = (body.job_title or "").strip()
    job_company = (body.job_company or "").strip()
    job_description = (body.job_description or "").strip()
    if not job_title or not job_company:
        raise errors.validation_error("job_title and job_company are required.")

    # ── Plan gate: monthly resume gen limits ──────────────────────────────
    # Resume generation is the most expensive call (~$0.07 each).
    # Strict caps:
    #   starter: 0 (paid feature, immediate upgrade prompt)
    #   building: 5 / month (dropout path gets some coaching)
    #   dilly:   30 / month
    #   pro:     unlimited
    from projects.dilly.api.profile_store import get_profile as _gp_for_plan
    _profile_for_plan = _gp_for_plan(email) or {}
    _resume_plan = (_profile_for_plan.get("plan") or "starter").lower().strip()
    _resume_limit = _resume_plan_limit(_resume_plan)
    _resume_used, _ = _get_resume_usage(email)
    # Starter is explicitly limit==0: paid feature, never runs the LLM.
    if _resume_limit == 0:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "RESUME_REQUIRES_PLAN",
                "message": "Tailored resumes are a Dilly feature.",
                "plan": _resume_plan,
                "required_plan": "dilly",
                "features_unlocked": [
                    "ATS-tailored resumes per role",
                    "30 generations every month",
                    "Fit narratives on every job",
                    "Unlimited chat with Dilly",
                ],
            },
        )
    # Paid tier out of monthly budget: upgrade to next tier.
    if 0 < _resume_limit <= _resume_used:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "RESUME_MONTHLY_CAP",
                "message": f"You've used all {_resume_limit} resumes this month. Resets on the 1st.",
                "required_plan": "pro" if _resume_plan == "dilly" else "dilly",
                "used": _resume_used,
                "limit": _resume_limit,
            },
        )

    cohort = body.cohort or _detect_cohort_from_job(job_title, job_company)

    # ------------------------------------------------------------------
    # Look up the job's ATS system
    # ------------------------------------------------------------------
    job_ats = None
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            cur = conn.cursor()
            # Try matching by company name + title
            cur.execute(
                "SELECT source_ats FROM internships i JOIN companies c ON i.company_id = c.id "
                "WHERE c.name ILIKE %s AND i.title ILIKE %s AND i.status = 'active' LIMIT 1",
                (f"%{job_company}%", f"%{job_title}%")
            )
            row = cur.fetchone()
            if row:
                job_ats = row[0]
            if not job_ats:
                # Fallback: just match company
                cur.execute(
                    "SELECT source_ats FROM internships i JOIN companies c ON i.company_id = c.id "
                    "WHERE c.name ILIKE %s AND i.status = 'active' AND source_ats IS NOT NULL LIMIT 1",
                    (f"%{job_company}%",)
                )
                row = cur.fetchone()
                if row:
                    job_ats = row[0]
    except Exception:
        pass

    if not job_ats:
        job_ats = 'greenhouse'  # Safe default

    # Load existing resume (base variant or primary)
    base_sections = []
    if body.base_variant_id:
        content = await asyncio.to_thread(_load_variant_content, email, body.base_variant_id)
        if content:
            base_sections = content.get("sections") or []
    if not base_sections:
        existing = await asyncio.to_thread(_load_resume, email)
        if existing:
            base_sections = existing.get("sections") or []

    # Load Dilly Profile facts with two-pass relevance ranking.
    # Pass 1 (Haiku): given the full fact set and the JD, pick the ~60 most
    # relevant facts. This is how Dilly actually uses a user's depth —
    # students with 3000 facts don't get truncated by insertion order, they
    # get their 60 best-matching facts selected by the model.
    # Pass 2 (main Sonnet call below): uses only those top-ranked facts as
    # ground truth.
    profile_facts_text = ""
    selected_facts: list[dict] = []
    narrative = ""
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = await asyncio.to_thread(get_memory_surface, email)
        all_facts = surface.get("items") or []
        narrative = (surface.get("narrative") or "").strip()

        # Filter out always-private categories before ranking.
        PRIVATE = frozenset({
            "challenge", "concern", "weakness", "fear", "personal",
            "contact", "phone", "email_address", "life_context",
            "areas_for_improvement",
        })
        candidate_facts = [
            f for f in all_facts
            if (f.get("category") or "").lower() not in PRIVATE
        ]

        MAX_FACTS_TO_LLM = 60
        if len(candidate_facts) <= MAX_FACTS_TO_LLM:
            # User has few enough facts — no ranking needed.
            selected_facts = candidate_facts
        else:
            # Rank facts by JD relevance with Haiku (cheap, fast).
            try:
                import anthropic as _anth_rank
                _client_rank = _anth_rank.Anthropic(
                    api_key=os.environ.get("ANTHROPIC_API_KEY", "")
                )
                numbered = "\n".join(
                    f"[{i}] {(f.get('category') or 'other')}: "
                    f"{(f.get('label') or '').strip()} — "
                    f"{(f.get('value') or '').strip()[:220]}"
                    for i, f in enumerate(candidate_facts[:300])  # cap context at 300
                )
                rank_system = (
                    "You are a relevance ranker for a resume generator. Given "
                    "a job description and a numbered list of candidate facts "
                    "about a student, return the indices of the most relevant "
                    "facts ONLY — the ones that would strengthen a resume for "
                    "this specific job. Return valid JSON: "
                    "{\"indices\": [int, int, ...]} sorted by relevance desc. "
                    "Limit to 60. Do not invent. Do not explain."
                )
                rank_user = (
                    f"JOB: {job_title} at {job_company}\n"
                    f"JD: {job_description[:2500] or '(none)'}\n\n"
                    f"CANDIDATE FACTS:\n{numbered}\n\n"
                    "Return JSON now."
                )
                rank_res = _client_rank.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=600,
                    system=rank_system,
                    messages=[{"role": "user", "content": rank_user}],
                )
                try:
                    from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
                    log_from_anthropic_response(email, FEATURES.RESUME_FACT_RANK, rank_res)
                except Exception:
                    pass
                rank_text = rank_res.content[0].text if rank_res.content else ""
                js = rank_text.find("{")
                je = rank_text.rfind("}") + 1
                parsed = json.loads(rank_text[js:je]) if js >= 0 else {}
                idxs = parsed.get("indices") or []
                picked: list[dict] = []
                seen: set[int] = set()
                for i in idxs:
                    if isinstance(i, int) and 0 <= i < len(candidate_facts) and i not in seen:
                        picked.append(candidate_facts[i])
                        seen.add(i)
                    if len(picked) >= MAX_FACTS_TO_LLM:
                        break
                # Fallback: if ranking returned <15 facts, pad with recency.
                if len(picked) < 15:
                    for f in candidate_facts:
                        if f not in picked:
                            picked.append(f)
                        if len(picked) >= MAX_FACTS_TO_LLM:
                            break
                selected_facts = picked or candidate_facts[:MAX_FACTS_TO_LLM]
            except Exception:
                # Ranker failed — fall back to top-N by default ordering.
                selected_facts = candidate_facts[:MAX_FACTS_TO_LLM]

        # Render selected facts for the Sonnet prompt, grouped by category
        # so the LLM can see the shape of the profile.
        cat_labels = {
            "achievement": "Achievements", "goal": "Goals",
            "target_company": "Target Companies",
            "skill_unlisted": "Skills (not yet on resume, CAN be added)",
            "skill": "Skills", "technical_skill": "Technical Skills",
            "project_detail": "Additional Projects (CAN be added)",
            "project": "Projects",
            "motivation": "Motivations", "personality": "Personality",
            "soft_skill": "Soft Skills", "hobby": "Interests",
            "company_culture_pref": "Work Style Preferences",
            "strength": "Strengths",
            "experience": "Experience details",
            "education": "Education details",
            "career_interest": "Career Interests",
            "interest": "Interests",
        }
        if selected_facts:
            grouped: dict[str, list] = {}
            for f in selected_facts:
                grouped.setdefault(f.get("category", "other"), []).append(f)
            lines = []
            for cat, items in grouped.items():
                label = cat_labels.get(cat, cat.replace("_", " ").title())
                entries = "; ".join(
                    f"{(i.get('label') or '').strip()}: {(i.get('value') or '').strip()}"
                    for i in items
                )
                lines.append(f"  {label}: {entries}")
            profile_facts_text = "\n".join(lines)
            if narrative:
                profile_facts_text = (
                    f"NARRATIVE: {narrative}\n\nRELEVANT FACTS ("
                    f"{len(selected_facts)} of {len(candidate_facts)} "
                    f"ranked by job relevance):\n{profile_facts_text}"
                )
    except Exception:
        pass

    # Serialize base resume as readable text for context
    base_resume_json = json.dumps(base_sections, separators=(",", ":")) if base_sections else "[]"
    # Truncate if too long
    if len(base_resume_json) > 12000:
        base_resume_json = base_resume_json[:12000] + "..."

    # ------------------------------------------------------------------
    # Honesty check: evaluate if user is ready for this role
    # ------------------------------------------------------------------
    readiness = 'ready'  # ready | gaps | not_ready
    gaps_detail = ''
    check_data = {}
    try:
        import anthropic
        client_check = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        check_response = client_check.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system="You evaluate if a candidate has enough in their profile to create an honest resume for a specific role. Return JSON only: {\"readiness\": \"ready\" | \"gaps\" | \"not_ready\", \"gaps\": [\"list of specific missing things\"], \"summary\": \"one sentence explanation\"}. ready = can build a strong resume. gaps = can build a resume but has notable gaps. not_ready = profile is too thin or mismatched for this role.",
            messages=[{"role": "user", "content": f"Role: {job_title} at {job_company}\nJD: {job_description[:1500]}\nProfile: {profile_facts_text[:2000]}\nResume sections: {len(base_sections)} sections"}],
        )
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response(email, FEATURES.RESUME_KW_CHECK, check_response)
        except Exception:
            pass
        check_text = check_response.content[0].text
        j_start = check_text.find('{')
        j_end = check_text.rfind('}') + 1
        if j_start >= 0:
            check_data = json.loads(check_text[j_start:j_end])
            readiness = check_data.get('readiness', 'ready')
            gaps_detail = json.dumps(check_data.get('gaps', []))
    except Exception:
        readiness = 'ready'  # If check fails, proceed with generation

    # ------------------------------------------------------------------
    # If not_ready, return early without generating. The mobile UI shows
    # a "Tell Dilly more" screen that routes to the AI overlay with the
    # specific gaps as starter prompts, so the user can fill them in and
    # regenerate when they have enough in their profile. Dilly never
    # invents — if the profile is too thin, we ask for more, we don't
    # bluff.
    # ------------------------------------------------------------------
    if readiness == 'not_ready':
        gaps_list = check_data.get('gaps') or []
        return JSONResponse({
            "not_ready": True,
            "summary": check_data.get(
                'summary',
                "Your profile doesn't have enough relevant experience for this "
                "role yet. Tell Dilly more about what you've done and we'll "
                "try again.",
            ),
            "gaps": gaps_list,
            "ats": job_ats,
            # Starter prompts the mobile UI can use to open the AI overlay
            # with one specific gap at a time.
            "tell_dilly_prompts": [
                f"Help me add details about {g} to my Dilly profile."
                for g in gaps_list[:5]
            ],
            "facts_available": len(selected_facts) if selected_facts else 0,
        })

    # Finance company modifier for tech roles
    company_l = job_company.lower()
    is_finance_company = any(kw in company_l for kw in _COMPANY_FINANCE_KEYWORDS)
    finance_note = ""
    if cohort == "Tech" and is_finance_company:
        finance_note = f"\nNOTE: {job_company} is a finance/banking firm. Even though this is a tech role, include GPA if ≥3.5, use a slightly more formal tone, and highlight any finance-domain knowledge."

    # ── Path-specific resume template ──────────────────────────────────
    # The resume's shape changes based on who the user is. A college
    # dropout doesn't have a GPA or a graduation year — and including them
    # would leave blanks that signal "no degree" to a recruiter. A 20-year
    # senior's resume runs two pages and leads with Experience, not school.
    # A career-switcher's Skills section needs to bridge their old field
    # to their new one. These are NOT cohort decisions (tech/finance/
    # healthcare) — they're path decisions that sit on top of cohort.
    _user_path = ""
    _field_focus = ""
    try:
        _profile_for_path = get_profile(email) or {}
        _user_path = (_profile_for_path.get("user_path") or "").strip().lower()
        _career_fields = _profile_for_path.get("career_fields") or []
        if _career_fields:
            _field_focus = str(_career_fields[0])
    except Exception:
        pass

    # Field-specific tailoring for EVERYONE: whoever they are, the resume
    # leans into the field they've picked (Data Science, Product, etc.)
    _field_tailor_block = (
        f"FIELD FOCUS: {_field_focus}. Tailor every bullet's language, skill "
        f"ordering, and terminology to how recruiters in {_field_focus} read "
        f"resumes. Use the vocabulary of that field. Lead with the metrics "
        f"and accomplishments that that field cares about."
        if _field_focus else
        "FIELD FOCUS: (not set). Fall back to the job title + JD to pick the "
        "vocabulary and framing."
    )

    _path_block = {
        "dropout": (
            "CANDIDATE PROFILE: No college degree. They are BUILDING without "
            "a degree and that is a feature, not a bug.\n"
            "RESUME SHAPE CHANGES:\n"
            "- DO NOT include an Education section with a university name. If "
            "  the profile has no university, omit Education entirely and add "
            "  a 'Training & Credentials' section that lists bootcamps, "
            "  online courses, certifications, and self-taught skills.\n"
            "- DO NOT include GPA, graduation year, school location, or honors.\n"
            "- Skills section should be front and center with a dense list of "
            "  tools the candidate has real working experience with.\n"
            "- Projects section is MANDATORY — self-directed work is their "
            "  strongest proof of ability. Lead with one killer project if "
            "  they have one.\n"
            "- Experience bullets should emphasize outcomes and metrics over "
            "  credentials. They earned every skill through doing."
        ),
        "senior_reset": (
            "CANDIDATE PROFILE: Senior professional, 10+ years of experience, "
            "currently between roles.\n"
            "RESUME SHAPE CHANGES:\n"
            "- TWO PAGES OK. Do not cram into one page. Seniors need room to "
            "  show depth.\n"
            "- Lead with Work Experience section, reverse-chronological. Not "
            "  Education. Not Skills. Experience first.\n"
            "- GPA: OMIT. Graduation year: OMIT unless within the last 10 "
            "  years. Age signaling is real and this candidate has enough "
            "  other signals without it.\n"
            "- Every recent role should have 5-7 bullets showing scope, "
            "  scale, and outcomes. Team size led, budget managed, revenue "
            "  delivered, systems built.\n"
            "- Include a LEADERSHIP & IMPACT section if the profile has "
            "  management experience that doesn't fit cleanly under a "
            "  specific role.\n"
            "- Optional sections to include if data supports them: "
            "  Publications, Patents, Board Memberships, Speaking "
            "  Engagements. Credibility markers.\n"
            "- No Projects section unless they're relevant to the target "
            "  role (most seniors don't need one).\n"
            "- Skills section is a dense cluster of tools, methodologies, "
            "  and domain expertise. Not a list of buzzwords."
        ),
        "career_switch": (
            "CANDIDATE PROFILE: Switching careers. Real work experience in "
            "ONE field, pivoting into ANOTHER.\n"
            "RESUME SHAPE CHANGES:\n"
            "- Open with a TRANSFERABLE SKILLS section at the top (under "
            "  contact) that bridges their old field to the new one. Pick "
            "  3-5 cross-applicable strengths with proof bullets.\n"
            "- Work Experience reverse-chronological, but every bullet "
            "  should be rewritten to emphasize what's relevant to the "
            "  target field. Drop context that's irrelevant to where they "
            "  are going.\n"
            "- Projects section if they have any self-initiated work in "
            "  the new field — this is critical proof that the pivot is "
            "  real, not theoretical.\n"
            "- Skills section should front-load new-field tools they've "
            "  picked up, with old-field skills listed only if relevant.\n"
            "- GPA and graduation year: OMIT unless highly relevant."
        ),
        "veteran": (
            "CANDIDATE PROFILE: Military veteran transitioning to civilian work.\n"
            "RESUME SHAPE CHANGES:\n"
            "- TRANSLATE every military term into civilian language. 'Squad "
            "  leader' -> 'managed team of 10.' 'E-5 Sergeant' -> 'mid-level "
            "  leadership role.' 'Operated under combat conditions' -> 'made "
            "  high-stakes decisions under extreme pressure.' Rank names and "
            "  MOS codes should not appear in bullets.\n"
            "- Lead with Experience, reverse-chronological. Include branch "
            "  and years of service as a credibility marker only.\n"
            "- Skills section should emphasize the civilian-translated "
            "  skills: leadership, logistics, project management, budget "
            "  management, technical specialty.\n"
            "- Security clearance: include it prominently (Top Secret, "
            "  Secret, etc.) because it's a huge hiring advantage in many "
            "  sectors.\n"
            "- GI Bill education: include as Education if applicable."
        ),
        "parent_returning": (
            "CANDIDATE PROFILE: Returning to work after a multi-year break "
            "raising children.\n"
            "RESUME SHAPE CHANGES:\n"
            "- Address the gap directly but positively. Include a one-line "
            "  'Family Leadership, YYYY–YYYY' entry in the Experience "
            "  section if they want (user's call — default YES if they "
            "  don't specify). This stops ATSes from thinking the gap is "
            "  unexplained.\n"
            "- Lead with a SUMMARY section (3 lines) that states years of "
            "  prior experience and the role they're targeting. This "
            "  anchors the recruiter before they hit the gap.\n"
            "- Work Experience reverse-chronological. Pre-gap roles stay "
            "  with full detail — those skills haven't expired.\n"
            "- Include recent freelance, volunteer, board, PTA leadership, "
            "  or certifications earned during the break. All real work.\n"
            "- GPA: OMIT (too far back). Graduation year: OPTIONAL.\n"
            "- Skills section should front-load the target field's tools, "
            "  including any they've kept current during the gap."
        ),
        "formerly_incarcerated": (
            "CANDIDATE PROFILE: Returning citizen re-entering the workforce.\n"
            "RESUME SHAPE CHANGES:\n"
            "- DO NOT mention incarceration, conviction, release date, or "
            "  anything that could trigger bias. The resume is to get them "
            "  to the interview; disclosure is for the interview stage.\n"
            "- Dates: use YEAR-ONLY format (2020, not 2020-03-15). Year-"
            "  only dates are standard and don't draw attention to gaps.\n"
            "- Education: include any programs completed inside (GED, "
            "  vocational, certifications, degrees via prison-college) "
            "  WITHOUT the prison context. These are real credentials.\n"
            "- Work experience: include any jobs done during or after "
            "  incarceration (work release, halfway house jobs, post-"
            "  release employment). Frame as normal employment.\n"
            "- Emphasize skills built and certifications earned. Focus on "
            "  what they CAN do, not timeline gaps.\n"
            "- Projects or volunteer work: include. Big signal of initiative."
        ),
        "international_grad": (
            "CANDIDATE PROFILE: International student or recent grad on "
            "F-1 / OPT visa, targeting US employment.\n"
            "RESUME SHAPE CHANGES:\n"
            "- US CONVENTIONS: no photo, one page for early career (two "
            "  if they have 5+ years), reverse-chronological, no marital "
            "  status, no date of birth, no nationality. Many international "
            "  candidates have photo/bio resumes from home — strip those.\n"
            "- Include citizenship/work authorization line only if it helps. "
            "  'Work authorization: F-1 OPT through MM/YYYY, eligible for "
            "  H-1B sponsorship' signals clearly to recruiters who sponsor.\n"
            "- Keep Education section (recent grad) but US format: school "
            "  name, degree, major, graduation month/year.\n"
            "- Skills section is critical — international grads often have "
            "  strong technical skills that their resume buries. Surface "
            "  every tool, language, framework with recent project evidence.\n"
            "- Bullets: quantify aggressively. Numbers translate across "
            "  cultures; soft descriptions don't."
        ),
        "neurodivergent": (
            "CANDIDATE PROFILE: Neurodivergent candidate (ADHD, autism, "
            "dyslexia, etc.).\n"
            "RESUME SHAPE CHANGES:\n"
            "- Lead with a concise SKILLS section: clusters of concrete "
            "  tools and systems. No fluff adjectives. No 'passionate.'\n"
            "- Experience bullets: direct, literal, specific. 'Built X '\n"
            "  'that did Y, measured by Z.' No metaphors, no jargon the "
            "  candidate isn't comfortable defending in an interview.\n"
            "- Emphasize depth and systems thinking. Pattern recognition, "
            "  technical accuracy, attention to detail — these are "
            "  neurodivergent strengths.\n"
            "- Projects section valuable — long-deep-focus work is where "
            "  many neurodivergent candidates shine.\n"
            "- Tone: crisp, factual, zero performative. Every bullet "
            "  should be something the candidate can speak about confidently."
        ),
        "first_gen_college": (
            "CANDIDATE PROFILE: First in their family to attend college.\n"
            "RESUME SHAPE CHANGES:\n"
            "- Treat like a strong student resume with extra emphasis on "
            "  the work-to-pay-tuition angle. Part-time jobs held during "
            "  college belong in the main Experience section, not buried.\n"
            "- Include any scholarships, awards, or first-gen programs "
            "  participated in — these are hard-won markers.\n"
            "- Emphasize WORK experience alongside school projects. Many "
            "  first-gen students have more real work experience than "
            "  traditional peers; it should be front and center.\n"
            "- Skills section prominent.\n"
            "- Standard student resume otherwise (Education near top, "
            "  GPA if strong, one page)."
        ),
        "disabled_professional": (
            "CANDIDATE PROFILE: Professional with a disability.\n"
            "RESUME SHAPE CHANGES:\n"
            "- DO NOT mention the disability on the resume. Disclosure is "
            "  the candidate's choice and belongs later in the process.\n"
            "- Standard resume format matching their experience level.\n"
            "- If they have experience with disability-inclusion work, "
            "  advocacy, or accommodation design, include it as a real "
            "  professional accomplishment (with their consent)."
        ),
        "trades_to_white_collar": (
            "CANDIDATE PROFILE: Skilled trade worker pivoting into an "
            "office, tech, or management role.\n"
            "RESUME SHAPE CHANGES:\n"
            "- TRANSLATE trade work into professional language: 'read "
            "  blueprints' -> 'interpreted technical specifications,' "
            "  'trained apprentices' -> 'onboarded and mentored junior "
            "  team members,' 'maintained safety record' -> 'managed "
            "  compliance in a regulated environment.'\n"
            "- Open with a SUMMARY that names years of hands-on experience "
            "  plus the specific white-collar role being pivoted to.\n"
            "- Work Experience reverse-chronological. Keep trade company "
            "  names; they're real businesses.\n"
            "- Skills section: translated skills (project management, "
            "  customer service, safety compliance, team leadership, "
            "  technical reading) front, trade-specific tools in "
            "  Technical Skills sub-section below.\n"
            "- Certifications section (OSHA, licenses, apprenticeship "
            "  completion) — these are credentials and belong up top.\n"
            "- GPA / school year: OMIT unless they have recent coursework "
            "  relevant to the target role."
        ),
        "lgbtq": (
            "CANDIDATE PROFILE: LGBTQ+ professional. Pronouns and identity "
            "belong only where the candidate chooses to include them.\n"
            "RESUME SHAPE CHANGES:\n"
            "- Standard resume format for their experience level.\n"
            "- Include pronouns next to the name in contact info ONLY if "
            "  the candidate has them on their profile. Don't add them "
            "  otherwise.\n"
            "- If they have LGBTQ+-specific volunteer or advocacy work "
            "  (e.g. queer student union leadership, Out in Tech, Lesbians "
            "  Who Tech), include it as real professional work — inclusion "
            "  work demonstrates leadership and project management."
        ),
        "rural_remote_only": (
            "CANDIDATE PROFILE: Remote-only, can't relocate.\n"
            "RESUME SHAPE CHANGES:\n"
            "- Standard resume format for their experience level.\n"
            "- In the Contact section, state remote availability explicitly: "
            "  'Remote (US-based, [State])' instead of a city. This signals "
            "  to remote-first recruiters immediately and prevents "
            "  disqualification by ATS keyword-matching on city.\n"
            "- If they have prior successful remote work experience, "
            "  surface it in a bullet. 'Delivered [project] while fully "
            "  remote across 3 timezones' is a signal recruiters of "
            "  distributed companies look for."
        ),
        "refugee": (
            "CANDIDATE PROFILE: Refugee or asylum seeker, new to the "
            "US workforce. Prior credentials may not transfer cleanly.\n"
            "RESUME SHAPE CHANGES:\n"
            "- CLEAR, SIMPLE LANGUAGE throughout. No idioms, no fancy "
            "  verbs that trip screen readers or non-native reviewers. "
            "  'Led a team of 8' beats 'spearheaded cross-functional "
            "  task-force operations.'\n"
            "- TRANSLATE prior roles into US-equivalent titles where "
            "  possible: 'Senior Auditor at Ministry of Finance' -> "
            "  'Senior Financial Auditor at a national government agency.'\n"
            "- Include a LANGUAGES section near the top. Multilingualism "
            "  is a real skill many US employers value.\n"
            "- Include any US-based credentialing, ESL programs, or "
            "  community organization work in an Education or Training "
            "  section. Volunteer or resettlement-agency work is real "
            "  experience.\n"
            "- Work authorization line in Contact: 'Authorized to work in "
            "  the US' if true, OR omit entirely and handle later in the "
            "  process — do NOT name visa class explicitly unless the "
            "  candidate wants that."
        ),
        "ex_founder": (
            "CANDIDATE PROFILE: Former founder, freelancer, or "
            "solopreneur returning to employment. Real business-operator "
            "experience that looks like a gap on a W-2-centric resume.\n"
            "RESUME SHAPE CHANGES:\n"
            "- Open with a SUMMARY line naming them as 'Operator with "
            "  [N] years running [company/practice name]' plus the target "
            "  role.\n"
            "- Work Experience: 'Founder & CEO, [Company], [dates]' or "
            "  'Principal, [Freelance Practice], [dates].' Real title, "
            "  real company. Bullets should focus on OUTCOMES: revenue, "
            "  team size, products shipped, customers served.\n"
            "- Include 'Investors / advisors' line only if relevant and "
            "  impressive.\n"
            "- Skills section: lean into operator skills (P&L ownership, "
            "  product strategy, fundraising, hiring, customer success) "
            "  translated for the target role.\n"
            "- DO NOT explain why they're coming back to employment on "
            "  the resume. That's an interview story, not a bullet.\n"
            "- GPA / graduation year: OMIT unless recent and relevant."
        ),
        "exploring": (
            "CANDIDATE PROFILE: Exploring, figuring out direction. Still "
            "building signal.\n"
            "Use standard template conventions. Include what they have, "
            "present it honestly, skip anything speculative."
        ),
    }.get(_user_path, (
        "CANDIDATE PROFILE: Student / early career. Use standard student "
        "resume conventions: Education section near the top with GPA "
        "(if ≥3.5), one page, Projects required, Skills prominent."
    ))

    system_prompt = f"""You are Dilly's resume generation AI. Your single job is to turn a student's verified profile into a tailored resume that (a) is 100% true to the profile and (b) passes the target company's ATS.

{_path_block}

{_field_tailor_block}

TARGET JOB:
  Title: {job_title}
  Company: {job_company}
  Cohort/Template: {cohort}{finance_note}

JOB DESCRIPTION:
{job_description[:4000] if job_description else "(Not provided — tailor based on job title and company reputation.)"}

STUDENT'S DILLY PROFILE (pre-ranked for relevance to this JD):
{profile_facts_text or "(No profile facts available — use base resume only)"}

STUDENT'S CURRENT RESUME (structured JSON):
{base_resume_json}

═══════════════════════════════════════════════════════════════════════
CORE DOCTRINE — VIOLATING ANY OF THESE IS A FAILURE:

1. NEVER INVENT. Every fact, metric, tool, title, date, GPA, company,
   school, project, and bullet must trace back to something in the profile
   or base resume above. If the JD asks for something the profile lacks,
   either bridge (see rule 3) or leave it out. NEVER write a bullet that
   claims experience the user does not have.

2. BULLET = EVIDENCE + OUTCOME. Every bullet starts with a past-tense
   action verb, describes something the user actually did (from the
   profile or base resume), and quantifies the result where possible.
   If the profile says "built a sentiment model that processed 10K
   tweets", the bullet can say exactly that. It can't say "built a
   production-grade model serving 1M requests/day" unless that number
   is in the profile.

3. KEYWORD BRIDGING (this is how Dilly wins ATS filters without lying).
   When the JD wants X and the profile has Y that's adjacent to X, use
   bridge language that is literally true AND earns keyword credit:

     JD asks "Kubernetes", profile has "Docker" →
       BAD:   "Deployed services with Kubernetes."
       GOOD:  "Built containerized services using Docker (container
               orchestration)."

     JD asks "PyTorch", profile has "TensorFlow" →
       BAD:   "Trained deep learning models with PyTorch."
       GOOD:  "Trained deep learning models with TensorFlow (deep
               learning framework)."

     JD asks "AWS", profile has "GCP" →
       BAD:   "Deployed on AWS."
       GOOD:  "Deployed on Google Cloud (cloud infrastructure)."

   The adjacent concept can appear in parentheses, or woven in as a
   general category ("cloud infrastructure", "container orchestration",
   "deep learning framework"). The *real* tool is what the user did;
   the parenthetical is the ATS-visible concept match.

4. WEAVE JD KEYWORDS FROM THE PROFILE. Scan the profile for any
   technology, method, or domain term that matches the JD literally
   and surface it (in the Skills section AND inside a relevant bullet).
   A keyword in BOTH places parses much stronger.

5. REORDER. Put the most JD-relevant experience first within each
   section. Cut experiences that are entirely irrelevant if doing so
   keeps the resume to one page.

6. YOU MAY promote "Unlisted Skills" and "Additional Projects" from the
   Dilly Profile onto the resume if relevant. They're in the profile,
   so they're true. That's what the profile is for.

7. PRESERVE SCHEMA. Same keys, same section types, same JSON shape as
   the input. The downstream PDF generator depends on it.

8. NEVER USE EM DASHES. Do not use any em-dash glyph. Use commas, periods,
   or plain hyphens only. Apparently trivial but it's a Dilly brand rule:
   em dashes are a tell of AI-generated writing and the resume must not
   look AI-written. This applies to every string in the output.

═══════════════════════════════════════════════════════════════════════
ATS FORMATTING (specific to this company's parser):

{_get_ats_formatting(job_ats)}

═══════════════════════════════════════════════════════════════════════

Return ONLY valid JSON — a JSON array of resume section objects matching this exact schema:
[
  {{"key": "contact", "label": "Contact", "contact": {{"name": "", "email": "", "phone": "", "location": "", "linkedin": ""}}}},
  {{"key": "summary", "label": "Summary", "simple": {{"id": "", "lines": ["<2-3 sentence professional summary — include only when the user's path requires it>"]}}}} ,
  {{"key": "education", "label": "Education", "education": {{"id": "", "university": "", "major": "", "minor": "", "graduation": "", "location": "", "honors": "", "gpa": ""}}}},
  {{"key": "professional_experience", "label": "Experience", "experiences": [{{"id": "", "company": "", "role": "", "date": "", "location": "", "bullets": [{{"id": "", "text": ""}}]}}]}},
  {{"key": "projects", "label": "Projects", "projects": [{{"id": "", "name": "", "date": "", "location": "", "tech": "", "bullets": [{{"id": "", "text": ""}}]}}]}},
  {{"key": "skills", "label": "Skills", "simple": {{"id": "", "lines": ["<category>: skill1, skill2, skill3"]}}}},
  {{"key": "certifications", "label": "Certifications", "simple": {{"id": "", "lines": ["Cert Name, Issuer, Year"]}}}}
]

SKILLS SECTION FORMAT — critical for ATS parsing:
- Each line is one category cluster: "Languages: Python, SQL, R" or "Frameworks: React, FastAPI, Django"
- Individual skills comma-separated within a line — never written as a prose sentence
- Use short noun phrases only ("Data Visualization", not "I am experienced in data visualization")
- Every JD keyword the candidate legitimately has must appear as its own entry, verbatim

Include only sections that have content. Omit summary unless the candidate's path specifically requires one. Do not include markdown, explanations, or any text outside the JSON array."""

    # Add gaps instruction if applicable
    if readiness == 'gaps':
        system_prompt += f"\n\nNOTE: The candidate has gaps for this role: {gaps_detail}. Generate the best resume possible from what they have, but in a separate 'gaps' field, list what's missing."

    # ------------------------------------------------------------------
    # Non-streaming generation with ATS/gaps metadata wrapper
    # ------------------------------------------------------------------
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": f"Generate a tailored resume for {job_title} at {job_company}. Return only the JSON array."}],
        )
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response(email, FEATURES.RESUME_GENERATE, response,
                                        metadata={"ats": job_ats, "company": job_company})
        except Exception:
            pass
        raw = response.content[0].text
        # Parse the JSON array
        j_start = raw.find('[')
        j_end = raw.rfind(']') + 1
        if j_start == -1:
            raise ValueError("No JSON array in response")
        sections = json.loads(raw[j_start:j_end])
        # Post-gen em-dash strip — brand rule, applied defensively even
        # if the model forgot.
        def _strip_em(v):
            if isinstance(v, str):
                return v.replace("\u2014", ", ").replace("\u2013", "-")
            if isinstance(v, list):
                return [_strip_em(x) for x in v]
            if isinstance(v, dict):
                return {k: _strip_em(val) for k, val in v.items()}
            return v
        sections = _strip_em(sections)
    except HTTPException:
        raise
    except Exception as e:
        import traceback as _tb
        _tb.print_exc()
        raise HTTPException(
            status_code=502,
            detail=f"Resume generation failed: {type(e).__name__}: {str(e)[:200]}",
        )

    # Count matched keywords
    jd_lower = job_description.lower()
    keyword_matches = 0
    for section in sections:
        for exp in (section.get('experiences') or []) + (section.get('projects') or []):
            for bullet in (exp.get('bullets') or []):
                text = (bullet.get('text') or bullet if isinstance(bullet, str) else '').lower()
                # Simple keyword check
                for word in jd_lower.split():
                    if len(word) > 4 and word in text:
                        keyword_matches += 1
                        break

    # ── Post-generation verification ─────────────────────────────────────
    # Two checks:
    #   a) ATS PDF compatibility: build the PDF, extract text back out,
    #      confirm section headers + content survived.
    #   b) Keyword coverage: does the resume actually address the JD's
    #      demand keywords? If coverage < 50%, return a warning so the
    #      mobile UI can show "you may get filtered out" and suggest
    #      the user tell Dilly more about the missing skills.
    ats_parse_score = 0
    ats_parse_issues: list[str] = []
    keyword_coverage_pct = 0
    keyword_warning: str | None = None
    missing_keywords: list[str] = []
    try:
        from projects.dilly.api.ats_resume_builder import (
            build_ats_pdf, verify_ats_compatibility,
        )
        from projects.dilly.api.resume_keyword_check import check_keyword_coverage
        # Build the real text-layer PDF
        pdf_bytes = await asyncio.to_thread(build_ats_pdf, sections, job_ats)
        # Verify it survived rendering
        verify = await asyncio.to_thread(verify_ats_compatibility, pdf_bytes, sections)
        ats_parse_score = int(verify.get("score") or 0)
        ats_parse_issues = list(verify.get("issues") or [])
        # Check JD keyword coverage (keyword bridging is counted)
        cov = check_keyword_coverage(sections, job_description or "")
        keyword_coverage_pct = int(cov.get("coverage_pct") or 0)
        missing_keywords = list(cov.get("missing_keywords") or [])
        keyword_warning = cov.get("warning")

        # ── Keyword injection pass ─────────────────────────────────────
        # If first-pass coverage is below 75% and there are ≥2 missing
        # keywords, do a cheap targeted second pass: ask Haiku to bridge
        # gaps using only evidence already in the resume (no invention).
        # We only accept the result if coverage actually improves.
        if keyword_coverage_pct < 75 and len(missing_keywords) >= 2 and job_description:
            try:
                _inject_prompt = (
                    f"The resume has {keyword_coverage_pct}% keyword coverage for this JD.\n"
                    f"Missing JD keywords: {', '.join(missing_keywords[:8])}.\n\n"
                    "Without inventing any experience:\n"
                    "1. Where a missing keyword is adjacent to something already in the resume, "
                    "add it with bridge language (e.g. 'Docker (container orchestration)').\n"
                    "2. If the candidate clearly has a skill (visible in their bullets/role) "
                    "but the Skills section omits it, add it to Skills.\n"
                    "3. Never add a keyword the resume gives zero evidence for.\n"
                    "Return the complete updated JSON array, same schema as input.\n\n"
                    f"Current resume JSON:\n{json.dumps(sections)}\n\n"
                    f"Job description:\n{job_description[:2000]}"
                )
                _inject_res = client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=4096,
                    system=(
                        "You are a resume keyword optimizer. Follow the instructions exactly. "
                        "Return ONLY a valid JSON array, no explanation."
                    ),
                    messages=[{"role": "user", "content": _inject_prompt}],
                )
                try:
                    from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
                    log_from_anthropic_response(
                        email, FEATURES.RESUME_KW_CHECK, _inject_res,
                        metadata={"pass": "keyword_injection"},
                    )
                except Exception:
                    pass
                _ir = _inject_res.content[0].text
                _ijs = _ir.find('[')
                _ije = _ir.rfind(']') + 1
                if _ijs >= 0:
                    _inject_sections = json.loads(_ir[_ijs:_ije])
                    _inject_sections = _strip_em(_inject_sections)
                    _inject_cov = check_keyword_coverage(_inject_sections, job_description)
                    # Accept only if coverage improved (never downgrade)
                    if _inject_cov.get("coverage_pct", 0) >= keyword_coverage_pct:
                        sections = _inject_sections
                        keyword_coverage_pct = int(_inject_cov.get("coverage_pct") or 0)
                        missing_keywords = list(_inject_cov.get("missing_keywords") or [])
                        keyword_warning = _inject_cov.get("warning")
                        # Re-verify PDF with the upgraded sections
                        pdf_bytes = await asyncio.to_thread(build_ats_pdf, sections, job_ats)
                        _v2 = await asyncio.to_thread(verify_ats_compatibility, pdf_bytes, sections)
                        ats_parse_score = int(_v2.get("score") or 0)
                        ats_parse_issues = list(_v2.get("issues") or [])
            except Exception:
                pass  # Never block on injection failure; original sections stand
    except Exception as _e:
        # Never block the response on a verification failure.
        import traceback as _tb
        _tb.print_exc()

    # Charge one tailored resume against the user's monthly cap (only on success)
    new_resume_count = _increment_resume_count(email)
    resume_remaining = -1 if _resume_limit < 0 else max(0, _resume_limit - new_resume_count)

    return {
        "sections": sections,
        "ats": job_ats,
        "ats_formatted": True,
        "ats_label": f"Formatted for {job_ats.title()}",
        "readiness": readiness,
        "gaps": json.loads(gaps_detail) if gaps_detail else [],
        "keyword_note": f"Optimized for {job_ats.title()} ATS",
        # Post-gen verification fields for the mobile UI
        "ats_parse_score": ats_parse_score,
        "ats_parse_issues": ats_parse_issues,
        "keyword_coverage_pct": keyword_coverage_pct,
        "missing_keywords": missing_keywords,
        "keyword_warning": keyword_warning,
        # Tell the mobile how many facts Dilly actually used for this resume,
        # so the UI can show "built from 47 of your 312 profile facts"
        "facts_used": len(selected_facts) if selected_facts else 0,
        "plan": _resume_plan,
        "resumes_used": new_resume_count,
        "resumes_remaining": resume_remaining,
    }


def _get_ats_formatting(ats: str) -> str:
    """Return ATS-specific formatting instructions for the resume generator.

    Rules are grounded in each vendor's documented parser behavior (Sovren,
    Textkernel, HireAbility, Daxtra, and each ATS's own) plus observed
    real-world parsing failures. The layer that actually enforces most of
    this is projects/dilly/api/ats_resume_builder.py (ReportLab single-
    column, text-layer PDF). These content-level rules are the belt to that
    engine's suspenders.

    Every rule set follows the same structure:
      - Primary parser in use
      - Section headers that parse as section breaks
      - Date format that parses without ambiguity
      - Bullet character parser-safe glyphs
      - Keyword strategy
      - What to AVOID (specific to this vendor)
    """
    # Shared baseline that applies to every modern parser. Content-level
    # rules only — the PDF builder guarantees single-column, text-layer,
    # no tables/images/columns regardless of what the model says.
    BASELINE = (
        "- Section headers from: Education, Experience, Work Experience, "
        "Projects, Skills, Leadership, Research Experience, Certifications, "
        "Honors & Awards, Publications, Relevant Coursework.\n"
        "- Dates: 'Mon YYYY' (e.g. 'Aug 2024') or 'MM/YYYY'. Use 'Present' for ongoing.\n"
        "- Bullets: start every bullet with a strong past-tense action verb, "
        "then quantified outcome. Do NOT use unicode decorative bullet glyphs "
        "— the PDF builder renders clean '-' bullets.\n"
        "- Phone: (XXX) XXX-XXXX. Email: plain text only, never hyperlinked text "
        "that differs from the URL.\n"
        "- No emojis, no icons, no graphics. No colored text. Plain encoded glyphs.\n"
        "- Every skill named as a noun phrase ('Python', 'Data Visualization'), "
        "not sentence fragments."
    )

    rules = {
        # ── Greenhouse (Sovren parser) ────────────────────────────────
        # Greenhouse uses Sovren's parser. Sovren is keyword-tolerant and
        # handles most resume layouts well. Strongest on clean PDFs with
        # explicit section headers. Tolerates mixed date formats.
        'greenhouse': (
            "ATS: Greenhouse (Sovren parser).\n"
            + BASELINE + "\n"
            "- KEYWORD STRATEGY: Sovren weights Skills section + experience "
            "bullets equally. Repeat every JD keyword in at least two places "
            "(Skills list AND inside a bullet) to maximize match score.\n"
            "- AVOID: ALL CAPS section headers that include special chars "
            "(e.g. '★ EXPERIENCE ★' — Sovren drops these)."
        ),

        # ── Lever (Lever's own parser) ───────────────────────────────
        # Lever uses its own internal parser. Handles standard formats
        # cleanly. Quite forgiving. Pays attention to job title strings
        # and company names — those must be in a predictable shape.
        'lever': (
            "ATS: Lever (proprietary parser).\n"
            + BASELINE + "\n"
            "- Format each experience entry as: 'Company Name - Role Title' "
            "on one line. Lever's parser looks for this hyphen-separated pattern.\n"
            "- KEYWORD STRATEGY: Lever favors bullet-level keyword match over "
            "Skills list stuffing. Put the most important JD keywords inside "
            "the bullets for your most recent role."
        ),

        # ── Ashby (modern startup ATS) ───────────────────────────────
        # Ashby uses a modern parser (primarily HireAbility/Textkernel hybrid)
        # and is the most tolerant of the bunch. Stylistic variation is fine;
        # what matters is content.
        'ashby': (
            "ATS: Ashby (modern parser, high tolerance).\n"
            + BASELINE + "\n"
            "- Ashby extracts well from any clean single-column layout.\n"
            "- KEYWORD STRATEGY: Ashby candidate-ranking models compare JD to "
            "resume semantically, so bridge language is valuable. If the JD "
            "asks for Kubernetes and you have Docker, write 'container "
            "orchestration with Docker' — it matches conceptually."
        ),

        # ── SmartRecruiters (Textkernel parser) ──────────────────────
        # SmartRecruiters uses Textkernel. Very strong parser but strict
        # about date ranges — malformed dates can drop an entire role.
        'smartrecruiters': (
            "ATS: SmartRecruiters (Textkernel parser).\n"
            + BASELINE + "\n"
            "- Textkernel is strict about date ranges. Use 'Aug 2024 – May 2025' "
            "(en-dash or plain hyphen, space-separated). A role without "
            "parseable dates is dropped entirely.\n"
            "- Company and role MUST be on the same line separated by comma, "
            "pipe, or em-dash.\n"
            "- KEYWORD STRATEGY: Textkernel normalizes skill aliases (SQL = "
            "Structured Query Language, JS = JavaScript). Use the most common "
            "form of each skill."
        ),

        # ── Workday (Workday Resume Parser) ──────────────────────────
        # The hardest target. Workday's parser is notoriously brittle with
        # anything non-trivial. Rules below come from observed parse failures.
        'workday': (
            "ATS: Workday (native parser — STRICT).\n"
            + BASELINE + "\n"
            "- Section headers must be EXACTLY: 'Education', 'Work Experience', "
            "'Skills', 'Projects'. Not 'Professional Experience', not 'Employment'.\n"
            "- DATES: MM/YYYY format only. 'August 2024' parses as plain text, "
            "not a date. Write '08/2024 - 05/2025'.\n"
            "- Workday auto-fills application fields from the parsed resume. "
            "If your company/role/date line is unclear, the user will have to "
            "re-enter everything manually. Format:\n"
            "    Company Name\n"
            "    Role Title | MM/YYYY - MM/YYYY | City, ST\n"
            "- Use a plain '-' for bullets. Workday mangles any other glyph.\n"
            "- AVOID: role on the same line as company, multiple dates per role, "
            "parenthetical notes after a date."
        ),

        # ── Taleo / Oracle Recruiting Cloud (legacy) ─────────────────
        # Taleo is ancient but still widely used at large enterprises.
        # Treat as plain-text parser. Any PDF styling is a liability.
        'taleo': (
            "ATS: Taleo / Oracle Recruiting Cloud (legacy, text-first parser).\n"
            + BASELINE + "\n"
            "- Treat as if the parser is reading plain text. No typography, "
            "no font variations, no headers larger than body.\n"
            "- Dates: 'MM/YYYY' or 'YYYY' only.\n"
            "- Every section header on its own line, uppercase, plain (e.g. EDUCATION).\n"
            "- KEYWORD STRATEGY: Taleo is keyword-count dominant. Put a dense "
            "comma-separated Skills section near the top with every tool/"
            "language/framework from the JD that the candidate legitimately has.\n"
            "- AVOID: tables, columns, special Unicode, hyperlinks styled as "
            "colored text."
        ),

        # ── iCIMS (native parser with Sovren fallback) ───────────────
        'icims': (
            "ATS: iCIMS (native parser).\n"
            + BASELINE + "\n"
            "- iCIMS is strict about section headers. Use 'Experience' (not "
            "'Professional Experience'), 'Education', 'Skills', 'Projects'.\n"
            "- KEYWORD STRATEGY: iCIMS scoring heavily weights the Skills "
            "section. Make it exhaustive with every JD keyword the candidate "
            "truly has.\n"
            "- AVOID: multi-line role headers. Keep company/role/date on one "
            "or two lines max."
        ),

        # ── Jobvite (Sovren parser) ──────────────────────────────────
        'jobvite': (
            "ATS: Jobvite (Sovren parser).\n"
            + BASELINE + "\n"
            "- Same parser as Greenhouse. Follow Greenhouse rules.\n"
            "- KEYWORD STRATEGY: JD keywords in Skills + in bullets."
        ),

        # ── BambooHR (native, lenient) ───────────────────────────────
        'bamboohr': (
            "ATS: BambooHR (native parser, high tolerance).\n"
            + BASELINE + "\n"
            "- Lenient parser, mostly used at small companies.\n"
            "- KEYWORD STRATEGY: Humans often review alongside the parser. "
            "Write for readability first, keyword density second."
        ),

        # ── USAJobs (federal, unique format) ─────────────────────────
        # Federal resumes are a different beast. Much longer, detailed
        # responsibilities, GS-grade anchoring.
        'usajobs': (
            "ATS: USAJobs (federal application system).\n"
            "- Federal resume format: longer than private-sector (2–5 pages OK).\n"
            "- Include for every role: dates (MM/YYYY), hours/week, supervisor "
            "name + phone, may-contact permission, and GS-grade equivalent.\n"
            "- Section headers: Work Experience, Education, Training, "
            "Certifications, Awards.\n"
            "- KEYWORD STRATEGY: Mirror the announcement's 'Specialized "
            "Experience' language verbatim — federal HR reviewers search for "
            "exact phrases.\n"
            "- AVOID: brevity. Federal HR grades on demonstrated experience "
            "against the announcement. Over-include, do not under-include."
        ),

        # ── NSF REU (academic, human review) ─────────────────────────
        'nsf_reu': (
            "ATS: NSF REU application (academic, human-reviewed).\n"
            + BASELINE + "\n"
            "- Human faculty reviewer. Parser is secondary.\n"
            "- Emphasize: Research Experience, Relevant Coursework, technical "
            "skills, publications if any.\n"
            "- Include a Research Interests line near the top if the user "
            "has articulated them."
        ),

        # ── Workable (mid-market standard parser) ───────────────────
        # Workable uses a native HireAbility-based parser. Well-behaved
        # on clean single-column PDFs. Known quirks: the parser pulls
        # the top 3-4 lines as the "header" for auto-fill; anything odd
        # up top leaks into the name/contact fields.
        'workable': (
            "ATS: Workable (HireAbility-based parser).\n"
            + BASELINE + "\n"
            "- First 3-4 lines MUST be: full name, phone, email, city/state. "
            "Nothing else up top — no quote, no tagline, no objective. The "
            "parser auto-fills application fields from those top lines.\n"
            "- Section headers from the standard set: Experience, Education, "
            "Skills, Projects. 'Professional Experience' parses; 'Career "
            "History' often doesn't.\n"
            "- DATES: 'Mon YYYY' or 'MM/YYYY'. Hyphen- or en-dash-separated "
            "range. Workable tolerates both.\n"
            "- KEYWORD STRATEGY: Workable's candidate-rank model scores the "
            "Skills section and bullet text about equally. Mirror the JD's "
            "required-skills list in your Skills block with the exact "
            "spellings, then weave the top 5 into your most-recent-role "
            "bullets.\n"
            "- AVOID: multi-column layouts, tables of skills (parses as a "
            "single paragraph), or decorative dividers between sections."
        ),

        # ── SAP SuccessFactors (enterprise, native parser) ───────────
        # SuccessFactors is on the hiring-manager list and is surprisingly
        # strict. Used at most F500 enterprises (Nestle, Unilever, GSK).
        'successfactors': (
            "ATS: SAP SuccessFactors (native parser, strict).\n"
            + BASELINE + "\n"
            "- Section headers EXACTLY: 'Experience', 'Education', 'Skills', "
            "'Certifications'. SF's parser is known to drop sections with "
            "non-standard names.\n"
            "- DATES: MM/YYYY format, hyphen-separated. 'Present' is "
            "allowed; 'Current' is not. Every role MUST have a start AND "
            "end date or the role is dropped.\n"
            "- KEYWORD STRATEGY: SF's recruiter-side search is keyword-"
            "count dominant on the Skills section. Put a comma-separated "
            "Skills list with every JD keyword the candidate legitimately has.\n"
            "- AVOID: bolded company names (confuses the section-header "
            "detector), role titles on the same line as dates."
        ),

        # ── Ashby alias for a few small startups ──────────────────────
        'ashbyhq': (
            "ATS: Ashby (modern parser, high tolerance).\n"
            + BASELINE + "\n"
            "- Ashby extracts well from any clean single-column layout.\n"
            "- KEYWORD STRATEGY: semantic matching — bridge language works."
        ),
    }
    # Default to Greenhouse rules — safe because ~94% of Dilly's jobs are
    # on Greenhouse-parsed systems (Greenhouse + Jobvite use Sovren).
    return rules.get((ats or '').lower().strip(), rules['greenhouse'])


def _get_cohort_tip(cohort: str) -> str:
    tips = {
        "Tech": "left-aligned, Skills near top, GitHub link, no summary, Projects section required",
        "Business": "centered header, Education first, GPA always shown, Leadership section, formal serif style",
        "Social Science": "left-aligned, Leadership & Extracurriculars required, every bullet needs a metric",
        "Science": "Research Experience is main section, list lab techniques explicitly as ATS keywords",
        "Health": "Certifications near top, Clinical Experience section, GPA optional",
        "Humanities": "Portfolio link critical, highlight published/bylined work",
        "Sport": "SafeSport certification bolded if applicable, game-day roles included",
        "Quantitative": "quantify everything, highlight analytical tools and methods",
    }
    return tips.get(cohort, "professional, concise, metric-driven bullets")


# ---------------------------------------------------------------------------
# Resume tailor-diff — generate + structured before/after diff
# ---------------------------------------------------------------------------
#
# Builds on /resume/generate but returns a structured diff instead of raw JSON.
# The mobile editor renders the diff in a full-screen modal so the user can
# accept/reject bullet rewrites one at a time or all at once.
#
# Response shape:
#   {
#     tailored_sections: [...],            # full generated resume JSON
#     base_sections: [...],                # unchanged input for reference
#     experience_diffs: [                  # one entry per experience, aligned
#       {
#         kind: 'added' | 'removed' | 'modified' | 'unchanged',
#         base:   { company, role, date, bullets: [{text}] } | null,
#         tailored: { company, role, date, bullets: [{text}] } | null,
#         bullet_diffs: [
#           { kind, base_text, tailored_text, changed_words: [] }
#         ],
#         reorder_rank: int | null,        # new position in tailored (for 'modified')
#       }
#     ],
#     skills_diff: {
#       added: ['string'],
#       removed: ['string'],
#       kept: ['string'],
#     },
#     headline_summary: 'string',          # 1-sentence Claude-written summary
#     cohort: 'string',
#   }

class TailorDiffRequest(BaseModel):
    job_title: str
    job_company: str
    job_description: Optional[str] = ""
    cohort: Optional[str] = None
    base_variant_id: Optional[str] = None


@router.post("/resume/tailor-diff")
async def resume_tailor_diff(request: Request, body: TailorDiffRequest):
    """
    AI-generate a tailored resume and return a structured diff against the base.
    Blocking (not streaming) so the mobile client can render the full diff view
    once the generation completes.

    Reuses the existing /resume/generate system prompt and Dilly Profile
    ingestion. On top of that, it:
      1. Collects the full streamed response into a JSON object
      2. Diffs each experience entry against the base
      3. Diffs bullets within aligned experiences
      4. Diffs skills as add/remove/kept sets
      5. Asks Claude for a one-sentence summary of the biggest changes
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    job_title = (body.job_title or "").strip()
    job_company = (body.job_company or "").strip()
    job_description = (body.job_description or "").strip()
    if not job_title or not job_company:
        raise errors.validation_error("job_title and job_company are required.")

    cohort = body.cohort or _detect_cohort_from_job(job_title, job_company)

    # ── Load base resume (variant or primary) ──────────────────────────
    base_sections: List[dict] = []
    if body.base_variant_id:
        content = await asyncio.to_thread(_load_variant_content, email, body.base_variant_id)
        if content:
            base_sections = content.get("sections") or []
    if not base_sections:
        existing = await asyncio.to_thread(_load_resume, email)
        if existing:
            base_sections = existing.get("sections") or []

    if not base_sections:
        raise errors.validation_error(
            "No base resume found. Run an audit or save a resume in the editor first."
        )

    # ── Load Dilly Profile facts for context ──────────────────────────
    profile_facts_text = ""
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = await asyncio.to_thread(get_memory_surface, email)
        facts = surface.get("items") or []
        narrative = (surface.get("narrative") or "").strip()
        if facts:
            lines = []
            grouped: dict[str, list] = {}
            for f in facts:
                cat = f.get("category", "other")
                grouped.setdefault(cat, []).append(f)
            for cat, items in grouped.items():
                label = cat.replace("_", " ").title()
                entries = "; ".join(f"{i['label']}: {i['value']}" for i in items[:5])
                lines.append(f"  {label}: {entries}")
            profile_facts_text = "\n".join(lines)
            if narrative:
                profile_facts_text = f"NARRATIVE: {narrative}\n\nFACTS:\n{profile_facts_text}"
    except Exception:
        pass

    base_resume_json = json.dumps(base_sections, separators=(",", ":"))
    if len(base_resume_json) > 12000:
        base_resume_json = base_resume_json[:12000] + "..."

    company_l = job_company.lower()
    is_finance_company = any(kw in company_l for kw in _COMPANY_FINANCE_KEYWORDS)
    finance_note = ""
    if cohort == "Tech" and is_finance_company:
        finance_note = f"\nNOTE: {job_company} is a finance/banking firm. Even though this is a tech role, include GPA if ≥3.5, formalize the tone, and highlight finance-domain signals."

    system_prompt = f"""You are Dilly's resume tailoring AI. Rewrite the student's resume for a SPECIFIC job in structured JSON format.

TARGET JOB:
  Title: {job_title}
  Company: {job_company}
  Cohort/Template: {cohort}{finance_note}

JOB DESCRIPTION:
{job_description[:4000] if job_description else "(Not provided — tailor based on job title and company reputation.)"}

STUDENT'S DILLY PROFILE:
{profile_facts_text or "(No profile facts available — use base resume only)"}

STUDENT'S CURRENT RESUME (structured JSON):
{base_resume_json}

INSTRUCTIONS:
1. Tailor the resume specifically for this job at {job_company}.
2. Match keywords from the job description into bullets WHERE TRUTHFUL — do not invent experience.
3. Reorder experiences and bullets to put the most relevant ones first.
4. You MAY incorporate unlisted skills and extra projects from the Dilly Profile if they fit the job.
5. Every bullet must start with a strong action verb, ideally include a metric.
6. Preserve the exact JSON structure of the input sections. Keep the same company names, dates, and degrees — do not fabricate.
7. Use the {cohort} template conventions: {_get_cohort_tip(cohort)}
8. Keep the resume to one page worth of content.

Return ONLY a valid JSON object with EXACTLY this shape:
{{
  "headline": "one sentence summarizing the biggest changes you made",
  "sections": [<array of tailored resume section objects matching the input schema>]
}}
No markdown, no explanations, no prose outside the JSON."""

    # ── Call Claude (blocking collect) ─────────────────────────────────
    full_text = ""
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        async with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": f"Tailor the resume for {job_title} at {job_company}. Return only the JSON object.",
            }],
        ) as stream:
            async for text in stream.text_stream:
                full_text += text
    except Exception as e:
        import sys, traceback
        sys.stderr.write(f"[tailor_diff_failed] {type(e).__name__}: {str(e)[:200]}\n")
        try: traceback.print_exc(file=sys.stderr)
        except Exception: pass
        raise errors.internal(f"Tailoring failed: {type(e).__name__}")

    # ── Parse the generated JSON ───────────────────────────────────────
    tailored_sections: List[dict] = []
    headline = ""
    try:
        # Claude sometimes wraps in ``` fences; strip them
        cleaned = full_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```", 2)[1] if "```" in cleaned[3:] else cleaned[3:]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            headline = str(parsed.get("headline") or "").strip()
            raw_sections = parsed.get("sections")
            if isinstance(raw_sections, list):
                tailored_sections = raw_sections
        elif isinstance(parsed, list):
            # Older prompt shape — just an array of sections
            tailored_sections = parsed
    except Exception:
        raise errors.internal("Could not parse AI response — please try again.")

    if not tailored_sections:
        raise errors.internal("AI returned no sections.")

    # ── Build diffs ────────────────────────────────────────────────────
    experience_diffs = _diff_experiences(base_sections, tailored_sections)
    skills_diff = _diff_skills(base_sections, tailored_sections)

    return {
        "headline_summary": headline,
        "tailored_sections": tailored_sections,
        "base_sections": base_sections,
        "experience_diffs": experience_diffs,
        "skills_diff": skills_diff,
        "cohort": cohort,
        "job_title": job_title,
        "job_company": job_company,
    }


# ── Build 73: JD Quick Tailor ─────────────────────────────────────────────
#
# One endpoint that accepts a pasted job description and does everything
# the student needs in a single round-trip:
#   1. Extract job_title + job_company from the JD (so they don't have to
#      fill in three form fields).
#   2. Extract structured requirements (must-haves + nice-to-haves) that
#      the UI will render as a checklist.
#   3. Run the full tailor-diff pipeline (reuses the existing system
#      prompt via a direct call so no code duplication).
#   4. Run the deterministic keyword_density analyzer twice — once on
#      the base resume, once on the tailored — and return before/after
#      keyword coverage so the user sees real deltas, not vibes.
#   5. Compute a simple ATS v2 delta on parsed resume text so the headline
#      number matches what the coaching dashboard shows.
#   6. Return a synthesized "auto_skills_to_add" list — skills the JD
#      lists that aren't in the current resume, so the mobile UI can
#      offer a one-tap "add these to Skills" button.

class JDQuickTailorRequest(BaseModel):
    job_description: str
    base_variant_id: Optional[str] = None


# ── Weak → strong verb table for deterministic bullet strengthening ──────
_WEAK_VERB_REPLACEMENTS: Dict[str, str] = {
    "did":           "Executed",
    "made":          "Built",
    "worked on":     "Engineered",
    "worked with":   "Collaborated with",
    "helped":        "Drove",
    "helped with":   "Contributed to",
    "helped to":     "Partnered to",
    "assisted":      "Supported",
    "assisted with": "Advanced",
    "was responsible for": "Owned",
    "responsible for":     "Owned",
    "handled":       "Managed",
    "took care of":  "Operated",
    "participated in": "Led",
    "involved in":   "Drove",
    "part of":       "Contributed to",
    "tried to":      "Drove to",
    "attempted to":  "Initiated",
    "got":           "Secured",
    "gave":          "Delivered",
    "started":       "Launched",
    "put together":  "Architected",
    "set up":        "Deployed",
    "used":          "Leveraged",
    "utilized":      "Leveraged",
    "improved":      "Improved",  # keep
    "created":       "Built",
    "developed":     "Developed",  # keep
    "wrote":         "Authored",
    "talked to":     "Partnered with",
    "dealt with":    "Resolved",
    "looked at":     "Analyzed",
    "figured out":   "Diagnosed",
}

_STRONG_VERBS: set = {
    "Architected","Authored","Automated","Built","Collaborated","Configured",
    "Crafted","Delivered","Deployed","Designed","Developed","Directed","Drove",
    "Engineered","Established","Executed","Founded","Implemented","Improved",
    "Launched","Led","Managed","Operated","Optimized","Orchestrated","Owned",
    "Partnered","Pioneered","Produced","Programmed","Researched","Scaled",
    "Secured","Shipped","Spearheaded","Streamlined","Supported","Transformed",
}


def _strengthen_bullet(text: str) -> str:
    """Deterministic bullet polish. Replaces weak verbs + filler phrases
    without inventing new facts. Idempotent."""
    if not text or not text.strip():
        return text
    s = text.strip()
    # Strip a leading bullet glyph if the user pasted one in
    if s and s[0] in "-•◦*–—":
        s = s[1:].lstrip()

    lower = s.lower()
    # Replace multi-word weak leaders first (longest match wins)
    keys = sorted(_WEAK_VERB_REPLACEMENTS.keys(), key=len, reverse=True)
    for weak in keys:
        if lower.startswith(weak + " "):
            rest = s[len(weak):].lstrip()
            # Capitalize first letter of rest if the new verb is followed
            # by something that looks like a continuation
            s = f"{_WEAK_VERB_REPLACEMENTS[weak]} {rest[:1].lower()}{rest[1:]}" if rest else _WEAK_VERB_REPLACEMENTS[weak]
            lower = s.lower()
            break

    # Collapse doubled spaces and trailing period normalization
    s = " ".join(s.split())
    if s and not s.endswith(('.', '!', '?')):
        s += "."
    return s


def _extract_jd_keywords_fast(jd_text: str) -> dict:
    """
    Deterministic JD extraction using the existing keyword analyzer.
    No LLM. Returns a dict with:
      job_title   (best-effort line scan)
      job_company (best-effort line scan)
      tools       (specific named technologies detected in the JD)
      keywords    (all extracted keywords, ranked by JD frequency)
      must_have   (keywords appearing in "required / must have" context)
      nice_to_have (keywords appearing in "preferred / nice to have" context)
    """
    jd = (jd_text or "").strip()
    if not jd:
        return {
            "job_title": "", "job_company": "", "seniority": "",
            "tools": [], "keywords": [], "must_have": [], "nice_to_have": [],
        }

    import re as _re

    # ── Title + company best-effort detection ─────────────────────────
    first_lines = [ln.strip() for ln in jd.split("\n") if ln.strip()][:10]
    job_title = ""
    job_company = ""
    title_keywords = (
        "intern", "engineer", "scientist", "analyst", "developer",
        "manager", "associate", "consultant", "designer", "coordinator",
    )
    for ln in first_lines:
        low = ln.lower()
        if not job_title and any(k in low for k in title_keywords) and len(ln) < 90:
            job_title = ln
        m = _re.search(r"at\s+([A-Z][A-Za-z0-9&.\- ]{2,40})", ln)
        if not job_company and m:
            cand = m.group(1).strip().rstrip(",.!?")
            if len(cand) < 40:
                job_company = cand

    # Seniority
    seniority = ""
    low_all = jd.lower()
    if "intern" in low_all: seniority = "intern"
    elif "new grad" in low_all or "entry level" in low_all or "entry-level" in low_all:
        seniority = "new_grad"
    elif "senior" in low_all or "sr." in low_all or "lead" in low_all:
        seniority = "senior"
    elif "mid-level" in low_all or "mid level" in low_all:
        seniority = "mid"
    elif "junior" in low_all or "jr." in low_all:
        seniority = "junior"

    # ── Reuse the keyword analyzer — it already does tf/idf over a fake
    #    resume so we can pass an empty text and just read the ranked
    #    keyword list the analyzer extracts from the JD. ─────────────
    keywords: list = []
    tools: list = []
    try:
        from dilly_core.ats_keywords import run_keyword_analysis
        # Pass an empty "resume" so the analyzer runs JD extraction and
        # returns the ranked keyword list.
        fake_sections = {"experience": "", "skills": "", "projects": ""}
        kr = run_keyword_analysis(fake_sections, job_description=jd)
        for k in (kr.keywords or [])[:30]:
            kw = getattr(k, "keyword", "") or ""
            if kw:
                keywords.append(kw)
    except Exception as _exc:
        sys.stderr.write(f"[jd_fast_kw_failed] {type(_exc).__name__}: {str(_exc)[:200]}\n")

    # Tools / specific tech names — a regex sweep for the most common
    # programming languages, frameworks, and tools. Lower false-positive
    # rate than generic keyword extraction.
    _TOOL_RE = _re.compile(
        r"\b("
        r"Python|JavaScript|TypeScript|Java|Go(lang)?|Rust|C\+\+|C#|Kotlin|Swift|Ruby|PHP|Scala|"
        r"React|Next\.js|Vue|Svelte|Angular|Node\.js|Express|Django|Flask|FastAPI|Spring|Rails|"
        r"SQL|NoSQL|PostgreSQL|MySQL|MongoDB|Redis|SQLite|DynamoDB|Snowflake|BigQuery|"
        r"AWS|GCP|Azure|Docker|Kubernetes|Terraform|Ansible|Jenkins|GitHub Actions|GitLab CI|"
        r"Pandas|NumPy|Scikit-learn|TensorFlow|PyTorch|Keras|XGBoost|"
        r"Tableau|Power ?BI|Looker|Excel|SPSS|Stata|SAS|R(?: programming)?|MATLAB|"
        r"Figma|Sketch|Adobe XD|Illustrator|Photoshop|InDesign|"
        r"Git|Linux|Bash|GraphQL|REST(?:ful)?|gRPC|Kafka|Airflow|Spark|Hadoop|dbt|"
        r"Bloomberg Terminal|Capital IQ|Workday|Salesforce|HubSpot|"
        r"A/B testing|machine learning|deep learning|NLP|computer vision|data visualization|ETL"
        r")\b",
        _re.IGNORECASE,
    )
    seen: set = set()
    for m in _TOOL_RE.finditer(jd):
        canonical = m.group(0)
        key = canonical.lower()
        if key in seen:
            continue
        seen.add(key)
        tools.append(canonical)
        if len(tools) >= 15:
            break

    # ── Required vs preferred section detection ──────────────────────
    # Split the JD into paragraphs and tag each by which header it
    # follows. Keywords/tools that appear in a "required" paragraph go
    # to must_have, in a "preferred" paragraph go to nice_to_have.
    must_have: list = []
    nice_to_have: list = []
    current_bucket: Optional[str] = None
    for para in jd.split("\n"):
        p_low = para.lower().strip()
        if not p_low:
            continue
        # Bucket headers
        if any(h in p_low for h in ("required", "must have", "must-have", "qualifications", "what you need")):
            current_bucket = "must"
            continue
        if any(h in p_low for h in ("preferred", "nice to have", "nice-to-have", "bonus", "plus if")):
            current_bucket = "nice"
            continue
        if current_bucket:
            for tool in tools:
                if tool.lower() in p_low:
                    target = must_have if current_bucket == "must" else nice_to_have
                    if tool not in target:
                        target.append(tool)
            for kw in keywords[:20]:
                if kw.lower() in p_low:
                    target = must_have if current_bucket == "must" else nice_to_have
                    if kw not in target and len(target) < 8:
                        target.append(kw)

    return {
        "job_title": job_title,
        "job_company": job_company,
        "seniority": seniority,
        "tools": tools,
        "keywords": keywords,
        "must_have": must_have[:8],
        "nice_to_have": nice_to_have[:6],
    }


def _sections_to_plain_text(sections: List[dict]) -> str:
    """Serialize structured sections into resume-like plain text for the
    deterministic scorers. Mirrors _sections_to_text but accepts dicts so
    it can run on either the base or tailored payload."""
    try:
        typed = [ResumeSection(**s) for s in sections if isinstance(s, dict)]
        return _sections_to_text(typed)
    except Exception:
        # Fallback: best-effort text extraction
        chunks: list = []
        for s in sections or []:
            if not isinstance(s, dict):
                continue
            if s.get("experiences"):
                for e in s["experiences"]:
                    chunks.append(f"{e.get('company','')} {e.get('role','')} {e.get('date','')}")
                    for b in e.get("bullets") or []:
                        chunks.append(b.get("text", ""))
            if s.get("projects"):
                for p in s["projects"]:
                    chunks.append(f"{p.get('name','')} {p.get('date','')}")
                    for b in p.get("bullets") or []:
                        chunks.append(b.get("text", ""))
            if s.get("simple"):
                chunks.extend(s["simple"].get("lines") or [])
            if s.get("education"):
                e = s["education"]
                chunks.append(f"{e.get('university','')} {e.get('major','')} {e.get('graduation','')}")
        return "\n".join(c for c in chunks if c)


def _score_keyword_coverage(resume_text: str, job_description: str) -> dict:
    """Deterministic keyword coverage score for a resume vs a JD.
    Returns { match_pct, strong, adequate, weak, missing } where each
    bucket is a list of keyword strings."""
    try:
        from dilly_core.resume_parser import get_sections
        from dilly_core.ats_keywords import run_keyword_analysis
        sections_map = get_sections(resume_text)
        kr = run_keyword_analysis(sections_map, job_description=job_description)
        jm = getattr(kr, "jd_match", None)
        if not isinstance(jm, dict):
            return {"match_pct": 0.0, "strong": [], "adequate": [], "weak": [], "missing": []}
        strong: list = []
        adequate: list = []
        weak: list = []
        missing: list = []
        for req in (jm.get("requirements") or []):
            if not isinstance(req, dict):
                continue
            kw = req.get("keyword")
            if not kw:
                continue
            placement = req.get("placement")
            if placement == "strong":
                strong.append(kw)
            elif placement == "adequate":
                adequate.append(kw)
            elif placement == "weak":
                weak.append(kw)
            elif placement == "missing":
                missing.append(kw)
        return {
            "match_pct": round(float(jm.get("match_percentage") or 0), 1),
            "strong": strong,
            "adequate": adequate,
            "weak": weak,
            "missing": missing,
        }
    except Exception as _exc:
        sys.stderr.write(f"[kw_cov_failed] {type(_exc).__name__}: {str(_exc)[:200]}\n")
        return {"match_pct": 0.0, "strong": [], "adequate": [], "weak": [], "missing": []}


def _score_ats_v2(resume_text: str) -> Optional[float]:
    """Deterministic v2 ATS composite on raw text. Returns the overall
    value or None on failure."""
    try:
        from dilly_core.resume_parser import parse_resume as _pr
        from dilly_core.ats_analysis import run_ats_analysis as _raa
        from dilly_core.ats_score_v2 import (
            score_from_signals as _sfs,
            signals_from_ats_analysis as _sfaa,
        )
        from dilly_core.ats_workday_validator import run_workday_checks as _rwc
        parsed = _pr(resume_text)
        analysis = _raa(raw_text=resume_text, parsed=parsed)
        sig = _sfaa(analysis, raw_text=resume_text, file_extension="pdf")
        wd = _rwc(resume_text, parsed)
        scored = _sfs(sig, extra_issues=wd).to_dict()
        ov = (scored.get("overall") or {}).get("value")
        return float(ov) if ov is not None else None
    except Exception:
        return None


def _score_bullet_against_jd(text: str, jd_keywords_lower: List[str], tools_lower: List[str]) -> float:
    """Score one bullet against JD keywords. Higher = more relevant."""
    if not text:
        return 0.0
    low = text.lower()
    score = 0.0
    # Tools are high-value exact matches
    for t in tools_lower:
        if t and t in low:
            score += 3.0
    # General keywords contribute less
    for kw in jd_keywords_lower:
        if kw and kw in low:
            score += 1.0
    # Metrics bonus
    if any(ch.isdigit() for ch in text):
        score += 0.5
    # Length penalty for stubs
    if len(text.split()) < 5:
        score -= 1.0
    return score


def _score_experience_against_jd(exp: dict, jd_keywords_lower: List[str], tools_lower: List[str]) -> float:
    """Aggregate score for an entire experience entry."""
    s = 0.0
    blob = " ".join([
        str(exp.get("company") or ""),
        str(exp.get("role") or ""),
    ]).lower()
    for t in tools_lower:
        if t and t in blob:
            s += 2.0
    for kw in jd_keywords_lower[:15]:
        if kw and kw in blob:
            s += 0.5
    for b in exp.get("bullets") or []:
        s += _score_bullet_against_jd(
            str((b or {}).get("text") or ""),
            jd_keywords_lower, tools_lower,
        )
    return s


def _deterministic_tailor(base_sections: List[dict], jd_facts: dict, jd_text: str,
                           profile: dict) -> tuple[List[dict], List[dict]]:
    """
    Build the tailored sections and a list of per-bullet change rationales
    without any LLM. Rules:

      1. Score every experience/project/bullet against JD keywords + tools.
      2. Keep only experiences/projects with score > 0.1. Hide the rest
         (they stay in base resume, just not in the tailored variant).
      3. Reorder experiences and bullets by descending score.
      4. Run _strengthen_bullet on every surviving bullet.
      5. Rebuild Skills: JD tools first, then existing skills matching
         any JD keyword, then user's Dilly Profile tools_used that match
         the JD. Drop skills that don't match the JD at all.
      6. Pull in additional experiences/projects from profile
         experience_expansion if they have JD-matching tools_used and
         the student has a description the tailor can use.
    """
    tools = jd_facts.get("tools") or []
    tools_lower = [t.lower() for t in tools if t]
    keywords = jd_facts.get("keywords") or []
    keywords_lower = [k.lower() for k in keywords if k]

    rationales: List[dict] = []

    def _bullet_changed(before: str, after: str, company: str, role: str) -> None:
        if before != after and len(rationales) < 12:
            # Find the most relevant JD hit for the rationale
            hit: Optional[str] = None
            lb = (before + " " + after).lower()
            for t in tools_lower[:10]:
                if t in lb:
                    hit = t
                    break
            if not hit:
                for kw in keywords_lower[:10]:
                    if kw in lb:
                        hit = kw
                        break
            rationales.append({
                "company": company, "role": role,
                "before": before, "after": after,
                "reason": (
                    f"Strengthened verb and kept the JD match '{hit}'"
                    if hit else "Strengthened verb and tightened phrasing"
                ),
            })

    def _process_section(s: dict) -> Optional[dict]:
        if not isinstance(s, dict):
            return s
        key = (s.get("key") or "").lower()
        out = dict(s)

        if key in ("experience", "professional_experience") and s.get("experiences"):
            scored_exps: list = []
            for exp in s["experiences"]:
                score = _score_experience_against_jd(exp, keywords_lower, tools_lower)
                scored_exps.append((score, exp))
            # Keep experiences with any positive score; sort desc
            kept = [e for e in scored_exps if e[0] > 0]
            if not kept:
                kept = scored_exps  # keep everything if none scored (don't nuke the resume)
            kept.sort(key=lambda t: t[0], reverse=True)

            new_exps: list = []
            for _, exp in kept:
                new_exp = dict(exp)
                # Score and reorder bullets inside the experience
                b_scored: list = []
                for b in exp.get("bullets") or []:
                    bt = str((b or {}).get("text") or "")
                    if not bt.strip():
                        continue
                    b_scored.append((_score_bullet_against_jd(bt, keywords_lower, tools_lower), b))
                # Keep bullets with score > 0.3, or top 4 if all low
                relevant = [b for b in b_scored if b[0] > 0.3]
                if len(relevant) < 2 and b_scored:
                    relevant = sorted(b_scored, key=lambda t: t[0], reverse=True)[:4]
                else:
                    relevant.sort(key=lambda t: t[0], reverse=True)
                new_bullets: list = []
                for _, b in relevant[:5]:
                    before = str((b or {}).get("text") or "")
                    after = _strengthen_bullet(before)
                    new_bullets.append({**(b or {}), "text": after})
                    _bullet_changed(before, after, new_exp.get("company", ""), new_exp.get("role", ""))
                new_exp["bullets"] = new_bullets
                new_exps.append(new_exp)
            out["experiences"] = new_exps
            return out

        if key == "projects" and s.get("projects"):
            scored_projs: list = []
            for p in s["projects"]:
                score = _score_experience_against_jd(
                    {"company": p.get("name", ""), "role": "", "bullets": p.get("bullets") or []},
                    keywords_lower, tools_lower,
                )
                scored_projs.append((score, p))
            kept = [x for x in scored_projs if x[0] > 0]
            if not kept:
                kept = scored_projs
            kept.sort(key=lambda t: t[0], reverse=True)
            new_projects: list = []
            for _, p in kept[:4]:
                new_p = dict(p)
                b_scored = []
                for b in p.get("bullets") or []:
                    bt = str((b or {}).get("text") or "")
                    if not bt.strip():
                        continue
                    b_scored.append((_score_bullet_against_jd(bt, keywords_lower, tools_lower), b))
                relevant = [b for b in b_scored if b[0] > 0.3]
                if len(relevant) < 2 and b_scored:
                    relevant = sorted(b_scored, key=lambda t: t[0], reverse=True)[:3]
                else:
                    relevant.sort(key=lambda t: t[0], reverse=True)
                new_bullets = []
                for _, b in relevant[:4]:
                    before = str((b or {}).get("text") or "")
                    after = _strengthen_bullet(before)
                    new_bullets.append({**(b or {}), "text": after})
                    _bullet_changed(before, after, p.get("name", ""), "project")
                new_p["bullets"] = new_bullets
                new_projects.append(new_p)
            out["projects"] = new_projects
            return out

        if key == "skills" and s.get("simple"):
            # Rebuild skills list
            existing = [str(l).strip() for l in (s["simple"].get("lines") or []) if str(l).strip()]
            # Split comma-separated lines into individual skills for scoring
            atomic: list = []
            for line in existing:
                for chunk in _re.split(r"[,/•;|]", line):
                    chunk = chunk.strip().rstrip(".")
                    if chunk and chunk not in atomic:
                        atomic.append(chunk)

            # Pull extra skills the student already told Dilly about
            profile_tools: list = []
            try:
                expansion = profile.get("experience_expansion") or []
                for ent in expansion:
                    if not isinstance(ent, dict):
                        continue
                    for t in (ent.get("tools_used") or []) + (ent.get("skills") or []):
                        if isinstance(t, str) and t.strip() and t not in atomic and t not in profile_tools:
                            profile_tools.append(t.strip())
            except Exception:
                pass

            # Category 1: JD tools the student actually has (in atomic or profile_tools)
            have_lower = set(a.lower() for a in atomic + profile_tools)
            jd_matched: list = [t for t in tools if t and t.lower() in have_lower]
            # Category 2: existing skills that match any JD keyword
            context_matches: list = [
                a for a in atomic
                if a.lower() not in (t.lower() for t in jd_matched)
                and any(kw in a.lower() for kw in keywords_lower[:20])
            ]
            # Category 3: profile tools that match the JD but weren't in the resume
            profile_additions: list = [
                t for t in profile_tools
                if t.lower() not in (x.lower() for x in jd_matched + context_matches)
                and (t.lower() in (k for k in keywords_lower) or t.lower() in (tl for tl in tools_lower))
            ]

            new_skills = jd_matched + context_matches + profile_additions
            if not new_skills:
                # Don't nuke — keep original if nothing matched
                new_skills = atomic

            # Render back as a single comma-separated line (ATS parsers
            # prefer this over multi-line skills)
            out["simple"] = {
                **s["simple"],
                "lines": [", ".join(new_skills[:20])] if new_skills else [""],
            }
            return out

        return out

    tailored: List[dict] = []
    for s in base_sections:
        processed = _process_section(s)
        if processed is not None:
            tailored.append(processed)

    return tailored, rationales


@router.post("/resume/jd-quick-tailor")
async def resume_jd_quick_tailor(request: Request, body: JDQuickTailorRequest):
    """
    Build 73: deterministic one-shot tailor from a pasted JD. Zero LLM
    cost. Rearranges, prunes, and strengthens the user's existing resume
    against the JD requirements. Never invents experience.

    Returns:
      {
        jd_facts:   {job_title, job_company, seniority, tools[], must_have[], nice_to_have[], keywords[]},
        headline:   "auto-generated summary of changes",
        base_sections, tailored_sections,
        bullet_rationales: [{company, role, before, after, reason}],
        keyword_before, keyword_after,          # {match_pct, strong, adequate, weak, missing}
        ats_before, ats_after,                  # floats or null
        auto_skills_to_add: [string, ...],
        experience_diffs, skills_diff,
      }
    """
    deps.rate_limit(request, "jd-quick-tailor", max_requests=60, window_sec=300)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    jd = (body.job_description or "").strip()
    if len(jd) < 30:
        raise errors.validation_error("Paste the full job description (at least a paragraph).")

    # Load base resume
    base_sections: List[dict] = []
    if body.base_variant_id:
        content = await asyncio.to_thread(_load_variant_content, email, body.base_variant_id)
        if content:
            base_sections = content.get("sections") or []
    if not base_sections:
        existing = await asyncio.to_thread(_load_resume, email)
        if existing:
            base_sections = existing.get("sections") or []
    if not base_sections:
        raise errors.validation_error(
            "No saved resume found. Save your resume in the editor first."
        )

    # 1. Deterministic JD extraction (no LLM)
    jd_facts = _extract_jd_keywords_fast(jd)

    # 2. Load Dilly Profile for extra skills / tools_used
    profile: dict = {}
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = await asyncio.to_thread(get_profile, email) or {}
    except Exception:
        profile = {}

    # 3. Deterministic tailor (no LLM)
    tailored_sections, bullet_rationales = _deterministic_tailor(base_sections, jd_facts, jd, profile)

    # 4. Before/after scores
    base_text = _sections_to_plain_text(base_sections)
    tailored_text = _sections_to_plain_text(tailored_sections)
    keyword_before = _score_keyword_coverage(base_text, jd)
    keyword_after = _score_keyword_coverage(tailored_text, jd)
    ats_before = _score_ats_v2(base_text)
    ats_after = _score_ats_v2(tailored_text)

    # 5. Auto-skills the user could add
    existing_skills_lines = _find_skills_lines(base_sections)
    existing_text = " ".join(existing_skills_lines).lower()
    auto_skills_to_add: list = []
    for tool in (jd_facts.get("tools") or [])[:10]:
        if not tool:
            continue
        if tool.lower() not in existing_text and len(tool) < 40:
            auto_skills_to_add.append(tool)

    # 6. Diffs (existing helpers)
    experience_diffs = _diff_experiences(base_sections, tailored_sections)
    skills_diff = _diff_skills(base_sections, tailored_sections)

    # 7. Build headline summary from the deterministic changes
    parts: list = []
    if keyword_after["match_pct"] > keyword_before["match_pct"]:
        parts.append(f"keyword coverage {keyword_before['match_pct']:.0f}% → {keyword_after['match_pct']:.0f}%")
    if len(bullet_rationales) > 0:
        parts.append(f"{len(bullet_rationales)} bullets strengthened")
    if auto_skills_to_add:
        parts.append(f"{len(auto_skills_to_add)} missing skills flagged")
    headline = (", ".join(parts) or "Reordered for relevance").capitalize() + "."

    return {
        "jd_facts": jd_facts,
        "headline": headline,
        "bullet_rationales": bullet_rationales,
        "base_sections": base_sections,
        "tailored_sections": tailored_sections,
        "experience_diffs": experience_diffs,
        "skills_diff": skills_diff,
        "keyword_before": keyword_before,
        "keyword_after": keyword_after,
        "ats_before": ats_before,
        "ats_after": ats_after,
        "auto_skills_to_add": auto_skills_to_add,
        "job_title": jd_facts.get("job_title") or "",
        "job_company": jd_facts.get("job_company") or "",
    }


# ── Diff helpers ───────────────────────────────────────────────────────────

def _find_experiences(sections: List[dict]) -> List[dict]:
    """Extract the list of experience entries from whichever section holds them."""
    for s in sections or []:
        if not isinstance(s, dict):
            continue
        key = (s.get("key") or "").lower()
        if "experience" in key:
            exps = s.get("experiences") or []
            if isinstance(exps, list):
                return exps
    return []


def _find_skills_lines(sections: List[dict]) -> List[str]:
    for s in sections or []:
        if not isinstance(s, dict):
            continue
        key = (s.get("key") or "").lower()
        if key == "skills":
            simple = s.get("simple") or {}
            lines = simple.get("lines") or []
            return [str(l or "").strip() for l in lines if l]
    return []


def _exp_signature(exp: dict) -> str:
    """Build a dedup signature for an experience entry."""
    if not isinstance(exp, dict):
        return ""
    return "|".join([
        (exp.get("company") or "").strip().lower(),
        (exp.get("role") or "").strip().lower(),
        (exp.get("date") or "").strip().lower(),
    ])


def _bullet_texts(exp: dict) -> List[str]:
    bullets = exp.get("bullets") or []
    return [str((b or {}).get("text") or "").strip() for b in bullets if b]


def _word_diff(a: str, b: str) -> List[dict]:
    """Cheap word-level diff — returns a list of ops for UI highlighting."""
    a_words = (a or "").split()
    b_words = (b or "").split()
    a_set = set(w.lower().strip(".,;:") for w in a_words)
    b_set = set(w.lower().strip(".,;:") for w in b_words)
    added = [w for w in b_words if w.lower().strip(".,;:") not in a_set]
    removed = [w for w in a_words if w.lower().strip(".,;:") not in b_set]
    return [
        {"op": "added", "words": added[:12]},
        {"op": "removed", "words": removed[:12]},
    ]


def _diff_experiences(base_sections: List[dict], tailored_sections: List[dict]) -> List[dict]:
    """
    Align experiences by company+role+date signature, then diff bullets within
    each aligned pair. Experiences present only in tailored are 'added',
    only in base are 'removed'.
    """
    base_exps = _find_experiences(base_sections)
    tailored_exps = _find_experiences(tailored_sections)

    base_by_sig: dict = {}
    for i, e in enumerate(base_exps):
        sig = _exp_signature(e)
        if sig:
            base_by_sig[sig] = (i, e)

    seen_base_sigs: set = set()
    diffs: List[dict] = []

    for new_idx, tailored_exp in enumerate(tailored_exps):
        sig = _exp_signature(tailored_exp)
        if sig and sig in base_by_sig:
            _base_idx, base_exp = base_by_sig[sig]
            seen_base_sigs.add(sig)
            # Compare bullets
            base_bullets = _bullet_texts(base_exp)
            tailored_bullets = _bullet_texts(tailored_exp)
            bullet_diffs: List[dict] = []
            # Simple alignment: match by index; any extras become added/removed
            max_len = max(len(base_bullets), len(tailored_bullets))
            for i in range(max_len):
                b_text = base_bullets[i] if i < len(base_bullets) else None
                t_text = tailored_bullets[i] if i < len(tailored_bullets) else None
                if b_text is None and t_text is not None:
                    bullet_diffs.append({
                        "kind": "added",
                        "base_text": None,
                        "tailored_text": t_text,
                        "changed_words": [],
                    })
                elif t_text is None and b_text is not None:
                    bullet_diffs.append({
                        "kind": "removed",
                        "base_text": b_text,
                        "tailored_text": None,
                        "changed_words": [],
                    })
                elif b_text == t_text:
                    bullet_diffs.append({
                        "kind": "unchanged",
                        "base_text": b_text,
                        "tailored_text": t_text,
                        "changed_words": [],
                    })
                else:
                    bullet_diffs.append({
                        "kind": "modified",
                        "base_text": b_text,
                        "tailored_text": t_text,
                        "changed_words": _word_diff(b_text or "", t_text or ""),
                    })

            overall_kind = (
                "unchanged"
                if all(bd["kind"] == "unchanged" for bd in bullet_diffs)
                else "modified"
            )
            diffs.append({
                "kind": overall_kind,
                "base": {
                    "company": base_exp.get("company") or "",
                    "role": base_exp.get("role") or "",
                    "date": base_exp.get("date") or "",
                    "bullets": [{"text": t} for t in base_bullets],
                },
                "tailored": {
                    "company": tailored_exp.get("company") or "",
                    "role": tailored_exp.get("role") or "",
                    "date": tailored_exp.get("date") or "",
                    "bullets": [{"text": t} for t in tailored_bullets],
                },
                "bullet_diffs": bullet_diffs,
                "reorder_rank": new_idx,
            })
        else:
            # New experience — not in base
            tailored_bullets = _bullet_texts(tailored_exp)
            diffs.append({
                "kind": "added",
                "base": None,
                "tailored": {
                    "company": tailored_exp.get("company") or "",
                    "role": tailored_exp.get("role") or "",
                    "date": tailored_exp.get("date") or "",
                    "bullets": [{"text": t} for t in tailored_bullets],
                },
                "bullet_diffs": [
                    {
                        "kind": "added",
                        "base_text": None,
                        "tailored_text": t,
                        "changed_words": [],
                    }
                    for t in tailored_bullets
                ],
                "reorder_rank": new_idx,
            })

    # Experiences in base but not in tailored — 'removed'
    for sig, (_i, base_exp) in base_by_sig.items():
        if sig in seen_base_sigs:
            continue
        base_bullets = _bullet_texts(base_exp)
        diffs.append({
            "kind": "removed",
            "base": {
                "company": base_exp.get("company") or "",
                "role": base_exp.get("role") or "",
                "date": base_exp.get("date") or "",
                "bullets": [{"text": t} for t in base_bullets],
            },
            "tailored": None,
            "bullet_diffs": [
                {
                    "kind": "removed",
                    "base_text": t,
                    "tailored_text": None,
                    "changed_words": [],
                }
                for t in base_bullets
            ],
            "reorder_rank": None,
        })

    return diffs


def _diff_skills(base_sections: List[dict], tailored_sections: List[dict]) -> dict:
    base_lines = _find_skills_lines(base_sections)
    tailored_lines = _find_skills_lines(tailored_sections)

    def _tokens(lines: List[str]) -> set:
        out: set = set()
        for line in lines:
            for tok in re.split(r"[,|•·\n]", line):
                t = tok.strip()
                if t and len(t) >= 2 and len(t) <= 40:
                    out.add(t)
        return out

    base_set = _tokens(base_lines)
    tailored_set = _tokens(tailored_lines)

    added = sorted(tailored_set - base_set, key=str.lower)
    removed = sorted(base_set - tailored_set, key=str.lower)
    kept = sorted(base_set & tailored_set, key=str.lower)

    return {
        "added": added[:20],
        "removed": removed[:20],
        "kept": kept[:40],
    }
