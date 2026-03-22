"""
Layer 3 — Summary extraction.
"""
from ..types import ExtractedField


def extract_summary(summary_section_text: str) -> ExtractedField:
    """Return full text content of SUMMARY section."""
    if not summary_section_text or not summary_section_text.strip():
        return ExtractedField(value=None, confidence="low", strategy="not_found", raw=None)
    text = summary_section_text.strip()
    return ExtractedField(value=text, confidence="high", strategy="section", raw=text)
