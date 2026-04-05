"""
Skill tags extraction for recruiter matching and candidate index.

Produces a normalized list of skill/competency tags from parser + audit (no interview).
Used for: skill_fit_score (overlap with role requirements), filters, and candidate index.

Quality bar (Mercor-grade):
- Consistent output: same inputs → same sorted list; no None, empty strings, or junk.
- Schema-tolerant: supports parser (ParsedResume or dict with sections), audit (V1/V2,
  audit_findings or findings, evidence or evidence_quotes). Defensive access; no KeyError.
- Bounded: list capped at MAX_SKILL_TAGS (25). Vocab-only; no free-form tags (controlled vocabulary).
- Single source of truth: extract_skill_tags() is the only public entry; parser and audit
  are merged in fixed order (parser first, then audit), then deduped and sorted.
- Documented contract: see CONTRACT below.

Contract:
- Inputs: parsed_resume (ParsedResume or None), audit (dict or None), profile (dict or None; reserved).
- Parser keys used: sections (dict of section_key -> str). Section keys matched case-insensitively
  for "skills", "experience", "projects", "education", "research", "summary", "objective", etc.
- Audit keys used: detected_track, audit_findings or findings (list of str), evidence or evidence_quotes (dict).
- Output: list[str], 0 to MAX_SKILL_TAGS elements, sorted, each non-empty. Never None.
- When a key is missing or wrong type: that source contributes nothing; no exception.

Ref: projects/dilly/docs/RECRUITER_SEMANTIC_MATCHING_SPEC.md §3
"""

from __future__ import annotations

import re
from typing import Any

from dilly_core.tag_ontology import all_vocab

MAX_SKILL_TAGS = 25

# Canonical technical skills: lowercase key (no trailing space) -> display form.
# Match is word-boundary so "excel" does not match "excellent".
TECHNICAL_VOCAB: dict[str, str] = {
    "python": "Python",
    "java": "Java",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "sql": "SQL",
    "c++": "C++",
    "c#": "C#",
    "go": "Go",
    "golang": "Go",
    "excel": "Excel",
    "tableau": "Tableau",
    "power bi": "Power BI",
    "powerbi": "Power BI",
    "html": "HTML",
    "css": "CSS",
    "react": "React",
    "node": "Node.js",
    "node.js": "Node.js",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "git": "Git",
    "linux": "Linux",
    "data analysis": "Data analysis",
    "data analytics": "Data analytics",
    "machine learning": "Machine learning",
    "ml": "Machine learning",
    "artificial intelligence": "Machine learning",
    "ai": "Machine learning",
    "classification model": "Machine learning",
    "predictive model": "Machine learning",
    "logistic regression": "Machine learning",
    "neural network": "Machine learning",
    "deep learning": "Machine learning",
    "statistics": "Statistics",
    "research": "Research",
    "latex": "LaTeX",
    "spss": "SPSS",
    "stata": "Stata",
    "sas": "SAS",
}

# Soft/behavioral tags: lowercase key -> display form.
SOFT_VOCAB: dict[str, str] = {
    "leadership": "Leadership",
    "teamwork": "Teamwork",
    "team work": "Teamwork",
    "communication": "Communication",
    "project management": "Project management",
    "cross-functional": "Cross-functional",
    "analytical": "Analytical",
    "problem solving": "Problem solving",
    "problem-solving": "Problem solving",
    "critical thinking": "Critical thinking",
    "public speaking": "Public speaking",
    "presentation": "Presentation",
    "mentorship": "Mentorship",
    "mentor": "Mentorship",
    "collaboration": "Collaboration",
    "organization": "Organization",
    "time management": "Time management",
    "client": "Client-facing",
    "client-facing": "Client-facing",
    "teaching": "Teaching",
    "tutoring": "Tutoring",
    "volunteer": "Volunteer",
    "research": "Research",
}

# Audit detected_track (normalized) -> tag to add.
TRACK_AS_TAG: dict[str, str] = {
    "tech": "Tech",
    "technology": "Tech",
    "pre_health": "Pre-Health",
    "pre-health": "Pre-Health",
    "pre_law": "Pre-Law",
    "pre-law": "Pre-Law",
    "finance": "Finance",
    "consulting": "Consulting",
    "business": "Business",
    "science": "Science",
    "communications": "Communications",
    "education": "Education",
    "arts": "Arts",
    "humanities": "Humanities",
}


