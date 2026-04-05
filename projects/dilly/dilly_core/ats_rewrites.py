"""
Dilly "Fix It For Me" — ATS-Optimized Bullet Rewrites.

Takes resume bullets and ATS issues, returns rewritten versions that are:
1. ATS-parseable (strong verb first, no passive voice)
2. Quantified (numbers, percentages, outcomes)
3. Keyword-optimized (contextual use of relevant terms)

Two modes:
- Rule-based (instant, no API calls): verb replacement, structure fixes, quantification placeholders
- LLM-enhanced (when available): full semantic rewrite preserving meaning, adding specificity

The rule-based engine is good enough to ship alone. LLM makes it great.
"""

import re
from dataclasses import dataclass
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class BulletRewrite:
    """One bullet rewrite suggestion."""
    original: str               # the original bullet text (stripped of bullet char)
    rewritten: str              # the suggested rewrite
    changes: List[str]          # list of what changed (e.g., "Replaced weak verb", "Added quantification placeholder")
    source: str                 # "rule" or "llm"


@dataclass
class RewriteResult:
    """Full rewrite output."""
    rewrites: List[BulletRewrite]
    summary: str                # "X bullets rewritten, Y improvements made"

    def to_dict(self) -> dict:
        return {
            "rewrites": [
                {
                    "original": r.original,
                    "rewritten": r.rewritten,
                    "changes": r.changes,
                    "source": r.source,
                }
                for r in self.rewrites
            ],
            "summary": self.summary,
        }


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_WEAK_VERB_MAP: Dict[str, str] = {
    "responsible for": "Led",
    "helped with": "Supported",
    "assisted in": "Contributed to",
    "assisted with": "Contributed to",
    "worked on": "Built",
    "duties included": "Delivered",
    "tasked with": "Managed",
    "involved in": "Drove",
    "participated in": "Contributed to",
    "was responsible for": "Owned",
    "was involved in": "Drove",
    "was tasked with": "Managed",
    "was in charge of": "Led",
    "in charge of": "Led",
    "handled": "Managed",
    "dealt with": "Resolved",
    "took care of": "Managed",
    "took part in": "Contributed to",
    "made sure": "Ensured",
    "put together": "Assembled",
    "came up with": "Developed",
    "looked into": "Investigated",
    "got": "Secured",
    "did": "Executed",
    "ran": "Directed",
    "used": "Leveraged",
    "had to": "Drove",
}

# Strong verbs by category for variety when suggesting alternatives
_STRONG_VERBS = {
    "leadership": ["Led", "Directed", "Managed", "Oversaw", "Supervised", "Coordinated", "Spearheaded"],
    "creation": ["Built", "Designed", "Developed", "Created", "Launched", "Established", "Engineered"],
    "improvement": ["Increased", "Improved", "Optimized", "Streamlined", "Enhanced", "Accelerated", "Strengthened"],
    "reduction": ["Reduced", "Eliminated", "Cut", "Decreased", "Minimized", "Consolidated"],
    "analysis": ["Analyzed", "Evaluated", "Assessed", "Investigated", "Researched", "Audited"],
    "delivery": ["Delivered", "Implemented", "Executed", "Deployed", "Shipped", "Completed"],
    "communication": ["Presented", "Negotiated", "Collaborated", "Facilitated", "Advocated"],
}

# Patterns that indicate a bullet lacks quantification
_VAGUE_PATTERNS = [
    (r"\b(?:many|several|various|multiple|numerous)\b(?!\s*[-])", "Replace with a specific number"),
    (r"\b(?:improved|increased|boosted|grew|enhanced)\b(?!.*\d)", "Add a number: by how much?"),
    (r"\b(?:reduced|decreased|cut|lowered|minimized)\b(?!.*\d)", "Add a number: by how much?"),
    (r"\b(?:managed|led|supervised|oversaw)\b.*\b(?:team|group|staff)\b(?!.*\d)", "Add team size"),
    # Only match "X clients/customers" as a standalone noun (not in compound words like "customer-facing")
    (r"\b(?:customer|client|user|student|patient)s\b(?![-])", "Add count of people served"),
]

