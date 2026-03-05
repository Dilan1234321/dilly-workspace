"""
Meridian Resume Parser — Layout-agnostic, high-accuracy extraction for all resume formats.
Handles messy PDF extraction, multi-column layouts, and inconsistent section headers.
Single source of truth for: name, major, GPA, education block, and normalized text.
"""

import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class ParsedResume:
    """Structured parse result. Use for scoring and display."""
    name: str
    major: str
    gpa: Optional[float]
    education_block: str
    sections: Dict[str, str] = field(default_factory=dict)
    normalized_text: str = ""


# Section headers in many resume formats (case-insensitive match)
SECTION_HEADERS = [
    "education", "academic", "academics", "qualifications",
    "experience", "work experience", "employment", "professional experience", "work history",
    "skills", "technical skills", "core competencies",
    "summary", "professional summary", "objective", "profile",
    "contact", "references", "projects", "certifications", "honors", "activities",
]
# Lines that are never a candidate name
NAME_BLACKLIST = frozenset(
    "education experience summary objective skills contact profile qualifications "
    "employment references certifications honors activities projects "
    "teamwork communication leadership organization professional".split()
)
REJECT_WORDS_IN_NAME = frozenset(
    "university college coursework bachelor experience internship relevant expected graduation "
    "phone email linkedin http www teamwork profits revenue sales growth results "
    "solutions customer service quality improvement prediction well-educated finalized "
    "accuracy lease applicants pipeline engine "
    "academic writing osteopathic asbmb accredited whether "
    "introduction statistics calculus program employment "
    "one would resident assistant".split()
)
# Canonical majors and keyword triggers (aligned with scoring)
MAJOR_KEYWORDS: Dict[str, List[str]] = {
    "Biochemistry": ["biochemistry"],
    "Data Science": ["data science", "analytics"],
    "Computer Science": ["computer science", "software engineering", "computing", "cs "],
    "Cybersecurity": ["cybersecurity", "cyber security"],
    "Biology": ["biology"],
    "Chemistry": ["chemistry"],
    "Biomedical Sciences": ["biomedical"],
    "Allied Health": ["allied health", "medical science"],
    "Nursing": ["nursing"],
    "Finance": ["finance", "financial"],
    "Economics": ["economics"],
    "Psychology": ["psychology", "pre-medicine", "pre-med"],
    "International Business & Marketing": ["international business & marketing", "international business and marketing"],
    "International Business": ["international business"],
    "Marketing": ["marketing"],
    "Mathematics": ["mathematics", " math ", "math,", "math."],
    "Accounting": ["accounting"],
    "Criminology": ["criminology"],
    "History & International Studies": ["history & international studies", "history and international studies"],
    "History": ["history"],
    "International Studies": ["international studies"],
    "Political Science": ["political science"],
    "Communication": ["communication"],
    "Business Management": ["business management"],
    "Management": ["management"],
    "Marine Science": ["marine science"],
    "Environmental Science": ["environmental science", "environmental"],
    "Secondary Education": ["secondary education", "education - mathematics", "education mathematics"],
    "Advertising and Public Relations": ["advertising", "public relations"],
}


def normalize_resume_text(raw: str) -> str:
    """
    Normalize raw PDF/DOCX text for reliable parsing.
    - Unify line endings, collapse excessive spaces
    - Fix common PDF artifact: space between every character (e.g. "D a t a  S c i e n c e")
    """
    if not raw or not raw.strip():
        return ""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            lines.append("")
            continue
        # Collapse internal spaces
        line = re.sub(r"\s+", " ", line)
        # Fix mid-word spaces from PDF (single letters with spaces between): "B a c h e l o r" -> "Bachelor"
        words = line.split()
        fixed = []
        i = 0
        while i < len(words):
            w = words[i]
            if len(w) == 1 and w.isalpha() and i + 1 < len(words):
                # Collect run of single-letter tokens (possible PDF artifact)
                run = [w]
                j = i + 1
                while j < len(words) and len(words[j]) == 1 and words[j].isalpha():
                    run.append(words[j])
                    j += 1
                if len(run) >= 3:  # likely artifact
                    fixed.append("".join(run))
                    i = j
                else:
                    fixed.append(w)
                    i += 1
            else:
                fixed.append(w)
                i += 1
        lines.append(" ".join(fixed))
    return "\n".join(lines)


