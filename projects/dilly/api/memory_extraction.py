"""LLM extraction + narrative generation for Dilly memory surface."""

from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from dilly_core.llm_client import get_chat_completion
from projects.dilly.api.audit_history import get_audits
from projects.dilly.api.memory_surface_store import (
    _MEMORY_CATEGORIES,
    _SENTINEL,
    _canonical_memory_category,
    get_memory_surface,
    save_memory_surface,
    should_regenerate_narrative,
    upsert_session_capture,
)
from projects.dilly.api.profile_store import get_profile


def _strip_fences(text: str) -> str:
    return re.sub(r"```(?:json)?|```", "", text or "", flags=re.IGNORECASE).strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def estimate_score_impact(items: list[dict[str, Any]], latest_audit: dict | None) -> dict[str, Any] | None:
    _ = latest_audit
    total_pts = 0
    primary_dimension = ""
    for item in items:
        action = str(item.get("action_type") or "").strip()
        if action == "open_bullet_practice":
            total_pts += 6
            primary_dimension = "Grit"
        elif action == "open_certifications":
            total_pts += 7
            primary_dimension = "Build"
    if total_pts <= 0:
        return None
    return {"pts": total_pts, "dimension": primary_dimension or "Grit"}


def _existing_memory_for_prompt(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    # Cost knob: dedup-set sent to the LLM was unbounded — for a power
    # user with 100+ facts, that's an extra ~600 tokens of input per
    # extraction call (every chat turn). Cap at the most-recent 25
    # items, which is enough to dedup the typical "in-this-conversation"
    # repetitions without paying for the full history. Items further
    # back in time get caught by the post-LLM (category,label) dedup
    # against ALL existing items in extract_memory_items.
    capped = items[-25:] if len(items) > 25 else items
    return [{"category": str(i.get("category") or ""), "label": str(i.get("label") or "")} for i in capped]


def _messages_worth_extracting(messages: list[dict[str, Any]]) -> bool:
    """Gate: skip LLM extraction when the user turns in the batch don't
    plausibly contain any new facts. Trivial-only exchanges (greetings,
    thanks, acks, one-word replies) produce zero facts but were costing
    a Haiku call per chat every 3 turns. Skipping those saves ~30-40%
    of extraction calls.

    A batch is "worth extracting" if at least one user message is
    longer than 20 characters and contains a word that isn't in the
    trivial-words set.
    """
    trivial = {
        "hi", "hey", "hello", "thanks", "thank", "ty", "ok", "okay",
        "cool", "nice", "great", "lol", "haha", "yes", "yeah", "yep",
        "no", "nope", "sure", "got", "gotcha", "k", "kk", "bye",
    }
    for m in messages:
        if m.get("role") != "user":
            continue
        text = (m.get("content") or "")
        if not isinstance(text, str):
            continue
        stripped = text.strip()
        # Short replies can still carry one concrete fact ("Interned at
        # Goldman", "I know Rust"). Previous bar (20 chars + 3 words)
        # skipped too many real turns → profile stayed empty while chat
        # context still looked "smart" from raw history.
        if len(stripped) < 12:
            continue
        words = re.findall(r"[a-zA-Z']+", stripped.lower())
        non_trivial = [w for w in words if w not in trivial and len(w) > 2]
        if len(non_trivial) >= 2:
            return True
    return False


# ── Regex-first memory extraction ──────────────────────────────────────
# Replaces the per-5-turn Haiku call with deterministic pattern matching
# that catches the most common fact shapes users drop in chat:
#   "I work at X" / "I'm at X"            -> experience fact
#   "I'm studying X" / "I'm majoring in X" -> education fact
#   "my major is X"                        -> education fact
#   "I know X, Y, Z" / "I use X"           -> skill facts
#   "I built X" / "I shipped X"            -> project facts
#   "I want to work at X"                  -> target_company fact
#   "I'm interested in X"                  -> interest fact
#
# Catches ~60-70% of the same facts the LLM was catching on chat with
# zero marginal cost. The remaining ~30% (subtle / inferential facts)
# are left to the profile onboarding flow + the user-editable My Dilly
# panel, both of which are explicit user input.
#
# Economics: Haiku extraction was ~$0.0015/call × millions of calls.
# Regex pass is 0. Caller chain preserved so the surface-store update,
# dedup, and narrative regen still fire — only the LLM call itself is
# removed.

_FACT_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    # (category, pattern, label_template)
    # Pattern groups: (1) is the captured value. Case-insensitive.
    #
    # DESIGN NOTE: These patterns are deliberately wide. Previous versions
    # were so strict that "I'm trying to break into quant" or "working at a
    # startup" matched nothing, and 95% of real user turns extracted zero
    # facts unless the chat hit the 5-message LLM threshold. Testers
    # reported "talking to Dilly doesn't add stuff to my profile" — that
    # was the cause. False positives from a wide regex are fine because
    # the downstream LLM-sweep on chat close re-evaluates and the profile
    # editor lets users delete anything wrong.
    (
        "experience",
        re.compile(
            r"\b(?:i (?:work|worked|am working|just started|am|used to work|interned|did an internship) (?:at|for|with)|"
            r"i'?m (?:at|with|on a team at|a [a-z ]{3,40}? at)|"
            r"working (?:at|for)|"
            r"my (?:internship|job|role|internships|role|work) (?:at|with)|"
            r"(?:internship|internships) at) "
            r"([A-Za-z][A-Za-z0-9&'.,\- ]{1,50}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:as|in|on|doing|where|right now|currently|last|this|$))",
            re.IGNORECASE,
        ),
        "Works at {v}",
    ),
    (
        "education",
        re.compile(
            r"\b(?:i'?m (?:studying|majoring in|minoring in|doing a degree in|getting a degree in)|"
            r"i study|studying) "
            r"([A-Za-z &/\-]{3,60}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:at|in|right now|currently|and|$))",
            re.IGNORECASE,
        ),
        "Studies {v}",
    ),
    (
        "education",
        re.compile(
            r"\bmy (?:major|minor|concentration) (?:is|was) "
            r"([A-Za-z &/\-]{3,60}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:and|$))",
            re.IGNORECASE,
        ),
        "Major: {v}",
    ),
    (
        "education",
        re.compile(
            # Allow 2-char short names ("UT", "BU"), plus a lookahead that
            # accepts "," / ";" with no preceding whitespace ("UT, studying").
            r"\b(?:i go to|i attend|i'?m at|i study at|student at) "
            r"([A-Z][A-Za-z.'\- ]{1,60}?)"
            r"(?=\s*(?:,|;)|\s+(?:studying|majoring|as|where|right now|currently|\.|$))",
            re.IGNORECASE,
        ),
        "Attends {v}",
    ),
    (
        "project",
        # Allow an optional adverb ("also", "just", "recently", "once")
        # between the subject and the verb — real conversational phrasing
        # routinely includes these ("I also built ...", "I just shipped...").
        re.compile(
            r"\bi (?:also |just |recently |once |already )?"
            r"(?:built|shipped|made|created|launched|started|founded|am building|worked on|wrote) "
            r"([A-Za-z0-9 '\-]{3,80}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:that|which|with|for|using|$))",
            re.IGNORECASE,
        ),
        "Built {v}",
    ),
    (
        "project",
        # "(I'm | been) working on a project <building | about | that ...>"
        # catches casual in-progress project mentions that aren't caught
        # by the built/shipped verbs above.
        re.compile(
            r"\b(?:i'?m|been|i'?ve been|currently)\s+working on (?:a |my |an )?"
            r"(?:project |side project |app |thing |tool )?"
            r"(?:building |creating |making |called )?"
            r"([A-Za-z0-9 '\-]{3,80}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:that|which|with|for|using|in|as|$))",
            re.IGNORECASE,
        ),
        "Working on {v}",
    ),
    (
        "skill",
        # Lookahead now accepts "," / ";" with no preceding whitespace so
        # lists like "I know Python, SQL, and React" capture the first item.
        # Note: we only capture ONE skill per pattern match; the outer
        # finditer loop re-runs for additional phrasings, but list commas
        # are not split inside a single capture. Planned follow-up: post-
        # process captured values to split on comma if the value contains
        # one, then emit one fact per token.
        re.compile(
            r"\bi (?:know|use|work with|am good at|have experience with|"
            r"am proficient in|taught myself|self.taught in|am learning|picked up) "
            r"([A-Za-z0-9 +#./\-]{2,40}?)"
            r"(?=\s*(?:,|;)|\s+(?:and|for|because|at|to|\.|$))",
            re.IGNORECASE,
        ),
        "Skill: {v}",
    ),
    (
        "target_company",
        # Lookahead accepts "," / ";" / "." with or without preceding
        # whitespace — "Jane Street." captures as "Jane Street".
        re.compile(
            r"\b(?:i (?:want to work (?:at|for)|applied to|am applying to|"
            r"'?m targeting|'?m gunning for|'?d love to work at|dream job (?:is )?at)|"
            r"my (?:target|dream) (?:company )?is|targeting|aiming for) "
            r"([A-Z][A-Za-z0-9&'.,\- ]{1,50}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:as|in|on|where|right now|currently|$))",
            re.IGNORECASE,
        ),
        "Target: {v}",
    ),
    (
        "career_interest",
        re.compile(
            r"\b(?:i'?m (?:interested in|curious about|thinking about|drawn to|"
            r"leaning toward|trying to break into|trying to get into|passionate about|"
            r"fascinated by)|i (?:like|love) the idea of|want to (?:get|break) into) "
            r"([A-Za-z ,&/\-]{3,60}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:because|for|and|at|right now|currently|$))",
            re.IGNORECASE,
        ),
        "Interested in {v}",
    ),
    (
        "goal",
        re.compile(
            r"\b(?:my goal|i want|i'?d like|my plan|i'?m trying|i hope|i'?m hoping) "
            r"(?:is to|to) ([A-Za-z0-9 ,&'.\-]{5,80}?)"
            r"(?=\s*(?:[.,;])|\s+(?:before|by|so|because|and|$))",
            re.IGNORECASE,
        ),
        "Goal: {v}",
    ),
    (
        "goal",
        re.compile(
            r"\bi'?m (?:trying to|thinking about|planning to) "
            r"(?:land|get|find|break into|transition to|pivot to|go into|move into|switch to) "
            r"([A-Za-z0-9 ,&'.\-]{3,70}?)"
            r"(?=\s*(?:,|;)|\s+(?:before|by|so|because|and|at|right now|currently|\.|$))",
            re.IGNORECASE,
        ),
        "Trying to {v}",
    ),
    (
        "goal",
        re.compile(
            r"\bi (?:want to|would like to|hope to|plan to) "
            r"(?:go into|move into|get into|transition to|pivot to|switch to|work in|break into) "
            r"([A-Za-z0-9 ,&'.\-]{3,70}?)"
            r"(?=\s*(?:,|;)|\s+(?:before|by|so|because|and|at|eventually|one day|$|\.))",
            re.IGNORECASE,
        ),
        "Wants to enter {v}",
    ),
    (
        "rejection",
        re.compile(
            r"\b(?:i (?:got|was) (?:rejected|denied|turned down) (?:from|by)|"
            r"rejected (?:from|by)|didn'?t get (?:the|an) offer from) "
            r"([A-Z][A-Za-z0-9&'.,\- ]{1,40}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:last|this|yesterday|for|after|$))",
            re.IGNORECASE,
        ),
        "Rejected from {v}",
    ),
    (
        "skill",
        # Captures "used X", "I used X and Y", "used kafka and scala"
        # when described inside a project/experience narrative.
        # Bare "with" was here previously and matched "research with
        # prof chen" / "talking with my mentor" → false-positive skill
        # captures of people's names. Removed; "built with" is the
        # explicit kept form for stack-mention phrasing.
        re.compile(
            r"\b(?:used|we used|team used|stack was|built with|using) "
            r"([A-Za-z0-9 +#./\-]{2,40}?)"
            r"(?=\s*(?:,|;)|\s+\b(?:and|plus|for|to|in|on)\b|\s*\.|$)",
            re.IGNORECASE,
        ),
        "Worked with {v}",
    ),
    (
        "skill",
        # "my experience with X and Y" / "experience in X"
        re.compile(
            r"\bmy experience (?:with|in|using) "
            r"([A-Za-z0-9 +#./\-]{2,50}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:and|plus|is|has|because|for|$))",
            re.IGNORECASE,
        ),
        "Skill: {v}",
    ),
    (
        "achievement",
        re.compile(
            r"\bi (?:shipped|delivered|launched|grew|increased|reduced|cut|raised) "
            r"([A-Za-z0-9 ,&'.\-%]{3,80}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:in|by|from|to|for|$))",
            re.IGNORECASE,
        ),
        "{v}",
    ),
    (
        "location_pref",
        # Covers: "I want to move to X", "I'm moving to X", "I'd have to /
        # love to / need to move to X", "I'll move to X". The period
        # lookahead now sits in the comma/semi group with \. so
        # "to New York." captures "New York".
        re.compile(
            r"\b(?:i want to (?:live|move|be) (?:in|to)|"
            r"i'?d (?:love to|have to|need to|)\s*move to|"
            r"i'?ll move to|"
            r"i'?m (?:moving|relocating) (?:in|to)) "
            r"([A-Z][A-Za-z.,'\- ]{2,40}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:because|for|and|after|$))",
            re.IGNORECASE,
        ),
        "Wants to live in {v}",
    ),
    (
        "challenge",
        # Capture class excludes `.` so a mid-sentence period cleanly
        # terminates the challenge phrase. Previously "stuck with X. I
        # know Python" would eat across the period.
        re.compile(
            r"\b(?:i'?m (?:stuck|struggling|nervous|anxious|worried) (?:with|about|on)|"
            r"i can'?t figure out|i don'?t know how to|i'?m not sure (?:how|what) to) "
            r"([A-Za-z0-9 ,&'\-]{5,80}?)"
            r"(?=\s*(?:\.|,|;)|\s+(?:because|for|and|$))",
            re.IGNORECASE,
        ),
        "Working on: {v}",
    ),
    # ── Class year / school standing — extremely common in college chat ──
    (
        "education",
        re.compile(
            r"\bi'?m (?:a |an )?(freshman|sophomore|junior|senior|first[- ]year|second[- ]year|third[- ]year|fourth[- ]year|grad student|graduate student|phd student|masters student|undergrad|undergraduate)\b",
            re.IGNORECASE,
        ),
        "{v}",
    ),
    (
        "education",
        # "I'm a CS major" / "I'm an econ major"
        re.compile(
            r"\bi'?m (?:a |an )"
            r"([A-Za-z][A-Za-z &/\-]{1,40}?) "
            r"(?:major|minor)\b",
            re.IGNORECASE,
        ),
        "Major: {v}",
    ),
    (
        "education",
        # "I'm taking [class]" / "I take [class]" — class mentions
        re.compile(
            r"\bi'?m (?:currently )?taking "
            r"([A-Za-z][A-Za-z0-9 :&/\-]{2,60}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:and|right now|currently|this|next|$))",
            re.IGNORECASE,
        ),
        "Taking: {v}",
    ),
    (
        "education",
        # "I'm in [class] this semester"
        re.compile(
            r"\bi'?m in "
            r"([A-Za-z][A-Za-z0-9 :&/\-]{3,60}?) "
            r"this (?:semester|quarter|term)\b",
            re.IGNORECASE,
        ),
        "Class: {v}",
    ),
    (
        "education",
        # "I went to X" / "I graduated from X"
        re.compile(
            r"\b(?:i went to|i graduated from|i'?ve graduated from|graduated from) "
            r"([A-Z][A-Za-z.'\- ]{1,60}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:in|with|where|last|this|right|currently|and|$))",
            re.IGNORECASE,
        ),
        "Attended {v}",
    ),
    # ── Interview / application events — was missing entirely ──
    (
        "interview",
        re.compile(
            r"\b(?:i have an interview|i have a (?:final|phone|technical|onsite|on-site|behavioral|coding) interview|"
            r"i'?m interviewing) (?:at|with|for) "
            r"([A-Z][A-Za-z0-9&'.,\- ]{1,50}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:next|this|on|tomorrow|in|for|$))",
            re.IGNORECASE,
        ),
        "Interview at {v}",
    ),
    (
        "interview",
        re.compile(
            r"\bi (?:got|just got|received|landed) (?:an |a )?(?:interview|onsite|on[- ]site|callback) (?:at|with|for) "
            r"([A-Z][A-Za-z0-9&'.,\- ]{1,50}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:next|this|on|for|tomorrow|in|$))",
            re.IGNORECASE,
        ),
        "Interview at {v}",
    ),
    (
        "interview",
        # "I applied to X" — record as application/interview event
        re.compile(
            r"\bi (?:just )?applied (?:to|for a job at|for a role at) "
            r"([A-Z][A-Za-z0-9&'.,\- ]{1,50}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:for|as|in|on|last|this|yesterday|today|$))",
            re.IGNORECASE,
        ),
        "Applied to {v}",
    ),
    # ── Extracurriculars / clubs / leadership / research ──
    (
        "experience",
        re.compile(
            r"\bi'?m (?:in|on|part of|a member of|the (?:president|treasurer|chair|lead|captain|co[- ]?president|vp|vice president) of) "
            r"(?:the )?"
            r"([A-Za-z][A-Za-z0-9&'.,\- ]{2,60}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:club|team|board|society|organization|group|chapter|frat|fraternity|sorority|right now|currently|and|$))",
            re.IGNORECASE,
        ),
        "Member of {v}",
    ),
    (
        "experience",
        # "I lead X" / "I run X" / "I started X club"
        re.compile(
            r"\bi (?:lead|run|head up|started|founded|co[- ]?founded) "
            r"(?:the |a |an |our )?"
            r"([A-Za-z][A-Za-z0-9&'.,\- ]{2,60}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:club|team|board|society|organization|group|chapter|right now|currently|and|where|that|which|$))",
            re.IGNORECASE,
        ),
        "Leads {v}",
    ),
    (
        "experience",
        # Research-specific: "I'm doing research with Prof X" / "I work in
        # the X lab" / "doing research with prof chen". Standalone
        # "doing research" form catches phrasings where it isn't directly
        # preceded by "I'm" (e.g. "I'm a senior, doing research with X").
        re.compile(
            r"\b(?:i (?:do|did) research|i'?m doing research|doing research|my research|i work in the) (?:with|under|in|on|at) "
            r"([A-Za-z][A-Za-z0-9 &'.\-]{2,80}?)"
            r"(?=\s*(?:,|;|\.)|\s+\b(?:on|in|about|where|right now|currently|and)\b|$)",
            re.IGNORECASE,
        ),
        "Research: {v}",
    ),
    # ── Hobby / sport / creative pursuit ──
    (
        "hobby",
        re.compile(
            r"\bi (?:play|do|practice|love playing|enjoy|like to play) "
            r"([A-Za-z][A-Za-z &'.\-]{2,40}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:on|in|at|with|for|every|right now|currently|and|$))",
            re.IGNORECASE,
        ),
        "Hobby: {v}",
    ),
    # ── Personality / fun-fact / quirk ──
    (
        "personality",
        # Word-boundaries on the connector alternation — without `\b`,
        # "so" matched inside "soccer" and the capture stopped early
        # ("Fun fact: i play club" instead of "i play club soccer too").
        # The `$` branch lets the capture run to end-of-string when no
        # terminator word is present.
        re.compile(
            r"\bfun fact[:,]?\s+"
            r"([A-Za-z0-9 ,&'.\-]{5,120}?)"
            r"(?=\s*(?:\.|;)|\s+\b(?:and|so|because|but)\b|$)",
            re.IGNORECASE,
        ),
        "Fun fact: {v}",
    ),
    # ── Location / where I live ──
    (
        "location_pref",
        re.compile(
            r"\bi (?:live|am based|am living|currently live) (?:in|near|around|outside) "
            r"([A-Z][A-Za-z.,'\- ]{2,40}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:right now|currently|and|but|$))",
            re.IGNORECASE,
        ),
        "Lives in {v}",
    ),
    # ── Achievements / awards / wins (broader than the existing "shipped" pattern) ──
    (
        "achievement",
        re.compile(
            r"\bi (?:won|earned|got|received|was awarded|placed) "
            r"(?:the |a |an |first |second |third |1st |2nd |3rd )?"
            r"([A-Za-z0-9 ,&'.\-]{3,80}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:at|in|from|for|because|when|after|last|this|$))",
            re.IGNORECASE,
        ),
        "{v}",
    ),
    # ── Certifications / credentials ──
    (
        "achievement",
        re.compile(
            r"\bi (?:have|got|earned|just got|completed|finished) (?:my |a |an |the )?"
            r"([A-Za-z0-9 ,&'.\-]{2,60}?) "
            r"(?:certification|certificate|cert|credential|license)\b",
            re.IGNORECASE,
        ),
        "{v} cert",
    ),
]


