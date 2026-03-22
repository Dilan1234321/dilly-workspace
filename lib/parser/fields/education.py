"""
Layer 3 — Education extraction.
"""
import re
from typing import List, Optional

from ..types import ExtractedField, ExtractedEducation


def _extract_gpa(text: str) -> Optional[str]:
    patterns = [
        r"GPA[:\s]*(\d\.\d{1,2})\s*(?:/\s*4\.0)?",
        r"(\d\.\d{1,2})\s*/\s*4\.0",
        r"cumulative\s+GPA[:\s]*(\d\.\d{1,2})",
        r"grade\s+point\s+average[:\s]*(\d\.\d{1,2})",
        r"\((\d\.\d{1,2})\s*GPA\)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            gpa = m.group(1)
            try:
                v = float(gpa)
                if 0 <= v <= 4.0:
                    return gpa
            except ValueError:
                pass
    return None


def _extract_graduation_date(text: str) -> Optional[str]:
    patterns = [
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{4})",
        r"(?:expected|anticipated|graduating)\s+(?:graduation\s+)?(\w+\s+\d{4})",
        r"class\s+of\s+(\d{4})",
        r"(?:graduated?|graduation)[:\s]+(\d{4})",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            return m.group(0).strip() if len(m.groups()) > 1 else m.group(1)
    return None


def _extract_degree(text: str) -> Optional[str]:
    degree_map = {
        "bs": "Bachelor of Science",
        "b.s.": "Bachelor of Science",
        "ba": "Bachelor of Arts",
        "b.a.": "Bachelor of Arts",
        "ms": "Master of Science",
        "m.s.": "Master of Science",
        "ma": "Master of Arts",
        "m.a.": "Master of Arts",
        "mba": "Master of Business Administration",
        "phd": "PhD",
        "b.s": "Bachelor of Science",
        "b.a": "Bachelor of Arts",
    }
    for abbr, full in degree_map.items():
        if re.search(r"\b" + re.escape(abbr) + r"\b", text, re.I):
            return full
    m = re.search(
        r"(Bachelor|Master)\s+of\s+(Science|Arts|Engineering|Business|Fine Arts|Applied Science|Business Administration)",
        text,
        re.I,
    )
    if m:
        return m.group(0).strip()
    return None


def _extract_major(text: str) -> Optional[str]:
    patterns = [
        r"(?:major|concentration|specialization)\s+in\s+([^,\n]+)",
        r"B\.?S\.?\s+in\s+([^,\n]+)",
        r"B\.?A\.?\s+in\s+([^,\n]+)",
        r"degree\s+in\s+([^,\n]+)",
        r"double\s+major\s+in\s+([^,\n]+)\s+and\s+([^,\n]+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            if "double" in pat and len(m.groups()) >= 2:
                return f"{m.group(1).strip()} and {m.group(2).strip()}"
            return m.group(1).strip().rstrip("|,")
    return None


def _extract_institution(text: str) -> Optional[str]:
    for kw in ("University", "College", "Institute", "School", "Academy"):
        m = re.search(r"([^\n]*" + kw + r"[^\n]*)", text, re.I)
        if m:
            inst = m.group(1).strip().rstrip("|,.")
            if len(inst) > 3 and len(inst) < 120:
                return inst
    return None


def _extract_honors(text: str) -> Optional[str]:
    honors = []
    for pat in ["summa cum laude", "magna cum laude", "cum laude", "with honors", "with distinction", "honor roll", "dean's list"]:
        if re.search(pat, text, re.I):
            honors.append(pat.title())
    return ", ".join(honors) if honors else None


def extract_education(
    education_section_text: str,
    use_llm: bool = False,
) -> ExtractedField:
    """Split into entries by institution, extract fields per entry."""
    if not education_section_text or not education_section_text.strip():
        return ExtractedField(value=[], confidence="low", strategy="empty", raw=None)

    text = education_section_text
    entries: List[ExtractedEducation] = []
    # Split by institution lines
    inst_pattern = r"(?=[^\n]*(?:University|College|Institute|School|Academy)[^\n]*)"
    parts = re.split(inst_pattern, text, flags=re.I)
    for part in parts:
        part = part.strip()
        if not part or len(part) < 10:
            continue
        inst = _extract_institution(part)
        if not inst:
            continue
        entries.append(
            ExtractedEducation(
                institution=inst,
                degree=_extract_degree(part),
                major=_extract_major(part),
                gpa=_extract_gpa(part),
                graduation_date=_extract_graduation_date(part),
                location=None,
                honors=_extract_honors(part),
            )
        )

    if not entries:
        # Single block
        entries.append(
            ExtractedEducation(
                institution=_extract_institution(text),
                degree=_extract_degree(text),
                major=_extract_major(text),
                gpa=_extract_gpa(text),
                graduation_date=_extract_graduation_date(text),
                location=None,
                honors=_extract_honors(text),
            )
        )

    # Optional LLM fallback for missing majors.
    if use_llm:
        try:
            from ..llm.llm_fallback import llm_fallback_extraction
            for idx, edu in enumerate(entries):
                if edu.major:
                    continue
                llm_out = llm_fallback_extraction(
                    f"Education entry:\n{text}\nExtract only major for entry index {idx}.",
                    ["major"],
                )
                major = llm_out.get("major")
                if isinstance(major, str) and major.strip():
                    edu.major = major.strip()
        except Exception:
            pass

    confidence = "high" if entries else "low"
    return ExtractedField(value=entries, confidence=confidence, strategy="regex", raw=education_section_text[:500])
