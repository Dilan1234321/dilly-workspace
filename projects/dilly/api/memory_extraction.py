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
    return [{"category": str(i.get("category") or ""), "label": str(i.get("label") or "")} for i in items]


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
        if len(stripped) < 20:
            continue
        # Any word that isn't trivial or a stop-ish word → worth a call.
        words = re.findall(r"[a-zA-Z']+", stripped.lower())
        non_trivial = [w for w in words if w not in trivial and len(w) > 2]
        if len(non_trivial) >= 3:
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
            r"\b(?:i (?:work|worked|am working|just started|am|used to work) (?:at|for|with)|"
            r"i'?m (?:at|with|on a team at)|working (?:at|for)) "
            r"([A-Za-z][A-Za-z0-9&'.,\- ]{1,50}?)"
            r"(?=\s*(?:,|;|\.)|\s+(?:as|in|on|doing|where|right now|currently|$))",
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
            r"(?=\s*(?:,|;)|\s+(?:before|by|so|because|and|\.|$))",
            re.IGNORECASE,
        ),
        "Goal: {v}",
    ),
    (
        "goal",
        re.compile(
            r"\bi'?m trying to (?:land|get|find|break into|transition to|pivot to) "
            r"([A-Za-z0-9 ,&'.\-]{3,70}?)"
            r"(?=\s*(?:,|;)|\s+(?:before|by|so|because|and|at|right now|currently|\.|$))",
            re.IGNORECASE,
        ),
        "Trying to {v}",
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
        r"\bi (?:know|use|work with|am good at|have experience with|"
        r"am proficient in|taught myself|self.taught in|am learning|picked up) "
        r"([A-Za-z0-9 +#./\-,]{2,120}?)(?:\.|$)",
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
                # Cap lifted from 8 → 15. At 8 a real 5-message chat
                # hit the ceiling before the last couple of categories
                # (education, career_interest, goal) had a chance to
                # emit. 15 is still safe — a single chat cannot produce
                # more than ~15 distinct (category,label) facts.
                if _emit(category, label, val) and len(out) >= 15:
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
                if _emit("skill", label, t) and len(out) >= 15:
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
LLM_EXTRACTION_MIN_USER_MSGS = 5


def extract_memory_items(
    uid: str,
    conv_id: str,
    messages: list[dict[str, Any]],
    existing_items: list[dict[str, Any]],
    use_llm: bool = False,
    skip_gate: bool = False,
) -> list[dict[str, Any]]:
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
    #   use_llm=False (default, called per-turn from /ai/chat) — regex
    #     only. Zero LLM cost. Catches obvious literal facts ("I work
    #     at X", "my goal is Y") and nothing else.
    #   use_llm=True (on chat close via /ai/chat/flush) — LLM
    #     extraction. One call per qualifying conversation. Catches
    #     inferential facts regex can't: emotional context, implied
    #     goals, mentioned-but-not-done, personality tells, rejections,
    #     soft skills, etc. This is the "she actually remembers me"
    #     differentiator paid users are buying.
    #
    # The flush endpoint is the only caller that passes use_llm=True,
    # and it gates that on:
    #   - >= LLM_EXTRACTION_MIN_USER_MSGS user messages (quality bar)
    #   - daily cap per user (cost bar)
    #   - no re-flush within 5 min for the same conv_id (dedup)
    # so we can't run away with cost even if a user hammers the overlay.
    # On the flush path (use_llm=True), ALWAYS run regex as a safety
    # net in addition to the LLM. Previously we ran only one or the
    # other — which meant if Haiku rate-limited, errored, or returned
    # an empty list, a user who hit the 5-msg bar would lose every
    # durable fact from the session. The regex pass is zero cost so
    # there is no reason to skip it. We dedupe union of both lists by
    # (category, label) below. This is what makes "messages 0..5 all
    # get added once the user hits the 5-message mark" actually hold
    # in the presence of transient LLM failures.
    if use_llm:
        # Cost gate: skip the LLM call when the conversation is trivial
        # (greetings, acks, one-word replies). Regex already ran above
        # so literal facts are still captured. Only inferential/LLM facts
        # are skipped on trivial conversations, which is correct.
        llm_items: list[dict[str, Any]] = []
        if skip_gate or _messages_worth_extracting(messages):
            try:
                llm_items = _extract_memory_items_llm(uid, conv_id, messages, existing_items)
            except Exception:
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
        new_items = regex_items

    # Dedup against existing memory (same category+label).
    existing_keys = {
        (str(i.get("category") or "").lower(), str(i.get("label") or "").strip().lower())
        for i in existing_items
    }
    new_items = [
        it for it in new_items
        if (str(it.get("category") or "").lower(), str(it.get("label") or "").strip().lower()) not in existing_keys
    ]
    return new_items


# Kept for ad-hoc internal use (e.g. /internal/memory/run-extraction
# endpoint with an admin token). Not called from chat anymore.
def _extract_memory_items_llm(uid: str, conv_id: str, messages: list[dict[str, Any]], existing_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not _messages_worth_extracting(messages):
        return []

    system = """You are building a Dilly Profile by extracting everything you can learn about a student from their conversation with Dilly, their AI career coach.

Dilly Profiles capture EVERYTHING about a user — not just career facts, but who they are as a person. The goal is to know the user beyond their resume: what they couldn't fit on one page, what drives them, what they're like to work with, and what a recruiter or advisor would want to know.

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
        max_tokens=1200,
        temperature=0.2,
        log_email=uid,
        log_feature="extraction",
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
        category = str(row.get("category") or "").strip()
        label = str(row.get("label") or "").strip()[:50]
        value = str(row.get("value") or "").strip()[:200]
        if not category or not label or not value:
            continue
        key = (category.lower(), label.lower())
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
) -> dict[str, Any]:
    profile = get_profile(uid) or {}
    surface = get_memory_surface(uid)
    existing_items = surface.get("items") or []
    new_items = extract_memory_items(uid, conv_id, messages, existing_items, use_llm=use_llm)

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

    save_memory_surface(
        uid,
        items=items_all,
        narrative=narrative,
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

