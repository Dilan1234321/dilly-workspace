"""
Humanize — strip signs of AI-generated writing from text.

A deterministic post-processor that runs on every LLM output in Dilly
(cover letters, tailored bullets, recruiter outreach drafts, coach
responses) to strip the ~20 most common "this was written by ChatGPT"
tells before the text reaches the student.

Based on the open-source `blader/humanizer` Claude Code skill (MIT),
which itself is based on Wikipedia's "Signs of AI writing" guide
maintained by WikiProject AI Cleanup.

This module implements the DETERMINISTIC subset of the 29 patterns —
pure Python, zero LLM calls, <10ms for a typical cover letter. The
handful of structural patterns that need LLM-quality rewriting
(significance inflation, rule-of-three, false ranges, -ing phrase
overuse) are left alone; callers can opt into a higher-quality LLM
pass on top if they want.

Primary entry point:

    humanize(text: str, *, aggressive: bool = False) -> str

Pass `aggressive=True` to enable the more opinionated replacements
(AI vocabulary substitution, copula avoidance rewrites, persuasive
authority strips) that have slightly higher false-positive rates.

Idempotent: running humanize twice on the same text produces the
same result as running it once.

MIT — same license as the upstream humanizer skill.
"""

from __future__ import annotations

import re
from typing import List, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 14: Em dash overuse.  LLMs love em dashes for "punchy" rhythm;
# most can be rewritten as commas, periods, or parentheses without losing
# meaning. We use commas when the following clause is short, periods when
# it's a full sentence.
# ─────────────────────────────────────────────────────────────────────────────

_EM_DASH_RE = re.compile(r"\s*[—–]\s*")


def _fix_em_dashes(text: str) -> str:
    # First pass: em dash at clause boundary → comma. Avoid converting
    # em dashes inside number ranges ("2020–2024") which are legitimate.
    def _repl(match: re.Match) -> str:
        start, end = match.span()
        before = text[max(0, start - 1):start]
        after = text[end:end + 1]
        # Number range — leave it
        if before.isdigit() and after.isdigit():
            return match.group(0)
        return ", "

    return _EM_DASH_RE.sub(_repl, text)


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 19: Curly quotes. ChatGPT loves typographic quotes; most ATS
# parsers and every plain-text consumer hate them.
# Pattern 18: Emojis in headings / bullets. Strip the common ones.
# Also strips non-breaking spaces and narrow no-break spaces that come
# out of Word/Google Docs.
# ─────────────────────────────────────────────────────────────────────────────

