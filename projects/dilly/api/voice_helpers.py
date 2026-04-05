"""
Dilly helpers: build system prompt, format context, extract beyond-resume data.
Voice is a data-capturing layer: actively asks for skills/experiences not on the resume and stores them.
"""

import datetime
import json
import os
import re
import time
from typing import Any

from projects.dilly.api.output_safety import REDIRECT_MESSAGE
from projects.dilly.api.system_prompt_rules import (
    DILLY_STYLE_RULES,
    DILLY_CONTEXT_INSTRUCTIONS,
)

# Prompt constants and cohort expertise extracted to voice_prompt_constants.py
from projects.dilly.api.voice_prompt_constants import (
    INAPPROPRIATE_FILTER_VOICE_INSTRUCTIONS as _INAPPROPRIATE_FILTER_VOICE_INSTRUCTIONS,
    VOICE_OUTPUT_PROFANITY_GUIDELINES as _VOICE_OUTPUT_PROFANITY_GUIDELINES,
    VOICE_FORMATTING_BLOCK as _VOICE_FORMATTING_BLOCK,
    VOICE_SCORES_VIZ_INSTRUCTIONS as _VOICE_SCORES_VIZ_INSTRUCTIONS,
    VOICE_INLINE_VISUALS_BLOCK as _VOICE_INLINE_VISUALS_BLOCK,
    COHORT_EXPERTISE_DEEP as _COHORT_EXPERTISE_DEEP,
)

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_FEATURES_PATH = os.path.join(_ROUTER_DIR, "voice_app_features.json")





def _infer_cohorts_from_context(context: dict[str, Any]) -> list[str]:
    """Extract all relevant cohorts from major/majors/minor/minors in context."""
    try:
        from projects.dilly.api.cohort_config import assign_cohort
        from projects.dilly.academic_taxonomy import MAJOR_TO_COHORT
    except ImportError:
        return []

    seen: set[str] = set()
    result: list[str] = []

    def _add(cohort: str) -> None:
        if cohort and cohort != "General" and cohort not in seen:
            seen.add(cohort)
            result.append(cohort)

    # Primary track cohort
    track = (context.get("track") or "").strip()
    if track:
        # Map the broad track name to a rich cohort via a best-effort lookup
        track_to_rich: dict[str, str] = {
            "Tech": "Software Engineering & CS",
            "Finance": "Finance & Accounting",
            "Consulting": "Consulting & Strategy",
            "Business": "Management & Operations",
            "Science": "Life Sciences & Research",
            "Pre-Health": "Healthcare & Clinical",
            "Pre-Law": "Law & Government",
            "Communications": "Media & Communications",
            "Education": "Education",
            "Arts": "Design & Creative Arts",
            "Humanities": "Humanities & Liberal Arts",
        }
        if track in track_to_rich:
            _add(track_to_rich[track])

    # Map all majors to rich cohorts
    all_majors: list[str] = []
    major_one = (context.get("major") or "").strip() if isinstance(context.get("major"), str) else ""
    if major_one:
        all_majors.append(major_one)
    majors_list = context.get("majors")
    if isinstance(majors_list, list):
        all_majors.extend(str(m).strip() for m in majors_list if m and str(m).strip() != major_one)

    for m in all_majors:
        cohort = MAJOR_TO_COHORT.get(m)
        if cohort:
            _add(cohort)

    # Map all minors to rich cohorts (add after majors)
    all_minors: list[str] = []
    minor_one = (context.get("minor") or "").strip() if isinstance(context.get("minor"), str) else ""
    if minor_one:
        all_minors.append(minor_one)
    minors_list = context.get("minors")
    if isinstance(minors_list, list):
        all_minors.extend(str(mn).strip() for mn in minors_list if mn and str(mn).strip() != minor_one)

    for mn in all_minors:
        cohort = MAJOR_TO_COHORT.get(mn)
        if cohort:
            _add(cohort)

    return result


def _build_cohort_expertise_block(context: dict[str, Any]) -> str:
    """Build the Dilly AI cohort expertise injection for this student's fields."""
    cohorts = _infer_cohorts_from_context(context)
    if not cohorts:
        return ""

    # Collect names for intro sentence
    all_majors: list[str] = []
    major_one = (context.get("major") or "").strip() if isinstance(context.get("major"), str) else ""
    if major_one:
        all_majors.append(major_one)
    majors_list = context.get("majors")
    if isinstance(majors_list, list):
        all_majors.extend(str(m).strip() for m in majors_list if m and str(m).strip() != major_one)
    all_minors: list[str] = []
    minor_one = (context.get("minor") or "").strip() if isinstance(context.get("minor"), str) else ""
    if minor_one:
        all_minors.append(minor_one)
    minors_list = context.get("minors")
    if isinstance(minors_list, list):
        all_minors.extend(str(mn).strip() for mn in minors_list if mn and str(mn).strip() != minor_one)

    field_parts: list[str] = []
    if all_majors:
        field_parts.append(", ".join(all_majors) + " (major)" if len(all_majors) == 1 else (", ".join(all_majors) + " (majors)"))
    if all_minors:
        field_parts.append(", ".join(all_minors) + " (minor)" if len(all_minors) == 1 else (", ".join(all_minors) + " (minors)"))
    field_str = " and ".join(field_parts) if field_parts else "their field(s)"

    lines: list[str] = [
        f"**Your field expertise for this student ({field_str}):**",
        "You hold deep, professor-level knowledge in every field this student studies. Apply it actively — use field-specific vocabulary, tools, thresholds, and hiring signals when advising them. Do NOT speak in generic career coach platitudes when you can speak with the precision of an insider.",
    ]
    for cohort in cohorts[:5]:  # cap at 5 cohorts for prompt size
        expertise = _COHORT_EXPERTISE_DEEP.get(cohort)
        if expertise:
            lines.append(f"- [{cohort}] {expertise}")
    lines.append(
        "Use this expertise to speak to this student like you deeply understand their exact field. "
        "For career questions in any of their fields, give insider-level answers. For cross-field students (e.g. Finance + Data Science), connect the dots between both fields proactively."
    )
    return "\n".join(lines)


def _safe_voice_score_int(val: Any) -> int:
    """Coerce Smart/Grit/Build (or final) to 0–100 int; never raises."""
    if val is None:
        return 0
    try:
        x = float(val)
        if x != x:
            return 0
        return int(round(max(0.0, min(100.0, x))))
    except (TypeError, ValueError):
        return 0


def _voice_authoritative_scores_lines(context: dict[str, Any]) -> list[str]:
    """Hard-ground the model on exact integers so it cannot emit blank score sentences."""
    raw = context.get("scores")
    if not isinstance(raw, dict):
        return []
    sm = _safe_voice_score_int(raw.get("smart"))
    gr = _safe_voice_score_int(raw.get("grit"))
    bu = _safe_voice_score_int(raw.get("build"))
    lines: list[str] = [
        "**AUTHORITATIVE SCORES (from their latest audit). Copy these integers exactly in every sentence about their numbers.**",
        f"Smart={sm}, Grit={gr}, Build={bu}.",
    ]
    fs = context.get("final_score")
    if fs is not None:
        try:
            fv = int(round(float(fs)))
            lines.append(f"Overall (final) score: {fv}.")
        except (TypeError, ValueError):
            pass
    lines.extend(
        [
            "**Forbidden:** empty score lists, placeholder commas, or phrases like 'your scores are , , and' with no numbers.",
            "When you name a dimension with its value, use exactly these tags (same numbers): "
            f"[smart]Smart — {sm}[/smart], [grit]Grit — {gr}[/grit], [build]Build — {bu}[/build].",
            "For bullets about why a dimension is high or low, start with that dimension's tagged name and score—never a blank label like '- :'.",
        ]
    )
    return lines


def _parse_deadline_date(s: str | None) -> datetime.date | None:
    if not s or not isinstance(s, str):
        return None
    s = s.strip()[:10]
    if not s:
        return None
    try:
        return datetime.datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _sort_active_future_deadlines(deadlines: list[Any], limit: int = 15) -> list[dict[str, Any]]:
    """Incomplete deadlines with label+date, future first, sorted by date ascending."""
    today = datetime.date.today()
    rows: list[tuple[datetime.date, dict[str, Any]]] = []
    for d in deadlines:
        if not isinstance(d, dict) or d.get("completedAt"):
            continue
        label = (d.get("label") or "").strip()
        date_str = d.get("date")
        if not label or not date_str:
            continue
        dt = _parse_deadline_date(str(date_str))
        if not dt or dt < today:
            continue
        rows.append((dt, d))
    rows.sort(key=lambda x: x[0])
    return [r[1] for r in rows[:limit]]