# Pronoun blocklist — only used when the WHOLE capture is one of these
# (e.g. "Target: them") or when the FIRST TOKEN is a pronoun making the
# capture clearly a back-reference ("Target: them or Citadel").
# Articles like "a" / "the" are NOT in this list — "a startup",
# "a React Native app" are legitimate captures.
_PRONOUNS = frozenset([
    "me", "you", "it", "them", "us", "this", "that",
    "he", "she", "we", "they", "my", "your", "his", "her", "their",
    "our",
])


def _regex_extract_from_user_turns(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pull facts from user turns using the _FACT_PATTERNS table. Zero-cost.

    Post-pass: sentences like "I know Python, SQL, and React" only capture
    the first item ("Python") because the comma-lookahead terminates the
    skill group. We expand list captures by finding the original phrase
    in the source text and splitting on comma/`and` so each item lands as
    its own skill fact. Limited to the 'skill' category because list-
    shaped input is almost exclusive to skills.
    """
    now = _now_iso()
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    def _emit(category: str, label: str, val: str) -> bool:
        key = (category, label.lower())
        if key in seen:
            return False
        seen.add(key)
        out.append({
            "id":         str(uuid.uuid4()),
            "category":   category,
            "label":      label,
            "value":      val[:120],
            "confidence": "medium",
            "source":     "regex",
            "created_at": now,
            "shown_to_user": True,
        })
        return True

    # Pattern used by the skill post-pass to locate the full list after
    # the skill verb (know / use / work with / ...). Captures the span
    # from the verb until the first period or end-of-string.
    skill_list_rx = re.compile(
        r"\b(?:i (?:know|use|work with|am good at|have experience with|"
        r"am proficient in|taught myself|self.taught in|am learning|picked up)|"
        r"used|we used|team used|built with|my experience (?:with|in|using)) "
        # Tight terminator list: end on punctuation, or on connector
        # words that clearly signal the end of the skill list (is, was,
        # for, because, etc.). Prevents capturing "distributed systems
        # and pytorch is what I want to highlight" as the whole list.
        r"([A-Za-z0-9 +#./\-,]{2,120}?)"
        r"(?:\.|,\s+(?:but|so|which|and then)|\s+(?:is|was|because|for|to help|in order|since|$)|$)",
        re.IGNORECASE,
    )

    for m in messages:
        if m.get("role") != "user":
            continue
        text = str(m.get("content") or "")
        if len(text) < 15:
            continue
        for category, pattern, label_tmpl in _FACT_PATTERNS:
            for match in pattern.finditer(text):
                val = (match.group(1) or "").strip().strip(",.").strip()
                # Filter out pronouns and too-short captures. Checks
                # both the whole capture AND the first token so phrases
                # like "them or Citadel" (pronoun head) get rejected.
                low = val.lower()
                first_tok = low.split()[0] if low else ""
                if len(val) < 2 or low in _PRONOUNS or first_tok in _PRONOUNS:
                    continue
                label = label_tmpl.format(v=val[:60])
                # Cap lifted from 8 → 15 → 25. We added ~12 new patterns
                # for student-specific phrasings (year, club, interview,
                # research, hobby, location, certs) so a long substantive
                # chat can legitimately produce 18+ facts. 25 still bounds
                # the worst case where a single fluent paragraph somehow
                # pattern-matches every regex.
                if _emit(category, label, val) and len(out) >= 25:
                    return out

        # Skill list post-pass: pull the whole list chunk and split on
        # comma / "and" so "Python, SQL, and React" lands as three
        # separate facts.
        for slm in skill_list_rx.finditer(text):
            chunk = slm.group(1)
            if "," not in chunk and " and " not in chunk.lower():
                continue
            tokens = [
                t.strip().strip(",.").strip()
                for t in re.split(r",| and ", chunk, flags=re.IGNORECASE)
            ]
            for t in tokens:
                # Drop filler tokens that slipped in ("the side", etc.).
                if len(t) < 2 or len(t.split()) > 4:
                    continue
                if t.lower() in _PRONOUNS:
                    continue
                label = "Skill: {v}".format(v=t[:60])
                if _emit("skill", label, t) and len(out) >= 25:
                    return out

    return out


# Minimum USER messages a conversation must have before we pay Haiku to
# extract facts from it. Mirrored in the mobile UI as a progress hint
# ("Dilly is listening… 2 of 5") so the user sees the bar and feels
# the gate as a feature, not a surprise.
# Product call: LLM extraction runs after 5 user messages in a
# conversation. Shorter chats still run regex-only extraction so
# obvious facts ("I work at X") get captured, but the richer
# inferential extraction (emotional context, implied goals,
# personality tells) gates on substantive chat length.
# The mobile UI shows a progress pill ("Dilly needs X more messages
# to save what she's learning") so users know the bar exists.
# Lowered from 5 → 2. The per-turn extraction in /ai/chat is now
# throttled (every 5th user msg), so /ai/chat/flush is the primary
# extraction path. A 6-msg conversation (3 user msgs) was getting
# zero LLM extraction because both gates were too high — user saw
# nothing land in My Dilly. At 2, any conversation with 2+ real
# user turns earns one Haiku extraction call (~0.4¢) at session
# close. That's the right tradeoff: extraction is the feature
# users said "works so well, don't touch it."
LLM_EXTRACTION_MIN_USER_MSGS = 2

# Map Voice/beyond-resume extractor types → profile_facts categories (whitelist).
_COACH_TYPE_TO_MEMORY: dict[str, str] = {
    "skill": "skill_unlisted",
    "experience": "experience",
    "project": "project_detail",
    "person": "person_to_follow_up",
    "company": "target_company",
    "event": "interview",
    "emotion": "concern",
    "other": "motivation",
}


def _coach_beyond_resume_memory_items(
    uid: str,
    conv_id: str,
    messages: list[dict[str, Any]],
    existing_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """When the profile-style memory LLM returns nothing, run the same
    beyond-resume extractor Voice uses and map chips into profile_facts.

    This closes the gap where chat felt smart (history in-request) but
    My Dilly stayed empty because the two extractors disagreed or the
    model emitted categories that failed normalization before we fixed
    canonicalization."""
    last_user = ""
    hist: list[dict[str, str]] = []
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "").strip().lower()
        content = str(m.get("content") or "").strip()
        if not content:
            continue
        hist.append({"role": role, "content": content})
        if role == "user":
            last_user = content
    if len(last_user.strip()) < 8:
        return []
    already_captured: list[dict[str, str]] = []
    for i in (existing_items or [])[-40:]:
        if not isinstance(i, dict):
            continue
        v = (str(i.get("value") or "").strip() or str(i.get("label") or "").strip())[:80]
        if len(v) >= 4:
            already_captured.append({"text": v})
    try:
        from projects.dilly.api.voice_helpers import extract_beyond_resume_with_llm

        extracted = extract_beyond_resume_with_llm(
            last_user,
            history=hist[:-1][-8:] if len(hist) > 1 else None,
            already_captured=already_captured or None,
        )
    except Exception:
        return []
    if not extracted:
        return []
    now = _now_iso()
    out: list[dict[str, Any]] = []
    for item in extracted[:12]:
        if not isinstance(item, dict):
            continue
        t = str(item.get("type") or "other").strip().lower()
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        cat = _COACH_TYPE_TO_MEMORY.get(t, "motivation")
        short = text if len(text) <= 48 else (text[:45] + "…")
        label = f"{t}: {short}"[:80]
        out.append(
            {
                "id": str(uuid.uuid4()),
                "uid": uid,
                "category": cat,
                "label": label,
                "value": text[:500],
                "source": "voice",
                "created_at": now,
                "updated_at": now,
                "action_type": None,
                "action_payload": None,
                "confidence": "medium",
                "shown_to_user": False,
                "conv_id": conv_id,
            }
        )
    return out


def extract_memory_items(
    uid: str,
    conv_id: str,
    messages: list[dict[str, Any]],
    existing_items: list[dict[str, Any]],
    use_llm: bool = False,
    skip_gate: bool = False,
) -> list[dict[str, Any]]:
    """skip_gate: when True with use_llm, always attempt the Haiku extract call
    (still returns [] if the model finds nothing). Used for /ai/chat per turn
    so short factual replies are not skipped twice."""
    # Regex extraction runs unconditionally — zero LLM cost, no reason
    # to gate it. The word-count gate below applies ONLY to the LLM
    # path where each call costs money.
    #
    # Previous code applied the gate before both paths, which meant a
    # user saying "I know Python" (13 chars — fails length check) got
    # zero extraction even though the regex pattern would have caught it
    # for free. This was the cause of "talked to Dilly but my profile
    # didn't update" — short literal fact statements were silently dropped
    # before the regex even ran.
    #
    # Pulse callers pass skip_gate=True so the gate never fires for them
    # regardless of message length.
    regex_items = _regex_extract_from_user_turns(messages)

    # Two extraction paths:
    #   use_llm=False — regex only (zero LLM cost).
    #   use_llm=True — regex ∪ LLM. /ai/chat runs this every turn (sync);
    #     flush runs it on close with a 5-user-message gate on the LLM leg.
    #     skip_gate=True on /ai/chat forces a Haiku attempt even when the
    #     last user line is short (still may return []).
    #
    # Flush is not the only use_llm=True caller — see routers/ai.py.
    # On the flush path (use_llm=True), ALWAYS run regex as a safety
    # net in addition to the LLM. Previously we ran only one or the
    # other — which meant if Haiku rate-limited, errored, or returned
    # an empty list, a user who hit the 5-msg bar would lose every
    # durable fact from the session. The regex pass is zero cost so
    # there is no reason to skip it. We dedupe union of both lists by
    # (category, label) below. This is what makes "messages 0..5 all
    # get added once the user hits the 5-message mark" actually hold
    # in the presence of transient LLM failures.
    llm_items: list[dict[str, Any]] = []
    if use_llm:
        # Cost gate: skip the LLM call when the conversation is trivial
        # (greetings, acks, one-word replies). Regex already ran above
        # so literal facts are still captured. Only inferential/LLM facts
        # are skipped on trivial conversations, which is correct.
        if skip_gate or _messages_worth_extracting(messages):
            try:
                llm_items = _extract_memory_items_llm(
                    uid, conv_id, messages, existing_items, skip_trivial_gate=skip_gate
                )
            except Exception as _e:
                import sys as _sys
                _sys.stderr.write(f"[extract_memory_items] llm error: {_e}\n")
                llm_items = []
        # Union: dedupe by (category, label) so we do not double-count.
        seen_keys: set[tuple[str, str]] = set()
        new_items: list[dict[str, Any]] = []
        for it in [*llm_items, *regex_items]:
            k = (
                str(it.get("category") or "").lower(),
                str(it.get("label") or "").strip().lower(),
            )
            if k[0] and k[1] and k not in seen_keys:
                seen_keys.add(k)
                new_items.append(it)
    else:
        new_items = list(regex_items)

    # Killed the "second-chance" fallback LLM call. It fired when the
    # primary extractor returned [] hoping a different prompt would
    # find something — but if the primary extractor (which is broad
    # and tuned for this exact job) found nothing, the bridge call
    # almost never found anything either. Cost was ~0.3c per chat
    # turn for ~no payoff. The regex pass above still runs so literal
    # facts ("I know Python") still get caught for free.

    # Dedup against existing memory (same category+label).
    existing_keys = {
        (str(i.get("category") or "").lower(), str(i.get("label") or "").strip().lower())
        for i in existing_items
    }
    pre_dedup_count = len(new_items)
    new_items = [
        it for it in new_items
        if (str(it.get("category") or "").lower(), str(it.get("label") or "").strip().lower()) not in existing_keys
    ]
    # Diagnostic: how the funnel actually performed for this batch.
    # Helps diagnose "Dilly's not learning" — is regex empty? Is LLM
    # returning []? Is dedup eating everything? Each step logged.
    try:
        import sys as _sys
        _sys.stderr.write(
            f"[extract_memory_items] uid={uid[:6]}*** "
            f"regex={len(regex_items)} llm={len(llm_items)} "
            f"pre_dedup={pre_dedup_count} after_existing_dedup={len(new_items)} "
            f"existing={len(existing_items)} use_llm={use_llm} skip_gate={skip_gate}\n"
        )
    except Exception:
        pass
    return new_items


# Kept for ad-hoc internal use (e.g. /internal/memory/run-extraction
# endpoint with an admin token). Not called from chat anymore.
def _extract_memory_items_llm(
    uid: str,
    conv_id: str,
    messages: list[dict[str, Any]],
    existing_items: list[dict[str, Any]],
    *,
    skip_trivial_gate: bool = False,
) -> list[dict[str, Any]]:
    if not skip_trivial_gate and not _messages_worth_extracting(messages):
        return []

    system = """You are building a Dilly Profile by extracting everything you can learn about a student from their conversation with Dilly, their AI career coach.

Dilly Profiles capture EVERYTHING about a user — not just career facts, but who they are as a person. The goal is to know the user beyond their resume: what they couldn't fit on one page, what drives them, what they're like to work with, and what a recruiter or advisor would want to know.

EAGERNESS RULE: Err strongly on the side of EXTRACTING. If a user mentions a class, a tool, a company, a person's name, a feeling, an opinion, a goal, a project, a hobby, an interview, a deadline, a worry, a hope — capture it. Even if it sounds small, it could be the detail that makes Dilly remember them. The downstream system handles deduping and pruning. The cost of a missed fact (Dilly looks dumb, profile stays empty) is much worse than the cost of an over-eager extraction (one extra row that gets cleaned up later). When in doubt, INCLUDE.

Extract ANY new information the student reveals. Be thorough — if they mention something, capture it. Categories:

CAREER (original):
- target_company: companies they want to work at
- concern: worries or anxieties about career/job search
- mentioned_but_not_done: things they said they'd do but haven't
- person_to_follow_up: people they should contact
- deadline: dates, due dates, application deadlines
- achievement: accomplishments, wins, things they're proud of
- preference: career preferences (remote vs office, salary, role type)
- goal: career goals, short or long term
- rejection: companies/roles that rejected them
- interview: upcoming or past interviews
- strength: things they're good at
- weakness: areas they need to improve

PERSONAL (expanded — know them beyond the resume):
- hobby: interests, sports, creative pursuits, activities outside career
- personality: how they communicate, think, handle stress, work style
- soft_skill: teamwork ability, leadership style, empathy, adaptability
- life_context: family situation, financial constraints, where they live/want to live, background story
- motivation: why they chose their field, what excites them, what drives them
- challenge: obstacles, struggles, things blocking their progress
- project_detail: specifics about projects not on their resume (tech stack, impact, what they learned)
- skill_unlisted: skills they mention in conversation that aren't on their resume
- company_culture_pref: startup vs corporate, team size, values, work environment preferences
- availability: when they can start work, internship timing, schedule constraints

Return a JSON array of objects with:
- category: one of the categories above
- label: short display label, max 50 chars
- value: full context with specifics, max 200 chars
- confidence: high | medium | low
- action_type: open_am_i_ready | open_bullet_practice | open_interview_prep | open_templates | open_calendar | open_career_hub | open_voice | open_certifications | open_ats | null
- action_payload: object or null

Action mapping (set action_type only when relevant):
- target_company -> open_am_i_ready with { company: "<name>" }
- concern about interviews -> open_interview_prep
- mentioned_but_not_done for bullets -> open_bullet_practice
- mentioned_but_not_done for certs -> open_certifications
- person_to_follow_up -> open_templates with { person: "<name>", company: "<company>" }
- deadline -> open_calendar with { label: "<name>", date: "<date if present>" }
- weakness -> open_voice with { prompt: "Let's work on <weakness>" }
- For personal categories (hobby, personality, etc.), action_type is usually null.

Be specific. "Likes sports" is bad. "Plays club soccer at UTampa, midfielder, practices 3x/week" is good.
If nothing new was revealed, return [].
Return JSON array only."""
    convo = []
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "").upper()
        content = str(m.get("content") or "").strip()
        if role and content:
            convo.append(f"{role}: {content}")
    user_prompt = f"""Existing memory items (do not duplicate):
{json.dumps(_existing_memory_for_prompt(existing_items), ensure_ascii=True)}

Conversation to analyze:
{chr(10).join(convo)}

Extract new memory items now. Return JSON array only."""
    # Haiku 4.5 handles structured JSON extraction at full quality and ~1/3 the cost
    # of Sonnet. This runs after every chat message — the single biggest line item.
    raw = get_chat_completion(
        system,
        user_prompt,
        model="claude-haiku-4-5-20251001",
        # max_tokens was 1200 — but real extraction output is JSON of
        # 1–5 facts averaging ~50 tokens each. 400 caps the worst case
        # without truncating real responses. Direct cost cut: ~3x on
        # output billing for this call (Haiku output is $4/M).
        max_tokens=400,
        temperature=0.2,
        log_email=uid,
        log_feature="extraction",
        log_session_id=conv_id or None,
        log_metadata={"conv_id": conv_id[:16] if conv_id else None,
                      "n_messages": len(messages)},
    )
    if not raw:
        return []
    try:
        parsed = json.loads(_strip_fences(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    now = _now_iso()
    out: list[dict[str, Any]] = []
    seen = {(str(i.get("category") or "").lower(), str(i.get("label") or "").strip().lower()) for i in existing_items}
    for row in parsed:
        if not isinstance(row, dict):
            continue
        category = _canonical_memory_category(str(row.get("category") or ""))
        label = str(row.get("label") or "").strip()[:50]
        value = str(row.get("value") or "").strip()[:200]
        # Was strict-filtering against _MEMORY_CATEGORIES whitelist
        # which silently dropped any LLM-emitted category not in the
        # set. The downstream _normalize_memory_item is the canonical
        # gate now (accepts any non-empty category) so we just need
        # category to exist and label+value to be populated. The
        # canonical-category mapping above handles common variants.
        if not category or not label or not value:
            continue
        key = (category, label.lower())
        if key in seen:
            continue
        seen.add(key)
        confidence = str(row.get("confidence") or "medium").strip().lower()
        if confidence not in {"high", "medium", "low"}:
            confidence = "medium"
        action_type = row.get("action_type")
        action_type = None if action_type in (None, "", "null") else str(action_type).strip()
        action_payload = row.get("action_payload") if isinstance(row.get("action_payload"), dict) else None
        out.append(
            {
                "id": str(uuid.uuid4()),
                "uid": uid,
                "category": category,
                "label": label,
                "value": value,
                "source": "voice",
                "created_at": now,
                "updated_at": now,
                "action_type": action_type,
                "action_payload": action_payload,
                "confidence": confidence,
                "shown_to_user": False,
                "conv_id": conv_id,
            }
        )
    return out


def regenerate_narrative(profile: dict[str, Any], memory_items: list[dict[str, Any]], latest_audit: dict | None, peer_percentile: int | None) -> str:
    """
    Templated narrative summary. ZERO LLM cost.

    Previous version ran a Haiku call (~200 output tokens) every time
    should_regenerate_narrative returned True, which was often on
    active-chat days (every 12h with 1+ new fact, every 3 days
    regardless). Sum of those calls was a meaningful slice of the
    Anthropic bill for zero user-visible gain — most users never read
    the narrative.

    This template composes a clean 3-4 sentence summary from the
    structured facts we already have. When a user wants a richer
    narrative, the web profile's dedicated /profile/web/{slug}/
    narratives endpoint (still LLM-backed, 7-day cached) generates
    one on-demand. Chat never sees the rich narrative, so the
    template is fine for every other surface.
    """
    name = (profile.get("name") or "").strip().split()[0] if profile.get("name") else "This person"
    major = (profile.get("major") or "").strip()
    track = (profile.get("track") or profile.get("cohort") or "").strip()
    career_goal = (profile.get("career_goal") or profile.get("industry_target") or "").strip()
    current_role = (profile.get("current_role") or profile.get("current_job_title") or profile.get("title") or "").strip()

    # Bucket facts by category for composition
    by_cat: dict[str, list[str]] = {}
    for m in memory_items[:80]:
        cat = str(m.get("category") or "").lower()
        label = str(m.get("label") or "").strip()
        if not cat or not label:
            continue
        by_cat.setdefault(cat, []).append(label)

    # Sentence 1: who they are
    s1_parts: list[str] = []
    if current_role:
        s1_parts.append(f"{name} is a {current_role}")
    elif major and track:
        s1_parts.append(f"{name} is studying {major} with a focus on {track}")
    elif major:
        s1_parts.append(f"{name} is studying {major}")
    elif track:
        s1_parts.append(f"{name} is working in {track}")
    else:
        s1_parts.append(f"{name} is building their career with Dilly")
    s1 = ". ".join(s1_parts) + "."

    # Sentence 2: what Dilly knows about skills + projects
    skills = by_cat.get("skill", []) + by_cat.get("technical_skill", []) + by_cat.get("skill_unlisted", [])
    projects = by_cat.get("project", []) + by_cat.get("project_detail", [])
    s2 = ""
    if skills and projects:
        s2 = f"Dilly has tracked {len(skills)} skill{'s' if len(skills) != 1 else ''} and {len(projects)} project{'s' if len(projects) != 1 else ''} so far."
    elif skills:
        s2 = f"Dilly has tracked {len(skills)} skill{'s' if len(skills) != 1 else ''} across their conversations."
    elif projects:
        s2 = f"Dilly has tracked {len(projects)} project{'s' if len(projects) != 1 else ''} so far."

    # Sentence 3: goals / target companies
    targets = by_cat.get("target_company", [])
    goals = by_cat.get("goal", [])
    s3 = ""
    if career_goal and targets:
        top_targets = ", ".join(t.replace("Target: ", "") for t in targets[:2])
        s3 = f"Career goal: {career_goal}. Targeting {top_targets}."
    elif career_goal:
        s3 = f"Career goal: {career_goal}."
    elif targets:
        top_targets = ", ".join(t.replace("Target: ", "") for t in targets[:2])
        s3 = f"Targeting {top_targets}."
    elif goals:
        s3 = f"Near-term goal: {goals[0].replace('Goal: ', '')}."

    # Sentence 4: audit / peer percentile (if available)
    audit = latest_audit or {}
    final_score = audit.get("final_score") or audit.get("score")
    s4 = ""
    if final_score and peer_percentile is not None:
        s4 = f"Current audit: {int(final_score)}/100, top {peer_percentile}% of peers."
    elif final_score:
        s4 = f"Current audit: {int(final_score)}/100."

    return " ".join(p for p in (s1, s2, s3, s4) if p).strip()


# Kept for ad-hoc internal use if we ever need a richer narrative
# (e.g. recruiter-facing generation with an explicit admin trigger).
# Not called from chat or memory extraction.
def _regenerate_narrative_llm(profile: dict[str, Any], memory_items: list[dict[str, Any]], latest_audit: dict | None, peer_percentile: int | None) -> str:
    system = """You are writing a brief third-person narrative summary of a college student's career situation as understood by their AI coach Dilly.

Rules:
- 3-5 sentences maximum
- Specific — use real names, scores, companies, and timeframes
- Warm but professional tone
- Mention strongest dimension and biggest gap
- Mention near-term goal or deadline if present
- Mention 1-2 things they said they want to do but haven't yet
- Do not use hollow phrases like "passionate about" or "dedicated to"
- Write as if briefing a career advisor meeting this student next."""
    scores = (latest_audit or {}).get("scores") if isinstance((latest_audit or {}).get("scores"), dict) else {}
    memory_lines = "\n".join(f"[{m.get('category')}] {m.get('label')}: {m.get('value')}" for m in memory_items[:40])
    user_prompt = f"""Student profile:
Name: {profile.get("name")}
Track: {profile.get("track")}
Major: {profile.get("major")}
Career goal: {profile.get("career_goal")}
Current score: {(latest_audit or {}).get("final_score")}
Smart: {scores.get("smart")} | Grit: {scores.get("grit")} | Build: {scores.get("build")}
Percentile: {"Top " + str(peer_percentile) + "%" if peer_percentile is not None else "unknown"}

Memory items:
{memory_lines}

Write the narrative now. 3-5 sentences, specific, no hollow phrases."""
    raw = get_chat_completion(
        system,
        user_prompt,
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        temperature=0.3,
        log_email=(profile.get("email") or "") if isinstance(profile, dict) else "",
        log_feature="narrative_regen",
    )
    return (raw or "").strip()


def run_extraction(
    uid: str,
    conv_id: str,
    messages: list[dict[str, Any]],
    use_llm: bool = False,
    skip_llm_trivial_gate: bool = False,
) -> dict[str, Any]:
    profile = get_profile(uid) or {}
    surface = get_memory_surface(uid)
    existing_items = surface.get("items") or []
    new_items = extract_memory_items(
        uid,
        conv_id,
        messages,
        existing_items,
        use_llm=use_llm,
        skip_gate=skip_llm_trivial_gate,
    )

    items_all = list(existing_items)
    item_ids: list[str] = []
    if new_items:
        items_all = [*new_items, *existing_items]
        # Deduplicate by category+label.
        dedup: dict[tuple[str, str], dict[str, Any]] = {}
        for item in items_all:
            key = (str(item.get("category") or "").lower(), str(item.get("label") or "").strip().lower())
            if not key[0] or not key[1]:
                continue
            if key not in dedup:
                dedup[key] = item
        items_all = list(dedup.values())[:400]
        item_ids = [str(x.get("id")) for x in new_items]

    latest_audit = (get_audits(uid) or [None])[0]
    peer_percentile = None
    try:
        percs = (latest_audit or {}).get("peer_percentiles") or {}
        vals = [percs.get("smart"), percs.get("grit"), percs.get("build")]
        nums = [float(v) for v in vals if isinstance(v, (int, float))]
        if nums:
            peer_percentile = int(round(max(1, min(100, 100 - (sum(nums) / len(nums))))))
    except Exception:
        peer_percentile = None

    should_regen = should_regenerate_narrative(surface.get("narrative_updated_at"), len(new_items), time.time())
    narrative_updated = False
    narrative = surface.get("narrative")
    narrative_updated_at = surface.get("narrative_updated_at")
    if should_regen:
        candidate = regenerate_narrative(profile, items_all, latest_audit, peer_percentile)
        if candidate:
            narrative = candidate
            narrative_updated_at = _now_iso()
            narrative_updated = True

    # Only write new items to avoid re-upserting the entire profile on every turn.
    # save_memory_surface with items=new_items will upsert only the newly extracted facts.
    # If no new items, still update the narrative if it changed.
    save_memory_surface(
        uid,
        items=new_items if new_items else None,
        narrative=narrative if narrative_updated else _SENTINEL,
        narrative_updated_at=narrative_updated_at if narrative_updated else None,
    )

    capture = upsert_session_capture(
        uid,
        conv_id=conv_id,
        item_ids_added=item_ids,
        narrative_updated=narrative_updated,
    )
    impact = estimate_score_impact(new_items, latest_audit)
    return {
        "items_added": len(new_items),
        "item_ids": item_ids,
        "narrative_updated": narrative_updated,
        "session_capture": capture,
        "impact": impact,
    }

