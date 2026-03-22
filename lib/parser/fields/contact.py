"""
Layer 3 — Contact extraction (email, phone, LinkedIn, location).
"""
import re
from typing import Tuple

from ..types import ExtractedField


def extract_email(text: str) -> ExtractedField:
    """First valid email in text."""
    m = re.search(r"[\w.+\-]+@[\w\-]+\.[\w.\-]+", text)
    if m:
        return ExtractedField(value=m.group(0), confidence="high", strategy="regex", raw=m.group(0))
    return ExtractedField(value=None, confidence="low", strategy="not_found", raw=None)


def extract_phone(text: str) -> ExtractedField:
    """Try patterns in order. Normalize to (NNN) NNN-NNNN."""
    patterns = [
        r"\+1\s*\(?(\d{3})\)?\s*\-?\s*(\d{3})\s*\-?\s*(\d{4})",
        r"\(?(\d{3})\)?\s*\-?\s*(\d{3})\s*\-?\s*(\d{4})",
        r"(\d{3})\-(\d{3})\-(\d{4})",
        r"(\d{3})\.(\d{3})\.(\d{4})",
        r"(\d{10})",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            g = m.groups()
            if len(g) == 3:
                return ExtractedField(
                    value=f"({g[0]}) {g[1]}-{g[2]}",
                    confidence="high",
                    strategy="regex",
                    raw=m.group(0),
                )
            if len(g) == 1 and len(g[0]) == 10:
                return ExtractedField(
                    value=f"({g[0][:3]}) {g[0][3:6]}-{g[0][6:]}",
                    confidence="high",
                    strategy="regex",
                    raw=m.group(0),
                )
    return ExtractedField(value=None, confidence="low", strategy="not_found", raw=None)


def extract_linkedin(text: str) -> ExtractedField:
    """LinkedIn URL or username after 'linkedin' keyword."""
    m = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/([a-zA-Z0-9\-]+)/?", text, re.I)
    if m:
        return ExtractedField(
            value=f"https://linkedin.com/in/{m.group(1)}",
            confidence="high",
            strategy="regex",
            raw=m.group(0),
        )
    m = re.search(r"linkedin\s*[:\s]*([a-zA-Z0-9\-]+)", text, re.I)
    if m:
        return ExtractedField(
            value=f"https://linkedin.com/in/{m.group(1)}",
            confidence="medium",
            strategy="inferred",
            raw=m.group(1),
        )
    return ExtractedField(value=None, confidence="low", strategy="not_found", raw=None)


def extract_location(text: str) -> ExtractedField:
    """City, ST or City, ST ZIP or City, State."""
    m = re.search(r"([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})(?:\s+\d{5})?", text)
    if m:
        return ExtractedField(value=m.group(0).strip(), confidence="high", strategy="regex", raw=m.group(0))
    m = re.search(r"([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Za-z\s]+?)(?:\s+\d{5})?(?:\s|$|\.)", text)
    if m:
        loc = m.group(0).strip().rstrip(".,")
        if 5 < len(loc) < 60:
            return ExtractedField(value=loc, confidence="high", strategy="regex", raw=loc)
    return ExtractedField(value=None, confidence="low", strategy="not_found", raw=None)


def extract_contact(preamble_text: str) -> Tuple[ExtractedField, ExtractedField, ExtractedField, ExtractedField]:
    """Extract email, phone, linkedin, location from preamble."""
    return (
        extract_email(preamble_text),
        extract_phone(preamble_text),
        extract_linkedin(preamble_text),
        extract_location(preamble_text),
    )
