"""
Scoring impact guidelines for accurate "how will a change affect my score?" answers.

Used by:
- GET /audit/scoring-guidelines (API)
- Voice system prompt when user has an audit (so answers match real formulas).

When a student asks "what if I add X?" or "how will doing Y affect my scores?", the response
must use these numbers so we don't invent or drift from the actual scoring engine.
"""

from __future__ import annotations

from projects.dilly.api.cohort_config import (
    COHORT_SCORING_CONFIG,
    QUANTITATIVE_INDUSTRY_WEIGHTS,
    get_scoring_weights,
    get_recruiter_bar,
    get_reference_phrase,
    get_build_signals,
)

# Re-export helpers so callers that imported from scoring_guidelines still work
__all__ = [
    "get_composite_weights",
    "get_scoring_impact_guide",
    "get_scoring_impact_text_for_voice",
    "get_scoring_weights",
    "get_recruiter_bar",
    "get_reference_phrase",
    "get_build_signals",
]

# Point values from dilly_core/scoring.py and tracks.py (audit_tech). Keep in sync.
_SMART = {
    "base": "GPA × 15 × major_multiplier (major varies; see MAJOR_MULTIPLIERS).",
    "honors": "Each honor/recognition: +10 pts, cap 30 total.",
    "research": "Research signal (lab, publication, PI): +25 pts.",
    "minor": "Minor bonus from research-backed table (e.g. Math/CS +9–10, unlisted = 0).",
}
_GRIT = {
    "quantifiable_impact": "Each quantifiable impact (%, $, or metric in a bullet): +15 pts.",
    "leadership": "Each leadership keyword (lead, president, manager, etc.): +12 pts.",
    "work_entry": "Each work/experience entry with month–year: +5 pts.",
    "international": "International markers (F-1, OPT, study abroad): Grit × 1.10, cap 100.",
}
_BUILD_TECH = {
    "outcome_tied": "Each tech/skill in a bullet with measurable outcome: +8 pts.",
    "project": "Each project/developed/built/deployed mention: +7 pts.",
    "deployed_app": "Deployed app or live link: +12 pts.",
    "hackathon": "Hackathon participation/placement: +10 pts.",
    "recognized_employer": "Internship at recognized tech company: +15 pts.",
    "competitive_programming": "LeetCode, Codeforces, ICPC, etc.: +10 pts.",
    "certifications": "Each cert (AWS, Security+, etc.): +5 pts, cap 15.",
    "rule": "Tech: skills only count when tied to an outcome in the same bullet.",
}
# Typical impact for completing a recommendation (heuristic; used for trajectory/voice).
_REC_IMPACT = {
    "line_edit": {"smart": 0, "grit": 3, "build": 3},
    "action": {"smart": 1, "grit": 2, "build": 2},
    "generic": {"smart": 2, "grit": 3, "build": 4},
}


def get_composite_weights(cohort: str, industry_target: str | None = None) -> tuple[float, float, float]:
    """Return (smart_weight, grit_weight, build_weight) for final score."""
    w = get_scoring_weights(cohort, industry_target)
    return (w["smart"], w["grit"], w["build"])


def get_scoring_impact_guide(cohort: str, industry_target: str | None = None) -> dict:
    """
    Return a structured guide for score-impact answers.
    Keys: summary (short text), smart, grit, build, composite_weights, recommendation_impact.
    """
    ws, wg, wb = get_composite_weights(cohort, industry_target)
    composite = {"smart": ws, "grit": wg, "build": wb}
    ref = get_reference_phrase(cohort, industry_target)
    final_formula = (
        f"Final = {ws:.2f}×Smart + {wg:.2f}×Grit + {wb:.2f}×Build "
        f"(cohort: {cohort or 'General'}, bar: {get_recruiter_bar(cohort, industry_target)}, ref: {ref})."
    )

    parts = [
        "Smart: " + "; ".join(_SMART.values()),
        "Grit: " + "; ".join(_GRIT.values()),
    ]
    if cohort == "Tech":
        parts.append("Build (Tech): " + "; ".join(_BUILD_TECH.values()))
    else:
        signals = get_build_signals(cohort)
        parts.append(f"Build ({cohort}): signals include {', '.join(signals[:8])}{'...' if len(signals) > 8 else ''}.")

    summary = final_formula + " " + " ".join(parts)

    return {
        "cohort": cohort or "General",
        "track": cohort or "General",  # backward compat alias
        "summary": summary,
        "smart": _SMART,
        "grit": _GRIT,
        "build_tech": _BUILD_TECH if cohort == "Tech" else None,
        "build_signals": get_build_signals(cohort),
        "composite_weights": composite,
        "final_formula": final_formula,
        "recommendation_impact": _REC_IMPACT,
        "recruiter_bar": get_recruiter_bar(cohort, industry_target),
        "reference_phrase": get_reference_phrase(cohort, industry_target),
    }


def get_scoring_impact_text_for_voice(cohort: str, industry_target: str | None = None, max_chars: int = 1200) -> str:
    """
    One block of text to inject into Voice system prompt so the model can answer
    "how will a change affect my score?" accurately. Uses real formula constants.
    """
    guide = get_scoring_impact_guide(cohort, industry_target)
    ws = guide["composite_weights"]["smart"]
    wg = guide["composite_weights"]["grit"]
    wb = guide["composite_weights"]["build"]
    bar = guide["recruiter_bar"]
    ref = guide["reference_phrase"]
    lines = [
        "**Scoring impact (use these numbers when the student asks how a change will affect their scores):**",
        f"- Final score = {ws:.2f}×Smart + {wg:.2f}×Grit + {wb:.2f}×Build (cohort: {cohort or 'General'}).",
        f"- Recruiter bar for this cohort: {bar} ({ref}).",
        "- Smart: GPA×15×major multiplier; +10 per honor (cap 30); +25 for research; minor bonus from table.",
        "- Grit: +15 per quantifiable impact (%, $, or metric in a bullet); +12 per leadership keyword; +5 per work entry with month–year.",
        "- Build (Tech): +8 per outcome-tied tech/skill; +7 per project; +12 deployed app; +10 hackathon; +15 recognized employer; +10 competitive programming; certs +5 each cap 15. Skills count only when in a bullet with a measurable outcome.",
        "- Completing a recommendation: line_edit ~+3 to that dimension; action ~+2; generic ~+2–4. Give a range, not a promise.",
    ]
    if cohort and cohort not in ("Tech", "General"):
        signals = get_build_signals(cohort)
        lines.append(f"- Build for {cohort}: key signals include {', '.join(signals[:6])}.")
    text = "\n".join(lines)
    if len(text) > max_chars:
        text = text[: max_chars - 3] + "..."
    return text