def get_sections(normalized_text: str) -> Dict[str, str]:
    """
    Split resume into sections by common headers. Layout-agnostic.
    Returns dict: section_key_lower -> content (text until next section or end).
    """
    if not normalized_text.strip():
        return {}
    sections: Dict[str, str] = {}
    lines = normalized_text.split("\n")
    current_header: Optional[str] = None
    current_lines: List[str] = []

    def flush():
        nonlocal current_header, current_lines
        if current_header is not None and current_lines:
            key = current_header.lower().strip()
            key = re.sub(r"\s+", " ", key).rstrip(":")
            if key and key not in ("", " "):
                sections[key] = "\n".join(current_lines).strip()
        current_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_lines:
                current_lines.append("")
            continue
        # Is this line a section header? (standalone, matches known headers or looks like one)
        lower = stripped.lower().rstrip(":").strip()
        is_header = (
            (lower in SECTION_HEADERS or any(lower == h or lower.startswith(h + " ") for h in SECTION_HEADERS))
            or (len(stripped) < 35 and stripped.isupper() and 1 <= len(stripped.split()) <= 4)
        )
        if is_header:
            flush()
            current_header = stripped.rstrip(":")
            current_lines = []
        else:
            if current_header is None:
                # Content before any section: treat as "header" / contact block
                current_header = "_top"
            current_lines.append(stripped)
    flush()
    return sections


def _clean_line_for_name(line: str) -> str:
    """Remove contact info from a line to get a possible name."""
    for sep in ["|", "\u2022", "\u00b7", "•"]:
        line = line.split(sep)[0].strip()
    line = re.sub(r"\S+@\S+\.\S+", "", line)
    line = re.sub(r"https?://\S+|www\.\S+|linkedin\.com/\S*|linkedin|github", "", line, flags=re.IGNORECASE)
    line = re.sub(r"[\d\s\-\.\(\)]{7,}", " ", line)
    line = re.sub(r"\(?\d{3}\)?\s*\-?\s*\d{3}\s*\-?\s*\d{4}", "", line)
    line = re.sub(r"[A-Za-z\s]+,\s*[A-Z]{2}\b", "", line)
    return re.sub(r"\s+", " ", line).strip()


def _looks_like_name(name: str) -> bool:
    if not name or len(name) < 3 or len(name) > 50:
        return False
    # Reject degree/line labels (e.g. "B.s. In Biochemistry Asbmb-accredited")
    lower = name.lower()
    if re.search(r"\bb\.?s\.?\b|\bb\.?a\.?\b|asbmb|accredited\b|bachelor\b|degree\s+in\b", lower):
        return False
    name = name[:50].rstrip(" |\u2022\u00b7,-")
    words = name.split()
    # Require at least 2 words (First Last); single words like "Teamwork" are section/skill labels
    if len(words) < 2 or len(words) > 4:
        return False
    # Reject single-letter "names" like "T H" (PDF artifact or initials only)
    if len(words) >= 2 and all(len(w.strip(".")) <= 1 for w in words):
        return False
    # At least one word must be 2+ letters (real name, not "T H" or "A B")
    if not any(len(w.strip(".")) >= 2 for w in words):
        return False
    lower = name.lower()
    if lower in NAME_BLACKLIST:
        return False
    if any(w in lower for w in REJECT_WORDS_IN_NAME):
        return False
    for w in words:
        if not w:
            return False
        cleaned = w.strip(".")
        if not cleaned.replace(".", "").replace("-", "").isalpha():
            return False
    return True


def _standardize_name(name: str) -> str:
    if not name or not name.strip():
        return name
    words = name.strip().split()
    result = []
    for w in words:
        if len(w) == 1 or (len(w) == 2 and w.endswith(".")):
            result.append(w.upper())
        else:
            result.append(w.capitalize())
    return " ".join(result)


