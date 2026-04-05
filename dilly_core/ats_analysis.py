"""
Dilly ATS Analysis Engine — deep diagnostic for the full audit pipeline.

Used by /ats-analysis-from-audit, /ats-vendor-sim, and dilly_core/ats_vendors.py.
Provides the comprehensive analysis:
1. Parseability analysis — detect real formatting issues that break ATS parsing
2. Extraction simulation — show exactly what an ATS extracts (and what it misses)
3. Formatting checklist — auto-detected pass/fail for every formatting rule
4. Section completeness — required vs. optional sections by career track
5. Date consistency — flag mixed formats and missing dates
6. ATS readiness composite — single status combining all checks

BOUNDARY: For the lightweight per-vendor quick-check (used by /ats-check and
/gap-analysis), see projects/dilly/api/ats_engine.py.  The two modules are
complementary: ats_engine.py = fast per-vendor score; this module = full diagnostic.

No LLM calls. Pure rule-based analysis on raw text + parsed resume data.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from dilly_core.resume_parser import (
    ParsedResume,
    SECTION_HEADERS,
    normalize_resume_text,
    get_sections,
)
from dilly_core.structured_resume import (
    _RE_EMAIL,
    _RE_PHONE,
    _RE_LINKEDIN,
    _RE_DATE_RANGE,
    _RE_GPA,
    get_sections_from_structured_text,
)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ATSIssue:
    """A single parseability or formatting problem."""
    category: str          # "parseability" | "formatting" | "structure" | "content" | "dates"
    severity: str          # "critical" | "warning" | "info"
    title: str             # short label
    detail: str            # what ATS can't do / the problem
    fix: str               # actionable fix with specific rewrite when possible
    dilly_reads: Optional[str] = None  # what Dilly understood despite the ATS problem
    line: Optional[str] = None  # triggering line if available


@dataclass
class ATSExtractedField:
    """One field that an ATS would extract."""
    field: str             # "name", "email", "phone", etc.
    value: Optional[str]   # extracted value or None
    status: str            # "extracted" | "missing" | "partial"
    note: Optional[str] = None


@dataclass
class ATSChecklistItem:
    """One item on the formatting checklist."""
    label: str
    passed: bool
    detail: Optional[str] = None


@dataclass
class ATSExperienceEntry:
    """Extracted experience entry for the "What ATS Sees" view."""
    company: str
    role: str
    dates: str
    location: str
    bullet_count: int


@dataclass
class ATSEducationEntry:
    """Extracted education entry."""
    university: str
    degree: str
    major: str
    gpa: Optional[str]
    graduation: str
    location: str


@dataclass
class ATSAnalysisResult:
    """Full ATS analysis output."""
    readiness: str                           # "ready" | "needs_work" | "at_risk"
    readiness_summary: str                   # one-line plain English
    score: int                               # 0-100 composite
    issues: List[ATSIssue] = field(default_factory=list)
    checklist: List[ATSChecklistItem] = field(default_factory=list)
    extracted_fields: List[ATSExtractedField] = field(default_factory=list)
    experience_entries: List[ATSExperienceEntry] = field(default_factory=list)
    education_entries: List[ATSEducationEntry] = field(default_factory=list)
    detected_sections: List[str] = field(default_factory=list)
    missing_sections: List[str] = field(default_factory=list)
    skills_extracted: List[str] = field(default_factory=list)
    section_order: List[str] = field(default_factory=list)  # sections in document order (for reorder suggestions)

    def to_dict(self) -> dict:
        return {
            "readiness": self.readiness,
            "readiness_summary": self.readiness_summary,
            "score": self.score,
            "issues": [
                {"category": i.category, "severity": i.severity, "title": i.title,
                 "detail": i.detail, "fix": i.fix, "dilly_reads": i.dilly_reads,
                 "line": i.line}
                for i in self.issues
            ],
            "checklist": [
                {"label": c.label, "passed": c.passed, "detail": c.detail}
                for c in self.checklist
            ],
            "extracted_fields": [
                {"field": f.field, "value": f.value, "status": f.status, "note": f.note}
                for f in self.extracted_fields
            ],
            "experience_entries": [
                {"company": e.company, "role": e.role, "dates": e.dates,
                 "location": e.location, "bullet_count": e.bullet_count}
                for e in self.experience_entries
            ],
            "education_entries": [
                {"university": e.university, "degree": e.degree, "major": e.major,
                 "gpa": e.gpa, "graduation": e.graduation, "location": e.location}
                for e in self.education_entries
            ],
            "detected_sections": self.detected_sections,
            "missing_sections": self.missing_sections,
            "skills_extracted": self.skills_extracted,
            "section_order": self.section_order,
        }


def ats_analysis_result_from_dict(d: Optional[dict]) -> Optional[ATSAnalysisResult]:
    """Rebuild ATSAnalysisResult from to_dict() JSON (skip re-running run_ats_analysis on the server)."""
    if not d or not isinstance(d, dict):
        return None
    try:
        raw_score = d.get("score")
        if raw_score is None:
            return None
        score = int(raw_score)
    except (TypeError, ValueError):
        return None
    issues: List[ATSIssue] = []
    for i in d.get("issues") or []:
        if not isinstance(i, dict):
            continue
        issues.append(
            ATSIssue(
                category=str(i.get("category") or ""),
                severity=str(i.get("severity") or ""),
                title=str(i.get("title") or ""),
                detail=str(i.get("detail") or ""),
                fix=str(i.get("fix") or ""),
                dilly_reads=i.get("dilly_reads"),
                line=i.get("line"),
            )
        )
    checklist: List[ATSChecklistItem] = []
    for c in d.get("checklist") or []:
        if not isinstance(c, dict):
            continue
        checklist.append(
            ATSChecklistItem(
                label=str(c.get("label") or ""),
                passed=bool(c.get("passed")),
                detail=c.get("detail"),
            )
        )
    extracted_fields: List[ATSExtractedField] = []
    for f in d.get("extracted_fields") or []:
        if not isinstance(f, dict):
            continue
        extracted_fields.append(
            ATSExtractedField(
                field=str(f.get("field") or ""),
                value=f.get("value"),
                status=str(f.get("status") or "missing"),
                note=f.get("note"),
            )
        )
    exp_entries: List[ATSExperienceEntry] = []
    for e in d.get("experience_entries") or []:
        if not isinstance(e, dict):
            continue
        try:
            bc = int(e.get("bullet_count") or 0)
        except (TypeError, ValueError):
            bc = 0
        exp_entries.append(
            ATSExperienceEntry(
                company=str(e.get("company") or ""),
                role=str(e.get("role") or ""),
                dates=str(e.get("dates") or ""),
                location=str(e.get("location") or ""),
                bullet_count=max(0, bc),
            )
        )
    edu_entries: List[ATSEducationEntry] = []
    for e in d.get("education_entries") or []:
        if not isinstance(e, dict):
            continue
        edu_entries.append(
            ATSEducationEntry(
                university=str(e.get("university") or ""),
                degree=str(e.get("degree") or ""),
                major=str(e.get("major") or ""),
                gpa=e.get("gpa"),
                graduation=str(e.get("graduation") or ""),
                location=str(e.get("location") or ""),
            )
        )
    return ATSAnalysisResult(
        readiness=str(d.get("readiness") or "needs_work"),
        readiness_summary=str(d.get("readiness_summary") or ""),
        score=max(0, min(100, score)),
        issues=issues,
        checklist=checklist,
        extracted_fields=extracted_fields,
        experience_entries=exp_entries,
        education_entries=edu_entries,
        detected_sections=list(d.get("detected_sections") or []),
        missing_sections=list(d.get("missing_sections") or []),
        skills_extracted=list(d.get("skills_extracted") or []),
        section_order=list(d.get("section_order") or []),
    )


# ---------------------------------------------------------------------------
# Standard ATS section headers (what the big four expect)
# ---------------------------------------------------------------------------

STANDARD_ATS_HEADERS = {
    "education", "experience", "work experience", "professional experience",
    "skills", "technical skills", "core competencies",
    "summary", "professional summary", "objective",
    "projects", "certifications", "honors", "awards",
    "activities", "involvement", "volunteer", "volunteer experience",
    "publications", "research", "research experience",
    "leadership", "leadership experience",
}

NON_STANDARD_HEADERS = {
    "my journey", "what i've done", "about me", "who i am",
    "fun facts", "hobbies", "interests and hobbies",
    "passions", "things i love", "my story", "life highlights",
}

REQUIRED_SECTIONS = {"education", "experience", "skills", "contact"}
RECOMMENDED_SECTIONS = {"summary", "projects", "certifications", "honors"}

# Experience-like section keys (any of these count as "experience")
EXPERIENCE_KEYS = frozenset({
    "experience", "work experience", "professional experience", "employment",
    "relevant experience", "job experience",
})

# Education-like section keys
EDUCATION_KEYS = frozenset({
    "education", "academic", "academics", "qualifications",
})

# Skills-like section keys
SKILLS_KEYS = frozenset({
    "skills", "technical skills", "core competencies", "skills & activities",
    "skills and activities",
})


# ---------------------------------------------------------------------------
# Date format patterns
# ---------------------------------------------------------------------------

# Full month name + year
_RE_DATE_FULL_MONTH = re.compile(
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
    re.IGNORECASE,
)
# Abbreviated month + year
_RE_DATE_ABBREV_MONTH = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}\b",
    re.IGNORECASE,
)
# Numeric: MM/YYYY or M/YYYY
_RE_DATE_NUMERIC = re.compile(r"\b\d{1,2}/\d{4}\b")
# Year only
_RE_DATE_YEAR_ONLY = re.compile(r"\b(?:19|20)\d{2}\b")
# Present/Current
_RE_DATE_PRESENT = re.compile(r"\b(?:Present|Current)\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Parseability checks
# ---------------------------------------------------------------------------

def _check_multi_column(raw_text: str, parsed: ParsedResume) -> Optional[ATSIssue]:
    """Detect multi-column layout by looking for lines with large internal gaps."""
    if not raw_text:
        return None
    tab_lines = 0
    large_gap_lines = 0
    lines = raw_text.split("\n")
    for line in lines:
        if not line.strip():
            continue
        if "\t" in line and line.count("\t") >= 2:
            tab_lines += 1
        if re.search(r"\S\s{4,}\S", line):
            large_gap_lines += 1
    total = max(len([l for l in lines if l.strip()]), 1)
    if (tab_lines + large_gap_lines) / total > 0.20 and (tab_lines + large_gap_lines) >= 5:
        # Build what Dilly extracted despite the columns
        extracted_parts = []
        if parsed.name and parsed.name != "Unknown":
            extracted_parts.append(f"your name ({parsed.name})")
        sections_found = [k for k in (parsed.sections or {}) if k != "_top"]
        if sections_found:
            extracted_parts.append(f"{len(sections_found)} section(s): {', '.join(s.title() for s in sections_found[:4])}")
        dilly_msg = f"I extracted {', '.join(extracted_parts)} from the columns." if extracted_parts else "I separated the columns and extracted your content."
        dilly_msg += " Move sidebar content (skills, contact info) to the top or bottom in a single column."
        return ATSIssue(
            category="parseability",
            severity="critical",
            title="Multi-column layout detected",
            detail="ATS systems read left-to-right, top-to-bottom. Multi-column layouts cause skills and dates to get assigned to the wrong roles.",
            fix="Reformat to a single-column layout. Move sidebar content (skills, contact) to the top or bottom.",
            dilly_reads=dilly_msg,
        )
    return None


def _check_table_layout(raw_text: str, parsed: ParsedResume) -> Optional[ATSIssue]:
    """Detect table-based layouts from tab patterns or HTML-like markers."""
    if not raw_text:
        return None
    lines = [l for l in raw_text.split("\n") if l.strip()]
    tab_heavy = sum(1 for l in lines if l.count("\t") >= 3)
    if tab_heavy >= 3:
        # Show what Dilly extracted from the table mess
        parts = []
        if parsed.name and parsed.name != "Unknown":
            parts.append(parsed.name)
        if parsed.major and parsed.major != "Unknown":
            parts.append(parsed.major)
        exp_count = sum(1 for k in (parsed.sections or {}) if "experience" in k.lower() or "work" in k.lower())
        if exp_count:
            parts.append("experience section")
        dilly_msg = f"I read through the table structure and extracted: {', '.join(parts)}." if parts else "I parsed the table content anyway."
        dilly_msg += " Replace tables with bullet points so ATS can read it the same way I did."
        return ATSIssue(
            category="parseability",
            severity="critical",
            title="Table-based layout detected",
            detail="ATS parsers extract table cells out of order or skip them entirely. Workday, iCIMS, and Taleo all struggle with tables.",
            fix="Replace tables with simple bullet points and line breaks. Use bold text or colons for structure instead of table columns.",
            dilly_reads=dilly_msg,
        )
    if re.search(r"<table|<tr|<td", raw_text, re.IGNORECASE):
        return ATSIssue(
            category="parseability",
            severity="critical",
            title="HTML table markup in resume",
            detail="Some DOCX templates embed HTML tables. ATS parsers may extract this as raw markup instead of content.",
            fix="Recreate the resume in a simple template without tables. Use Google Docs or a plain Word template.",
            dilly_reads="I can read through HTML markup, but ATS will show raw code instead of your content. Re-export from a clean template.",
        )
    return None


def _check_non_standard_headers(sections: Dict[str, str]) -> List[ATSIssue]:
    """Flag section headers that ATS may not recognize."""
    issues = []
    for key in sections:
        if key == "_top":
            continue
        lower = key.lower().strip()
        content = (sections[key] or "").strip()
        content_preview = content[:120].replace("\n", " ") if content else ""

        if lower in NON_STANDARD_HEADERS:
            # Figure out what standard header this should be
            suggested = "Experience"
            if any(w in content.lower() for w in ("university", "bachelor", "gpa", "degree", "graduation")):
                suggested = "Education"
            elif any(w in content.lower() for w in ("python", "java", "excel", "skill", "proficien")):
                suggested = "Skills"
            dilly_msg = f"I found content under \"{key}\" and identified it as {suggested}. Rename to \"{suggested}\" so ATS maps it correctly."
            if content_preview:
                dilly_msg += f" Content starts with: \"{content_preview}...\""
            issues.append(ATSIssue(
                category="parseability",
                severity="warning",
                title=f"Non-standard header: \"{key}\"",
                detail=f"ATS systems like Workday and iCIMS expect standard headers (Experience, Education, Skills). \"{key}\" won't be recognized.",
                fix=f"Rename \"{key}\" to \"{suggested}\".",
                dilly_reads=dilly_msg,
                line=key,
            ))
        elif lower not in STANDARD_ATS_HEADERS and len(lower) > 5:
            matched = any(std in lower or lower in std for std in STANDARD_ATS_HEADERS)
            if not matched and not any(h in lower for h in SECTION_HEADERS):
                dilly_msg = f"I can read the content under \"{key}\"."
                if content_preview:
                    dilly_msg += f" It contains: \"{content_preview}...\" Consider renaming to a standard header."
                issues.append(ATSIssue(
                    category="parseability",
                    severity="info",
                    title=f"Unusual header: \"{key}\"",
                    detail=f"Some ATS systems may not map \"{key}\" to a standard field. Your data could end up in an \"Other\" bucket that recruiters rarely search.",
                    fix=f"Consider using a standard header that ATS systems recognize.",
                    dilly_reads=dilly_msg,
                    line=key,
                ))
    return issues


def _check_contact_placement(raw_text: str) -> Optional[ATSIssue]:
    """Flag when contact info (email/phone) appears only in the bottom portion."""
    if not raw_text or len(raw_text) < 100:
        return None
    cutoff_top = len(raw_text) // 3
    cutoff_bottom = len(raw_text) * 2 // 3
    top = raw_text[:cutoff_top]
    bottom = raw_text[cutoff_bottom:]

    email_top = bool(_RE_EMAIL.search(top))
    email_bottom = bool(_RE_EMAIL.search(bottom))
    phone_top = bool(_RE_PHONE.search(top))
    phone_bottom = bool(_RE_PHONE.search(bottom))

    if (email_bottom or phone_bottom) and not (email_top or phone_top):
        found_parts = []
        email_m = _RE_EMAIL.search(bottom)
        phone_m = _RE_PHONE.search(bottom)
        if email_m:
            found_parts.append(f"email ({email_m.group(0)})")
        if phone_m:
            found_parts.append(f"phone ({phone_m.group(0).strip()})")
        dilly_msg = f"I found your {' and '.join(found_parts)} at the bottom of the resume. Move {'them' if len(found_parts) > 1 else 'it'} to the top, right under your name — ATS often strips footer content."
        return ATSIssue(
            category="parseability",
            severity="warning",
            title="Contact info buried at bottom",
            detail="ATS parsers expect name, email, and phone at the top. Contact info in footers is often stripped or missed entirely.",
            fix="Move your email and phone number to the top of the resume, directly under your name.",
            dilly_reads=dilly_msg,
        )
    return None


def _check_encoding_issues(raw_text: str, parsed: ParsedResume) -> Optional[ATSIssue]:
    """Detect garbled/mojibake characters that indicate encoding problems."""
    if not raw_text:
        return None
    mojibake = re.findall(r"[ÃÂ¢â¬Å¡¹º»¿½¾]{2,}", raw_text)
    replacement_chars = raw_text.count("\ufffd")
    if len(mojibake) >= 2 or replacement_chars >= 3:
        sample = mojibake[0] if mojibake else ""
        # Show what Dilly managed to extract despite corruption
        parts = []
        if parsed.name and parsed.name != "Unknown":
            parts.append(f"name: {parsed.name}")
        if parsed.major and parsed.major != "Unknown":
            parts.append(f"major: {parsed.major}")
        if parsed.gpa:
            parts.append(f"GPA: {parsed.gpa}")
        dilly_msg = f"Despite the corrupted characters, I extracted {', '.join(parts)}." if parts else "I tried to read through the corruption."
        dilly_msg += " Re-export as a fresh PDF from Word or Google Docs so ATS can read it cleanly too."
        return ATSIssue(
            category="parseability",
            severity="critical",
            title="Encoding/character corruption detected",
            detail="Your resume contains garbled characters, likely from copy-pasting between applications or saving in the wrong format. ATS will extract these as garbage.",
            fix="Re-export your resume as a fresh PDF from Word or Google Docs. Don't copy-paste from a web page into a template.",
            dilly_reads=dilly_msg,
            line=sample[:80] if sample else None,
        )
    return None


def _check_graphics_markers(raw_text: str, sections: Dict[str, str]) -> Optional[ATSIssue]:
    """Detect indicators of embedded graphics or icons used for layout."""
    if not raw_text:
        return None
    shape_chars = re.findall(r"[■□◆◇★☆▪▫▶▷●○◉◌♦♣♠♥♤♡♢♧⬤⬛⬜]", raw_text)
    star_ratings = re.findall(r"[★☆]{3,}", raw_text)
    progress_bars = re.findall(r"[█▓▒░]{3,}", raw_text)

    if len(star_ratings) >= 1 or len(progress_bars) >= 1:
        # Extract the skill names near the ratings
        skill_names = []
        for line in raw_text.split("\n"):
            if re.search(r"[★☆█▓▒░]{3,}", line):
                clean = re.sub(r"[★☆█▓▒░■□◆◇▪▫▶▷●○◉◌♦♣♠♥♤♡♢♧⬤⬛⬜\s]+$", "", line).strip()
                clean = re.sub(r"^[•\-*\s]+", "", clean).strip()
                if clean and len(clean) < 40:
                    skill_names.append(clean)
        if skill_names:
            skills_str = ", ".join(skill_names[:5])
            dilly_msg = f"I can see the skills behind the graphics: {skills_str}. ATS can't read star ratings or progress bars — list these as plain text instead."
            fix = f"Replace the graphic ratings with a text list: \"{', '.join(skill_names[:5])}\". Add proficiency levels in words if needed: \"Python (advanced)\"."
        else:
            dilly_msg = "I detected skill rating graphics. ATS sees empty space where you see stars. List your skills as plain text."
            fix = "Replace graphic skill ratings with a simple skills list. If proficiency matters, use words: \"Python (advanced)\", \"Excel (intermediate)\"."
        return ATSIssue(
            category="parseability",
            severity="warning",
            title="Skill rating graphics detected",
            detail="Star ratings, progress bars, and skill-level graphics are invisible to ATS. The system can't tell if you rated yourself 3/5 or 5/5 in Python.",
            fix=fix,
            dilly_reads=dilly_msg,
        )
    if len(shape_chars) >= 5:
        return ATSIssue(
            category="parseability",
            severity="info",
            title="Decorative symbols in resume",
            detail="Shape characters (■, ◆, ★) may not parse correctly in all ATS systems. Some extract them as question marks or drop them.",
            fix="Use standard bullet characters (•) or simple dashes (-) instead of decorative shapes.",
            dilly_reads="I can read past the decorative symbols, but ATS might drop or mangle them. Stick with • or - for bullets.",
        )
    return None


def _check_all_caps_overuse(lines: List[str]) -> Optional[ATSIssue]:
    """Flag excessive all-caps text (beyond section headers)."""
    if not lines:
        return None
    caps_lines = 0
    total_content_lines = 0
    for line in lines:
        stripped = line.strip()
        if not stripped or len(stripped) < 5:
            continue
        total_content_lines += 1
        if stripped.isupper() and len(stripped) > 20:
            caps_lines += 1
    if total_content_lines > 0 and caps_lines / total_content_lines > 0.15 and caps_lines >= 4:
        return ATSIssue(
            category="formatting",
            severity="info",
            title="Excessive all-caps text",
            detail="Long all-caps blocks reduce readability for both ATS keyword matching and human review. Some parsers treat ALL CAPS as headings, not content.",
            fix="Use sentence case or title case for content. Reserve ALL CAPS for short section headers only.",
        )
    return None


# ---------------------------------------------------------------------------
# Extraction simulation
# ---------------------------------------------------------------------------

def _extract_contact_fields(
    parsed: ParsedResume, raw_text: str,
) -> List[ATSExtractedField]:
    """Simulate ATS contact field extraction."""
    fields: List[ATSExtractedField] = []
    all_text = parsed.normalized_text or raw_text or ""

    # Name
    name = (parsed.name or "").strip()
    if name and name != "Unknown":
        fields.append(ATSExtractedField("Name", name, "extracted"))
    else:
        fields.append(ATSExtractedField("Name", None, "missing",
                                        "ATS could not extract your name. Ensure it's the first line, in plain text."))

    # Email
    email_m = _RE_EMAIL.search(all_text)
    if email_m:
        email = email_m.group(0)
        is_professional = not any(
            x in email.lower() for x in ("420", "69", "xxx", "baby", "cutie", "hotgirl", "sexyboi")
        )
        if is_professional:
            fields.append(ATSExtractedField("Email", email, "extracted"))
        else:
            fields.append(ATSExtractedField("Email", email, "partial",
                                            "Email looks unprofessional. Use firstname.lastname@domain."))
    else:
        fields.append(ATSExtractedField("Email", None, "missing",
                                        "No email found. ATS requires an email to create your applicant profile."))

    # Phone
    phone_m = _RE_PHONE.search(all_text)
    if phone_m:
        fields.append(ATSExtractedField("Phone", phone_m.group(0).strip(), "extracted"))
    else:
        fields.append(ATSExtractedField("Phone", None, "missing",
                                        "No phone number found. Most ATS require a phone number."))

    # LinkedIn
    linkedin_m = _RE_LINKEDIN.search(all_text)
    if linkedin_m:
        fields.append(ATSExtractedField("LinkedIn", linkedin_m.group(0), "extracted"))
    else:
        fields.append(ATSExtractedField("LinkedIn", None, "missing",
                                        "No LinkedIn URL found. Recruiters check LinkedIn — include it."))

    # Location
    loc_m = re.search(r"\b([A-Za-z\s]+,\s*[A-Z]{2})\b", all_text[:800])
    if loc_m:
        fields.append(ATSExtractedField("Location", loc_m.group(1).strip(), "extracted"))
    else:
        fields.append(ATSExtractedField("Location", None, "missing",
                                        "No city/state found. Some ATS filter by location."))

    return fields


def _extract_education_entries(parsed: ParsedResume) -> List[ATSEducationEntry]:
    """Simulate ATS education extraction."""
    entries: List[ATSEducationEntry] = []
    edu = parsed.education_block or ""
    if not edu.strip():
        return entries

    # University
    uni_m = re.search(
        r"(?:The\s+)?(?:University\s+of\s+[A-Za-z]+|[A-Za-z]{3,}\s+(?:University|College|Institute))",
        edu, re.IGNORECASE,
    )
    university = uni_m.group(0).strip() if uni_m else "Not extracted"

    # Degree
    degree_m = re.search(
        r"(?:Bachelor(?:'s)?\s+of\s+(?:Science|Arts|Business)|B\.?S\.?|B\.?A\.?|Associate)",
        edu, re.IGNORECASE,
    )
    degree = degree_m.group(0).strip() if degree_m else "Not extracted"

    # Major
    major = parsed.major if parsed.major and parsed.major != "Unknown" else "Not extracted"

    # GPA
    gpa = f"{parsed.gpa:.2f}" if parsed.gpa else None

    # Graduation
    grad_m = re.search(
        r"(?:Expected\s+)?(?:May|Dec(?:ember)?|Jan(?:uary)?|Aug(?:ust)?)\s*\.?\s*\d{4}",
        edu, re.IGNORECASE,
    )
    graduation = grad_m.group(0).strip() if grad_m else "Not extracted"

    # Location
    loc_m = re.search(r"\b([A-Za-z\s]+,\s*[A-Z]{2})\b", edu)
    location = loc_m.group(1).strip() if loc_m else "N/A"

    entries.append(ATSEducationEntry(
        university=university,
        degree=degree,
        major=major,
        gpa=gpa,
        graduation=graduation,
        location=location,
    ))
    return entries


def _extract_experience_entries(sections: Dict[str, str]) -> List[ATSExperienceEntry]:
    """Simulate ATS experience extraction from parsed sections."""
    entries: List[ATSExperienceEntry] = []
    for key, content in sections.items():
        lower_key = key.lower().strip()
        is_exp = any(ek in lower_key for ek in (
            "experience", "employment", "work", "leadership", "involvement",
            "volunteer", "research",
        ))
        if not is_exp or not content.strip():
            continue
        # Find date ranges to identify entries
        lines = content.split("\n")
        current_company = ""
        current_role = ""
        current_dates = ""
        current_location = "N/A"
        bullet_count = 0

        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue
            date_m = _RE_DATE_RANGE.search(stripped)
            if date_m:
                # Save previous entry
                if current_dates:
                    entries.append(ATSExperienceEntry(
                        company=current_company or "Not extracted",
                        role=current_role or "Not extracted",
                        dates=current_dates,
                        location=current_location,
                        bullet_count=bullet_count,
                    ))
                current_dates = date_m.group(0).strip()
                before = stripped[:date_m.start()].strip().rstrip("|,").strip()
                if before:
                    current_company = before
                else:
                    # Look at previous non-empty line for company/role
                    j = i - 1
                    while j >= 0 and not lines[j].strip():
                        j -= 1
                    if j >= 0:
                        current_company = lines[j].strip()
                current_role = ""
                current_location = "N/A"
                bullet_count = 0
                loc_m = re.search(r"\b([A-Za-z\s]+,\s*[A-Z]{2})\b", stripped)
                if loc_m:
                    current_location = loc_m.group(1).strip()
            elif stripped.startswith(("•", "-", "*", "●", "\u2022")):
                bullet_count += 1
            elif current_dates and not current_role and not stripped.startswith(("Company:", "Role:", "Date:")):
                current_role = stripped

        # Don't forget last entry
        if current_dates:
            entries.append(ATSExperienceEntry(
                company=current_company or "Not extracted",
                role=current_role or "Not extracted",
                dates=current_dates,
                location=current_location,
                bullet_count=bullet_count,
            ))

    return entries


def _extract_skills(sections: Dict[str, str], normalized_text: str) -> List[str]:
    """Extract skill keywords from skills sections or full text."""
    skills_text = ""
    for key, content in sections.items():
        if any(sk in key.lower() for sk in ("skill", "competenc", "technical")):
            skills_text += " " + content

    if not skills_text.strip():
        # Fall back to scanning full text for common skill patterns
        skills_text = normalized_text[:3000] if normalized_text else ""

    if not skills_text.strip():
        return []

    # Extract individual skills (comma/pipe/semicolon separated, or bullet list items)
    raw_skills: List[str] = []
    for line in skills_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Strip bullet characters
        line = re.sub(r"^[•\-*●\u2022]\s*", "", line)
        # Strip label prefixes like "Technical Skills:" or "Languages:"
        line = re.sub(r"^[A-Za-z\s]+:\s*", "", line)
        # Split on comma, pipe, semicolon
        parts = re.split(r"[,|;]", line)
        for part in parts:
            skill = part.strip()
            if 2 <= len(skill) <= 50 and not skill.lower().startswith(("and ", "or ")):
                raw_skills.append(skill)

    # Deduplicate preserving order
    seen = set()
    unique = []
    for s in raw_skills:
        key = s.lower().strip()
        if key not in seen and len(key) > 1:
            seen.add(key)
            unique.append(s)
    return unique[:30]


# ---------------------------------------------------------------------------
# Formatting checklist
# ---------------------------------------------------------------------------

def _build_checklist(
    raw_text: str,
    parsed: ParsedResume,
    sections: Dict[str, str],
    issues: List[ATSIssue],
    page_count: Optional[int] = None,
) -> List[ATSChecklistItem]:
    """Build the formatting checklist with auto-detected pass/fail."""
    checks: List[ATSChecklistItem] = []
    norm = parsed.normalized_text or raw_text or ""
    lines = [l.strip() for l in norm.split("\n") if l.strip()]

    # 1. Single-column layout
    has_multi_col = any(i.title.startswith("Multi-column") for i in issues)
    checks.append(ATSChecklistItem(
        "Single-column layout",
        not has_multi_col,
        "Multi-column detected — sidebar content may be misread" if has_multi_col else "No multi-column issues detected",
    ))

    # 2. Standard section headers
    bad_headers = [i for i in issues if "Non-standard header" in i.title or "Unusual header" in i.title]
    checks.append(ATSChecklistItem(
        "Standard section headers",
        len(bad_headers) == 0,
        f"{len(bad_headers)} non-standard header(s) found" if bad_headers else "All headers are ATS-recognized",
    ))

    # 3. Contact info at top
    contact_bottom = any("Contact info buried" in i.title for i in issues)
    checks.append(ATSChecklistItem(
        "Contact info at top",
        not contact_bottom,
        "Contact info found at bottom only" if contact_bottom else "Name, email, phone found near top",
    ))

    # 4. No tables for layout
    has_tables = any("Table" in i.title or "table" in i.title for i in issues)
    checks.append(ATSChecklistItem(
        "No tables for layout",
        not has_tables,
        "Table-based layout detected" if has_tables else "No table structures found",
    ))

    # 5. Bullet points used
    bullet_count = sum(1 for l in lines if l and l[0] in "•-*●\u2022")
    long_paragraphs = sum(1 for l in lines if len(l) > 200)
    has_bullets = bullet_count >= 3
    checks.append(ATSChecklistItem(
        "Bullet points for experience",
        has_bullets,
        f"{bullet_count} bullet points found" if has_bullets else "Few or no bullets — use bullet points for experience descriptions",
    ))

    # 6. No dense paragraphs
    checks.append(ATSChecklistItem(
        "No dense text blocks",
        long_paragraphs <= 1,
        f"{long_paragraphs} long paragraph(s) — break into bullets" if long_paragraphs > 1 else "Text is well-structured",
    ))

    # 7. Consistent date formats
    date_formats_used = _detect_date_formats(norm)
    consistent = len(date_formats_used) <= 1
    checks.append(ATSChecklistItem(
        "Consistent date format",
        consistent,
        f"Mixed formats: {', '.join(date_formats_used)}" if not consistent else "Date format is consistent" if date_formats_used else "No dates found",
    ))

    # 8. Email present
    has_email = bool(_RE_EMAIL.search(norm))
    checks.append(ATSChecklistItem(
        "Email address present",
        has_email,
        None if has_email else "No email found — required for ATS applicant profile",
    ))

    # 9. Phone present
    has_phone = bool(_RE_PHONE.search(norm))
    checks.append(ATSChecklistItem(
        "Phone number present",
        has_phone,
        None if has_phone else "No phone number found",
    ))

    # 10. Professional email
    email_m = _RE_EMAIL.search(norm)
    if email_m:
        email = email_m.group(0).lower()
        unprofessional = any(x in email for x in ("420", "69", "xxx", "baby", "cutie", "hotgirl", "sexyboi"))
        checks.append(ATSChecklistItem(
            "Professional email address",
            not unprofessional,
            "Use firstname.lastname@domain" if unprofessional else None,
        ))

    # 11. Appropriate length
    word_count = len(norm.split())
    if page_count:
        ok = page_count <= 2
        detail = f"{page_count} page(s)" + (" — trim to 1 page for early career" if page_count > 1 else "")
    else:
        ok = 80 <= word_count <= 700
        if word_count < 80:
            detail = f"~{word_count} words — too short, add more content"
        elif word_count > 700:
            detail = f"~{word_count} words — likely over 2 pages, trim it"
        else:
            detail = f"~{word_count} words"
    checks.append(ATSChecklistItem("Appropriate length", ok, detail))

    # 12. No encoding issues
    has_encoding = any("Encoding" in i.title for i in issues)
    checks.append(ATSChecklistItem(
        "Clean text encoding",
        not has_encoding,
        "Character corruption detected" if has_encoding else "No encoding issues",
    ))

    # 13. No graphic skill ratings
    has_graphics = any("rating graphics" in i.title.lower() for i in issues)
    checks.append(ATSChecklistItem(
        "No graphic skill ratings",
        not has_graphics,
        "Star/bar ratings are invisible to ATS" if has_graphics else "Skills listed as text",
    ))

    return checks


# ---------------------------------------------------------------------------
# Date consistency
# ---------------------------------------------------------------------------

def _detect_date_formats(text: str) -> List[str]:
    """Detect which date formats are used in the resume."""
    formats_found = set()
    if _RE_DATE_FULL_MONTH.search(text):
        formats_found.add("Full month (January 2024)")
    if _RE_DATE_ABBREV_MONTH.search(text):
        formats_found.add("Abbreviated (Jan 2024)")
    if _RE_DATE_NUMERIC.search(text):
        formats_found.add("Numeric (01/2024)")
    return sorted(formats_found)


def _check_date_issues(
    text: str, sections: Dict[str, str],
) -> List[ATSIssue]:
    """Check for date-related ATS issues."""
    issues: List[ATSIssue] = []
    formats = _detect_date_formats(text)
    if len(formats) > 1:
        # Find examples of each format
        examples = []
        full_m = _RE_DATE_FULL_MONTH.search(text)
        abbrev_m = _RE_DATE_ABBREV_MONTH.search(text)
        numeric_m = _RE_DATE_NUMERIC.search(text)
        if full_m:
            examples.append(f"\"{full_m.group(0)}\"")
        if abbrev_m:
            examples.append(f"\"{abbrev_m.group(0)}\"")
        if numeric_m:
            examples.append(f"\"{numeric_m.group(0)}\"")
        dilly_msg = f"I found dates in {len(formats)} formats ({', '.join(examples[:3])}). I can read all of them, but ATS may misparse some. Pick one format and use it everywhere."
        issues.append(ATSIssue(
            category="dates",
            severity="warning",
            title="Mixed date formats",
            detail=f"Resume uses {len(formats)} different date formats: {', '.join(formats)}. ATS parsers extract dates more reliably when they're consistent.",
            fix="Pick one format (e.g., \"January 2024\" or \"Jan 2024\") and use it everywhere.",
            dilly_reads=dilly_msg,
        ))

    for key, content in sections.items():
        lower_key = key.lower()
        if not any(ek in lower_key for ek in ("experience", "employment", "work")):
            continue
        if content.strip() and not _RE_DATE_RANGE.search(content):
            # Count roles Dilly found
            role_lines = [l for l in content.split("\n") if l.strip() and not l.strip().startswith(("•", "-", "*"))]
            role_count = min(len(role_lines), 5)
            dilly_msg = f"I found {role_count} possible role(s) in your \"{key}\" section but no dates on any of them. Add \"Month YYYY – Month YYYY\" to each role so ATS can calculate your experience."
            issues.append(ATSIssue(
                category="dates",
                severity="critical",
                title=f"No dates in \"{key}\" section",
                detail="Experience without dates is a red flag. ATS cannot calculate your years of experience, and recruiters can't verify your timeline.",
                fix="Add start and end dates (e.g., \"June 2023 – Present\") to every role.",
                dilly_reads=dilly_msg,
            ))

    for key in sections:
        if key.lower() in ("education", "academic", "academics"):
            edu_content = sections[key]
            grad_m = re.search(
                r"(?:Expected|May|Dec|Jan|Aug|Spring|Fall|Summer|Winter)\s*\d{4}|\b20\d{2}\b",
                edu_content, re.IGNORECASE,
            )
            if not grad_m:
                # Try to identify what school Dilly found
                uni_m = re.search(r"(?:University|College|Institute)\s+(?:of\s+)?[A-Za-z]+", edu_content, re.IGNORECASE)
                school_name = uni_m.group(0) if uni_m else "your school"
                dilly_msg = f"I found {school_name} in your education but no graduation date. Add \"Expected May 2027\" so ATS knows your class year."
                issues.append(ATSIssue(
                    category="dates",
                    severity="warning",
                    title="No graduation date in Education",
                    detail="ATS uses graduation date to determine your class year and eligibility for entry-level programs.",
                    fix="Add expected graduation date: \"Expected May 2027\" or \"December 2026\".",
                    dilly_reads=dilly_msg,
                ))
            break

    return issues


# ---------------------------------------------------------------------------
# Section completeness
# ---------------------------------------------------------------------------

def _check_sections(
    sections: Dict[str, str], track: Optional[str] = None,
) -> Tuple[List[str], List[str]]:
    """Return (detected_sections, missing_sections)."""
    section_keys = {k.lower().strip() for k in sections if k != "_top"}

    detected = []
    for k in sorted(section_keys):
        detected.append(k.title())

    missing = []

    # Check education
    has_edu = any(any(ek in k for ek in ("education", "academic", "qualification"))
                  for k in section_keys)
    if not has_edu:
        missing.append("Education")

    # Check experience
    has_exp = any(any(ek in k for ek in ("experience", "employment", "work"))
                  for k in section_keys)
    if not has_exp:
        missing.append("Experience")

    # Check skills
    has_skills = any(any(sk in k for sk in ("skill", "competenc", "technical"))
                     for k in section_keys)
    if not has_skills:
        missing.append("Skills")

    # Track-specific recommendations
    if track:
        track_lower = track.lower()
        if "tech" in track_lower and not any("project" in k for k in section_keys):
            missing.append("Projects (recommended for Tech)")
        if "pre-health" in track_lower and not any("research" in k or "clinical" in k for k in section_keys):
            missing.append("Research or Clinical Experience (recommended for Pre-Health)")
        if "pre-law" in track_lower and not any("research" in k or "publication" in k for k in section_keys):
            missing.append("Research or Publications (recommended for Pre-Law)")

    return detected, missing


# ---------------------------------------------------------------------------
# ATS readiness score
# ---------------------------------------------------------------------------

def _compute_score(
    issues: List[ATSIssue],
    checklist: List[ATSChecklistItem],
    extracted_fields: List[ATSExtractedField],
    missing_sections: List[str],
) -> int:
    """Compute 0-100 ATS readiness score."""
    score = 100

    # Issue penalties
    for issue in issues:
        if issue.severity == "critical":
            score -= 12
        elif issue.severity == "warning":
            score -= 5
        elif issue.severity == "info":
            score -= 2

    # Checklist penalties
    for item in checklist:
        if not item.passed:
            score -= 4

    # Missing fields penalty
    for f in extracted_fields:
        if f.status == "missing":
            if f.field in ("Name", "Email"):
                score -= 10
            elif f.field in ("Phone", "Location"):
                score -= 5
            else:
                score -= 3

    # Missing sections penalty
    for s in missing_sections:
        if any(x in s.lower() for x in ("education", "experience", "skills")):
            score -= 10
        else:
            score -= 3

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_ats_analysis(
    raw_text: str,
    parsed: ParsedResume,
    structured_text: str = "",
    page_count: Optional[int] = None,
    track: Optional[str] = None,
) -> ATSAnalysisResult:
    """
    Run comprehensive ATS analysis on a resume.

    Args:
        raw_text: Original extracted text (before normalization)
        parsed: ParsedResume from resume_parser
        structured_text: Optional structured text from structured_resume
        page_count: PDF page count if known
        track: Career track for track-specific section recommendations

    Returns:
        ATSAnalysisResult with all analysis data
    """
    norm = parsed.normalized_text or normalize_resume_text(raw_text)
    sections = parsed.sections or get_sections(norm)

    # If we have structured text, also parse its sections for richer analysis
    if structured_text:
        struct_sections = get_sections_from_structured_text(structured_text)
        # Merge: struct_sections may have cleaner keys
        for k, v in struct_sections.items():
            if k not in sections and v.strip():
                sections[k] = v

    lines = [l.strip() for l in norm.split("\n") if l.strip()]

    # --- Collect issues ---
    issues: List[ATSIssue] = []

    # Parseability
    multi_col = _check_multi_column(raw_text, parsed)
    if multi_col:
        issues.append(multi_col)

    table = _check_table_layout(raw_text, parsed)
    if table:
        issues.append(table)

    header_issues = _check_non_standard_headers(sections)
    issues.extend(header_issues)

    contact = _check_contact_placement(raw_text)
    if contact:
        issues.append(contact)

    encoding = _check_encoding_issues(raw_text, parsed)
    if encoding:
        issues.append(encoding)

    graphics = _check_graphics_markers(raw_text, sections)
    if graphics:
        issues.append(graphics)

    caps = _check_all_caps_overuse(lines)
    if caps:
        issues.append(caps)

    # Date issues
    date_issues = _check_date_issues(norm, sections)
    issues.extend(date_issues)

    # Content: no quantified results
    bullet_lines = [l for l in lines if l and l[0] in "•-*●\u2022"]
    quantified = sum(1 for b in bullet_lines if re.search(r"\d+%?|\$[\d,]+|\d+\+?", b))
    if bullet_lines and quantified == 0:
        # Find an example bullet to suggest a rewrite
        sample_bullet = bullet_lines[0] if bullet_lines else ""
        sample_clean = re.sub(r"^[•\-*●\u2022]\s*", "", sample_bullet).strip()[:80]
        dilly_msg = f"I read all {len(bullet_lines)} of your bullets — none include a number."
        if sample_clean:
            dilly_msg += f" For example, \"{sample_clean}\" — can you add a count, percentage, or outcome?"
        issues.append(ATSIssue(
            category="content",
            severity="warning",
            title="No quantified results in bullets",
            detail="Bullets with numbers (\"increased sales 27%\", \"managed team of 5\") score higher in ATS keyword matching and recruiter scanning.",
            fix="Add at least 2-3 bullets with measurable outcomes: percentages, dollar amounts, team sizes, counts.",
            dilly_reads=dilly_msg,
        ))
    elif bullet_lines and quantified / len(bullet_lines) < 0.2:
        issues.append(ATSIssue(
            category="content",
            severity="info",
            title="Few quantified results",
            detail=f"Only {quantified} of {len(bullet_lines)} bullets include numbers. ATS and recruiters prioritize quantified achievements.",
            fix="Aim for at least 30% of your bullets to include a number, percentage, or measurable outcome.",
            dilly_reads=f"I found numbers in {quantified} out of {len(bullet_lines)} bullets. ATS and recruiters both scan for metrics — add more.",
        ))

    # Content: weak action verbs
    _VERB_REWRITES = {
        "responsible for": "Led", "helped with": "Supported", "assisted in": "Contributed to",
        "worked on": "Built", "duties included": "Delivered", "tasked with": "Managed",
    }
    weak_verbs = tuple(_VERB_REWRITES.keys())
    weak_found = 0
    for b in bullet_lines[:15]:
        lower_b = b.lower()
        for wv in weak_verbs:
            if wv in lower_b:
                strong = _VERB_REWRITES[wv]
                bullet_clean = re.sub(r"^[•\-*●\u2022]\s*", "", b).strip()[:100]
                # Remove the weak phrase and capitalize what follows
                after_weak = re.sub(re.escape(wv) + r"\s*", "", bullet_clean, count=1, flags=re.IGNORECASE).strip()
                if after_weak and after_weak[0].islower():
                    after_weak = after_weak[0].lower() + after_weak[1:]
                suggested = f"{strong} {after_weak}" if after_weak else f"{strong} [describe what you did]"
                dilly_msg = f"Your bullet says \"{wv}\". Rewrite as: \"{suggested}\""
                weak_found += 1
                if weak_found <= 3:
                    issues.append(ATSIssue(
                        category="content",
                        severity="info",
                        title="Weak action verb",
                        detail=f"\"{wv}\" is passive and generic. ATS keyword matching works better with strong, specific verbs.",
                        fix=f"Replace \"{wv}\" with a strong verb: led, built, launched, increased, reduced, designed, managed.",
                        dilly_reads=dilly_msg,
                        line=b[:120],
                    ))
                break

    # --- Extraction simulation ---
    extracted_fields = _extract_contact_fields(parsed, raw_text)

    # Education extraction
    edu_entries = _extract_education_entries(parsed)

    # Education fields
    if edu_entries:
        e = edu_entries[0]
        if e.university == "Not extracted":
            extracted_fields.append(ATSExtractedField("University", None, "missing", "ATS could not extract university name"))
        else:
            extracted_fields.append(ATSExtractedField("University", e.university, "extracted"))
        if e.major == "Not extracted":
            extracted_fields.append(ATSExtractedField("Major", None, "missing", "ATS could not extract major/degree"))
        else:
            extracted_fields.append(ATSExtractedField("Major", e.major, "extracted"))
        extracted_fields.append(ATSExtractedField("GPA", e.gpa, "extracted" if e.gpa else "missing",
                                                   None if e.gpa else "No GPA found"))
        if e.graduation == "Not extracted":
            extracted_fields.append(ATSExtractedField("Graduation", None, "missing",
                                                       "No graduation date found"))
        else:
            extracted_fields.append(ATSExtractedField("Graduation", e.graduation, "extracted"))
    else:
        for f_name in ("University", "Major", "GPA", "Graduation"):
            extracted_fields.append(ATSExtractedField(f_name, None, "missing", "No education section found"))

    # Experience extraction
    exp_entries = _extract_experience_entries(sections)

    # Skills extraction
    skills = _extract_skills(sections, norm)

    # --- Section analysis ---
    detected_sections, missing_sections = _check_sections(sections, track)
    # Preserve document order for section reorder suggestions (sections dict is insertion-ordered)
    section_order = [k for k in sections.keys() if k != "_top"]

    # --- Checklist ---
    checklist = _build_checklist(raw_text, parsed, sections, issues, page_count)

    # --- Score ---
    score = _compute_score(issues, checklist, extracted_fields, missing_sections)

    # --- Readiness ---
    critical_count = sum(1 for i in issues if i.severity == "critical")
    warning_count = sum(1 for i in issues if i.severity == "warning")
    missing_required = sum(1 for s in missing_sections
                          if any(x in s.lower() for x in ("education", "experience", "skills")))

    if critical_count >= 2 or score < 50 or missing_required >= 2:
        readiness = "at_risk"
        readiness_summary = "Your resume has critical ATS issues that could cause rejection before a human sees it."
    elif critical_count >= 1 or warning_count >= 3 or score < 70:
        readiness = "needs_work"
        readiness_summary = "Your resume will parse, but there are issues that could hurt your ranking. Fix the warnings to improve."
    else:
        readiness = "ready"
        readiness_summary = "Your resume is well-structured for ATS. It should parse cleanly and rank based on content match."

    return ATSAnalysisResult(
        readiness=readiness,
        readiness_summary=readiness_summary,
        score=score,
        issues=issues,
        checklist=checklist,
        extracted_fields=extracted_fields,
        experience_entries=exp_entries,
        education_entries=edu_entries,
        detected_sections=detected_sections,
        missing_sections=missing_sections,
        skills_extracted=skills,
        section_order=section_order,
    )
