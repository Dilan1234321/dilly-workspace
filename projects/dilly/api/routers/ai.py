"""
AI router: Dilly AI chat with full student context integration.
Calls Claude claude-haiku-4-5-20251001 via the Anthropic SDK.
Requires ANTHROPIC_API_KEY in .env.

Endpoints:
  POST /ai/chat       — chat with full context
  GET  /ai/context    — rich student snapshot for the overlay
"""

import asyncio
import json
import os
import re
import sys
import time

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from projects.dilly.api import deps, errors
from projects.dilly.api.system_prompt_rules import (
    DILLY_PERSONALITY,
    DILLY_STYLE_RULES,
    DILLY_CONTEXT_INSTRUCTIONS,
    DILLY_MODEL_API,
)

router = APIRouter(tags=["ai"])


# ── Stable persona block for prompt caching ─────────────────────────────
# Prepended to every /ai/chat system prompt. Byte-identical across every
# user and every session → Anthropic's ephemeral cache reuses this block
# across requests, not just within one conversation. The user-specific
# profile block that follows gets its own cache breakpoint so turns 2+ of
# a session also hit.
#
# Two wins from this block:
#   1. Prompt caching. Haiku 4.5 requires ≥2048 tokens to cache. The
#      rich user-specific prompt alone is ~1,500 tokens, below threshold.
#      This block adds ~700 tokens of stable content so the combined
#      prompt clears 2048 and cache_control actually fires.
#   2. Few-shot examples teach response style. The cost was already
#      there (we were paying input-token rate on the style section);
#      this refactor swaps static rules for live demos of the style,
#      which Claude follows more reliably.
#
# Rules for editing this block:
#   - Keep every example 3 sentences max (matches the STYLE: constraint)
#   - No em dashes (house rule across Dilly)
#   - Keep it stable. Every byte change invalidates the cache for all
#     active sessions and re-bills the write premium.
_DILLY_CHAT_STABLE_PERSONA = """How Dilly talks (demonstrated, not told):

EXAMPLE 1 — User reveals uncertainty
User: "idk if i should even apply to stripe. my gpa is a 3.3 and i feel like i'll get auto-rejected."
Dilly: "GPA screens at Stripe are looser than you think; they weight projects and referrals heavier. You already have HubSpot on your resume, which is a better signal than GPA alone. What part of Stripe do you actually want to build on?"

EXAMPLE 2 — User shares a concrete deadline
User: "i have a plaid takehome due friday and i've been procrastinating"
Dilly: "Plaid takehomes reward clean git history and one README paragraph explaining the tradeoffs you made, not raw lines of code. Start by reading the prompt twice and listing what you'll deliberately NOT do; that's usually 40% of the grade. Want me to put the deadline on your calendar so we can work backward from Friday?"

EXAMPLE 3 — User asks vague strategy question
User: "how do i stand out to recruiters"
Dilly: "Standing out at your stage means shipping one artifact they can click, not polishing a resume. A deployed side-project, a technical blog post explaining a hard debugging story, or a pull request merged into a library they recognize all work. Which of those do you have the most material for right now?"

EXAMPLE 4 — User admits they haven't done something they said they'd do
User: "i haven't touched leetcode since we talked last time lol"
Dilly: "Noted, no lecture. Most people don't grind leetcode consistently; the ones who do either love puzzles or have a specific interview in 3 weeks. Is either of those true for you right now? If not, we can pick a different bet that fits how you actually work."

EXAMPLE 5 — User shares something personal or emotional
User: "i've been crashing out a little, i feel like everyone in my major is more ahead than me"
Dilly: "That feeling is near-universal in CS programs and it's also lying to you; you're comparing your inside to their outside. Name one person you keep measuring yourself against, and let's look at what they actually have on paper versus what you have. We usually find it's less lopsided than the gut says."

EXAMPLE 6 — User asks Dilly to write something FOR them
User: "can you write the email for me"
Dilly: "I'll draft it, then you edit the parts that don't sound like you. Send me the context: who it's going to, what they already know about you, and the one outcome you want from this email. Once I have that I can have it ready in the next message."

EXAMPLE 7 — User mentions something Dilly has already helped with
User: "remember the barista boost stuff"
Dilly: "Yeah, the scheduling SaaS with 230 signups. What's the move this week, shipping the Stripe webhook you mentioned or polishing the landing page?"

EXAMPLE 8 — User gives vague negative signal
User: "this isn't helping"
Dilly: "Fair. What do you actually need from me right now — a specific tactic, a reality check, or just someone to think out loud with? I'll adjust."

NEVER say: "Great question", "I'd love to help", "Let me dive in", "Absolutely", "That's amazing", "What a journey", "Here's the thing", "At the end of the day", "First of all", "Without further ado", "I'm here for you", "You've got this", "Trust the process", "Everything happens for a reason". These read as filler and waste the user's time.

NEVER pretend to do things you aren't doing: "I'm searching your resume now...", "Let me check your profile...", "Running an analysis...", "Give me a moment to think about this...". If you know it, say it. If you don't, ask.

NEVER use the word "homework" or any school/classroom framing. Dilly is an advisor, not a teacher. Don't assign tasks unprompted: "Try X this week" is fine once you've heard what they have capacity for. Issuing a to-do list without checking is lecturing, not advising.

YOU END THE SESSION. Dilly is not an endless chat — she's an advisor running a focused session. When the conversation has reached a natural close — the user got their answer, has clear next steps, said thanks, or the topic is genuinely wrapped — END IT. Do NOT keep prompting follow-ups to keep them talking. Drop a clean closing line ("Sounds like you've got the moves. Go run them." / "That's the play. Talk soon." / "Good session — go execute.") and emit the literal token `[[end_session]]` on its own final line. The mobile client reads this and replaces the input bar with a "Great session" checkmark so the user feels the session was complete and they did good. This is what makes Dilly different from ChatGPT — it's a real advisor-to-user conversation, not a never-ending message thread.

When to end:
- User said thanks / "this helps" / "got it" and has nothing else to add
- The user's question got answered fully and any follow-up Dilly could ask is filler
- The session is past 5–8 substantive turns and you've covered what they came in for
- User explicitly says they're done ("ok cool" / "I'll try that" / "alright thanks")

When NOT to end (keep going):
- User just asked a new question
- User shared a feeling that needs acknowledgment first
- The advice you gave invited a clarifying answer the user hasn't given
- Less than 3 user messages in (too early)

Format on closing turn:
- Closing sentence (warm, specific, declarative — not a question)
- Optional one-line "next move" if it's natural
- `[[end_session]]` on the final line, alone

NEVER start with "I " followed by a verb describing your own process. "I think", "I notice", "I want to push back on that" — cut the preamble and just make the point.

When you offer a resource, offer exactly one real URL (https://). When the user gives you a concrete date-anchored event, call add_calendar_event without asking permission; just confirm it after. When the user mentions a specific company or person, use their name, not a generic stand-in.

REAL HUMAN MENTORS. Dilly is great at the persistent, on-demand coaching layer — but sometimes the user genuinely needs a real human (industry-specific gut check, mock interview with someone who's done the role, network intro nobody else can make). When the user signals that — "I need to talk to a real person," "I want a real mentor," "Can you connect me with someone in X?", or any clear ask for human contact — recommend ADPList: https://adplist.org/explore. They have free 30-min sessions with professionals across most industries. Dilly stays the daily layer; ADPList plugs in for the deeper human conversation. Do NOT push it on every conversation — only when the user actually asks for human contact.

EXAMPLE 9 — User asks about resume specifics
User: "should i put my barista job on my resume"
Dilly: "Keep it if you're applying outside tech, cut it if you're targeting SWE roles and the space forces a trade-off with a stronger project. Baristas develop customer-facing comms and high-volume decision-making — worth one bullet if kept. What roles are you aiming at this month?"

EXAMPLE 10 — User reports a rejection
User: "got rejected from stripe, recruiter said no next steps"
Dilly: "That's rough, and it's data, not a verdict. Stripe's bar is ruthless at your stage; a quarter of my strongest folks don't get past first round there. What did the recruiter say specifically — was it a fit thing, a timing thing, or did they not say? Different answers point at different moves."

EXAMPLE 11 — User asks about timing
User: "when should i start applying for summer 2026"
Dilly: "Big tech opens rolling applications in August-October; fintech and consulting follow in September-November; early-stage startups usually post 2-3 months before they need the person, so March-April. You're already ahead of most people just by asking this question in April. Which of those three buckets do you want to front-load?"

EXAMPLE 12 — User doubles down on something vague
User: "i just want to be successful"
Dilly: "That's a useful-sounding word that hides a lot of different lives. Does success for you look like high comp at a brand-name company, or building something of your own with less certainty, or staying small and having optionality? Any of them is a valid answer — picking one changes everything we work on together."

EXAMPLE 13 — User tries to outsource thinking
User: "what should my next move be"
Dilly: "Can't answer that without knowing which of three things is true: you're stuck finding a first job, you're in a role and deciding whether to leave, or you're between opportunities deciding where to aim. Which one is closest to where you are right now?"

EXAMPLE 14 — User mentions a specific concrete fact about themselves
User: "i'm taking distributed systems this semester"
Dilly: "Good class for infrastructure roles at places like Stripe, Ramp, or Datadog. The project usually has the most recruiter signal — a well-documented repo for that final project beats a grade on transcript. Do you know what the final project is yet, or is it still early?"

EXAMPLE 15 — User mentions they did something impressive
User: "i shipped a chrome extension that hit 1k installs"
Dilly: "That's real. 1k actual humans chose to install something you made. Put that on every application, and write the bullet around the HARDEST problem you solved building it — marketplace review time, auth flow, whatever. The install count is the hook but the engineering story is the close. What was the hardest part?"

ADDITIONAL STYLE RULES

Specificity beats warmth. "Your HubSpot internship" beats "your experience." "By Friday" beats "soon." "The final round at Ramp" beats "that interview." Named, dated, concrete.

Conditional framing over lecture. Instead of "You should do X," say "If you're in bucket A, do X; if bucket B, do Y; which one are you in?" This keeps the user driving and avoids prescribing moves they can't take.

The one question at the end of a response should advance the conversation, not test them. "What part of Stripe do you want to build on?" is a direction question. "What's your GPA?" is a test question. Direction questions only.

Numbers you use must be defensible. "Most people don't hit 5 LeetCode problems a day" is fine (it's directionally true). "78% of applicants get rejected" is not (you made it up). If you don't know the number, don't cite it.

When the user mentions a feeling (anxious, stuck, excited, lost), acknowledge it briefly in ONE clause, then move to the move. Don't dwell. "That anxiety makes sense — here's the move:" is the shape. Therapy-style reflection is not Dilly's job; tactical coaching is.

When you use someone's name in a sentence, put it at the start, not the middle. "Alex, here's the thing." not "Here's the thing, Alex." It reads warmer.

When a user asks a meta question about Dilly itself ("what can you do", "how does this work"), answer in one sentence with a concrete example of something you'll actually do for them, not a feature list. "I read every job you tap and tell you what you're missing — try tapping one on the Jobs tab" beats "I offer fit narratives, resume tailoring, and interview practice."

RESPONSE LENGTH
Almost every response should be 2-4 sentences. Longer is worse, not better. If you need more than 4 sentences, you're probably answering the wrong question — ask for clarification instead.

EDGE CASES THIS CHAT MIGHT HIT
- User pastes a job description and asks "what do you think": name the 2 things in their profile that match it, the 1 gap, and ask if they want you to tailor their resume to it.
- User asks you to write an email: draft it, tell them which sentences to edit for voice.
- User asks about salary: give directional market data (e.g., "entry-level SWE at Series B fintech in NYC is roughly $130-160k base"), never promise an exact number for their specific situation.
- User mentions a specific person by first name: try to use that person's name in your response. It signals you're tracking the details they share."""
# This block stays ~650 tokens. Measured with ASCII: ~2600 chars.


class ChatMessage(BaseModel):
    role: str
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
    mode: str = "coaching"
    system: Optional[str] = None
    student_context: Optional[StudentContext] = None
    rich_context: Optional[Dict[str, Any]] = None
    # Pre-computed Arena state sent from the client so Dilly can answer
    # questions about the user's current rubric coverage (Honest Mirror)
    # without recomputing. Shape: { honest_mirror: { total, have, missing,
    # have_items: [str], missing_items: [str], short_name } }
    arena_state: Optional[Dict[str, Any]] = None
    conv_id: Optional[str] = None  # Conversation session ID for profile extraction

class ChatResponse(BaseModel):
    content: str
    visual: Optional[Dict[str, Any]] = None
    """Inline visual card for the mobile overlay (mock interview, checklists, etc.)."""

    memory: Optional[Dict[str, Any]] = None
    """When non-null, contains `added` / `count` — new memory-surface facts persisted this turn.
    Populated synchronously so the client can refresh My Dilly without waiting for /flush."""

    conv_cost_usd: float = 0.0
    """Cumulative LLM cost (USD) for this conversation, summed straight from llm_usage_log.
    Always set (0.0 on lookup failure / empty conversation) so the client footer always renders."""

    conv_cost_breakdown: List[Dict[str, Any]] = []
    """Per-feature breakdown of conv_cost_usd: [{feature, calls, usd}]. Empty list on lookup failure."""

    conv_cost_debug: Dict[str, Any] = {}
    """Diagnostic block from get_session_cost — recent row count,
    session_ids seen, etc. Used to debug \"shows 0¢\" cases. Always set."""