def extract_name(normalized_text: str, filename: Optional[str] = None) -> str:
    """
    Multi-strategy name extraction. Tolerant of:
    - First line being a section header (EDUCATION, etc.)
    - Name + contact on one line
    - Name split across two lines (e.g. FIRST\nLAST)
    - No name in text -> filename fallback
    """
    if not normalized_text.strip() and not filename:
        return "Unknown"
    lines = [ln.strip() for ln in normalized_text.strip().split("\n") if ln.strip()][:25]
    if not lines:
        return _name_from_filename(filename) if filename else "Unknown"

    # Strategy 0: First line — use first 2–3 words (middle initial → take 3: "Kate M. Hicks")
    if lines:
        first_cleaned = _clean_line_for_name(lines[0])
        if first_cleaned:
            words = first_cleaned.split()
            for n in (3, 2):
                if len(words) >= n:
                    candidate = " ".join(words[:n])
                    if candidate and _looks_like_name(candidate):
                        return _standardize_name(candidate)
        # If first line is a section header (no name at top), prefer filename when available
        first_upper = lines[0].strip().upper()
        section_headers = (
            "EDUCATION", "ACADEMIC", "EXPERIENCE", "EMPLOYMENT", "SUMMARY", "OBJECTIVE", "CONTACT",
            "PROFILE", "CAREER", "SKILLS", "QUALIFICATIONS", "PERSONAL", "OVERVIEW",
        )
        if first_upper in section_headers and filename:
            return _name_from_filename(filename)

    # Strategy 1: First line after cleaning contact info
    for line in lines[:5]:
        cleaned = _clean_line_for_name(line)
        if cleaned and _looks_like_name(cleaned):
            return _standardize_name(cleaned)

    # Strategy 2: Two-line merge (e.g. "VIR" + "SHAH" or "HUNTUR" + "BROCKENBROUGH")
    for i in range(min(len(lines) - 1, 6)):
        first = _clean_line_for_name(lines[i])
        second = _clean_line_for_name(lines[i + 1])
        if not first or not second:
            continue
        if " " not in first and " " not in second and first.isalpha() and second.isalpha():
            combined = f"{first} {second}"
            if 4 <= len(combined) <= 35 and _looks_like_name(combined):
                return _standardize_name(combined)

    # Strategy 3: Any line in first 20 that looks like a name (e.g. "Bridget E. Klaus")
    for line in lines[:20]:
        cleaned = _clean_line_for_name(line)
        if cleaned and _looks_like_name(cleaned):
            return _standardize_name(cleaned)

    # Strategy 4: Exactly two words (each 2+ letters) in first 5 lines (common name format)
    for line in lines[:5]:
        cleaned = _clean_line_for_name(line)
        if not cleaned or len(cleaned) > 40:
            continue
        words = cleaned.split()
        if len(words) == 2 and len(words[0]) >= 2 and len(words[1]) >= 2:
            if words[0].isalpha() and words[1].isalpha():
                if words[0].lower() in REJECT_WORDS_IN_NAME or words[1].lower() in REJECT_WORDS_IN_NAME:
                    continue
                combined = f"{words[0]} {words[1]}"
                if combined.lower() not in NAME_BLACKLIST:
                    return _standardize_name(combined)

    if filename:
        return _name_from_filename(filename)
    return "Unknown"