# Filler phrases that can be removed entirely
_FILLER_PHRASES = [
    (r"\b(?:in order to)\b", "to"),
    (r"\b(?:on a daily basis)\b", "daily"),
    (r"\b(?:on a weekly basis)\b", "weekly"),
    (r"\b(?:on a regular basis)\b", "regularly"),
    (r"\b(?:as needed)\b", ""),
    (r"\b(?:as required)\b", ""),
    (r"\b(?:and also)\b", "and"),
    (r"\b(?:in addition to)\b", "and"),
    (r"\b(?:with the goal of)\b", "to"),
    (r"\b(?:for the purpose of)\b", "to"),
    (r"\b(?:in the process of)\b", ""),
    (r"\b(?:on behalf of)\b", "for"),
    (r"\b(?:with respect to)\b", "regarding"),
    (r"\b(?:as well as)\b", "and"),
]


# ---------------------------------------------------------------------------
# Rule-based rewrite engine
# ---------------------------------------------------------------------------

def _strip_bullet_char(text: str) -> str:
    """Remove bullet prefix character."""
    return re.sub(r"^[•\-*●\u2022]\s*", "", text.strip())


def _rewrite_weak_verb(text: str) -> tuple[str, Optional[str]]:
    """Replace weak verb phrase with strong verb. Returns (rewritten, change_description or None)."""
    lower = text.lower()
    for weak, strong in _WEAK_VERB_MAP.items():
        if weak in lower:
            pattern = re.compile(re.escape(weak) + r"\s*", re.IGNORECASE)
            after = pattern.sub("", text, count=1).strip()

            # Remove dangling gerunds: "Led managing..." → "Managed..."
            gerund_m = re.match(r"^([a-z]+ing)\b\s*(.*)", after, re.IGNORECASE)
            if gerund_m:
                gerund = gerund_m.group(1).lower()
                rest = gerund_m.group(2).strip()
                # Convert gerund to past tense for the strong verb
                gerund_to_past = {
                    "managing": "Managed", "developing": "Developed", "building": "Built",
                    "creating": "Created", "designing": "Designed", "implementing": "Implemented",
                    "improving": "Improved", "maintaining": "Maintained", "organizing": "Organized",
                    "coordinating": "Coordinated", "leading": "Led", "supporting": "Supported",
                    "analyzing": "Analyzed", "writing": "Wrote", "testing": "Tested",
                    "deploying": "Deployed", "launching": "Launched", "delivering": "Delivered",
                    "training": "Trained", "mentoring": "Mentored", "presenting": "Presented",
                    "researching": "Researched", "facilitating": "Facilitated",
                    "troubleshooting": "Troubleshot", "monitoring": "Monitored",
                    "optimizing": "Optimized", "streamlining": "Streamlined",
                    "automating": "Automated", "integrating": "Integrated",
                }
                if gerund in gerund_to_past:
                    rewritten = f"{gerund_to_past[gerund]} {rest}" if rest else gerund_to_past[gerund]
                    return rewritten, f"Replaced \"{weak} {gerund}\" → \"{gerund_to_past[gerund]}\""

            if after and after[0].isupper():
                after = after[0].lower() + after[1:]
            rewritten = f"{strong} {after}" if after else f"{strong} [describe what you did]"
            return rewritten, f"Replaced \"{weak}\" → \"{strong}\""
    return text, None


def _add_quantification_hints(text: str) -> tuple[str, List[str]]:
    """Add quantification placeholders where vague language is used."""
    changes: List[str] = []
    result = text

    # Skip if bullet already has numbers
    if re.search(r"\d+", result):
        return result, changes

    for pattern, hint in _VAGUE_PATTERNS:
        match = re.search(pattern, result, re.IGNORECASE)
        if match:
            matched_word = match.group(0)

            # Decide what placeholder to use based on context
            # Place hint at end of bullet for natural reading
            stripped = result.rstrip(". ")
            if "team" in hint.lower() or "size" in hint.lower() or "count" in hint.lower():
                result = stripped + " [add team size, e.g., '5 engineers']"
            elif "how much" in hint.lower():
                result = stripped + " [by X%]"
            elif "number" in hint.lower():
                result = result[:match.start()] + "[specific number]" + result[match.end():]
            else:
                result = stripped + " [add metric]"

            changes.append(hint)
            break

    return result, changes


