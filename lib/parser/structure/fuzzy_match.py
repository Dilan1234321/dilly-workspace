"""
Layer 2 — Fuzzy matching for section headers.
"""
import re
from typing import Optional

from .section_header_dictionary import SECTION_HEADER_MAP

try:
    import Levenshtein
    HAS_LEVENSHTEIN = True
except ImportError:
    HAS_LEVENSHTEIN = False


def _normalize(text: str) -> str:
    """Lowercase, trim, remove non-alphanumeric except spaces and ampersands, collapse spaces."""
    s = (text or "").lower().strip()
    s = re.sub(r"[^\w\s&]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _levenshtein_distance(a: str, b: str) -> int:
    """Levenshtein distance. Use library if available, else simple DP."""
    if HAS_LEVENSHTEIN:
        return Levenshtein.distance(a, b)
    # Simple DP implementation
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
    return dp[m][n]


def fuzzy_match_header(text: str) -> Optional[str]:
    """
    Normalize input, check direct match first.
    If not found, iterate dictionary keys, compute similarity.
    If best similarity > 0.82, return canonical. Else return None.
    """
    norm = _normalize(text)
    if not norm:
        return None

    # Direct match
    if norm in SECTION_HEADER_MAP:
        return SECTION_HEADER_MAP[norm]

    # Fuzzy match
    best_sim = 0.0
    best_canonical: Optional[str] = None
    max_len = max(len(norm), 1)

    for key in SECTION_HEADER_MAP:
        dist = _levenshtein_distance(norm, key)
        key_len = max(len(key), 1)
        sim = 1.0 - (dist / max(len(norm), len(key)))
        if sim > best_sim:
            best_sim = sim
            best_canonical = SECTION_HEADER_MAP[key]

    if best_sim > 0.82:
        return best_canonical
    return None