def _normalize(s: str) -> str:
    """Collapse whitespace; never return None. Empty input -> ""."""
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s).strip()).strip()


def _tokenize_skills_section(content: str) -> list[str]:
    """Split skills section on common delimiters; return trimmed tokens (2–80 chars)."""
    if not content or not isinstance(content, str):
        return []
    text = content.strip().lower()
    if not text:
        return []
    tokens = re.split(r"[,;|\n•·]|\s+and\s+", text)
    out = []
    for t in tokens:
        t = _normalize(t)
        if t and 2 <= len(t) <= 80:
            out.append(t)
    return out


def _match_token_to_vocab(token: str, vocab: dict[str, str]) -> str | None:
    """
    Match a single token (e.g. from skills section) to vocab using word-boundary.
    Returns canonical tag or None. Prevents "excel" matching "excellent".
    """
    if not token or not isinstance(token, str):
        return None
    t_lower = token.lower().strip()
    if not t_lower:
        return None
    for key, canonical in vocab.items():
        k = key.strip()
        if not k:
            continue
        # Token equals key, or key appears as whole word in token
        if t_lower == k or re.search(r"\b" + re.escape(k) + r"\b", t_lower):
            return canonical
    return None


def _scan_text_for_vocab(text: str, vocab: dict[str, str]) -> list[str]:
    """Word-boundary scan for vocab terms in text. Returns canonical tags, deduped."""
    if not text or not isinstance(text, str) or not text.strip():
        return []
    text_lower = text.lower()
    seen: set[str] = set()
    result: list[str] = []
    for key, canonical in vocab.items():
        k = key.strip()
        if not k:
            continue
        pattern = r"\b" + re.escape(k) + r"\b"
        if re.search(pattern, text_lower) and canonical not in seen:
            seen.add(canonical)
            result.append(canonical)
    return result


def extract_skill_tags_with_evidence(
    *,
    parsed_resume: Any,
    audit: dict | None,
    profile: dict | None,
    profile_narrative: str | None = None,
    max_tags: int = MAX_SKILL_TAGS,
) -> tuple[list[str], dict[str, list[str]]]:
    """
    v2: Extract canonical tags and a small evidence map (tag -> 1-2 proof snippets).
    Evidence is best-effort and bounded; intended for recruiter explainability/reranking.
    """
    tags = extract_skill_tags(parsed_resume=parsed_resume, audit=audit, profile=profile)
    merged_vocab = all_vocab()
    evidence: dict[str, list[str]] = {}
    combined = ""
    # Include resume text so evidence snippets can be extracted from actual resume
    if parsed_resume and isinstance(parsed_resume, dict):
        sections = parsed_resume.get("sections") or {}
        if isinstance(sections, dict):
            for sec_name in ("professional experience", "experience", "projects", "skills", "education", "research"):
                sec_text = sections.get(sec_name)
                if sec_text and isinstance(sec_text, str):
                    combined += "\n" + sec_text[:4000]
    if profile_narrative and isinstance(profile_narrative, str):
        combined += "\n" + profile_narrative[:6000]
    if audit and isinstance(audit, dict):
        for k in ("audit_findings", "findings"):
            arr = audit.get(k)
            if isinstance(arr, list):
                combined += "\n" + "\n".join(str(x) for x in arr[:30] if x)
        ev = audit.get("evidence_quotes") or audit.get("evidence") or {}
        if isinstance(ev, dict):
            combined += "\n" + "\n".join(str(v) for v in ev.values() if v)[:3000]
    combined = combined.strip()
    if combined:
        extra = _scan_text_for_vocab(combined, merged_vocab)
        for t in extra:
            if t not in tags:
                tags.append(t)
    # bound + sort (stable)
    tags = sorted({t for t in tags if t and str(t).strip()})[:max_tags]

    # Evidence: extract short nearby snippets (not generic "Mentions X")
    def _snippet(text: str, start: int, end: int, *, radius: int = 90) -> str:
        a = max(0, start - radius)
        b = min(len(text), end + radius)
        s = text[a:b].replace("\n", " ").strip()
        s = re.sub(r"\s+", " ", s)
        if a > 0:
            s = "…" + s
        if b < len(text):
            s = s + "…"
        return s[:240]

    if combined:
        for key, canonical in merged_vocab.items():
            if canonical not in tags:
                continue
            try:
                m = re.search(r"\b" + re.escape(key) + r"\b", combined, flags=re.IGNORECASE)
            except re.error:
                m = None
            if not m:
                continue
            evidence.setdefault(canonical, [])
            snip = _snippet(combined, m.start(), m.end())
            if snip and snip not in evidence[canonical]:
                evidence[canonical].append(snip)
            if len(evidence[canonical]) >= 2:
                continue

        # Also mine audit evidence quotes directly (these are usually the best proof)
        ev = audit.get("evidence_quotes") if isinstance(audit, dict) else None
        if isinstance(ev, dict):
            for quote in list(ev.values())[:50]:
                q = (str(quote) or "").strip()
                if not q:
                    continue
                for key, canonical in merged_vocab.items():
                    if canonical not in tags:
                        continue
                    if len(evidence.get(canonical, [])) >= 2:
                        continue
                    if re.search(r"\b" + re.escape(key) + r"\b", q, flags=re.IGNORECASE):
                        evidence.setdefault(canonical, [])
                        q2 = re.sub(r"\s+", " ", q)[:240]
                        if q2 and q2 not in evidence[canonical]:
                            evidence[canonical].append(q2)
    tags, evidence = _apply_inference_chains(tags, evidence)
    return tags, evidence


