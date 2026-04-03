"""
Candidate index: store embedding + metadata per user for recruiter semantic search.

One file per user in their profile folder: candidate_index.json.
Structure: { "embedding": [float], "model": str, "skill_tags": list[str], "updated_at": str }.

Quality bar (Mercor-grade):
- Defensive read/write: no crash on missing file, bad JSON, or invalid embedding list.
- Normalized output: skill_tags are non-empty strings; embedding is list of float; model/updated_at always set.
- Single source of truth: index_candidate_after_audit() builds doc → embed → save; one path.

Contract:
- save_candidate_embedding(email, embedding, skill_tags?, model?): returns True/False. Creates folder if needed.
- load_candidate_embedding(email): returns dict(embedding, model, skill_tags, updated_at) or None. Never raises.
- index_candidate_after_audit(email, profile?, audit?, resume_text?): returns True if saved, False otherwise. Never raises.
Ref: projects/meridian/docs/RECRUITER_SEMANTIC_MATCHING_SPEC.md
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from .profile_store import get_profile_folder_path

_FILENAME = "candidate_index.json"


def _resume_text_from_resume_edited_json(path: str, max_chars: int = 60000) -> str:
    """
    Convert structured resume_edited.json into plain text for embedding + tag extraction.
    Best-effort; never raises.
    """
    if not path or not os.path.isfile(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return ""
    sections = data.get("sections")
    if not isinstance(sections, list):
        return ""
    parts: list[str] = []
    for s in sections:
        if not isinstance(s, dict):
            continue
        label = (s.get("label") or s.get("key") or "").strip()
        if label:
            parts.append(label.upper())
        edu = s.get("education") if isinstance(s.get("education"), dict) else None
        if edu:
            uni = (edu.get("university") or "").strip()
            major = (edu.get("major") or "").strip()
            minor = (edu.get("minor") or "").strip()
            if uni:
                parts.append(uni)
            line = " · ".join([x for x in [major, minor] if x])
            if line:
                parts.append(line)
        exps = s.get("experiences")
        if isinstance(exps, list):
            for e in exps[:40]:
                if not isinstance(e, dict):
                    continue
                company = (e.get("company") or "").strip()
                role = (e.get("role") or "").strip()
                date = (e.get("date") or "").strip()
                loc = (e.get("location") or "").strip()
                header = " | ".join([x for x in [company, role, date, loc] if x])
                if header:
                    parts.append(header)
                bullets = e.get("bullets")
                if isinstance(bullets, list):
                    for b in bullets[:12]:
                        if isinstance(b, dict):
                            text = (b.get("text") or "").strip()
                        else:
                            text = str(b).strip()
                        if text:
                            parts.append(f"- {text}")
        # simple/skills section: may be plain text, a dict with 'lines', or a list
        simple = s.get("simple")
        if simple:
            try:
                if isinstance(simple, dict):
                    lines = simple.get("lines")
                    if isinstance(lines, list):
                        for line in lines:
                            t = str(line).strip()
                            if t:
                                parts.append(t)
                    else:
                        txt = str(simple.get("text") or "").strip()
                        if txt:
                            parts.append(txt)
                elif isinstance(simple, list):
                    for item in simple:
                        t = str(item).strip()
                        if t:
                            parts.append(t)
                else:
                    txt = str(simple).strip()
                    if txt:
                        parts.append(txt)
            except Exception:
                pass
    out = "\n".join(parts).strip()
    if max_chars and len(out) > max_chars:
        out = out[: max_chars - 80] + "\n\n[... truncated for context ...]"
    return out


def _index_path(email: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        return ""
    return os.path.join(folder, _FILENAME)


def save_candidate_embedding(
    email: str,
    embedding: list[float],
    skill_tags: list[str] | None = None,
    skill_tags_v2: list[str] | None = None,
    tag_evidence: dict[str, list[str]] | None = None,
    model: str | None = None,
) -> bool:
    """
    Save embedding and metadata to the user's profile folder.
    Creates folder if needed. Returns True on success, False on failure.
    """
    if not email or not (email or "").strip():
        return False
    email = (email or "").strip().lower()
    path = _index_path(email)
    if not path:
        return False
    if not embedding or not isinstance(embedding, list):
        return False
    try:
        vec = [float(x) for x in embedding]
    except (TypeError, ValueError):
        return False
    tags = skill_tags if isinstance(skill_tags, list) else []
    tags = [str(t).strip() for t in tags if t and str(t).strip()]
    tags_v2 = skill_tags_v2 if isinstance(skill_tags_v2, list) else []
    tags_v2 = [str(t).strip() for t in tags_v2 if t and str(t).strip()]
    if not tags_v2:
        tags_v2 = list(tags)
    ev = tag_evidence if isinstance(tag_evidence, dict) else {}
    payload = {
        "embedding": vec,
        "model": (model or "text-embedding-3-small").strip(),
        "skill_tags": tags,
        "skill_tags_v2": tags_v2,
        "tag_evidence": ev,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    dirpath = os.path.dirname(path)
    try:
        os.makedirs(dirpath, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=0)
        return True
    except Exception:
        return False


def load_candidate_embedding(email: str) -> dict[str, Any] | None:
    """
    Load candidate index for email. Returns dict with embedding, model, skill_tags, updated_at
    or None if missing/invalid.
    """
    if not email or not (email or "").strip():
        return None
    email = (email or "").strip().lower()
    path = _index_path(email)
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None
    if not isinstance(data, dict) or "embedding" not in data:
        return None
    emb = data.get("embedding")
    if not isinstance(emb, list) or len(emb) == 0:
        return None
    try:
        vec = [float(x) for x in emb]
    except (TypeError, ValueError):
        return None
    return {
        "embedding": vec,
        "model": str(data.get("model") or "").strip() or "text-embedding-3-small",
        "skill_tags": [str(t) for t in (data.get("skill_tags") or []) if t],
        "updated_at": str(data.get("updated_at") or "").strip(),
    }


def index_candidate_after_audit(
    email: str,
    profile: dict | None,
    audit: dict | None,
    resume_text: str | None = None,
) -> bool:
    """
    Build candidate document from Meridian profile + audit + resume + profile narrative, embed, save.
    Uses full profile (goals, career_goal, track, etc.) and optional dilly_profile_txt content
    so recruiter matching reflects everything the student told Meridian, not just resume.
    Call after append_audit or on profile update. Returns True if index was saved, False otherwise.
    """
    if not email or not (email or "").strip():
        return False
    email = (email or "").strip().lower()
    profile = profile or {}
    audit = audit or {}
    try:
        from dilly_core.candidate_document import build_candidate_document
        from dilly_core.embedding import get_embedding
        from dilly_core.skill_tags import extract_skill_tags
    except ImportError:
        return False
    # Load profile narrative (full .txt) when present so matching uses what they told Meridian
    profile_narrative = ""
    try:
        from projects.dilly.api.dilly_profile_txt import get_dilly_profile_txt_content
        profile_narrative = get_dilly_profile_txt_content(email, max_chars=4000) or ""
    except Exception:
        pass
    # If resume_text not provided (e.g. profile-only update), try to load stored resume.
    # Accept the result only when it contains meaningful content (>= 300 chars).
    _MIN_USEFUL_RESUME_LEN = 300
    if not (resume_text and len(resume_text.strip()) >= _MIN_USEFUL_RESUME_LEN):
        try:
            from projects.dilly.api.resume_loader import load_parsed_resume_for_voice
            loaded = load_parsed_resume_for_voice(email, max_chars=50000) or ""
            if len(loaded.strip()) >= _MIN_USEFUL_RESUME_LEN:
                resume_text = loaded
        except Exception:
            pass
    # If still short/missing, try structured resume_edited.json in profile folder.
    if not (resume_text and len(resume_text.strip()) >= _MIN_USEFUL_RESUME_LEN):
        try:
            folder = get_profile_folder_path(email)
            candidate_resume = os.path.join(folder, "resume_edited.json")
            edited = _resume_text_from_resume_edited_json(candidate_resume, max_chars=50000) or ""
            if len(edited.strip()) >= _MIN_USEFUL_RESUME_LEN:
                # Merge: prefer longer of the two, or combine when both exist
                if resume_text and len(resume_text.strip()) > len(edited.strip()):
                    pass  # keep existing
                else:
                    resume_text = edited
        except Exception:
            pass
    doc = build_candidate_document(profile, audit, resume_text, profile_narrative=profile_narrative or None)
    if not doc or not doc.strip():
        return False
    embedding = get_embedding(doc)
    if not embedding:
        return False
    # Extract tags: prefer LLM extraction (contextual, confidence-graded), fall back to regex.
    skill_tags_v2: list[str] = []
    tag_evidence: dict[str, list[str]] = {}

    # Combine resume + profile narrative for LLM extraction (richer context)
    llm_input = ""
    if resume_text and resume_text.strip():
        llm_input = resume_text.strip()
    if profile_narrative and profile_narrative.strip():
        llm_input = (llm_input + "\n\n" + profile_narrative.strip()).strip()

    if llm_input and len(llm_input) >= 200:
        try:
            from dilly_core.skill_tags import llm_extract_skill_tags
            llm_result = llm_extract_skill_tags(llm_input)
            if llm_result is not None:
                skill_tags_v2, tag_evidence = llm_result
        except Exception:
            pass

    # Fallback: regex-based extraction when LLM unavailable or returned nothing
    if not skill_tags_v2:
        if resume_text and resume_text.strip():
            parsed_for_tags = {"sections": {"skills": resume_text, "professional experience": resume_text, "projects": resume_text, "experience": resume_text, "education": resume_text, "research": resume_text}}
            try:
                from dilly_core.skill_tags import extract_skill_tags_with_evidence
                skill_tags_v2, tag_evidence = extract_skill_tags_with_evidence(parsed_resume=parsed_for_tags, audit=audit, profile=profile, profile_narrative=profile_narrative or None)
            except Exception:
                skill_tags_v2 = extract_skill_tags(parsed_resume=parsed_for_tags, audit=audit, profile=profile)
                tag_evidence = {}
        else:
            try:
                from dilly_core.skill_tags import extract_skill_tags_with_evidence
                skill_tags_v2, tag_evidence = extract_skill_tags_with_evidence(parsed_resume=None, audit=audit, profile=profile, profile_narrative=profile_narrative or None)
            except Exception:
                skill_tags_v2 = extract_skill_tags(parsed_resume=None, audit=audit, profile=profile)
                tag_evidence = {}

    # Keep legacy tags for existing callers/UI: best-effort subset from v2
    skill_tags_legacy = list(skill_tags_v2 or [])
    return save_candidate_embedding(
        email,
        embedding,
        skill_tags=skill_tags_legacy,
        skill_tags_v2=skill_tags_v2,
        tag_evidence=tag_evidence or {},
    )
