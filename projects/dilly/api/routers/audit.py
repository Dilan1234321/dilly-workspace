"""Audit, badge, snapshot, leaderboard, peer stats, explain-delta, ready-check, generate-lines, interview-prep, career-playbook, audit/batch."""
import asyncio
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
import uuid
from typing import Any, Dict, List

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
# Four levels up: routers -> api -> dilly -> projects -> workspace root (same as api/*.py)
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

import logging

from fastapi import APIRouter, Request, UploadFile, File, Form, Body, HTTPException, Query
from fastapi.responses import Response
from projects.dilly.api import deps, errors
from projects.dilly.api.openapi_helpers import ERROR_RESPONSES
from projects.dilly.api.constants import (
    MAX_UPLOAD_BYTES,
    ERR_FILE_TYPE,
    ERR_FILE_TOO_BIG,
    ERR_EXTRACT,
    MIN_RESUME_WORDS,
    MAX_RESUME_WORDS,
    ERR_RESUME_TOO_SHORT,
    ERR_RESUME_TOO_LONG,
    ERR_RESUME_MISSING_SECTIONS,
    ERR_TIMEOUT,
    AUDIT_TIMEOUT_SEC,
    APPLICATION_TARGET_VALUES,
)
from projects.dilly.api.schemas import AuditResponse, AuditResponseV2, Benchmarks, AuditRecommendation
from projects.dilly.dilly_resume_auditor import DillyResumeAuditor
from dilly_core.llm_client import is_llm_available
from dilly_core.evidence_quotes import get_fallback_evidence_quotes
from projects.dilly.api.resume_loader import load_parsed_resume_for_voice as _load_parsed_resume_for_voice

router = APIRouter()
benchmarks = Benchmarks()

# Audit cache (TTL 24h)
_AUDIT_CACHE: dict[str, dict] = {}
_AUDIT_CACHE_TTL_SEC = 86400
_AUDIT_CACHE_MAX_ENTRIES = 500


def _validate_resume_for_audit(text_for_audit: str, parsed: Any) -> str | None:
    """Return None if OK; else consultant-style message for 400."""
    text = (text_for_audit or "").strip()
    words = len(text.split()) if text else 0
    if words < MIN_RESUME_WORDS:
        return ERR_RESUME_TOO_SHORT
    if words > MAX_RESUME_WORDS:
        return ERR_RESUME_TOO_LONG
    edu_block = (getattr(parsed, "education_block", None) or "").strip()
    sections = getattr(parsed, "sections", None) or {}
    edu_keys = ("education", "academic", "academics", "qualifications")
    exp_keys = ("experience", "work experience", "employment", "professional experience", "work history", "job experience")
    has_edu = bool(edu_block) or any((sections.get(k) or "").strip() for k in edu_keys)
    has_exp = any((sections.get(k) or "").strip() for k in exp_keys)
    if not has_edu and not has_exp:
        return ERR_RESUME_MISSING_SECTIONS
    return None


def _audit_cache_key(text: str, page_count: int | None = None, application_target: str | None = None) -> str:
    base = (text or "").encode("utf-8")
    if page_count is not None:
        base += f"|pages|{page_count}".encode("utf-8")
    if application_target:
        base += f"|target|{application_target}".encode("utf-8")
    return hashlib.sha256(base).hexdigest()


def _audit_cache_get(key: str) -> dict | None:
    entry = _AUDIT_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry.get("ts", 0) > _AUDIT_CACHE_TTL_SEC:
        _AUDIT_CACHE.pop(key, None)
        return None
    return entry.get("response")


def _audit_cache_set(key: str, response: dict) -> None:
    _AUDIT_CACHE[key] = {"response": response, "ts": time.time()}
    if len(_AUDIT_CACHE) > _AUDIT_CACHE_MAX_ENTRIES:
        by_ts = sorted(_AUDIT_CACHE.items(), key=lambda x: x[1].get("ts", 0))
        for k, _ in by_ts[: _AUDIT_CACHE_MAX_ENTRIES // 2]:
            _AUDIT_CACHE.pop(k, None)


def _write_audit_log(entry: dict) -> None:
    try:
        log_dir = os.path.join(_WORKSPACE_ROOT, "memory")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "dilly_audit_log.jsonl")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def _detect_track_for_audit(major: str, text: str) -> str:
    from dilly_core.auditor import get_track_from_major_and_text
    return get_track_from_major_and_text(major or "Unknown", text or "")


# ── Profile-Based Scoring (no resume required) ──────────────────────────────

PROFILE_SCORE_PROMPT = """You are the Dilly Scorer. You evaluate a student's professional readiness based on their Dilly Profile, which is everything Dilly knows about them: their education, experiences, skills, projects, goals, and anything they've shared.

You score three dimensions:
- Smart (0-100): Academic rigor, intellectual depth, relevant knowledge. GPA, major difficulty, honors, research, certifications, coursework.
- Grit (0-100): Leadership, impact, hustle. Roles held, quantifiable outcomes, work density, initiative, consistency.
- Build (0-100): Track-specific proof of readiness. For Tech: projects, deployments, tech stack. For Pre-Health: clinical hours, shadowing, research. For Business: deals, campaigns, strategy. For each field, what proves they can do the job.

RULES:
1. Only score based on information in the profile. Never invent or assume.
2. If a dimension has little evidence, score it low but explain what's missing.
3. Be specific: cite the exact fact, experience, or skill from the profile.
4. Be calibrated: a student with strong GPA + honors + research in a rigorous major should score Smart 70-85. A student who founded a company and led teams should score Grit 70-85.
5. The final_score uses cohort-specific weights (provided below).
6. Never use em dashes. Use hyphens, commas, or periods.

Output valid JSON only:
{
  "smart_score": number 0-100,
  "grit_score": number 0-100,
  "build_score": number 0-100,
  "final_score": number 0-100,
  "dilly_take": "Strength-first headline. Open with what's working, then the one thing that would raise their score most. Second person. 20-35 words.",
  "audit_findings": ["Smart: ...", "Grit: ...", "Build: ..."],
  "evidence": {"smart": "one sentence citing specific profile facts", "grit": "one sentence", "build": "one sentence"},
  "gaps": ["What Dilly doesn't know yet that would help score higher. 2-4 specific questions or missing info."],
  "recommendations": [{"type": "action", "title": "short label", "action": "concrete next step", "score_target": "Smart|Grit|Build"}]
}"""


def _build_profile_text_for_scoring(profile: dict, facts: list[dict]) -> str:
    """Assemble all profile data into a structured text block for the LLM scorer."""
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

    # Beyond resume (Voice-captured)
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


