"""
Per-user advisor persona for the Chapter prompt.

Complements chapter_advisor_lens (path-based: who the user IS).
Persona is about how the user WANTS to be advised — the same
veteran can pick 'warm' or 'sharp' and the Chapter reads very
differently. Three options:

  warm    — gentle, encouraging, lead with what's working, soften
            the push, name the hard thing but pair it with belief
            in the user. Default feel for first-time users; good
            for anyone in a low-confidence stretch.

  sharp   — the honest mirror. Lean harder on push_on, less
            preamble and praise, name what they're avoiding even
            when it's uncomfortable. For users who explicitly want
            a coach who doesn't flinch. Not mean — rigorous.

  direct  — minimal narrative, maximum signal. Strip the softening
            transitions, compress each screen to its essential
            move. For users who want the 60-second version, no
            performance of insight, just the moves.

When the user hasn't picked (None / empty), we don't inject
anything and the existing advisor-lens + style rules govern the
default voice.

Zero LLM cost. Pure static content. Stacks additively on top of
the path lens so veteran + sharp reads different from
ex_founder + sharp, and both read different from their warm
counterparts.
"""

from __future__ import annotations


# Three persona lenses. Each is a short block the chapters.py
# router splices into the system prompt right after the
# advisor_lens block (if the user has picked one).
#
# Format matches advisor_lens: arc / emphasis / avoid — but here
# those fields describe DELIVERY STYLE, not user identity.
PERSONAS: dict[str, dict] = {
    "warm": {
        "stance": "The user asked you to advise with warmth. Lead with what is working. Name the hard thing but pair it with evidence that they can move it. End every screen on a forward note, not a flat one.",
        "emphasis": "Soft push on push_on — the honest question, but phrased with belief in them. On cold_open and close, be warmer than your default.",
        "avoid": "Do not flatter. Warmth is not praise inflation. The call-outs still have to be real; you just deliver them with grace.",
    },
    "sharp": {
        "stance": "The user asked for a sharper coach. Lean hard on push_on — ask the question they're avoiding. Cut preamble. Be rigorous, not mean.",
        "emphasis": "Shorten cold_open by one beat. Make push_on the center of gravity of the Chapter. Name patterns and contradictions if you see them.",
        "avoid": "Do not soften obvious avoidance. Do not perform 'tough love' — that's theater. The sharpness is in the precision of the question, not the tone of the delivery.",
    },
    "direct": {
        "stance": "The user asked for the 60-second version. Strip narrative transitions. Each screen is one concrete beat, no warm-up, no wind-down.",
        "emphasis": "Prioritize one_move — make it immediately actionable. Be specific about exactly what to do tomorrow. Cut any sentence that does not move the ball.",
        "avoid": "No metaphors. No 'I notice' / 'I wonder' framing unless it earns its place. Do not soften to protect the reader's comfort — they asked to skip that.",
    },
}


DEFAULT_PERSONA_KEY = ""  # empty → no persona block injected


VALID_PERSONA_KEYS = set(PERSONAS.keys())


def persona_block(persona: str | None) -> str:
    """Return the persona system-prompt block to splice in, or empty
    string if no persona is set (or an unknown value was passed). The
    caller concatenates this after the path advisor_lens block."""
    if not persona or not isinstance(persona, str):
        return ""
    key = persona.strip().lower()
    lens = PERSONAS.get(key)
    if not lens:
        return ""
    return (
        "HOW THIS USER WANTS TO BE ADVISED (PERSONA):\n"
        f"- Stance: {lens['stance']}\n"
        f"- Emphasis: {lens['emphasis']}\n"
        f"- Avoid: {lens['avoid']}"
    )


def is_valid_persona(persona: str | None) -> bool:
    if not persona or not isinstance(persona, str):
        return False
    return persona.strip().lower() in VALID_PERSONA_KEYS
