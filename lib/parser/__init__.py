"""
Dilly Resume Parser - Four-layer architecture.
parse_resume(buffer, mime_type) -> ParsedResume
"""
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from .types import (
    ParsedResume,
    ExtractedField,
    ExtractedEducation,
    ExtractedExperience,
    ExtractedSkills,
    ParserWarning,
)
from .ingestion import ingest_document
from .structure import detect_section_headers, segment_into_sections
from .fields import (
    extract_name,
    extract_contact,
    extract_education,
    extract_experience,
    extract_skills,
    extract_certifications,
    extract_summary,
)
from .validation import validate_parsed_resume, compute_overall_confidence
from .llm.llm_fallback import llm_fallback_extraction


def parse_resume(
    buffer: bytes,
    mime_type: str,
    use_llm: bool = True,
) -> ParsedResume:
    """
    Main entry point. Returns ParsedResume with full extraction.
    """
    start = time.perf_counter()

    # 1. Ingest
    ingested = ingest_document(buffer, mime_type)
    raw_text = ingested["raw_text"]
    chunks = ingested.get("chunks") or []
    layout = ingested.get("layout") or "single_column"
    docx_paragraphs = ingested.get("docx_paragraphs")

    # 2. Section headers
    headers = detect_section_headers(raw_text, chunks, docx_paragraphs)
    sections_list = segment_into_sections(raw_text, headers)

    preamble = next((s.content for s in sections_list if s.canonical == "PREAMBLE"), raw_text[:2000])
    # Build sections dict (lowercase keys for structured_resume compatibility)
    sections_dict: dict[str, str] = {}
    sections_dict["_top"] = preamble
    for sec in sections_list:
        if sec.canonical != "PREAMBLE":
            key = sec.canonical.lower()
            sections_dict[key] = sec.content

    def get_section(canonical: str) -> str:
        return sections_dict.get(canonical.lower(), "")

    # 3. Extract fields in parallel.
    with ThreadPoolExecutor(max_workers=7) as ex:
        fut_name = ex.submit(extract_name, chunks, preamble, use_llm)
        fut_contact = ex.submit(extract_contact, preamble)
        fut_education = ex.submit(extract_education, get_section("EDUCATION"), use_llm)
        fut_experience = ex.submit(extract_experience, get_section("EXPERIENCE"))
        fut_skills = ex.submit(extract_skills, get_section("SKILLS"), get_section("EXPERIENCE"))
        fut_certs = ex.submit(
            extract_certifications,
            get_section("CERTIFICATIONS"),
            get_section("SKILLS"),
            get_section("EXPERIENCE"),
        )
        fut_summary = ex.submit(extract_summary, get_section("SUMMARY"))

        name = fut_name.result()
        email, phone, linkedin, location = fut_contact.result()
        education = fut_education.result()
        experience = fut_experience.result()
        skills = fut_skills.result()
        certifications = fut_certs.result()
        summary = fut_summary.result()

    # 4. LLM fallback for failed fields
    failed = []
    if not name.value:
        failed.append("name")
    if not email.value:
        failed.append("email")
    if education.value is None or (isinstance(education.value, list) and not education.value):
        failed.append("education")
    if failed and use_llm:
        try:
            llm_context = "\n".join(
                [
                    preamble,
                    get_section("SUMMARY"),
                    get_section("EDUCATION"),
                    get_section("EXPERIENCE"),
                    get_section("SKILLS"),
                    get_section("CERTIFICATIONS"),
                ]
            )
            llm_result = llm_fallback_extraction(llm_context, failed)
            if llm_result.get("name") and not name.value:
                name = ExtractedField(value=llm_result["name"], confidence="medium", strategy="llm_fallback", raw=str(llm_result["name"]))
            if llm_result.get("email") and not email.value:
                email = ExtractedField(value=str(llm_result["email"]), confidence="medium", strategy="llm_fallback", raw=str(llm_result["email"]))
        except Exception:
            pass

    # 5. Build ParsedResume
    sections_not_mapped = [{"original": h.original, "position": h.line_index} for h in headers if h.canonical == "UNMAPPED"]

    parsed = ParsedResume(
        name=name,
        email=email,
        phone=phone,
        linkedin=linkedin,
        location=location,
        summary=summary,
        education=education,
        experience=experience,
        skills=skills,
        certifications=certifications,
        sections_detected=list(sections_dict.keys()),
        sections_not_mapped=sections_not_mapped,
        overall_confidence=0,
        parser_warnings=[],
        layout_detected=layout,
        parse_time_ms=0,
        raw_text=raw_text,
        sections=sections_dict,
    )

    # 6. Validate and score
    parsed = validate_parsed_resume(parsed)
    from dataclasses import replace
    parsed = replace(
        parsed,
        overall_confidence=compute_overall_confidence(parsed),
        parse_time_ms=int((time.perf_counter() - start) * 1000),
    )

    return parsed