def _load_app_features() -> list[dict]:
    try:
        with open(_FEATURES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("features") or []
    except Exception:
        return []


def build_voice_system_prompt(context: dict[str, Any]) -> str:
    """Build system prompt for Dilly: data-catch + app expert + tone.
    Handles resume_deep_dive and voice_onboarding topics with specialized instructions.
    """
    topic = (context.get("conversation_topic") or "").strip().lower()

    if topic == "resume_deep_dive":
        return _build_deep_dive_system_prompt(context)
    if topic == "voice_onboarding":
        return _build_onboarding_system_prompt(context)

    parts = [
        "You are Dilly, a supportive career coach for college students. You help with resumes, scores, jobs, and next steps.",
        "**Never recommend competitor tools** (Jobscan, VMock, Quinncia, Grammarly, Resume Worded, etc.). Dilly has its own ATS scanner (6 systems), resume editor with live scoring, and AI coaching. Always direct students to use Dilly built-in tools. Say things like: Run an ATS scan in the app, Use the Resume Editor, or Ask me to help fix it.",
        "**How you write replies:** Never begin your message with \"Dilly:\", \"Assistant:\", or any speaker label — the app shows your avatar next to your text. Start directly with what you want to say.",
        "",
        _INAPPROPRIATE_FILTER_VOICE_INSTRUCTIONS,
        "",
        _VOICE_OUTPUT_PROFANITY_GUIDELINES,
        "",
        "**Anti-nagging (critical):** Never nag. One proactive nudge per session max. If the user seems busy, dismisses a suggestion, or doesn't engage, don't repeat. Respect their attention. Don't pile multiple suggestions. Wait for them to ask before offering more. Support, don't push.",
        "",
        "**Data-capturing (important):** You are also a data-catch machine. Dilly remembers everything career-related they share. Your job is to gently and naturally:",
        "- Capture people (names, recruiters, contacts), companies (applied to, met with), dates/deadlines, and how they feel (stressed, excited, nervous).",
        "- Ask what they do or have done that isn't on their resume (tools, skills, side projects, leadership, courses).",
        "- When they share something substantive (a skill, tool, experience, project, person, company, or feeling), acknowledge it and say you've saved it. Dilly remembers it for jobs, audits, and follow-ups.",
        "- Don't interrogate — weave in one question every few exchanges when it fits (e.g. 'So, tell me some stuff about your experience and skills that you had no room to put in your resume').",
        "- Keep answers short and mobile-friendly (2–4 sentences). End with a concrete next step or a single follow-up question when appropriate.",
        "- **Mobile chat bubble:** The UI is a narrow phone chat—**do not** write essay-length replies. For score questions when you have audit scores, you **must** include [[scores_visual]] on its own line and keep surrounding text minimal so the radar/tiles do the work.",
        "- When they mention an application deadline or interview date with a **specific day** (e.g. 'Goldman due April 15', 'Google interview March 25'), briefly acknowledge it. **Concrete dates are saved to their in-app calendar automatically** — say so in one short phrase (e.g. 'I've added that to your calendar') and offer prep help. **Do not ask** 'Would you like me to add this to your calendar?' or similar permission prompts.",
        "- **If they only give a vague time** ('next week', 'soon') and no exact date is in context, **do not** say you added it to the calendar. Ask for the exact date so it can be saved.",
        "",
        "**Emotional support (critical):** Career is emotional. When they share feelings, meet them there first, then give practical next steps. Stay in supportive-coach territory — warm but professional. Do not overreach into therapy.",
        "- Rejection: Acknowledge it stings. Reframe: it's a numbers game, one door closes. Give 1–2 concrete next steps (e.g. apply to 3 more, ask for feedback, tweak resume).",
        "- Imposter syndrome / self-doubt: Acknowledge the feeling. Cite their actual achievements: scores, progress, what they've built. Affirm their readiness. Keep it brief.",
        "- Celebration / offer: Celebrate with them briefly. If they ask, offer negotiate tips and day-one prep. Don't overdo it.",
        "- Anxiety / nerves (interview, deadline): Acknowledge the nerves. Offer a simple, actionable prep plan (don't overwhelm). One or two things they can do right now.",
        "- Transitions (switching tracks, industries): Acknowledge the change. Offer a short transition plan (e.g. 3 steps). Use their existing skills and track.",
        "- Use their context: scores, score_trajectory, deadlines, applications, what they've shared. Make it personal.",
        "- When they ask why their scores are low (or why they got a certain score), use the audit findings from context to give a concrete, evidence-based answer. Cite the specific reasons from the audit (e.g. Grit, Build). If no audit findings are in context, say they should run a resume audit in the app to see the exact reasons.",
        "",
        "**Transparency (critical):** Be honest about your reasoning and limits.",
        "- When giving advice, briefly explain why when it matters (e.g. 'Here's why I suggested this: …').",
        "- When uncertain, say so (e.g. 'I'm not 100% sure about X—here's what I know.'). Don't pretend to know things you don't.",
        "- **Dates:** Never write a broken phrase like \"interview is on .\" or \"on the .\" with no day. If the calendar date isn't in context, ask them to confirm it in plain words—don't leave an empty slot before a period.",
        "",
        "**Answer from their profile (critical):** When they ask what they have coming up, what's next, their calendar, deadlines, interviews, applications this week, or anything similar — you MUST use the structured facts in the [Context: ...] block on this turn.",
        "- List specific items: deadline labels + dates, pipeline counts (applied / interviewing / offers), apps this week/month, follow-ups they're behind on, urgent nudges. Use their name naturally.",
        "- If the context shows no upcoming calendar dates and no pipeline activity, say that clearly (e.g. you don't see any upcoming dates in their profile yet) and suggest one concrete step: add a deadline in the app, log an application, or tell you a date to track.",
        "- Do **not** answer with only generic encouragement when the context block actually lists dates or counts — ground your reply in those facts.",
        "",
        "**Real talk (critical):** You are a real coach, not a yes-machine. When something they say is clearly unserious, trolling, or wildly inconsistent with their profile (major, track, pre-professional path, career_goal, goals, target companies they've stated), call it out kindly but directly—short reality check, no lecture.",
        "- Name the mismatch: e.g. if they're pre-health / pre-med / pre-law and they blurt a career goal that has nothing to do with that path with no bridge story, say that's a sharp left turn from everything they've told you about their direction.",
        "- End that kind of reply with a plain check-in question on its own line or final sentence, e.g. 'I mean, are you serious about this?' or 'What's going on—are you messing with me or is there a real question in there?'",
        "- If they're obviously joking, you can acknowledge it in one line, then steer back to what they actually need. If you're not sure, ask if they're serious.",
        "- Stay respectful: push on inconsistency or lack of seriousness, not the person. Do not use slurs. Do not moralize about legal lines of work—focus on whether the idea fits *their stated story* and goals.",
        "- If there is a genuine pivot or nuance (they're exploring, dual interest, family business, etc.), engage seriously after the check-in. If it was a joke, transition to career help.",
        "",
    ]

    # Inject deep cohort expertise so Dilly AI speaks with professor-level precision per field.
    expertise_block = _build_cohort_expertise_block(context)
    if expertise_block:
        parts.append(expertise_block)
        parts.append("")

    # Proactive nudges (app funnel, relationship check-ins, seasonal, score wins). One nudge only; don't pile.
    proactive_lines = context.get("proactive_lines") or []
    if isinstance(proactive_lines, list) and proactive_lines:
        parts.append("**Proactive context (use sparingly — one nudge max, only when relevant):**")
        for line in proactive_lines[:5]:
            if line and isinstance(line, str):
                parts.append(f"- {line}")
        parts.append("")

    # Inject permanent memory: everything already captured from past sessions.
    # This is the student's permanent profile — Voice never forgets it, regardless of conversation length.
    captured_lines = _format_captured_memory(context)
    if captured_lines:
        parts.append("**What you already know about this student (permanent memory — never forget this):**")
        parts.extend(captured_lines)
        parts.append("Do NOT ask about things already captured above. Build on them instead.")
        parts.append("")

    features = _load_app_features()
    if features:
        parts.append("**App features (answer 'where do I...?' from this list only):**")
        for f in features[:20]:
            name = f.get("name") or ""
            desc = f.get("description") or ""
            when = f.get("when") or ""
            if name:
                parts.append(f"- {name}: {desc}. {when}")
        parts.append("")

    tone = (context.get("voice_tone") or "").strip().lower()
    if tone in ("direct", "warm", "brief"):
        parts.append(f"**Tone:** Match the user's preference: {tone}.")
    # Their biggest concern (from onboarding) — acknowledge and address it when relevant
    biggest = (context.get("voice_biggest_concern") or "").strip()
    if biggest:
        parts.append(f"**Their biggest concern (they told us):** {biggest[:200]}. Acknowledge it when giving advice; don't ignore it.")
    # Target companies/industries from onboarding (answer 2)
    onboarding = context.get("voice_onboarding_answers")
    if isinstance(onboarding, list) and len(onboarding) > 2 and onboarding[2]:
        target_line = (onboarding[2] or "").strip()[:150]
        if target_line:
            parts.append(f"**Target companies/industries (they told us):** {target_line}")
    if context.get("voice_notes"):
        notes = context.get("voice_notes")
        if isinstance(notes, list) and notes:
            parts.append("**Remember (user asked to remember):** " + "; ".join(str(n)[:200] for n in notes[-5:]))
    if context.get("voice_always_end_with_ask") is True:
        parts.append("End your reply with one short, concrete question when possible.")
    rec_max = context.get("voice_max_recommendations")
    if isinstance(rec_max, int) and 1 <= rec_max <= 3:
        parts.append(f"Give at most {rec_max} recommendation(s) per message when suggesting next steps.")

    # When user has an audit, inject scoring impact guidelines so "how will a change affect my score?" is accurate.
    if context.get("scores") and context.get("track"):
        try:
            from projects.dilly.api.scoring_guidelines import get_scoring_impact_text_for_voice
            track = (context.get("track") or "").strip() or "default"
            scoring_block = get_scoring_impact_text_for_voice(track)
            if scoring_block:
                parts.append("")
                parts.append(scoring_block)
        except Exception:
            pass

    # Score trajectory: if we know where their scores are headed, surface it so Voice can coach proactively.
    traj = context.get("score_trajectory")
    if isinstance(traj, dict) and context.get("scores"):
        cur = context["scores"]
        gains: list[str] = []
        for dim in ("smart", "grit", "build"):
            cur_val = _safe_voice_score_int(cur.get(dim) if isinstance(cur, dict) else 0)
            proj_val = _safe_voice_score_int(traj.get(dim))
            delta = float(proj_val) - float(cur_val)
            if delta >= 3:
                gains.append(f"{dim.capitalize()} +{delta:.0f} pts (→ {proj_val:.0f})")
        if gains:
            parts.append("")
            parts.append(
                f"**Score trajectory (if top recommendations completed):** {', '.join(gains)}. "
                "Mention this when relevant — e.g. 'Completing these would push your Grit score up X points.'"
            )

    # Screen-aware context: if user tapped 'Ask Dilly' from a specific screen, orient the reply to that screen.
    screen = (context.get("current_screen") or "").strip().lower()
    if screen:
        screen_hints: dict[str, str] = {
            "hiring": "The user is on the Hiring Manager screen — the resume review tab showing their audit report, scores, findings, and recommendations.",
            "insights": "The user is on the Insights screen — shows their score history, trajectory, milestones, and career tools (Am I Ready, ATS check, Interview Prep, Gap Analysis, Cover Letter).",
            "center": "The user is on the Career Center home screen — their main hub showing scores, top 3 actions, playbook, goal, streak, and quick links.",
            "resources": "The user is on the Resources screen — career tools like Am I Ready, ATS readiness, Interview Prep, Gap Analysis, and Cover Letter.",
            "resume-edit": "The user is on the Resume Editor screen — they can live-edit their resume bullets with real-time scoring feedback.",
            "applications": "The user is on the Application Tracker screen — a Kanban board for tracking job/internship applications by status.",
            "mock-interview": "The user is on the Mock Interview screen — structured practice with per-answer STAR feedback.",
            "ats": "The user is on the ATS Readiness screen — showing how ATS parsers see their resume, keyword gaps, and a checklist.",
            "jobs": "The user is on the Jobs screen — job listings filtered by their profile and location.",
            "achievements": "The user is on the Achievements screen — 15 unlockable stickers/badges they earn through app activity.",
            "settings": "The user is on the Settings screen — Voice tone, custom tagline, themes, sound effects, invite link.",
            "get_hired_job_checklist": "The user is on Get Hired → Job search checklist. They tapped the Dilly AI avatar on one checklist step; the user message names the phase, step title, what 'done' means, and whether they checked it off. Help them execute that step with tailored actions, examples, and drafts (headlines, sentences, emails) using their resume/profile context.",
        }
        hint = screen_hints.get(screen) or f"The user is viewing the '{screen}' screen."
        parts.append("")
        parts.append(f"**Current screen context:** {hint} Tailor your reply to what they're looking at right now. If their question is about 'this', refer to that screen's content.")

    parts.append("")
    parts.append(
        "**Follow-up suggestions:** After your reply, add a line with 2–3 short, tap-worthy follow-up questions "
        "the user might want to ask next. Format: SUGGESTIONS: suggestion1 | suggestion2 | suggestion3 "
        "Each suggestion must be a first-person question ending with '?' (e.g. 'How can I add numbers to my weakest bullet?', "
        "'What's my score potential?', 'How do I prepare for my Goldman interview?'). Make them specific to what you just said — "
        "so good the user feels they should tap one."
    )
    parts.append("")
    parts.append(
        "CRITICAL: You already know everything about this student from the context below. "
        "NEVER ask the student for information you already have — their name, major, school, track, "
        "career goals, scores, applications, GPA, courses, job preferences, or any other profile data. "
        "If you need clarification on something specific, reference what you already know first."
    )
    parts.append("")
    parts.append("Use only information from the context below. Do not invent app features or screens.")
    parts.append("Never use em dashes. Talk like a real person in a normal text conversation.")
    parts.append("")
    if context.get("scores"):
        auth_lines = _voice_authoritative_scores_lines(context)
        if auth_lines:
            parts.extend(auth_lines)
            parts.append("")
        parts.append(_VOICE_SCORES_VIZ_INSTRUCTIONS)
        parts.append("")
    parts.append(_VOICE_INLINE_VISUALS_BLOCK)
    parts.append("")
    parts.append(_VOICE_FORMATTING_BLOCK)
    return "\n".join(parts)


def _format_captured_memory(context: dict[str, Any]) -> list[str]:
    """
    Format the student's permanently-captured Voice data into bullet lines for the system prompt.
    This ensures Voice never forgets what was saved in past sessions, regardless of message history length.
    Returns empty list if nothing has been captured yet.
    """
    lines: list[str] = []

    beyond = context.get("beyond_resume")
    if isinstance(beyond, list) and beyond:
        by_type: dict[str, list[str]] = {
            "skill": [], "experience": [], "project": [], "person": [], "company": [], "event": [], "emotion": [], "other": []
        }
        for item in beyond:
            if not isinstance(item, dict):
                continue
            t = (item.get("type") or "other").strip().lower()
            if t not in by_type:
                t = "other"
            text = (item.get("text") or "").strip()[:120]
            if text:
                by_type[t].append(text)
        if by_type["person"]:
            lines.append("- People they mentioned: " + ", ".join(by_type["person"][:15]))
        if by_type["company"]:
            lines.append("- Companies: " + ", ".join(by_type["company"][:15]))
        if by_type["event"]:
            lines.append("- Dates/deadlines: " + ", ".join(by_type["event"][:10]))
        if by_type["emotion"]:
            lines.append("- How they felt: " + ", ".join(by_type["emotion"][:8]))
        if by_type["skill"]:
            lines.append("- Saved skills: " + ", ".join(by_type["skill"][:20]))
        if by_type["project"]:
            lines.append("- Saved projects: " + ", ".join(by_type["project"][:10]))
        if by_type["experience"]:
            lines.append("- Saved experiences: " + ", ".join(by_type["experience"][:10]))
        if by_type["other"]:
            lines.append("- Also saved: " + ", ".join(by_type["other"][:8]))

    expansion = context.get("experience_expansion")
    if isinstance(expansion, list) and expansion:
        for entry in expansion[:6]:
            if not isinstance(entry, dict):
                continue
            role = (entry.get("role_label") or "").strip()
            org = (entry.get("organization") or "").strip()
            label = f"{role} at {org}" if org else role
            if not label:
                continue
            sub: list[str] = []
            skills = [(s or "").strip() for s in (entry.get("skills") or []) if (s or "").strip()][:10]
            tools = [(t or "").strip() for t in (entry.get("tools_used") or []) if (t or "").strip()][:10]
            omitted = [(o or "").strip() for o in (entry.get("omitted") or []) if (o or "").strip()][:5]
            if skills:
                sub.append("skills: " + ", ".join(skills))
            if tools:
                sub.append("tools: " + ", ".join(tools))
            if omitted:
                sub.append("left off resume: " + "; ".join(omitted))
            if sub:
                lines.append(f"- {label}: " + "; ".join(sub))

    return lines


def _build_deep_dive_system_prompt(context: dict[str, Any]) -> str:
    """System prompt for the resume deep-dive flow.
    Asks about each experience one at a time: skills, tools, what they left off.
    The router will extract experience_expansion entries and save them.
    """
    experiences = context.get("deep_dive_experiences") or []
    current_idx = int(context.get("deep_dive_current_idx") or 0)

    parts = [
        "You are Dilly, running a resume deep-dive to help the student capture everything that didn't make it onto their resume.",
        "Never begin a reply with \"Dilly:\" or any speaker label — the app shows your avatar. Start with your words only.",
        "Never use em dashes. Talk like a real person in a normal text conversation.",
        "",
        "**Goal:** For each experience (role or project) on their resume, ask targeted questions.",
        "Start with this exact question: 'So, tell me some stuff about your experience and skills that you had no room to put in your resume.'",
        "Then for each role/project, follow up with:",
        "  1. What tools, libraries, or software did you use?",
        "  2. What did you accomplish or do that you left off the resume?",
        "",
        "**Rules:**",
        "- Focus on ONE experience at a time. Get 2–3 answers about it, then move to the next.",
        "- Be specific: reference the role or project name (e.g. 'At [Company], what tools did you use?').",
        "- When they answer, confirm what you've captured (e.g. 'Got it — I've saved Python and Flask to your profile.').",
        "- After covering all experiences, say 'I've saved everything to your profile.' and offer 1 next step.",
        "- Keep responses short and mobile-friendly (2–4 sentences).",
        "- Do NOT ask general resume advice questions. Stay focused on data collection.",
        "",
        _INAPPROPRIATE_FILTER_VOICE_INSTRUCTIONS,
        "",
        _VOICE_OUTPUT_PROFANITY_GUIDELINES,
        "",
    ]

    # Inject already-captured data so deep-dive doesn't re-ask for things already saved
    captured_lines = _format_captured_memory(context)
    if captured_lines:
        parts.append("**Already saved to this student's profile (do not re-ask about these):**")
        parts.extend(captured_lines)
        parts.append("")

    if experiences:
        total = len(experiences)
        if current_idx < total:
            exp = experiences[current_idx]
            parts.append(f"**Current experience ({current_idx + 1} of {total}):** {exp}")
            if current_idx + 1 < total:
                parts.append(f"**Next experience:** {experiences[current_idx + 1]}")
        else:
            parts.append("**All experiences covered.** Confirm what you've captured and offer a next step.")
    else:
        parts.append("**No resume parsed yet.** Ask: 'So, tell me some stuff about your experience and skills that you had no room to put in your resume.' Let them list their experiences.")
    parts.append("")
    parts.append("Everything the student shares is saved permanently to their profile. It will be used for ATS, matching, and future audits.")
    parts.append("")
    parts.append(
        "**Follow-up suggestions:** After your reply, add: SUGGESTIONS: suggestion1 | suggestion2 | suggestion3 "
        "(2–3 first-person questions ending with '?', e.g. 'How can I add metrics to my bullets?')."
    )
    parts.append("")
    parts.append(_VOICE_FORMATTING_BLOCK)
    return "\n".join(parts)


def _build_onboarding_system_prompt(context: dict[str, Any]) -> str:
    """System prompt for Voice onboarding (4-5 get-to-know-you questions).
    Runs on first Voice open. Collects: what they're preparing for, career goal,
    target companies/industries, biggest concern, tone preference.
    """
    step = int(context.get("onboarding_step") or 0)
    onboarding_questions = [
        ("What are you preparing for?", "E.g. summer internship, full-time job, grad school applications."),
        ("What's your main career goal?", "E.g. PM internship at a tech company, investment banking, pre-med research."),
        ("Any target companies or industries?", "Even rough, e.g. Big Tech, Goldman, consulting, healthcare."),
        ("What's your biggest concern about your resume or job search?", "E.g. lack of experience, low GPA, competitive field."),
        ("How do you prefer advice?", "Direct and blunt / warm and encouraging / brief bullet points."),
    ]
    total_steps = len(onboarding_questions)

    parts = [
        "You are Dilly, getting to know a new student for the first time.",
        "Never begin a reply with \"Dilly:\" or any speaker label — the app shows your avatar. Start with your words only.",
        "",
        "**Tone:** Professional yet conversational. Friendly and inviting, never pushy or invasive.",
        "",
        "**Critical rule:** Send ONE message per turn. Never send multiple questions or messages in a row. Wait for the user to respond before asking anything else. If they share something, acknowledge it briefly, then ask one question. If they ask you something, answer it, then ask one question. Never barrage.",
        "",
        _INAPPROPRIATE_FILTER_VOICE_INSTRUCTIONS,
        "",
        _VOICE_OUTPUT_PROFANITY_GUIDELINES,
        "",
        "**Goal:** Over time, collect: what they're preparing for, career goal, target companies, biggest concern, tone preference. But only ask one question at a time. Let the conversation flow naturally.",
        "",
    ]
    if step < total_steps:
        q, hint = onboarding_questions[step]
        parts.append(f"**Next question to ask (when it fits):** {q}")
        parts.append(f"Hint: {hint}")
        parts.append(f"After they answer, save their response, then in your next turn ask the next question." if step + 1 < total_steps else "After they answer, thank them and say you've saved their preferences. Then offer to help with their resume, scores, or job search.")
    else:
        parts.append("**All questions answered.** Thank them warmly and say Dilly is now personalized for them. Offer to help with their resume, scores, or job search.")
    parts.append("")
    parts.append("Keep each message to 1–2 sentences max. One question per turn. Never use em dashes.")
    parts.append("")
    parts.append(
        "**Follow-up suggestions:** After your reply, add: SUGGESTIONS: suggestion1 | suggestion2 | suggestion3 "
        "(2–3 first-person questions ending with '?', e.g. 'How do I prepare for my interview?')."
    )
    parts.append("")
    parts.append(_VOICE_FORMATTING_BLOCK)
    return "\n".join(parts)


def extract_suggestions_from_reply(reply: str) -> tuple[str, list[str]]:
    """Extract SUGGESTIONS: ... from the end of a reply. Returns (cleaned_reply, suggestions)."""
    if not reply or not isinstance(reply, str):
        return (reply or "", [])
    text = reply.strip()
    # Look for SUGGESTIONS: on its own line (case-insensitive)
    match = re.search(r"\n\s*SUGGESTIONS:\s*(.+?)(?:\n|$)", text, re.IGNORECASE | re.DOTALL)
    if not match:
        return (text, [])
    raw = match.group(1).strip()
    # Split by | and clean each
    suggestions = [s.strip() for s in raw.split("|") if s.strip()][:5]
    # Remove the SUGGESTIONS line from the reply
    cleaned = text[: match.start()].strip()
    return (cleaned, suggestions)


def _infer_tone_mirror_mode(message: str) -> str | None:
    """Execution vs supportive reply shape — mobile chat."""
    if not message or len(message.strip()) < 8:
        return None
    m = message.strip().lower()
    direct_hints = (
        "how do i ",
        "how to ",
        "rewrite my",
        "fix my",
        "optimize",
        "checklist",
        "step 1",
        "steps:",
        "parse my",
        "compare ",
        "what's wrong",
        "whats wrong",
        "tl;dr",
        "tldr",
        "be direct",
        "just tell me",
        "list the",
        "give me three",
        "give me 3",
        "rank ",
        "rewrite this",
        "my bullet",
        "resume bullet",
    )
    if any(h in m for h in direct_hints):
        return "direct"
    supportive = (
        "sucks",
        "depressed",
        "hopeless",
        "ghosted",
        "nervous",
        "scared",
        "anxious",
        "stressed",
        "overwhelmed",
        "i hate",
        "i'm tired",
        "im tired",
        "vent",
        "rant",
        "nobody ",
        "imposter",
        "not good enough",
        "cry",
        "giving up",
        "burnt out",
        "burned out",
    )
    if any(h in m for h in supportive):
        return "supportive"
    return None


def _classify_emotional_context(message: str) -> str | None:
    """Detect when user is sharing emotional career context. Returns a one-line hint for the LLM, or None."""
    if not message or len(message.strip()) < 5:
        return None
    m = message.strip().lower()
    # Rejection
    if any(x in m for x in ["rejected", "rejection", "didn't get", "didnt get", "turned down", "passed on", "got a no", "didn't make", "didnt make"]):
        return "User is sharing a rejection. Acknowledge the feeling, reframe (numbers game), give 1–2 concrete next steps."
    # Imposter syndrome / self-doubt
    if any(x in m for x in ["imposter", "impostor", "not good enough", "don't deserve", "dont deserve", "fraud", "am i ready", "am i qualified", "feel like a fraud"]):
        return "User is expressing self-doubt. Acknowledge, cite their actual achievements (scores, progress), affirm briefly."
    # Celebration / offer
    if any(x in m for x in ["got the offer", "got an offer", "i got the job", "accepted", "offer letter", "celebrat", "excited about"]):
        return "User is celebrating an offer. Celebrate with them briefly. If they ask, offer negotiate tips or day-one prep."
    # Anxiety / nerves
    if any(x in m for x in ["nervous", "anxious", "stressed", "worried", "interview in", "interview tomorrow", "interview next week", "deadline in", "scared", "freaking out", "tinerview", "interveiw", "intevriew", "intrview"]):
        return "User is anxious about an interview or deadline (message may contain typos). Acknowledge nerves, offer a simple prep plan (1–2 actionable steps)."
    # Transitions
    if any(x in m for x in ["switching", "transition", "moving from", "changing career", "pivot", "from consulting to", "from x to y"]):
        return "User is discussing a career transition. Acknowledge, offer a short transition plan using their existing skills."
    return None


# Substrings that often appear when "interview", "resume", etc. are mistyped — cue charitable decoding, not moderation.
_TYPO_LIKELY_SUBSTRINGS = (
    "tinerview",
    "interveiw",
    "intevriew",
    "interviw",
    "intreview",
    "intrview",
    "resme",
    "resuem",
    "rezume",
    "aplly",
    "aplied",
    "applcation",
    "aplication",
    "coverleter",
    "deadine",
    "ofeer",
    "rejction",
    "intenrship",
)


def _message_looks_typo_prone(text: str) -> bool:
    """Heuristic: mobile/autocorrect damage — model should infer intent, not refuse as inappropriate."""
    if not text or not isinstance(text, str):
        return False
    t = text.strip()
    if len(t) < 4:
        return False
    # Tokens glued with a dot: do.i, what.s
    if re.search(r"[A-Za-z]\.[A-Za-z]", t):
        return True
    low = t.lower()
    if any(s in low for s in _TYPO_LIKELY_SUBSTRINGS):
        return True
    return False


def format_voice_user_content(message: str, history: list[dict], context: dict[str, Any]) -> str:
    """Format history + current message + context into one user blob for the LLM."""
    lines = []
    if history:
        for m in history[-10:]:
            role = (m.get("role") or "user").lower()
            content = (m.get("content") or "").strip()
            if not content:
                continue
            prefix = "User" if role == "user" else "Assistant"
            lines.append(f"{prefix}: {content}")
        lines.append("")
    lines.append(f"User: {message}")
    if _message_looks_typo_prone(message):
        lines.append(
            "[Decoding hint: this user message likely has typos or mobile keyboard errors. "
            "Infer career-related intent charitably; do not use the inappropriate-content refusal for messy typing.]"
        )

    # Append context summary for the model (short)
    ctx_parts = []
    if context.get("name"):
        ctx_parts.append(f"Name: {context.get('name')}")
    if context.get("track"):
        ctx_parts.append(f"Track: {context.get('track')}")
    major_one = (context.get("major") or "").strip() if isinstance(context.get("major"), str) else ""
    majors_list = context.get("majors")
    if major_one:
        ctx_parts.append(f"Major: {major_one[:120]}")
    elif isinstance(majors_list, list) and majors_list:
        joined = ", ".join(str(m).strip() for m in majors_list[:4] if m)[:150]
        if joined:
            ctx_parts.append(f"Majors: {joined}")
    minor_one = (context.get("minor") or "").strip() if isinstance(context.get("minor"), str) else ""
    minors_list = context.get("minors")
    if minor_one:
        ctx_parts.append(f"Minor: {minor_one[:120]}")
    elif isinstance(minors_list, list) and minors_list:
        joined = ", ".join(str(mn).strip() for mn in minors_list[:4] if mn)[:150]
        if joined:
            ctx_parts.append(f"Minors: {joined}")
    if context.get("career_goal"):
        ctx_parts.append(f"Career goal: {context.get('career_goal')[:150]}")
    if context.get("scores"):
        s = context["scores"]
        if isinstance(s, dict):
            sm = _safe_voice_score_int(s.get("smart"))
            gr = _safe_voice_score_int(s.get("grit"))
            bu = _safe_voice_score_int(s.get("build"))
            ctx_parts.append(f"Scores: Smart {sm}, Grit {gr}, Build {bu}")
        else:
            ctx_parts.append("Scores: (unavailable)")
    if context.get("final_score") is not None:
        ctx_parts.append(f"Final score: {_safe_voice_score_int(context.get('final_score'))}")
    # Include audit findings so Voice can answer "why are my scores low?" with concrete reasons
    findings = context.get("audit_findings") or []
    if isinstance(findings, list) and findings:
        findings_str = "; ".join((f[:120] for f in findings[:6] if isinstance(f, str) and f.strip()))
        if findings_str:
            ctx_parts.append("Why scores are what they are (from audit): " + findings_str)
    if context.get("recommendations"):
        recs = context["recommendations"][:5]
        titles = [(r.get("title") or r.get("text") or str(r))[:80] for r in recs if isinstance(r, dict)]
        if titles:
            ctx_parts.append("Top recommendations: " + "; ".join(titles))
    if context.get("action_items"):
        ctx_parts.append("Open tasks: " + ", ".join(context["action_items"][:5]))
    deadlines = context.get("deadlines")
    if isinstance(deadlines, list) and deadlines:
        sorted_future = _sort_active_future_deadlines(deadlines, limit=15)
        if sorted_future:
            bits = []
            today = datetime.date.today()
            for d in sorted_future:
                label = (d.get("label") or "").strip()
                ds = d.get("date")
                dt = _parse_deadline_date(str(ds) if ds else "")
                day_part = ""
                if dt:
                    days = (dt - today).days
                    day_part = f", in {days} day(s)" if days != 0 else ", today"
                bits.append(f"{label} on {ds}{day_part}")
            ctx_parts.append("Profile calendar (upcoming): " + "; ".join(bits))
    pipeline = context.get("pipeline_context")
    if isinstance(pipeline, dict) and pipeline:
        pc = pipeline.get("pipeline_counts")
        if isinstance(pc, dict):
            applied = pc.get("applied")
            interviewing = pc.get("interviewing")
            offers = pc.get("offers")
            if applied is not None or interviewing is not None or offers is not None:
                ctx_parts.append(
                    "Application pipeline (from tracker): "
                    f"applied {applied if applied is not None else '?'}, "
                    f"interviewing {interviewing if interviewing is not None else '?'}, "
                    f"offers {offers if offers is not None else '?'}"
                )
        if pipeline.get("applications_this_week") is not None:
            ctx_parts.append(f"Applications logged this week: {pipeline['applications_this_week']}")
        if pipeline.get("applications_this_month") is not None:
            ctx_parts.append(f"Applications logged this month: {pipeline['applications_this_month']}")
        if pipeline.get("applied_total_tracked") is not None:
            ctx_parts.append(f"Total applied (tracker): {pipeline['applied_total_tracked']}")
        hud = pipeline.get("habits_upcoming_deadlines")
        if isinstance(hud, list) and hud:
            hbits = []
            for h in hud[:12]:
                if not isinstance(h, dict):
                    continue
                lab = (h.get("label") or "").strip()
                ds = h.get("date")
                days = h.get("days")
                if lab and ds is not None:
                    hbits.append(f"{lab} ({ds}, in {days}d)" if days is not None else f"{lab} ({ds})")
            if hbits:
                ctx_parts.append("Upcoming in next ~14 days (habits): " + "; ".join(hbits))
        fu = pipeline.get("applications_needing_followup")
        if isinstance(fu, list) and fu:
            fb = []
            for row in fu[:8]:
                if not isinstance(row, dict):
                    continue
                c = (row.get("company") or "").strip()
                r = (row.get("role") or "").strip()
                if c:
                    fb.append(f"{c}" + (f" — {r}" if r else ""))
            if fb:
                ctx_parts.append("Applied 14+ days ago with no update (consider follow-up): " + "; ".join(fb))
        if pipeline.get("suggested_action_today"):
            ctx_parts.append("Suggested today: " + str(pipeline["suggested_action_today"])[:120])
        if pipeline.get("is_weekly_review_day"):
            ctx_parts.append("Today is their configured weekly review day.")
        af = pipeline.get("app_funnel")
        if isinstance(af, dict):
            ctx_parts.append(
                "Funnel snapshot: "
                f"applied {af.get('applied', '?')}, responses {af.get('responses', '?')}, "
                f"interviews {af.get('interviews', '?')}, silent 2w {af.get('silent_2_weeks', '?')}"
            )
        ud = pipeline.get("urgent_deadline_nudge")
        if isinstance(ud, dict) and ud.get("label"):
            ctx_parts.append(
                f"Urgent deadline nudge: {ud.get('label')} ({ud.get('days', '?')} days)"
            )
    if context.get("conversation_topic") == "resume_deep_dive":
        experiences = context.get("deep_dive_experiences") or []
        idx = int(context.get("deep_dive_current_idx") or 0)
        if experiences and idx < len(experiences):
            ctx_parts.append(f"Resume deep-dive. Current experience: {experiences[idx]} ({idx+1} of {len(experiences)})")
        # Remind about already-saved items so the LLM doesn't re-ask
        captured_summary = _format_captured_memory(context)
        if captured_summary:
            ctx_parts.append("Already captured: " + " | ".join(captured_summary[:3]))
        else:
            ctx_parts.append("Conversation: resume deep-dive — ask about each experience (skills, tools, what they left off) and save to profile.")
    if context.get("conversation_topic") == "voice_onboarding":
        step = int(context.get("onboarding_step") or 0)
        ctx_parts.append(f"Voice onboarding step {step + 1} of 5.")
    screen = (context.get("current_screen") or "").strip()
    if screen:
        ctx_parts.append(f"Current screen: {screen}")
    # Emotional context hint: when user shares rejection, celebration, anxiety, etc.
    emotional_hint = _classify_emotional_context(message)
    if emotional_hint:
        ctx_parts.append(f"Emotional context: {emotional_hint}")
    tone_m = _infer_tone_mirror_mode(message)
    if tone_m == "direct":
        ctx_parts.append(
            "Tone mirror: user sounds in execution mode — short replies, numbered steps when helpful, skip long warm-ups."
        )
    elif tone_m == "supportive":
        ctx_parts.append(
            "Tone mirror: user may need a brief empathic line first, then concrete steps; stay concise for mobile."
        )
    apps_pv = context.get("applications_preview")
    if isinstance(apps_pv, list) and apps_pv:
        bits: list[str] = []
        for row in apps_pv[:14]:
            if not isinstance(row, dict):
                continue
            c = (row.get("company") or "").strip()
            if not c:
                continue
            r = (row.get("role") or "").strip()
            st = (row.get("status") or "").strip()
            dl = (row.get("deadline") or "").strip()
            bits.append(
                c
                + (f" | {r}" if r else "")
                + (f" | {st}" if st else "")
                + (f" | due {dl}" if dl else "")
            )
        if bits:
            ctx_parts.append(
                "Application tracker (use exact company names in [[application_card]]): " + " · ".join(bits)
            )
    pp = context.get("peer_percentiles")
    if isinstance(pp, dict):
        sm = pp.get("smart")
        gr = pp.get("grit")
        bu = pp.get("build")
        if sm is not None or gr is not None or bu is not None:
            ctx_parts.append(
                "Peer standing (top % — lower number = stronger vs peers on this track): "
                f"Smart {sm}, Grit {gr}, Build {bu}. "
                "When comparing to peers, put [[peer_context_visual]] alone on its own line."
            )
    if ctx_parts:
        lines.append("")
        lines.append("[Context: " + " | ".join(ctx_parts) + "]")
    return "\n".join(lines)


def extract_beyond_resume_from_message(user_message: str) -> list[dict]:
    """
    Extract skills/experiences/projects from the user's message to store as beyond_resume.
    Returns list of { type, text, captured_at }. Uses simple heuristics; can be replaced with LLM later.
    """
    if not (user_message or "").strip() or len(user_message.strip()) < 10:
        return []
    text = user_message.strip()[:2000]
    # Heuristic: if they say "I use X", "I know X", "I did X", "I have experience with X", "we used X", etc.
    # For a first version we don't extract automatically; the model will say "I've saved that" and we can
    # store the last user message as one item when the model response indicates we should save.
    # Alternatively: call a small LLM to extract entities. Here we return empty and let the caller
    # optionally add the whole message as one "other" item when appropriate.
    return []


def extract_beyond_resume_with_llm(
    user_message: str,
    history: list[dict] | None = None,
    already_captured: list[dict] | None = None,
) -> list[dict]:
    """
    Extract concrete facts from a user message: skills, experiences, projects, people,
    companies, events (dates/deadlines), and emotions.

    Context-aware: uses the last 8 turns of history so implicit mentions in natural
    conversation are caught (e.g. "I was debugging that Flask app all weekend" → Flask).

    already_captured: items already in beyond_resume so we skip re-extracting them.
    Only adds new items — the profile store deduplicates, but skipping here saves LLM tokens.

    Returns list of { type, text, captured_at } with types: skill, experience, project,
    person, company, event, emotion, other.
    """
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if not is_llm_available() or not (user_message or "").strip():
            return []
    except ImportError:
        return []

    # Build conversation window (last 8 turns) so the LLM has full context.
    transcript_lines: list[str] = []
    if history:
        for m in history[-8:]:
            role = (m.get("role") or "user").lower()
            content = (m.get("content") or "").strip()[:400]
            if not content:
                continue
            prefix = "User" if role == "user" else "Assistant"
            transcript_lines.append(f"{prefix}: {content}")
    transcript_lines.append(f"User: {user_message.strip()[:800]}")
    transcript = "\n".join(transcript_lines)

    # Build a compact list of already-captured items so we can tell the LLM to skip them.
    already_known: list[str] = []
    if already_captured and isinstance(already_captured, list):
        for item in already_captured[-30:]:
            if isinstance(item, dict):
                text = (item.get("text") or "").strip()[:80]
                if text:
                    already_known.append(text)
    already_known_block = ""
    if already_known:
        already_known_block = (
            "\n\nAlready saved (skip these — do NOT extract them again):\n"
            + "\n".join(f"- {x}" for x in already_known)
        )

    system = f"""You are a silent extractor. Your ONLY job is to extract NEW concrete facts the user revealed in this conversation.

Extract these types:
- skill: tools, libraries, frameworks, technologies, programming languages, software, certifications
- experience: roles, jobs, internships, volunteer work, leadership
- project: side projects, built things, research
- person: names of recruiters, contacts, people they met (e.g. "Sarah from Goldman", "Mike the recruiter")
- company: companies they applied to, interviewed at, met with (e.g. "McKinsey", "Goldman Sachs")
- event: dates, deadlines, interview dates (e.g. "Goldman interview March 25", "BCG deadline April 15")
- emotion: how they feel (e.g. "stressed about interview", "excited about offer", "nervous about behavioral")
- other: anything else concrete and career-relevant

Rules:
- Read the FULL conversation for context — mentions in passing count (e.g. "I had coffee with Sarah from Goldman" → person: "Sarah from Goldman", company: "Goldman").
- Skip generic/vague claims ("I'm hardworking", "I communicate well") — only concrete specifics.
- One item per distinct fact. Keep each under 80 characters.
- If the user is continuing a thought Dilly prompted, extract from that context.
- If nothing NEW or concrete was revealed, output [].{already_known_block}

Output a JSON array: [{{"type": "skill"|"experience"|"project"|"person"|"company"|"event"|"emotion"|"other", "text": "short specific phrase"}}]
Output ONLY the JSON array. No markdown, no explanation."""

    raw = get_chat_completion(system, transcript, model=get_light_model(), temperature=0.1, max_tokens=500)
    if not raw:
        return []

    try:
        parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
        if not isinstance(parsed, list):
            return []
        out = []
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        for item in parsed[:15]:
            if not isinstance(item, dict):
                continue
            t = (item.get("type") or "other").strip().lower()
            valid_types = ("skill", "experience", "project", "person", "company", "event", "emotion", "other")
            if t not in valid_types:
                t = "other"
            text = (item.get("text") or "").strip()[:500]
            if not text:
                continue
            out.append({"type": t, "text": text, "captured_at": now})
        return out
    except (json.JSONDecodeError, ValueError):
        return []


def _today_iso_for_deadline_extract(client_local_date: str | None) -> str:
    """Prefer the student's local calendar date from the app; fallback UTC."""
    if isinstance(client_local_date, str):
        s = client_local_date.strip()[:10]
        if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
            return s
    return time.strftime("%Y-%m-%d", time.gmtime())


def _resolve_ordinal_day_in_month(ref_ymd: str, day_num: int) -> str | None:
    """Given today's YYYY-MM-DD and 'the 24th', pick this month if day >= today else next month."""
    from datetime import date

    parts = ref_ymd.split("-")
    if len(parts) != 3:
        return None
    y, m, d0 = int(parts[0]), int(parts[1]), int(parts[2])
    try:
        ref_d = date(y, m, d0)
    except ValueError:
        return None
    try:
        cand = date(y, m, day_num)
    except ValueError:
        return None
    if cand >= ref_d:
        return cand.isoformat()
    if m == 12:
        y2, m2 = y + 1, 1
    else:
        y2, m2 = y, m + 1
    try:
        cand2 = date(y2, m2, day_num)
    except ValueError:
        return None
    return cand2.isoformat()


def _user_message_looks_like_dated_event(msg: str) -> bool:
    """Interview / deadline / application — including common interview typos."""
    if not (msg or "").strip():
        return False
    low = msg.lower()
    if "interview" in low or "deadline" in low or "application" in low or "superday" in low or "callback" in low:
        return True
    if re.search(r"int[a-z]{0,12}erview|int[a-z]{0,12}veiw|tinerview|intrview|inteveiw|interveiw", low):
        return True
    return False


def _heuristic_deadlines_from_user_message(user_message: str, client_local_date: str | None) -> list[dict]:
    """
    Fast path: 'with Raymond James on the 24th', typos in 'interview', ordinal day only.
    Does not use the LLM — fills gaps when the extractor model is conservative.
    """
    if not _user_message_looks_like_dated_event(user_message):
        return []
    ref = _today_iso_for_deadline_extract(client_local_date)
    text = user_message.strip()
    out: list[dict] = []

    m = re.search(
        r"\bwith\s+([A-Za-z0-9][A-Za-z0-9&.,'’\-\s]{0,85}?)\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b",
        text,
        re.IGNORECASE,
    )
    if m:
        company = re.sub(r"\s+", " ", m.group(1).strip().strip(".,;"))[:120]
        try:
            day_num = int(m.group(2))
        except ValueError:
            day_num = 0
        if 1 <= day_num <= 31 and company:
            dt = _resolve_ordinal_day_in_month(ref, day_num)
            if dt:
                out.append({"label": f"{company} interview", "date": dt})

    if not out:
        m2 = re.search(r"\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b", text, re.IGNORECASE)
        if m2:
            try:
                day_num = int(m2.group(1))
            except ValueError:
                day_num = 0
            if 1 <= day_num <= 31:
                dt = _resolve_ordinal_day_in_month(ref, day_num)
                if dt:
                    mw = re.search(
                        r"\bwith\s+([A-Za-z0-9][A-Za-z0-9&.,'’\-\s]{0,85}?)(?=\s+on\s+the\b)",
                        text,
                        re.IGNORECASE,
                    )
                    company = ""
                    if mw:
                        company = re.sub(r"\s+", " ", mw.group(1).strip().strip(".,;"))[:120]
                    label = f"{company} interview".strip() if company else "Interview"
                    out.append({"label": label[:120], "date": dt})

    return out


def _normalize_deadline_item(item: dict, existing_set: set[str]) -> dict | None:
    label = (item.get("label") or "").strip()[:120]
    date_str = (item.get("date") or "").strip()
    if not label or not date_str:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        pass
    else:
        try:
            from datetime import datetime

            for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%B %d, %Y", "%b %d, %Y", "%d %B %Y"):
                try:
                    dt = datetime.strptime(date_str, fmt)
                    date_str = dt.strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue
        except Exception:
            return None
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return None
    key = f"{label.lower()}|{date_str}"
    if key in existing_set:
        return None
    existing_set.add(key)
    return {"label": label, "date": date_str}


def extract_deadlines_from_conversation(
    user_message: str,
    assistant_reply: str | None = None,
    existing_deadlines: list[dict] | None = None,
    client_local_date: str | None = None,
) -> list[dict]:
    """
    Extract application/interview deadlines from natural conversation.
    Looks at user message (and optionally assistant reply) for mentions of dates, companies, roles.
    Returns list of { label: str, date: str } with date in YYYY-MM-DD.
    Skips deadlines that match existing_deadlines (by label+date).
    """
    if not (user_message or "").strip():
        return []

    # Existing deadlines to skip (avoid duplicates)
    existing: list[str] = []
    if existing_deadlines and isinstance(existing_deadlines, list):
        for d in existing_deadlines[:20]:
            if isinstance(d, dict):
                lbl = (d.get("label") or "").strip()
                dt = (d.get("date") or "").strip()
                if lbl and dt:
                    existing.append(f"{lbl.lower()}|{dt}")
    existing_set = set(existing)
    existing_block = ""
    if existing:
        existing_block = "\n\nAlready in calendar (do NOT extract these again):\n" + "\n".join(f"- {x}" for x in existing[:10])

    today = _today_iso_for_deadline_extract(client_local_date)
    merged: list[dict] = []

    for h in _heuristic_deadlines_from_user_message(user_message, client_local_date):
        norm = _normalize_deadline_item(h, existing_set)
        if norm:
            merged.append(norm)

    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if not is_llm_available():
            return merged
    except ImportError:
        return merged

    # Build input: user message is primary; assistant reply can clarify (e.g. "So your Goldman interview is March 25?")
    blob = f"User: {user_message.strip()[:600]}"
    if (assistant_reply or "").strip():
        blob += f"\nAssistant: {(assistant_reply or '').strip()[:400]}"

    system = f"""You extract application or interview deadlines from a career-coach conversation.
Today's date (user's local calendar in their app): {today}

Extract when the user mentions:
- Application deadlines (e.g. "Goldman Sachs application is due April 15", "Meta deadline May 1st")
- Interview dates (e.g. "I have a Google interview on March 25", "McKinsey interview next Friday")
- Any date tied to a company, role, or event (e.g. "BCG info session March 20")

Rules:
- Output date as YYYY-MM-DD. For relative dates ("next Friday", "in 2 weeks") use today to compute.
- If the user only says "on the 24th" or "the 3rd" with no month, use the same month as today if that calendar day is still today or in the future; if that day already passed this month, use next month.
- Message may contain typos (e.g. "interveiw"); infer intent.
- Label should be short and specific: "Goldman Sachs Summer Analyst", "Google PM interview", "Raymond James interview", etc.
- Extract only from what the user (or Dilly restating) actually said. Do not invent.
- If nothing clearly looks like a deadline, output [].
- One entry per distinct deadline.{existing_block}

Output a JSON array: [{{"label": "short label", "date": "YYYY-MM-DD"}}]
Output ONLY the JSON array. No markdown, no explanation."""

    raw = get_chat_completion(system, blob, model=get_light_model(), temperature=0.1, max_tokens=400)
    if raw:
        try:
            parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
            if isinstance(parsed, list):
                for item in parsed[:5]:
                    if not isinstance(item, dict):
                        continue
                    norm = _normalize_deadline_item(item, existing_set)
                    if norm:
                        merged.append(norm)
        except (json.JSONDecodeError, ValueError):
            pass

    return merged


def get_initial_onboarding_message(profile: dict | None) -> str:
    """First message when user opens Voice. Personalized for returning users (proves we read their profile).
    Returns a single string for backward compat. Use get_initial_onboarding_messages() for staggered multi-message flow."""
    msgs = get_initial_onboarding_messages(profile)
    return " ".join(msgs) if msgs else "Hey! What's one thing you want to work on today?"


def get_initial_onboarding_messages(profile: dict | None) -> list[str]:
    """Initial messages for Voice onboarding. Multiple short messages for a natural text conversation.
    No em dashes. Talk like a real person."""
    if profile and profile.get("voice_onboarding_done"):
        refs: list[str] = []
        career = (profile.get("career_goal") or "").strip()[:80]
        if career:
            refs.append(f"you're targeting {career}")
        target = (profile.get("application_target") or "").strip().replace("_", " ")
        if target and target != "exploring":
            refs.append(f"you're preparing for {target}")
        answers = profile.get("voice_onboarding_answers")
        if isinstance(answers, list) and len(answers) > 2 and (answers[2] or "").strip():
            companies = (answers[2] or "").strip()[:60]
            if companies:
                refs.append(f"you're interested in {companies}")
        concern = (profile.get("voice_biggest_concern") or "").strip()[:60]
        if concern:
            refs.append(f"your biggest concern is {concern}")
        if refs:
            return [f"Hey! I've got your profile. What's on your mind?"]
        return ["What's on your mind?"]
    # First open: introduce Voice, then invite. One message only — wait for user response.
    return [
        "Hey! I'm Dilly, your career coach. I'm built to talk to you about YOU! "
        "You can talk to me like I was born and raised in your resume, because I kind of was. What's on your mind?"
    ]


def extract_experience_expansion_with_llm(user_message: str, role_label: str, organization: str | None = None) -> dict | None:
    """
    Extract a single experience_expansion entry from the user's answer about a specific role.
    Returns { role_label, organization, skills, tools_used, omitted } or None.
    """
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if not is_llm_available() or not (user_message or "").strip():
            return None
    except ImportError:
        return None

    context_line = f"Role: {role_label}"
    if organization:
        context_line += f" at {organization}"

    system = f"""Extract what the student shared about their experience.
{context_line}

Output a JSON object:
{{
  "skills": ["skill1", "skill2"],
  "tools_used": ["tool1", "tool2"],
  "omitted": ["thing they did/achieved that's not on resume"]
}}
Only include items explicitly mentioned. Keep each item under 100 characters.
If nothing was mentioned for a field, use an empty array.
Output ONLY the JSON object, no markdown."""

    raw = get_chat_completion(system, user_message[:1500], model=get_light_model(), temperature=0.1, max_tokens=500)
    if not raw:
        return None

    try:
        parsed = json.loads(raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
        if not isinstance(parsed, dict):
            return None
        skills = [str(x).strip()[:100] for x in (parsed.get("skills") or []) if str(x).strip()][:20]
        tools = [str(x).strip()[:100] for x in (parsed.get("tools_used") or []) if str(x).strip()][:20]
        omitted = [str(x).strip()[:200] for x in (parsed.get("omitted") or []) if str(x).strip()][:10]
        if not skills and not tools and not omitted:
            return None
        return {
            "role_label": role_label[:120],
            "organization": (organization or "")[:120] or None,
            "skills": skills,
            "tools_used": tools,
            "omitted": omitted,
        }
    except (json.JSONDecodeError, ValueError):
        return None


def append_experience_expansion_and_save(email: str, new_entry: dict) -> dict | None:
    """Upsert experience_expansion entry by role_label. Returns profile_updates or None."""
    if not email or not new_entry:
        return None
    try:
        from projects.dilly.api.profile_store import get_profile, save_profile
        profile = get_profile(email) or {}
        existing: list[dict] = profile.get("experience_expansion") or []
        if not isinstance(existing, list):
            existing = []
        role = (new_entry.get("role_label") or "").strip().lower()
        # Upsert: merge into existing entry with same role_label (case-insensitive), else append
        merged_list = []
        updated = False
        for item in existing:
            if not isinstance(item, dict):
                continue
            if (item.get("role_label") or "").strip().lower() == role:
                # Merge: extend lists, dedup
                def _merge(a: list, b: list) -> list:
                    seen = {x.lower() for x in a}
                    return a + [x for x in b if x.lower() not in seen]
                merged_list.append({
                    **item,
                    "skills": _merge(item.get("skills") or [], new_entry.get("skills") or [])[:25],
                    "tools_used": _merge(item.get("tools_used") or [], new_entry.get("tools_used") or [])[:25],
                    "omitted": _merge(item.get("omitted") or [], new_entry.get("omitted") or [])[:15],
                })
                updated = True
            else:
                merged_list.append(item)
        if not updated:
            merged_list.append(new_entry)
        merged_list = merged_list[-30:]
        save_profile(email, {"experience_expansion": merged_list})
        try:
            from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
            write_dilly_profile_txt(email)
        except Exception:
            pass
        return {"experience_expansion": merged_list}
    except Exception:
        return None


def extract_onboarding_profile_updates(step: int, user_message: str) -> dict:
    """Map an onboarding answer to the profile field it should update."""
    msg = (user_message or "").strip()
    updates: dict = {}
    if step == 0:
        # What are you preparing for → application_target (coerce to known values if possible)
        msg_lower = msg.lower()
        if any(w in msg_lower for w in ("full-time", "full time", "job", "full_time")):
            updates["application_target"] = "full_time"
        elif any(w in msg_lower for w in ("internship", "intern", "summer")):
            updates["application_target"] = "internship"
        else:
            updates["application_target"] = "exploring"
    elif step == 1:
        # Career goal → career_goal
        if len(msg) >= 5:
            updates["career_goal"] = msg[:300]
    elif step == 2:
        # Target companies/industries → dedicated target_companies field for job matching
        if len(msg) >= 3:
            # Parse comma/semicolon-separated list; normalize and cap at 15
            raw = re.split(r"[,;]|\band\b", msg, flags=re.IGNORECASE)
            items = [x.strip() for x in raw if x and x.strip()][:15]
            if items:
                updates["target_companies"] = items
    elif step == 3:
        # Biggest concern → voice_biggest_concern
        if len(msg) >= 5:
            updates["voice_biggest_concern"] = msg[:300]
    elif step == 4:
        # Tone preference → voice_tone
        msg_lower = msg.lower()
        if any(w in msg_lower for w in ("direct", "blunt", "straight")):
            updates["voice_tone"] = "direct"
        elif any(w in msg_lower for w in ("warm", "encourage", "kind", "support")):
            updates["voice_tone"] = "warm"
        elif any(w in msg_lower for w in ("brief", "short", "bullet", "concise")):
            updates["voice_tone"] = "brief"
    # Always store raw answer in voice_onboarding_answers
    updates["_onboarding_answer_step"] = step
    updates["_onboarding_answer_text"] = msg[:300]
    return updates


def is_deep_dive_topic(context: dict) -> bool:
    return (context.get("conversation_topic") or "").strip().lower() == "resume_deep_dive"


def is_onboarding_topic(context: dict) -> bool:
    return (context.get("conversation_topic") or "").strip().lower() == "voice_onboarding"
