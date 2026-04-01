"""
Candidate document builder for semantic search and recruiter matching.

Builds a single, high-quality text "candidate document" from profile + audit + optional
resume so we can embed it once per candidate and use it for deep semantic search.
No interview data — resume and audit only.

Quality bar: Mercor-grade. Output is consistent, structured, and embedding-optimized:
- Deterministic section order and headers
- Normalized whitespace; no stray "None" or junk
- Bounded length so we never exceed embedding context
- Supports all current audit shapes (V1/V2, findings vs audit_findings, evidence vs evidence_quotes)

Used by: embedding pipeline (on audit complete), future recruiter search.
Ref: projects/meridian/docs/RECRUITER_SEMANTIC_MATCHING_SPEC.md
"""

from __future__ import annotations

import re
from typing import Any

# -----------------------------------------------------------------------------
# Limits (embedding-friendly). Total doc must stay under typical model context.
# OpenAI text-embedding-3-small: 8191 tokens ~= ~32k chars; we cap much lower
# so one doc is one clean chunk and we can batch many candidates.
# -----------------------------------------------------------------------------
TOTAL_CHAR_CAP = 8_192
MAX_RESUME_SECTION_CHARS = 3_200
MAX_EVIDENCE_SECTION_CHARS = 1_200
MAX_AUDIT_SECTION_CHARS = 1_400
MAX_DILLY_TAKE_CHARS = 400
MAX_RECOMMENDATION_CHARS_EACH = 280
MAX_RECOMMENDATIONS = 5
MAX_PROFILE_NARRATIVE_CHARS = 2_400  # What they told Meridian (voice, goals, etc.)


def _normalize_str(value: Any) -> str:
    """Strip, collapse whitespace; never return 'None' or raw None."""
    if value is None:
        return ""
    s = str(value).strip()
    s = re.sub(r"\s+", " ", s)
    return s


def _truncate(s: str, max_len: int, suffix: str = "…") -> str:
    if not s or len(s) <= max_len:
        return s
    return (s[: max_len - len(suffix)].rstrip() + suffix).strip()


def _safe_int(value: Any) -> int | None:
    """Coerce to int for scores; return None if not a number."""
    if value is None:
        return None
    try:
        n = int(round(float(value)))
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def _recommendation_to_text(rec: Any) -> str:
    """Extract a single display string from a recommendation (V1 or V2 schema)."""
    if not rec:
        return ""
    if isinstance(rec, str):
        return _normalize_str(rec)
    if not isinstance(rec, dict):
        return ""
    # V2: title, action (AuditRecommendation)
    title = _normalize_str(rec.get("title"))
    action = _normalize_str(rec.get("action"))
    text = _normalize_str(rec.get("text"))
    if text:
        return _truncate(text, MAX_RECOMMENDATION_CHARS_EACH)
    if title and action:
        combined = f"{title}: {action}" if action != title else title
        return _truncate(combined, MAX_RECOMMENDATION_CHARS_EACH)
    if title:
        return _truncate(title, MAX_RECOMMENDATION_CHARS_EACH)
    if action:
        return _truncate(action, MAX_RECOMMENDATION_CHARS_EACH)
    return ""


def _get_findings(audit: dict) -> list[str]:
    """Audit can have audit_findings (V2) or findings (legacy)."""
    raw = audit.get("audit_findings") or audit.get("findings")
    if not raw or not isinstance(raw, list):
        return []
    return [_normalize_str(f) for f in raw if f and _normalize_str(f)]


def _get_evidence(audit: dict) -> dict[str, str]:
    """Evidence can be evidence or evidence_quotes; keys smart, grit, build."""
    evidence = audit.get("evidence") or audit.get("evidence_quotes") or {}
    if not isinstance(evidence, dict):
        return {}
    return {
        k: _normalize_str(v)
        for k, v in evidence.items()
        if v is not None and _normalize_str(v)
    }