_STRONG_INFERENCE_RE = re.compile(
    r"\b(?:"
    r"built|engineered|engineering|trained|deployed|shipped|implemented|"
    r"developed|developing|launched|managed|managing|created|designed|"
    r"automated|optimized|analyzed|led|leading|spearheaded|architected|"
    r"programmed|programming|executed|integrated|scaled|delivered|"
    r"constructed|founded|co-founded|researched|researching"
    r")\b",
    re.IGNORECASE,
)

_INFERENCE_RULES: list[tuple[str, list[str], bool]] = [
    # (source_tag, inferred_tags, require_strong_evidence)
    ("Machine learning", ["Python", "Statistics"], True),
    ("Financial modeling", ["Excel"], False),
    ("React", ["JavaScript"], False),
    ("Node.js", ["JavaScript"], False),
    ("TypeScript", ["JavaScript"], False),
    ("Data analysis", ["Excel"], True),
    ("Data analytics", ["Excel"], True),
    ("Power BI", ["Excel"], False),
    ("Tableau", ["Excel"], False),
    ("C++", ["Linux"], True),
    ("UI/UX", ["Figma"], False),
]


def _has_strong_evidence(tag: str, evidence: dict[str, list[str]]) -> bool:
    snippets = evidence.get(tag) or []
    for s in snippets[:4]:
        if _STRONG_INFERENCE_RE.search(str(s)):
            return True
    return False


def _apply_inference_chains(
    tags: list[str],
    evidence: dict[str, list[str]],
) -> tuple[list[str], dict[str, list[str]]]:
    """
    Deterministic rules that add "obvious but unlisted" tags when a source tag
    is present (optionally with strong evidence). E.g. strong ML evidence → Python.
    Inferred tags get a synthetic evidence snippet so downstream scoring knows.
    """
    tag_set = set(tags)
    added: list[str] = []
    for source, inferred, require_strong in _INFERENCE_RULES:
        if source not in tag_set:
            continue
        if require_strong and not _has_strong_evidence(source, evidence):
            continue
        for inf_tag in inferred:
            if inf_tag in tag_set:
                continue
            tag_set.add(inf_tag)
            added.append(inf_tag)
            evidence.setdefault(inf_tag, [])
            evidence[inf_tag].append(f"Inferred: strong {source} evidence implies {inf_tag}")
    if added:
        tags = sorted(tag_set)[:MAX_SKILL_TAGS]
    return tags, evidence


