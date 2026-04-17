"""
AI router: simple chat endpoint for the Dilly mobile AI overlay.
Calls Claude claude-haiku-4-5-20251001 via the Anthropic SDK.
Requires ANTHROPIC_API_KEY in .env.
"""

import os
import sys

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from projects.dilly.api import deps

router = APIRouter(tags=["ai"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class StudentContext(BaseModel):
    name: Optional[str] = None
    cohort: Optional[str] = None
    score: Optional[float] = None
    smart: Optional[float] = None
    grit: Optional[float] = None
    build: Optional[float] = None
    gap: Optional[float] = None
    cohort_bar: Optional[float] = None
    reference_company: Optional[str] = None

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    mode: str = "coaching"              # "coaching" | "practice"
    system: Optional[str] = None        # override auto-built system prompt
    student_context: Optional[StudentContext] = None

class ChatResponse(BaseModel):
    content: str


# ── Formatting guide (injected into every system prompt) ─────────────────────

FORMATTING_GUIDE = """
FORMATTING RULES — the app renders a custom markdown subset. Use it sparingly and only when it genuinely helps clarity:
- **text** → bold. Use for the single most important word or phrase per paragraph. Not for whole sentences.
- *text* → italic. Use for emphasis, contrast, or a key term being introduced.
- __text__ → underline. Use for action items or things the student must do.
- ~~text~~ → strikethrough. Use only when explicitly crossing something out (e.g. showing what NOT to write).
- ==text== → bold gold. Use for Dilly score mentions, recruiter bars, or the single most critical insight per message.
- ==green:text== → bold green. Use for strengths, things above the bar, or positive signals.
- ==amber:text== → bold amber. Use for warnings or things close to the bar.
- ==coral:text== → bold coral/red. Use for below-bar scores or critical gaps.
- ==blue:text== → bold blue. Use for company names or action links.

RULES:
- Use at most 2–3 formatted spans per response. Less is more.
- Never bold an entire sentence. Pick the key noun or number.
- Never use color just to be colorful. It must signal something meaningful.
- Plain text is fine. Do not force formatting.
"""


# ── System prompt builder ─────────────────────────────────────────────────────

VOICE_GUIDE = """
VOICE AND TONE:
You are a career advisor who went to Wharton, Harvard, or Princeton and has placed hundreds of students at Goldman, Google, McKinsey, and similar firms. You speak like a person, not a chatbot. Your tone is direct, warm, and confident. You say what you mean without hedging.

STRICT WRITING RULES:
- Never use em-dashes (— or --). Use a period or comma instead.
- Never use filler phrases like "Great question!", "Absolutely!", "Of course!", "Certainly!", or "That's a great opportunity."
- Never start a response with the student's name.
- Do not use bullet points unless listing 3 or more discrete action items.
- Write in short, punchy sentences. No run-ons.
- Sound like a person texting smart advice, not a report being generated.
- Never say "I'd recommend" or "I would suggest." Just say what to do.
"""


def _build_system_prompt(mode: str, ctx: Optional[StudentContext]) -> str:
    name    = (ctx.name if ctx else None) or "the student"
    cohort  = (ctx.cohort if ctx else None) or "General"
    company = (ctx.reference_company if ctx else None) or "top companies"
    score   = ctx.score if ctx else None
    smart   = ctx.smart if ctx else None
    grit    = ctx.grit  if ctx else None
    build   = ctx.build if ctx else None
    bar     = ctx.cohort_bar if ctx else None

    if mode == "practice":
        return (
            f"You are a senior recruiter at {company} conducting a real interview with {name}, "
            f"a {cohort} student. This is a simulation but treat it like it's real. "
            "Ask one question at a time. After each answer give 1-2 sentences of honest feedback, "
            "then ask your next question. Start with a brief intro and your first question. "
            "Be tough but fair. No flattery.\n\n"
            + VOICE_GUIDE
            + "\n" + FORMATTING_GUIDE
        )

    # Coaching mode
    score_info = f"Their overall Dilly Score is {int(score)}/100. " if score else ""
    dim_info   = (
        f"Smart: {int(smart)}, Grit: {int(grit)}, Build: {int(build)}. "
        if (smart is not None and grit is not None and build is not None) else ""
    )
    bar_info = f"The recruiter bar at {company} is {int(bar)}/100. " if bar and company else ""

    return (
        f"You are Dilly, a career advisor coaching {name}, a {cohort} student. "
        f"{score_info}{dim_info}{bar_info}"
        "Your job is to help them land internships and improve their profile. "
        "Be specific. Name the exact problem and the exact fix. "
        "Keep replies to 2-4 short paragraphs. "
        "If you need more context, ask one sharp question before advising.\n\n"
        + VOICE_GUIDE
        + "\n" + FORMATTING_GUIDE
    )


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/ai/chat", response_model=ChatResponse)
async def ai_chat(request: Request, body: ChatRequest):
    """
    Chat with Claude claude-haiku-4-5-20251001 for the Dilly AI overlay.
    Requires Authorization: Bearer <jwt> header.
    """
    deps.require_auth(request)

    try:
        import anthropic
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Anthropic SDK not installed. Run: pip install anthropic"
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not set — add it to .env and restart the API"
        )

    system = body.system or _build_system_prompt(body.mode, body.student_context)

    messages = [
        {"role": msg.role, "content": msg.content}
        for msg in body.messages
        if msg.role in ("user", "assistant") and msg.content.strip()
    ]
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=system,
            messages=messages,
        )
        content = response.content[0].text if response.content else ""
        return ChatResponse(content=content.strip())
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")