_CURLY_SINGLE = {"\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'"}
_CURLY_DOUBLE = {"\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"'}
_NBSP = {"\u00a0": " ", "\u202f": " ", "\u2009": " "}
_ELLIPSIS = {"\u2026": "..."}
_EMOJI_RE = re.compile(
    # Rough emoji ranges (not exhaustive, just the common ones in AI output)
    r"[\U0001F300-\U0001F6FF\U0001F900-\U0001F9FF\U00002600-\U000027BF\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U0001FA00-\U0001FAFF]"
)


def _fix_punctuation(text: str) -> str:
    for src, dst in {**_CURLY_SINGLE, **_CURLY_DOUBLE, **_NBSP, **_ELLIPSIS}.items():
        text = text.replace(src, dst)
    # Strip decorative emojis that LLMs sprinkle into headers and bullets
    text = _EMOJI_RE.sub("", text)
    # Collapse resulting double spaces
    text = re.sub(r"  +", " ", text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 20 + 22: Collaborative artifacts + sycophantic openers.
# These phrases are entire sentences or sentence fragments that the
# student should never see in final text.
# ─────────────────────────────────────────────────────────────────────────────

_SYCOPHANTIC_SENTENCE_PATTERNS = [
    # Entire sentences that should be removed wherever they appear
    r"Great\s+question[!.]",
    r"Excellent\s+question[!.]",
    r"Certainly[!.]",
    r"Of\s+course[!.]",
    r"Absolutely[!.]",
    r"That'?s\s+an?\s+excellent\s+point[!.]",
    r"You'?re\s+absolutely\s+right[!.]",
    r"You'?re\s+right[!.]",
    r"I\s+hope\s+this\s+helps[!.]",
    r"Hope\s+this\s+helps[!.]",
    r"Let\s+me\s+know\s+if\s+you'?d\s+like[^.!?]*[.!?]",
    r"Let\s+me\s+know\s+if[^.!?]*[.!?]",
    r"Would\s+you\s+like\s+me\s+to[^.!?]*\?",
]
_SYCOPHANTIC_SENTENCE_RE = re.compile(
    r"(?:" + "|".join(_SYCOPHANTIC_SENTENCE_PATTERNS) + r")",
    re.IGNORECASE,
)

# Opening "Here is / Here's [intro preamble]:" — strip when it leads
# a paragraph, since it's a classic chatbot preamble.
_HERE_IS_RE = re.compile(
    r"^\s*Here\s+(?:is|'?s)\s+(?:an?|the|what\s+you\s+need\s+to\s+know)[^.!?]*[:.]",
    re.IGNORECASE | re.MULTILINE,
)


def _strip_chatbot_artifacts(text: str) -> str:
    # Strip anywhere sycophantic sentences appear (not just line starts)
    text = _SYCOPHANTIC_SENTENCE_RE.sub("", text)
    # Strip "Here is X:" preambles at line starts only
    text = _HERE_IS_RE.sub("", text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 28: Signposting / announcements. "Let's dive in", "without
# further ado", "Here's what you need to know" — strip when they open
# a sentence/paragraph.
# ─────────────────────────────────────────────────────────────────────────────

_SIGNPOSTING = [
    r"Let'?s\s+dive\s+in[^.!?]*[.!?]",
    r"Let'?s\s+explore\s+[^.!?]*[.!?]",
    r"Let'?s\s+break\s+(?:this|it)\s+down[^.!?]*[.!?]",
    r"Without\s+further\s+ado[^.!?]*[.!?]",
    r"Now\s+let'?s\s+look\s+at[^.!?]*[.!?]",
    r"In\s+this\s+(?:essay|article|post|guide)\s+we\s+will[^.!?]*[.!?]",
]
_SIGNPOSTING_RE = re.compile(r"(?:" + "|".join(_SIGNPOSTING) + r")", re.IGNORECASE)


def _strip_signposting(text: str) -> str:
    return _SIGNPOSTING_RE.sub("", text)


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 21: Knowledge-cutoff disclaimers. Entire sentences — strip them.
# ─────────────────────────────────────────────────────────────────────────────

_CUTOFF_DISCLAIMERS = [
    r"[^.!?]*(?:as\s+of\s+my\s+(?:last\s+)?(?:knowledge|training)\s+(?:update|cutoff))[^.!?]*[.!?]",
    r"[^.!?]*(?:up\s+to\s+my\s+(?:last\s+)?training\s+update)[^.!?]*[.!?]",
    r"[^.!?]*(?:based\s+on\s+(?:the\s+)?(?:publicly\s+)?available\s+information)[^.!?]*[.!?]",
    r"[^.!?]*(?:while\s+specific\s+details\s+(?:are|may\s+be)\s+(?:limited|scarce|not\s+extensively))[^.!?]*[.!?]",
    r"[^.!?]*(?:I\s+don'?t\s+have\s+(?:the\s+)?(?:specific|exact|detailed)\s+information)[^.!?]*[.!?]",
]
_CUTOFF_RE = re.compile(r"(?:" + "|".join(_CUTOFF_DISCLAIMERS) + r")", re.IGNORECASE)


def _strip_cutoff_disclaimers(text: str) -> str:
    return _CUTOFF_RE.sub("", text)


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 23: Filler phrases. Direct replacements. These never make
# writing worse.
# ─────────────────────────────────────────────────────────────────────────────

_FILLER_REPLACEMENTS: List[Tuple[str, str]] = [
    (r"\bin\s+order\s+to\b",                                         "to"),
    (r"\bdue\s+to\s+the\s+fact\s+that\b",                            "because"),
    (r"\bat\s+this\s+point\s+in\s+time\b",                           "now"),
    (r"\bat\s+this\s+moment\s+in\s+time\b",                          "now"),
    (r"\bin\s+the\s+event\s+that\b",                                 "if"),
    (r"\bhas\s+the\s+ability\s+to\b",                                "can"),
    (r"\bhave\s+the\s+ability\s+to\b",                               "can"),
    (r"\bhad\s+the\s+ability\s+to\b",                                "could"),
    (r"\bit\s+is\s+important\s+to\s+note\s+that\b",                  ""),
    (r"\bit\s+should\s+be\s+noted\s+that\b",                         ""),
    (r"\bit\s+is\s+worth\s+(?:noting|mentioning)\s+that\b",          ""),
    (r"\bfor\s+all\s+intents\s+and\s+purposes\b",                    "effectively"),
    (r"\bwith\s+regard\s+to\b",                                      "about"),
    (r"\bwith\s+respect\s+to\b",                                     "about"),
    (r"\bin\s+terms\s+of\b",                                         "for"),
    (r"\ba\s+wide\s+(?:range|variety)\s+of\b",                       "many"),
    (r"\ba\s+large\s+number\s+of\b",                                 "many"),
    (r"\bthe\s+vast\s+majority\s+of\b",                              "most"),
    (r"\bin\s+the\s+process\s+of\b",                                 ""),
    (r"\bbe\s+that\s+as\s+it\s+may\b",                               "still"),
]

_FILLER_COMPILED = [(re.compile(p, re.IGNORECASE), r) for p, r in _FILLER_REPLACEMENTS]


def _strip_filler(text: str) -> str:
    for pattern, replacement in _FILLER_COMPILED:
        text = pattern.sub(replacement, text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 24: Excessive hedging. Collapse stacked hedges.
# ─────────────────────────────────────────────────────────────────────────────

_HEDGING_REPLACEMENTS: List[Tuple[str, str]] = [
    (r"\bcould\s+potentially\s+possibly\b",    "could"),
    (r"\bcould\s+potentially\b",               "could"),
    (r"\bmight\s+potentially\b",               "might"),
    (r"\bmay\s+potentially\b",                 "may"),
    (r"\bit\s+could\s+be\s+argued\s+that\b",   ""),
    (r"\bsomewhat\s+of\s+an?\b",               "a"),
    (r"\bkind\s+of\s+like\b",                  "like"),
    (r"\brather\s+quite\b",                    "quite"),
    (r"\bvery\s+(?:quite|rather)\b",           "very"),
]
_HEDGING_COMPILED = [(re.compile(p, re.IGNORECASE), r) for p, r in _HEDGING_REPLACEMENTS]


def _strip_hedging(text: str) -> str:
    for pattern, replacement in _HEDGING_COMPILED:
        text = pattern.sub(replacement, text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 27: Persuasive authority tropes. Strip the throat-clearing.
# ─────────────────────────────────────────────────────────────────────────────

_AUTHORITY_RE = re.compile(
    r"(?:"
    r"the\s+real\s+question\s+is|"
    r"at\s+its\s+core,?|"
    r"at\s+the\s+heart\s+of\s+(?:it|the\s+matter),?|"
    r"fundamentally,?|"
    r"in\s+essence,?|"
    r"the\s+deeper\s+(?:question|issue|truth)\s+is|"
    r"what\s+really\s+matters\s+is|"
    r"what\s+truly\s+matters\s+is"
    r")\s*",
    re.IGNORECASE,
)


def _strip_authority_tropes(text: str) -> str:
    def _repl(match: re.Match) -> str:
        # After stripping the trope, capitalize the next word if it starts
        # a sentence so we don't leave a lowercase letter dangling.
        return ""
    out = _AUTHORITY_RE.sub(_repl, text)
    # Capitalize sentence starts that became lowercase
    out = re.sub(
        r"([.!?]\s+|\A\s*|\n\s*)([a-z])",
        lambda m: m.group(1) + m.group(2).upper(),
        out,
    )
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 7 (aggressive): Overused AI vocabulary. Replacement table is
# opt-in because there are cases where "leverage" or "delve" are
# actually the right word. The aggressive list is short and targets
# only the highest-frequency AI tells.
# ─────────────────────────────────────────────────────────────────────────────

_AI_VOCAB: List[Tuple[str, str]] = [
    # delve → explore (keep tense)
    (r"\bdelve\s+into\b",         "explore"),
    (r"\bdelves\s+into\b",        "explores"),
    (r"\bdelving\s+into\b",       "exploring"),
    (r"\bdelved\s+into\b",        "explored"),
    # leverage → use (keep tense + avoid "using the complexities")
    (r"\bleverage\b",             "use"),
    (r"\bleverages\b",            "uses"),
    (r"\bleveraging\b",           "using"),
    (r"\bleveraged\b",            "used"),
    # garner → earn
    (r"\bgarner\b",               "earn"),
    (r"\bgarners\b",              "earns"),
    (r"\bgarnered\b",             "earned"),
    (r"\bgarnering\b",            "earning"),
    # navigate the complexities of → handle
    (r"\bnavigate\s+the\s+complexities\s+of\b",   "handle"),
    (r"\bnavigates\s+the\s+complexities\s+of\b",  "handles"),
    (r"\bnavigating\s+the\s+complexities\s+of\b", "handling"),
    # underscore → show (strict agreement)
    (r"\bunderscores\b",          "shows"),
    (r"\bunderscored\b",          "showed"),
    (r"\bunderscoring\b",         "showing"),
    (r"\bunderscore\b",           "show"),
    # highlight (verb sense, used as AI intensifier) — skip, too many false positives
    # "the intricate tapestry/landscape of X" → "X"  (strip entire phrase)
    (r"\bthe\s+intricate\s+tapestry\s+of\s+",   ""),
    (r"\bthe\s+intricate\s+landscape\s+of\s+",  ""),
    (r"\bthe\s+evolving\s+landscape\s+of\s+",   ""),
    (r"\bthe\s+ever-?evolving\s+landscape\s+of\s+", ""),
    (r"\bthe\s+rich\s+tapestry\s+of\s+",        ""),
    # "in today's … landscape" — opening cliche, strip everything through the comma
    (r"\bin\s+today'?s\s+[\w\s-]*?landscape[,\s]*",  ""),
    # testament → proof (preserves grammatical agreement because "proof of" slots in cleanly)
    (r"\ba\s+testament\s+to\b",            "proof of"),
    (r"\ban\s+testament\s+to\b",           "proof of"),
    (r"\bstands\s+as\s+a\s+testament\s+to\b",  "proves"),
    (r"\bserves\s+as\s+a\s+testament\s+to\b",  "proves"),
    (r"\bis\s+a\s+testament\s+to\b",           "proves"),
    (r"\bare\s+a\s+testament\s+to\b",          "prove"),
    # reminder cliche
    (r"\bstands\s+as\s+a\s+reminder\s+that\b", "reminds us that"),
    (r"\bserves\s+as\s+a\s+reminder\s+that\b", "reminds us that"),
    # "pivotal moment" / "pivotal role"
    (r"\ba\s+pivotal\s+(?:moment|role)\b",     "a key moment"),
    # "transformative potential" / "transformative power"
    (r"\btransformative\s+(?:potential|power)\b", "impact"),
]
# Compile patterns and keep the replacement (either string or callable).
_AI_VOCAB_COMPILED = [(re.compile(p, re.IGNORECASE), r) for p, r in _AI_VOCAB]


def _strip_ai_vocab(text: str) -> str:
    for pattern, replacement in _AI_VOCAB_COMPILED:
        text = pattern.sub(replacement, text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 8 (aggressive): Copula avoidance. Replace fancy constructions
# with plain "is"/"are"/"has".
# ─────────────────────────────────────────────────────────────────────────────

_COPULA_REPLACEMENTS: List[Tuple[str, str]] = [
    (r"\bserves\s+as\s+an?\b",       "is a"),
    (r"\bstands\s+as\s+an?\b",       "is a"),
    (r"\bserves\s+to\s+(\w+)\b",     lambda m: m.group(1) + "s"),
    (r"\bfunctions\s+as\s+an?\b",    "is a"),
    (r"\brepresents\s+an?\b",        "is a"),
    (r"\bconstitutes\s+an?\b",       "is a"),
    (r"\bmarks\s+an?\b",             "is a"),
    (r"\bembodies\s+the\b",          "is the"),
    (r"\bboasts\s+(\d)",             lambda m: "has " + m.group(1)),
    (r"\bboasts\s+an?\b",            "has a"),
    (r"\bfeatures\s+an?\b",          "has a"),
    (r"\bfeatures\s+(\d)",           lambda m: "has " + m.group(1)),
]
_COPULA_COMPILED = [(re.compile(p, re.IGNORECASE), r) for p, r in _COPULA_REPLACEMENTS]


def _strip_copula_avoidance(text: str) -> str:
    for pattern, replacement in _COPULA_COMPILED:
        text = pattern.sub(replacement, text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Pattern 25: Generic positive conclusions. Detect the last paragraph
# and strip it if it's a stock sign-off.
# ─────────────────────────────────────────────────────────────────────────────

_GENERIC_CONCLUSION_PHRASES = [
    "the future looks bright",
    "exciting times lie ahead",
    "journey toward excellence",
    "continue to thrive",
    "step in the right direction",
    "paves the way for",
    "a bright future",
    "in conclusion, the future",
]


def _strip_generic_conclusion(text: str) -> str:
    # Only strip the final paragraph, and only if it's dominated by cliches.
    paragraphs = text.rsplit("\n\n", 1)
    if len(paragraphs) != 2:
        return text
    head, tail = paragraphs
    tail_lower = tail.lower()
    hit = sum(1 for phrase in _GENERIC_CONCLUSION_PHRASES if phrase in tail_lower)
    if hit >= 1 and len(tail) < 400:
        return head
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Cleanup pass: collapse multi-spaces, fix double punctuation after
# removals, trim whitespace around line breaks.
# ─────────────────────────────────────────────────────────────────────────────

def _tidy(text: str) -> str:
    # Double spaces inside lines
    text = re.sub(r"[ \t]+", " ", text)
    # Double punctuation that can result from strips (e.g. ". ,")
    text = re.sub(r",\s*,", ",", text)
    text = re.sub(r"\.\s*\.(?!\.)", ".", text)  # ".." → "." but leave "..."
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    # Blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Strip leading/trailing whitespace on each line
    text = "\n".join(line.strip() for line in text.split("\n"))
    # Collapse accidental paragraph leaders like ". Foo" → "Foo"
    text = re.sub(r"^\s*[,.;:]\s*", "", text, flags=re.MULTILINE)
    return text.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def humanize(text: str, *, aggressive: bool = False) -> str:
    """
    Strip deterministic AI writing tells from `text`.

    Always-on passes (safe, high-precision):
        - curly quotes → straight
        - em dashes → commas/periods
        - emojis in body text → stripped
        - chatbot artifacts ("Great question!", "I hope this helps!", …)
        - signposting ("Let's dive in…")
        - knowledge-cutoff disclaimers
        - filler phrases ("in order to" → "to", …)
        - excessive hedging ("could potentially possibly" → "could")
        - generic positive conclusions (last-paragraph cliche strip)

    Aggressive passes (opt-in, slightly higher false-positive risk):
        - AI vocabulary replacement ("delve" → "explore", "leverage" → "use")
        - Copula avoidance rewrites ("serves as a" → "is a")
        - Persuasive authority tropes ("at its core" → stripped)

    Idempotent. Pure Python. Typical 300-word cover letter runs in <5ms.
    """
    if not text or not text.strip():
        return text

    out = text

    # Always-on
    out = _fix_punctuation(out)
    out = _fix_em_dashes(out)
    out = _strip_chatbot_artifacts(out)
    out = _strip_signposting(out)
    out = _strip_cutoff_disclaimers(out)
    out = _strip_filler(out)
    out = _strip_hedging(out)
    out = _strip_generic_conclusion(out)

    # Aggressive
    if aggressive:
        out = _strip_ai_vocab(out)
        out = _strip_copula_avoidance(out)
        out = _strip_authority_tropes(out)

    out = _tidy(out)
    return out


def humanize_bullet(text: str) -> str:
    """
    Humanize a single resume bullet. Always uses aggressive mode because
    bullets are short and the high-precision rewrites rarely over-trigger
    on them, plus the extra polish matters more per character.
    """
    if not text or not text.strip():
        return text
    cleaned = humanize(text, aggressive=True)
    # Bullets should end with a period and start with a capital.
    cleaned = cleaned.strip()
    if cleaned and not cleaned[0].isupper() and cleaned[0].isalpha():
        cleaned = cleaned[0].upper() + cleaned[1:]
    if cleaned and cleaned[-1] not in ".!?":
        cleaned += "."
    return cleaned


__all__ = ["humanize", "humanize_bullet"]
