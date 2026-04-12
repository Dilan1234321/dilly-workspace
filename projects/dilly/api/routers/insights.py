"""
Insights Letter - Dilly's personal letter to the user.
A living letter that reflects everything Dilly knows about them.
"""

import hashlib
import json
import os
import time
from collections import OrderedDict

from fastapi import APIRouter, HTTPException, Request

from projects.dilly.api import deps

router = APIRouter(tags=["insights"])

# ---------------------------------------------------------------------------
# Cache (module-level LRU, TTL 7 days)
# ---------------------------------------------------------------------------
_LETTER_CACHE_TTL_SEC = 7 * 86400
_LETTER_CACHE_MAX = 2000
_LETTER_CACHE: OrderedDict[str, dict] = OrderedDict()


def _cache_get(key: str, profile_hash: str) -> dict | None:
    entry = _LETTER_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > _LETTER_CACHE_TTL_SEC:
        _LETTER_CACHE.pop(key, None)
        return None
    if entry["profile_hash"] != profile_hash:
        _LETTER_CACHE.pop(key, None)
        return None
    _LETTER_CACHE.move_to_end(key)
    return entry["response"]


def _cache_set(key: str, response: dict, profile_hash: str) -> None:
    _LETTER_CACHE[key] = {
        "response": response,
        "ts": time.time(),
        "profile_hash": profile_hash,
    }
    _LETTER_CACHE.move_to_end(key)
    while len(_LETTER_CACHE) > _LETTER_CACHE_MAX:
        _LETTER_CACHE.popitem(last=False)


# ---------------------------------------------------------------------------
# Profile text builder (same logic as jobs_narrative.py)
# ---------------------------------------------------------------------------
def _build_profile_text(profile: dict, facts: list[dict]) -> str:
    """Assemble profile data into a structured text block for the LLM."""
    parts: list[str] = []

    # Identity
    name = profile.get("name") or profile.get("full_name") or "Unknown"
    parts.append(f"Name: {name}")
    school = profile.get("school") or ""
    if school:
        parts.append(f"School: {school}")
    major = profile.get("major") or ""
    minors = profile.get("minors") or profile.get("minor") or ""
    if major:
        parts.append(f"Major: {major}")
    if minors:
        parts.append(f"Minor(s): {minors if isinstance(minors, str) else ', '.join(minors)}")
    gpa = profile.get("gpa") or profile.get("transcript_gpa")
    if gpa:
        parts.append(f"GPA: {gpa}")
    class_year = profile.get("class_year") or profile.get("graduation_year") or ""
    if class_year:
        parts.append(f"Class Year: {class_year}")
    target = profile.get("application_target") or "exploring"
    parts.append(f"Application Target: {target}")

    # Cohorts
    cohorts = profile.get("cohorts") or []
    if cohorts:
        parts.append(f"Cohorts: {', '.join(cohorts)}")

    # Profile facts (organized by category)
    if facts:
        by_cat: dict[str, list[str]] = {}
        for f in facts:
            cat = f.get("category", "other")
            text = f"{f.get('label', '')}: {f.get('value', '')}".strip()
            if text and text != ":":
                by_cat.setdefault(cat, []).append(text)
        for cat, items in sorted(by_cat.items()):
            parts.append(f"\n[{cat.upper()}]")
            for item in items[:30]:
                parts.append(f"  - {item}")

    # Beyond resume (voice-captured)
    beyond = profile.get("beyond_resume") or []
    if beyond:
        parts.append("\n[ADDITIONAL INFO (shared with Dilly)]")
        for item in beyond[:20]:
            if isinstance(item, dict):
                t = item.get("type", "")
                text = item.get("text", "")
                if text:
                    parts.append(f"  - [{t}] {text}")

    # Experience expansion
    expansion = profile.get("experience_expansion") or []
    if expansion:
        parts.append("\n[EXPERIENCE DETAILS]")
        for entry in expansion[:10]:
            if not isinstance(entry, dict):
                continue
            role = entry.get("role_label", "")
            org = entry.get("organization", "")
            label = f"{role} at {org}" if org else role
            if not label:
                continue
            parts.append(f"  {label}")
            skills = entry.get("skills") or []
            if skills:
                parts.append(f"    Skills: {', '.join(skills[:15])}")
            tools = entry.get("tools_used") or []
            if tools:
                parts.append(f"    Tools: {', '.join(tools[:15])}")
            omitted = entry.get("omitted") or []
            if omitted:
                parts.append(f"    Not on resume: {'; '.join(omitted[:5])}")

    # Goals
    goals = profile.get("goals") or []
    if goals:
        parts.append(f"\nGoals: {', '.join(str(g) for g in goals[:5])}")

    return "\n".join(parts)