def llm_extract_skill_tags(
    resume_text: str,
    *,
    max_tags: int = MAX_SKILL_TAGS,
) -> tuple[list[str], dict[str, list[str]]] | None:
    """
    LLM-based tag + evidence extraction. Reads the full resume text and returns
    canonical tags with confidence-graded evidence. Runs at index time only.

    Returns (tags, evidence) on success, None on failure (missing key, API error,
    bad parse). Caller should fall back to regex extraction on None.
    """
    import json as _json
    import os as _os

    resume_text = (resume_text or "").strip()
    if not resume_text or len(resume_text) < 80:
        return None
    if not (_os.environ.get("OPENAI_API_KEY") or "").strip():
        return None
    try:
        from dilly_core.llm_client import get_chat_completion
    except ImportError:
        return None

    canon_set = sorted(set(all_vocab().values()))
    system = (
        "You are Dilly's skill extraction engine. Given a candidate's resume text "
        "and a canonical tag list, extract every skill/competency the candidate demonstrably has.\n"
        "Return ONLY strict JSON: {\"tags\": [{\"tag\": ..., \"confidence\": ..., \"evidence\": ...}, ...]}.\n"
        "Rules:\n"
        "- tag MUST be from the canonical list provided (exact string match).\n"
        "- confidence is \"high\" (built/led/managed/shipped), \"medium\" (used/applied/studied significantly), "
        "or \"low\" (mentioned/listed/coursework only).\n"
        "- evidence is a SHORT quote (max 120 chars) from the resume proving the tag.\n"
        "- Include contextually implied skills: if they built an ML model, they likely know Python.\n"
        "- Max 20 tags. Quality over quantity.\n"
    )
    user = _json.dumps(
        {
            "canonical_tags": canon_set,
            "resume_text": resume_text[:5000],
        },
        ensure_ascii=False,
    )
    out = get_chat_completion(system, user, max_tokens=1200, temperature=0.0)
    if not out or not out.strip():
        return None
    try:
        raw = out.strip()
        for start in ("```json", "```"):
            if start in raw:
                raw = raw.split(start, 1)[-1].split("```", 1)[0].strip()
        data = _json.loads(raw)
        if not isinstance(data, dict) or "tags" not in data:
            return None
        items = data["tags"]
        if not isinstance(items, list):
            return None

        canon_valid = set(canon_set)
        tags: list[str] = []
        evidence: dict[str, list[str]] = {}
        seen: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            tag = str(item.get("tag") or "").strip()
            if not tag or tag not in canon_valid or tag in seen:
                continue
            seen.add(tag)
            conf = str(item.get("confidence") or "medium").strip().lower()
            ev_text = str(item.get("evidence") or "").strip()[:200]

            # Map confidence to a quality label for evidence scoring downstream
            if conf == "high":
                prefix = "[high] "
            elif conf == "low":
                prefix = "[low] "
            else:
                prefix = "[medium] "

            tags.append(tag)
            if ev_text:
                evidence[tag] = [prefix + ev_text]
            else:
                evidence[tag] = [prefix + "LLM-extracted, no quote"]

        if not tags:
            return None

        tags, evidence = _apply_inference_chains(tags, evidence)
        tags = sorted(tags)[:max_tags]
        return tags, evidence
    except Exception:
        return None


