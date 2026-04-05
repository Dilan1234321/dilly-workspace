"""
ATS Scoring Engine — lightweight rule-based resume compatibility checker.

This is the QUICK-CHECK module used by /ats-check and /gap-analysis endpoints.
It scores raw resume text against 7 major ATS systems using formatting and
content heuristics.  No LLM calls, no external dependencies.

BOUNDARY: For the DEEP analysis (parseability, extraction simulation, formatting
checklist, section completeness, date consistency, and ATS-readiness composite),
see dilly_core/ats_analysis.py.  That module is used by /ats-analysis-from-audit,
/ats-vendor-sim, and the broader audit pipeline.  The two modules are complementary:
ats_engine.py = fast per-vendor score; dilly_core/ats_analysis.py = full diagnostic.

Each system has different parsing characteristics:
- Greenhouse / Lever / Ashby: modern, lenient
- Workday: strict, chokes on tables/columns/fancy formatting
- Taleo (Oracle): strict, needs standard fonts, no headers for contact info
- iCIMS: moderate, needs individual skill parsing, standard dates
- SuccessFactors (SAP): moderate, similar to Workday but more lenient
"""

import re
from dataclasses import dataclass, field, asdict
from typing import Optional


# ── Section Detection ──────────────────────────────────────────────────────────

EDUCATION_HEADERS = re.compile(
    r"(?i)^(education|academic|academics|university|college|school|degree)",
    re.MULTILINE,
)
EXPERIENCE_HEADERS = re.compile(
    r"(?i)^(experience|work\s*experience|employment|professional\s*experience|work\s*history|relevant\s*experience)",
    re.MULTILINE,
)
SKILLS_HEADERS = re.compile(
    r"(?i)^(skills|technical\s*skills|core\s*competencies|proficiencies|technologies|tools)",
    re.MULTILINE,
)
PROJECTS_HEADERS = re.compile(
    r"(?i)^(projects|personal\s*projects|academic\s*projects|portfolio)",
    re.MULTILINE,
)

# ── Contact Detection ──────────────────────────────────────────────────────────

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
PHONE_RE = re.compile(r"(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})")
LINKEDIN_RE = re.compile(r"linkedin\.com/in/[\w-]+", re.IGNORECASE)

# ── Date Detection ─────────────────────────────────────────────────────────────

STANDARD_DATE_RE = re.compile(
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}",
    re.IGNORECASE,
)
SLASH_DATE_RE = re.compile(r"\d{1,2}/\d{4}")
YEAR_ONLY_RE = re.compile(r"\b20\d{2}\b")

# ── Formatting Checks ──────────────────────────────────────────────────────────

TABLE_INDICATORS = re.compile(r"(\|.*\|.*\|)|(<table|<td|<tr)", re.IGNORECASE)
COLUMN_INDICATORS = re.compile(
    r"(\t{2,})|(\s{8,}\S+\s{8,})|"  # wide spacing suggesting columns
    r"([\w,]+\s{4,}[\w,]+\s{4,}[\w,]+)",  # three chunks with big gaps
)

# Characters that suggest non-standard encoding or fancy formatting
FANCY_CHARS = re.compile(r"[\u2022\u2023\u25aa\u25cf\u25cb\u25a0\u25a1\u2192\u2794\u27a4]")
GARBLED_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x80-\x9f]{2,}")


@dataclass
class ATSIssue:
    """A single ATS compatibility issue."""
    severity: str  # 'critical', 'high', 'medium', 'low'
    message: str
    systems_affected: list[str] = field(default_factory=list)


@dataclass
class SystemScore:
    """Score for a single ATS system."""
    system: str
    score: int  # 0-100
    issues: list[str] = field(default_factory=list)
    passed: list[str] = field(default_factory=list)


@dataclass
class ParsedFields:
    """What fields were successfully extracted."""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    education: Optional[str] = None
    experience_count: int = 0
    skills_count: int = 0
    has_projects: bool = False


@dataclass
class ATSScanResult:
    """Full ATS scan result."""
    vendors: dict  # system_key -> { score, issues, passed }
    all_issues: list[dict]  # severity-sorted issues
    parsed_fields: dict
    overall_score: int  # average across all systems

    def to_dict(self):
        return asdict(self)


