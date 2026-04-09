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

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from projects.dilly.api import deps, errors
from projects.dilly.api.profile_store import get_profile_folder_path, ensure_profile_exists

router = APIRouter(tags=["resume"])

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

        # Contact section
        name = (profile.get("name") or "").strip()
        p_email = (profile.get("email") or email).strip()
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
        school = "University of Tampa" if profile.get("school_id") == "utampa" else ""
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
            model="claude-sonnet-4-5-20250929",
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
    Return the list of rubric cohorts the editor can score against.
    Used by the cohort switcher in ResumeScoreDashboard to let users
    preview their resume against a different cohort's scoring rubric.
    """
    deps.require_auth(request)
    try:
        from dilly_core.rubric_scorer import list_cohort_ids, get_rubric
        cohort_ids = list_cohort_ids()
        out = []
        for cid in cohort_ids:
            try:
                rubric = get_rubric(cid) or {}
                display = rubric.get("display_name") or cid.replace("_", " ").title()
            except Exception:
                display = cid.replace("_", " ").title()
            out.append({"cohort_id": cid, "display_name": display})
        return {"cohorts": out}
    except Exception:
        return {"cohorts": []}


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

    # ── 1. Parse + ats_analysis + v2 scorer ────────────────────────────
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

    # ── 2. Rubric scoring (primary cohort) ────────────────────────────
    # Strategy: try to re-score the in-editor resume against the student's
    # cohort rubric. If that fails (missing major, missing signals, anything),
    # fall back to the most recent saved audit's rubric_analysis so the UI
    # never shows zeros for Smart/Grit/Build.
    student_email = ""
    try:
        _u = deps.require_auth(request)
        student_email = (_u.get("email") or "").strip().lower()
    except Exception:
        pass

    try:
        from dilly_core.rubric_scorer import (
            select_cohorts_for_student, score_for_cohorts,
            build_rubric_analysis_payload, list_cohort_ids,
        )
        from dilly_core.scoring import extract_scoring_signals as _rc_extract_signals

        # Figure out the student's major(s) for cohort selection
        major = ""
        if student_email:
            try:
                from projects.dilly.api.profile_store import get_profile
                prof = get_profile(student_email) or {}
                majors = prof.get("majors") or ([prof.get("major")] if prof.get("major") else [])
                if majors:
                    major = majors[0] or ""
            except Exception:
                pass

        # Explicit cohort_id override from the cohort switcher / variant
        # context takes priority over the major-derived cohort selection.
        cohorts: List[str] = []
        if body.cohort_id:
            try:
                valid = set(list_cohort_ids())
            except Exception:
                valid = set()
            if not valid or body.cohort_id in valid:
                cohorts = [body.cohort_id]
        if not cohorts:
            cohorts = select_cohorts_for_student(
                major=major,
                minors=[],
                pre_professional_track=None,
                industry_target=None,
            )
        if cohorts:
            rc_signals = _rc_extract_signals(resume_text, gpa=None, major=major)
            rc_scores = score_for_cohorts(rc_signals, resume_text, cohorts)
            if rc_scores:
                primary_cid = cohorts[0]
                rubric_summary = build_rubric_analysis_payload(primary_cid, rc_scores)
    except Exception as e:
        import sys
        sys.stderr.write(f"[editor_scan_rubric_failed] {type(e).__name__}: {str(e)[:200]}\n")

    # Fallback: if live rubric scoring didn't produce a useful payload,
    # use the most recent audit's rubric_analysis so the rings have real numbers.
    if (not rubric_summary) or not (
        rubric_summary.get("primary_smart") or rubric_summary.get("primary_grit") or rubric_summary.get("primary_build")
    ):
        if student_email:
            try:
                from projects.dilly.api.audit_history import get_audits
                audits = get_audits(student_email) or []
                for a in audits:
                    ra = a.get("rubric_analysis")
                    if isinstance(ra, dict) and (ra.get("primary_smart") or ra.get("primary_grit") or ra.get("primary_build")):
                        rubric_summary = ra
                        break
            except Exception:
                pass

    # Fallback: if live ATS v2 scoring didn't produce composite scores, use
    # the most recent audit's v2 payload so the vendor sidebar shows real data.
    if (not v2) or not (v2.get("vendors") and v2.get("overall")):
        if student_email:
            try:
                from projects.dilly.api.audit_history import get_audits
                audits = get_audits(student_email) or []
                for a in audits:
                    raw_v2 = (a.get("rubric_analysis") or {}).get("v2") if isinstance(a.get("rubric_analysis"), dict) else None
                    # Also check a top-level v2 field for forward compat
                    if not raw_v2:
                        raw_v2 = a.get("v2") if isinstance(a.get("v2"), dict) else None
                    if raw_v2 and raw_v2.get("overall"):
                        v2 = raw_v2
                        break
            except Exception:
                pass

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
        "scoring_version": "editor-scan-v1",
    }


# ---------------------------------------------------------------------------
# Resume PDF export — single-column, ATS-friendly, template-based
# ---------------------------------------------------------------------------

class ExportRequest(BaseModel):
    sections: List[ResumeSection]
    template: Optional[str] = "tech"  # 'tech' | 'business' | 'academic'
    filename: Optional[str] = None


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

    template_name = (body.template or "tech").lower()
    if template_name not in ("tech", "business", "academic"):
        template_name = "tech"

    # Pull candidate name from contact section for the PDF metadata
    candidate_name: Optional[str] = None
    for s in body.sections:
        if s.key == "contact" and s.contact and s.contact.name:
            candidate_name = s.contact.name
            break

    try:
        from dilly_core.resume_pdf_export import render_resume_pdf
        # Convert Pydantic models to dicts for the renderer
        sections_dicts = [s.model_dump() if hasattr(s, "model_dump") else s.dict() for s in body.sections]
        pdf_bytes = render_resume_pdf(
            sections_dicts,
            template_name=template_name,
            candidate_name=candidate_name,
        )
    except Exception as e:
        import sys, traceback
        sys.stderr.write(f"[pdf_export_failed] {type(e).__name__}: {str(e)[:200]}\n")
        try: traceback.print_exc(file=sys.stderr)
        except Exception: pass
        raise HTTPException(status_code=500, detail=f"PDF render failed: {type(e).__name__}")

    filename = (body.filename or f"{(candidate_name or 'resume').strip().replace(' ', '_')}_{template_name}.pdf")

    # iOS Safari silently blocks `data:application/pdf;base64,...` URLs — they
    # appear to succeed with Linking.canOpenURL but nothing actually opens.
    # Instead, stash the PDF in an in-memory cache with a random token and
    # return a public URL to a GET endpoint that streams the bytes. Mobile
    # opens the URL with Linking.openURL, iOS renders natively with the
    # standard share/save sheet. Tokens expire after 10 minutes.
    if (request.query_params.get("raw") or "").lower() in ("1", "true", "yes"):
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    token = _stash_pdf(pdf_bytes, filename)
    # Build the absolute URL the mobile client should open
    base_url = str(request.base_url).rstrip("/")
    public_url = f"{base_url}/resume/export/{token}"
    return {
        "filename": filename,
        "mime": "application/pdf",
        "size_bytes": len(pdf_bytes),
        "url": public_url,
        "token": token,
        "template": template_name,
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


def _stash_pdf(pdf_bytes: bytes, filename: str) -> str:
    """Store PDF bytes in the in-memory cache and return a token."""
    token = _secrets.token_urlsafe(24)
    with _PDF_EXPORT_LOCK:
        # Opportunistic cleanup of expired entries
        now = _time.time()
        expired = [k for k, v in _PDF_EXPORT_CACHE.items() if now - v.get("ts", 0) > _PDF_EXPORT_TTL]
        for k in expired:
            _PDF_EXPORT_CACHE.pop(k, None)
        _PDF_EXPORT_CACHE[token] = {
            "bytes": pdf_bytes,
            "filename": filename,
            "ts": now,
        }
    return token


@router.get("/resume/export/{token}")
async def resume_export_fetch(token: str):
    """
    Public endpoint that streams a PDF from the transient cache. Called by the
    mobile client after it hits POST /resume/export and receives a token.
    No auth — the token is a cryptographically random 24-byte value that
    only the user who just generated it has seen.
    """
    with _PDF_EXPORT_LOCK:
        entry = _PDF_EXPORT_CACHE.get(token)
        if entry is None:
            raise HTTPException(status_code=404, detail="Export expired or invalid.")
        if _time.time() - entry.get("ts", 0) > _PDF_EXPORT_TTL:
            _PDF_EXPORT_CACHE.pop(token, None)
            raise HTTPException(status_code=410, detail="Export expired — regenerate.")

    return Response(
        content=entry["bytes"],
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{entry.get("filename", "resume.pdf")}"',
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

    cohort = body.cohort or _detect_cohort_from_job(job_title, job_company)

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

    # Load Dilly Profile facts
    profile_facts_text = ""
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = await asyncio.to_thread(get_memory_surface, email)
        facts = surface.get("items") or []
        narrative = (surface.get("narrative") or "").strip()
        if facts:
            cat_labels = {
                "achievement": "Achievements", "goal": "Goals", "target_company": "Target Companies",
                "skill_unlisted": "Unlisted Skills (not currently on resume, CAN be added)",
                "project_detail": "Additional Projects (not currently on resume, CAN be added)",
                "motivation": "Motivations", "personality": "Personality",
                "soft_skill": "Soft Skills", "hobby": "Interests",
                "life_context": "Background", "company_culture_pref": "Work Style Preferences",
                "strength": "Strengths", "weakness": "Growth Areas",
            }
            lines = []
            grouped: dict[str, list] = {}
            for f in facts:
                cat = f.get("category", "other")
                grouped.setdefault(cat, []).append(f)
            for cat, items in grouped.items():
                label = cat_labels.get(cat, cat.replace("_", " ").title())
                entries = "; ".join(f"{i['label']}: {i['value']}" for i in items[:6])
                lines.append(f"  {label}: {entries}")
            profile_facts_text = "\n".join(lines)
            if narrative:
                profile_facts_text = f"NARRATIVE: {narrative}\n\nFACTS:\n{profile_facts_text}"
    except Exception:
        pass

    # Serialize base resume as readable text for context
    base_resume_json = json.dumps(base_sections, separators=(",", ":")) if base_sections else "[]"
    # Truncate if too long
    if len(base_resume_json) > 12000:
        base_resume_json = base_resume_json[:12000] + "..."

    # Finance company modifier for tech roles
    company_l = job_company.lower()
    is_finance_company = any(kw in company_l for kw in _COMPANY_FINANCE_KEYWORDS)
    finance_note = ""
    if cohort == "Tech" and is_finance_company:
        finance_note = f"\nNOTE: {job_company} is a finance/banking firm. Even though this is a tech role, include GPA if ≥3.5, use a slightly more formal tone, and highlight any finance-domain knowledge."

    system_prompt = f"""You are Dilly's resume generation AI. Your job is to create a tailored resume in structured JSON format.

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
1. Rewrite the resume sections to be tailored specifically for this job at {job_company}.
2. Match keywords from the job description in bullets where truthful.
3. Reorder and emphasize experiences most relevant to this role.
4. You MAY incorporate "Unlisted Skills" and "Additional Projects" from the Dilly Profile if they are relevant to this job.
5. Keep ALL factual information accurate — do not invent companies, dates, degrees, or GPAs.
6. Every bullet must start with a strong action verb and include a metric where possible.
7. Use the {cohort} template conventions: {_get_cohort_tip(cohort)}
8. Keep the resume to one page worth of content.
9. Preserve the exact JSON structure of the input sections — same keys, same section types.