def _build_identity_block(profile: dict, audit: dict) -> str:
    """Identity from profile only (user-set); resume-parsed name/major are not used."""
    name = _normalize_str(profile.get("name"))
    major = _normalize_str(profile.get("major"))
    majors = profile.get("majors")
    if not majors and major:
        majors = [major]
    if majors and isinstance(majors, list):
        majors = [_normalize_str(m) for m in majors if _normalize_str(m)]
    else:
        majors = []
    track = _normalize_str(profile.get("track") or audit.get("detected_track"))
    career_goal = _normalize_str(profile.get("career_goal"))
    application_target = _normalize_str(profile.get("application_target"))
    goals = profile.get("goals")
    if isinstance(goals, list) and goals:
        goals_str = ", ".join(_normalize_str(g) for g in goals if _normalize_str(g))
    else:
        goals_str = ""
    job_locations = profile.get("job_locations")
    if isinstance(job_locations, list) and job_locations:
        loc_str = ", ".join(_normalize_str(x) for x in job_locations if _normalize_str(x))
    else:
        loc_str = ""
    minors = profile.get("minors")
    if isinstance(minors, list) and minors:
        minors_str = ", ".join(_normalize_str(m) for m in minors if _normalize_str(m))
    else:
        minors_str = ""
    lines = []
    if name:
        lines.append(f"Candidate: {name}")
    if majors:
        lines.append(f"Major(s): {', '.join(majors)}")
    if track:
        lines.append(f"Track: {track}")
    if goals_str:
        lines.append(f"Goals: {goals_str}")
    if career_goal:
        lines.append(f"Career goal: {career_goal}")
    if application_target:
        lines.append(f"Application target: {application_target}")
    if loc_str:
        lines.append(f"Preferred locations: {loc_str}")
    if minors_str:
        lines.append(f"Minors: {minors_str}")
    return "\n".join(lines) if lines else ""


def _build_resume_block(resume_text: str | None, audit: dict) -> str:
    """Resume excerpt, or fallback to evidence + findings when no resume text."""
    if resume_text and resume_text.strip():
        return _truncate(resume_text.strip(), MAX_RESUME_SECTION_CHARS)
    evidence = _get_evidence(audit)
    findings = _get_findings(audit)
    if not evidence and not findings:
        return ""
    parts = []
    for dim, text in evidence.items():
        if text:
            parts.append(f"{dim}: {_truncate(text, 380)}")
    if findings:
        for f in findings[:12]:
            if f:
                parts.append(f"• {_truncate(f, 320)}")
    block = "\n".join(parts)
    return _truncate(block, MAX_EVIDENCE_SECTION_CHARS)


def _build_audit_block(audit: dict) -> str:
    """Track, scores, meridian take, recommendations. Structured for embedding."""
    track = _normalize_str(audit.get("detected_track"))
    scores = audit.get("scores") or {}
    smart = _safe_int(scores.get("smart"))
    grit = _safe_int(scores.get("grit"))
    build = _safe_int(scores.get("build"))
    final = _safe_int(audit.get("final_score"))
    dilly_take = _normalize_str(audit.get("dilly_take") or audit.get("meridian_take"))
    recs_raw = audit.get("recommendations") or []
    rec_texts: list[str] = []
    seen: set[str] = set()
    for r in recs_raw:
        t = _recommendation_to_text(r)
        if t and t not in seen:
            seen.add(t)
            rec_texts.append(t)
            if len(rec_texts) >= MAX_RECOMMENDATIONS:
                break
    lines = []
    if track:
        lines.append(f"Track: {track}")
    if smart is not None or grit is not None or build is not None or final is not None:
        score_parts = []
        if smart is not None:
            score_parts.append(f"Smart {smart}")
        if grit is not None:
            score_parts.append(f"Grit {grit}")
        if build is not None:
            score_parts.append(f"Build {build}")
        if final is not None:
            score_parts.append(f"Overall {final}")
        if score_parts:
            lines.append(", ".join(score_parts))
    if dilly_take:
        lines.append(f"Dilly take: {_truncate(dilly_take, MAX_DILLY_TAKE_CHARS)}")
    if rec_texts:
        lines.append("Do these next:")
        for t in rec_texts:
            lines.append(f"• {t}")
    return "\n".join(lines) if lines else ""


MAX_VOICE_DATA_CHARS = 1_800  # beyond_resume + experience_expansion block