def extract_skill_tags_from_parser(parsed: Any) -> list[str]:
    """
    Extract skill tags from a ParsedResume (or dict with 'sections').
    Uses skills section first (tokenized), then scans experience/projects/education/research/summary.
    """
    if parsed is None:
        return []
    sections = getattr(parsed, "sections", None) if hasattr(parsed, "sections") else parsed.get("sections") if isinstance(parsed, dict) else None
    if not sections or not isinstance(sections, dict):
        return []
    tags: list[str] = []
    seen: set[str] = set()

    # Skills section: tokenize and match each token to vocab
    skills_content_parts = []
    for key in ("skills", "technical skills", "skills & activities", "skills and activities", "core competencies"):
        val = sections.get(key)
        if val is not None and isinstance(val, str) and val.strip():
            skills_content_parts.append(val)
        elif val is not None and not isinstance(val, str):
            try:
                skills_content_parts.append(str(val).strip())
            except Exception:
                pass
    if skills_content_parts:
        skills_content = " ".join(skills_content_parts)
        tokens = _tokenize_skills_section(skills_content)
        for t in tokens:
            for vocab in (TECHNICAL_VOCAB, SOFT_VOCAB):
                tag = _match_token_to_vocab(t, vocab)
                if tag and tag not in seen:
                    seen.add(tag)
                    tags.append(tag)

    # Other sections: concatenate and scan with word-boundary
    combined_parts = []
    for key, val in sections.items():
        if not key or not isinstance(key, str):
            continue
        key_lower = key.lower()
        if not any(s in key_lower for s in ("experience", "project", "education", "research", "summary", "objective", "involvement", "volunteer")):
            continue
        if val is not None:
            if isinstance(val, str) and val.strip():
                combined_parts.append(val)
            else:
                try:
                    combined_parts.append(str(val).strip())
                except Exception:
                    pass
    if combined_parts:
        combined = " ".join(combined_parts)
        for tag in _scan_text_for_vocab(combined, TECHNICAL_VOCAB):
            if tag not in seen:
                seen.add(tag)
                tags.append(tag)
        for tag in _scan_text_for_vocab(combined, SOFT_VOCAB):
            if tag not in seen:
                seen.add(tag)
                tags.append(tag)
    return tags


def extract_skill_tags_from_profile(profile: dict | None) -> list[str]:
    """
    Extract skill tags from profile text: career_goal, goals list, application_target, track.
    Ensures what the student told Dilly (e.g. in Voice or profile) is reflected in matching.
    """
    if not profile or not isinstance(profile, dict):
        return []
    tags: list[str] = []
    seen: set[str] = set()

    raw_track = profile.get("track")
    if raw_track is not None and isinstance(raw_track, str):
        track = _normalize(raw_track).lower().replace(" ", "_").replace("-", "_")
        if track:
            canonical = TRACK_AS_TAG.get(track)
            if not canonical and track:
                canonical = track.capitalize()
            if canonical and _normalize(canonical) and canonical not in seen:
                seen.add(canonical)
                tags.append(canonical)

    text_parts = []
    for key in ("career_goal", "application_target"):
        val = profile.get(key)
        if val is not None and isinstance(val, str) and _normalize(val):
            text_parts.append(_normalize(val))
    goals = profile.get("goals")
    if isinstance(goals, list):
        text_parts.append(" ".join(_normalize(str(g)) for g in goals if g is not None and _normalize(str(g))))
    combined = " ".join(text_parts)
    if combined:
        for tag in _scan_text_for_vocab(combined, SOFT_VOCAB):
            if tag not in seen:
                seen.add(tag)
                tags.append(tag)
        for tag in _scan_text_for_vocab(combined, TECHNICAL_VOCAB):
            if tag not in seen:
                seen.add(tag)
                tags.append(tag)
    return tags


def extract_skill_tags_from_audit(audit: dict | None) -> list[str]:
    """
    Extract skill tags from audit: track as tag, then word-boundary scan of findings/evidence.
    """
    if not audit or not isinstance(audit, dict):
        return []
    tags: list[str] = []
    seen: set[str] = set()

    # Track
    raw_track = audit.get("detected_track")
    if raw_track is not None and isinstance(raw_track, str):
        track = _normalize(raw_track).lower().replace(" ", "_").replace("-", "_")
        if track:
            canonical = TRACK_AS_TAG.get(track)
            if not canonical and track:
                canonical = track.capitalize()
            if canonical and _normalize(canonical) and canonical not in seen:
                seen.add(canonical)
                tags.append(canonical)

    # Findings and evidence
    findings = audit.get("audit_findings") or audit.get("findings")
    if isinstance(findings, list):
        findings_text = " ".join(_normalize(f) for f in findings if f is not None and isinstance(f, str))
    else:
        findings_text = ""
    evidence = audit.get("evidence") or audit.get("evidence_quotes")
    if isinstance(evidence, dict):
        evidence_text = " ".join(_normalize(v) for v in evidence.values() if v is not None and isinstance(v, str))
    else:
        evidence_text = ""
    combined = _normalize(findings_text + " " + evidence_text)
    if combined:
        for tag in _scan_text_for_vocab(combined, SOFT_VOCAB):
            if tag not in seen:
                seen.add(tag)
                tags.append(tag)
        for tag in _scan_text_for_vocab(combined, TECHNICAL_VOCAB):
            if tag not in seen:
                seen.add(tag)
                tags.append(tag)
    return tags


