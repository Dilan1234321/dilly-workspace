"""
Hard output gate for user-visible assistant text.

Models must never emit slurs or targeted hate — including when users ask for quotes,
roleplay, or "ignore previous instructions". This module enforces that on the server
regardless of jailbreaks. Pair with system-prompt rules in voice_helpers.
"""

from __future__ import annotations

import re
import unicodedata

REDIRECT_MESSAGE = "Let's try to keep this professional."

# Compact regexes (case-insensitive) on NFKC + casefolded text. Word boundaries reduce
# accidental hits; extend the list as needed for new abuse patterns.
_SLUR_PATTERN_STRINGS: tuple[str, ...] = (
    # Racial / ethnic
    r"\bn[i1!|@]gg[ae3@][r2]?s?\b",
    r"\bniggas?\b",
    r"\bniggaz\b",
    r"\bsand[\W_]*n[i1!@]gg[ae3@][r2]?s?\b",
    r"\bch[i1]nk[sz]?\b",
    r"\bg[o0]{2}ks?\b",
    r"\bsp[i1]c[s]?\b",
    r"\bw[e3]tb[a@]cks?\b",
    r"\bt[o0]w[e3]lh[e3][a@]ds?\b",
    r"\br[a@]gh[e3][a@]ds?\b",
    r"\bb[e3][a@]n[e3]rs?\b",
    r"\bc[o0]{2}ns?\b",
    r"\bj[i1]g[a@]b[o0]{2}s?\b",
    r"\bp[i1]ck[a@]nn[i1]nn(y|ies)\b",
    r"\bp[a@]k[i1]s?\b",
    r"\bw[o0]gs?\b",
    r"\bd[a@]g[o0]s?\b",
    r"\bkr[a@]uts?\b",
    r"\bh[o0]nk(y|ies)\b",
    r"\bch[i1]n[a@]m[a@]n\b",
    r"\b[i1]njuns?\b",
    r"\br[e3]dsk[i1]ns?\b",
    r"\bsp[o0]{2}ks?\b",
    # Antisemitic
    r"\bk[i1@!]k[e3]s?\b",
    # Homophobic / transphobic
    r"\bf[a@4]gg[o0]ts?\b",
    r"\bf[a@4]gs?\b",
    r"\bd[y0]k[e3]s?\b",
    r"\btr[a@]nn(y|ies)\b",
    r"\bsh[e3]m[a@]l[e3]s?\b",
    # Ableist / misogynistic / other severe slurs
    r"\br[e3]t[a@]rd(s|ed)?\b",
    r"\bc[u]nts?\b",
    r"\bwh[o0]r[e3]s?\b",
    r"\bsl[u]ts?\b",
    r"\bb[i1]tch[e3]s?\b",
)

_COMPILED: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE) for p in _SLUR_PATTERN_STRINGS
)


def _normalized_sample(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "").casefold()


def text_contains_blocked_slur(text: str) -> bool:
    if not (text or "").strip():
        return False
    sample = _normalized_sample(text)
    return any(rx.search(sample) for rx in _COMPILED)


def sanitize_user_visible_assistant_text(text: str) -> str:
    """Return REDIRECT_MESSAGE if the model output contains a blocked slur; else unchanged."""
    if text_contains_blocked_slur(text):
        return REDIRECT_MESSAGE
    return text


def sanitize_voice_reply_and_suggestions(text: str, suggestions: list[str]) -> tuple[str, list[str]]:
    """Sanitize assistant reply; clear follow-up suggestions when redirecting."""
    out = sanitize_user_visible_assistant_text(text)
    if out == REDIRECT_MESSAGE:
        return out, []
    return out, suggestions


def json_contains_blocked_slur(obj: object) -> bool:
    """True if any string value in a JSON-like tree contains a blocked slur."""
    if isinstance(obj, str):
        return text_contains_blocked_slur(obj)
    if isinstance(obj, dict):
        return any(json_contains_blocked_slur(v) for v in obj.values())
    if isinstance(obj, list):
        return any(json_contains_blocked_slur(v) for v in obj)
    return False