def _gerund_to_inf(gerund: str) -> str:
    """Convert a gerund (e.g., 'identifying') to its infinitive ('identify')."""
    _OVERRIDES = {
        "running": "run", "getting": "get", "setting": "set", "putting": "put",
        "cutting": "cut", "sitting": "sit", "hitting": "hit", "letting": "let",
        "beginning": "begin", "writing": "write", "driving": "drive",
        "making": "make", "having": "have", "giving": "give", "taking": "take",
        "coming": "come", "being": "be", "building": "build", "sending": "send",
        "finding": "find", "telling": "tell", "leading": "lead", "reading": "read",
        "keeping": "keep", "standing": "stand", "holding": "hold",
        "understanding": "understand", "spending": "spend", "meeting": "meet",
        "feeding": "feed", "seeking": "seek", "bringing": "bring",
        "thinking": "think", "buying": "buy", "teaching": "teach",
        "catching": "catch", "dealing": "deal", "feeling": "feel",
        "growing": "grow", "knowing": "know", "losing": "lose", "paying": "pay",
        "selling": "sell", "showing": "show", "speaking": "speak",
        "winning": "win", "choosing": "choose", "wearing": "wear",
        "lying": "lie", "dying": "die", "tying": "tie",
        "analyzing": "analyze", "developing": "develop", "streamlining": "streamline",
        "defining": "define", "designing": "design", "establishing": "establish",
        "examining": "examine", "generating": "generate", "implementing": "implement",
        "maintaining": "maintain", "monitoring": "monitor", "presenting": "present",
        "producing": "produce", "providing": "provide", "resolving": "resolve",
        "reviewing": "review", "supporting": "support", "training": "train",
        "mentoring": "mentor", "collaborating": "collaborate", "coordinating": "coordinate",
        "communicating": "communicate", "documenting": "document", "evaluating": "evaluate",
        "executing": "execute", "improving": "improve", "launching": "launch",
        "managing": "manage", "negotiating": "negotiate", "operating": "operate",
        "organizing": "organize", "overseeing": "oversee", "performing": "perform",
        "preparing": "prepare", "processing": "process", "researching": "research",
        "scheduling": "schedule", "supervising": "supervise", "testing": "test",
        "utilizing": "utilize", "volunteering": "volunteer", "identifying": "identify",
        "deploying": "deploy", "troubleshooting": "troubleshoot", "diagnosing": "diagnose",
        "scoping": "scope", "architecting": "architect", "prototyping": "prototype",
    }
    low = gerund.lower()
    if low in _OVERRIDES:
        return _OVERRIDES[low]
    if not low.endswith("ing") or len(low) < 5:
        return low
    stem = low[:-3]  # remove "ing"
    # Doubled consonant: "planning" → "plan", "shipping" → "ship"
    if len(stem) >= 3 and stem[-1] == stem[-2] and stem[-1] not in "aeiou":
        return stem[:-1]
    # Stem ending patterns that need "e" added back
    if stem.endswith(("at", "iz", "yz", "iv", "ut", "ov", "us", "ur", "ak", "am", "os", "ag", "lin", "ot", "uc", "ul")):
        return stem + "e"
    # "identif" → "identify"
    if stem.endswith(("if", "lif", "tif")):
        return stem + "y"
    return stem


def _remove_filler(text: str) -> tuple[str, List[str]]:
    """Remove filler phrases."""
    changes: List[str] = []
    result = text

    for pattern, replacement in _FILLER_PHRASES:
        match = re.search(pattern, result, re.IGNORECASE)
        if match:
            original_phrase = match.group(0)
            result = re.sub(pattern, replacement, result, count=1, flags=re.IGNORECASE)
            if replacement:
                changes.append(f"Simplified \"{original_phrase}\" → \"{replacement}\"")
            else:
                changes.append(f"Removed filler \"{original_phrase}\"")

    # Fix "to [gerund]" → "to [infinitive]" (e.g., "to identifying" → "to identify")
    result = re.sub(r"\bto\s+(\w+ing)\b", lambda m: f"to {_gerund_to_inf(m.group(1))}", result)
    # Clean up double spaces
    result = re.sub(r"\s{2,}", " ", result).strip()
    return result, changes


