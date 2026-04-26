"""
Chapter system prompt builder — holder persona.

Returns (cached_block, dynamic_suffix) tuple.
"""

from __future__ import annotations

from typing import Any


def _fmt_list(items: Any, fallback: str = "none") -> str:
    if not items:
        return fallback
    if isinstance(items, list):
        return ", ".join(str(i) for i in items if i) or fallback
    return str(items) or fallback


def _fmt_profile_facts(facts: Any) -> str:
    if not facts:
        return "No profile facts on file."
    if isinstance(facts, list):
        lines = []
        for f in facts[:20]:
            if isinstance(f, dict):
                cat = f.get("category") or f.get("type") or "info"
                val = f.get("value") or f.get("text") or str(f)
                lines.append(f"  [{cat}] {val}")
            else:
                lines.append(f"  {f}")
        return "\n".join(lines) or "No profile facts on file."
    if isinstance(facts, dict):
        lines = [f"  [{k}] {v}" for k, v in list(facts.items())[:20]]
        return "\n".join(lines) or "No profile facts on file."
    return str(facts)[:800]


def _fmt_wins(wins: Any) -> str:
    if not wins or not isinstance(wins, list):
        return "No wins logged recently."
    recent = wins[:8]
    lines = []
    for w in recent:
        if isinstance(w, dict):
            wtype = w.get("type") or "win"
            title = w.get("title") or ""
            date = w.get("date") or ""
            lines.append(f"  [{wtype}] {title} ({date})")
    return "\n".join(lines) or "No wins logged recently."


def _fmt_audit(findings: Any) -> str:
    if not findings:
        return "No audit findings on file."
    if isinstance(findings, list):
        lines = []
        for f in findings[:6]:
            if isinstance(f, dict):
                msg = f.get("message") or f.get("text") or str(f)
                lines.append(f"  • {msg}")
            else:
                lines.append(f"  • {f}")
        return "\n".join(lines) or "No audit findings on file."
    return str(findings)[:600]


def _fmt_skill_tags(tags: Any) -> str:
    if not tags:
        return "none"
    if isinstance(tags, list):
        return ", ".join(str(t) for t in tags[:20] if t)
    return str(tags)[:200]


def build_holder_prompt(ctx: dict) -> tuple[str, str]:
    """
    Build (cached_block, dynamic_suffix) for the holder persona.
    """
    name = ctx.get("user_name") or "the user"
    cohort = ctx.get("cohort") or "General"
    career_goal = ctx.get("career_goal") or "not specified"
    current_role_raw = ctx.get("current_role") or (ctx.get("profile_facts") or {})
    if isinstance(current_role_raw, dict):
        current_role = current_role_raw.get("current_role") or "not specified"
    else:
        current_role = str(current_role_raw)[:80] if current_role_raw else "not specified"
    target_cos = _fmt_list(ctx.get("target_companies"), "none specified")
    profile_facts_str = _fmt_profile_facts(ctx.get("profile_facts"))
    skill_tags_str = _fmt_skill_tags(ctx.get("skill_tags"))
    wins_str = _fmt_wins(ctx.get("wins_last_30"))
    audit_str = _fmt_audit(ctx.get("audit_findings"))

    cached_block = f"""You are Dilly, a career advisor running a structured weekly session called Chapter.
You are running a Chapter session for someone who currently has a job — a "holder."
They are managing career risk, growth trajectory, and long-term positioning.

TONE AND STYLE:
- You speak peer-to-peer. Like a trusted colleague two levels ahead who knows the game and will tell you the truth.
- You do not motivate. You analyze and propose. The user is a professional who wants insight, not encouragement.
- Your vocabulary: manager, stakeholder, leverage, promotion, visibility, compensation cycle, AI displacement, career capital, proposal, sponsor.
- You reference the user's specific workplace context when you have it. If their manager went quiet, you acknowledge that.
- Messages under 120 words. Strategic. Never vague.

CHAPTER SESSION RULES:
- You are on a structured session arc. Each phase has a purpose and a message cap (≤5 user turns per phase).
- welcome: Open with a specific workplace signal or callback from last session. Not "how are things."
- surface: Surface 2–3 detected signals about their career health (AI displacement trend, visibility, comp, growth stagnation).
- synthesis: Bring external data AND internal profile insight together into a synthesis. Name the implication.
- converge: One strategic action. Time-bounded. Frame it as "the move" not "a suggestion."
- close: Brief wrap-up; reinforce the commitment. The Recap card will be generated separately.
- Never ask more than one question per message. The session has a structure; honor it.

USER PROFILE:
Name: {name}
Cohort: {cohort}
Career Goal: {career_goal}
Current Role: {current_role}
Target Companies: {target_cos}

PROFILE FACTS:
{profile_facts_str}

TOP SKILL TAGS:
{skill_tags_str}

WINS (last 30 days):
{wins_str}

AUDIT FINDINGS:
{audit_str}

--- END CACHED BLOCK ---"""

    # Dynamic suffix
    last_recap = ctx.get("last_chapter_recap") or "This is the first Chapter session — use intake answers below."
    intake = ctx.get("intake_json") or "N/A"
    if isinstance(intake, dict):
        intake = "\n".join(f"  Q: {k}\n  A: {v}" for k, v in intake.items()) or "N/A"

    arena_cohort = ctx.get("arena_cohort") or cohort
    ai_pct = ctx.get("arena_ai_fluency_pct") or "N/A"
    trend = ctx.get("arena_trend") or "N/A"
    disruption_pct = ctx.get("arena_disruption_pct") or "N/A"
    threats = _fmt_list(ctx.get("arena_threats"), "none detected")
    opportunities = _fmt_list(ctx.get("arena_opportunities"), "none detected")

    jobs_viewed = ctx.get("recent_jobs_viewed") or "none"
    last_win_days = ctx.get("last_win_days_ago")
    last_win_str = f"{last_win_days} days ago" if last_win_days is not None else "unknown"
    convo_count = ctx.get("recent_conversation_count") or 0

    screen_num = ctx.get("current_screen_number") or 1
    screen_name = ctx.get("current_screen_name") or "welcome"
    turn_count = ctx.get("screen_turn_count") or 0

    dynamic_suffix = f"""
DYNAMIC CONTEXT (do not cache):

LAST SESSION RECAP:
{last_recap}

INTAKE ANSWERS (first session only):
{intake}

AI ARENA SIGNAL (this week):
Cohort: {arena_cohort}
AI Fluency in Listings: {ai_pct}% (trend: {trend})
Disruption Risk: {disruption_pct}%
Threats: {threats}
Opportunities: {opportunities}

RECENT ACTIVITY (last 7 days):
Jobs viewed: {jobs_viewed}
Last win logged: {last_win_str}
Recent conversations: {convo_count} sessions

CURRENT PHASE: {screen_name}
SCREEN TURN COUNT: {turn_count}"""

    return cached_block, dynamic_suffix
