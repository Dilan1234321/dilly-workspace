"""
Resume editor endpoints.
GET  /resume/edited       — load user's saved edited resume (structured sections JSON)
POST /resume/save         — save edited resume sections back to disk
POST /resume/audit        — re-audit from the saved edited resume text (no file upload needed)
"""
import asyncio
import json
import os
import sys
import time

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Body, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from projects.dilly.api import deps, errors
from projects.dilly.api.profile_store import get_profile_folder_path, ensure_profile_exists

router = APIRouter(tags=["resume"])

_RESUME_EDITED_FILENAME = "resume_edited.json"
_MAX_BULLET_LEN = 600
_MAX_FIELD_LEN = 300
_MAX_SECTIONS = 20
_MAX_ENTRIES_PER_SECTION = 30
_MAX_BULLETS_PER_ENTRY = 20


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class BulletItem(BaseModel):
    id: str
    text: str


class ExperienceEntry(BaseModel):
    id: str
    company: Optional[str] = ""
    role: Optional[str] = ""
    date: Optional[str] = ""
    location: Optional[str] = ""
    bullets: List[BulletItem] = Field(default_factory=list)


class EducationEntry(BaseModel):
    id: str
    university: Optional[str] = ""
    major: Optional[str] = ""
    minor: Optional[str] = ""
    graduation: Optional[str] = ""
    location: Optional[str] = ""
    honors: Optional[str] = ""
    gpa: Optional[str] = ""


class ProjectEntry(BaseModel):
    id: str
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
    id: str
    lines: List[str] = Field(default_factory=list)


class ResumeSection(BaseModel):
    """One canonical section of the resume."""
    key: str  # e.g. "contact", "education", "professional_experience", "skills"
    label: str  # display label
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


@router.post("/resume/audit")
async def audit_from_edited_resume(request: Request, body: ResumeAuditRequest = Body(default=ResumeAuditRequest())):
    """
    Re-audit the user's saved edited resume without requiring a file upload.
    Reconstructs plain text from saved sections and runs through the audit pipeline.
    Requires subscription (same as /audit/v2).
    """
    user = deps.require_auth(request)
    if not user.get("subscribed"):
        raise errors.forbidden("Subscribe to run audits. $9.99/month.")
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

        # Attach resume text for downstream tools
        if isinstance(result, dict):
            result["resume_text"] = resume_text
            result["application_target"] = application_target

        # Persist to audit history so Career Center shows the new audit (same as /audit/v2)
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

    # --- Action verb (up to 30pts) ---
    if first_word in _STRONG_ACTION_VERBS:
        score += 30
    elif first_word in _WEAK_VERBS:
        score += 5
        hints.append("Start with a stronger action verb (e.g. Built, Led, Developed).")
    elif bullet[0].isupper() and len(words) >= 3:
        score += 15
        hints.append("Start with an action verb (e.g. Built, Led, Developed).")
    else:
        hints.append("Start with a strong action verb.")

    # --- Quantification (up to 35pts) ---
    qty_matches = _QUANTITY_PATTERN.findall(bullet)
    if len(qty_matches) >= 2:
        score += 35
    elif len(qty_matches) == 1:
        score += 20
        hints.append("Add a second number (e.g. time saved, % improvement, scale).")
    else:
        score += 0
        hints.append("Add measurable impact — a number, %, or scale.")

    # --- Length and specificity (up to 20pts) ---
    word_count = len(words)
    if 12 <= word_count <= 30:
        score += 20
    elif 8 <= word_count < 12:
        score += 12
        hints.append("A little more detail would strengthen this bullet.")
    elif word_count > 35:
        score += 10
        hints.append("Tighten this bullet — aim for under 35 words.")
    else:
        score += 5
        hints.append("This bullet is too short. Add context and impact.")

    # --- Tools / tech keywords (up to 15pts) ---
    bullet_lower = bullet.lower()
    tool_hits = sum(1 for t in _TOOL_KEYWORDS if t in bullet_lower)
    if tool_hits >= 1:
        score += 15

    # Cap at 100
    score = min(score, 100)

    # Label
    if score >= 80:
        label = "Strong"
    elif score >= 55:
        label = "Good"
    elif score >= 30:
        label = "Needs work"
    else:
        label = "Weak"

    # Limit hints to 2
    return BulletScoreResponse(score=score, label=label, hints=hints[:2])
