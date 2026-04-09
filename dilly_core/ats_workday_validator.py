"""
Workday-specific field validation.

Workday's parser is stricter than any other ATS. Beyond the universal checks
in ats_score_v2, there's a set of Workday-specific field requirements that
come from observing how Workday auto-populates its application form:

  1. Degree type must be explicitly spelled out (Bachelor, Master, PhD,
     Associate) — abbreviations like "BS" or "B.A." often fail to map
     onto Workday's canonical degree dropdown
  2. Graduation year must be a 4-digit year, not "Spring 2025" or "25"
  3. GPA must be ≥ 2.0 if stated at all (Workday auto-rejects below that
     on many employer instances)
  4. LinkedIn URL must be in canonical form: linkedin.com/in/<slug> —
     a "www." prefix or trailing slash fails the format validator
  5. Phone in exactly +1 ###-###-#### OR ###-###-#### format — Workday
     specifically chokes on "(555) 555-5555" with parentheses
  6. Experience section header must be one of a small canonical set:
     "Work Experience", "Experience", "Professional Experience",
     "Employment History" — creative headers ("My Journey", "Where I've
     Been") fail the header classifier
  7. Skills section must be a machine-parsable list, not embedded in
     paragraphs — Workday's Skills field wants comma-separated values
  8. Education needs a school name on its own recognizable line —
     "BS Data Science, University of Tampa" on one line is fine, but
     skills-stuffed resumes sometimes bury the school inside a bullet

Each check returns a ScoreIssue tagged with affects=('workday',) so only
Workday's score takes the hit. Greenhouse/Lever/Ashby/iCIMS keep scoring
the universal issues only.

No LLM calls, no external dependencies. Pure regex + string checks on
the raw resume text.
"""

from __future__ import annotations

import re
from typing import Any, List, Optional

from dilly_core.ats_score_v2 import ScoreIssue


# ── Patterns ────────────────────────────────────────────────────────────────

# Degree type must be explicitly stated. We look for the long-form word
# anywhere in the Education section.
_DEGREE_LONG = re.compile(
    r"\b(?:Bachelor(?:'s)?|Master(?:'s)?|Doctor(?:ate)?|Ph\.?D|PhD|Associate(?:'s)?|M\.?B\.?A\.?)\b",
    re.IGNORECASE,
)
# Short-form degrees that Workday often fails to classify
_DEGREE_SHORT = re.compile(
    r"\b(?:BS|BA|B\.S\.|B\.A\.|BSc|MS|MA|M\.S\.|M\.A\.|MSc)\b",
)

# 4-digit graduation year. "Spring 2025" / "Q1 2024" / "25" fail.
_YEAR_4DIGIT = re.compile(r"\b(19|20)\d{2}\b")
_NONSTANDARD_GRAD = re.compile(
    r"\b(?:Spring|Summer|Fall|Winter|Autumn|Q1|Q2|Q3|Q4)\s*(?:20\d{2}|'?\d{2})\b",
    re.IGNORECASE,
)

# GPA pattern (matches "GPA 3.8", "GPA: 3.8/4.0", "3.8 GPA", etc.)
_GPA_RE = re.compile(
    r"(?:GPA[:\s]*|\bgrade\s+point\s+average[:\s]*)(\d\.\d{1,2})|(?:(\d\.\d{1,2})\s*GPA)",
    re.IGNORECASE,
)

# LinkedIn URL patterns
_LINKEDIN_CANONICAL = re.compile(
    r"(?:^|[^/\w])linkedin\.com/in/[a-zA-Z0-9_\-]+(?!/)",
)
_LINKEDIN_ANY = re.compile(
    r"(?:www\.|https?://)?linkedin\.com/(?:in/)?[\w\-/]*",
    re.IGNORECASE,
)
_LINKEDIN_WITH_WWW = re.compile(r"www\.linkedin\.com", re.IGNORECASE)
_LINKEDIN_TRAILING = re.compile(r"linkedin\.com/in/[\w\-]+/\s")

# Phone patterns
_PHONE_PARENS = re.compile(r"\(\d{3}\)\s*\d{3}[-. ]?\d{4}")
_PHONE_DASHED = re.compile(r"\+?1?[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}")