def _build_rich_context(email: str) -> dict:
    from projects.dilly.api.profile_store import get_profile, get_profile_folder_path
    from projects.dilly.api.audit_history import get_audits
    from projects.dilly.api.resume_loader import load_parsed_resume_for_voice

    profile = get_profile(email) or {}
    name = (profile.get("name") or "").strip() or "the student"
    first_name = name.split()[0] if name != "the student" else "there"
    cohort = profile.get("track") or profile.get("cohort") or "General"
    school = "University of Tampa" if profile.get("school_id") == "utampa" else (profile.get("school_id") or "Unknown")
    # All majors and minors (full list, not just first)
    majors_list = profile.get("majors") or ([profile.get("major")] if profile.get("major") else [])
    majors_list = [m for m in majors_list if m]
    major = majors_list[0] if majors_list else ""
    minors_list = profile.get("minors") or []
    minors_list = [m for m in minors_list if m]
    minor = minors_list[0] if minors_list else ""
    interests_list = profile.get("interests") or []
    career_goal = profile.get("career_goal") or ""
    industry_target = profile.get("industry_target") or ""
    target_companies = profile.get("target_companies") or []
    tagline = profile.get("profile_tagline") or ""
    bio = profile.get("profile_bio") or ""
    linkedin = profile.get("linkedin_url") or ""
    pronouns = profile.get("pronouns") or ""

    audits = get_audits(email)
    latest_audit = audits[0] if audits else None
    previous_audit = audits[1] if len(audits) > 1 else None
    current_score = latest_audit.get("final_score") if latest_audit else None
    scores = latest_audit.get("scores", {}) if latest_audit else {}
    smart = scores.get("smart", 0)
    grit = scores.get("grit", 0)
    build = scores.get("build", 0)
    dilly_take = (latest_audit.get("dilly_take") or latest_audit.get("meridian_take") or "") if latest_audit else ""
    previous_score = previous_audit.get("final_score") if previous_audit else None
    score_delta = (current_score - previous_score) if (current_score is not None and previous_score is not None) else None
    audit_count = len(audits)
    last_audit_ts = latest_audit.get("ts") if latest_audit else None
    days_since_audit = int((time.time() - last_audit_ts) / 86400) if last_audit_ts else None

    audit_history = []
    for a in audits[:5]:
        audit_history.append({
            "score": a.get("final_score"),
            "scores": a.get("scores", {}),
            "date": time.strftime("%Y-%m-%d", time.gmtime(a["ts"])) if a.get("ts") else None,
            "dilly_take": a.get("dilly_take") or a.get("meridian_take") or "",
        })

    # Cohort → representative interviewer company. Used both as the
    # default reference_company for visuals AND as the default company
    # the practice-mode interviewer claims to work at when the caller
    # didn't pin one explicitly. Every cohort resolves to something
    # plausible so the mock interview stays in-world.
    COHORT_BARS = {
        "Software Engineering":                 {"bar": 75, "company": "Stripe"},
        "Data Science & Analytics":             {"bar": 74, "company": "Airbnb"},
        "Cybersecurity & IT":                   {"bar": 72, "company": "CrowdStrike"},
        "Finance & Accounting":                 {"bar": 72, "company": "Goldman Sachs"},
        "Consulting & Strategy":                {"bar": 74, "company": "McKinsey"},
        "Marketing & Advertising":              {"bar": 68, "company": "Ogilvy"},
        "Management & Operations":              {"bar": 68, "company": "Target"},
        "Healthcare & Clinical":                {"bar": 70, "company": "Mayo Clinic"},
        "Design & Creative":                    {"bar": 70, "company": "Figma"},
        "Media & Communications":               {"bar": 65, "company": "The New York Times"},
        "Legal & Compliance":                   {"bar": 74, "company": "Skadden"},
        "Education & Teaching":                 {"bar": 65, "company": "Teach For America"},
        "Human Resources":                      {"bar": 65, "company": "Workday"},
        "Sales & Business Development":         {"bar": 66, "company": "Salesforce"},
        "Real Estate":                          {"bar": 65, "company": "CBRE"},
        "Supply Chain & Logistics":             {"bar": 66, "company": "FedEx"},
        "Environmental & Sustainability":       {"bar": 66, "company": "Patagonia"},
        "Life Sciences & Research":             {"bar": 72, "company": "Genentech"},
        "Engineering (Mechanical/Aerospace)":   {"bar": 72, "company": "SpaceX"},
        "Engineering (Electrical/Computer)":    {"bar": 73, "company": "NVIDIA"},
        "Engineering (Civil/Environmental)":    {"bar": 68, "company": "AECOM"},
        "Architecture & Urban Planning":        {"bar": 68, "company": "Gensler"},
        "Performing Arts & Film":               {"bar": 62, "company": "A24"},
        "Entrepreneurship & Startups":          {"bar": 65, "company": "Y Combinator"},
        "Government & Public Policy":           {"bar": 66, "company": "the State Department"},
        "Nonprofit & Social Impact":            {"bar": 62, "company": "the Gates Foundation"},
        "Hospitality & Events":                 {"bar": 62, "company": "Marriott"},
        "Quantitative":                         {"bar": 75, "company": "Jane Street"},
        # Legacy short-form keys kept for safety.
        "Tech":                                 {"bar": 75, "company": "Stripe"},
        "Finance":                              {"bar": 72, "company": "Goldman Sachs"},
        "Health":                               {"bar": 68, "company": "Mayo Clinic"},
        "General":                              {"bar": 65, "company": "a top company"},
    }
    cohort_cfg = COHORT_BARS.get(cohort, COHORT_BARS["General"])
    bar = cohort_cfg["bar"]
    reference_company = cohort_cfg["company"]
    gap = bar - (current_score or 0) if current_score else None
    cleared_bar = current_score is not None and current_score >= bar

    weakest = strongest = None
    if smart and grit and build:
        dims = {"Smart": smart, "Grit": grit, "Build": build}
        weakest = min(dims, key=dims.get)
        strongest = max(dims, key=dims.get)

    applications = []
    folder = get_profile_folder_path(email)
    if folder:
        try:
            app_path = os.path.join(folder, "applications.json")
            if os.path.isfile(app_path):
                with open(app_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    applications = data.get("applications", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        except Exception:
            pass

    app_counts = {"saved": 0, "applied": 0, "interviewing": 0, "offer": 0, "rejected": 0}
    for a in applications:
        s = a.get("status", "saved")
        if s in app_counts: app_counts[s] += 1

    interviewing_at = [a.get("company") for a in applications if a.get("status") == "interviewing" and a.get("company")]
    applied_companies = [a.get("company") for a in applications if a.get("status") == "applied" and a.get("company")]
    silent_apps = []
    for a in applications:
        if a.get("status") == "applied" and a.get("applied_at"):
            try:
                from datetime import datetime
                ad = datetime.fromisoformat(a["applied_at"].replace("Z", "+00:00"))
                days = (time.time() - ad.timestamp()) / 86400
                if days > 14: silent_apps.append(a.get("company", "Unknown"))
            except Exception: pass

    deadlines = profile.get("deadlines") or []
    upcoming_deadlines = []
    for d in deadlines:
        if not isinstance(d, dict) or d.get("completedAt"): continue
        label = (d.get("label") or d.get("title") or "").strip()
        date_str = d.get("date", "")
        if not label or not date_str: continue
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            days_until = int((dt.timestamp() - time.time()) / 86400)
            if -1 <= days_until <= 30:
                upcoming_deadlines.append({"label": label, "date": date_str[:10], "days_until": days_until, "type": d.get("type", "deadline")})
        except Exception: pass
    upcoming_deadlines.sort(key=lambda x: x["days_until"])

    resume_text = load_parsed_resume_for_voice(email, max_chars=6000) or ""
    has_resume = len(resume_text.strip()) > 50
    has_editor_resume = False

    # ── New context fields from voice/profile ──────────────────────
    beyond_resume = profile.get("beyond_resume") or []
    experience_expansion = profile.get("experience_expansion") or []
    transcript_gpa = profile.get("transcript_gpa")
    transcript_courses = profile.get("transcript_courses") or []
    transcript_honors = profile.get("transcript_honors") or []
    job_locations = profile.get("job_locations") or []
    job_location_scope = profile.get("job_location_scope") or ""
    target_school = profile.get("target_school") or ""
    voice_onboarding_answers = profile.get("voice_onboarding_answers") or []
    voice_biggest_concern = profile.get("voice_biggest_concern") or ""
    pre_professional = profile.get("preProfessional") or profile.get("pre_professional_track") or False
    graduation_year = profile.get("graduation_year") or profile.get("grad_year") or ""

    # Achievements — unlocked achievement names
    achievements_raw = profile.get("achievements") or {}
    unlocked_achievements = [k for k, v in achievements_raw.items() if isinstance(v, dict) and v.get("unlockedAt")] if isinstance(achievements_raw, dict) else []

    # Dilly Profile facts — everything Dilly has learned about this user
    profile_facts_text = ""
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = get_memory_surface(email)
        facts = surface.get("items") or []
        narrative = surface.get("narrative") or ""
        if facts:
            grouped: dict[str, list] = {}
            for f in facts:
                cat = f.get("category", "other")
                if cat not in grouped:
                    grouped[cat] = []
                grouped[cat].append(f)
            lines = []
            cat_labels = {
                "achievement": "Achievements", "goal": "Goals", "target_company": "Target Companies",
                "skill_unlisted": "Skills (not on resume)", "project_detail": "Projects (beyond resume)",
                "motivation": "What drives them", "personality": "Personality & style",
                "soft_skill": "Soft skills", "hobby": "Interests & hobbies",
                "life_context": "Background & life context", "company_culture_pref": "Workplace preferences",
                "strength": "Strengths", "weakness": "Growth areas", "challenge": "Challenges",
                "availability": "Availability", "preference": "Preferences",
                "concern": "Concerns", "deadline": "Deadlines", "interview": "Interviews",
                "rejection": "Rejections", "mentioned_but_not_done": "Said they'd do but haven't",
                "person_to_follow_up": "People to follow up with",
            }
            for cat, items in grouped.items():
                label = cat_labels.get(cat, cat.replace("_", " ").title())
                entries = "; ".join(f"{i['label']}: {i['value']}" for i in items[:8])
                lines.append(f"  {label}: {entries}")
            profile_facts_text = "\n".join(lines)
    except Exception:
        pass
    if folder:
        has_editor_resume = os.path.isfile(os.path.join(folder, "resume_edited.json"))

    nudges = []
    for dl in upcoming_deadlines:
        if dl.get("type") == "interview" and dl["days_until"] <= 1:
            nudges.append({"priority": "urgent", "message": f"You have an interview{'  today' if dl['days_until'] == 0 else ' tomorrow'}: {dl['label']}. Want me to help you prep?"})
    for dl in upcoming_deadlines:
        if dl.get("type") != "interview" and 0 <= dl["days_until"] <= 2:
            nudges.append({"priority": "high", "message": f"Your deadline '{dl['label']}' is {'today' if dl['days_until'] == 0 else 'tomorrow' if dl['days_until'] == 1 else 'in 2 days'}."})
    if days_since_audit and days_since_audit > 14:
        nudges.append({"priority": "medium", "message": f"It's been {days_since_audit} days since your last audit. Your resume may have changed. Want to run a new one?"})
    if silent_apps:
        nudges.append({"priority": "medium", "message": f"No response from {', '.join(silent_apps[:3])} in 2+ weeks. Want help drafting a follow-up?"})
    if gap and gap > 0 and weakest:
        nudges.append({"priority": "medium", "message": f"You're {int(gap)} points below the {reference_company} bar. Your {weakest} score is the biggest opportunity."})
    if sum(app_counts.values()) == 0 and current_score is not None:
        nudges.append({"priority": "low", "message": "You haven't added any applications yet. Want me to help you build your pipeline?"})

    # Pull per-cohort scores from the students DB so AI knows exact field-by-field breakdown
    cohort_scores_for_ai: dict = {}
    try:
        import psycopg2, psycopg2.extras as _pge, json as _json
        _pw = os.environ.get("DILLY_DB_PASSWORD", "")
        if not _pw:
            try: _pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
            except: pass
        _sc = psycopg2.connect(
            host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
            database="dilly", user="dilly_admin", password=_pw, sslmode="require"
        )
        _scur = _sc.cursor(cursor_factory=_pge.RealDictCursor)
        _scur.execute("SELECT cohort_scores FROM students WHERE LOWER(email) = LOWER(%s)", (email,))
        _srow = _scur.fetchone()
        if _srow and _srow["cohort_scores"]:
            cs = _srow["cohort_scores"]
            if isinstance(cs, str):
                cs = _json.loads(cs)
            cohort_scores_for_ai = cs or {}
        _sc.close()
    except Exception:
        pass

    return {
        "name": name, "first_name": first_name, "cohort": cohort, "school": school,
        "major": major, "minor": minor,
        "majors_list": majors_list, "minors_list": minors_list, "interests_list": interests_list,
        "cohort_scores": cohort_scores_for_ai,
        "pronouns": pronouns, "career_goal": career_goal,
        "industry_target": industry_target, "target_companies": target_companies,
        "tagline": tagline, "bio": bio, "linkedin": linkedin,
        "current_score": current_score, "smart": smart, "grit": grit, "build": build,
        "previous_score": previous_score, "score_delta": score_delta,
        "weakest_dimension": weakest, "strongest_dimension": strongest,
        "cohort_bar": bar, "reference_company": reference_company,
        "gap": gap, "cleared_bar": cleared_bar, "dilly_take": dilly_take,
        "audit_count": audit_count, "days_since_audit": days_since_audit,
        "audit_history": audit_history,
        "app_counts": app_counts, "total_applications": sum(app_counts.values()),
        "interviewing_at": interviewing_at, "applied_companies": applied_companies[:10],
        "silent_apps": silent_apps,
        "upcoming_deadlines": upcoming_deadlines[:10],
        "has_resume": has_resume, "has_editor_resume": has_editor_resume,
        "resume_snippet": resume_text[:5000] if resume_text else "",
        "nudges": nudges,
        "profile_facts_text": profile_facts_text,
        "beyond_resume": beyond_resume,
        "experience_expansion": experience_expansion,
        "transcript_gpa": transcript_gpa,
        "transcript_courses": transcript_courses,
        "transcript_honors": transcript_honors,
        "job_locations": job_locations,
        "job_location_scope": job_location_scope,
        "target_school": target_school,
        "voice_onboarding_answers": voice_onboarding_answers,
        "voice_biggest_concern": voice_biggest_concern,
        "achievements": unlocked_achievements,
        "preProfessional": pre_professional,
        "graduation_year": graduation_year,
        # The path the user picked during onboarding — drives AI tone,
        # resume shape, and which filters are shown in the UI.
        "user_path": (profile.get("user_path") or "").strip().lower(),
        # Explicit app_mode override ('holder' | 'seeker' | 'student' | None).
        # Derived from profile; when None, _build_rich_system_prompt falls
        # back to deriving from user_path.
        "app_mode": (profile.get("app_mode") or "").strip().lower() or None,
        "is_student": bool(
            (profile.get("user_type") or "").strip().lower() not in ("general", "professional")
            and (profile.get("user_path") or "").strip().lower() not in ("dropout", "senior_reset", "career_switch", "exploring")
        ),
        "years_experience": profile.get("years_experience") or 0,
        "most_recent_role": profile.get("most_recent_role") or "",
        "most_recent_industry": profile.get("most_recent_industry") or "",
        "self_taught_skills": profile.get("self_taught_skills") or [],
        # Holder-specific fields. Without these passed through, the
        # holder target_block and mode_block could not name the user's
        # actual role — Dilly would have a holder tone but no idea
        # what job the person has, so every answer sounded generic.
        "current_role":         profile.get("current_role") or "",
        "current_company":      profile.get("current_company") or "",
        "current_job_title":    profile.get("current_job_title") or "",
        "title":                profile.get("title") or "",
        # Life events — the user clicked "I got laid off" / "I got a
        # new job" from Settings. Captured by mode-switch.tsx. Pass
        # through to the system prompt so the coach opens context-
        # aware ("congratulations on the new role at X" / "I'm sorry
        # you were let go, let's plan") rather than pretending the
        # pivot didn't happen. Kept out of the public web profile.
        "life_events":          profile.get("life_events") or [],
    }


def _build_rich_system_prompt(r: dict) -> str:
    name = r.get("name", "the student")
    cohort = r.get("cohort", "General")
    school = r.get("school", "their university")
    major = r.get("major", "")
    score = r.get("current_score")
    smart = r.get("smart", 0)
    grit = r.get("grit", 0)
    build = r.get("build", 0)
    bar = r.get("cohort_bar", 65)
    ref_company = r.get("reference_company", "top companies")
    gap = r.get("gap")
    cleared = r.get("cleared_bar", False)
    weakest = r.get("weakest_dimension")
    strongest = r.get("strongest_dimension")
    delta = r.get("score_delta")
    days_since = r.get("days_since_audit")
    dilly_take = r.get("dilly_take", "")
    apps = r.get("app_counts", {})
    total_apps = r.get("total_applications", 0)
    interviewing = r.get("interviewing_at", [])
    silent = r.get("silent_apps", [])
    deadlines = r.get("upcoming_deadlines", [])
    resume_snippet = r.get("resume_snippet", "")
    audit_history = r.get("audit_history", [])
    career_goal = r.get("career_goal", "")
    industry = r.get("industry_target", "")
    target_companies = r.get("target_companies", [])

    # Resolve user path + app mode up front so blocks defined below
    # can branch on them. Path comes from profile.user_path (set during
    # onboarding); mode is either the explicit profile.app_mode override
    # (set from Settings or the holder onboarding path) or derived from
    # user_path. Keeping this mirror of the logic below was a bug, so
    # hoisting it to the top of the function.
    _user_path = (r.get("user_path") or "").strip().lower() or (
        "student" if r.get("is_student") else "exploring"
    )
    _explicit_mode = (r.get("app_mode") or "").strip().lower()
    if _explicit_mode in ("holder", "seeker", "student"):
        _app_mode = _explicit_mode
    elif _user_path == "i_have_a_job":
        _app_mode = "holder"
    elif _user_path == "student":
        _app_mode = "student"
    else:
        _app_mode = "seeker"

    score_block = ""
    if score is not None:
        score_block = f"CURRENT SCORE: {int(score)}/100\nDimensions: Smart {int(smart)}, Grit {int(grit)}, Build {int(build)}\nCohort bar ({ref_company}): {int(bar)}/100\n"
        if cleared:
            score_block += "ABOVE the bar. Recruiter ready.\n"
        else:
            score_block += f"BELOW the bar by {int(gap)} points. {weakest} is the weakest dimension.\n"
        if strongest: score_block += f"Strongest dimension: {strongest}\n"
        if delta: score_block += f"Score changed by {'+' if delta > 0 else ''}{int(delta)} since last audit.\n"
        if days_since: score_block += f"Last audited {days_since} days ago.\n"
        if dilly_take: score_block += f"Last audit insight: {dilly_take}\n"
    else:
        score_block = "NO SCORE YET. Student has not run their first audit.\n"

    # Holders aren't tracking applications — suppress the pipeline and
    # deadline blocks so the model isn't primed to ask about interview
    # status or "the next application." For seekers/students we keep
    # the full context.
    apps_block = ""
    if _app_mode != "holder":
        if total_apps > 0:
            apps_block = f"APPLICATION PIPELINE: {total_apps} total\nSaved: {apps.get('saved',0)} | Applied: {apps.get('applied',0)} | Interviewing: {apps.get('interviewing',0)} | Offers: {apps.get('offer',0)} | Rejected: {apps.get('rejected',0)}\n"
            if interviewing: apps_block += f"Currently interviewing at: {', '.join(interviewing)}\n"
            if silent: apps_block += f"WARNING: No response from {', '.join(silent[:3])} in 2+ weeks.\n"
        else:
            apps_block = "APPLICATION PIPELINE: Empty. Student hasn't started tracking applications.\n"

    deadline_block = ""
    if _app_mode != "holder":
        if deadlines:
            dl_lines = []
            for dl in deadlines[:5]:
                days = dl["days_until"]
                urgency = "TODAY" if days == 0 else "TOMORROW" if days == 1 else f"in {days} days"
                dl_lines.append(f"  - {dl['label']} ({urgency}, {dl['date']})")
            deadline_block = "UPCOMING DEADLINES:\n" + "\n".join(dl_lines) + "\n"
        else:
            deadline_block = "UPCOMING DEADLINES: None scheduled.\n"

    # CAREER TARGETS block — only relevant for seekers and students.
    # Holders don't have "target companies"; they have a company they
    # already work at. Feeding that block into a holder prompt primes
    # the model to talk like a coach helping someone apply.
    target_block = ""
    if _app_mode != "holder":
        parts = []
        if career_goal: parts.append(f"Career goal: {career_goal}")
        if industry: parts.append(f"Industry target: {industry}")
        if target_companies: parts.append(f"Target companies: {', '.join(target_companies[:5])}")
        if parts: target_block = "CAREER TARGETS:\n" + "\n".join(f"  - {p}" for p in parts) + "\n"
    else:
        # Holder: surface their CURRENT role instead. Comes from
        # profile.current_role / current_job_title / title (set during
        # holder onboarding + threat-report flow).
        current_role = (r.get("current_role") or r.get("current_job_title") or r.get("title") or "").strip()
        if current_role:
            target_block = f"CURRENT ROLE: {current_role}\n"

    history_block = ""
    if len(audit_history) > 1:
        h_lines = [f"  - {h.get('date','?')}: {h.get('score','?')}/100" for h in audit_history[:5]]
        history_block = "SCORE HISTORY:\n" + "\n".join(h_lines) + "\n"

    resume_block = f"FULL RESUME TEXT (reference specific bullets and sections — never ask what is on their resume):\n{resume_snippet[:5000]}\n" if resume_snippet else ""

    profile_facts = r.get("profile_facts_text", "")
    profile_block = ""
    if profile_facts:
        profile_block = f"""DILLY PROFILE (what you've learned about this student beyond their resume — from conversations, onboarding, and their own additions. Reference these naturally. NEVER re-ask things you already know here):
{profile_facts}
"""

    # ── Academic profile block ────────────────────────────────────
    academic_parts: list[str] = []
    if r.get("transcript_gpa"):
        academic_parts.append(f"GPA: {r['transcript_gpa']}")
    if r.get("graduation_year"):
        academic_parts.append(f"Graduation year: {r['graduation_year']}")
    if r.get("preProfessional"):
        pre = r["preProfessional"]
        label = pre if isinstance(pre, str) else "Yes"
        academic_parts.append(f"Pre-professional track: {label}")
    if r.get("target_school"):
        academic_parts.append(f"Target graduate/professional school: {r['target_school']}")
    if r.get("transcript_courses"):
        academic_parts.append(f"Key courses: {', '.join(str(c) for c in r['transcript_courses'][:10])}")
    if r.get("transcript_honors"):
        academic_parts.append(f"Honors/Awards: {', '.join(str(h) for h in r['transcript_honors'][:10])}")
    academic_block = ""
    if academic_parts:
        academic_block = "ACADEMIC PROFILE:\n" + "\n".join(f"  - {p}" for p in academic_parts) + "\n"

    # ── Beyond resume block ───────────────────────────────────────
    beyond_block = ""
    beyond_resume = r.get("beyond_resume") or []
    experience_expansion = r.get("experience_expansion") or []
    if beyond_resume or experience_expansion:
        br_lines: list[str] = []
        if beyond_resume:
            by_type: dict[str, list[str]] = {}
            for item in beyond_resume:
                if not isinstance(item, dict):
                    continue
                t = (item.get("type") or "other").strip().lower()
                text = (item.get("text") or "").strip()[:120]
                if text:
                    by_type.setdefault(t, []).append(text)
            for t_name, label in [("skill", "Skills"), ("project", "Projects"), ("experience", "Experiences"), ("person", "People mentioned"), ("company", "Companies"), ("other", "Other")]:
                if t_name in by_type:
                    br_lines.append(f"  - {label}: {', '.join(by_type[t_name][:15])}")
        if experience_expansion:
            for entry in experience_expansion[:6]:
                if not isinstance(entry, dict):
                    continue
                role = (entry.get("role_label") or "").strip()
                org = (entry.get("organization") or "").strip()
                label_exp = f"{role} at {org}" if org else role
                if not label_exp:
                    continue
                sub: list[str] = []
                skills = [s for s in (entry.get("skills") or []) if s][:10]
                tools = [t for t in (entry.get("tools_used") or []) if t][:10]
                if skills:
                    sub.append("skills: " + ", ".join(str(s) for s in skills))
                if tools:
                    sub.append("tools: " + ", ".join(str(t) for t in tools))
                if sub:
                    br_lines.append(f"  - {label_exp}: {'; '.join(sub)}")
        if br_lines:
            beyond_block = "BEYOND THE RESUME (captured skills, tools, projects from conversations):\n" + "\n".join(br_lines) + "\n"

    # ── Preferences block ─────────────────────────────────────────
    pref_parts: list[str] = []
    if r.get("job_locations"):
        pref_parts.append(f"Preferred work locations: {', '.join(str(l) for l in r['job_locations'][:8])}")
    if r.get("job_location_scope"):
        pref_parts.append(f"Location scope: {r['job_location_scope']}")
    if r.get("voice_biggest_concern"):
        pref_parts.append(f"Biggest concern: {r['voice_biggest_concern'][:200]}")
    pref_block = ""
    if pref_parts:
        pref_block = "PREFERENCES:\n" + "\n".join(f"  - {p}" for p in pref_parts) + "\n"

    # ── Achievements block ────────────────────────────────────────
    achievements_block = ""
    achievements = r.get("achievements") or []
    if achievements:
        achievements_block = f"UNLOCKED ACHIEVEMENTS: {', '.join(str(a) for a in achievements[:15])}. Celebrate these when relevant.\n"

    # ── Cohort expertise block ────────────────────────────────────
    cohort_expertise_block = ""
    try:
        from projects.dilly.api.voice_prompt_constants import COHORT_EXPERTISE_DEEP
        from projects.dilly.academic_taxonomy import MAJOR_TO_COHORT
        # Resolve rich cohorts from major/minor
        rich_cohorts: list[str] = []
        seen_cohorts: set[str] = set()
        track_to_rich: dict[str, str] = {
            "Tech": "Software Engineering & CS", "Finance": "Finance & Accounting",
            "Consulting": "Consulting & Strategy", "Business": "Management & Operations",
            "Science": "Life Sciences & Research", "Pre-Health": "Healthcare & Clinical",
            "Pre-Law": "Law & Government", "Communications": "Media & Communications",
            "Education": "Education", "Arts": "Design & Creative Arts",
            "Humanities": "Humanities & Liberal Arts",
        }
        if cohort in track_to_rich:
            c = track_to_rich[cohort]
            if c not in seen_cohorts:
                seen_cohorts.add(c)
                rich_cohorts.append(c)
        for m in ([major] if major else []):
            c = MAJOR_TO_COHORT.get(m)
            if c and c != "General" and c not in seen_cohorts:
                seen_cohorts.add(c)
                rich_cohorts.append(c)
        if rich_cohorts:
            ce_lines = [f"You have deep expertise in {', '.join(rich_cohorts)}."]
            for rc in rich_cohorts[:3]:
                expertise = COHORT_EXPERTISE_DEEP.get(rc)
                if expertise:
                    ce_lines.append(expertise[:500])
            cohort_expertise_block = "FIELD EXPERTISE:\n" + "\n".join(ce_lines) + "\n"
    except Exception:
        pass

    # Honest Mirror state block — attached to /ai/chat requests from
    # mobile so Dilly can answer "what does my mirror say" with real
    # data instead of hedging. Only materializes when the client sends
    # arena_state.honest_mirror — no effect otherwise.
    honest_mirror_block = ""
    try:
        _arena = r.get("arena_state") or {}
        _hm = _arena.get("honest_mirror") if isinstance(_arena, dict) else None
        if _hm and isinstance(_hm, dict):
            _have = _hm.get("have_items") or []
            _miss = _hm.get("missing_items") or []
            _total = _hm.get("total") or (len(_have) + len(_miss))
            _have_n = _hm.get("have") or len(_have)
            _sn = _hm.get("short_name") or "their field"
            honest_mirror_block = (
                "HONEST MIRROR (your visibility into the user's rubric for "
                f"{_sn}, {_have_n}/{_total} covered):\n"
                + (f"  Proving: {', '.join(_have[:8])}\n" if _have else "  Proving: (nothing yet)\n")
                + (f"  Still needs evidence: {', '.join(_miss[:8])}\n" if _miss else "  Still needs evidence: (none — all covered)\n")
                + "When the user asks about their Honest Mirror, use these exact items. Never say you can't see it.\n"
            )
    except Exception:
        pass

    # Build identity block with full majors / minors / interests / cohort scores
    _majors_list = r.get("majors_list") or ([major] if major else [])
    _minors_list = r.get("minors_list") or ([r.get("minor")] if r.get("minor") else [])
    _interests_list = r.get("interests_list") or []
    _cohort_scores = r.get("cohort_scores") or {}

    _major_str = ", ".join(_majors_list) if _majors_list else "Not specified"
    _minor_str = ", ".join(_minors_list) if _minors_list else "None"
    _interest_str = ", ".join(_interests_list) if _interests_list else "None listed"

    # Per-cohort scores block (only if we have Claude-scored entries)
    _cohort_scores_block = ""
    if _cohort_scores:
        _cs_lines = []
        for _cname, _cv in _cohort_scores.items():
            if not isinstance(_cv, dict):
                continue
            _lvl = _cv.get("level", "")
            _s = _cv.get("smart", "?")
            _g = _cv.get("grit", "?")
            _b = _cv.get("build", "?")
            _d = _cv.get("dilly_score", "?")
            _cs_lines.append(f"  - {_cname} ({_lvl}): Smart {_s}, Grit {_g}, Build {_b}, Overall {_d}")
        if _cs_lines:
            _cohort_scores_block = "PER-COHORT SCORES (how the student scores in each of their fields):\n" + "\n".join(_cs_lines) + "\nUse these when asked about scores by field. Never say 'major unknown'.\n"

    # ── Path-specific tone (student / dropout / career-switch / senior / exploring)
    # This adapts Dilly's conversational register to who the user actually is.
    # _user_path + _app_mode are resolved at the top of this function so the
    # earlier blocks (apps_block, deadline_block, target_block) can branch
    # on them. The per-mode persona block + per-path tone block below layer
    # on top — mode framing first, path flavor second.

    # Compact mode blocks. Was ~600 tokens combined, now ~200.
    # The holder NEVER list is the critical tone guard — kept intact
    # because it's what stops Dilly from talking to holders like
    # job-seekers. Other framing compressed to essentials.
    _mode_block = {
        "holder": (
            "USER HAS A JOB. Not hunting. "
            "NEVER: suggest they apply, 'next opportunity/role', cheerleader phrases, "
            "call them candidate/student, suggest building profile or uploading resume. "
            "VOICE: peer strategist. Answer what they asked. Push back. Specific moves, not generic."
        ),
        "seeker": (
            "User is looking for a role. Honest coach, not hype man. "
            "Celebrate real wins only. One move at a time. Warm, direct, specific."
        ),
        "student": (
            "Student. Sharp friend who made it. "
            "already made it. Teach gently when they need it. Celebrate "
            "small wins — first interview, first offer, first 'no' that "
            "taught them something. Be encouraging without being fluffy. "
            "Assume they are new to interviews, applications, and the "
            "unwritten rules of work. Explain the unwritten rules when it "
            "matters, without being condescending."
        ),
    }.get(_app_mode, "")
    _tone_block = {
        "student": (
            "WHO THEY ARE:\n"
            "A college student building their career. Talk to them as a sharp, caring friend "
            "who believes in them. Encouraging but never fluffy. They have time. "
            "Assume they are new to interviews, applications, and the job market. "
            "Teach gently when they need it. Celebrate small wins."
        ),
        "dropout": (
            "WHO THEY ARE:\n"
            "NOT in college. They left school or skipped it entirely and they are "
            "BUILDING their career without a degree. Never ask what year of school "
            "they are in. Never assume they have a GPA. Never mention graduation. "
            "The Education section in their resume is called Training and contains "
            "self-taught skills, bootcamps, and certifications instead.\n"
            "TALK TO THEM like someone who respects that path. Self-taught skills, "
            "side projects, freelance gigs, and on-the-job learning are real "
            "experience to you. Reframe gaps as time spent building. When the "
            "traditional path does not apply, say so and find the non-traditional "
            "path. Focus on companies that do not require degrees."
        ),
        "career_switch": (
            "WHO THEY ARE:\n"
            "Switching careers. They have real work experience somewhere else and "
            "are pivoting into a new field. Their resume is rich but wrong-shaped "
            "for where they are going. Never treat them like a beginner. They are "
            "learning a new domain but bringing years of professional context. "
            "Help them translate their old experience into the new field's "
            "language. Highlight transferable skills. Be frank about what gaps "
            "they need to close and what to skip because experience covers it."
        ),
        "senior_reset": (
            "WHO THEY ARE:\n"
            "A senior professional between jobs. Often laid off after many years "
            "at one company. They have 10+ years of deep expertise, relationships, "
            "and judgment. They are also rusty, hurting, and probably shaken.\n"
            "BE REASSURING. Nothing they built is wasted. The market needs people "
            "who have done this for 20 years. Remind them that experience and "
            "judgment are the things AI cannot replicate, which puts them in a "
            "stronger position than the market makes them feel. Never be cheerful "
            "or bubbly. Warm, calm, grounded, confident in their value. Avoid "
            "any language that sounds like you are talking to a new grad. Do not "
            "mention GPA, graduation year, internships, or 'entry level' anything. "
            "Their resume runs two pages and that is fine."
        ),
        "veteran": (
            "WHO THEY ARE:\n"
            "A military veteran transitioning to civilian career. They led real "
            "teams under real pressure. They ran logistics, managed budgets, made "
            "decisions with consequences. None of that is on their resume in a "
            "way civilian recruiters can parse, because recruiters don't read "
            "MOS codes or military rank.\n"
            "TALK TO THEM like a civilian mentor who respects what they did. "
            "Help them translate: 'squad leader' becomes 'managed team of 10,' "
            "'E-5' becomes 'mid-level leadership,' 'operated under combat "
            "conditions' becomes 'made critical decisions under pressure.' Never "
            "be performative or 'thank you for your service' bubbly. Be matter-"
            "of-fact. They don't need ceremony, they need translation. Acknowledge "
            "when a skill from service maps directly to a civilian role and say "
            "so plainly."
        ),
        "parent_returning": (
            "WHO THEY ARE:\n"
            "Returning to work after 2+ years home raising children. Their resume "
            "has a gap that career tools mark as a negative. They are probably "
            "nervous, rusty, and wondering if anyone still wants to hire them.\n"
            "TALK TO THEM with warmth and confidence in their value. The years "
            "at home were not wasted. Parenting is project management under "
            "budget constraints with zero sleep, negotiation, conflict resolution, "
            "operational planning. Those are real transferable skills. Help them "
            "name them. Reframe the gap as 'Family leadership period, 2018-2024' "
            "if they want. Focus on employers known for flex, remote, and return-"
            "to-work programs. Never sound condescending and never make them feel "
            "like they have to apologize for the gap."
        ),
        "formerly_incarcerated": (
            "WHO THEY ARE:\n"
            "A returning citizen re-entering the workforce. They are almost "
            "certainly self-conscious about the gap and about what to disclose "
            "when. They've been treated badly by most systems they've encountered.\n"
            "TALK TO THEM with total respect and zero judgment. Do not mention "
            "the past unless they do first. Help them build a resume that "
            "emphasizes everything they've built since release: certifications "
            "earned inside, work programs, volunteer experience, education "
            "completed. Focus on fair-chance employers. Coach them on the "
            "disclosure question only when they ask about it: it's legal to "
            "ask about background in most states but they have a right to a "
            "fair interview first. Direct, calm, zero performative pity."
        ),
        "international_grad": (
            "WHO THEY ARE:\n"
            "A student or recent grad on an F-1 visa, probably on OPT now, "
            "trying to stay in the US. Their biggest filter is visa sponsorship. "
            "They've probably applied to hundreds of jobs that won't sponsor "
            "and wasted months of their OPT clock.\n"
            "TALK TO THEM like someone who gets the visa reality. Never tell "
            "them to just apply broadly. Surface employers with confirmed "
            "sponsorship history. Coach them on when and how to disclose visa "
            "status in the application process. Acknowledge the clock they're "
            "on. Their resume should skip 'immigration status' language but "
            "should be formatted to the US conventions their home country "
            "resumes often aren't — no photo, one page for early career, "
            "reverse-chronological."
        ),
        "neurodivergent": (
            "WHO THEY ARE:\n"
            "ADHD, autism, dyslexia, or similar. Their cognition is different "
            "and career tools almost universally assume typical cognition. "
            "Interviews reward verbal agility and social script reading they "
            "may find draining or confusing.\n"
            "TALK TO THEM with extreme clarity. No metaphors unless asked. No "
            "small talk. Short, direct, concrete. Tell them the what, then the "
            "why, then the how, in that order. When they ask a question, answer "
            "the actual question before adding context. Their strengths are "
            "often pattern recognition, deep focus, systems thinking — surface "
            "those in their resume. Help them prep for interviews with literal "
            "scripts they can adapt, not vibes."
        ),
        "first_gen_college": (
            "WHO THEY ARE:\n"
            "First in their family to go to college, or first to try for a "
            "white-collar career. Nobody at home can answer 'should I follow "
            "up after the interview?' They've figured out most things alone. "
            "They're probably high-performing but feel like imposters.\n"
            "TALK TO THEM like the mentor they never had. Explain the unwritten "
            "rules nobody ever told them: networking isn't schmoozing, a thank-"
            "you email matters, LinkedIn recruiters aren't scammers, business "
            "casual is not a suit. Never assume they know the jargon — unpack "
            "it the first time. Celebrate their work. Many of them have worked "
            "jobs to pay tuition, which is huge resume material and they often "
            "don't know it."
        ),
        "disabled_professional": (
            "WHO THEY ARE:\n"
            "Has a visible or invisible disability. Every career tool either "
            "ignores accommodations or treats them as an awkward add-on. They've "
            "probably been ghosted by employers who noticed something.\n"
            "TALK TO THEM with total directness and zero pity. Their work is "
            "what matters. When they ask about accommodations, know the answer: "
            "you don't have to disclose before an offer in most states, ADA "
            "protects the interview, you can request accommodations for the "
            "interview itself. Surface employers certified through Disability:IN "
            "and similar inclusion programs. Never suggest they 'work around' "
            "their disability in their resume."
        ),
        "trades_to_white_collar": (
            "WHO THEY ARE:\n"
            "A skilled trade worker (electrician, welder, carpenter, HVAC, etc.) "
            "pivoting into office/tech/management roles. Their experience is "
            "deeply practical but looks nothing like a standard resume.\n"
            "TALK TO THEM with zero condescension. They solved real problems "
            "every day and managed customers, safety, supplies, schedules. "
            "Translate trade experience into professional language: 'read "
            "blueprints' becomes 'interpreted technical specifications,' "
            "'trained apprentices' becomes 'onboarded and mentored junior "
            "staff.' Their safety record and compliance background are gold "
            "for regulated industries. Never talk down. Help them see how "
            "much leadership experience they already have."
        ),
        "lgbtq": (
            "WHO THEY ARE:\n"
            "LGBTQ+ professional looking for workplaces where being out is safe "
            "and normal. Every career tool they've used has ignored this filter "
            "entirely.\n"
            "TALK TO THEM like someone who gets that workplace culture is part "
            "of the job, not a bonus. Surface employers with real track records "
            "on inclusion (HRC Corporate Equality Index perfect scorers, ERGs, "
            "non-discrimination policies including gender identity). Never "
            "force them to disclose on a resume. When they ask about inclusive "
            "employers in a city, answer with specifics. Direct, warm, never "
            "performative."
        ),
        "rural_remote_only": (
            "WHO THEY ARE:\n"
            "Can't relocate for work. Living rural, small-town, or "
            "family-anchored. Most job platforms won't filter remote-only "
            "properly and they spend hours scrolling past in-office roles.\n"
            "TALK TO THEM with respect for their constraint. 'Remote-only' "
            "isn't a weakness, it's a filter. Many companies are "
            "fully-distributed now. Help them target companies that are "
            "remote-first, not 'hybrid with three days in the office.' Be "
            "direct about which roles are realistic for remote and which "
            "aren't. Don't push them toward relocation if they've said they "
            "can't."
        ),
        "refugee": (
            "WHO THEY ARE:\n"
            "Refugee or asylum seeker. New to working in a system that looks "
            "nothing like their home country's. English might be their second "
            "or third language. Credentials from their home country may not "
            "transfer. They have real experience but no resume that "
            "a US recruiter can read.\n"
            "TALK TO THEM with warmth and respect. Keep language simple, "
            "concrete, and jargon-free. Never assume they know US workplace "
            "conventions (networking, LinkedIn, follow-up emails, interview "
            "small talk) — explain each thing the first time. Help them "
            "translate prior experience: 'assistant to the mayor' maps to "
            "'government operations staff.' Surface employers known for "
            "hiring refugees (Tent Coalition partners, Upwardly Global, "
            "Tysons Corner-type regional employers)."
        ),
        "ex_founder": (
            "WHO THEY ARE:\n"
            "Former founder or long-time freelancer/solopreneur returning to "
            "employment. They ran a business, hired people, made hard calls, "
            "sold things, shipped things. Their resume looks like a gap "
            "because it wasn't a W-2.\n"
            "TALK TO THEM like a peer, not a candidate. They've done more than "
            "most hiring managers have. Help them reframe founder work as real "
            "experience: 'bootstrapped a 3-person team,' 'grew revenue from "
            "$0 to $X,' 'shipped product used by Y customers.' Surface "
            "companies that value operator DNA (early stage startups, PM roles "
            "at scale-ups, ops leadership). Be direct about which roles want "
            "founders vs. which will be suspicious of them — some big cos are "
            "wary of ex-founders as 'flight risks.'"
        ),
        "exploring": (
            "WHO THEY ARE:\n"
            "Figuring out what they want. No specific path locked in yet. Curious, "
            "probably looking at several directions. Do not push them into one "
            "lane. Ask what they are thinking, surface options, let them steer."
        ),
    }.get(_user_path, "")

    # Today's date is injected so the add_calendar_event tool can resolve
    # relative phrases the user says ("the 3rd", "Monday", "next month",
    # "in 2 weeks") into an absolute ISO date. Without this, Haiku
    # guesses the year wrong and writes events to the wrong calendar slot.
    from datetime import datetime as _dt
    _today = _dt.utcnow().strftime("%Y-%m-%d")
    _today_human = _dt.utcnow().strftime("%A, %B %d, %Y")

    # Mode-aware surface description. For holders we hide the whole
    # seeker apparatus (Tracker, Tailor Resume, Interview Practice, fit
    # narratives, What We Think) because they're not hunting and
    # mentioning those surfaces makes Dilly sound off-register. For
    # everyone else, the seeker/student surfaces stay in. Keep the
    # universal rules (no scores, no audits, no leaderboard) constant.
    # Ultra-compact context blocks — every token saved here bills back
    # to margin per user. Holders get strategist framing; seekers get
    # job-hunt framing. NEVER lists are the critical bit (prevent
    # wrong-surface suggestions). Pushed dense; was ~250 tokens,
    # now ~60.
    if _app_mode == "holder":
        _what_dilly_is_block = (
            "DILLY: career strategist. User has a job. "
            "NEVER suggest applying, 'next role', resume editor, scores, audits. "
            "Surfaces: Career Center, Field (AI impact), Market (BLS comp), "
            "My Career, Calendar."
        )
        _app_features_block = ""  # merged above
    else:
        _what_dilly_is_block = (
            "DILLY: career coach. "
            "Writes fit narratives on jobs. Tailors resumes per ATS. "
            "Surfaces: Career Center, Jobs, AI Arena, My Dilly, Skills, What We Think.\n\n"
            "AI ARENA TOOLS (you know what each one is, can suggest them by name):\n"
            " • Market Value Live — live comp band + anchor-company pressure for holders.\n"
            " • Conviction Builder — seekers' 'why you, why this' story engine.\n"
            " • Future Pulse — a lived-in day-in-the-life in the student's target field.\n"
            " • Threat Radar — ranked AI/automation risks to the user's role.\n"
            " • Ghost Report — which applications have gone dark and what to do.\n"
            " • Reputation Builder — public-profile and referral growth moves.\n"
            " • Next Role — ladder above the user's current title with comp deltas.\n"
            " • Hook — one-sentence openers that match the job they're targeting.\n"
            " • Offer Coach — negotiation scripts, counter floors, comp anchors.\n"
            " • Rejections — pattern-reads a user's rejection history for signal.\n"
            " • Clock — time-to-offer pressure read given pipeline + stage.\n"
            " • Honest Mirror — blunt reflection of strengths, blind spots, growth edges based on the user's own profile.\n"
            " • Postmortem — dissect a specific failed interview / application.\n"
            " • Cold Email — drafts + sharpening for recruiter/hiring-manager outreach.\n"
            " • Recruiter Radar — which companies' recruiters are watching the user's public profile.\n\n"
            "When a user asks something that an Arena tool answers, NAME the tool and suggest they open it. Do not invent tools that are not listed above.\n"
            "NEVER: Smart/Grit/Build scores, audits, resume editor, leaderboard."
        )
        _app_features_block = ""

    return f"""You are Dilly, a career advisor who talks like a sharp, caring friend. You can see this person's full profile.

TODAY IS {_today_human} ({_today}). Use this as the anchor for any relative dates
the user mentions ("the 3rd" → the next 3rd of the month after today;
"Monday" → the next Monday; "in 2 weeks" → today + 14 days).

When the user mentions a concrete event with a date anchor (interview,
career fair, deadline, client delivery, meeting, trip), call the
add_calendar_event tool. Do NOT ask for permission. Just do it and keep
talking. If they mention something vague without a date ("I'll apply
eventually"), do not call the tool.

{_mode_block}

{_tone_block}

WHO YOU ARE TALKING TO:
Name: {name}
{f"School: {school}" if school and school != "their university" else ""}
{f"Major(s): {_major_str}" if _major_str != "Not specified" else ""}
{f"Minor(s): {_minor_str}" if _minor_str != "None" else ""}
{f"Field: {cohort}" if cohort and cohort != "General" else ""}
{f"Graduation: {r.get('graduation_year')}" if r.get("graduation_year") else ""}

{apps_block}
{deadline_block}
{target_block}
{profile_block}
{academic_block}
{beyond_block}
{pref_block}
{cohort_expertise_block}
{honest_mirror_block}

{_what_dilly_is_block}

{_app_features_block}

STYLE: Max 3 sentences. No em dashes. Be specific with names. Match the
examples in the persona block above — warm, direct, respond before
asking. One follow-up question, never two. React to what they said
first, then ask.

FORMATTING (the chat bubble renders a markdown subset — use it sparingly,
only when it earns its keep):
 • **word** for the single most important noun or number.
 • *word* for emphasis or a term you are introducing.
 • __word__ for an action the user must take.
 • ~~word~~ when crossing something out (showing what NOT to do).
 • ==word== bold accent — for the one critical insight per message.
 • ==green:word== strengths or above-the-bar signals.
 • ==amber:word== warnings or close calls.
 • ==coral:word== gaps or below-the-bar items.
 • ==blue:word== company names, role titles, or action links.
 • Lines beginning with "- " or "* " render as bullets. Use only when
   listing 3+ discrete items. Never bullet a single sentence.
 • Cap formatting at 2-3 spans per response. Plain text is the default.
 • Never bold an entire sentence. Pick the key word.

CONVERSATION WRAP-UP: Great coaches know when to stop. Don't keep
pulling on a thread forever. Read the energy of the conversation:
 • If the user has answered the core question and picked a direction,
   affirm it, point at ONE concrete next step (open a specific Arena
   tool, tailor a resume for a specific job, add a fact to their
   profile), and STOP asking follow-ups.
 • If the user has said "thanks" / "that helps" / "I'll think about
   it" / "ok" / "sounds good" — do NOT fire another question. Close
   warmly (one sentence), tell them what you'll be watching for next
   time, and leave them the last word.
 • After 6+ user messages on the same topic, start winding down
   naturally. Summarize what you heard, name the one move to take,
   and stop. The user can always come back.
Never end mid-thought with a question that forces another reply.
Feeling "done" with Dilly is part of the product.

RESOURCES: When the user needs to LEARN a tool or concept, offer ONE
real https:// URL you're confident exists. Describe the resource if
unsure — never invent URLs.""".strip()


def _build_system_prompt(mode: str, ctx: Optional[StudentContext] = None, rich: Optional[dict] = None) -> str:
    if mode == "practice":
        company = (rich or {}).get("reference_company") or (ctx.reference_company if ctx else None) or "a top company"
        name = (rich or {}).get("name") or (ctx.name if ctx else None) or "the candidate"
        cohort = (rich or {}).get("cohort") or (ctx.cohort if ctx else None) or "General"
        return (
            f"You are a tough but fair interviewer at {company}. "
            f"You are interviewing {name} for a role in {cohort}.\n\n"
            "RULES:\n"
            "1. Ask ONE question at a time. Wait for their answer.\n"
            "2. After each answer, give 1-2 sentences of direct, honest feedback.\n"
            "3. Then ask your next question. Mix behavioral, technical, and fit questions.\n"
            "4. Be the kind of interviewer who pushes candidates to be specific. "
            "If they give a vague answer, ask a follow-up.\n"
            "5. After 5-6 questions, wrap up with brief overall feedback: "
            "what they did well and what to improve.\n"
            "6. Never use em dashes. Never mention scores, Smart/Grit/Build, or audits.\n\n"
            "Start by introducing yourself (use a realistic name and title) "
            f"and asking your first question about why they want to work at {company}."
        )

    if rich:
        return _build_rich_system_prompt(rich)

    name = (ctx.name if ctx else None) or "there"
    cohort = (ctx.cohort if ctx else None) or ""
    cohort_note = f" Their field is {cohort}." if cohort and cohort != "General" else ""

    return (
        f"You are Dilly, a career advisor and the user's personal career guide. "
        f"You are talking to {name}.{cohort_note}\n\n"
        "WHAT DILLY IS (you must know this):\n"
        "- Dilly builds a deep profile of each user through conversations. Everything they tell you gets saved to their Dilly Profile automatically.\n"
        "- Dilly does NOT score users. There are no Smart/Grit/Build scores. No numbers. No audits.\n"
        "- Instead, when users look at jobs, Dilly writes a personal fit narrative: what they have, what is missing, what to do.\n"
        "- Dilly generates tailored resumes from the user's profile, formatted for the specific ATS the company uses.\n"
        "- The user's Dilly Profile grows every time they talk to you. Ask them about their experiences, skills, goals, and projects.\n"
        "- The app has: Career Center (home), Jobs (with fit narratives), AI Arena (AI readiness), My Dilly (profile), Skills (curated learning), What We Think (insights letter).\n"
        "- AI Arena holds 15 tools: Market Value Live, Conviction Builder, Future Pulse, Threat Radar, Ghost Report, Reputation Builder, Next Role, Hook, Offer Coach, Rejections, Clock, Honest Mirror, Postmortem, Cold Email, Recruiter Radar. When a user asks something one of these answers, suggest that tool by name.\n"
        "- There is NO resume editor, NO score page, NO audit page. Do not reference these.\n\n"
        "YOUR JOB:\n"
        "- Help them with their career: job search, interview prep, skill development, profile building.\n"
        "- Learn about them. Every detail they share makes their profile stronger and their job matches better.\n"
        "- When they ask what to do, give specific actions. Not generic advice.\n"
        "- If their profile is thin, ask questions to learn more about them.\n\n"
        "STYLE RULES (non-negotiable):\n"
        "- Talk like a real conversation. Short sentences. No walls of text.\n"
        "- MAX 3-4 sentences per response. If you need more, break it into a back-and-forth.\n"
        "- Lead with the one thing that matters most. Skip the preamble.\n"
        "- Be specific: name exact skills, companies, or actions. Never generic.\n"
        "- If you need more context, ask ONE question. Don't guess.\n"
        "- Never use em dashes. Use commas, periods, or hyphens.\n"
        "- Never say 'Great question!' or 'That is a good point.' Just answer.\n"
        "- Sound like a friend who happens to be an expert, not a corporate advisor.\n"
        "- Never mention scores, Smart/Grit/Build, audits, or resume scanning. These do not exist in Dilly.\n"
        "- If the user tells you they deleted something from their profile, immediately stop referencing it. Do not bring it up again.\n"
        "- Only reference facts that are currently in the user's profile. If something was discussed earlier in the conversation but the user removed it, treat it as if it never existed.\n\n"
        "FORMATTING (the chat bubble renders a markdown subset — use sparingly):\n"
        "- **word** for the single most important noun/number per paragraph.\n"
        "- *word* for emphasis or a term being introduced.\n"
        "- __word__ for an action the user must take.\n"
        "- ~~word~~ when crossing something out (what NOT to do).\n"
        "- ==word== bold accent for the single critical insight.\n"
        "- ==green:word== strengths · ==amber:word== warnings · ==coral:word== gaps · ==blue:word== company/role names.\n"
        "- Lines beginning with `- ` or `* ` render as bullets. Use only when listing 3+ discrete items.\n"
        "- Cap formatting at 2-3 spans per response. Plain text is fine.\n\n"
        "WRAP-UP: Conversations have a shape. When the user has picked a direction, said 'thanks' / 'ok' / 'sounds good', or the thread has been 6+ user messages on the same topic, STOP asking follow-ups. Affirm what they said, point at ONE concrete next step (a specific Arena tool by name, a resume to tailor, a fact to add), and leave them the last word. Never end mid-thought with a forced question. Feeling 'done' with Dilly is the goal."
    )


def _pick_opening_fact(email: str) -> dict | None:
    """Pick ONE specific, name-able fact from the user's profile for the
    AI's opening line. Preference order: concrete projects > achievements
    > unlisted skills > goals. Returns None if nothing good exists.

    Why this matters: the whole 'first 10 minutes valuable' thing hinges
    on the user feeling like Dilly already knows them. A generic 'what
    are you working on' greeting is the same as every other AI. A
    greeting like 'I saw you built a sentiment analysis tool' is the
    thing that makes them go oh, this actually read my resume."""
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = get_memory_surface(email)
    except Exception:
        return None
    items = (surface or {}).get("items") or []
    # Exclude the always-private stuff so we never open with a vulnerability.
    PRIVATE = {"weakness", "fear", "challenge", "concern",
               "life_context", "areas_for_improvement",
               "personal", "contact", "phone", "email_address"}
    # Priority order: most concrete / most-impressive-sounding first.
    # project_detail and achievement almost always have a specific value
    # the user would recognize. skill_unlisted is only useful if the
    # label looks like a real tech name (not a vague 'strong skills').
    PRIORITY = [
        "project_detail", "project",
        "achievement",
        "experience",
        "skill_unlisted", "technical_skill", "skill",
        "goal",
        "target_company",
        "strength",
    ]
    by_cat: dict[str, list[dict]] = {}
    for it in items:
        cat = (it.get("category") or "").lower()
        if cat in PRIVATE:
            continue
        label = (it.get("label") or "").strip()
        value = (it.get("value") or "").strip()
        if not label and not value:
            continue
        by_cat.setdefault(cat, []).append(it)
    for cat in PRIORITY:
        bucket = by_cat.get(cat) or []
        # Sort within bucket: longest value wins (proxy for "most specific").
        bucket.sort(key=lambda i: len((i.get("value") or "")), reverse=True)
        for it in bucket:
            label = (it.get("label") or "").strip()
            value = (it.get("value") or "").strip()
            # Skip anything too vague to reference.
            if len(label) < 3 and len(value) < 5:
                continue
            return {"category": cat, "label": label, "value": value}
    return None


def _opening_phrase_for_fact(fact: dict) -> str:
    """Turn a picked fact into a short, natural sentence Dilly can open
    with. Phrasing depends on the category so it reads like a person
    noticing, not a bot reciting."""
    cat = (fact.get("category") or "").lower()
    label = (fact.get("label") or "").strip()
    value = (fact.get("value") or "").strip()
    # Prefer the label when it's the concrete thing; fall back to a short
    # clipped value. Never dump a paragraph.
    subject = label or value[:60]
    if cat in ("project_detail", "project"):
        return f"I saw you worked on {subject}"
    if cat == "achievement":
        return f"I saw you {subject.lower()}" if subject and subject[0].isupper() else f"I saw you {subject}"
    if cat == "experience":
        return f"I saw {subject}"
    if cat in ("skill_unlisted", "technical_skill", "skill"):
        return f"I saw you've been working with {subject}"
    if cat == "goal":
        return f"I saw your goal is {subject.lower()}" if subject else ""
    if cat == "target_company":
        return f"I saw you're aiming for {subject}"
    if cat == "strength":
        return f"I saw one of your strengths is {subject.lower()}" if subject else ""
    return f"I saw {subject}"


@router.get("/ai/chat-history")
async def get_ai_chat_history(request: Request, limit: int = 5):
    """
    List past /ai/chat threads for the AI overlay "history" panel.
    Each thread: conv_id, first_user_message (as title), last
    assistant preview, turn count, timestamps. Zero LLM — pure read
    from chat_thread_store.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        from projects.dilly.api.chat_thread_store import list_threads  # type: ignore
        items = list_threads(email, limit=limit)
    except Exception:
        items = []
    return {"items": items, "count": len(items)}


@router.delete("/ai/chat-history/{conv_id}")
async def delete_ai_chat_thread(request: Request, conv_id: str):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        from projects.dilly.api.chat_thread_store import delete_thread  # type: ignore
        ok = delete_thread(email, conv_id)
    except Exception:
        ok = False
    return {"ok": ok}


@router.post("/ai/chat-history/{conv_id}/keep")
async def keep_ai_chat_thread(request: Request, conv_id: str, body: dict = Body(...)):
    """Pin or unpin a past conversation. Kept threads are immune to
    the rolling 5-cap in the history panel. Body: { kept: bool }."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    kept = bool(body.get("kept", True))
    try:
        from projects.dilly.api.chat_thread_store import set_kept  # type: ignore
        ok = set_kept(email, conv_id, kept)
    except Exception:
        ok = False
    return {"ok": ok, "kept": kept}


@router.get("/ai/chat-history/{conv_id}/messages")
async def get_ai_chat_thread_messages(request: Request, conv_id: str):
    """Full transcript for one past thread. Feeds the overlay's
    "past conversations → tap to open" flow. Zero LLM."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        from projects.dilly.api.chat_thread_store import get_thread_messages, get_thread  # type: ignore
        msgs = get_thread_messages(email, conv_id)
        thread = get_thread(email, conv_id) or {}
    except Exception:
        msgs, thread = [], {}
    return {
        "conv_id": conv_id,
        "mode": thread.get("mode") or "coaching",
        "messages": msgs,
        "count": len(msgs),
    }


@router.get("/ai/context")
async def get_ai_context(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    try:
        ctx = _build_rich_context(email)

        # Generate a proactive first message based on the user's path
        # and what Dilly already knows. This fires when the user opens
        # the AI overlay without typing anything — Dilly speaks first.
        name = (ctx.get("name") or "").split()[0] if ctx.get("name") else "there"
        path = (ctx.get("user_path") or "").strip().lower()
        fact_count = len((ctx.get("profile_facts_text") or "").split("\n"))
        opening_fact = _pick_opening_fact(email)

        # If we have a specific, interesting fact from their profile
        # (likely extracted from their resume), open with it. This is
        # the "first 10 minutes valuable" moment — Dilly proves it
        # actually read them before saying anything else.
        fact_phrase = ""
        if opening_fact:
            phrase = _opening_phrase_for_fact(opening_fact)
            if phrase:
                fact_phrase = phrase

        if fact_count > 10:
            # Dilly already knows them — pick up where we left off
            if fact_phrase:
                msg = f"Hey {name}. {fact_phrase}. What are you working on today?"
            else:
                msg = f"Hey {name}. What are you working on today?"
        elif fact_phrase and path in ("student", "dropout", "senior_reset", "veteran",
                                       "parent_returning", "career_switch", "first_gen_college",
                                       "international_grad", "neurodivergent",
                                       "trades_to_white_collar", "ex_founder"):
            # Resume facts present AND a concrete path: lead with the fact,
            # follow with a path-appropriate invitation.
            if path == "student":
                msg = f"Hey {name}. {fact_phrase}. Tell me what you were proudest of about that."
            elif path == "dropout":
                msg = f"Hey {name}. {fact_phrase}. What's the hardest part of that you solved on your own?"
            elif path == "senior_reset":
                msg = f"Hey {name}. {fact_phrase}. What was the biggest lesson from that chapter?"
            elif path == "veteran":
                msg = f"Hey {name}. {fact_phrase}. Let's translate that for civilian recruiters. What did the day-to-day actually look like?"
            elif path == "parent_returning":
                msg = f"Hey {name}. {fact_phrase}. Take me through what you did there, so we can bring those skills forward."
            elif path == "career_switch":
                msg = f"Hey {name}. {fact_phrase}. What part of that are you trying to carry into your new field?"
            elif path == "first_gen_college":
                msg = f"Hey {name}. {fact_phrase}. That's real work. Tell me how you pulled it off."
            elif path == "international_grad":
                msg = f"Hey {name}. {fact_phrase}. Walk me through it. Details help me match you to sponsoring employers."
            elif path == "neurodivergent":
                msg = f"Hey {name}. {fact_phrase}. Tell me what you actually did. Specific wins."
            elif path == "trades_to_white_collar":
                msg = f"Hey {name}. {fact_phrase}. What part of that skill set do you want to carry into an office role?"
            elif path == "ex_founder":
                msg = f"Hey {name}. {fact_phrase}. Walk me through what that taught you about operations."
            else:
                msg = f"Hey {name}. {fact_phrase}. Tell me more about it."
        elif path == "student":
            msg = f"Hey {name}. I already know a bit about you from your profile. What's the one thing you've done that you're most proud of, school or not?"
        elif path == "dropout":
            msg = f"Hey {name}. You're building without a degree, which honestly takes more guts than most people have. What are you working on right now?"
        elif path == "senior_reset":
            msg = f"Hey {name}. I know you've been doing this a long time. Before we get into the job search stuff, what's the thing you were best at in your last role?"
        elif path == "veteran":
            msg = f"Hey {name}. Thank you for your service. Let's translate what you did into something civilian recruiters understand. What was your role and what did you actually do day to day?"
        elif path == "parent_returning":
            msg = f"Hey {name}. Stepping back in is a big move. What kind of work are you looking to get back into?"
        elif path == "career_switch":
            msg = f"Hey {name}. Switching fields takes real conviction. What are you pivoting from and what are you pivoting toward?"
        elif path == "first_gen_college":
            msg = f"Hey {name}. You're figuring out a lot of this on your own, and that's actually a strength. What are you studying and what are you hoping to do with it?"
        elif path == "international_grad":
            msg = f"Hey {name}. The visa clock is real and I get it. What field are you targeting and what's your OPT timeline?"
        elif path == "formerly_incarcerated":
            msg = f"Hey {name}. I'm glad you're here. What kind of work are you looking for and what skills have you built?"
        elif path == "neurodivergent":
            msg = f"Hey {name}. I'll keep things direct and concrete. What kind of role are you looking for?"
        elif path == "trades_to_white_collar":
            msg = f"Hey {name}. You've been solving real problems every day. What trade are you coming from and where do you want to go?"
        elif path == "disabled_professional":
            msg = f"Hey {name}. What kind of role are you looking for? We'll find the ones that fit."
        elif path == "lgbtq":
            msg = f"Hey {name}. I'll surface companies with real inclusion track records, not just logos. What field are you in?"
        elif path == "rural_remote_only":
            msg = f"Hey {name}. Remote-only is a filter, not a weakness. Tons of companies are fully distributed now. What kind of work are you looking for?"
        elif path == "refugee":
            msg = f"Hey {name}. Welcome. Tell me what you did in your home country or what you've been doing since arriving, and I'll help translate it into US resume language."
        elif path == "ex_founder":
            msg = f"Hey {name}. Running your own thing is real experience, not a gap. What were you building and what are you looking for now?"
        else:
            msg = f"Hey {name}. Tell me a bit about yourself and what you're looking for. I'll take it from there."

        ctx["proactive_message"] = msg
        return ctx
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Could not build context: {str(e)[:200]}")


def _append_calendar_deadline(email: str, payload: dict) -> None:
    """Write a tool-generated calendar event to profile.deadlines.

    Called synchronously during the chat flow when the AI invokes the
    add_calendar_event tool. Idempotent by (title, date, company) so a
    user mentioning the same event twice doesn't create duplicates.

    Raises on failure so the tool_result can surface the error back to
    the model.
    """
    from projects.dilly.api.profile_store import get_profile, save_profile
    import uuid
    from datetime import datetime as _dt

    title = (payload.get("title") or "").strip()
    date_str = (payload.get("date") or "").strip()[:10]
    if not title or not date_str:
        raise ValueError("title and date are required")
    # Validate the date — the model sometimes returns partial/invalid dates.
    try:
        _dt.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise ValueError(f"invalid ISO date: {date_str}")

    ev_type = (payload.get("type") or "custom").strip()
    company = (payload.get("company") or "").strip()
    notes = (payload.get("notes") or "").strip()

    profile = get_profile(email) or {}
    existing = profile.get("deadlines")
    if not isinstance(existing, list):
        existing = []

    dedup_key = (title.lower(), date_str, company.lower())
    for d in existing:
        if not isinstance(d, dict):
            continue
        k = (
            str(d.get("title") or d.get("label") or "").lower(),
            str(d.get("date") or "")[:10],
            str(d.get("company") or "").lower(),
        )
        if k == dedup_key:
            return  # already there, no-op

    existing.append({
        "id": str(uuid.uuid4()),
        "title": title,
        "date": date_str,
        "type": ev_type,
        "notes": notes or f"Auto-added by Dilly from chat on {_dt.utcnow().strftime('%Y-%m-%d')}.",
        "company": company,
        "completedAt": None,
        "createdBy": "dilly-ai-chat",
    })
    save_profile(email, {"deadlines": existing})


@router.post("/ai/chat", response_model=ChatResponse)
async def ai_chat(request: Request, body: ChatRequest):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="Anthropic SDK not installed. Run: pip install anthropic")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not set")

    # Always build rich context server-side from the authenticated user's profile.
    # This ensures the AI always knows the student's full profile (majors, minors,
    # resume, cohort scores, applications, deadlines) regardless of what the client sends.
    # Client-provided rich_context or system string is used only as override / fallback.
    if body.mode == "practice":
        # Interview practice mode uses a lightweight prompt
        system = _build_system_prompt(body.mode, body.student_context, body.rich_context)
    elif body.system:
        # Caller passed an explicit system string (rare — usually from desktop)
        system = body.system
    else:
        # Standard coaching: always pull full profile from DB, ignore client-side context
        try:
            _server_rich = _build_rich_context(email)
            # Merge any extra fields the client sent (e.g. reference_company from jobs screen)
            if body.rich_context and isinstance(body.rich_context, dict):
                for _k, _v in body.rich_context.items():
                    if _v and not _server_rich.get(_k):
                        _server_rich[_k] = _v
            if body.student_context:
                if body.student_context.reference_company and not _server_rich.get("reference_company"):
                    _server_rich["reference_company"] = body.student_context.reference_company
            # Attach the Arena state (pre-computed on the client) so
            # Dilly can answer "what does my honest mirror say" with
            # real data rather than bluffing that she has no visibility.
            if body.arena_state and isinstance(body.arena_state, dict):
                _server_rich["arena_state"] = body.arena_state
            system = _build_rich_system_prompt(_server_rich)
        except Exception:
            # Fallback to client context if server-side build fails
            system = _build_system_prompt(body.mode, body.student_context, body.rich_context)

    raw_messages = [{"role": m.role, "content": m.content} for m in body.messages if m.role in ("user", "assistant") and m.content.strip()]
    if not raw_messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    # ── Chapter-mode augmentation ─────────────────────────────────────────
    # When the client sends mode='chapter', this is an inline Q&A chat from
    # the Chapter question screen. Apply three overlays on top of the base
    # rich system prompt:
    #   1. Chapter framing: persona, scope, clean prose rules.
    #   2. Pacing: inject a wrap-up nudge at turns 4 and 5 so the cap lands
    #      gracefully rather than cutting off mid-thought.
    #   3. Prohibit markdown and meta-text: Dilly must not mention screens,
    #      turn counts, or session metadata in its responses.
    if body.mode == "chapter" and isinstance(system, str):
        _chapter_base = (
            "\n\nYOU ARE IN A CHAPTER SESSION INLINE CHAT.\n"
            "This is the question screen inside a structured weekly advisory session. "
            "The user is responding to a question Dilly posed. Your job is to listen, "
            "validate, and go one level deeper — never more than one question per message.\n"
            "CLEAN PROSE RULES: Do not use markdown. No asterisks, no underscores, no "
            "bullet points, no headers. Write plain conversational prose only. "
            "Do not mention screen numbers, turn counts, or session structure in your response. "
            "The user sees clean chat bubbles — formatting characters will appear as literal symbols."
        )
        # Count user turns to determine pacing position.
        _user_turn_count = sum(1 for m in raw_messages if m.get("role") == "user")
        if _user_turn_count >= 5:
            _pacing = (
                "\n\nPACING — FINAL TURN: This is your last response on this screen. "
                "Wrap up gracefully: synthesize the conversation in one or two sentences, "
                "offer a closing thought that lands, and gesture toward moving forward. "
                "Do not ask another open question. End with something that feels resolved."
            )
        elif _user_turn_count == 4:
            _pacing = (
                "\n\nPACING — PENULTIMATE TURN: This is your second-to-last response. "
                "Start gathering threads — name the core thing you are hearing. "
                "Do not introduce new tangents or open new topics."
            )
        else:
            _pacing = ""
        system = system + _chapter_base + _pacing

    # ── Cost optimization: truncate chat history ──────────────────────────
    # Send at most the last N message turns to Claude. Older context is
    # captured in the persistent profile (extraction runs after every chat),
    # so the LLM doesn't need 20-message windows to stay coherent.
    # Cuts input tokens ~40% on long sessions.
    _MAX_TURNS_TO_LLM = 6  # last 6 turns ≈ 3 user + 3 assistant
    if len(raw_messages) > _MAX_TURNS_TO_LLM:
        # Always keep the very first user message (often sets the topic) +
        # the last (N-1) turns. Drop the middle.
        messages = [raw_messages[0]] + raw_messages[-(_MAX_TURNS_TO_LLM - 1):]
    else:
        messages = raw_messages

    # Plan-aware model routing: free tier gets Haiku, paid gets Sonnet 4.6.
    # Saves ~$0.011/chat for free users (5x cheaper) without quality loss for
    # most career questions. Pro could be wired to Opus later if we add it.
    try:
        from projects.dilly.api.profile_store import get_profile as _get_profile_for_plan
        _user_profile = _get_profile_for_plan(email) or {}
        _plan = (_user_profile.get("plan") or "starter").lower().strip()
    except Exception:
        _plan = "starter"
    _is_paid = _plan in ("dilly", "pro")

    # ── Tier gating + daily quota ─────────────────────────────────────────
    # Chat is a paid feature. Free (starter) tier is blocked at this
    # gate with a 402 and a structured upgrade payload the mobile client
    # turns into an upgrade sheet. Paid tiers still get a daily quota
    # cap (DAILY_CAPS) so no single user can run away with cost, but
    # they pass this gate.
    #
    # Why gate chat specifically: chat is the highest-cost surface in
    # the app (Haiku output per turn). Free users get the rest of Dilly
    # (Jobs feed, Arena, Career Center, My Dilly, web profile, hero
    # cards, all templated/cached content) with zero LLM cost per view.
    # Chat is the #1 reason to upgrade.
    if body.mode != "practice" and email:
        # Tier gate: starter hits a hard 402.
        if _plan == "starter":
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "CHAT_REQUIRES_PLAN",
                    "message": "Chat with Dilly is a Dilly feature. Upgrade to unlock daily conversations with your career coach.",
                    "plan": _plan,
                    "required_plan": "dilly",
                    "features_unlocked": [
                        "Unlimited profile building through conversation",
                        "Personalized daily coaching",
                        "Interview practice with feedback",
                        "Resume tailoring per role",
                    ],
                },
            )

        # Paid tiers: enforce daily cap.
        try:
            from projects.dilly.api.chat_quota_store import is_over_cap, record_chat
            _over, _used, _cap = is_over_cap(email, _plan)
            if _over:
                raise HTTPException(
                    status_code=429,
                    detail={
                        "code": "DAILY_CHAT_CAP",
                        "message": f"You've hit today's chat limit ({_cap} messages). Resets at midnight UTC.",
                        "used": _used,
                        "cap": _cap,
                        "plan": _plan,
                        "upgrade_plan": "pro",
                    },
                )
            # Record the chat NOW, before the LLM call. If the LLM call
            # fails the user still "used" the slot, which is fine — the
            # alternative (record-after-success) lets errant retries burn
            # the quota twice.
            record_chat(email)
        except HTTPException:
            raise
        except Exception:
            pass  # quota store failures must never block chat
    # Haiku 4.5 across all tiers. We tested Sonnet on paid and saw ~3x the
    # cost for chat output that users couldn't reliably distinguish. Keeping
    # the branch for future tier-gating (e.g. if Opus needs to be
    # restricted to Pro later) but both sides are Haiku today.
    _chat_model = "claude-haiku-4-5-20251001"

    # ── Cost optimization: prompt caching (two-breakpoint design) ────────
    # Haiku 4.5 requires the cached PREFIX to be ≥4096 tokens (verified
    # against Anthropic's prompt-caching docs). The user-specific rich
    # system prompt typically runs ~2300 tokens — below threshold on its
    # own. The stable persona block (_DILLY_CHAT_STABLE_PERSONA) adds
    # ~2400 more tokens, pushing the combined prefix past 4096.
    #
    # Two cache breakpoints:
    #   Block 1 (stable persona only) — byte-identical across every
    #     user and every session. If another user chatted within the
    #     last 5 minutes with the same deployed code, this prefix is
    #     already cached on Anthropic's side → cross-user reuse. At
    #     any scale beyond a handful of concurrent users, block 1
    #     stays "warm" continuously.
    #   Block 2 (stable + user profile) — per-session cache. First
    #     turn writes, turns 2-N within the 5-min TTL read at 10% of
    #     input price.
    #
    # Pricing (Haiku 4.5):
    #   - Base input:  $1.00/MTok
    #   - Cache write: $1.25/MTok (25% premium, 5-min TTL)
    #   - Cache read:  $0.10/MTok (90% discount)
    #   - Output:      $5.00/MTok
    #
    # Expected cost shift for a 16-turn chat (first paid user in a
    # quiet window, no cross-user cache warm):
    #   Before:  16 × 4700 × $1/MTok = $0.075 on input alone
    #   After:   1 × 4700 × $1.25/MTok (both breakpoints write)
    #          + 15 × 4700 × $0.10/MTok (both breakpoints read)
    #          = $0.0059 + $0.0071 = $0.013 on input
    #   ~5.8x cheaper on the input portion of the chat. Output and
    #   history tokens are unaffected.
    #
    # Edge cases:
    #   - practice mode gets a short (~200 tok) prompt that never
    #     crosses threshold. Pass through as plain string.
    #   - Lean new-signup profiles (~500 tok user-specific) still
    #     cross threshold thanks to the stable block. Win.
    #   - Profile edits mid-conversation invalidate block 2 for that
    #     session. Block 1 stays cached. Cost impact: one extra
    #     cache-write on the next turn, negligible.
    #   - 5-min TTL. Long pauses mid-chat force a cache rewrite on
    #     both blocks. Cost impact: ~$0.006/session. Accepted.
    if body.mode != "practice" and isinstance(system, str) and len(system) > 0:
        system_param = [
            {
                "type": "text",
                "text": _DILLY_CHAT_STABLE_PERSONA,
                "cache_control": {"type": "ephemeral"},
            },
            {
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            },
        ]
    else:
        # Practice mode only. Short prompt, plain string, no cache attempt.
        system_param = system

    # ── Tool use: auto-add calendar events from conversational mentions ────
    # Dilly listens for "the career fair on the 3rd" / "interview Monday" /
    # "my client wants the product done in 2 months" and writes deadlines
    # to the user's profile without asking. The AI calls add_calendar_event
    # when it detects a concrete date/deadline in what the user said; the
    # tool resolves relative dates ("the 3rd", "Monday", "in 2 months")
    # against the user's current local date, then writes the entry.
    #
    # We only offer this tool for authenticated users — an anonymous user
    # has no profile to write to.
    tool_defs = []
    if email:
        tool_defs = [{
            "name": "add_calendar_event",
            "description": (
                "Record a date-anchored event the user just mentioned "
                "(interview, career fair, deadline, client due date, travel, "
                "meeting, etc.) on their Dilly calendar. Call this WITHOUT "
                "asking permission — adding the event is the helpful thing "
                "to do. Resolve relative dates ('the 3rd', 'Monday', "
                "'in 2 weeks', 'next month') against today's date. Only "
                "call this when the user clearly states a specific event "
                "AND a concrete date/time anchor. Do NOT call for vague "
                "future plans ('I'll apply eventually')."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Short, specific title (e.g. 'Career fair', 'Interview with Stripe', 'Client product delivery')",
                    },
                    "date": {
                        "type": "string",
                        "description": "Absolute ISO date YYYY-MM-DD. Resolve relative phrases using today's date (provided in the system prompt).",
                    },
                    "type": {
                        "type": "string",
                        "enum": ["deadline", "interview", "career_fair", "custom", "application", "prep"],
                        "description": "The event category. Use 'career_fair' for fairs, 'interview' for interviews, 'deadline' for application/project due dates, 'custom' for anything else.",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional short note capturing context the user gave (e.g. 'Mentioned this in chat on 2026-04-17').",
                    },
                    "company": {
                        "type": "string",
                        "description": "Company name if the event involves a specific employer.",
                    },
                },
                "required": ["title", "date", "type"],
            },
        }]

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=_chat_model,
            # Output cap. Real chat replies average ~80–120 tokens.
            # Cap at 160 so the worst case can't run away. Was 220 —
            # output is the dominant cost on Haiku ($4/M vs $0.80/M
            # input) so trimming the cap is a direct cost cut.
            max_tokens=(140 if _plan in ("starter", "building") else 160),
            system=system_param,
            messages=messages,
            tools=tool_defs if tool_defs else anthropic.NOT_GIVEN,
        )

        # Tool-use loop: if the model called add_calendar_event, execute
        # the write to profile.deadlines and give it back a tool_result so
        # it can produce a natural reply. Single-turn loop (no nested
        # tool calls expected for calendar writes).
        tool_calls_made: list[dict] = []
        if getattr(response, "stop_reason", "") == "tool_use":
            tool_results = []
            for block in response.content:
                if getattr(block, "type", None) != "tool_use":
                    continue
                if block.name == "add_calendar_event":
                    try:
                        _append_calendar_deadline(email, block.input)
                        tool_calls_made.append(block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": "Event saved to calendar.",
                        })
                    except Exception as _e:
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": f"Could not save event: {_e}",
                            "is_error": True,
                        })

            if tool_results:
                follow_messages = list(messages) + [
                    {"role": "assistant", "content": response.content},
                    {"role": "user", "content": tool_results},
                ]
                # Tool-result follow-up: reply to the user after the
                # calendar event was saved. Typically one sentence.
                response = client.messages.create(
                    model=_chat_model,
                    max_tokens=140,
                    system=system_param,
                    messages=follow_messages,
                    tools=tool_defs if tool_defs else anthropic.NOT_GIVEN,
                )

        # Extract the final text after any tool turns. The assistant may
        # return mixed content blocks; concat all text blocks.
        content = "".join(
            getattr(b, "text", "") for b in (response.content or [])
            if getattr(b, "type", None) == "text"
        )

        # Cost visibility: log per-turn usage so we can verify in prod
        # logs that prompt caching is actually hitting. usage fields:
        # input_tokens, cache_creation_input_tokens,
        # cache_read_input_tokens, output_tokens. If cache_read is
        # high relative to input_tokens we're winning; if it's near 0
        # on multi-turn chats, the cache isn't hitting and we should
        # investigate.
        try:
            u = getattr(response, "usage", None)
            if u is not None:
                in_tok    = int(getattr(u, "input_tokens", 0) or 0)
                cache_r   = int(getattr(u, "cache_read_input_tokens", 0) or 0)
                cache_c   = int(getattr(u, "cache_creation_input_tokens", 0) or 0)
                out_tok   = int(getattr(u, "output_tokens", 0) or 0)
                _email_hint = (email.split("@")[0][:4] + "***") if email and "@" in email else "anon"
                print(
                    f"[AI_CHAT] user={_email_hint} plan={_plan} "
                    f"in={in_tok} cache_r={cache_r} cache_c={cache_c} out={out_tok}",
                    flush=True,
                )
                # Per-call cost ledger — lets us answer "how much did
                # user X spend on chat this month" with a SQL query.
                # session_id MUST match the conv_id we use for cost lookup
                # later (conv_id_resolved). When body.conv_id is empty,
                # mobile shows 0¢ in the footer because the lookup uses
                # the sha256-derived id but the log row has session_id=None.
                # Resolve the id here using the same fallback logic so the
                # write and the read agree.
                import hashlib as _hl_chat_log
                _chat_session_id = (body.conv_id or "").strip() or (
                    _hl_chat_log.sha256(
                        f"{email}:{raw_messages[0].get('content', '')[:100]}".encode()
                    ).hexdigest()[:16] if email and raw_messages else None
                )
                from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
                log_from_anthropic_response(
                    email, FEATURES.CHAT, response,
                    plan=_plan,
                    session_id=_chat_session_id,
                    metadata={"mode": body.mode or "chat"},
                )
        except Exception:
            pass

        # ── Profile / memory extraction (synchronous) ─────────────────
        # Previously this ran in a daemon thread so the HTTP response
        # returned before Postgres/file writes finished. Users (and the
        # mobile client) would navigate to My Dilly and see stale data;
        # nothing called resolveExtraction until /ai/chat/flush. We now
        # await extraction, return new rows in `memory.added`, and the app
        # refreshes immediately (same shape as flush).
        memory_payload: Optional[Dict[str, Any]] = None
        if email and len(messages) >= 1:
            import hashlib

            from projects.dilly.api.memory_surface_store import get_memory_surface

            conv_id_resolved = (body.conv_id or "").strip() or hashlib.sha256(
                f"{email}:{raw_messages[0].get('content', '')[:100]}".encode()
            ).hexdigest()[:16]
            full_messages = raw_messages + [{"role": "assistant", "content": content.strip()}]
            before_ids: set[str] = set()
            try:
                before = get_memory_surface(email) or {}
                before_ids = {str(it.get("id")) for it in (before.get("items") or [])}
            except Exception:
                pass
            try:
                from projects.dilly.api.memory_extraction import run_extraction

                # Per-turn LLM extraction on EVERY user message + skip
                # the trivial gate. User explicitly chose working over
                # cheap: prior throttle (every 5th msg) + gating meant
                # short conversations never produced facts. The flush
                # at session close was the safety net but mobile
                # lifecycle (background, force-quit, network blip)
                # made it unreliable. Running per-turn means facts
                # land regardless of how the chat ends.
                # Cost: ~$0.005 extra per chat reply (~6c per 6-msg
                # convo). User OK with this.
                _do_llm_extract = True
                result = await asyncio.to_thread(
                    run_extraction,
                    email,
                    conv_id_resolved,
                    full_messages[-12:],
                    _do_llm_extract,    # use_llm — every turn
                    True,               # skip_llm_trivial_gate — never gate
                )
                # Diagnostic so Railway logs show whether extraction
                # actually produced facts on each chat turn. Helps us
                # diagnose "I'm chatting but my profile isn't growing"
                # without instrumentation rounds.
                try:
                    _items_added = result.get("items_added") if isinstance(result, dict) else None
                    print(
                        f"[CHAT_EXTRACT] email={email[:6]}*** "
                        f"conv={conv_id_resolved[:8]} "
                        f"user_msgs={sum(1 for m in raw_messages if (m.get('role') or '') == 'user')} "
                        f"items_added={_items_added}",
                        flush=True,
                    )
                except Exception:
                    pass
                new_ids = set(result.get("item_ids") or [])
                after = get_memory_surface(email) or {}
                added_rows: list[dict[str, Any]] = []
                for it in (after.get("items") or []):
                    if str(it.get("id")) in new_ids and str(it.get("id")) not in before_ids:
                        added_rows.append(
                            {
                                "id": str(it.get("id")),
                                "category": it.get("category") or "",
                                "label": it.get("label") or "",
                                "value": it.get("value") or "",
                            }
                        )
                if added_rows:
                    memory_payload = {"added": added_rows, "count": len(added_rows)}
            except Exception as exc:
                sys.stderr.write(f"[ai_chat_memory_sync_failed] err={exc}\n")

            try:
                from projects.dilly.api.chat_thread_store import record_turn as _record_turn  # type: ignore

                last_user = next(
                    (m.get("content") or "" for m in reversed(raw_messages) if m.get("role") == "user"),
                    "",
                )
                _record_turn(
                    email=email,
                    conv_id=conv_id_resolved,
                    user_message=last_user,
                    assistant_message=content.strip(),
                    mode=body.mode or "coaching",
                )
            except Exception:
                pass

        # ── Session-end detection: Dilly emits [[end_session]] on the
        # final line when the conversation has reached a natural close.
        # We strip the token from the visible content and surface a
        # session_ending flag so the mobile client can replace the
        # input bar with a "Great session" checkmark — what makes
        # Dilly feel like an advisor running a session vs. an endless
        # chatbot. Token is matched flexibly (whitespace, optional
        # surrounding newlines).
        session_ending = False
        if "[[end_session]]" in content.lower() or "[[end_session]]" in content:
            session_ending = True
            import re as _re_end
            content = _re_end.sub(r"\s*\[\[end_session\]\]\s*", "", content, flags=_re_end.IGNORECASE).rstrip()

        # ── Auto-attach visual cards based on response content ─────────
        visual = _detect_visual(content, body.student_context, body.mode, email)

        # ── Cost transparency: read the actual logged cost for this
        # conversation from llm_usage_log. Surfaces in the UI so the
        # user can verify cost claims directly instead of trusting
        # estimates.
        # ALWAYS populate these fields (no None) so the footer always
        # renders. Empty body.conv_id falls back to conv_id_resolved
        # (the sha256-derived id used by extraction logging) so the
        # lookup matches whatever session_ids actually got written.
        conv_cost_usd: float = 0.0
        conv_cost_breakdown: List[Dict[str, Any]] = []
        conv_cost_debug: Dict[str, Any] = {
            "email_set": bool(email),
            "conv_id_in_body": (body.conv_id or "")[:16],
            "conv_id_resolved": "",
        }
        try:
            _lookup_email = email or ""
            _lookup_conv = (body.conv_id or "").strip()
            if not _lookup_conv:
                # Recompute the same fallback used by extraction logging
                # so we can still find the rows it wrote.
                import hashlib as _hl
                _first_msg = raw_messages[0].get("content", "") if raw_messages else ""
                _lookup_conv = _hl.sha256(
                    f"{_lookup_email}:{_first_msg[:100]}".encode()
                ).hexdigest()[:16] if _lookup_email else ""
            conv_cost_debug["conv_id_resolved"] = _lookup_conv
            if _lookup_email and _lookup_conv:
                from projects.dilly.api.llm_usage_log import get_session_cost
                sc = get_session_cost(_lookup_email, _lookup_conv)
                conv_cost_usd = round(float(sc.get("total_usd", 0.0)), 6)
                conv_cost_breakdown = sc.get("by_feature", []) or []
                _dbg = sc.get("debug", {}) or {}
                conv_cost_debug.update(_dbg)
            else:
                conv_cost_debug["skipped"] = "missing email or conv_id"
        except Exception as _e:
            conv_cost_debug["error"] = str(_e)[:200]

        # Server-side log so we can read Railway logs to verify the
        # cost block populated. If the user reports "0c" but this log
        # shows real numbers, the bug is in the response serialization
        # or mobile rendering, not the lookup.
        try:
            print(
                f"[AI_CHAT_COST] email={(email.split('@')[0][:4] if email else 'anon')}*** "
                f"conv={(_lookup_conv or 'NONE')[:12]} usd={conv_cost_usd:.6f} "
                f"breakdown_count={len(conv_cost_breakdown)} debug={conv_cost_debug}",
                flush=True,
            )
        except Exception:
            pass

        # Return as JSONResponse to bypass pydantic response_model
        # filtering. The response_model=ChatResponse decorator was
        # quietly omitting our cost fields in the wire payload (still
        # not sure why — pydantic v2 should serialize None as null,
        # not omit). Going around the model entirely guarantees the
        # client gets all four cost-related fields exactly as set.
        return JSONResponse(content={
            "content": content.strip(),
            "visual": visual,
            "memory": memory_payload,
            "conv_cost_usd": conv_cost_usd,
            "conv_cost_breakdown": conv_cost_breakdown,
            "conv_cost_debug": conv_cost_debug,
            "session_ending": session_ending,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")


def _detect_visual(content: str, ctx, mode: str, email: str) -> Optional[dict]:
    """Auto-detect which visual card to show based on the AI response content.

    Rules:
      - score_breakdown is gone (scores deprecated app-wide).
      - cohort_comparison is gone (we show fit narratives, not ranks).
      - 'run an audit' is gone from action_keywords (audit deprecated).
      - practice mode now emits visuals too — it was text-only before,
        but a mock interview is exactly where a checklist, bullet
        rewrite, and post-round action buttons pay off.
    """
    text = content.lower()
    cohort = (ctx.cohort if ctx else None) or "General"
    company = (ctx.reference_company if ctx else None) or "a top company"

    # ── PRACTICE MODE ───────────────────────────────────────────────
    # The interviewer surface. Visuals here are different from the
    # general chat — we want them to feel like debrief / coaching.
    if mode == "practice":
        # 1. Before/after rewrite of the candidate's answer → bullet_comparison
        before_match = re.search(r'(?:before|original|weak(?:er)?|instead of)[:\s]*["\u201c](.+?)["\u201d]', content, re.IGNORECASE)
        after_match  = re.search(r'(?:after|stronger|better|try)[:\s]*["\u201c](.+?)["\u201d]', content, re.IGNORECASE)
        if before_match and after_match:
            return {
                "type": "bullet_comparison",
                "before": before_match.group(1)[:240],
                "after":  after_match.group(1)[:240],
                "dimension": "answer",
                "impact": "Specific + quantified + STAR structure",
            }

        # 2. Interviewer lists topics/areas to prepare → interview_checklist
        # Triggers when the AI enumerates what to work on next.
        prep_triggers = [
            "before we continue", "here's what to work on", "you should prep",
            "work on these", "topics to prepare", "areas to improve", "focus on these",
            "prep list", "let's wrap up", "to summarize", "recap:",
        ]
        if any(kw in text for kw in prep_triggers):
            items = re.findall(r'(?:^|\n)\s*(?:\d+[\.\)]\s*|[-*]\s*)(.+?)(?=\n|$)', content)
            if len(items) >= 2:
                checklist = []
                for i, item in enumerate(items[:6]):
                    trimmed = item.strip()[:110]
                    if not trimmed:
                        continue
                    # High priority for the first two, medium for the rest.
                    prio = "high" if i < 2 else "medium"
                    checklist.append({"label": trimmed, "priority": prio, "done": False})
                if checklist:
                    return {
                        "type": "interview_checklist",
                        "company": company,
                        "role": ctx.application_target if ctx else None,
                        "round": None,
                        "items": checklist,
                    }

        # 3. End-of-interview call to action → action_buttons
        # When the AI signals the mock is wrapping up, point the user
        # at the full Interview Practice screen for a real session.
        wrap_triggers = ["that's all", "end of our session", "good luck", "nice job", "well done", "nice work"]
        if any(kw in text for kw in wrap_triggers):
            return {
                "type": "action_buttons",
                "buttons": [
                    {"label": "Open Interview Room",  "route": "/(app)/interview-practice"},
                    {"label": "Tailor Resume",        "route": "/(app)/resume-generate"},
                ],
            }

        # 4. Profile pickup during the mock → profile_update
        # "I'll remember that about you" moments also happen in practice.
        profile_keywords_p = ["i'll remember", "i've noted", "good signal", "added that", "noted about you"]
        if any(kw in text for kw in profile_keywords_p):
            learned = re.search(r'(?:you|your)\s+(\w+(?:\s+\w+){1,8})', content[:400])
            if learned:
                return {
                    "type": "profile_update",
                    "category": "interview_prep",
                    "label": "Captured from this round",
                    "value": learned.group(0)[:120],
                    "icon": "mic",
                    "color": "#7C3AED",
                }

        return None

    # ── DEFAULT CHAT MODE ───────────────────────────────────────────
    # Weekly plan when the response is a numbered day-by-day plan.
    plan_keywords = ["this week", "your plan", "here's what to do", "step 1", "day 1", "monday", "tuesday"]
    if any(kw in text for kw in plan_keywords):
        steps = re.findall(r'(?:^|\n)\s*(?:\d+[\.\)]\s*|[-*]\s*)(.*?)(?=\n|$)', content)
        if len(steps) >= 3:
            days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            plan_days = []
            for i, step in enumerate(steps[:7]):
                plan_days.append({
                    "day": days[i] if i < len(days) else f"Day {i+1}",
                    "task": step.strip()[:100],
                })
            return {
                "type": "weekly_plan",
                "title": "YOUR ACTION PLAN",
                "days": plan_days,
            }

    # Routing CTAs. 'Run an audit' removed — the audit feature is
    # deprecated and the old /(app)/new-audit route no longer leads
    # anywhere useful.
    action_keywords = {
        "tailor your resume":   ("/(app)/resume-generate",  "Tailor Resume"),
        "generate your resume": ("/(app)/resume-generate",  "Generate Resume"),
        "check the jobs":       ("/(app)/jobs",             "Browse Jobs"),
        "browse jobs":          ("/(app)/jobs",             "Browse Jobs"),
        "practice interview":   ("/(app)/interview-practice","Practice Interview"),
        "mock interview":       ("/(app)/interview-practice","Practice Interview"),
    }
    buttons = []
    for keyword, (route, label) in action_keywords.items():
        if keyword in text and not any(b["label"] == label for b in buttons):
            buttons.append({"label": label, "route": route})
    if buttons:
        return {"type": "action_buttons", "buttons": buttons[:3]}

    # Before/after bullet rewrites.
    before_match = re.search(r'(?:before|original|old)[:\s]*["\u201c](.+?)["\u201d]', content, re.IGNORECASE)
    after_match  = re.search(r'(?:after|improved|new|rewritten)[:\s]*["\u201c](.+?)["\u201d]', content, re.IGNORECASE)
    if before_match and after_match:
        return {
            "type": "bullet_comparison",
            "before": before_match.group(1)[:200],
            "after":  after_match.group(1)[:200],
            "dimension": "overall",
            "impact": "Stronger action verb + quantified metric",
        }

    # Profile capture confirmations.
    profile_keywords = ["i'll remember", "i've noted", "saved to your profile", "added to your dilly",
                        "i'll keep that in mind", "noted!", "got it, i", "i've saved"]
    if any(kw in text for kw in profile_keywords):
        learned = re.search(r'(?:you|your)\s+(\w+(?:\s+\w+){1,8})', content[:400])
        if learned:
            return {
                "type": "profile_update",
                "category": "general",
                "label": "Added to your Dilly",
                "value": learned.group(0)[:120],
                "icon": "sparkles",
                "color": "#1652F0",
            }

    return None


# ---------------------------------------------------------------------------
# /ai/chat/flush — on-exit extraction (cost cut)
# ---------------------------------------------------------------------------
#
# Cost-cut play. Instead of running extraction every 5 turns mid-conversation
# (~2-3 Haiku calls per typical 10-15 message session), the mobile client
# calls this endpoint ONCE when the user closes the chat overlay. One Haiku
# call per session.
#
# Why keep the mid-conversation trigger at all?
#   Long sessions (20+ messages) would lose facts if the user force-quits
#   the app before the overlay dispatches /flush. The existing every-5-turns
#   trigger in /ai/chat handles that safety net. If a session ends cleanly
#   via the close button, /flush runs and the mid-turn extraction for that
#   session was wasted — but the mid-turn code is rate-limited so it only
#   fires ~twice in a long session. Still a net 60-70% cost cut on the
#   median session.
#
# Response shape:
#   { added: [{id, category, label, value}, ...], updated: [...], count: N }
# Mobile uses `added` to drive the staggered-reveal animation on My Dilly.


class ChatFlushRequest(BaseModel):
    """Body for /ai/chat/flush — tells the backend to extract whatever the
    user said during the session that's closing.

    Either `conv_id` + `messages` (from the client's active conversation) or
    `conv_id` alone (we look up the last chat_thread rows on the server).
    The client ALWAYS has the messages in hand so it should prefer the
    first shape — the fallback exists for cases where the app restarts
    mid-session and still wants to flush."""
    conv_id: Optional[str] = None
    messages: Optional[list[ChatMessage]] = None


@router.post("/ai/chat/flush")
async def ai_chat_flush(request: Request, body: ChatFlushRequest):
    """Run the on-close extraction for a chat session. Returns the newly
    added facts so the client can animate their staggered reveal on the
    user's profile."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conv_id = (body.conv_id or "").strip()
    raw_messages = body.messages or []
    messages: list[dict[str, Any]] = []
    # Hydrate messages from the chat thread store if the client didn't
    # send them. Keeps the flush endpoint useful even on cold relaunches.
    if not raw_messages and conv_id:
        try:
            from projects.dilly.api.chat_thread_store import get_thread_messages  # type: ignore
            stored = get_thread_messages(email, conv_id) or []
            messages = [
                {"role": m.get("role") or "user", "content": m.get("content") or ""}
                for m in stored if (m.get("content") or "").strip()
            ]
        except Exception:
            messages = []
    else:
        messages = [
            {"role": m.role, "content": m.content}
            for m in raw_messages if (m.content or "").strip()
        ]

    # Nothing worth extracting — skip the Haiku call entirely. Saves cost
    # when users open/close chat without typing anything.
    if not messages or not conv_id or len(messages) < 2:
        return {"added": [], "updated": [], "count": 0, "skipped": True}

    # ── Decide if this flush earns an LLM extraction ─────────────────────
    # Single gate: conversation must have at least
    # LLM_EXTRACTION_MIN_USER_MSGS user messages. Mirrored in the mobile
    # UI as "Dilly is listening (X of 5)" so users understand the bar.
    # Shorter chats still run regex extraction, just skip the Haiku call.
    #
    # No daily cap — if someone is genuinely using Dilly a lot, they
    # should keep getting memory capture. The message-count gate is
    # a strong enough quality/cost filter on its own.
    #
    # Accidental close/reopen within the same session is not dedup'd
    # because the existing-fact-key dedupe inside run_extraction already
    # prevents duplicate facts from being saved — the only waste is
    # one redundant Haiku call (~$0.003), not worth the complexity of
    # a cross-request dedupe ledger.
    from projects.dilly.api.memory_extraction import LLM_EXTRACTION_MIN_USER_MSGS
    user_msg_count = sum(1 for m in messages if (m.get("role") or "") == "user")
    use_llm = user_msg_count >= LLM_EXTRACTION_MIN_USER_MSGS

    # Snapshot existing item IDs so we can diff — the extractor returns
    # the full new list + `item_ids` of new rows, but we want to return
    # actual fact objects to the mobile client for the animation.
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        before = get_memory_surface(email) or {}
        before_ids = {str(it.get("id")) for it in (before.get("items") or [])}
    except Exception:
        before_ids = set()

    # Run the extraction synchronously so the response contains the new
    # facts. Wrapped in a try/except: if the Haiku call fails we still
    # return 200 with an empty list so the client's close animation
    # doesn't break on us.
    # skip_llm_trivial_gate=True at flush — if the user closed the
    # chat, they had a real conversation, run extraction regardless
    # of how the messages "score" on the trivial heuristic.
    added: list[dict[str, Any]] = []
    try:
        from projects.dilly.api.memory_extraction import run_extraction
        result = await asyncio.to_thread(run_extraction, email, conv_id, messages[-30:], use_llm, True)
        try:
            print(
                f"[CHAT_FLUSH_EXTRACT] email={email[:6]}*** "
                f"conv={conv_id[:8]} "
                f"user_msgs={user_msg_count} use_llm={use_llm} "
                f"items_added={result.get('items_added') if isinstance(result, dict) else None}",
                flush=True,
            )
        except Exception:
            pass

        new_ids = set(result.get("item_ids") or [])
        # Read the updated surface to return the actual fact payloads.
        after = get_memory_surface(email) or {}
        for it in (after.get("items") or []):
            if str(it.get("id")) in new_ids and str(it.get("id")) not in before_ids:
                added.append({
                    "id": str(it.get("id")),
                    "category": it.get("category") or "",
                    "label": it.get("label") or "",
                    "value": it.get("value") or "",
                })
    except Exception as e:
        # Log + soft-return. Client handles an empty `added` gracefully
        # (no overlay, no animation).
        import sys as _sys
        _sys.stderr.write(f"[chat_flush_failed] email={email[:6]}*** err={e}\n")

    return {"added": added, "updated": [], "count": len(added), "skipped": False}
