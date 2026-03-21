"""
Dilly Auditor — Full pipeline: extract text → signals → scoring + track audit.
Uses only proven data (zero hallucination). Call from FastAPI or CLI.
"""

import os
import re
from dataclasses import dataclass
from typing import List, Optional

from dilly_core.scoring import (
    ScoringSignals,
    extract_scoring_signals,
    compute_smart_score,
    compute_grit_score,
    apply_international_multiplier,
)
from dilly_core.tracks import run_track_audit


@dataclass
class AuditorResult:
    """Full audit result: metadata, scores, and evidence-based findings."""
    candidate_name: str
    major: str
    track: str
    smart_score: float
    grit_score: float
    build_score: float
    final_score: float
    audit_findings: List[str]
    evidence_smart: List[str]
    evidence_grit: List[str]
    recommendations: Optional[List[dict]] = None  # [{title, action}] when LLM gives personalized recs


# Section headers that are never candidate names
_NAME_HEADER_BLACKLIST = frozenset(
    "education experience summary objective skills contact profile qualifications employment references".split()
)
# Words that indicate a line is not a name (sentence/header)
_NAME_REJECT_WORDS = frozenset(
    "university college coursework bachelor experience internship relevant expected graduation".split()
)


def standardize_name(name: str) -> str:
    """
    Apply standardized capitalization: Title Case (each word first letter upper, rest lower).
    E.g. "BRIDGET E. KLAUS" -> "Bridget E. Klaus", "deng aguer bul" -> "Deng Aguer Bul".
    """
    if not name or not name.strip():
        return name
    words = name.strip().split()
    result = []
    for w in words:
        if not w:
            continue
        # Preserve single-letter initials as "X." or "X"
        if len(w) == 1 or (len(w) == 2 and w.endswith(".")):
            result.append(w.upper())
        else:
            result.append(w.capitalize())
    return " ".join(result)


def _clean_line_for_name(line: str) -> str:
    """Remove contact info from a line to get a possible name."""
    for sep in ["|", "\u2022", "\u00b7"]:
        line = line.split(sep)[0].strip()
    line = re.sub(r"\S+@\S+\.\S+", "", line)
    line = re.sub(r"https?://\S+|www\.\S+|linkedin\.com/\S*|linkedin|github", "", line, flags=re.IGNORECASE)
    line = re.sub(r"[\d\s\-\.\(\)]{7,}", " ", line)
    # Remove city, state (e.g. "Tampa, FL" or "New York, NY")
    line = re.sub(r"[A-Za-z\s]+,\s*[A-Z]{2}\b", "", line)
    return re.sub(r"\s+", " ", line).strip()


def _looks_like_name(name: str) -> bool:
    """True if string looks like a person name (2–4 words, mostly letters)."""
    if not name or len(name) < 3 or len(name) > 50:
        return False
    name = name[:50].rstrip(" |\u2022\u00b7,-")
    words = name.split()
    if len(words) < 2 or len(words) > 4:
        return False
    lower = name.lower()
    if lower in _NAME_HEADER_BLACKLIST:
        return False
    if any(w in lower for w in _NAME_REJECT_WORDS):
        return False
    # Each word: letters only, or one letter + period (initial)
    for w in words:
        if not w:
            return False
        cleaned = w.strip(".")
        if not cleaned.replace(".", "").isalpha():
            return False
    return True