def to_legacy_parsed_resume(parsed: ParsedResume) -> "LegacyParsedResume":
    """
    Convert new ParsedResume to legacy format for backward compatibility.
    """
    from dataclasses import dataclass

    @dataclass
    class LegacyParsedResume:
        name: str
        major: str
        gpa: Optional[float]
        education_block: str
        sections: dict
        normalized_text: str

    major = "Unknown"
    gpa = None
    education_block = parsed.sections.get("education", "")
    if parsed.education and parsed.education.value:
        entries = parsed.education.value
        if entries:
            first = entries[0]
            major = _sanitize_major(first.major) or "Unknown"
            if first.gpa:
                try:
                    gpa = float(first.gpa)
                except ValueError:
                    pass
    if major == "Unknown":
        major = _infer_major_from_text(parsed.raw_text) or "Unknown"

    legacy_name = (parsed.name.value or "Unknown") if parsed.name else "Unknown"
    if _looks_like_title_not_name(legacy_name):
        legacy_name = "Unknown"

    return LegacyParsedResume(
        name=legacy_name,
        major=major,
        gpa=gpa,
        education_block=education_block,
        sections=parsed.sections,
        normalized_text=parsed.raw_text,
    )


def _sanitize_major(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = str(value).strip()
    if not v:
        return None
    bad_fragments = (
        "expected graduation",
        "dean",
        "campus involvement",
        "volunteer",
        "activities",
        "experience",
        "leadership",
    )
    low = v.lower()
    if any(b in low for b in bad_fragments):
        return None
    if len(v) > 80:
        return None
    # Trim common tail clutter that should not be in major.
    for sep in (" minor", " expected", " gpa", " honors", "|"):
        idx = v.lower().find(sep)
        if idx > 0:
            v = v[:idx].strip(" ,.-")
    if not v:
        return None
    return v


def _infer_major_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    import re
    patterns = [
        r"(?:major|concentration|specialization)\s+in\s+([^\n,|]{2,80})",
        r"B\.?S\.?\s+in\s+([^\n,|]{2,80})",
        r"B\.?A\.?\s+in\s+([^\n,|]{2,80})",
        r"M\.?S\.?\s+in\s+([^\n,|]{2,80})",
        r"M\.?A\.?\s+in\s+([^\n,|]{2,80})",
        r"(?:Bachelor|Master)\s+of\s+[A-Za-z\s]+\s+in\s+([^\n,|]{2,80})",
        r"double\s+major\s+in\s+([^\n,|]{2,80})",
        r"(?:major)[:\s]+([^\n,|]{2,80})",
        r"([A-Za-z&/\-\s]{2,80})\s+major",
        r"(?:current\s*[-–]?\s*)([A-Za-z&/\-\s]{2,80})\)",
        r"\(\s*current\s*[-–]?\s*([A-Za-z&/\-\s]{2,80})\s*\)",
        r"(?:professional summary|summary)\s+[^\n]*?\b([A-Za-z][A-Za-z/\-\s]{2,40})\s+student\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            candidate = m.group(1).strip(" |,.-")
            candidate = _sanitize_major(candidate)
            if candidate:
                return candidate
    return None


def _looks_like_title_not_name(value: str) -> bool:
    if not value or value == "Unknown":
        return False
    low = value.lower()
    title_terms = (
        "associate",
        "analyst",
        "manager",
        "intern",
        "director",
        "coordinator",
        "developer",
        "engineer",
        "consultant",
        "specialist",
        "executive",
        "member",
        "president",
        "assistant",
        "representative",
        "advisor",
        "campus",
        "involvement",
        "real-world",
        "scenario",
    )
    school_terms = ("university", "college", "institute", "school of", "academy")
    return any(term in low for term in title_terms) or any(term in low for term in school_terms)