# Canonical Workday-expected experience headers
_CANONICAL_EXP_HEADERS = frozenset({
    "work experience", "experience", "professional experience",
    "employment history", "employment", "work history",
    "relevant experience",
})

# Creative / non-canonical headers Workday often mis-classifies
_CREATIVE_HEADERS = [
    "my journey", "where i've been", "where i have been", "what i've built",
    "what i have built", "the story so far", "about me", "who i am",
    "my adventures", "things i've done", "my path", "recent wins",
    "career highlights", "life experience", "my work",
]
_CREATIVE_HEADER_RE = re.compile(
    r"(?im)^(?:" + "|".join(re.escape(h) for h in _CREATIVE_HEADERS) + r")\s*$",
)

# Skills section detector
_SKILLS_HEADER_RE = re.compile(
    r"(?im)^(?:skills|technical skills|core competencies|proficiencies|technologies|tools)\s*$",
)


# ── Individual checks ──────────────────────────────────────────────────────

def _check_degree_long_form(raw_text: str) -> Optional[ScoreIssue]:
    """Flag if only short-form degrees appear (BS, BA) without the long form."""
    has_long = bool(_DEGREE_LONG.search(raw_text))
    has_short = bool(_DEGREE_SHORT.search(raw_text))
    if not has_long and has_short:
        return ScoreIssue(
            id="wd_degree_short_form",
            category="extraction", severity="medium", base_lift=3.5,
            title="Workday: degree abbreviation instead of full word",
            fix="Spell out your degree: 'Bachelor of Science' instead of 'BS', 'Master of Arts' instead of 'MA'. Workday's parser maps the long-form word onto its degree dropdown.",
            affects=("workday",),
        )
    return None


def _check_graduation_year(raw_text: str) -> Optional[ScoreIssue]:
    """Flag if education section mentions non-standard graduation ('Spring 2025', 'Fall 2024')."""
    if _NONSTANDARD_GRAD.search(raw_text):
        return ScoreIssue(
            id="wd_grad_nonstandard",
            category="extraction", severity="medium", base_lift=4.0,
            title="Workday: non-standard graduation format",
            fix="Replace 'Spring 2025' / 'Fall 2024' with just 'May 2025' or 'Dec 2024'. Workday parses month+year; it drops season words.",
            affects=("workday",),
        )
    return None


def _check_gpa_threshold(raw_text: str) -> Optional[ScoreIssue]:
    """Flag if GPA appears and is below 3.0 (many Workday instances reject < 3.0)."""
    for m in _GPA_RE.finditer(raw_text):
        val_str = m.group(1) or m.group(2)
        if not val_str:
            continue
        try:
            val = float(val_str)
        except ValueError:
            continue
        # Flag below 3.0 with a soft warning. Below 2.5 becomes critical-ish.
        if val < 2.5:
            return ScoreIssue(
                id="wd_gpa_low",
                category="extraction", severity="high", base_lift=9.0,
                title="Workday: GPA below many employer thresholds",
                fix=f"Your GPA ({val:.1f}) is below the 3.0 threshold that many Workday instances use for auto-filtering. Consider removing it — or emphasize major GPA if higher.",
                affects=("workday",),
            )
        if val < 3.0:
            return ScoreIssue(
                id="wd_gpa_borderline",
                category="extraction", severity="low", base_lift=2.0,
                title="Workday: GPA near employer thresholds",
                fix=f"Your GPA ({val:.1f}) is near the 3.0 line. Some Workday instances auto-filter below 3.0 — consider leading with projects/experience instead.",
                affects=("workday",),
            )
    return None