def _ensure_strong_start(text: str) -> tuple[str, Optional[str]]:
    """Ensure bullet starts with a strong verb (past tense)."""
    words = text.split()
    if not words:
        return text, None

    first = words[0]
    # Check if already starts with a past-tense verb or strong verb
    if re.match(r"^[A-Z][a-z]+(?:ed|led|ilt|ade|ew|an|ot|ght|ent|ove|oke|ote|ung|old)\b", first):
        return text, None

    # Common present-tense verbs that should be past tense
    present_to_past = {
        "manage": "Managed", "lead": "Led", "build": "Built", "create": "Created",
        "develop": "Developed", "design": "Designed", "implement": "Implemented",
        "improve": "Improved", "reduce": "Reduced", "increase": "Increased",
        "analyze": "Analyzed", "collaborate": "Collaborated", "coordinate": "Coordinated",
        "deliver": "Delivered", "deploy": "Deployed", "establish": "Established",
        "facilitate": "Facilitated", "generate": "Generated", "launch": "Launched",
        "maintain": "Maintained", "negotiate": "Negotiated", "optimize": "Optimized",
        "organize": "Organized", "present": "Presented", "research": "Researched",
        "resolve": "Resolved", "support": "Supported", "train": "Trained",
        "write": "Wrote", "drive": "Drove", "run": "Ran", "make": "Made",
        "help": "Helped", "work": "Worked", "use": "Used", "get": "Secured",
    }

    first_lower = first.lower().rstrip("s")  # "manages" → "manage"
    if first_lower in present_to_past:
        past = present_to_past[first_lower]
        result = past + " " + " ".join(words[1:])
        return result, f"Changed \"{first}\" → \"{past}\" (past tense for consistency)"

    return text, None


def _rewrite_bullet_rule_based(text: str) -> BulletRewrite:
    """Apply all rule-based rewrites to a single bullet."""
    original = _strip_bullet_char(text)
    result = original
    changes: List[str] = []

    # 1. Replace weak verbs
    result, verb_change = _rewrite_weak_verb(result)
    if verb_change:
        changes.append(verb_change)

    # 2. Ensure strong start (past tense)
    if not verb_change:  # don't double-process if we already replaced a verb
        result, tense_change = _ensure_strong_start(result)
        if tense_change:
            changes.append(tense_change)

    # 3. Remove filler phrases
    result, filler_changes = _remove_filler(result)
    changes.extend(filler_changes)

    # 4. Add quantification hints
    result, quant_changes = _add_quantification_hints(result)
    changes.extend(quant_changes)

    # 5. Ensure first letter is capitalized
    if result and result[0].islower():
        result = result[0].upper() + result[1:]

    # 5b. Preserve capitalization of known proper nouns/tech terms after verb replacement
    _PROPER_CAPS = {
        "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
        "react": "React", "angular": "Angular", "vue": "Vue", "django": "Django",
        "flask": "Flask", "sql": "SQL", "mysql": "MySQL", "postgresql": "PostgreSQL",
        "mongodb": "MongoDB", "redis": "Redis", "aws": "AWS", "azure": "Azure",
        "gcp": "GCP", "docker": "Docker", "kubernetes": "Kubernetes", "git": "Git",
        "github": "GitHub", "linux": "Linux", "java": "Java", "excel": "Excel",
        "tableau": "Tableau", "figma": "Figma", "jira": "JIRA", "slack": "Slack",
    }
    for lower_term, proper in _PROPER_CAPS.items():
        result = re.sub(r"\b" + re.escape(lower_term) + r"\b", proper, result, flags=re.IGNORECASE)

    # 6. Trim trailing period if present (ATS bullets don't need periods)
    result = result.rstrip(".")

    return BulletRewrite(
        original=original,
        rewritten=result,
        changes=changes,
        source="rule",
    )


# ---------------------------------------------------------------------------
# LLM-enhanced rewrite
# ---------------------------------------------------------------------------

_REWRITE_SYSTEM = """You are an ATS resume optimization expert. Rewrite resume bullets to be ATS-optimized.

Rules:
1. Start EVERY bullet with a strong past-tense action verb (Led, Built, Designed, Increased, Reduced, etc.)
2. Include specific numbers: percentages, dollar amounts, team sizes, user counts, time saved
3. If the original has no numbers, ADD a realistic placeholder like [X%] or [#] with a note
4. Remove filler phrases (responsible for, in order to, on a daily basis, etc.)
5. Keep the core meaning intact — don't invent accomplishments
6. Each bullet should be 1 line, under 120 characters when possible
7. Use industry-standard terminology that ATS keyword matching recognizes

Output ONLY a JSON array of objects: [{"original": "...", "rewritten": "...", "changes": ["change1", "change2"]}]
No markdown, no explanation. Just the JSON array."""