def scan_resume_ats(raw_text: str) -> ATSScanResult:
    """
    Score a resume against all ATS systems.

    Args:
        raw_text: Plain text extracted from the resume PDF/DOCX.

    Returns:
        ATSScanResult with per-system scores and issues.
    """
    text = raw_text.strip()
    lines = text.split("\n")
    line_count = len(lines)
    char_count = len(text)

    # ── Extract parsed fields ──────────────────────────────────────────────

    emails = EMAIL_RE.findall(text)
    phones = PHONE_RE.findall(text)
    linkedin = LINKEDIN_RE.findall(text)

    has_education = bool(EDUCATION_HEADERS.search(text))
    has_experience = bool(EXPERIENCE_HEADERS.search(text))
    has_skills = bool(SKILLS_HEADERS.search(text))
    has_projects = bool(PROJECTS_HEADERS.search(text))

    # Count experience entries (heuristic: lines with dates near role-like text)
    date_lines = [l for l in lines if STANDARD_DATE_RE.search(l) or SLASH_DATE_RE.search(l)]
    experience_count = max(len(date_lines) // 2, 1) if date_lines else 0

    # Count skills (heuristic: comma-separated items after skills header)
    skills_count = 0
    skills_match = SKILLS_HEADERS.search(text)
    if skills_match:
        # Get text after the skills header until next section or 500 chars
        start = skills_match.end()
        skills_block = text[start:start + 500]
        # Count comma-separated items, pipe-separated, or bullet items
        items = re.split(r"[,|•·\n]", skills_block)
        skills_count = len([i for i in items if i.strip() and len(i.strip()) > 1 and len(i.strip()) < 50])

    # Guess name from first non-empty line
    name_guess = None
    for line in lines[:5]:
        clean = line.strip()
        if clean and not EMAIL_RE.search(clean) and not PHONE_RE.search(clean):
            if len(clean) < 60 and not any(h.search(clean) for h in [EDUCATION_HEADERS, EXPERIENCE_HEADERS, SKILLS_HEADERS]):
                name_guess = clean
                break

    # Check if contact info is in the first few lines (not in a header/footer)
    contact_in_top = any(EMAIL_RE.search(l) or PHONE_RE.search(l) for l in lines[:8])
    contact_in_bottom = any(EMAIL_RE.search(l) or PHONE_RE.search(l) for l in lines[-5:])

    parsed = ParsedFields(
        name=name_guess,
        email=emails[0] if emails else None,
        phone=phones[0] if phones else None,
        education="Found" if has_education else None,
        experience_count=experience_count,
        skills_count=skills_count,
        has_projects=has_projects,
    )

    # ── Detect issues ──────────────────────────────────────────────────────

    all_issues: list[ATSIssue] = []

    # Tables
    has_tables = bool(TABLE_INDICATORS.search(text))
    if has_tables:
        all_issues.append(ATSIssue("critical", "Tables detected — Workday and Taleo cannot parse tables correctly", ["workday", "taleo"]))

    # Columns (heuristic: lots of horizontal whitespace)
    has_columns = bool(COLUMN_INDICATORS.search(text))
    if has_columns:
        all_issues.append(ATSIssue("critical", "Multi-column layout detected — strict ATS systems merge columns into garbled text", ["workday", "taleo"]))

    # Missing sections
    if not has_education:
        all_issues.append(ATSIssue("high", "No 'Education' section header found — ATS cannot categorize your degree", ["workday", "taleo", "icims", "successfactors"]))
    if not has_experience:
        all_issues.append(ATSIssue("high", "No 'Experience' section header found — ATS cannot identify your work history", ["workday", "taleo", "icims"]))
    if not has_skills:
        all_issues.append(ATSIssue("medium", "No 'Skills' section found — iCIMS and Workday use this for keyword matching", ["workday", "icims"]))

    # Contact info
    if not emails:
        all_issues.append(ATSIssue("critical", "No email address found — application may be rejected automatically", ["workday", "taleo", "icims", "greenhouse", "lever", "successfactors"]))
    if not phones:
        all_issues.append(ATSIssue("medium", "No phone number found — some systems flag this as incomplete", ["taleo", "icims"]))

    # Contact in header/footer (Taleo skips headers)
    if not contact_in_top and emails:
        all_issues.append(ATSIssue("high", "Contact info may be in a header/footer — Taleo ignores these regions", ["taleo"]))

    # Non-standard dates
    has_standard_dates = bool(STANDARD_DATE_RE.search(text))
    has_slash_dates = bool(SLASH_DATE_RE.search(text))
    if not has_standard_dates and not has_slash_dates:
        if YEAR_ONLY_RE.search(text):
            all_issues.append(ATSIssue("medium", "Only year found in dates — use 'Month YYYY' format for better parsing", ["taleo", "icims"]))
        else:
            all_issues.append(ATSIssue("high", "No recognizable dates found — ATS cannot determine experience duration", ["workday", "taleo", "icims"]))

    # Fancy characters / encoding issues
    if GARBLED_TEXT.search(text):
        all_issues.append(ATSIssue("critical", "Garbled text detected — PDF may use non-standard encoding", ["workday", "taleo", "icims", "successfactors"]))

    # Length check
    if char_count < 200:
        all_issues.append(ATSIssue("high", "Resume appears very short — may not have enough content for scoring", ["workday", "taleo", "icims", "greenhouse", "lever", "successfactors"]))
    elif char_count > 8000:
        all_issues.append(ATSIssue("low", "Resume is very long — consider condensing to 1-2 pages", []))

    # Creative section headers
    creative_headers = re.findall(r"(?i)^(my\s+journey|about\s+me|what\s+i.ve\s+done|the\s+story)", text, re.MULTILINE)
    if creative_headers:
        all_issues.append(ATSIssue("high", "Non-standard section headers detected — use 'Education', 'Experience', 'Skills' instead", ["workday", "taleo", "icims"]))

    # Multiple pages heuristic
    if line_count > 80 or char_count > 5000:
        # Likely multi-page, not necessarily an issue
        pass

    # Check for bullet consistency
    bullet_types = set()
    for line in lines:
        stripped = line.strip()
        if stripped and stripped[0] in "•·-–—▪►➤*∙":
            bullet_types.add(stripped[0])
    if len(bullet_types) > 2:
        all_issues.append(ATSIssue("low", "Mixed bullet point styles — use consistent formatting", ["workday"]))

    # Skills as paragraph vs list
    if has_skills and skills_count < 3:
        all_issues.append(ATSIssue("medium", "Skills may be embedded in paragraphs — list them individually for iCIMS to parse", ["icims"]))

    # ── Score each system ──────────────────────────────────────────────────

    systems = {
        "greenhouse": {"name": "Greenhouse", "base": 95, "penalty_weight": 0.5},
        "lever": {"name": "Lever", "base": 93, "penalty_weight": 0.5},
        "ashby": {"name": "Ashby", "base": 94, "penalty_weight": 0.4},
        "workday": {"name": "Workday", "base": 90, "penalty_weight": 1.5},
        "taleo": {"name": "Taleo", "base": 88, "penalty_weight": 1.4},
        "icims": {"name": "iCIMS", "base": 90, "penalty_weight": 1.0},
        "successfactors": {"name": "SuccessFactors", "base": 90, "penalty_weight": 1.1},
    }

    severity_penalty = {"critical": 15, "high": 8, "medium": 4, "low": 1}

    vendors = {}
    for sys_key, sys_config in systems.items():
        score = sys_config["base"]
        issues_for_system = []
        passed_for_system = []

        for issue in all_issues:
            # Issue affects this system if it's in the list, or if list is empty (universal)
            if not issue.systems_affected or sys_key in issue.systems_affected:
                penalty = severity_penalty.get(issue.severity, 4) * sys_config["penalty_weight"]
                score -= penalty
                issues_for_system.append(issue.message)
            else:
                # This system isn't affected
                pass

        # Bonuses for good formatting
        if has_education:
            passed_for_system.append("Education section found")
        if has_experience:
            passed_for_system.append("Experience section found")
        if has_skills:
            passed_for_system.append("Skills section found")
            score += 2
        if emails:
            passed_for_system.append("Email address found")
        if phones:
            passed_for_system.append("Phone number found")
        if has_standard_dates:
            passed_for_system.append("Standard date format detected")
            score += 2
        if contact_in_top:
            passed_for_system.append("Contact info in body (not header)")
            score += 1

        # Clamp
        score = max(0, min(100, int(score)))

        vendors[sys_key] = {
            "system": sys_config["name"],
            "score": score,
            "issues": issues_for_system,
            "passed": passed_for_system,
        }

    # Overall score: weighted average (strict systems matter more)
    weights = {"greenhouse": 1, "lever": 1, "ashby": 0.5, "workday": 2, "taleo": 1.5, "icims": 1.5, "successfactors": 1}
    total_weight = sum(weights.values())
    overall = sum(vendors[k]["score"] * weights[k] for k in vendors) / total_weight

    # Sort issues by severity
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    sorted_issues = sorted(all_issues, key=lambda i: severity_order.get(i.severity, 9))

    return ATSScanResult(
        vendors=vendors,
        all_issues=[{"severity": i.severity, "message": i.message, "systems_affected": i.systems_affected} for i in sorted_issues],
        parsed_fields=asdict(parsed),
        overall_score=int(overall),
    )