def name_from_filename(filename: str) -> str:
    """
    Derive a display name from a resume filename. Used as fallback when text extraction fails.
    E.g. "Dilan Kochhar Résumé.docx.pdf" -> "Dilan Kochhar", "Michael_Zeltser_Resume.pdf" -> "Michael Zeltser".
    Returns standardized Title Case.
    """
    if not filename or not filename.strip():
        return "Unknown"
    base = os.path.basename(filename).strip()
    base, _ = os.path.splitext(base)
    if base.lower().endswith(".docx"):
        base, _ = os.path.splitext(base)
    base = base.replace("_", " ")
    base = re.sub(r"\s*\(\d+\)\s*$", "", base)  # (2), (1)
    base = re.sub(r"\b(resume|résumé|cv)\b", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\s+", " ", base).strip()
    if not base or len(base) < 2:
        return "Unknown"
    return standardize_name(base[:50].strip())


def _merge_split_name_lines(lines: List[str]) -> List[str]:
    """
    Merge lines that look like one word split across two (e.g. "BROCKENBRO" + "UGH" -> "BROCKENBROUGH").
    """
    if not lines:
        return []
    merged = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        # If this line is a single alpha word and next line is a short single alpha word, might be name split
        if i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if (
                next_line
                and " " not in line
                and " " not in next_line
                and line.isalpha()
                and next_line.isalpha()
                and len(line) + len(next_line) <= 15
            ):
                merged.append(line + next_line)
                i += 2
                continue
        merged.append(line)
        i += 1
    return merged


def extract_candidate_name(raw_text: str, filename: Optional[str] = None) -> str:
    """
    Extract candidate name from resume text. Uses unified parser (layout-agnostic, multi-strategy).
    """
    from dilly_core.resume_parser import parse_resume
    parsed = parse_resume(raw_text, filename=filename)
    return parsed.name if parsed.name != "Unknown" else (name_from_filename(filename) if filename else "Unknown")


def extract_major_from_text(raw_text: str) -> str:
    """
    Extract major/degree from resume text. Uses unified parser (education block + keyword scan).
    """
    from dilly_core.resume_parser import parse_resume
    parsed = parse_resume(raw_text, filename=None)
    return parsed.major


def get_track_from_major_and_text(major: str, raw_text: str) -> str:
    """Pre-Health / Pre-Law / Builder from major + text signals. Text used when major is Unknown (e.g. pre-med keywords)."""
    m = major.lower()
    t = (raw_text or "").lower()
    # Explicit track label in text (e.g. placeholder "Track: Pre-Health") wins
    if "track: pre-health" in t or "track: pre-health" in t[:600]:
        return "Pre-Health"
    if "track: pre-law" in t or "track: pre-law" in t[:600]:
        return "Pre-Law"
    if "track: builder" in t or "track: builder" in t[:600]:
        return "Builder"
    # Pre-Law: history + international studies (double major) → Pre-Law
    if any(x in m for x in ["political science", "criminology", "philosophy", "history", "international studies", "law"]):
        return "Pre-Law"
    # Pre-Health majors: only if resume has pre-health signals (avoids Biology/Marine Science → Builder when no med intent)
    pre_health_kw = ["pre-med", "pre-medicine", "premed", "medical", "clinical", "shadowing", "osteopathic", "lecom", "bs/do", "mcat", "patient care", "emt", "scribe", "medical assistant", "hospital", "physician", "amat", "amsa"]
    if any(x in m for x in ["biology", "biochemistry", "chemistry", "health", "nursing", "psychology", "biomedical", "allied"]):
        if any(k in t for k in pre_health_kw):
            return "Pre-Health"
        # Biology/Marine Science with no pre-health keywords → Builder
        return "Builder"
    # When major is Unknown, infer from resume text
    if any(k in t for k in pre_health_kw):
        return "Pre-Health"
    if any(k in t for k in ["pre-law", "paralegal", "legal", "moot court", "mock trial", "juris"]):
        return "Pre-Law"
    return "Builder"


def run_audit(
    raw_text: str,
    *,
    candidate_name: str = "Unknown",
    major: str = "Unknown",
    gpa: float | None = None,
    filename: Optional[str] = None,
) -> AuditorResult:
    """
    Run full Dilly audit from raw resume text.
    Returns scores and audit_findings (evidence-based only).
    If candidate_name is not provided, extracts from text (multi-line) with filename fallback so we avoid "Unknown".
    If major is Unknown, attempts extract_major_from_text so scoring uses the right multiplier.
    """
    if candidate_name == "Unknown":
        candidate_name = extract_candidate_name(raw_text, filename=filename)
    if major == "Unknown":
        major = extract_major_from_text(raw_text)
    track = get_track_from_major_and_text(major, raw_text)
    signals = extract_scoring_signals(raw_text, gpa=gpa, major=major)
    # Override major if we had one
    if major != "Unknown":
        signals = ScoringSignals(
            gpa=signals.gpa,
            major=major,
            honors_count=signals.honors_count,
            has_research=signals.has_research,
            quantifiable_impact_count=signals.quantifiable_impact_count,
            leadership_density=signals.leadership_density,
            work_entry_count=signals.work_entry_count,
            international_markers=signals.international_markers,
            bcpm_gpa=signals.bcpm_gpa,
            longitudinal_clinical_years=signals.longitudinal_clinical_years,
            outcome_leadership_count=signals.outcome_leadership_count,
            commit_velocity_per_week=signals.commit_velocity_per_week,
            research_semesters=signals.research_semesters,
            research_longevity_years=getattr(signals, "research_longevity_years", 0.0),
        )
    smart_score, evidence_smart = compute_smart_score(signals, track=track)
    grit_score, evidence_grit = compute_grit_score(signals)
    grit_score, grit_intl = apply_international_multiplier(grit_score, signals.international_markers)
    evidence_grit.extend(grit_intl)
    track_result = run_track_audit(track, signals, raw_text)
    build_score = track_result.build_score
    # Composite final: Pre-Law uses 45% Smart (GPA emphasis); default 30 Smart, 45 Grit, 25 Build
    if track == "Pre-Law":
        final_score = round((smart_score * 0.45) + (grit_score * 0.35) + (build_score * 0.20), 2)
    else:
        final_score = round((smart_score * 0.30) + (grit_score * 0.45) + (build_score * 0.25), 2)
    audit_findings: List[str] = []
    audit_findings.append(f"Smart: {'; '.join(evidence_smart[:2])}" if evidence_smart else "Smart: No evidence modifiers.")
    audit_findings.append(f"Grit: {'; '.join(evidence_grit[:2])}" if evidence_grit else "Grit: Base calculation only.")
    audit_findings.extend(track_result.findings)
    return AuditorResult(
        candidate_name=candidate_name,
        major=signals.major,
        track=track,
        smart_score=smart_score,
        grit_score=grit_score,
        build_score=build_score,
        final_score=final_score,
        audit_findings=audit_findings,
        evidence_smart=evidence_smart,
        evidence_grit=evidence_grit,
        recommendations=None,
    )