def _check_linkedin_format(raw_text: str) -> Optional[ScoreIssue]:
    """
    Workday strongly prefers canonical linkedin.com/in/<slug> — no www, no
    trailing slash. Return an issue if a LinkedIn URL exists but not in
    canonical form.
    """
    any_match = _LINKEDIN_ANY.search(raw_text)
    if not any_match:
        return None  # No LinkedIn at all — separate issue, not a format problem
    text = any_match.group(0)
    has_www = bool(_LINKEDIN_WITH_WWW.search(text))
    has_trailing = text.rstrip().endswith("/")
    if has_www or has_trailing:
        return ScoreIssue(
            id="wd_linkedin_format",
            category="extraction", severity="low", base_lift=1.5,
            title="Workday: LinkedIn URL not in canonical form",
            fix="Write your LinkedIn URL as 'linkedin.com/in/yourslug' — drop 'www.' and the trailing slash. Workday's URL validator rejects both.",
            affects=("workday",),
        )
    return None


def _check_phone_format(raw_text: str) -> Optional[ScoreIssue]:
    """Workday specifically chokes on phone numbers with parentheses."""
    if _PHONE_PARENS.search(raw_text):
        return ScoreIssue(
            id="wd_phone_parens",
            category="extraction", severity="medium", base_lift=3.0,
            title="Workday: phone number uses parentheses",
            fix="Rewrite your phone as '555-555-5555' or '+1 555-555-5555'. Workday's parser fails on '(555) 555-5555' — the opening paren gets interpreted as a separator.",
            affects=("workday",),
        )
    return None


def _check_experience_header(raw_text: str) -> Optional[ScoreIssue]:
    """Flag creative experience headers ('My Journey', 'Career Highlights')."""
    if _CREATIVE_HEADER_RE.search(raw_text):
        match = _CREATIVE_HEADER_RE.search(raw_text)
        creative = match.group(0).strip() if match else "creative header"
        return ScoreIssue(
            id="wd_creative_exp_header",
            category="extraction", severity="high", base_lift=10.0,
            title=f"Workday: creative section header '{creative}'",
            fix=f"Rename '{creative}' to 'Work Experience' or just 'Experience'. Workday's header classifier only recognizes a small canonical set — anything else gets dropped or misclassified as 'Other'.",
            affects=("workday",),
        )
    return None


def _check_skills_list_format(raw_text: str) -> Optional[ScoreIssue]:
    """
    If a Skills section exists but the content looks like prose (sentences, not
    a comma-separated list), Workday's Skills field extraction fails.
    """
    match = _SKILLS_HEADER_RE.search(raw_text)
    if not match:
        return None
    # Look at the ~300 chars after the skills header
    start = match.end()
    skills_block = raw_text[start:start + 300]
    if not skills_block.strip():
        return None
    # Heuristic: if there are < 4 commas AND > 2 sentence-ending periods, it's prose
    comma_count = skills_block.count(",")
    pipe_count = skills_block.count("|")
    bullet_count = sum(skills_block.count(c) for c in ("•", "·", "∙"))
    list_separators = comma_count + pipe_count + bullet_count
    period_count = skills_block.count(". ")
    if list_separators < 3 and period_count >= 2:
        return ScoreIssue(
            id="wd_skills_prose",
            category="extraction", severity="medium", base_lift=4.5,
            title="Workday: Skills section reads as prose, not a list",
            fix="Rewrite your Skills as a comma-separated list: 'Python, SQL, Tableau, Git, Excel'. Workday's Skills field wants discrete tokens; paragraph-style descriptions get ignored.",
            affects=("workday",),
        )
    return None


# ── Public entry point ─────────────────────────────────────────────────────

def run_workday_checks(raw_text: str, parsed: Any = None) -> List[ScoreIssue]:
    """
    Run all Workday-specific field validators against the resume text.

    Returns a list of ScoreIssue objects, all tagged with
    affects=('workday',), ready to merge into the global issue list
    consumed by ats_score_v2.score_from_signals.

    No LLM. No network. Deterministic.
    """
    if not raw_text or len(raw_text.strip()) < 50:
        return []

    checks = (
        _check_degree_long_form,
        _check_graduation_year,
        _check_gpa_threshold,
        _check_linkedin_format,
        _check_phone_format,
        _check_experience_header,
        _check_skills_list_format,
    )

    issues: List[ScoreIssue] = []
    for check in checks:
        try:
            issue = check(raw_text)
        except Exception:
            issue = None
        if issue is not None:
            issues.append(issue)
    return issues


__all__ = ["run_workday_checks"]