def _name_from_filename(filename: str) -> str:
    if not filename or not filename.strip():
        return "Unknown"
    base = os.path.basename(filename).strip()
    base, _ = os.path.splitext(base)
    if base.lower().endswith(".docx"):
        base, _ = os.path.splitext(base)
    base = base.replace("_", " ")
    base = re.sub(r"\s*\(\d+\)\s*$", "", base)
    base = re.sub(r"\b(resume|résumé|cv)\b", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\s+", " ", base).strip()
    if not base or len(base) < 2:
        return "Unknown"
    return _standardize_name(base[:50].strip())


def _map_to_canonical_major(raw: str) -> Optional[str]:
    if not raw or len(raw.strip()) < 2:
        return None
    lower = raw.lower().strip()
    for canonical, keywords in MAJOR_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return canonical
    return None


# Captured "major" that are actually date/role/skill/place words (e.g. "Present", "profits", "europe")
MAJOR_REJECT = frozenset(
    "present current ongoing today expected graduation january february march april may june "
    "july august september october november december jan feb mar apr jun jul aug sep oct nov dec "
    "to from and or the a an profits profit revenue sales growth teamwork communication leadership "
    "organization service quality results solutions customer improvement europe asia africa america "
    "global international region regional local national world linkedin".split()
)
# Substrings that indicate the capture is NOT a major (e.g. activity/role text)
MAJOR_PHRASE_REJECT = frozenset(
    "campus service outreach student volunteer center program development "
    "management leadership activities involvement office assistant coordinator "
    "affairs engagement diversity inclusion".split()
)
# Freeform major only accepted if it contains a degree-like word (rejects "europe", "profits", etc.)
DEGREE_LIKE_WORDS = frozenset(
    "science arts studies engineering education relations administration "
    "psychology biology chemistry mathematics business".split()
)


def _extract_major_from_text(search_lower: str) -> Optional[str]:
    """Run pattern + keyword scan on a single search string. Returns canonical major or None."""
    patterns = [
        r"(?:bachelor(?:'s)?|b\.?s\.?|b\.?a\.?|bachelors?)\s+of\s+(?:science|arts)\s+in\s+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|\s+expected|\s+graduation|$)",
        r"(?:b\.?s\.?|b\.?a\.?|bs|ba)\s+in\s+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|\s+minor|\s+expected|$)",
        r"major[:\s]+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|$)",
        r"degree\s+in\s+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|$)",
        r"([a-z][a-z\s&\-]{2,40}?)\s*(?:b\.?s\.?|b\.?a\.?|bachelors?\s+of\s+science)\s*(?:\)|,|\n|$)",
        r"(?:in|–|-)\s+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|\s+expected|\s+graduation|\s+present|\s+current|$)",
        r"([a-z][a-z\s&\-]{2,40}?)\s*bachelors?\s+of\s+science",
    ]
    for pat in patterns:
        for m in re.finditer(pat, search_lower, re.IGNORECASE):
            candidate = m.group(1).strip()
            if len(candidate) < 3 or re.match(r"^[\d.\s]+$", candidate):
                continue
            if candidate.lower() in MAJOR_REJECT:
                continue
            c_lower = candidate.lower()
            if "linkedin" in c_lower:
                continue
            if len(candidate) > 35 and " " not in candidate:
                continue
            if any(phrase in c_lower for phrase in MAJOR_PHRASE_REJECT):
                continue
            canonical = _map_to_canonical_major(candidate)
            if canonical:
                # Prefer "International Business & Marketing" when both appear in text
                if canonical == "International Business" and ("& marketing" in search_lower or "and marketing" in search_lower):
                    return "International Business & Marketing"
                return canonical
            word_count = len(candidate.split())
            if word_count < 2 or len(candidate) > 35 or word_count > 4:
                continue
            if not re.match(r"^[a-z\s&\-]+$", candidate, re.I):
                continue
            if not set(c_lower.split()) & DEGREE_LIKE_WORDS:
                continue
            if "linkedin" in c_lower:
                continue
            return candidate.title()

    for canonical, keywords in MAJOR_KEYWORDS.items():
        if any(kw in search_lower for kw in keywords):
            if "linkedin" in canonical.lower():
                continue
            if canonical == "International Business" and ("& marketing" in search_lower or "and marketing" in search_lower):
                return "International Business & Marketing"
            return canonical
    return None


def extract_major(normalized_text: str, education_block: str) -> str:
    """
    Extract canonical major from education block first, then full-text keyword scan.
    Education-only pass avoids picking "Data Science" from summary when degree is "Business Management".
    When both Data Science and Computer Science appear in education, prefer Computer Science.
    """
    edu_lower = (education_block or "").lower()
    search = (education_block + "\n" + normalized_text[:2500]) if education_block else normalized_text[:3000]
    search_lower = search.lower()

    # 1) Education block only — so "B.S. in Business Management" wins over "analytics" in summary
    if education_block:
        major = _extract_major_from_text(edu_lower)
        if major:
            return major

    # 2) Full search (patterns + keyword scan)
    major = _extract_major_from_text(search_lower)
    if major:
        return major
    return "Unknown"


def extract_gpa(normalized_text: str, education_block: str) -> Optional[float]:
    """Extract GPA from education block or full text."""
    search = (education_block + " " + normalized_text[:2000]) if education_block else normalized_text[:2000]
    m = re.search(r"(?:gpa|grade point average|cumulative)[:\s]*([0-4]\.\d{2})", search, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    m = re.search(r"([0-4]\.\d{1,2})\s*(?:/\s*4\.0|gpa)?", search, re.IGNORECASE)
    if m:
        try:
            v = float(m.group(1))
            if 0 <= v <= 4.5:
                return v
        except ValueError:
            pass
    return None


def get_education_block(sections: Dict[str, str], normalized_text: str) -> str:
    """Get concatenated education section content from sections or by scanning for 'education' near 'university'."""
    for key in ("education", "academic", "academics", "qualifications"):
        if key in sections and sections[key].strip():
            return sections[key].strip()
    # Fallback: find block that contains both "education" and degree-like keywords
    lines = normalized_text.split("\n")
    for i, line in enumerate(lines):
        if "education" in line.lower() or "academic" in line.lower():
            block = "\n".join(lines[i : i + 12])
            if any(
                x in block.lower()
                for x in ("bachelor", "b.s.", "b.a.", "degree", "major", "university", "gpa")
            ):
                return block
    return ""


def parse_resume(
    raw_text: str,
    filename: Optional[str] = None,
) -> ParsedResume:
    """
    Single entry point: normalize, section, extract name/major/GPA.
    Use this for all resume types (clean or messy, Vir Shah / Resume.pdf style).
    """
    normalized = normalize_resume_text(raw_text)
    sections = get_sections(normalized)
    education_block = get_education_block(sections, normalized)
    name = extract_name(normalized, filename=filename)
    major = extract_major(normalized, education_block)
    gpa = extract_gpa(normalized, education_block)
    return ParsedResume(
        name=name,
        major=major,
        gpa=gpa,
        education_block=education_block,
        sections=sections,
        normalized_text=normalized,
    )