@router.post("/audit/profile-score")
async def audit_profile_score(request: Request, body: dict = Body(default={})):
    """Score the user's Dilly Profile. No resume upload required.
    Reads all profile facts and profile data, sends to LLM for S/G/B scoring.
    """
    user = deps.require_auth(request)
    email = user["email"]

    # Load profile + facts
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.memory_surface_store import get_items as get_facts

    profile = get_profile(email) or {}
    facts = get_facts(email)

    profile_text = _build_profile_text_for_scoring(profile, facts)

    if len(profile_text.split()) < 20:
        raise errors.bad_request(
            "Your Dilly Profile doesn't have enough information yet. "
            "Tell Dilly about your experiences, skills, and goals first."
        )

    # Detect cohort and build cohort-specific instruction
    major = profile.get("major") or "Unknown"
    track = _detect_track_for_audit(major, profile_text)
    cohort = body.get("cohort") or (profile.get("cohorts") or [None])[0] if profile.get("cohorts") else None

    # Get cohort weights if available
    weight_instruction = ""
    if cohort:
        try:
            from projects.dilly.api.cohort_scoring_weights import COHORT_WEIGHTS
            w = COHORT_WEIGHTS.get(cohort)
            if w:
                weight_instruction = (
                    f"\nCohort: {cohort}. "
                    f"Scoring weights: Smart={w['smart']}, Grit={w['grit']}, Build={w['build']}. "
                    f"Recruiter bar: {w.get('recruiter_bar', 70)}. "
                    f"Compute final_score as: {w['smart']}*smart + {w['grit']}*grit + {w['build']}*build."
                )
        except Exception:
            pass
    if not weight_instruction:
        weight_instruction = "\nUse default weights: final_score = 0.30*smart + 0.45*grit + 0.25*build."

    # Call LLM
    if not is_llm_available():
        raise errors.service_unavailable("AI scoring is not available right now.")

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            temperature=0.2,
            system=PROFILE_SCORE_PROMPT,
            messages=[{
                "role": "user",
                "content": (
                    f"Score this student's Dilly Profile. Track: {track}.{weight_instruction}\n\n"
                    f"---DILLY PROFILE---\n{profile_text[:12000]}\n---END---"
                ),
            }],
        )
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response(email, FEATURES.AUDIT, response,
                                        metadata={"track": track, "cohort": cohort})
        except Exception:
            pass
        raw = response.content[0].text
        # Parse JSON from response
        json_start = raw.find("{")
        json_end = raw.rfind("}") + 1
        if json_start == -1:
            raise ValueError("No JSON in response")
        result = json.loads(raw[json_start:json_end])
    except json.JSONDecodeError as e:
        logging.error(f"[profile-score] JSON parse error: {e}")
        raise errors.service_unavailable("Could not parse scoring response.")
    except Exception as e:
        logging.error(f"[profile-score] LLM error: {e}")
        raise errors.service_unavailable("AI scoring failed. Try again.")

    # Save scores to profile
    from projects.dilly.api.profile_store import save_profile
    scores_to_save = {
        "smart": result.get("smart_score", 0),
        "grit": result.get("grit_score", 0),
        "build": result.get("build_score", 0),
    }
    save_profile(email, {
        "overall_smart": scores_to_save["smart"],
        "overall_grit": scores_to_save["grit"],
        "overall_build": scores_to_save["build"],
        "overall_final": result.get("final_score", 0),
        "has_run_first_audit": True,
        "last_profile_score_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })

    # Also update cohort_scores if cohort is known
    if cohort:
        existing_cs = profile.get("cohort_scores") or {}
        if isinstance(existing_cs, str):
            try:
                existing_cs = json.loads(existing_cs)
            except Exception:
                existing_cs = {}
        existing_cs[cohort] = {
            "smart": scores_to_save["smart"],
            "grit": scores_to_save["grit"],
            "build": scores_to_save["build"],
            "final": result.get("final_score", 0),
            "level": "primary",
        }
        save_profile(email, {"cohort_scores": existing_cs})

    return {
        "scores": scores_to_save,
        "final_score": result.get("final_score", 0),
        "dilly_take": result.get("dilly_take", ""),
        "audit_findings": result.get("audit_findings", []),
        "evidence": result.get("evidence", {}),
        "gaps": result.get("gaps", []),
        "recommendations": result.get("recommendations", []),
        "track": track,
        "cohort": cohort,
        "profile_facts_count": len(facts),
        "scoring_method": "profile",
    }


def _allowed_resume_file(filename: str) -> bool:
    if not filename:
        return False
    return filename.lower().endswith((".pdf", ".docx"))


def _temp_extension(filename: str) -> str:
    return ".pdf" if (filename or "").lower().endswith(".pdf") else ".docx"


def _build_audit_supplementary_context(profile: dict) -> str | None:
    """
    Build a short text block from Voice-captured data for injection into the LLM auditor.
    Includes beyond_resume items (skills/tools/experiences told to Dilly) and experience_expansion
    (per-role deep-dive data). Returned as a string or None if nothing captured.
    """
    if not profile or not isinstance(profile, dict):
        return None
    parts: list[str] = []

    beyond = profile.get("beyond_resume")
    if isinstance(beyond, list) and beyond:
        by_type: dict[str, list[str]] = {"skill": [], "experience": [], "project": [], "person": [], "company": [], "event": [], "emotion": [], "other": []}
        for item in beyond:
            if not isinstance(item, dict):
                continue
            t = (item.get("type") or "other").strip().lower()
            if t not in by_type:
                t = "other"
            text = (item.get("text") or "").strip()[:150]
            if text:
                by_type[t].append(text)
        if by_type["person"]:
            parts.append("People (mentioned to Dilly): " + "; ".join(by_type["person"][:15]))
        if by_type["company"]:
            parts.append("Companies (mentioned to Dilly): " + "; ".join(by_type["company"][:15]))
        if by_type["event"]:
            parts.append("Dates/deadlines (mentioned to Dilly): " + "; ".join(by_type["event"][:10]))
        if by_type["skill"]:
            parts.append("Skills (mentioned to Dilly, not on resume): " + "; ".join(by_type["skill"][:20]))
        if by_type["project"]:
            parts.append("Projects (mentioned to Dilly): " + "; ".join(by_type["project"][:10]))
        if by_type["experience"]:
            parts.append("Experiences (mentioned to Dilly): " + "; ".join(by_type["experience"][:10]))
        if by_type["other"]:
            parts.append("Other info (mentioned to Dilly): " + "; ".join(by_type["other"][:8]))

    expansion = profile.get("experience_expansion")
    if isinstance(expansion, list) and expansion:
        for entry in expansion[:6]:
            if not isinstance(entry, dict):
                continue
            role = (entry.get("role_label") or "").strip()
            org = (entry.get("organization") or "").strip()
            label = f"{role} at {org}" if org else role
            if not label:
                continue
            sub: list[str] = []
            skills = [(s or "").strip()[:80] for s in (entry.get("skills") or []) if (s or "").strip()][:10]
            tools = [(t or "").strip()[:80] for t in (entry.get("tools_used") or []) if (t or "").strip()][:10]
            omitted = [(o or "").strip()[:120] for o in (entry.get("omitted") or []) if (o or "").strip()][:5]
            if skills:
                sub.append("skills used: " + ", ".join(skills))
            if tools:
                sub.append("tools/tech: " + ", ".join(tools))
            if omitted:
                sub.append("not on resume: " + "; ".join(omitted))
            if sub:
                parts.append(f"{label}: " + "; ".join(sub))

    if not parts:
        return None
    return "\n".join(parts)


def _infer_application_target_from_goals(goals: list) -> str | None:
    if not goals or not isinstance(goals, list):
        return "exploring"
    g = set((x or "").strip().lower() for x in goals)
    if "internship" in g:
        return "internship"
    if "gain_experience" in g:
        return "full_time"
    return "exploring"


@router.post("/audit", response_model=AuditResponse, summary="Legacy audit (use /audit/v2)")
async def audit_resume(request: Request, file: UploadFile = File(...)):
    """Legacy resume audit. Prefer /audit/v2 for full evidence and recommendations."""
    deps.require_subscribed(request)
    if not _allowed_resume_file(file.filename):
        raise errors.validation_error(ERR_FILE_TYPE)
    ext = _temp_extension(file.filename)
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"dilly_audit_{uuid.uuid4().hex}{ext}")
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    if os.path.getsize(temp_path) > MAX_UPLOAD_BYTES:
        os.remove(temp_path)
        raise errors.validation_error(ERR_FILE_TOO_BIG, status_code=413)
    try:
        auditor = DillyResumeAuditor(temp_path)
        if not auditor.extract_text():
            raise errors.internal(ERR_EXTRACT)
        auditor.analyze_content()
        text = auditor.raw_text
        from dilly_core.resume_parser import parse_resume
        from dilly_core.auditor import name_from_filename
        parsed = parse_resume(text, filename=file.filename)
        candidate_name = parsed.name
        if not candidate_name or candidate_name == "Unknown" or ("prediction" in candidate_name.lower() or "well-educated" in candidate_name.lower()):
            candidate_name = name_from_filename(file.filename) if file.filename else (candidate_name or "Unknown")
        major = parsed.major
        text_for_track = parsed.normalized_text or text
        track = _detect_track_for_audit(major, text_for_track)
        smart_raw = auditor.analysis["metrics"]["smart_score"]
        grit_raw = auditor.analysis["metrics"]["grit_score"]
        build_raw = auditor.analysis["metrics"]["build_score"]
        scores = {"smart": round(smart_raw, 1), "grit": round(grit_raw, 1), "build": round(build_raw, 1)}
        evidence = {
            "smart": f"Academic and institutional signals scored for {track}. Use /audit/v2 for evidence from rule engine + few-shot.",
            "grit": f"Leadership and impact markers evaluated. Use /audit/v2 for full evidence.",
            "build": f"Technical depth and project execution scored for {track}. Use /audit/v2 for full evidence.",
        }
        recs = benchmarks.get_recommendations(track, scores)
        return AuditResponse(
            candidate_name=candidate_name,
            detected_track=track,
            scores=scores,
            evidence=evidence,
            recommendations=recs,
            raw_logs=[f"Processed {file.filename}", f"Track detected: {track}", "Scores computed via Dual-Track Audit."],
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/audit/first-run", response_model=AuditResponseV2, responses=ERROR_RESPONSES)
async def audit_first_run(
    request: Request,
    file: UploadFile = File(...),
    user_email: str | None = Form(None),
    application_target: str | None = Form(None),
    cohort: str | None = Form(None),
    track: str | None = Form(None),  # backward compat
    industry_target: str | None = Form(None),
):
    """Unlimited audits for all authenticated users. No paywall on scoring."""
    user = deps.require_auth(request)
    request.state.first_run_bypass = True
    return await audit_resume_v2(request, file, user_email, application_target, cohort, track, industry_target)


@router.post("/audit/v2", response_model=AuditResponseV2, responses=ERROR_RESPONSES)
async def audit_resume_v2(
    request: Request,
    file: UploadFile = File(...),
    user_email: str | None = Form(None),
    application_target: str | None = Form(None),
    cohort: str | None = Form(None),
    track: str | None = Form(None),  # backward compat
    industry_target: str | None = Form(None),
):
    """Dilly Auditor V2. Starter users get blocked here; paid users
    can rerun as often as they want. (The /audit/first-run endpoint
    is separately unlocked for everyone — that's the one-shot
    onboarding audit that seeds the profile, gated by
    first_run_bypass which is set before this handler runs.)"""
    # Tier gate: starter is blocked from re-auditing. The onboarding
    # /audit/first-run path sets first_run_bypass=True before calling
    # us, which lets a brand-new starter user finish their one-shot
    # signup audit. Everything else requires a paid plan.
    if not getattr(request.state, "first_run_bypass", False):
        try:
            user = deps.require_auth(request)
            email = (user.get("email") or "").strip().lower()
            from projects.dilly.api.profile_store import get_profile as _gp
            _plan = ((_gp(email) or {}).get("plan") or "starter").lower().strip()
            if _plan == "starter":
                raise HTTPException(
                    status_code=402,
                    detail={
                        "code": "AUDIT_REQUIRES_PLAN",
                        "message": "Re-auditing your resume is a Dilly feature. Your first audit is free.",
                        "plan": _plan,
                        "required_plan": "dilly",
                        "features_unlocked": [
                            "Unlimited resume audits",
                            "Tailored resumes per role (30/mo)",
                            "Personalized fit narratives",
                            "Unlimited chat with Dilly",
                        ],
                    },
                )
        except HTTPException:
            raise
        except Exception:
            pass  # auth/profile errors fall through to the real handler
    try:
        return await _audit_resume_v2_impl(request, file, user_email, application_target, cohort, track, industry_target)
    except HTTPException:
        raise
    except Exception as _exc:
        import traceback as _tb
        sys.stderr.write(
            f"[audit_v2_crash] {type(_exc).__name__}: {str(_exc)[:300]}\n"
        )
        _tb.print_exc(file=sys.stderr)
        raise errors.internal(f"Audit failed: {type(_exc).__name__}: {str(_exc)[:200]}")


async def _audit_resume_v2_impl(
    request: Request,
    file: UploadFile,
    user_email: str | None,
    application_target: str | None,
    cohort: str | None,
    track: str | None,
    industry_target: str | None,
):
    deps.rate_limit(request, "audit-v2", max_requests=20, window_sec=300)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    # Resolve effective cohort: explicit cohort > backward-compat track param > profile lookup
    effective_cohort = (cohort or track or "").strip() or None
    if not effective_cohort and email:
        try:
            from projects.dilly.api.profile_store import get_profile
            from projects.dilly.api.cohort_config import assign_cohort
            _p = get_profile(email) or {}
            effective_cohort = _p.get("cohort") or assign_cohort(
                _p.get("majors") or ([_p.get("major")] if _p.get("major") else []),
                _p.get("pre_professional_track"),
                _p.get("industry_target") or industry_target,
            )
        except Exception:
            pass
    request.state.effective_cohort = effective_cohort or "General"
    request.state.industry_target = (industry_target or "").strip() or None
    if not _allowed_resume_file(file.filename):
        raise errors.validation_error(ERR_FILE_TYPE)
    ext = _temp_extension(file.filename)
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"dilly_audit_{uuid.uuid4().hex}{ext}")
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    if os.path.getsize(temp_path) > MAX_UPLOAD_BYTES:
        os.remove(temp_path)
        raise errors.validation_error(ERR_FILE_TOO_BIG, status_code=413)
    try:
        # Roll back to legacy parser path for stable major/track detection.
        auditor = DillyResumeAuditor(temp_path)
        extract_ok = auditor.extract_text()
        if not extract_ok:
            raise errors.internal(ERR_EXTRACT)
        text = auditor.raw_text
        if not auditor.analysis:
            auditor.analyze_content()
        from dilly_core.resume_parser import parse_resume
        parsed = parse_resume(text, filename=file.filename)
        from dilly_core.auditor import name_from_filename
        candidate_name = parsed.name
        if not candidate_name or candidate_name == "Unknown" or ("prediction" in candidate_name.lower() or "well-educated" in candidate_name.lower()):
            candidate_name = name_from_filename(file.filename) if file.filename else (candidate_name or "Unknown")
        major = parsed.major
        gpa = parsed.gpa
        if email:
            try:
                from projects.dilly.api.profile_store import get_profile
                from dilly_core.transcript_parser import GPA_MIN, GPA_MAX
                profile_for_transcript = get_profile(email)
                tg = profile_for_transcript.get("transcript_gpa")
                if tg is not None:
                    try:
                        gpa_val = float(tg)
                        if GPA_MIN <= gpa_val <= GPA_MAX:
                            gpa = gpa_val
                    except (TypeError, ValueError):
                        pass
                # Override with user-set identity when present (profile overrides resume-parsed)
                if profile_for_transcript:
                    if (profile_for_transcript.get("name") or "").strip():
                        candidate_name = (profile_for_transcript.get("name") or "").strip()
                    if (profile_for_transcript.get("major") or "").strip():
                        major = (profile_for_transcript.get("major") or "").strip()
                    elif isinstance(profile_for_transcript.get("majors"), list) and profile_for_transcript.get("majors"):
                        first_major = (profile_for_transcript.get("majors")[0] or "").strip()
                        if first_major:
                            major = first_major
            except ImportError:
                pass
        text_for_audit = parsed.normalized_text or text
        from dilly_core.structured_resume import get_email_from_parsed
        _login_email = (email or "").strip().lower() if email else None
        _resume_email = get_email_from_parsed(parsed)
        file_key = _login_email or _resume_email or (candidate_name if candidate_name and candidate_name != "Unknown" else None) or (user_email and user_email.strip()) or "Unknown"
        structured_text = None
        use_llm = os.environ.get("DILLY_USE_LLM", "").strip().lower() in ("1", "true", "yes")
        _parsed_resumes_dir = os.path.join(_WORKSPACE_ROOT, "projects", "dilly", "parsed_resumes")
        _parsed_resume_path = None
        _old_path_to_remove: str | None = None
        try:
            os.makedirs(_parsed_resumes_dir, exist_ok=True)
            from dilly_core.structured_resume import (
                write_parsed_resume,
                build_structured_resume_text,
                safe_filename_from_key,
                read_parsed_resume,
                get_name_from_parsed_resume_content,
            )
            _existing_name: str | None = None
            _target_path = os.path.join(_parsed_resumes_dir, safe_filename_from_key(file_key))
            if _login_email and _resume_email and safe_filename_from_key(_resume_email) != safe_filename_from_key(_login_email):
                _old_path_to_remove = os.path.join(_parsed_resumes_dir, safe_filename_from_key(_resume_email))
            for _read_path in (_target_path, _old_path_to_remove) if _old_path_to_remove else (_target_path,):
                if _read_path and os.path.isfile(_read_path):
                    try:
                        _existing_content = read_parsed_resume(_read_path)
                        _n = get_name_from_parsed_resume_content(_existing_content)
                        if _n and len(_n.split()) >= len((candidate_name or "").split()):
                            _existing_name = _n
                            break
                    except Exception:
                        pass
            def _name_for_placeholder() -> str:
                if _existing_name:
                    return _existing_name
                if parsed.name and parsed.name.strip() and parsed.name != "Unknown" and "[Full Name]" not in parsed.name:
                    return parsed.name.strip()
                if candidate_name and candidate_name.strip() and candidate_name != "Unknown":
                    return candidate_name.strip()
                if file_key and "@" in file_key:
                    local = file_key.split("@")[0].strip()
                    local = re.sub(r"[^\w.\-]", " ", local)
                    parts = [p.strip().capitalize() for p in local.replace(".", " ").split() if p.strip()]
                    if parts:
                        return " ".join(parts)
                return "Unknown"
            if use_llm and is_llm_available():
                from dilly_core.llm_structured_resume import normalize_resume_with_llm
                normalized = normalize_resume_with_llm(parsed)
                if normalized and normalized.strip():
                    name_fill = _name_for_placeholder()
                    if name_fill != "Unknown" and "[Full Name]" in normalized:
                        normalized = normalized.replace("[Full Name]", name_fill)
                    if not re.search(r"^Name\s*:\s*", normalized.strip(), re.IGNORECASE):
                        normalized = "Name: " + name_fill + "\n\n" + normalized
                    filename = safe_filename_from_key(file_key)
                    filepath = os.path.join(_parsed_resumes_dir, filename)
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(normalized)
                    structured_text = normalized
                    _parsed_resume_path = filepath
                    sys.stderr.write(f"Dilly: saved parsed resume -> {filepath}\n")
                else:
                    written = write_parsed_resume(parsed, file_key, base_dir=_parsed_resumes_dir, display_name_override=_existing_name)
                    structured_text = build_structured_resume_text(parsed, display_name_override=_existing_name)
                    _parsed_resume_path = written
                    sys.stderr.write(f"Dilly: saved parsed resume -> {written}\n")
            else:
                written = write_parsed_resume(parsed, file_key, base_dir=_parsed_resumes_dir, display_name_override=_existing_name)
                structured_text = build_structured_resume_text(parsed, display_name_override=_existing_name)
                _parsed_resume_path = written
                sys.stderr.write(f"Dilly: saved parsed resume -> {written}\n")
            if _old_path_to_remove and os.path.isfile(_old_path_to_remove):
                try:
                    os.remove(_old_path_to_remove)
                    sys.stderr.write(f"Dilly: removed old parsed resume (migrated to login key) -> {_old_path_to_remove}\n")
                except Exception:
                    pass
        except Exception as e:
            import traceback
            sys.stderr.write(f"Dilly: failed to save parsed resume (key={file_key!r}): {e}\n")
            traceback.print_exc()
        text_for_audit = (structured_text or text_for_audit) if use_llm and structured_text else text_for_audit
        edge_err = _validate_resume_for_audit(text_for_audit, parsed)
        if edge_err:
            raise errors.validation_error(edge_err)
        page_count_for_cache = getattr(auditor, "page_count", None)
        resolved_application_target = (application_target or "").strip() or None
        if resolved_application_target not in APPLICATION_TARGET_VALUES:
            resolved_application_target = None
        audit_supplementary_context: str | None = None
        resolved_application_target_label: str | None = None
        if not resolved_application_target and email:
            try:
                from projects.dilly.api.profile_store import get_profile
                profile = get_profile(email)
                if profile:
                    resolved_application_target = (profile.get("application_target") or "").strip() or None
                    if resolved_application_target not in APPLICATION_TARGET_VALUES:
                        resolved_application_target = _infer_application_target_from_goals(profile.get("goals") or [])
                    resolved_application_target_label = (profile.get("application_target_label") or "").strip() or None
                    # Build supplementary context from Voice-captured data so the auditor sees the full picture
                    audit_supplementary_context = _build_audit_supplementary_context(profile)
            except Exception:
                resolved_application_target = "exploring"
        elif email:
            try:
                from projects.dilly.api.profile_store import get_profile
                _sup_profile = get_profile(email)
                if _sup_profile:
                    audit_supplementary_context = _build_audit_supplementary_context(_sup_profile)
                    resolved_application_target_label = (_sup_profile.get("application_target_label") or "").strip() or None
            except Exception:
                pass
        if not resolved_application_target:
            resolved_application_target = "exploring"
        cache_key = _audit_cache_key(text_for_audit, page_count_for_cache, resolved_application_target)
        cached = _audit_cache_get(cache_key)
        if cached is not None:
            cached_with_target = {**cached, "application_target": resolved_application_target}
            return AuditResponseV2(**cached_with_target)
        def _run_audit_sync(app_target: str | None, supp: str | None = audit_supplementary_context):
            from dilly_core.auditor import run_audit
            rule_result = run_audit(
                text_for_audit,
                candidate_name=candidate_name,
                major=major,
                gpa=gpa,
                filename=file.filename,
            )
            if use_llm and is_llm_available():
                from dilly_core.llm_auditor import run_audit_llm
                from dilly_core.auditor import AuditorResult
                llm_result = run_audit_llm(
                    text_for_audit,
                    candidate_name=candidate_name,
                    major=major,
                    gpa=gpa,
                    fallback_to_rules=True,
                    filename=file.filename,
                    application_target=app_target,
                    application_target_label=resolved_application_target_label,
                    supplementary_context=supp,
                )
                # Option A: scores from rule-based engine only; narrative/recs from LLM
                return AuditorResult(
                    candidate_name=llm_result.candidate_name,
                    major=llm_result.major,
                    track=rule_result.track,
                    smart_score=rule_result.smart_score,
                    grit_score=rule_result.grit_score,
                    build_score=rule_result.build_score,
                    final_score=rule_result.final_score,
                    audit_findings=llm_result.audit_findings or [],
                    evidence_smart=llm_result.evidence_smart or [],
                    evidence_grit=llm_result.evidence_grit or [],
                    evidence_build=llm_result.evidence_build or [],
                    evidence_smart_display=llm_result.evidence_smart_display,
                    evidence_grit_display=llm_result.evidence_grit_display,
                    evidence_build_display=llm_result.evidence_build_display,
                    evidence_quotes=llm_result.evidence_quotes,
                    recommendations=llm_result.recommendations,
                    dilly_take=getattr(llm_result, "dilly_take", None),
                )
            return rule_result
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(_run_audit_sync, resolved_application_target),
                timeout=AUDIT_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError:
            raise errors.http_exception(504, ERR_TIMEOUT, "TIMEOUT")

        # ─────────────────────────────────────────────────────────────────
        # RUBRIC CUTOVER (Tier 2, 2026-04-08)
        #
        # After the legacy auditor runs, score the resume against the
        # student's active cohort rubrics and REPLACE the legacy scores
        # with the rubric output. The `result` dataclass is mutated in
        # place so the rest of the audit response machinery (scores dict,
        # audit_findings, dilly_take, AuditResponseV2 construction) picks
        # up the new values without further changes.
        #
        # The rich rubric analysis (matched/unmatched signals, fastest
        # path moves, per-cohort scores) is captured in
        # `rubric_analysis_payload` and attached to the response below
        # as the new `rubric_analysis` field.
        #
        # If rubric scoring fails for ANY reason, we fall back to the
        # legacy `result` unchanged and log the failure to stderr. No
        # student ever sees a broken audit because of rubric issues.
        # ─────────────────────────────────────────────────────────────────
        rubric_analysis_payload = None
        try:
            from dilly_core.rubric_scorer import (
                select_cohorts_for_student,
                score_for_cohorts,
                build_rubric_analysis_payload,
                rubric_to_legacy_shape,
            )
            from dilly_core.scoring import extract_scoring_signals as _rc_extract_signals

            # Fetch student profile for minors / pre-prof / industry target
            _rc_minors = []
            _rc_pre_prof = None
            _rc_industry = industry_target
            if email:
                try:
                    from projects.dilly.api.profile_store import get_profile as _rc_get_profile
                    _rc_profile = _rc_get_profile(email) or {}
                    _rc_minors = _rc_profile.get("minors") or []
                    _rc_pre_prof = _rc_profile.get("pre_professional_track")
                    if not _rc_industry:
                        _rc_industry = _rc_profile.get("industry_target")
                except Exception:
                    pass

            # Select which cohorts to score this student against
            _rc_cohorts = select_cohorts_for_student(
                major=major or parsed.major or "",
                minors=_rc_minors,
                pre_professional_track=_rc_pre_prof,
                industry_target=_rc_industry,
            )

            if _rc_cohorts:
                _rc_text = text_for_audit or text or ""
                _rc_signals = _rc_extract_signals(
                    _rc_text,
                    gpa=gpa,
                    major=major or "",
                )
                _rc_scores = score_for_cohorts(_rc_signals, _rc_text, _rc_cohorts)

                if _rc_scores:
                    _rc_primary_cid = _rc_cohorts[0]
                    _rc_primary = _rc_scores.get(_rc_primary_cid)

                    if _rc_primary is not None:
                        # Overwrite legacy scores with rubric scores on the
                        # result dataclass (mutable). Downstream machinery
                        # picks these up automatically.
                        result.smart_score = _rc_primary.smart
                        result.grit_score = _rc_primary.grit
                        result.build_score = _rc_primary.build
                        result.final_score = _rc_primary.composite
                        result.track = _rc_primary_cid

                        # Generate audit_findings + dilly_take from the
                        # rubric translator so the narrative copy reflects
                        # the new scoring.
                        _rc_legacy = rubric_to_legacy_shape(
                            _rc_primary,
                            candidate_name=candidate_name or "Unknown",
                            major=major or parsed.major or "",
                        )
                        result.audit_findings = _rc_legacy.get("audit_findings") or result.audit_findings
                        result.dilly_take = _rc_legacy.get("dilly_take") or getattr(result, "dilly_take", None)

                        # Build the rich rubric_analysis payload for the response
                        rubric_analysis_payload = build_rubric_analysis_payload(
                            _rc_primary_cid,
                            _rc_scores,
                        )

                        sys.stderr.write(
                            f"[rubric_cutover] email={email[:6]+'***' if email and '@' in email else 'none'} "
                            f"primary={_rc_primary_cid} composite={_rc_primary.composite:.1f} "
                            f"S={_rc_primary.smart:.0f}/G={_rc_primary.grit:.0f}/B={_rc_primary.build:.0f} "
                            f"cohorts_scored={len(_rc_scores)}\n"
                        )
        except Exception as _rc_exc:
            import traceback as _rc_tb
            sys.stderr.write(
                f"[rubric_cutover_failed] email={email[:6]+'***' if email and '@' in email else 'none'} "
                f"exc={type(_rc_exc).__name__}: {str(_rc_exc)[:200]}\n"
            )
            try:
                _rc_tb.print_exc(file=sys.stderr)
            except Exception:
                pass
            # Fall through: leave result unchanged, rubric_analysis_payload stays None

        if _parsed_resume_path and result.track:
            try:
                from dilly_core.structured_resume import update_parsed_resume_cohort
                update_parsed_resume_cohort(_parsed_resume_path, result.track)
            except Exception as e:
                sys.stderr.write(f"Dilly: failed to update cohort in parsed resume: {e}\n")
        scores = {
            "smart": result.smart_score,
            "grit": result.grit_score,
            "build": result.build_score,
        }
        from dilly_core.auditor import (
            get_rule_based_recommendations,
            get_fallback_line_edits_for_low_scores,
            _weave_snippet_into_sentence,
            _is_low_quality_evidence,
            _default_evidence_sentence,
        )
        evidence_smart_display = getattr(result, "evidence_smart_display", None)
        evidence_grit_display = getattr(result, "evidence_grit_display", None)
        evidence_build_display = getattr(result, "evidence_build_display", None)
        def already_woven(text: str) -> bool:
            t = (text or "").strip()
            return t.startswith("You demonstrated ") or t.startswith("You showcased ")
        def grit_malformed(text: str) -> bool:
            t = (text or "").strip()
            return "by present" in t or "your role as a The" in t or (", NY" in t and "Co-Founder" in t)
        if evidence_grit_display and (" ● " in evidence_grit_display or " | " in evidence_grit_display or grit_malformed(evidence_grit_display)):
            if not already_woven(evidence_grit_display) or grit_malformed(evidence_grit_display):
                evidence_grit_display = _weave_snippet_into_sentence("grit", "You demonstrated leadership and impact through ", evidence_grit_display, result.track)
        if evidence_smart_display and not already_woven(evidence_smart_display) and (" ● " in evidence_smart_display or ("honors" in evidence_smart_display.lower() and "through " not in evidence_smart_display)):
            evidence_smart_display = _weave_snippet_into_sentence("smart", "You showcased high academic standard through ", evidence_smart_display, result.track)
        if evidence_build_display and not already_woven(evidence_build_display) and " ● " in evidence_build_display:
            evidence_build_display = _weave_snippet_into_sentence("build", f"You demonstrated {result.track} readiness through ", evidence_build_display, result.track)
        def tail_low_quality(ev: str) -> bool:
            if not ev or not ev.strip():
                return True
            t = ev.strip()
            if " through ." in t or t.endswith(" through ."):
                return True
            if "through " in t:
                tail = t.split("through ", 1)[-1].strip().rstrip(".")
                if _is_low_quality_evidence(tail) or "_" * 3 in tail:
                    return True
            return False
        evidence = {
            "smart": evidence_smart_display if evidence_smart_display and not tail_low_quality(evidence_smart_display) else _default_evidence_sentence("smart", result.track),
            "grit": evidence_grit_display if evidence_grit_display and not tail_low_quality(evidence_grit_display) else _default_evidence_sentence("grit", result.track),
            "build": evidence_build_display if evidence_build_display and not tail_low_quality(evidence_build_display) else _default_evidence_sentence("build", result.track),
        }
        recs = []
        for r in get_rule_based_recommendations(result.track, result.major, text_for_audit):
            recs.append(AuditRecommendation(
                type=r.get("type") or "generic",
                title=r["title"],
                action=r["action"],
                current_line=r.get("current_line"),
                suggested_line=r.get("suggested_line"),
                score_target=r.get("score_target"),
                diagnosis=r.get("diagnosis"),
            ))
        if result.recommendations:
            for r in result.recommendations:
                rec_dict = r if isinstance(r, dict) else {}
                recs.append(AuditRecommendation(
                    type=rec_dict.get("type") or "generic",
                    title=rec_dict.get("title") or "Recommendation",
                    action=rec_dict.get("action") or "",
                    current_line=rec_dict.get("current_line"),
                    suggested_line=rec_dict.get("suggested_line"),
                    score_target=rec_dict.get("score_target"),
                    diagnosis=rec_dict.get("diagnosis"),
                ))
            recs_source = f"Rule-based + personalized: {len(recs)}"
        else:
            recs.extend(benchmarks.get_recommendations(result.track, scores))
            recs_source = "Rule-based + benchmark" if len(recs) > 0 else "Benchmark recommendations (generic)"
        has_line_edit = any((getattr(r, "type", None) or "generic") == "line_edit" for r in recs)
        if not has_line_edit and (result.grit_score < 50 or result.build_score < 50):
            fallback = get_fallback_line_edits_for_low_scores(
                text_for_audit,
                result.track,
                result.smart_score,
                result.grit_score,
                result.build_score,
                max_recs=5,
            )
            for r in fallback:
                recs.append(AuditRecommendation(
                    type=r.get("type") or "generic",
                    title=r["title"],
                    action=r["action"],
                    current_line=r.get("current_line"),
                    suggested_line=r.get("suggested_line"),
                    score_target=r.get("score_target"),
                    diagnosis=r.get("diagnosis"),
                ))
            if fallback:
                recs_source = (recs_source or "Recommendations") + " + fallback line edits (low score)"
        try:
            from dilly_core.training_append import append_audit_to_training
            append_audit_to_training(text, result, filename=file.filename or "upload.pdf")
        except Exception:
            pass
        raw_logs = [
            f"Processed {file.filename}",
            f"Track: {result.track}",
            "LLM Auditor (MTS)." if use_llm and is_llm_available() else "Dilly Core V6.5 + Vantage Alpha.",
            recs_source,
        ]
        if result.track == "Pre-Health":
            raw_logs.append("Medical school readiness: BCPM, clinical hours, research, and leadership are scored for Pre-Health.")
        consistency_findings: List[str] = []
        if text_for_audit and "[EDUCATION]" in text_for_audit:
            try:
                from dilly_core.resume_consistency import run_consistency_checks
                consistency_findings = run_consistency_checks(text_for_audit)
            except Exception:
                pass
        red_flags_list: List[Any] = []
        if text_for_audit:
            try:
                from dilly_core.red_flags import run_red_flags
                page_count = getattr(auditor, "page_count", None)
                red_flags_list = run_red_flags(text_for_audit, raw_text_for_length=text, page_count=page_count)
            except Exception:
                pass
        try:
            from dilly_core.anomaly import get_red_flags as get_anomaly_flags
            anomaly_flags = get_anomaly_flags(parsed.gpa, scores, result.track)
            red_flags_list = list(red_flags_list) + anomaly_flags
        except Exception:
            pass
        peer_percentiles = None
        peer_cohort_n = 0
        peer_fallback_all = False
        try:
            from projects.dilly.api.peer_benchmark import get_peer_percentiles
            pct, cohort_n, use_fallback = get_peer_percentiles(result.track, scores)
            peer_percentiles = pct
            peer_cohort_n = cohort_n
            peer_fallback_all = use_fallback
        except Exception:
            pass
        benchmark_copy: Dict[str, str] = {}
        try:
            track_bench = benchmarks.data.get(result.track) or benchmarks.data.get("Humanities") or {}
            for dim_key, dim_label in [("smart", "Smart"), ("grit", "Grit"), ("build", "Build")]:
                bar = (track_bench.get(dim_label) or {}).get("tier_1")
                if bar is not None:
                    val = scores.get(dim_key, 0)
                    if val >= bar:
                        benchmark_copy[dim_key] = f"At/above bar ({int(bar)})"
                    else:
                        benchmark_copy[dim_key] = f"Below bar ({int(bar)})"
        except Exception:
            pass
        display_name = result.candidate_name
        if _parsed_resume_path:
            try:
                from dilly_core.structured_resume import read_parsed_resume, get_name_from_parsed_resume_content
                file_content = read_parsed_resume(_parsed_resume_path)
                name_from_file = get_name_from_parsed_resume_content(file_content)
                if name_from_file:
                    display_name = name_from_file
            except Exception:
                pass
        evidence_quotes = dict(getattr(result, "evidence_quotes", None) or {})
        if text_for_audit:
            fallback = get_fallback_evidence_quotes(text_for_audit)
            for dim in ("smart", "grit", "build"):
                if not evidence_quotes.get(dim) and fallback.get(dim):
                    evidence_quotes[dim] = fallback[dim]
        strongest_dim = max(
            [("smart", scores.get("smart", 0)), ("grit", scores.get("grit", 0)), ("build", scores.get("build", 0))],
            key=lambda x: x[1],
        )[0]
        dim_label = strongest_dim.capitalize()
        ev_sentence = (evidence.get(strongest_dim) or "").strip()
        if ev_sentence and len(ev_sentence) > 120:
            ev_sentence = ev_sentence[:117].rsplit(" ", 1)[0] + "..."
        strongest_signal_sentence = (
            f"Your strongest signal to recruiters right now is {dim_label}—{ev_sentence}."
            if ev_sentence
            else None
        )
        response = AuditResponseV2(
            candidate_name=display_name,
            detected_track=result.track,
            major=result.major,
            scores=scores,
            final_score=result.final_score,
            audit_findings=result.audit_findings,
            evidence=evidence,
            evidence_quotes=evidence_quotes if evidence_quotes else None,
            recommendations=recs,
            raw_logs=raw_logs,
            dilly_take=getattr(result, "dilly_take", None),
            strongest_signal_sentence=strongest_signal_sentence,
            consistency_findings=consistency_findings if consistency_findings else None,
            red_flags=red_flags_list if red_flags_list else None,
            peer_percentiles=peer_percentiles,
            peer_cohort_n=peer_cohort_n if peer_percentiles and peer_cohort_n else None,
            peer_fallback_all=peer_fallback_all if peer_percentiles else None,
            benchmark_copy=benchmark_copy if benchmark_copy else None,
            application_target=resolved_application_target,
            resume_text=text_for_audit or text or None,
            structured_text=structured_text or None,
            page_count=getattr(auditor, "page_count", None),
            rubric_analysis=rubric_analysis_payload,
        )
        try:
            _audit_cache_set(cache_key, response.model_dump())
            _write_audit_log({
                "track": result.track,
                "smart": scores["smart"],
                "grit": scores["grit"],
                "build": scores["build"],
                "final": result.final_score,
                "ts": time.time(),
                "use_for_fewshot": False,
            })
        except Exception:
            pass
        try:
            from projects.dilly.api.audit_history import append_audit, get_audits
            from projects.dilly.api.profile_store import get_profile, save_profile
            audit_id = uuid.uuid4().hex
            full_audit_dict = response.model_dump() if hasattr(response, "model_dump") else response.dict()
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
                        "scores": {
                            "smart": scores.get("smart", 0),
                            "grit": scores.get("grit", 0),
                            "build": scores.get("build", 0),
                        },
                        "ts": full_audit_dict["ts"],
                    }
                })
            profile = get_profile(email)
            if profile and not (profile.get("name") or "").strip():
                candidate_name = (full_audit_dict.get("candidate_name") or "").strip()
                if candidate_name:
                    save_profile(email, {"name": candidate_name})
            profile = get_profile(email)
            if profile and profile.get("parent_email") and profile.get("parent_milestone_opt_in"):
                try:
                    from projects.dilly.api.email_sender import send_milestone_to_parent
                    student_name = profile.get("name") or full_audit_dict.get("candidate_name") or "Your student"
                    if len(audits_before) == 0:
                        send_milestone_to_parent(profile["parent_email"], student_name, "first_audit")
                except Exception:
                    pass
            try:
                from projects.dilly.api.candidate_index import index_candidate_after_audit
                profile_for_index = get_profile(email)
                resume_for_index = _load_parsed_resume_for_voice(email, max_chars=50000)
                index_candidate_after_audit(email, profile=profile_for_index, audit=full_audit_dict, resume_text=resume_for_index or None)
            except Exception:
                pass
            try:
                from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
                write_dilly_profile_txt(email)
            except Exception:
                pass
            # Sync audit scores to PostgreSQL so GET /profile returns them immediately
            try:
                import psycopg2, psycopg2.extras, json as _json
                _scores = full_audit_dict.get("scores") or {}
                _track = full_audit_dict.get("detected_track") or result.track
                _smart = float(_scores.get("smart", 0))
                _grit = float(_scores.get("grit", 0))
                _build = float(_scores.get("build", 0))
                _dilly = float(full_audit_dict.get("final_score", 0))
                # Build full per-cohort scores keyed by RICH cohort name so the
                # legacy internships pipeline (cohort_requirements JSONB +
                # match_scores) can compare per-cohort student strengths to
                # per-cohort job requirements. Falls back to legacy single-track
                # shape if rubric_analysis is unavailable.
                _cohort_scores = {}
                _ra = full_audit_dict.get("rubric_analysis") or {}
                try:
                    from dilly_core.rubric_scorer import RUBRIC_TO_RICH_COHORT
                except Exception:
                    RUBRIC_TO_RICH_COHORT = {}
                _primary_id = _ra.get("primary_cohort_id")
                _primary_rich = RUBRIC_TO_RICH_COHORT.get(_primary_id) if _primary_id else None
                if _primary_rich:
                    _cohort_scores[_primary_rich] = {
                        "smart": float(_ra.get("primary_smart") or _smart),
                        "grit":  float(_ra.get("primary_grit")  or _grit),
                        "build": float(_ra.get("primary_build") or _build),
                        "level": "primary",
                    }
                for _oc in (_ra.get("other_cohorts") or []):
                    _rich = RUBRIC_TO_RICH_COHORT.get(_oc.get("cohort_id"))
                    if not _rich or _rich in _cohort_scores:
                        continue
                    _cohort_scores[_rich] = {
                        "smart": float(_oc.get("smart") or 0),
                        "grit":  float(_oc.get("grit")  or 0),
                        "build": float(_oc.get("build") or 0),
                        "level": "secondary",
                    }
                if not _cohort_scores and _track:
                    _cohort_scores = {
                        _track: {
                            "smart": _smart,
                            "grit": _grit,
                            "build": _build,
                            "level": "primary",
                        }
                    }
                # Use rich cohort name for students.cohort so internships query
                # can match against cohort_requirements JSONB
                _student_cohort = _primary_rich or _track
                _pw = os.environ.get("DILLY_DB_PASSWORD", "")
                if not _pw:
                    try: _pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
                    except: pass
                _conn = psycopg2.connect(
                    host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
                    database="dilly", user="dilly_admin", password=_pw, sslmode="require"
                )
                _cur = _conn.cursor()
                _cur.execute("""
                    INSERT INTO students (
                        email, name, track, cohort, cohort_scores,
                        smart_score, grit_score, build_score, dilly_score,
                        overall_smart, overall_grit, overall_build, overall_dilly_score,
                        latest_audit_id, has_run_first_audit
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                    ON CONFLICT (email) DO UPDATE SET
                        name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE students.name END,
                        track = COALESCE(EXCLUDED.track, students.track),
                        cohort = COALESCE(EXCLUDED.cohort, students.cohort),
                        cohort_scores = EXCLUDED.cohort_scores,
                        smart_score = EXCLUDED.smart_score,
                        grit_score = EXCLUDED.grit_score,
                        build_score = EXCLUDED.build_score,
                        dilly_score = EXCLUDED.dilly_score,
                        overall_smart = EXCLUDED.overall_smart,
                        overall_grit = EXCLUDED.overall_grit,
                        overall_build = EXCLUDED.overall_build,
                        overall_dilly_score = EXCLUDED.overall_dilly_score,
                        latest_audit_id = EXCLUDED.latest_audit_id,
                        has_run_first_audit = TRUE
                """, (
                    email,
                    full_audit_dict.get("candidate_name") or "",
                    _track or None,
                    _student_cohort or None,
                    _json.dumps(_cohort_scores),
                    _smart, _grit, _build, _dilly,
                    _smart, _grit, _build, _dilly,
                    audit_id,
                ))
                _conn.commit()
                _conn.close()
                # Trigger match score computation for this student in background
                # so the jobs feed is populated immediately after onboarding.
                try:
                    import threading as _threading
                    _student_email_for_match = email
                    def _compute_matches_bg():
                        try:
                            import sys as _sys, os as _os, json as _json2, uuid as _uuid2
                            _sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..', '..'))
                            import psycopg2 as _pg2, psycopg2.extras as _extras2
                            from projects.dilly.match_engine import compute_matches_for_student as _cms
                            _mpw = _os.environ.get("DILLY_DB_PASSWORD", "")
                            if not _mpw:
                                try: _mpw = open(_os.path.expanduser("~/.dilly_db_pass")).read().strip()
                                except: pass
                            _mc = _pg2.connect(
                                host=_os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
                                database="dilly", user="dilly_admin", password=_mpw, sslmode="require"
                            )
                            _mcur = _mc.cursor(cursor_factory=_extras2.DictCursor)
                            _mcur.execute("SELECT * FROM students WHERE email = %s", (_student_email_for_match,))
                            _student_row = _mcur.fetchone()
                            if _student_row:
                                _matches, _ = _cms(_mc, _student_row)
                                _mcur.execute("DELETE FROM match_scores WHERE student_id = %s", (_student_row["id"],))
                                for _m in _matches:
                                    _mcur.execute(
                                        """INSERT INTO match_scores (id, student_id, internship_id, rank_score,
                                            readiness, cohort_readiness, location_score, work_mode_score, compensation_score)
                                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                                        (str(_uuid2.uuid4()), _m["student_id"], _m["internship_id"], _m["rank_score"],
                                         _m["readiness"], _json2.dumps(_m["cohort_readiness"]),
                                         _m["location_score"], _m["work_mode_score"], _m["compensation_score"])
                                    )
                                _mc.commit()
                            _mc.close()
                        except Exception:
                            pass
                    _threading.Thread(target=_compute_matches_bg, daemon=True).start()
                except Exception:
                    pass

                # Cohort scoring DISABLED: the S/G/B per-cohort framework
                # isn't user-visible anymore (we show fit narratives, not
                # scores). Keeping the call removed saves a Haiku call per
                # audit. cohort_scorer.py remains importable but is no
                # longer invoked from any hot path.
                #
                # If we ever need per-cohort aggregate stats again, revive
                # by uncommenting — but prefer embeddings (see build 251).
            except Exception:
                pass
            response = response.model_copy(update={"id": audit_id}) if hasattr(response, "model_copy") else response

            # Background: extract profile facts from resume text so the Dilly Profile
            # is populated immediately after onboarding (user doesn't have to talk to Dilly first).
            is_first_run = getattr(request.state, "first_run_bypass", False)
            if is_first_run and email and text:
                import threading as _threading
                _extract_email = email
                _extract_text = text[:8000]
                _extract_name = candidate_name or ""
                def _seed_profile_facts_bg():
                    try:
                        import anthropic, json as _j
                        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
                        if not api_key:
                            return
                        client = anthropic.Anthropic(api_key=api_key)
                        resp = client.messages.create(
                            model="claude-haiku-4-5-20251001",
                            max_tokens=2000,
                            temperature=0.2,
                            system=(
                                "Extract profile facts from this resume. Return JSON array of objects. "
                                "Each object: {\"category\": \"...\", \"label\": \"short title\", \"value\": \"detail\", \"confidence\": \"high\" or \"medium\"}. "
                                "Categories: skill_unlisted (technical skills), soft_skill (interpersonal), "
                                "achievement (accomplishments with impact), experience (roles held), "
                                "project_detail (projects built), education (degrees/certs), goal (career goals). "
                                "Extract 15-25 facts. Be specific. Cite real details from the resume. "
                                "Never use em dashes. JSON array only, no markdown."
                            ),
                            messages=[{"role": "user", "content": f"Resume for {_extract_name}:\n\n{_extract_text}"}],
                        )
                        try:
                            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
                            log_from_anthropic_response(email, FEATURES.PROFILE, resp,
                                                        metadata={"op": "seed_from_resume"})
                        except Exception:
                            pass
                        raw = resp.content[0].text.strip()
                        if raw.startswith("```"):
                            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                        if raw.endswith("```"):
                            raw = raw[:-3].strip()
                        if raw.startswith("json"):
                            raw = raw[4:].strip()
                        facts = _j.loads(raw)
                        if not isinstance(facts, list):
                            return
                        from projects.dilly.api.memory_surface_store import save_memory_surface
                        items = []
                        for f in facts[:30]:
                            if not isinstance(f, dict) or not f.get("label"):
                                continue
                            items.append({
                                "category": f.get("category", "skill_unlisted"),
                                "label": str(f.get("label", ""))[:100],
                                "value": str(f.get("value", ""))[:500],
                                "confidence": f.get("confidence", "medium"),
                                "source": "resume",
                            })
                        if items:
                            save_memory_surface(_extract_email, items=items)
                            print(f"[SEED-FACTS] Extracted {len(items)} facts from resume for {_extract_email}", flush=True)
                    except Exception as e:
                        print(f"[SEED-FACTS] Error: {e}", flush=True)
                _threading.Thread(target=_seed_profile_facts_bg, daemon=True).start()
        except Exception:
            pass
        return response
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/audit/from-text", response_model=AuditResponseV2, responses=ERROR_RESPONSES)
async def audit_from_text(request: Request, body: dict = Body(...)):
    """
    Import resume from pasted text and run audit.
    Bootstrap your profile without uploading a file. Paste from Word, LinkedIn export, or any text.
    """
    deps.rate_limit(request, "audit-v2", max_requests=20, window_sec=300)
    user = deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    text = (body.get("text") or "").strip()
    if not text:
        raise errors.validation_error("text is required. Paste your resume content.")
    if len(text.split()) < MIN_RESUME_WORDS:
        raise errors.validation_error(ERR_RESUME_TOO_SHORT)
    if len(text.split()) > MAX_RESUME_WORDS:
        raise errors.validation_error(ERR_RESUME_TOO_LONG)

    from dilly_core.resume_parser import parse_resume
    from dilly_core.structured_resume import (
        write_parsed_resume,
        build_structured_resume_text,
        safe_filename_from_key,
        update_parsed_resume_cohort,
    )

    parsed = parse_resume(text, filename="imported.txt")
    candidate_name = parsed.name or "Unknown"
    major = parsed.major or ""
    gpa = parsed.gpa

    try:
        from projects.dilly.api.profile_store import get_profile
        from dilly_core.transcript_parser import GPA_MIN, GPA_MAX
        profile = get_profile(email)
        if profile:
            if (profile.get("transcript_gpa") is not None):
                try:
                    gpa_val = float(profile["transcript_gpa"])
                    if GPA_MIN <= gpa_val <= GPA_MAX:
                        gpa = gpa_val
                except (TypeError, ValueError):
                    pass
            if (profile.get("name") or "").strip():
                candidate_name = (profile.get("name") or "").strip()
            if (profile.get("major") or "").strip():
                major = (profile.get("major") or "").strip()
            elif isinstance(profile.get("majors"), list) and profile.get("majors"):
                major = (profile.get("majors")[0] or "").strip() or major
    except Exception:
        pass

    text_for_audit = parsed.normalized_text or text
    edge_err = _validate_resume_for_audit(text_for_audit, parsed)
    if edge_err:
        raise errors.validation_error(edge_err)

    _parsed_resumes_dir = os.path.join(_WORKSPACE_ROOT, "projects", "dilly", "parsed_resumes")
    os.makedirs(_parsed_resumes_dir, exist_ok=True)
    written = write_parsed_resume(parsed, email, base_dir=_parsed_resumes_dir)
    structured_text = build_structured_resume_text(parsed)
    use_llm = os.environ.get("DILLY_USE_LLM", "").strip().lower() in ("1", "true", "yes")
    if use_llm and is_llm_available():
        try:
            from dilly_core.llm_structured_resume import normalize_resume_with_llm
            normalized = normalize_resume_with_llm(parsed)
            if normalized and normalized.strip():
                if "[Full Name]" in normalized and candidate_name and candidate_name != "Unknown":
                    normalized = normalized.replace("[Full Name]", candidate_name)
                if not re.search(r"^Name\s*:\s*", normalized.strip(), re.IGNORECASE):
                    normalized = "Name: " + (candidate_name or "Unknown") + "\n\n" + normalized
                with open(written, "w", encoding="utf-8") as f:
                    f.write(normalized)
                text_for_audit = normalized
                structured_text = normalized
        except Exception:
            pass

    resolved_application_target = "exploring"
    resolved_application_target_label = None
    audit_supplementary_context = None
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email)
        if profile:
            resolved_application_target = (profile.get("application_target") or "").strip() or _infer_application_target_from_goals(profile.get("goals") or [])
            if resolved_application_target not in APPLICATION_TARGET_VALUES:
                resolved_application_target = "exploring"
            resolved_application_target_label = (profile.get("application_target_label") or "").strip() or None
            audit_supplementary_context = _build_audit_supplementary_context(profile)
    except Exception:
        pass

    def _run():
        if use_llm and is_llm_available():
            from dilly_core.llm_auditor import run_audit_llm
            from dilly_core.auditor import run_audit, AuditorResult
            rule_result = run_audit(text_for_audit, candidate_name=candidate_name, major=major, gpa=gpa, filename="imported.txt")
            llm_result = run_audit_llm(
                text_for_audit,
                candidate_name=candidate_name,
                major=major,
                gpa=gpa,
                fallback_to_rules=True,
                filename="imported.txt",
                application_target=resolved_application_target,
                application_target_label=resolved_application_target_label,
                supplementary_context=audit_supplementary_context,
            )
            return AuditorResult(
                candidate_name=llm_result.candidate_name,
                major=llm_result.major,
                track=rule_result.track,
                smart_score=rule_result.smart_score,
                grit_score=rule_result.grit_score,
                build_score=rule_result.build_score,
                final_score=rule_result.final_score,
                audit_findings=llm_result.audit_findings or [],
                evidence_smart=llm_result.evidence_smart or [],
                evidence_grit=llm_result.evidence_grit or [],
                evidence_build=llm_result.evidence_build or [],
                evidence_smart_display=llm_result.evidence_smart_display,
                evidence_grit_display=llm_result.evidence_grit_display,
                evidence_build_display=llm_result.evidence_build_display,
                evidence_quotes=llm_result.evidence_quotes,
                recommendations=llm_result.recommendations,
                dilly_take=getattr(llm_result, "dilly_take", None),
            )
        from dilly_core.auditor import run_audit
        return run_audit(text_for_audit, candidate_name=candidate_name, major=major, gpa=gpa, filename="imported.txt")

    try:
        result = await asyncio.wait_for(asyncio.to_thread(_run), timeout=AUDIT_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        raise errors.http_exception(504, ERR_TIMEOUT, "TIMEOUT")

    if written and result.track:
        try:
            update_parsed_resume_cohort(written, result.track)
        except Exception:
            pass

    scores = {"smart": result.smart_score, "grit": result.grit_score, "build": result.build_score}
    from dilly_core.auditor import (
        get_rule_based_recommendations,
        get_fallback_line_edits_for_low_scores,
        _weave_snippet_into_sentence,
        _is_low_quality_evidence,
        _default_evidence_sentence,
    )
    evidence_smart_display = getattr(result, "evidence_smart_display", None)
    evidence_grit_display = getattr(result, "evidence_grit_display", None)
    evidence_build_display = getattr(result, "evidence_build_display", None)

    def already_woven(t: str) -> bool:
        return (t or "").strip().startswith("You demonstrated ") or (t or "").strip().startswith("You showcased ")
    def grit_malformed(t: str) -> bool:
        t = (t or "").strip()
        return "by present" in t or "your role as a The" in t
    if evidence_grit_display and not already_woven(evidence_grit_display):
        evidence_grit_display = _weave_snippet_into_sentence("grit", "You demonstrated leadership and impact through ", evidence_grit_display, result.track)
    if evidence_smart_display and not already_woven(evidence_smart_display):
        evidence_smart_display = _weave_snippet_into_sentence("smart", "You showcased high academic standard through ", evidence_smart_display, result.track)
    if evidence_build_display and not already_woven(evidence_build_display):
        evidence_build_display = _weave_snippet_into_sentence("build", f"You demonstrated {result.track} readiness through ", evidence_build_display, result.track)

    def tail_low_quality(ev: str) -> bool:
        if not ev or not ev.strip():
            return True
        t = ev.strip()
        if " through ." in t or t.endswith(" through ."):
            return True
        if "through " in t:
            tail = t.split("through ", 1)[-1].strip().rstrip(".")
            if _is_low_quality_evidence(tail) or "_" * 3 in tail:
                return True
        return False
    evidence = {
        "smart": evidence_smart_display if evidence_smart_display and not tail_low_quality(evidence_smart_display) else _default_evidence_sentence("smart", result.track),
        "grit": evidence_grit_display if evidence_grit_display and not tail_low_quality(evidence_grit_display) else _default_evidence_sentence("grit", result.track),
        "build": evidence_build_display if evidence_build_display and not tail_low_quality(evidence_build_display) else _default_evidence_sentence("build", result.track),
    }

    recs = []
    for r in get_rule_based_recommendations(result.track, result.major, text_for_audit):
        recs.append(AuditRecommendation(type=r.get("type") or "generic", title=r["title"], action=r["action"], current_line=r.get("current_line"), suggested_line=r.get("suggested_line"), score_target=r.get("score_target"), diagnosis=r.get("diagnosis")))
    if result.recommendations:
        for r in result.recommendations:
            rd = r if isinstance(r, dict) else {}
            recs.append(AuditRecommendation(type=rd.get("type") or "generic", title=rd.get("title") or "Recommendation", action=rd.get("action") or "", current_line=rd.get("current_line"), suggested_line=rd.get("suggested_line"), score_target=rd.get("score_target"), diagnosis=rd.get("diagnosis")))
    else:
        recs.extend(benchmarks.get_recommendations(result.track, scores))
    if not any((getattr(r, "type", None) or "generic") == "line_edit" for r in recs) and (result.grit_score < 50 or result.build_score < 50):
        fallback = get_fallback_line_edits_for_low_scores(text_for_audit, result.track, result.smart_score, result.grit_score, result.build_score, max_recs=5)
        for r in fallback:
            recs.append(AuditRecommendation(type=r.get("type") or "generic", title=r["title"], action=r["action"], current_line=r.get("current_line"), suggested_line=r.get("suggested_line"), score_target=r.get("score_target"), diagnosis=r.get("diagnosis")))

    consistency_findings = []
    if text_for_audit and "[EDUCATION]" in text_for_audit:
        try:
            from dilly_core.resume_consistency import run_consistency_checks
            consistency_findings = run_consistency_checks(text_for_audit)
        except Exception:
            pass
    red_flags_list = []
    if text_for_audit:
        try:
            from dilly_core.red_flags import run_red_flags
            red_flags_list = run_red_flags(text_for_audit, raw_text_for_length=text, page_count=None)
        except Exception:
            pass
    try:
        from dilly_core.anomaly import get_red_flags as get_anomaly_flags
        red_flags_list = list(red_flags_list) + get_anomaly_flags(parsed.gpa, scores, result.track)
    except Exception:
        pass

    peer_percentiles, peer_cohort_n, peer_fallback_all = None, 0, False
    try:
        from projects.dilly.api.peer_benchmark import get_peer_percentiles
        peer_percentiles, peer_cohort_n, peer_fallback_all = get_peer_percentiles(result.track, scores)
    except Exception:
        pass

    benchmark_copy = {}
    try:
        track_bench = benchmarks.data.get(result.track) or benchmarks.data.get("Humanities") or {}
        for dim_key, dim_label in [("smart", "Smart"), ("grit", "Grit"), ("build", "Build")]:
            bar = (track_bench.get(dim_label) or {}).get("tier_1")
            if bar is not None:
                val = scores.get(dim_key, 0)
                benchmark_copy[dim_key] = f"At/above bar ({int(bar)})" if val >= bar else f"Below bar ({int(bar)})"
    except Exception:
        pass

    evidence_quotes = dict(getattr(result, "evidence_quotes", None) or {})
    if text_for_audit:
        fallback = get_fallback_evidence_quotes(text_for_audit)
        for dim in ("smart", "grit", "build"):
            if not evidence_quotes.get(dim) and fallback.get(dim):
                evidence_quotes[dim] = fallback[dim]
    strongest_dim = max([("smart", scores.get("smart", 0)), ("grit", scores.get("grit", 0)), ("build", scores.get("build", 0))], key=lambda x: x[1])[0]
    ev_sentence = (evidence.get(strongest_dim) or "").strip()
    if ev_sentence and len(ev_sentence) > 120:
        ev_sentence = ev_sentence[:117].rsplit(" ", 1)[0] + "..."
    strongest_signal_sentence = f"Your strongest signal to recruiters right now is {strongest_dim.capitalize()}—{ev_sentence}." if ev_sentence else None

    response = AuditResponseV2(
        candidate_name=candidate_name,
        detected_track=result.track,
        major=result.major,
        scores=scores,
        final_score=result.final_score,
        audit_findings=result.audit_findings,
        evidence=evidence,
        evidence_quotes=evidence_quotes if evidence_quotes else None,
        recommendations=recs,
        raw_logs=["Imported from text", f"Track: {result.track}", "LLM Auditor (MTS)." if use_llm and is_llm_available() else "Dilly Core.", "Recommendations from rule engine + benchmark"],
        dilly_take=getattr(result, "dilly_take", None),
        strongest_signal_sentence=strongest_signal_sentence,
        consistency_findings=consistency_findings if consistency_findings else None,
        red_flags=red_flags_list if red_flags_list else None,
        peer_percentiles=peer_percentiles,
        peer_cohort_n=peer_cohort_n if peer_percentiles and peer_cohort_n else None,
        peer_fallback_all=peer_fallback_all if peer_percentiles else None,
        benchmark_copy=benchmark_copy if benchmark_copy else None,
        application_target=resolved_application_target,
        resume_text=text_for_audit or text,
        structured_text=structured_text,
        page_count=None,
    )

    try:
        from projects.dilly.api.audit_history import append_audit, get_audits
        from projects.dilly.api.profile_store import get_profile, save_profile
        audit_id = uuid.uuid4().hex
        full_audit_dict = response.model_dump()
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
            save_profile(email, {"first_audit_snapshot": {"scores": scores, "ts": full_audit_dict["ts"]}})
        if profile and not (profile.get("name") or "").strip() and candidate_name:
            save_profile(email, {"name": candidate_name})
        try:
            from projects.dilly.api.candidate_index import index_candidate_after_audit
            resume_for_index = _load_parsed_resume_for_voice(email, max_chars=50000)
            index_candidate_after_audit(email, profile=get_profile(email), audit=full_audit_dict, resume_text=resume_for_index or None)
        except Exception:
            pass
        try:
            from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
            write_dilly_profile_txt(email)
        except Exception:
            pass
        response = response.model_copy(update={"id": audit_id})
    except Exception:
        pass
    return response


@router.get("/audit/history")
async def get_audit_history(request: Request):
    """Return current user's audit history (summaries, newest first). Requires signed-in user."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    _SUMMARY_KEYS = {"id", "ts", "scores", "final_score", "detected_track", "candidate_name", "major", "peer_percentiles", "dilly_take", "strongest_signal_sentence", "skill_tags"}
    try:
        from projects.dilly.api.audit_history import get_audits
        audits = get_audits(email)
        summaries = []
        for a in audits:
            s = {k: a[k] for k in _SUMMARY_KEYS if k in a}
            if "dilly_take" not in s and a.get("dilly_take"):
                s["dilly_take"] = a["dilly_take"]
            summaries.append(s)
        return {"audits": summaries}
    except Exception:
        return {"audits": []}


@router.get("/audit/latest")
async def get_latest_audit(request: Request):
    """Return the user's most recent full audit result in one call (no second fetch needed). Requires signed-in user."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    try:
        from projects.dilly.api.audit_history import get_audits
        audits = get_audits(email)
        if audits:
            return {"audit": audits[0]}
    except Exception:
        pass
    # Fall back to latest_audit snapshot in profile_json
    try:
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email)
        if profile and profile.get("latest_audit"):
            return {"audit": profile["latest_audit"]}
    except Exception:
        pass
    return {"audit": None}


@router.get("/audit/history/{audit_id}")
async def get_audit_by_id(request: Request, audit_id: str):
    """Return full audit result for a specific audit ID. Requires signed-in user."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    try:
        from projects.dilly.api.audit_history import get_audits
        audits = get_audits(email)
        from projects.dilly.api.audit_history import normalize_audit_id_key

        want = normalize_audit_id_key(audit_id)
        for a in audits:
            if normalize_audit_id_key(a.get("id")) == want:
                return {"audit": a}
        raise errors.not_found("Audit not found.")
    except HTTPException:
        raise
    except Exception:
        raise errors.internal("Could not retrieve audit.")


def _generate_badge_svg(track: str, dimension: str, percentile: int, score: float) -> str:
    top_pct = max(1, 100 - percentile)
    color = "#22c55e" if top_pct <= 25 else "#eab308" if top_pct <= 50 else "#94a3b8"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>
  <rect width="320" height="120" rx="16" fill="url(#bg)"/>
  <rect x="1" y="1" width="318" height="118" rx="15" fill="none" stroke="{color}" stroke-width="1.5" stroke-opacity="0.4"/>
  <text x="24" y="36" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" font-weight="600" letter-spacing="1.2">DILLY VERIFIED</text>
  <text x="24" y="62" font-family="system-ui,sans-serif" font-size="20" fill="#e2e8f0" font-weight="700">Top {top_pct}% {dimension.capitalize()}</text>
  <text x="24" y="84" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">{track or "Humanities"} Track</text>
  <text x="24" y="104" font-family="system-ui,sans-serif" font-size="10" fill="#475569">Score: {score:.0f} · trydilly.com</text>
  <circle cx="274" cy="60" r="28" fill="{color}" fill-opacity="0.12" stroke="{color}" stroke-width="1.5"/>
  <text x="274" y="65" font-family="system-ui,sans-serif" font-size="18" fill="{color}" font-weight="700" text-anchor="middle">{score:.0f}</text>
</svg>"""


def _audit_for_badge_snapshot(request: Request, audit_id: str | None = None, body: dict | None = None) -> dict:
    audit = None
    if body and isinstance(body.get("audit"), dict):
        audit = body["audit"]
    if not audit and audit_id:
        user = deps.require_auth(request)
        email = (user.get("email") or "").strip().lower()
        from projects.dilly.api.audit_history import get_audits, normalize_audit_id_key

        want = normalize_audit_id_key(audit_id)
        for a in get_audits(email):
            if normalize_audit_id_key(a.get("id")) == want:
                audit = a
                break
    if not audit:
        raise errors.not_found("Audit not found. Provide audit in request body or use an audit ID from your history.")
    return audit


@router.get("/badge/{audit_id}", summary="Get Dilly badge SVG by audit ID")
async def get_badge(request: Request, audit_id: str, dimension: str = "grit"):
    """Return Dilly Verified badge SVG for an audit (smart/grit/build)."""
    deps.require_auth(request)
    audit = _audit_for_badge_snapshot(request, audit_id=audit_id)
    scores = audit.get("scores") or {}
    percs = audit.get("peer_percentiles") or {}
    track = (audit.get("detected_track") or "").strip()
    dim = dimension.lower() if dimension.lower() in ("smart", "grit", "build") else "grit"
    svg = _generate_badge_svg(track, dim, percs.get(dim, 50), scores.get(dim, 0))
    return Response(content=svg, media_type="image/svg+xml", headers={"Content-Disposition": f"attachment; filename=dilly-badge-{dim}.svg"})


@router.post("/badge", summary="Generate badge SVG from audit in body")
async def post_badge(request: Request, body: dict = Body(...)):
    """Generate Dilly Verified badge SVG from audit object in request body."""
    deps.require_auth(request)
    audit = _audit_for_badge_snapshot(request, body=body)
    dimension = (body.get("dimension") or "grit").lower()
    if dimension not in ("smart", "grit", "build"):
        dimension = "grit"
    scores = audit.get("scores") or {}
    percs = audit.get("peer_percentiles") or {}
    track = (audit.get("detected_track") or "").strip()
    svg = _generate_badge_svg(track, dimension, percs.get(dimension, 50), scores.get(dimension, 0))
    return Response(content=svg, media_type="image/svg+xml", headers={"Content-Disposition": f"attachment; filename=dilly-badge-{dimension}.svg"})


def _to_punchy_findings(audit: dict) -> list[str]:
    take = (audit.get("dilly_take") or audit.get("meridian_take") or "").strip()
    percs = audit.get("peer_percentiles") or {}
    findings = audit.get("audit_findings") or []
    lines = []
    max_len = 28
    PUNCHY_MAP = [
        (re.compile(r"academic|gpa|honors|dean'?s list|top \d+%", re.I), "GPA & honors speak volumes"),
        (re.compile(r"leadership|led|exec|president|director", re.I), "Leadership stands out"),
        (re.compile(r"technical|projects|built|code|data", re.I), "Technical build is strong"),
        (re.compile(r"quantifiable|metrics|impact|results", re.I), "Add metrics—impact pops"),
        (re.compile(r"clinical|shadowing|patient", re.I), "Clinical experience shines"),
        (re.compile(r"research|published|lab", re.I), "Research experience proven"),
    ]
    def extract_punchy(text: str) -> str | None:
        rest = re.sub(r"^(Smart|Grit|Build):\s*", "", (text or ""), flags=re.I).strip().lower()
        for pattern, phrase in PUNCHY_MAP:
            if pattern.search(rest):
                return phrase
        words = " ".join(rest.split()[:4])
        return words if len(words) <= max_len and len(words) > 5 else None
    if take and len(take) <= 40:
        lines.append(take)
    if len(lines) >= 2:
        return lines[:2]
    dims = [("smart", percs.get("smart", 50)), ("grit", percs.get("grit", 50)), ("build", percs.get("build", 50))]
    dims = [(d, p) for d, p in dims if p > 50]
    if dims:
        best = max(dims, key=lambda x: x[1])
        top_pct = max(1, 100 - best[1])
        label = best[0].capitalize()
        lines.append(f"Top {top_pct}% {label}")
    if len(lines) >= 2:
        return lines[:2]
    for f in findings:
        if len(lines) >= 2:
            break
        punchy = extract_punchy(f or "")
        if punchy and len(punchy) <= max_len and punchy not in lines:
            lines.append(punchy)
    return lines[:2] if lines else ["Dilly Truth Standard · Your resume, scored."]


@router.get("/snapshot/{audit_id}")
async def get_snapshot(request: Request, audit_id: str):
    deps.require_auth(request)
    audit = _audit_for_badge_snapshot(request, audit_id=audit_id)
    scores = audit.get("scores") or {}
    fs = audit.get("final_score", 0)
    track = (audit.get("detected_track") or "").strip() or "Humanities"
    name = (audit.get("candidate_name") or "").strip() or "Student"
    punchy_lines = _to_punchy_findings(audit)
    s, g, b = scores.get("smart", 0), scores.get("grit", 0), scores.get("build", 0)
    fsc = "#22c55e" if fs >= 70 else "#eab308" if fs >= 50 else "#ef4444"
    findings_svg = ""
    for i, line in enumerate(punchy_lines):
        esc = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        findings_svg += f'<text x="24" y="{290 + i * 22}" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#e2e8f0">• {esc}</text>'
    n = len(punchy_lines)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="400" height="{360 + n * 22}" viewBox="0 0 400 {360 + n * 22}" overflow="hidden">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>
  <rect width="400" height="{360 + n * 22}" rx="20" fill="url(#bg)"/>
  <text x="24" y="36" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.5">DILLY SNAPSHOT</text>
  <text x="24" y="66" font-family="system-ui,sans-serif" font-size="22" fill="#e2e8f0" font-weight="700">{name}</text>
  <text x="24" y="88" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">{track} Track</text>
  <circle cx="340" cy="64" r="32" fill="{fsc}" fill-opacity="0.12" stroke="{fsc}" stroke-width="2"/>
  <text x="340" y="69" font-family="system-ui,sans-serif" font-size="22" fill="{fsc}" font-weight="700" text-anchor="middle">{fs:.0f}</text>
  <text x="340" y="82" font-family="system-ui,sans-serif" font-size="8" fill="{fsc}" text-anchor="middle" opacity="0.7">MTS</text>
  <line x1="24" y1="110" x2="376" y2="110" stroke="#334155" stroke-width="0.5"/>
  <text x="24" y="140" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.2">DIMENSIONS</text>
  <rect x="24" y="155" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="79" y="180" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Smart</text>
  <text x="79" y="205" font-family="system-ui,sans-serif" font-size="24" fill="{'#22c55e' if s >= 70 else '#eab308' if s >= 50 else '#ef4444'}" font-weight="700" text-anchor="middle">{s:.0f}</text>
  <rect x="145" y="155" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="200" y="180" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Grit</text>
  <text x="200" y="205" font-family="system-ui,sans-serif" font-size="24" fill="{'#22c55e' if g >= 70 else '#eab308' if g >= 50 else '#ef4444'}" font-weight="700" text-anchor="middle">{g:.0f}</text>
  <rect x="266" y="155" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="321" y="180" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Build</text>
  <text x="321" y="205" font-family="system-ui,sans-serif" font-size="24" fill="{'#22c55e' if b >= 70 else '#eab308' if b >= 50 else '#ef4444'}" font-weight="700" text-anchor="middle">{b:.0f}</text>
  <text x="24" y="260" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.2">KEY FINDINGS</text>
  {findings_svg}
  <text x="200" y="{340 + n * 22}" font-family="system-ui,sans-serif" font-size="9" fill="#475569" text-anchor="middle">trydilly.com · Share your score</text>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml", headers={"Content-Disposition": "attachment; filename=dilly-snapshot.svg"})


@router.post("/snapshot")
async def post_snapshot(request: Request, body: dict = Body(...)):
    deps.require_auth(request)
    audit = _audit_for_badge_snapshot(request, body=body)
    scores = audit.get("scores") or {}
    fs = audit.get("final_score", 0)
    track = (audit.get("detected_track") or "").strip() or "Humanities"
    name = (audit.get("candidate_name") or "").strip() or "Student"
    punchy_lines = _to_punchy_findings(audit)
    s, g, b = scores.get("smart", 0), scores.get("grit", 0), scores.get("build", 0)
    fsc = "#22c55e" if fs >= 70 else "#eab308" if fs >= 50 else "#ef4444"
    findings_svg = ""
    for i, line in enumerate(punchy_lines):
        esc = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        findings_svg += f'<text x="24" y="{290 + i * 22}" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#e2e8f0">• {esc}</text>'
    n = len(punchy_lines)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="400" height="{360 + n * 22}" viewBox="0 0 400 {360 + n * 22}" overflow="hidden">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>
  <rect width="400" height="{360 + n * 22}" rx="20" fill="url(#bg)"/>
  <text x="24" y="36" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.5">DILLY SNAPSHOT</text>
  <text x="24" y="66" font-family="system-ui,sans-serif" font-size="22" fill="#e2e8f0" font-weight="700">{name}</text>
  <text x="24" y="88" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">{track} Track</text>
  <circle cx="340" cy="64" r="32" fill="{fsc}" fill-opacity="0.12" stroke="{fsc}" stroke-width="2"/>
  <text x="340" y="69" font-family="system-ui,sans-serif" font-size="22" fill="{fsc}" font-weight="700" text-anchor="middle">{fs:.0f}</text>
  <text x="340" y="82" font-family="system-ui,sans-serif" font-size="8" fill="{fsc}" text-anchor="middle" opacity="0.7">MTS</text>
  <line x1="24" y1="110" x2="376" y2="110" stroke="#334155" stroke-width="0.5"/>
  <text x="24" y="140" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.2">DIMENSIONS</text>
  <rect x="24" y="155" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="79" y="180" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Smart</text>
  <text x="79" y="205" font-family="system-ui,sans-serif" font-size="24" fill="{'#22c55e' if s >= 70 else '#eab308' if s >= 50 else '#ef4444'}" font-weight="700" text-anchor="middle">{s:.0f}</text>
  <rect x="145" y="155" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="200" y="180" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Grit</text>
  <text x="200" y="205" font-family="system-ui,sans-serif" font-size="24" fill="{'#22c55e' if g >= 70 else '#eab308' if g >= 50 else '#ef4444'}" font-weight="700" text-anchor="middle">{g:.0f}</text>
  <rect x="266" y="155" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="321" y="180" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Build</text>
  <text x="321" y="205" font-family="system-ui,sans-serif" font-size="24" fill="{'#22c55e' if b >= 70 else '#eab308' if b >= 50 else '#ef4444'}" font-weight="700" text-anchor="middle">{b:.0f}</text>
  <text x="24" y="260" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.2">KEY FINDINGS</text>
  {findings_svg}
  <text x="200" y="{340 + n * 22}" font-family="system-ui,sans-serif" font-size="9" fill="#475569" text-anchor="middle">trydilly.com · Share your score</text>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml", headers={"Content-Disposition": "attachment; filename=dilly-snapshot.svg"})


@router.get("/leaderboard/{track}")
async def get_leaderboard(request: Request, track: str):
    deps.require_subscribed(request)
    from projects.dilly.api.audit_history import get_audits as _get_audits
    from projects.dilly.api.leaderboard_page import _newest_audit_for_leaderboard_track
    from projects.dilly.api.profile_store import is_leaderboard_participating

    want = (track or "Humanities").strip() or "Humanities"
    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    entries = []
    if os.path.isdir(profiles_dir):
        for uid in os.listdir(profiles_dir):
            profile_path = os.path.join(profiles_dir, uid, "profile.json")
            if not os.path.isfile(profile_path):
                continue
            try:
                with open(profile_path, "r") as f:
                    prof = json.load(f)
                if not is_leaderboard_participating(prof):
                    continue
                email = (prof.get("email") or "").strip().lower()
                if not email:
                    continue
                audits = _get_audits(email)
                if not audits:
                    continue
                latest = _newest_audit_for_leaderboard_track(audits, want)
                if latest is None:
                    continue
                scores = latest.get("scores") or {}
                entries.append({
                    "smart": scores.get("smart", 0),
                    "grit": scores.get("grit", 0),
                    "build": scores.get("build", 0),
                    "final_score": latest.get("final_score", 0),
                })
            except Exception:
                continue
    entries.sort(key=lambda e: e["final_score"], reverse=True)
    for i, e in enumerate(entries):
        e["rank"] = i + 1
    return {"track": track, "total": len(entries), "leaderboard": entries[:50]}


_LEADERBOARD_JUNK_TRACKS = frozenset(
    {"page", "undefined", "null", "your track", "your-track", "track", "leaderboard", ""}
)


def _build_leaderboard_page_response(
    request: Request,
    track: str,
    refresh: bool,
    uid: str | None,
) -> dict:
    """
    Full leaderboard for /leaderboard UI: podium, entries, weekly feed, move-up copy.
    Auth required. Optional refresh after new audit to reset weekly rank baseline.
    """
    _ = uid
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    subscribed = bool(user.get("subscribed"))
    school_short = ""
    prof: dict = {}
    try:
        from projects.dilly.api.profile_store import get_profile
        from projects.dilly.api.schools import get_school_from_email, SCHOOLS, get_track_category

        prof = get_profile(email) or {}
        sid = (prof.get("schoolId") or "").strip().lower()
        sc = SCHOOLS.get(sid) if sid else get_school_from_email(email)
        if sc:
            school_short = str(sc.get("short_name") or sc.get("name") or "")
        raw_track = (track or "").strip() or "Humanities"
        if raw_track.lower() in _LEADERBOARD_JUNK_TRACKS:
            raw_track = (prof.get("track") or "").strip() or "Humanities"
        if raw_track.lower() in _LEADERBOARD_JUNK_TRACKS:
            raw_track = "Humanities"
        track = get_track_category(raw_track)
    except Exception:
        track = (track or "Humanities").strip() or "Humanities"
        if track.lower() in _LEADERBOARD_JUNK_TRACKS:
            track = "Humanities"
        try:
            from projects.dilly.api.schools import get_track_category

            track = get_track_category(track)
        except Exception:
            pass
    try:
        from projects.dilly.api.leaderboard_page import build_leaderboard_page_payload

        return build_leaderboard_page_payload(
            email=email,
            track=track,
            subscribed=subscribed,
            refresh=bool(refresh),
            school_short=school_short,
        )
    except Exception:
        logging.exception("build_leaderboard_page_payload failed")
        raise errors.internal("Could not load leaderboard.")


@router.get("/leaderboard/page")
async def get_leaderboard_page_query(
    request: Request,
    track: str = Query("Humanities", min_length=1, max_length=120),
    refresh: bool = False,
    uid: str | None = None,
):
    """
    Same JSON as /leaderboard/page/{track}. Prefer this from the app so track names with
    odd characters never break path routing or reverse proxies.
    """
    t = (track or "Humanities").strip() or "Humanities"
    return _build_leaderboard_page_response(request, t, refresh, uid)


def _build_global_leaderboard_response(request: Request, refresh: bool) -> dict:
    """Same JSON as track leaderboard, but board = all cohorts (top 100 list + cohort per row)."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    subscribed = bool(user.get("subscribed"))
    school_short = ""
    try:
        from projects.dilly.api.profile_store import get_profile
        from projects.dilly.api.schools import get_school_from_email, SCHOOLS

        prof = get_profile(email) or {}
        sid = (prof.get("schoolId") or "").strip().lower()
        sc = SCHOOLS.get(sid) if sid else get_school_from_email(email)
        if sc:
            school_short = str(sc.get("short_name") or sc.get("name") or "")
    except Exception:
        pass
    try:
        from projects.dilly.api.leaderboard_page import build_global_leaderboard_payload

        return build_global_leaderboard_payload(
            email=email,
            subscribed=subscribed,
            refresh=bool(refresh),
            school_short=school_short,
        )
    except Exception:
        logging.exception("build_global_leaderboard_payload failed")
        raise errors.internal("Could not load global leaderboard.")


@router.get("/leaderboard/page/global")
async def get_leaderboard_global_page_path(request: Request, refresh: bool = False):
    """Static path before `/leaderboard/page/{track}`; same JSON as `/leaderboard-dashboard/global`."""
    return _build_global_leaderboard_response(request, refresh)


@router.get("/leaderboard/page/{track}")
async def get_leaderboard_page(request: Request, track: str, refresh: bool = False, uid: str | None = None):
    """Path form kept for deep links; client should use GET /leaderboard-dashboard?track= when possible."""
    t = (track or "Humanities").strip() or "Humanities"
    return _build_leaderboard_page_response(request, t, refresh, uid)


@router.get("/leaderboard-dashboard")
async def get_leaderboard_dashboard(
    request: Request,
    track: str = Query("Humanities", min_length=1, max_length=120),
    refresh: bool = False,
    uid: str | None = None,
):
    """
    Same JSON as GET /leaderboard/page?track=. The dashboard client uses this path so the request URL
    never contains a literal `page` segment (avoids confusion with Next.js / some proxies).
    """
    t = (track or "Humanities").strip() or "Humanities"
    return _build_leaderboard_page_response(request, t, refresh, uid)


@router.get("/leaderboard-dashboard/global")
async def get_leaderboard_global_dashboard(request: Request, refresh: bool = False):
    """Global top-100 style leaderboard: same payload as track board, cohort label per person."""
    return _build_global_leaderboard_response(request, refresh)


@router.get("/peer-cohort-stats")
async def get_peer_cohort_stats(request: Request, track: str = ""):
    deps.require_subscribed(request)
    from projects.dilly.api.peer_benchmark import get_cohort_stats as _get_cohort_stats
    t = (track or "").strip() or "Humanities"
    stats = _get_cohort_stats(t)
    if stats is None:
        return {"track": t, "cohort_n": 0, "use_fallback": False, "avg": None, "p25": None, "p75": None, "how_to_get_ahead": None}
    return stats


_EXPLAIN_DELTA_SYSTEM = """You are a top-level job consultant or career advisor. Given two Dilly audit results (before and after), write a short explainer (2-5 sentences) that tells them why their Smart, Grit, and Build scores changed. Be specific. Write in second person. Output the explainer only. Never use em dashes."""


def _explain_score_delta(previous: dict, current: dict) -> str | None:
    if not is_llm_available():
        return None
    from dilly_core.llm_client import get_chat_completion, get_light_model
    prev_s = previous.get("scores") or {}
    curr_s = current.get("scores") or {}
    prev_findings = previous.get("audit_findings") or []
    curr_findings = current.get("audit_findings") or []
    track = current.get("detected_track") or previous.get("detected_track") or "Humanities"
    user_content = f"""Track: {track}
BEFORE: Smart {prev_s.get('smart', 0):.0f}, Grit {prev_s.get('grit', 0):.0f}, Build {prev_s.get('build', 0):.0f}
Findings: {chr(10).join(prev_findings[:5])}
AFTER: Smart {curr_s.get('smart', 0):.0f}, Grit {curr_s.get('grit', 0):.0f}, Build {curr_s.get('build', 0):.0f}
Findings: {chr(10).join(curr_findings[:5])}
Write the explainer for why their scores changed."""
    out = get_chat_completion(_EXPLAIN_DELTA_SYSTEM, user_content, model=get_light_model(), temperature=0.3, max_tokens=500)
    return (out or "").strip() or None


@router.post("/audit/explain-delta", summary="Explain score change between two audits")
async def explain_score_delta(request: Request, body: dict = Body(...)):
    """Return human-readable explainer for why scores changed between previous and current audit."""
    deps.require_subscribed(request)
    previous = body.get("previous") or body.get("previous_audit")
    current = body.get("current") or body.get("current_audit")
    if not previous or not current:
        raise errors.validation_error("Provide 'previous' and 'current' audit objects.")
    explainer = _explain_score_delta(previous, current)
    if explainer is None:
        ps = (previous.get("scores") or {})
        cs = (current.get("scores") or {})
        parts = []
        for dim, label in [("smart", "Smart"), ("grit", "Grit"), ("build", "Build")]:
            pv = ps.get(dim, 0)
            cv = cs.get(dim, 0)
            d = cv - pv
            if d > 0:
                parts.append(f"{label} went up {d:.0f} points. Your updates likely added stronger evidence in that area.")
            elif d < 0:
                parts.append(f"{label} went down {abs(d):.0f} points; check that you didn't remove key evidence or dates.")
        explainer = " ".join(parts) if parts else "Your scores changed. Review your findings and recommendations to see what shifted."
    return {"explainer": explainer}


@router.get("/audit/scoring-guidelines", summary="Get scoring impact guidelines for accurate score-change answers")
async def get_scoring_guidelines(request: Request, track: str = ""):
    """
    Return scoring impact rules derived from the real formulas (dilly_core).
    Use when a student asks how a change will affect their scores so the answer is accurate.
    Optional query param track= (e.g. Tech, Pre-Health) for track-specific Build and composite weights.
    """
    deps.require_auth(request)
    from projects.dilly.api.scoring_guidelines import get_scoring_impact_guide
    track_clean = (track or "").strip() or "default"
    guide = get_scoring_impact_guide(track_clean)
    return guide


_READY_CHECK_SYSTEM = """You are a senior career strategist. Given a student's Dilly audit data (scores, findings, track) and a target company or role, assess their readiness.
Return a JSON object with exactly these fields:
- "verdict": one of "ready", "not_yet", or "stretch"
- "summary": one sentence explaining the verdict
- "gaps": array of 1-3 specific, actionable gaps (short strings)
Output ONLY the JSON object, no markdown."""


@router.post("/ready-check-legacy", summary="Legacy readiness endpoint (deprecated)")
async def ready_check(request: Request, body: dict = Body(...)):
    deps.require_subscribed(request)
    target = (body.get("target") or "").strip()
    if not target or len(target) > 200:
        raise errors.validation_error("Provide a target company or role (under 200 chars).")
    audit = body.get("audit") or {}
    scores = audit.get("scores") or {}
    track = (audit.get("detected_track") or "").strip()
    findings = audit.get("audit_findings") or []
    user_content = f"Target: {target}\nTrack: {track or 'Unknown'}\n"
    if scores:
        user_content += f"Scores: Smart {scores.get('smart', 0):.0f}, Grit {scores.get('grit', 0):.0f}, Build {scores.get('build', 0):.0f}\n"
    if findings:
        user_content += "Key findings:\n" + "\n".join(f"- {f[:200]}" for f in findings[:6])
    result = {"verdict": "not_yet", "summary": "Unable to assess right now.", "gaps": []}
    if is_llm_available():
        from dilly_core.llm_client import get_chat_completion, get_light_model
        raw = get_chat_completion(_READY_CHECK_SYSTEM, user_content, model=get_light_model(), temperature=0.3, max_tokens=400)
        if raw:
            try:
                parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
                if isinstance(parsed, dict):
                    result["verdict"] = parsed.get("verdict", "not_yet")
                    result["summary"] = parsed.get("summary", "")
                    result["gaps"] = parsed.get("gaps", [])[:5]
            except (json.JSONDecodeError, ValueError):
                pass
    return result


@router.post("/generate-lines")
async def generate_lines(request: Request, body: dict = Body(...)):
    deps.require_subscribed(request)
    audit = body.get("audit") or {}
    target = (body.get("target") or "").strip()
    scores = audit.get("scores") or {}
    track = (audit.get("detected_track") or "").strip()
    findings = audit.get("audit_findings") or []
    evidence = audit.get("evidence") or {}
    evidence_quotes = audit.get("evidence_quotes") or {}
    recommendations = audit.get("recommendations") or []
    system = """You generate cover letter opening lines and LinkedIn outreach hooks for a student. Tone: human-written, direct and narrative. Output a JSON object with "cover_openers" (array of 3) and "outreach_hooks" (array of 2). Root every line in actual resume evidence. Output ONLY the JSON object."""
    user_content = f"Track: {track or 'Unknown'}\n"
    if target:
        user_content += f"Applying to: {target}\n"
    if scores:
        user_content += f"Scores: Smart {scores.get('smart', 0):.0f}, Grit {scores.get('grit', 0):.0f}, Build {scores.get('build', 0):.0f}\n"
    if findings:
        user_content += "Key findings:\n" + "\n".join(f"- {f[:250]}" for f in findings[:6])
    if evidence:
        for dim in ("smart", "grit", "build"):
            if evidence.get(dim):
                user_content += f"\n{dim.capitalize()}: {evidence[dim][:300]}\n"
    if evidence_quotes:
        for dim in ("smart", "grit", "build"):
            if evidence_quotes.get(dim):
                user_content += f"Quote {dim}: {evidence_quotes[dim][:300]}\n"
    if recommendations:
        line_edits = [r for r in recommendations if isinstance(r, dict) and r.get("type") == "line_edit" and (r.get("current_line") or r.get("suggested_line"))]
        for r in line_edits[:4]:
            curr = (r.get("current_line") or "")[:200]
            if curr:
                user_content += f"- {curr}\n"
    result = {"cover_openers": [], "outreach_hooks": []}
    if is_llm_available():
        from dilly_core.llm_client import get_chat_completion, get_light_model
        raw = get_chat_completion(system, user_content, model=get_light_model(), temperature=0.5, max_tokens=600)
        if raw:
            try:
                parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
                if isinstance(parsed, dict):
                    result["cover_openers"] = parsed.get("cover_openers", [])[:5]
                    result["outreach_hooks"] = parsed.get("outreach_hooks", [])[:3]
            except (json.JSONDecodeError, ValueError):
                pass
    return result


@router.post("/interview-prep")
async def interview_prep(request: Request, body: dict = Body(...)):
    deps.require_subscribed(request)
    audit = body.get("audit") or {}
    scores = audit.get("scores") or {}
    track = (audit.get("detected_track") or "").strip()
    findings = audit.get("audit_findings") or []
    evidence = audit.get("evidence") or {}
    system = """You are a career coach. Given a student's resume audit data, generate interview prep for Smart, Grit, Build. For each: "question", "strategy", "script" (30-sec sample). Output JSON: {"dimensions": [{"name": "Smart", ...}, ...]}. Output ONLY the JSON object."""
    user_content = f"Track: {track or 'Unknown'}\n"
    if scores:
        user_content += f"Scores: Smart {scores.get('smart', 0):.0f}, Grit {scores.get('grit', 0):.0f}, Build {scores.get('build', 0):.0f}\n"
    if findings:
        user_content += "Key findings:\n" + "\n".join(f"- {f[:200]}" for f in findings[:6])
    if evidence:
        for dim in ("smart", "grit", "build"):
            if evidence.get(dim):
                user_content += f"\n{dim.capitalize()} evidence: {evidence[dim][:300]}"
    result = {"dimensions": []}
    if is_llm_available():
        from dilly_core.llm_client import get_chat_completion, get_light_model
        raw = get_chat_completion(system, user_content, model=get_light_model(), temperature=0.4, max_tokens=800)
        if raw:
            try:
                parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
                if isinstance(parsed, dict):
                    result["dimensions"] = parsed.get("dimensions", [])[:3]
            except (json.JSONDecodeError, ValueError):
                pass
    return result


def _parse_career_playbook_response(raw: str) -> dict | None:
    try:
        s = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(s)
    except (json.JSONDecodeError, ValueError, TypeError):
        return None


def _career_playbook_fallback(
    effective_track: str,
    headline: str,
    bullets: list,
    track_tips: list,
) -> dict:
    dives: list[dict] = []
    for b in bullets[:8]:
        if not isinstance(b, str) or not b.strip():
            continue
        dives.append({
            "theme": b.strip()[:220],
            "for_you": (
                "Personalized coaching for this theme needs the AI service. "
                "Use your latest audit recommendations and ask Dilly in chat to apply this to your bullets."
            ),
            "this_week": "Spend 25 minutes improving one resume line that supports this theme.",
        })
    if not dives:
        dives = [{
            "theme": "Sharpen your story",
            "for_you": "Tie each experience to an outcome recruiters in your track can verify.",
            "this_week": "Rewrite your top bullet with a metric or scope (team size, dollars, percent, users).",
        }]
    tips = [str(t)[:240] for t in track_tips[:8] if isinstance(t, str) and t.strip()]
    return {
        "opening": (
            f"We could not generate your fully personalized playbook brief right now. "
            f"Below is your {effective_track or 'track'} framework so you still have a roadmap."
        ),
        "cohort_lens": headline or "Recruiters in your track reward proof, not adjectives. Every line should answer what you did, how big it was, and what changed because of you.",
        "resume_signals": [],
        "deep_dive": dives[:8],
        "gaps_to_close": tips,
        "closer": "Run a fresh audit after edits, then open this page again for a deeper pass.",
        "fallback": True,
    }


def _normalize_career_playbook(parsed: dict, bullets: list[str]) -> dict:
    out: dict = {
        "opening": str(parsed.get("opening") or "")[:2200],
        "cohort_lens": str(parsed.get("cohort_lens") or "")[:4000],
        "resume_signals": [],
        "deep_dive": [],
        "gaps_to_close": [],
        "closer": str(parsed.get("closer") or "")[:1400],
        "fallback": bool(parsed.get("fallback")),
    }
    rs = parsed.get("resume_signals")
    if isinstance(rs, list):
        for item in rs[:6]:
            if not isinstance(item, dict):
                continue
            out["resume_signals"].append({
                "signal": str(item.get("signal") or "")[:400],
                "from_resume": str(item.get("from_resume") or item.get("resume_anchor") or "")[:600],
                "why": str(item.get("why") or item.get("why_it_matters") or "")[:900],
            })
    dd = parsed.get("deep_dive")
    if isinstance(dd, list):
        for item in dd[:10]:
            if not isinstance(item, dict):
                continue
            out["deep_dive"].append({
                "theme": str(item.get("theme") or "")[:320],
                "for_you": str(item.get("for_you") or item.get("personalized_advice") or "")[:2800],
                "this_week": str(item.get("this_week") or item.get("next_move") or "")[:520],
            })
    gc = parsed.get("gaps_to_close")
    if isinstance(gc, list):
        out["gaps_to_close"] = [str(x)[:450] for x in gc[:12] if str(x).strip()]

    bclean = [str(b).strip() for b in bullets if isinstance(b, (str, int)) and str(b).strip()][:8]
    i = 0
    while len(out["deep_dive"]) < len(bclean) and len(out["deep_dive"]) < 8:
        theme = bclean[i]
        i += 1
        out["deep_dive"].append({
            "theme": theme[:220],
            "for_you": "",
            "this_week": "Pick one resume bullet that relates to this theme and add a measurable outcome.",
        })
    return out


async def _career_playbook_core(request: Request, body: dict) -> dict:
    """Shared implementation: personalized playbook from audit + resume (LLM)."""
    deps.require_subscribed(request)
    audit = body.get("audit") or {}
    profile = body.get("profile") or {}
    baseline = body.get("playbook_baseline") or {}
    track_tips = body.get("track_tips") if isinstance(body.get("track_tips"), list) else []
    effective_track = (body.get("effective_track") or audit.get("detected_track") or "").strip()

    headline = (baseline.get("headline") or "").strip()
    bullets = baseline.get("bullets") if isinstance(baseline.get("bullets"), list) else []
    bullets_s = [str(b).strip() for b in bullets if isinstance(b, (str, int)) and str(b).strip()]

    structured = (audit.get("structured_text") or audit.get("resume_text") or "")[:7500]
    take = (audit.get("dilly_take") or audit.get("meridian_take") or "")[:1400]
    findings = audit.get("audit_findings") or []
    findings_s = [str(f)[:320] for f in findings[:10] if f]
    evidence = audit.get("evidence") or {}
    evidence_q = audit.get("evidence_quotes") or {}
    recs = audit.get("recommendations") or []
    scores = audit.get("scores") or {}
    peer = audit.get("peer_percentiles") or {}
    application_target = (audit.get("application_target") or "").strip()
    strongest = (audit.get("strongest_signal_sentence") or "").strip()[:400]

    name = (profile.get("name") or audit.get("candidate_name") or "Student").strip()
    major = (profile.get("major") or audit.get("major") or "").strip()
    career_goal = (profile.get("career_goal") or "").strip()
    goals = profile.get("goals") if isinstance(profile.get("goals"), list) else []
    goals_s = [str(g).strip() for g in goals[:6] if str(g).strip()]
    school = (profile.get("school_name") or profile.get("target_school") or "").strip()

    user_lines = [
        f"STUDENT: {name}",
        f"EFFECTIVE_TRACK_OR_COHORT: {effective_track or 'Unknown'}",
        f"MAJOR: {major or 'Unknown'}",
        f"SCHOOL: {school}" if school else "",
        f"CAREER_GOAL: {career_goal}" if career_goal else "",
        f"GOALS_IN_APP: {', '.join(goals_s)}" if goals_s else "",
        f"APPLICATION_TARGET: {application_target}" if application_target else "",
        "",
        "GENERIC_TRACK_PLAYBOOK_HEADLINE:",
        headline or "(none)",
        "",
        "GENERIC_TRACK_PLAYBOOK_BULLETS (expand each into a deep, personal section for THIS student):",
        "\n".join(f"- {b}" for b in bullets_s) if bullets_s else "- (none)",
        "",
        "COMMON_MISTAKES_IN_THIS_TRACK:",
        "\n".join(f"- {str(t)[:200]}" for t in track_tips[:8] if isinstance(t, str)),
        "",
    ]
    if scores:
        user_lines.append(
            f"SCORES: Smart {scores.get('smart', 0):.0f}, Grit {scores.get('grit', 0):.0f}, Build {scores.get('build', 0):.0f}"
        )
    if isinstance(peer, dict) and peer:
        pparts: list[str] = []
        for k in ("smart", "grit", "build"):
            v = peer.get(k)
            if v is None:
                continue
            try:
                pparts.append(f"{k}={int(float(v))}")
            except (TypeError, ValueError):
                continue
        if pparts:
            user_lines.append("PEER_PERCENTILES (raw dimension values from audit): " + ", ".join(pparts))
    if take:
        user_lines.extend(["", "DILLY_SUMMARY:", take])
    if strongest:
        user_lines.extend(["", "STRONGEST_SIGNAL:", strongest])
    if findings_s:
        user_lines.extend(["", "AUDIT_FINDINGS:"] + [f"- {f}" for f in findings_s])
    for dim in ("smart", "grit", "build"):
        ev = evidence.get(dim) if isinstance(evidence, dict) else None
        if ev:
            user_lines.append(f"EVIDENCE_{dim.upper()}: {str(ev)[:450]}")
        eq = evidence_q.get(dim) if isinstance(evidence_q, dict) else None
        if eq:
            user_lines.append(f"QUOTE_{dim.upper()}: {str(eq)[:350]}")
    if isinstance(recs, list) and recs:
        user_lines.append("")
        user_lines.append("TOP_RECOMMENDATIONS:")
        for r in recs[:10]:
            if not isinstance(r, dict):
                continue
            title = (r.get("title") or r.get("text") or "")[:180]
            if not title.strip():
                continue
            sug = (r.get("suggested_line") or r.get("diagnosis") or "")[:240]
            user_lines.append(f"- {title}" + (f" | Suggested: {sug}" if sug else ""))
    if structured.strip():
        user_lines.extend(["", "STRUCTURED_RESUME_TEXT (cite only from here; do not invent employers, titles, or metrics not present):", structured])
    user_content = "\n".join(line for line in user_lines if line is not None)

    system = """You are Dilly (Dilly Careers). The student tapped "View Full Playbook" on Get Hired. They expect a long, personal brief: not generic advice, but a playbook that feels written for them after reading their resume and audit.

Output ONLY valid JSON (no markdown fences) with this exact structure:
{
  "opening": "string, 2-5 sentences, second person, warm. Reference their goal, major, or a real detail from the data.",
  "cohort_lens": "string, one rich paragraph: what recruiters in their track actually scan for, tied to how THEIR materials read today.",
  "resume_signals": [
    { "signal": "short title", "from_resume": "quote or tight paraphrase grounded ONLY in STRUCTURED_RESUME_TEXT or AUDIT_FINDINGS/EVIDENCE", "why": "why this helps them in their track" }
  ],
  "deep_dive": [
    { "theme": "string, aligns with one GENERIC_TRACK_PLAYBOOK_BULLET", "for_you": "2-5 sentences: interpret that theme for THIS student using audit + resume. Be specific.", "this_week": "one concrete action they can do in under an hour" }
  ],
  "gaps_to_close": ["string", "3-6 items: sharp gaps, mix of resume and search behavior"],
  "closer": "2-3 sentences, personal, forward-looking"
}

Rules:
- Produce exactly len(GENERIC_TRACK_PLAYBOOK_BULLETS) items in deep_dive, in the same order as the bullets listed (if 3 bullets, 3 deep_dive objects). Each theme should clearly map to that bullet.
- resume_signals: 3-5 items when possible; if resume text is missing, return [] and say in opening that they should paste or re-audit.
- Never invent employers, job titles, internships, GPAs, or metrics not present in context. If unsure, speak in conditional language ("If you add X...") or recommend they quantify in their next edit.
- Use DILLY_SUMMARY and AUDIT_FINDINGS as authoritative voice about their profile.
- No em dashes. Avoid clichés ("synergy"). Sound like a sharp mentor who read their file twice.
"""

    if not bullets_s:
        return _career_playbook_fallback(effective_track, headline, ["Build proof that matches your target role"], track_tips)

    if not is_llm_available():
        return _career_playbook_fallback(effective_track, headline, bullets_s, track_tips)

    from dilly_core.llm_client import get_chat_completion, get_light_model

    # Career playbook. Was 3200 output tokens — the single most
    # expensive paid-tier call (~$0.013 just on output). Tightening
    # to 2000; playbook renders in 2k easily, 3200 was padding.
    raw = get_chat_completion(
        system,
        user_content,
        model=get_light_model(),
        temperature=0.42,
        max_tokens=2000,
    )
    parsed = _parse_career_playbook_response(raw) if raw else None
    if not isinstance(parsed, dict):
        return _career_playbook_fallback(effective_track, headline, bullets_s, track_tips)

    normalized = _normalize_career_playbook(parsed, bullets_s)
    if not normalized.get("opening") or not normalized.get("cohort_lens"):
        return _career_playbook_fallback(effective_track, headline, bullets_s, track_tips)
    return normalized


@router.post("/career-playbook")
async def career_playbook(request: Request, body: dict = Body(...)):
    """Personalized, cohort-aware playbook narrative from audit + resume text (LLM)."""
    return await _career_playbook_core(request, body)


@router.post("/audit/career-playbook")
async def career_playbook_audit_alias(request: Request, body: dict = Body(...)):
    """Alias for POST /career-playbook (same body/response). Use if only /audit/* is routed in front of the API."""
    return await _career_playbook_core(request, body)


@router.post("/audit/batch")
async def audit_batch(request: Request, files: list[UploadFile] = File(...), cohort_id: str | None = Form(None)):
    deps.require_subscribed(request)
    if not files or len(files) > 100:
        raise errors.validation_error("Provide 1–100 PDF or DOCX files.")
    for f in files:
        if not _allowed_resume_file(f.filename or ""):
            raise errors.validation_error(f"Unsupported file: {f.filename}. Dilly only reads PDF and DOCX.")
    results = []
    for up in files:
        ext = ".pdf" if (up.filename or "").lower().endswith(".pdf") else ".docx"
        temp_path = os.path.join(tempfile.gettempdir(), f"dilly_batch_{uuid.uuid4().hex}{ext}")
        try:
            with open(temp_path, "wb") as buf:
                shutil.copyfileobj(up.file, buf)
            auditor = DillyResumeAuditor(temp_path)
            if not auditor.extract_text():
                results.append({"filename": up.filename, "error": "Failed to extract text"})
                continue
            text = auditor.raw_text
            from dilly_core.resume_parser import parse_resume
            from dilly_core.auditor import name_from_filename
            parsed = parse_resume(text, filename=up.filename)
            candidate_name = parsed.name or name_from_filename(up.filename or "") or "Unknown"
            major = parsed.major or "Unknown"
            text_for_audit = parsed.normalized_text or text
            use_llm = os.environ.get("DILLY_USE_LLM", "").strip().lower() in ("1", "true", "yes")
            if use_llm and is_llm_available():
                from dilly_core.llm_auditor import run_audit_llm
                result = run_audit_llm(text_for_audit, candidate_name=candidate_name, major=major, filename=up.filename)
            else:
                from dilly_core.auditor import run_audit
                result = run_audit(text_for_audit, candidate_name=candidate_name, major=major, filename=up.filename)
            scores = {"smart": result.smart_score, "grit": result.grit_score, "build": result.build_score}
            results.append({
                "filename": up.filename,
                "candidate_name": result.candidate_name,
                "track": result.track,
                "scores": scores,
                "final_score": result.final_score,
            })
            _write_audit_log({
                "track": result.track,
                "smart": result.smart_score,
                "grit": result.grit_score,
                "build": result.build_score,
                "final": result.final_score,
                "ts": time.time(),
                "cohort_id": cohort_id,
                "use_for_fewshot": False,
            })
        except Exception as e:
            results.append({"filename": up.filename, "error": str(e)})
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    by_track: dict[str, list] = {}
    for r in results:
        if "error" in r:
            continue
        t = r.get("track") or "Humanities"
        by_track.setdefault(t, []).append(r)
    cohort = {
        "total_audited": len([r for r in results if "error" not in r]),
        "total_errors": len([r for r in results if "error" in r]),
        "by_track": {},
        "averages": {},
    }
    for track, list_r in by_track.items():
        n = len(list_r)
        cohort["by_track"][track] = {"count": n}
        if n:
            cohort["by_track"][track]["avg_smart"] = round(sum(x["scores"]["smart"] for x in list_r) / n, 1)
            cohort["by_track"][track]["avg_grit"] = round(sum(x["scores"]["grit"] for x in list_r) / n, 1)
            cohort["by_track"][track]["avg_build"] = round(sum(x["scores"]["build"] for x in list_r) / n, 1)
            cohort["by_track"][track]["avg_final"] = round(sum(x["final_score"] for x in list_r) / n, 1)
    all_ok = [r for r in results if "error" not in r]
    if all_ok:
        n = len(all_ok)
        cohort["averages"] = {
            "smart": round(sum(r["scores"]["smart"] for r in all_ok) / n, 1),
            "grit": round(sum(r["scores"]["grit"] for r in all_ok) / n, 1),
            "build": round(sum(r["scores"]["build"] for r in all_ok) / n, 1),
            "final": round(sum(r["final_score"] for r in all_ok) / n, 1),
        }
    return {"results": results, "cohort_report": cohort}
