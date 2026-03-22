"""
Layer 3 — Experience extraction.
"""
import re
from typing import List

from ..types import ExtractedField, ExtractedExperience

BULLET_CHARS = ("•", "·", "-", "–", "—", "*", "▪", "▸", "►", "✓")
ACTION_VERBS = (
    "led", "built", "developed", "managed", "created", "implemented", "designed",
    "analyzed", "increased", "decreased", "generated", "reduced", "improved",
    "launched", "coordinated", "collaborated", "presented", "researched", "conducted",
    "established", "maintained", "oversaw", "spearheaded", "executed", "delivered",
    "achieved",
)
TITLE_KEYWORDS = (
    "analyst", "engineer", "manager", "intern", "associate", "director", "coordinator",
    "developer", "consultant", "specialist", "officer", "assistant", "representative",
    "advisor",
)
DATE_PATTERNS = [
    r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s*[-–—]\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
    r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s*[-–—]\s*(Present|Current|Now)",
    r"(\d{4})\s*[-–—]\s*(\d{4})",
    r"(Fall|Spring|Summer|Winter)\s+(\d{4})\s*[-–—]\s*(Fall|Spring|Summer|Winter)\s+(\d{4})",
]


def _parse_dates(text: str) -> tuple:
    """Return (start_date, end_date, is_current)."""
    for pat in DATE_PATTERNS:
        m = re.search(pat, text, re.I)
        if m:
            g = m.groups()
            if "Present" in str(g) or "Current" in str(g) or "Now" in str(g):
                return (f"{g[0]} {g[1]}" if len(g) >= 2 else g[0], "Present", True)
            if len(g) >= 4:
                return (f"{g[0]} {g[1]}", f"{g[2]} {g[3]}", False)
            if len(g) >= 2:
                return (g[0], g[1], False)
    return (None, None, False)


def extract_experience(experience_section_text: str) -> ExtractedField:
    """Split into entries at company/role transitions. Extract company, role, dates, bullets."""
    if not experience_section_text or not experience_section_text.strip():
        return ExtractedField(value=[], confidence="low", strategy="empty", raw=None)

    lines = [ln.strip() for ln in experience_section_text.split("\n") if ln.strip()]
    entries: List[ExtractedExperience] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Look for company/role line (often has dates)
        start_date, end_date, is_current = _parse_dates(line)
        company = None
        role = None
        if start_date or end_date:
            # This line has dates - previous line might be role, before that company
            rest = re.sub(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s*[-–—].*", "", line, flags=re.I).strip()
            if rest and len(rest) < 80:
                role = rest
            if i >= 1:
                prev = lines[i - 1]
                if not re.search(r"\d{4}", prev) and len(prev) < 80:
                    company = prev
                    if not role:
                        role = prev
            if i >= 2 and not company:
                company = lines[i - 2] if len(lines[i - 2]) < 80 else None

        if not company and not role:
            company = line if len(line) < 80 else None
            role = line

        bullets: List[str] = []
        i += 1
        while i < len(lines):
            bline = lines[i]
            is_bullet = any(bline.startswith(c) for c in BULLET_CHARS) or (
                bline[0].isupper() if bline else False
                and bline.split()[0].lower().rstrip(".,") in ACTION_VERBS
            )
            if is_bullet or (bline and not re.search(r"\d{4}", bline) and len(bline) > 20):
                bullets.append(bline.lstrip("•·-–—*▪▸►✓ "))
                i += 1
            elif re.search(r"\d{4}", bline) or any(kw in bline.lower() for kw in TITLE_KEYWORDS):
                break
            else:
                i += 1

        if company or role or bullets:
            entries.append(
                ExtractedExperience(
                    company=company,
                    role=role,
                    start_date=start_date,
                    end_date=end_date,
                    is_current=is_current,
                    bullets=bullets,
                    location=None,
                )
            )

    return ExtractedField(
        value=entries,
        confidence="high" if entries else "low",
        strategy="regex",
        raw=experience_section_text[:500],
    )