def extract_skill_tags_from_voice_data(profile: dict | None) -> list[str]:
    """
    Extract skill tags from Voice-captured data: beyond_resume items and experience_expansion entries.
    Scans the free-text 'text' fields in beyond_resume, and skills/tools_used lists in experience_expansion.
    This ensures skills captured via natural conversation with Dilly Voice count for recruiter matching.
    """
    if not profile or not isinstance(profile, dict):
        return []
    tags: list[str] = []
    seen: set[str] = set()

    # beyond_resume: each item has a free-text "text" field — scan it for vocab
    beyond = profile.get("beyond_resume")
    if isinstance(beyond, list):
        combined_parts: list[str] = []
        for item in beyond:
            if not isinstance(item, dict):
                continue
            text = _normalize(item.get("text") or "")
            if text:
                combined_parts.append(text)
        if combined_parts:
            combined = " ".join(combined_parts)
            for tag in _scan_text_for_vocab(combined, TECHNICAL_VOCAB):
                if tag not in seen:
                    seen.add(tag)
                    tags.append(tag)
            for tag in _scan_text_for_vocab(combined, SOFT_VOCAB):
                if tag not in seen:
                    seen.add(tag)
                    tags.append(tag)

    # experience_expansion: skills and tools_used are already tokenized lists — match each directly
    expansion = profile.get("experience_expansion")
    if isinstance(expansion, list):
        for entry in expansion:
            if not isinstance(entry, dict):
                continue
            for field in ("skills", "tools_used"):
                items = entry.get(field)
                if not isinstance(items, list):
                    continue
                for item in items:
                    token = _normalize(str(item or "")).lower()
                    if not token:
                        continue
                    for vocab in (TECHNICAL_VOCAB, SOFT_VOCAB):
                        tag = _match_token_to_vocab(token, vocab)
                        if tag and tag not in seen:
                            seen.add(tag)
                            tags.append(tag)
                    # Also scan full text for multi-word skills (e.g. "machine learning")
                    for tag in _scan_text_for_vocab(token, TECHNICAL_VOCAB):
                        if tag not in seen:
                            seen.add(tag)
                            tags.append(tag)
    return tags


def extract_skill_tags(
    parsed_resume: Any = None,
    audit: dict | None = None,
    profile: dict | None = None,
) -> list[str]:
    """
    Combine skill tags from parser, profile, audit, and Voice-captured data.
    Order: parser → profile → audit → voice data.
    Deduped, sorted, capped at MAX_SKILL_TAGS.
    Ensures everything the student told Dilly (Voice convos, deep-dive) feeds into recruiter matching.
    Returns list[str], never None; elements are non-empty.
    """
    tags: list[str] = []
    seen: set[str] = set()
    for tag in extract_skill_tags_from_parser(parsed_resume):
        if tag and isinstance(tag, str) and tag.strip() and tag not in seen:
            seen.add(tag)
            tags.append(tag.strip())
    for tag in extract_skill_tags_from_profile(profile):
        if tag and isinstance(tag, str) and tag.strip() and tag not in seen:
            seen.add(tag)
            tags.append(tag.strip())
    for tag in extract_skill_tags_from_audit(audit):
        if tag and isinstance(tag, str) and tag.strip() and tag not in seen:
            seen.add(tag)
            tags.append(tag.strip())
    for tag in extract_skill_tags_from_voice_data(profile):
        if tag and isinstance(tag, str) and tag.strip() and tag not in seen:
            seen.add(tag)
            tags.append(tag.strip())
    tags.sort()
    return tags[:MAX_SKILL_TAGS]
