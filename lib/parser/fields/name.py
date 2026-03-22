"""
Layer 3 — Name extraction.
"""
import re
from typing import List, Optional

from ..types import ExtractedField, TextChunk


def _is_likely_name(text: str) -> bool:
    """Returns True if text passes all name heuristics."""
    if not text or len(text) < 2 or len(text) > 60:
        return False
    words = text.split()
    if len(words) < 2 or len(words) > 5:
        return False
    if "@" in text or re.search(r"\d{4}", text) or "http" in text.lower():
        return False
    if "|" in text or "·" in text:
        return False
    letters = sum(1 for c in text if c.isalpha())
    if letters / max(len(text), 1) < 0.7:
        return False
    if not re.match(r"^[A-Za-zÀ-ÖØ-öø-ÿ\s\-'.]+$", text):
        return False
    # Reject section headers
    low = text.lower()
    reject = ("education", "experience", "summary", "skills", "objective", "profile")
    if low in reject or any(r in low for r in reject):
        return False
    role_like_terms = (
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
    )
    if any(term in low for term in role_like_terms):
        return False
    return True


def _title_case(s: str) -> str:
    """Simple title case for names."""
    return " ".join(w.capitalize() if w else "" for w in s.split())


def extract_name(
    chunks: List[TextChunk],
    preamble_text: str,
    use_llm: bool = False,
) -> ExtractedField:
    """
    Try strategies in order. Stop at first isLikelyName() match.
    """
    # Get page 1 chunks, top 20% vertical band.
    page1 = [c for c in chunks if c.page == 1]
    if not page1:
        page1 = chunks[:50]
    ys = [c.y for c in page1]
    min_y = min(ys, default=0.0)
    max_y = max(ys, default=0.0)
    y_span = max(max_y - min_y, 1.0)
    low_band = min_y + (y_span * 0.2)
    high_band = max_y - (y_span * 0.2)
    # Support either coordinate orientation by checking both bands.
    band_low_chunks = [c for c in page1 if c.y <= low_band]
    band_high_chunks = [c for c in page1 if c.y >= high_band]
    top_chunks = band_high_chunks if len(band_high_chunks) >= len(band_low_chunks) else band_low_chunks
    if not top_chunks:
        page1_sorted = sorted(page1, key=lambda c: -c.y)
        top_chunks = page1_sorted[: max(5, len(page1_sorted) // 5)]

    # Strategy 1: Largest font in top 20%
    if top_chunks:
        max_font = max((c.font_size for c in top_chunks), default=0)
        if max_font > 0:
            same_font = [c for c in top_chunks if abs(c.font_size - max_font) <= 1]
            same_font = sorted(same_font, key=lambda c: (c.y, c.x))
            joined = " ".join(c.text for c in same_font).strip()
            if _is_likely_name(joined):
                return ExtractedField(
                    value=_title_case(joined),
                    confidence="high",
                    strategy="largest_font",
                    raw=joined,
                )

    # Strategy 2: First bold in top 20%
    for c in sorted(top_chunks, key=lambda x: (x.y, x.x)):
        if c.font_weight == "bold" and _is_likely_name(c.text):
            return ExtractedField(
                value=_title_case(c.text),
                confidence="high",
                strategy="first_bold",
                raw=c.text,
            )

    # Strategy 3: First name-like line in preamble
    preamble_lines = preamble_text.split("\n")[:10]
    for line in preamble_lines:
        line = line.strip()
        if _is_likely_name(line):
            return ExtractedField(
                value=_title_case(line),
                confidence="medium",
                strategy="first_name_line",
                raw=line,
            )

    # Strategy 4: Line above email
    email_match = re.search(r"[\w.+\-]+@[\w\-]+\.[\w.\-]+", preamble_text)
    if email_match:
        lines = preamble_text.split("\n")
        for i, line in enumerate(lines):
            if email_match.group(0) in line and i > 0:
                above = lines[i - 1].strip()
                if _is_likely_name(above):
                    return ExtractedField(
                        value=_title_case(above),
                        confidence="medium",
                        strategy="above_email",
                        raw=above,
                    )
                break

    # Strategy 5: LLM
    if use_llm:
        try:
            from ..llm.llm_fallback import _llm_extract_name
            name = _llm_extract_name(preamble_text[:500])
            if name and _is_likely_name(name):
                return ExtractedField(
                    value=_title_case(name),
                    confidence="medium",
                    strategy="llm",
                    raw=name,
                )
        except Exception:
            pass

    return ExtractedField(
        value=None,
        confidence="low",
        strategy="failed",
        raw=None,
    )
