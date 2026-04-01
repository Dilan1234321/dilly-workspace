"""
Extract direct quotes from resume text for evidence traceability.
Used when LLM does not supply validated evidence_quotes so the UI can always show "Cited from your resume" with actual resume text.
"""

import re
from typing import Dict, Optional


def _section_content(text: str, section_name: str) -> Optional[str]:
    """Extract raw content of first section matching section_name (e.g. EDUCATION, EXPERIENCE, PROJECTS)."""
    if not text or not section_name:
        return None
    # Match [EDUCATION], [PROFESSIONAL EXPERIENCE], [PROJECTS]; content until next section [ or end
    pattern = rf"\[{re.escape(section_name)}\][^\n]*\s*(.*?)(?=\n\s*\[[\w\s/]+\]|\Z)"
    m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if not m:
        return None
    return m.group(1).strip()


def _first_substantive_line(block: str, max_len: int = 300) -> Optional[str]:
    """First non-empty line that is not just a label or N/A. Trims to max_len."""
    if not block:
        return None
    for raw in block.split("\n"):
        line = raw.strip()
        if not line or len(line) < 3:
            continue
        if line.upper() == "N/A" or line == "Description:" or line == "Location:":
            continue
        # Prefer lines that look like content (e.g. "University: University of Tampa", "- Bullet text")
        return line[:max_len] if len(line) > max_len else line
    return None


def _first_bullet(block: str, max_len: int = 300) -> Optional[str]:
    """First line that looks like a bullet (- or •) or Role:/Company: with content."""
    if not block:
        return None
    for raw in block.split("\n"):
        line = raw.strip()
        if not line or len(line) < 5:
            continue
        if line.upper() == "N/A":
            continue
        # Bullet
        if line.startswith(("-", "•", "*", "●")) or re.match(r"^[\-\*•●]\s+", line):
            content = re.sub(r"^[\-\*•●]\s*", "", line).strip()
            if len(content) >= 10:
                return content[:max_len] if len(content) > max_len else content
        # Role: / Company: (direct quote from resume)
        if re.match(r"^(Role|Company|Description):\s*.+", line, re.IGNORECASE):
            return line[:max_len] if len(line) > max_len else line
    return None


def _first_education_line(block: str, max_len: int = 300) -> Optional[str]:
    """First substantive line from education (University:, Major(s):, GPA:, Honors:, etc.)."""
    if not block:
        return None
    for raw in block.split("\n"):
        line = raw.strip()
        if not line or len(line) < 3:
            continue
        if line.upper() == "N/A":
            continue
        return line[:max_len] if len(line) > max_len else line
    return None


def _first_line_matching(text: str, pattern: re.Pattern, max_len: int = 300) -> Optional[str]:
    """First line that matches the regex (full line or substring). Returns the line as-is (direct quote)."""
    if not text:
        return None
    for raw in text.split("\n"):
        line = raw.strip()
        if not line or len(line) < 5:
            continue
        if line.upper() == "N/A":
            continue
        if pattern.search(line):
            return line[:max_len] if len(line) > max_len else line
    return None


def _first_bullet_anywhere(text: str, content_pattern: Optional[re.Pattern] = None, max_len: int = 300) -> Optional[str]:
    """First bullet line (- or •) in text; optionally require content to match content_pattern."""
    if not text:
        return None
    for raw in text.split("\n"):
        line = raw.strip()
        if not line or len(line) < 10:
            continue
        is_bullet = line.startswith(("-", "•", "*", "●")) or bool(re.match(r"^[\-\*•●]\s+", line))
        if not is_bullet:
            continue
        content = re.sub(r"^[\-\*•●]\s*", "", line).strip()
        if not content:
            continue
        if content_pattern and not content_pattern.search(content):
            continue
        return content[:max_len] if len(content) > max_len else content
    return None


def get_fallback_evidence_quotes(resume_text: str) -> Dict[str, str]:
    """
    Extract one direct quote from the resume per dimension (smart, grit, build).
    Uses actual lines from [EDUCATION], experience, and [PROJECTS]. If section headers are missing,
    scans full text for education-like lines, bullets, and Role/Company lines so we always return real resume text.
    """
    out: Dict[str, str] = {}
    if not (resume_text or "").strip():
        return out

    text = resume_text or ""

    # Smart: from [EDUCATION] or first line that looks like education (GPA, Major, University, Bachelor)
    edu = _section_content(text, "EDUCATION") or _section_content(text, "ACADEMIC")
    if edu:
        line = _first_education_line(edu)
        if line:
            out["smart"] = line
    if "smart" not in out:
        smart_pattern = re.compile(
            r"\b(GPA|Major|University|Bachelor|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Honors|Dean's List|graduation|Expected)\b",
            re.IGNORECASE,
        )
        line = _first_line_matching(text, smart_pattern)
        if line:
            out["smart"] = line

    # Grit: from experience section or first Role:/Company:/bullet in full text
    exp = (
        _section_content(text, "PROFESSIONAL EXPERIENCE")
        or _section_content(text, "EXPERIENCE")
        or _section_content(text, "VOLUNTEER EXPERIENCE")
        or _section_content(text, "CAMPUS INVOLVEMENT")
    )
    if exp:
        bullet = _first_bullet(exp)
        if bullet:
            out["grit"] = bullet
        else:
            line = _first_substantive_line(exp)
            if line:
                out["grit"] = line
    if "grit" not in out:
        grit_pattern = re.compile(r"^(Role|Company):\s+.+", re.IGNORECASE)
        line = _first_line_matching(text, grit_pattern)
        if line:
            out["grit"] = line
        else:
            bullet = _first_bullet_anywhere(text)
            if bullet:
                out["grit"] = bullet

    # Build: from [PROJECTS] or first project-like bullet
    proj = _section_content(text, "PROJECTS")
    if proj:
        bullet = _first_bullet(proj) or _first_substantive_line(proj)
        if bullet:
            out["build"] = bullet
    if "build" not in out and exp:
        build_pattern = re.compile(
            r"\b(developed|built|created|designed|implemented|project|model|system|application)\b", re.IGNORECASE
        )
        bullet = _first_bullet_anywhere(exp, build_pattern)
        if bullet:
            out["build"] = bullet
        else:
            first = _first_bullet(exp)
            if first:
                out["build"] = first
    if "build" not in out:
        build_pattern = re.compile(
            r"\b(developed|built|created|designed|implemented|project|model|system|application)\b", re.IGNORECASE
        )
        bullet = _first_bullet_anywhere(text, build_pattern)
        if bullet:
            out["build"] = bullet
        else:
            bullet = _first_bullet_anywhere(text)
            if bullet:
                out["build"] = bullet

    return out
