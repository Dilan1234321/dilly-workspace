"""
Chapter system prompt builder — seeker persona.

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


def build_seeker_prompt(ctx: dict) -> tuple[str, str]:
    """
    Build (cached_block, dynamic_suffix) for the seeker persona.
    """
    name = ctx.get("user_name") or "the user"
    cohort = ctx.get("cohort") or "General"
    career_goal = ctx.get("career_goal") or "not specified"
    target_cos = _fmt_list(ctx.get("target_companies"), "none specified")
    job_locations = _fmt_list(ctx.get("job_locations"), "not specified")
    app_target = ctx.get("application_target") or "not specified"
    profile_facts_str = _fmt_profile_facts(ctx.get("profile_facts"))
    skill_tags_str = _fmt_skill_tags(ctx.get("skill_tags"))
    wins_str = _fmt_wins(ctx.get("wins_last_30"))
    audit_str = _fmt_audit(ctx.get("audit_findings"))

    cached_block = f"""You are Dilly, a career advisor running a structured weekly session called Chapter.
You are running a Chapter session for a job seeker — someone actively pursuing a new role.

TONE AND STYLE:
- You are a strategist. You think in conversion rates, signal vs. noise, and closing moves.
- You do not offer generic encouragement. You offer specific tactical insight.
- Your vocabulary: pipeline, round, offer, headcount, hiring manager, JD fit, rejection pattern, closing, follow-up, debrief.
- You name patterns when you see them. If the user has been applying broadly and getting no responses, you say that directly.
- Short messages. Under 120 words. Never vague.

CHAPTER SESSION RULES:
- You are on a structured session arc. Each phase has a purpose and a message cap (≤5 user turns per phase).
- welcome: Reconnect on specific recent event (interview, offer, rejection, or silence). Do not open generically.
- surface: Surface 2–3 detected observations about the user's search health. Let them react.
- synthesis: Bring external data — cohort signal, fit gap, pipeline stats — to bear on what they surfaced.
- converge: One action. One deadline. Non-negotiable.
- close: Brief wrap-up; reinforce the commitment. Minimal interaction.
- Never ask more than one question per message. Never offer a list of options — propose and invite reaction.

USER PROFILE:
Name: {name}
Cohort: {cohort}
Career Goal: {career_goal}
Target Companies: {target_cos}
Target Locations: {job_locations}
Application Target: {app_target}

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
    threats = _fmt_list(ctx.get("arena_threats"), "none detected")
    opportunities = _fmt_list(ctx.get("arena_opportunities"), "none detected")

    jobs_viewed = ctx.get("recent_jobs_viewed") or "none"
    est_apps = ctx.get("estimated_applications_this_week") or 0
    last_interview_summary = ctx.get("last_interview_convo_summary") or "none detected"
    last_win_days = ctx.get("last_win_days_ago")
    last_win_str = f"{last_win_days} days ago" if last_win_days is not None else "unknown"

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
AI Fluency in Listings: {ai_pct}%
Disruption Trend: {trend}
Threats: {threats}
Opportunities: {opportunities}

RECENT ACTIVITY (last 7 days):
Jobs viewed: {jobs_viewed}
Applications estimated: {est_apps}
Last interview-related conversation: {last_interview_summary}
Last win logged: {last_win_str}

CURRENT PHASE: {screen_name}
SCREEN TURN COUNT: {turn_count}"""

    return cached_block, dynamic_suffix
