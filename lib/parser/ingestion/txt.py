"""
Layer 1 — Plain text ingestion.
"""
from typing import List


def extract_plain_text(buffer: bytes) -> str:
    """Split on newlines. Trim each line. Remove purely whitespace lines."""
    try:
        text = buffer.decode("utf-8", errors="replace")
    except Exception:
        text = buffer.decode("latin-1", errors="replace")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    return "\n".join(lines)