def _rewrite_bullets_llm(bullets: List[str], track: Optional[str] = None) -> Optional[List[BulletRewrite]]:
    """Use LLM to rewrite bullets. Returns None if LLM unavailable."""
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if not is_llm_available():
            return None
    except ImportError:
        return None

    cleaned = [_strip_bullet_char(b) for b in bullets if _strip_bullet_char(b)]
    if not cleaned:
        return None

    user_content = f"Track: {track or 'General'}\n\nBullets to rewrite:\n"
    for i, b in enumerate(cleaned[:10], 1):
        user_content += f"{i}. {b}\n"

    import json
    raw = get_chat_completion(_REWRITE_SYSTEM, user_content, model=get_light_model(), temperature=0.3, max_tokens=2000)
    if not raw:
        return None

    try:
        # Strip markdown fences if present
        text = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            return None

        results: List[BulletRewrite] = []
        for item in parsed:
            if isinstance(item, dict) and "original" in item and "rewritten" in item:
                results.append(BulletRewrite(
                    original=item["original"],
                    rewritten=item["rewritten"],
                    changes=item.get("changes", []),
                    source="llm",
                ))
        return results if results else None
    except (json.JSONDecodeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------

def rewrite_bullets(
    bullets: List[str],
    track: Optional[str] = None,
    use_llm: bool = True,
) -> RewriteResult:
    """
    Rewrite resume bullets for ATS optimization.

    Args:
        bullets: List of bullet strings (with or without bullet characters)
        track: Career track for context (optional)
        use_llm: Whether to try LLM enhancement (falls back to rule-based)

    Returns:
        RewriteResult with all rewrites
    """
    if not bullets:
        return RewriteResult(rewrites=[], summary="No bullets to rewrite.")

    # Try LLM first for best quality
    llm_rewrites = None
    if use_llm:
        llm_rewrites = _rewrite_bullets_llm(bullets, track)

    # Build results: LLM where available, rule-based as fallback
    rewrites: List[BulletRewrite] = []
    llm_map: Dict[str, BulletRewrite] = {}
    if llm_rewrites:
        for r in llm_rewrites:
            llm_map[r.original.lower().strip()] = r

    for bullet in bullets:
        cleaned = _strip_bullet_char(bullet)
        if not cleaned or len(cleaned) < 5:
            continue

        # Check if LLM provided a rewrite for this bullet
        llm_match = llm_map.get(cleaned.lower().strip())
        if llm_match and llm_match.rewritten != llm_match.original:
            rewrites.append(llm_match)
        else:
            # Rule-based fallback
            rule_rewrite = _rewrite_bullet_rule_based(bullet)
            if rule_rewrite.changes:  # only include if something actually changed
                rewrites.append(rule_rewrite)

    total_changes = sum(len(r.changes) for r in rewrites)
    summary = f"{len(rewrites)} bullet{'s' if len(rewrites) != 1 else ''} rewritten with {total_changes} improvement{'s' if total_changes != 1 else ''}"

    return RewriteResult(rewrites=rewrites, summary=summary)


def rewrite_from_ats_issues(
    issues: List[dict],
    bullets: List[str],
    track: Optional[str] = None,
    use_llm: bool = True,
) -> RewriteResult:
    """
    Rewrite bullets that have been flagged by ATS analysis.
    Prioritizes bullets referenced in issues, then rewrites remaining bullets
    that have improvable patterns.

    Args:
        issues: List of ATSIssue dicts from ats_analysis (with "line" field)
        bullets: All bullet lines from the resume
        track: Career track for context
        use_llm: Whether to try LLM enhancement

    Returns:
        RewriteResult
    """
    # Collect bullets referenced in issues first
    issue_bullets: List[str] = []
    issue_lines = set()
    for issue in issues:
        line = issue.get("line", "")
        if line and line.strip():
            issue_bullets.append(line)
            issue_lines.add(line.strip()[:60].lower())

    # Add remaining bullets that have fixable patterns
    remaining: List[str] = []
    for b in bullets:
        cleaned = _strip_bullet_char(b)
        if cleaned[:60].lower() in issue_lines:
            continue
        # Check if this bullet has improvable patterns
        lower = cleaned.lower()
        has_weak = any(wv in lower for wv in _WEAK_VERB_MAP)
        has_vague = any(re.search(pat, cleaned, re.IGNORECASE) for pat, _ in _VAGUE_PATTERNS)
        has_filler = any(re.search(pat, cleaned, re.IGNORECASE) for pat, _ in _FILLER_PHRASES)
        has_no_number = not re.search(r"\d+", cleaned)

        if has_weak or has_vague or has_filler or (has_no_number and len(cleaned) > 30):
            remaining.append(b)

    # Combine: issue bullets first, then other improvable bullets
    all_bullets = issue_bullets + remaining[:7]  # cap to avoid huge LLM calls

    return rewrite_bullets(all_bullets, track=track, use_llm=use_llm)
