"""
Chapter system prompt builder — student persona.

Returns (cached_block, dynamic_suffix) tuple.
The cached_block is heavy (~15k tokens) and should receive
cache_control: {"type": "ephemeral"} in the API call.
The dynamic_suffix (~500 tokens) changes each session and is never cached.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional


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


def build_student_prompt(ctx: dict) -> tuple[str, str]:
    """
    Build (cached_block, dynamic_suffix) for the student persona.

    ctx keys (all optional, safe defaults used):
        user_name, graduation_year, majors, minors, career_goal,
        application_target, target_companies, cohort,
        overall_dilly_score, overall_smart, overall_grit, overall_build,
        profile_facts, skill_tags, audit_findings, wins_last_30,
        last_chapter_recap, intake_json,
        arena_cohort, arena_ai_fluency_pct, arena_cross_cohort_rank,
        arena_cross_cohort_total, arena_disruption_pct, arena_trend,
        arena_opportunities,
        recent_jobs_viewed, recent_conversation_count, last_win_days_ago,
        current_screen_number, current_screen_name, screen_turn_count,
    """
    name = ctx.get("user_name") or "the student"
    grad_year = ctx.get("graduation_year") or "not specified"
    majors = _fmt_list(ctx.get("majors"), "not specified")
    minors = _fmt_list(ctx.get("minors"), "none")
    career_goal = ctx.get("career_goal") or "not specified"
    app_target = ctx.get("application_target") or "not specified"
    target_cos = _fmt_list(ctx.get("target_companies"), "none specified")
    cohort = ctx.get("cohort") or "General"
    ds_overall = ctx.get("overall_dilly_score") or "N/A"
    ds_smart = ctx.get("overall_smart") or "N/A"
    ds_grit = ctx.get("overall_grit") or "N/A"
    ds_build = ctx.get("overall_build") or "N/A"
    profile_facts_str = _fmt_profile_facts(ctx.get("profile_facts"))
    skill_tags_str = _fmt_skill_tags(ctx.get("skill_tags"))
    audit_str = _fmt_audit(ctx.get("audit_findings"))
    wins_str = _fmt_wins(ctx.get("wins_last_30"))

    cached_block = f"""You are Dilly, a career advisor running a structured weekly session called Chapter.
You are running a Chapter session for a student user.

TONE AND STYLE:
- You are encouraging but honest. You do not sugarcoat gaps; you name them clearly and then help close them.
- You speak like a sharp mentor — not a life coach, not a cheerleader. Like a professor who actually cares whether you get the job.
- Your vocabulary: internship, application, deadline, alumni, campus, GPA, professor, career center, cohort, skill gap.
- You use "you" a lot. Never "one might consider" — always "you should" or "here's what I'd do."
- Keep messages under 120 words per turn. Short. Specific. Actionable.

CHAPTER SESSION RULES:
- You are on a structured 5-screen arc. Each screen has a purpose and a message cap (≤5 user turns per screen).
- Do not volunteer information outside the current screen's scope. Screen 1 is reconnection. Screen 2 is surfacing. Screen 3 is synthesis. Screen 4 is convergence. Screen 5 is commitment.
- On Screen 4, you must propose exactly one action with a specific deadline. Not a list. One thing.
- Never ask more than one question per message.
- If the user goes off-topic, gently redirect: "Let's hold that for a second — we were talking about X."

USER PROFILE:
Name: {name}
Graduation Year: {grad_year}
Major(s): {majors}
Minor(s): {minors}
Career Goal: {career_goal}
Application Target: {app_target}
Target Companies: {target_cos}
Cohort: {cohort}
Dilly Score: {ds_overall} (Smart: {ds_smart}, Grit: {ds_grit}, Build: {ds_build})

PROFILE FACTS (extracted from voice, resume, and audit):
{profile_facts_str}

TOP SKILL TAGS:
{skill_tags_str}

AUDIT FINDINGS (most recent):
{audit_str}

WINS (last 30 days):
{wins_str}

--- END CACHED BLOCK ---"""

    # Dynamic suffix — not cached, changes each session
    last_recap = ctx.get("last_chapter_recap") or "This is the first Chapter session — use intake answers below."
    intake = ctx.get("intake_json") or "N/A"
    if isinstance(intake, dict):
        intake = "\n".join(f"  Q: {k}\n  A: {v}" for k, v in intake.items()) or "N/A"

    arena_cohort = ctx.get("arena_cohort") or cohort
    ai_pct = ctx.get("arena_ai_fluency_pct") or "N/A"
    cc_rank = ctx.get("arena_cross_cohort_rank") or "N/A"
    cc_total = ctx.get("arena_cross_cohort_total") or "N/A"
    disruption_pct = ctx.get("arena_disruption_pct") or "N/A"
    trend = ctx.get("arena_trend") or "N/A"
    opportunities = _fmt_list(ctx.get("arena_opportunities"), "none detected")

    jobs_viewed = ctx.get("recent_jobs_viewed") or "none"
    convo_count = ctx.get("recent_conversation_count") or 0
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
AI Fluency in Listings: {ai_pct}% ({cc_rank} of {cc_total} cohorts)
Disruption Risk: {disruption_pct}%
Trend: {trend}
Opportunities: {opportunities}

RECENT ACTIVITY (last 7 days):
Jobs viewed: {jobs_viewed}
Conversations: {convo_count} voice/chat sessions
Last win logged: {last_win_str}

CURRENT SCREEN: {screen_num} — {screen_name}
SCREEN TURN COUNT: {turn_count} of 5"""

    return cached_block, dynamic_suffix