Return ONLY valid JSON — a JSON array of resume section objects matching this exact schema:
[
  {{"key": "contact", "label": "Contact", "contact": {{"name": "", "email": "", "phone": "", "location": "", "linkedin": ""}}}},
  {{"key": "education", "label": "Education", "education": {{"id": "", "university": "", "major": "", "minor": "", "graduation": "", "location": "", "honors": "", "gpa": ""}}}},
  {{"key": "professional_experience", "label": "Experience", "experiences": [{{"id": "", "company": "", "role": "", "date": "", "location": "", "bullets": [{{"id": "", "text": ""}}]}}]}},
  {{"key": "projects", "label": "Projects", "projects": [{{"id": "", "name": "", "date": "", "location": "", "tech": "", "bullets": [{{"id": "", "text": ""}}]}}]}},
  {{"key": "skills", "label": "Skills", "simple": {{"id": "", "lines": [""]}}}}
]
Include only sections that have content. Do not include markdown, explanations, or any text outside the JSON array."""

    async def stream_generate():
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
            async with client.messages.stream(
                model="claude-sonnet-4-5-20250929",
                max_tokens=4096,
                system=system_prompt,
                messages=[{"role": "user", "content": f"Generate a tailored resume for {job_title} at {job_company}. Return only the JSON array."}],
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as e:
            yield f"\n{{\"error\": \"{str(e)[:100]}\"}}"

    return StreamingResponse(stream_generate(), media_type="text/plain")


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
            model="claude-sonnet-4-5-20250929",
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