def _profile_hash(profile: dict, facts: list[dict]) -> str:
    """Quick hash to detect profile changes for cache invalidation."""
    updated = profile.get("updated_at") or ""
    fact_count = len(facts)
    return hashlib.md5(f"{updated}|{fact_count}".encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/insights/letter")
async def insights_letter(request: Request):
    """Generate Dilly's personal letter to the user based on their full profile."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    # Load profile and facts
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.memory_surface_store import get_memory_surface

    profile = get_profile(email) or {}
    surface = get_memory_surface(email)
    facts = surface.get("items") or []

    # Build profile text
    profile_text = _build_profile_text(profile, facts)

    # Check cache
    p_hash = _profile_hash(profile, facts)
    cache_key = f"letter:{email}"
    cached = _cache_get(cache_key, p_hash)
    if cached:
        return {**cached, "cached": True}

    # Thin profile guard
    if len(profile_text.split()) < 20:
        return {
            "letter": (
                "Hey, I don't know enough about you yet to write something meaningful. "
                "Tell me about your experiences, your goals, what you're working on. "
                "The more I know, the better I can help you see what I see."
            ),
            "connections": [],
            "next_moves": [
                {
                    "action": "Tell Dilly about yourself",
                    "why": "I need to know your story before I can connect the dots.",
                    "prompt": "I want to tell you about my background and what I'm working toward.",
                },
            ],
            "cached": False,
            "thin_profile": True,
        }

    # Call Claude Sonnet
    system_prompt = (
        "You are Dilly, writing a personal letter to someone you know deeply. "
        "You've studied their entire profile. Write like a mentor who genuinely cares, "
        "not a corporate advisor.\n\n"
        "Your letter has three parts:\n\n"
        "1. THE LETTER (4-5 short paragraphs):\n"
        "- Start with what impresses you about them. Be specific, cite their actual experiences.\n"
        "- Then what concerns you or what they're missing. Be honest but caring.\n"
        "- Connect dots they haven't connected. Find patterns across their profile that "
        "reveal something they might not see about themselves.\n"
        "- End with their single most impactful next move.\n\n"
        "2. CONNECTIONS (2-3 insights where you connect dots across their profile):\n"
        "Each connection links two separate facts/experiences and reveals something new.\n"
        'Format: {"from": "fact A they told you", "to": "fact B they told you", '
        '"insight": "what this combination means for their career"}\n\n'
        "3. NEXT MOVES (3 specific actions):\n"
        "Each move is concrete and tappable. Not generic advice.\n"
        'Format: {"action": "what to do", "why": "why it matters for them specifically", '
        '"prompt": "a message to send to Dilly AI to get help with this"}\n\n'
        "Never use em dashes. Be specific. Cite their actual profile facts by name. "
        "If the profile is thin, say so honestly and tell them what to share with Dilly "
        "to unlock better insights.\n\n"
        "Return JSON:\n"
        "{\n"
        '  "letter": "the full letter text, 4-5 short paragraphs",\n'
        '  "connections": [{"from": "...", "to": "...", "insight": "..."}],\n'
        '  "next_moves": [{"action": "...", "why": "...", "prompt": "..."}]\n'
        "}"
    )

    user_message = f"---PROFILE---\n{profile_text}\n---END PROFILE---"

    try:
        import anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="AI service not configured.")

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            temperature=0.4,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

        raw = response.content[0].text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()

        parsed = json.loads(raw)

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="AI returned an invalid response. Please try again.",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[INSIGHTS] Error calling Claude: {e}", flush=True)
        raise HTTPException(
            status_code=502, detail="AI service error. Please try again."
        )

    # Validate and normalize
    letter_text = parsed.get("letter", "")
    connections = parsed.get("connections") or []
    next_moves = parsed.get("next_moves") or []

    # Ensure connections have the right shape
    valid_connections = []
    for c in connections[:3]:
        if isinstance(c, dict) and c.get("from") and c.get("to") and c.get("insight"):
            valid_connections.append({
                "from": str(c["from"]),
                "to": str(c["to"]),
                "insight": str(c["insight"]),
            })

    # Ensure next_moves have the right shape
    valid_moves = []
    for m in next_moves[:3]:
        if isinstance(m, dict) and m.get("action"):
            valid_moves.append({
                "action": str(m["action"]),
                "why": str(m.get("why", "")),
                "prompt": str(m.get("prompt", m["action"])),
            })

    letter_response = {
        "letter": letter_text,
        "connections": valid_connections,
        "next_moves": valid_moves,
    }

    # Cache it
    _cache_set(cache_key, letter_response, p_hash)

    return {**letter_response, "cached": False}