def _build_voice_data_block(profile: dict) -> str:
    """
    Build a text block from Voice-captured data (beyond_resume + experience_expansion).
    These are skills, tools, and experiences the student told Dilly that aren't on their resume.
    Including them here means recruiter matching and job matching benefit from everything captured.
    """
    parts: list[str] = []

    beyond = profile.get("beyond_resume")
    if isinstance(beyond, list) and beyond:
        items_by_type: dict[str, list[str]] = {"skill": [], "experience": [], "project": [], "other": []}
        for item in beyond:
            if not isinstance(item, dict):
                continue
            t = (item.get("type") or "other").strip().lower()
            if t not in items_by_type:
                t = "other"
            text = _normalize_str(item.get("text") or "")
            if text:
                items_by_type[t].append(text)
        if items_by_type["skill"]:
            parts.append("Additional skills (told Meridian): " + "; ".join(items_by_type["skill"][:20]))
        if items_by_type["project"]:
            parts.append("Additional projects (told Meridian): " + "; ".join(items_by_type["project"][:10]))
        if items_by_type["experience"]:
            parts.append("Additional experience (told Meridian): " + "; ".join(items_by_type["experience"][:10]))
        if items_by_type["other"]:
            parts.append("Other (told Meridian): " + "; ".join(items_by_type["other"][:10]))

    expansion = profile.get("experience_expansion")
    if isinstance(expansion, list) and expansion:
        for entry in expansion[:8]:
            if not isinstance(entry, dict):
                continue
            role = _normalize_str(entry.get("role_label") or "")
            org = _normalize_str(entry.get("organization") or "")
            label = f"{role} at {org}" if org else role
            if not label:
                continue
            sub: list[str] = []
            skills = [_normalize_str(s) for s in (entry.get("skills") or []) if _normalize_str(s)]
            tools = [_normalize_str(t) for t in (entry.get("tools_used") or []) if _normalize_str(t)]
            omitted = [_normalize_str(o) for o in (entry.get("omitted") or []) if _normalize_str(o)]
            if skills:
                sub.append("skills: " + ", ".join(skills[:12]))
            if tools:
                sub.append("tools: " + ", ".join(tools[:12]))
            if omitted:
                sub.append("achievements not on resume: " + "; ".join(omitted[:5]))
            if sub:
                parts.append(f"{label} — " + "; ".join(sub))

    if not parts:
        return ""
    block = "\n".join(parts)
    return _truncate(block, MAX_VOICE_DATA_CHARS)


def build_candidate_document(
    profile: dict | None,
    audit: dict | None,
    resume_text: str | None = None,
    profile_narrative: str | None = None,
) -> str:
    """
    Build a single candidate document string from profile, audit, optional resume, and optional narrative.
    This is the text we embed for semantic search (recruiter matching). Includes everything Meridian
    knows so that what the student told Meridian (e.g. in Voice or profile) is searchable.

    Args:
        profile: Meridian profile (name, major, majors, track, goals, career_goal, application_target, job_locations, minors, etc.)
        audit: Latest audit (scores, detected_track, findings, evidence, recommendations, dilly_take)
        resume_text: Optional full or structured resume text. If None, uses audit evidence/findings.
        profile_narrative: Optional full text of what Meridian knows (e.g. dilly_profile_txt content). When present, included so matching reflects voice/profile-only info.

    Returns:
        Single string suitable for embedding. Never exceeds TOTAL_CHAR_CAP.
    """
    profile = profile or {}
    audit = audit or {}
    sections: list[tuple[str, str]] = []

    identity = _build_identity_block(profile, audit)
    if identity:
        sections.append(("Identity", identity))

    if profile_narrative and profile_narrative.strip():
        narrative = _truncate(profile_narrative.strip(), MAX_PROFILE_NARRATIVE_CHARS)
        sections.append(("What they told Meridian", narrative))

    voice_block = _build_voice_data_block(profile)
    if voice_block:
        sections.append(("Voice-captured skills and experience", voice_block))

    resume_block = _build_resume_block(resume_text, audit)
    if resume_block:
        sections.append(("Resume / experience", resume_block))

    audit_block = _build_audit_block(audit)
    if audit_block:
        sections.append(("Meridian assessment", audit_block))

    if not sections:
        return "No profile or audit data."

    # Assemble with clear section headers (helps embedding models)
    doc_parts: list[str] = []
    for title, body in sections:
        doc_parts.append(f"[{title}]")
        doc_parts.append(body)
        doc_parts.append("")
    doc = "\n".join(doc_parts).strip()

    if len(doc) > TOTAL_CHAR_CAP:
        doc = _truncate(doc, TOTAL_CHAR_CAP)
    return doc


def build_candidate_document_parts(
    profile: dict | None,
    audit: dict | None,
    resume_text: str | None = None,
) -> dict[str, str]:
    """
    Build the full document and also return resume_summary and audit_summary parts
    for storage or debugging. Full document is the canonical embedding input.
    """
    profile = profile or {}
    audit = audit or {}
    identity = _build_identity_block(profile, audit)
    resume_block = _build_resume_block(resume_text, audit)
    audit_block = _build_audit_block(audit)

    resume_summary_parts = []
    if identity:
        resume_summary_parts.append(identity)
    if resume_block:
        resume_summary_parts.append(resume_block)
    resume_summary = "\n\n".join(resume_summary_parts).strip() if resume_summary_parts else "(none)"
    audit_summary = audit_block.strip() if audit_block else "(none)"

    document = build_candidate_document(profile, audit, resume_text)
    return {
        "resume_summary": resume_summary,
        "audit_summary": audit_summary,
        "document": document,
    }
