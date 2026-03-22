"""
Meridian Per-ATS Vendor Simulation.

Simulates how four major ATS platforms would each parse and score the same
resume. Each vendor has different parsing engines, tolerance levels, and quirks.

Vendor profiles are based on published parsing behaviors, Textkernel/Sovren
documentation, and real-world testing patterns:

- Workday: Proprietary strict parser. Fortune 500 standard. Hates creative layouts.
- Greenhouse: API-based parser (Lever/Greenhouse uses more modern stack). 94% parse
  rate. More tolerant of formatting but still needs standard structure.
- iCIMS: Textkernel (Sovren) engine. Strict on section headers. DOCX > PDF. Uses
  keyword + semantic matching. Non-standard headers → unstructured dump.
- Lever: Modern parser. Most forgiving. Better at inferring sections from context.

No LLM calls. Pure rule-based simulation from existing ATS analysis signals.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from dilly_core.ats_analysis import (
    ATSAnalysisResult,
    ATSIssue,
    ATSChecklistItem,
    ATSExtractedField,
)
from dilly_core.ats_section_reorder import get_reorder_suggestion


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class VendorTip:
    """One vendor-specific tip."""
    severity: str      # "critical" | "warning" | "tip"
    message: str
    category: str      # "formatting" | "structure" | "content" | "dates" | "file_format"


@dataclass
class VendorResult:
    """Simulation result for one ATS vendor."""
    vendor: str                # "workday" | "greenhouse" | "icims" | "lever"
    display_name: str          # "Workday" | "Greenhouse" | "iCIMS" | "Lever"
    score: int                 # 0-100 vendor-specific score
    verdict: str               # "pass" | "risky" | "fail"
    summary: str               # one-line vendor-specific summary
    what_breaks: List[str]     # things this vendor would choke on
    what_works: List[str]      # things this vendor handles fine
    tips: List[VendorTip]      # vendor-specific actionable tips
    used_by: List[str]         # well-known companies using this ATS
    section_reorder: Optional[dict] = None  # {"current": [...], "suggested": [...], "reason": str} or None


@dataclass
class VendorSimulationResult:
    """Full vendor simulation output."""
    vendors: List[VendorResult]
    best_vendor: str            # which ATS would score this resume highest
    worst_vendor: str           # which ATS would score this resume lowest
    universal_tips: List[str]   # tips that apply to ALL vendors

    def to_dict(self) -> dict:
        return {
            "vendors": [
                {
                    "vendor": v.vendor,
                    "display_name": v.display_name,
                    "score": v.score,
                    "verdict": v.verdict,
                    "summary": v.summary,
                    "what_breaks": v.what_breaks,
                    "what_works": v.what_works,
                    "tips": [
                        {"severity": t.severity, "message": t.message, "category": t.category}
                        for t in v.tips
                    ],
                    "used_by": v.used_by,
                    "section_reorder": v.section_reorder,
                }
                for v in self.vendors
            ],
            "best_vendor": self.best_vendor,
            "worst_vendor": self.worst_vendor,
            "universal_tips": self.universal_tips,
        }


# ---------------------------------------------------------------------------
# Signal extraction from ATSAnalysisResult
# ---------------------------------------------------------------------------

def _extract_signals(ats: ATSAnalysisResult) -> dict:
    """Extract boolean/numeric signals from ATSAnalysisResult for vendor scoring."""
    issues = ats.issues
    checklist = ats.checklist
    fields = ats.extracted_fields

    def _has_issue(title_substr: str) -> bool:
        return any(title_substr.lower() in i.title.lower() for i in issues)

    def _issue_count(severity: str) -> int:
        return sum(1 for i in issues if i.severity == severity)

    def _checklist_passed(label_substr: str) -> bool:
        return any(label_substr.lower() in c.label.lower() and c.passed for c in checklist)

    def _field_extracted(field_name: str) -> bool:
        return any(f.field.lower() == field_name.lower() and f.status == "extracted" for f in fields)

    # Date format signals
    date_checklist = [c for c in checklist if "date" in c.label.lower()]
    consistent_dates = any(c.passed for c in date_checklist) if date_checklist else True

    # Deeper signals for vendor-specific differentiation
    # Experience entries: how many have clean role/company/dates vs "Not extracted"
    exp_clean = sum(1 for e in ats.experience_entries if e.company != "Not extracted" and e.dates and e.dates != "N/A")
    exp_total = len(ats.experience_entries)
    exp_missing_bullets = sum(1 for e in ats.experience_entries if e.bullet_count == 0)

    # Skills: bare list vs none
    skills_as_list = len(ats.skills_extracted)

    # Education: how complete is the extraction
    edu_complete = sum(1 for e in ats.education_entries
                       if e.university != "Not extracted" and e.degree != "Not extracted")

    # Count how many checklist items failed
    checklist_fails = [c.label for c in checklist if not c.passed]

    # Count different issue categories
    parseability_issues = sum(1 for i in issues if i.category == "parseability")
    formatting_issues = sum(1 for i in issues if i.category == "formatting")
    structure_issues = sum(1 for i in issues if i.category == "structure")
    content_issues = sum(1 for i in issues if i.category == "content")
    date_issues_count = sum(1 for i in issues if i.category == "dates")

    return {
        "has_multi_column": _has_issue("Multi-column"),
        "has_tables": _has_issue("Table"),
        "has_non_standard_headers": _has_issue("Non-standard header") or _has_issue("Unusual header"),
        "has_contact_buried": _has_issue("Contact info buried"),
        "has_encoding_issues": _has_issue("Encoding"),
        "has_graphic_ratings": _has_issue("rating graphics") or _has_issue("graphic"),
        "has_all_caps": _has_issue("ALL CAPS"),
        "has_mixed_dates": _has_issue("Mixed date"),
        "has_missing_dates": _has_issue("No dates"),
        "has_no_quantified": _has_issue("No quantified"),
        "has_few_quantified": _has_issue("Few quantified"),
        "has_weak_verbs": _has_issue("Weak action verb"),
        "critical_count": _issue_count("critical"),
        "warning_count": _issue_count("warning"),
        "info_count": _issue_count("info"),
        "single_column": _checklist_passed("Single-column"),
        "standard_headers": _checklist_passed("Standard section headers"),
        "contact_at_top": _checklist_passed("Contact info at top"),
        "no_tables": _checklist_passed("No tables"),
        "has_bullets": _checklist_passed("Bullet points"),
        "no_dense_blocks": _checklist_passed("No dense text"),
        "consistent_dates": consistent_dates,
        "has_email": _field_extracted("Email"),
        "has_phone": _field_extracted("Phone"),
        "has_name": _field_extracted("Name"),
        "has_linkedin": _field_extracted("LinkedIn"),
        "has_location": _field_extracted("Location"),
        "has_university": _field_extracted("University"),
        "has_major": _field_extracted("Major"),
        "has_gpa": _field_extracted("GPA"),
        "has_graduation": _field_extracted("Graduation"),
        "experience_count": exp_total,
        "experience_clean": exp_clean,
        "experience_missing_bullets": exp_missing_bullets,
        "education_count": len(ats.education_entries),
        "education_complete": edu_complete,
        "skills_count": skills_as_list,
        "detected_sections": [s.lower() for s in ats.detected_sections],
        "section_order": [s.lower() for s in getattr(ats, "section_order", []) or []],
        "missing_sections": [s.lower() for s in ats.missing_sections],
        "section_count": len(ats.detected_sections),
        "checklist_passed": sum(1 for c in checklist if c.passed),
        "checklist_total": len(checklist),
        "checklist_fails": checklist_fails,
        "parseability_issues": parseability_issues,
        "formatting_issues": formatting_issues,
        "structure_issues": structure_issues,
        "content_issues": content_issues,
        "date_issues": date_issues_count,
        "base_score": ats.score,
    }


# ---------------------------------------------------------------------------
# Vendor profiles and scoring
# ---------------------------------------------------------------------------

def _score_workday(sig: dict) -> VendorResult:
    """
    Workday: The strictest enterprise ATS.
    Used by Amazon, Walmart, Netflix, Bank of America, JPMorgan, Meta, Google.
    Proprietary parser. Zero tolerance for creative formatting.
    """
    score = 100
    tips: List[VendorTip] = []
    breaks: List[str] = []
    works: List[str] = []

    # Workday HATES multi-column -- often scrambles content order entirely
    if sig["has_multi_column"]:
        score -= 20
        breaks.append("Multi-column layout causes Workday to scramble your content order")
        tips.append(VendorTip("critical", "Workday's parser reads left-to-right across columns, mixing your experience with your sidebar. Convert to single-column immediately.", "formatting"))
    else:
        works.append("Single-column layout parses cleanly")

    # Workday struggles hard with tables
    if sig["has_tables"]:
        score -= 18
        breaks.append("Table-based layout is unreadable by Workday's parser")
        tips.append(VendorTip("critical", "Workday cannot extract text from table cells reliably. Your content may appear as one merged block or be completely lost.", "formatting"))
    else:
        works.append("No table structures to break parsing")

    # Non-standard headers cause section misclassification
    if sig["has_non_standard_headers"]:
        score -= 12
        breaks.append("Non-standard section headers cause Workday to misclassify content")
        tips.append(VendorTip("warning", "Workday only recognizes standard labels: 'Experience', 'Education', 'Skills'. Creative headers like 'My Journey' get dumped into a generic text field.", "structure"))
    else:
        works.append("Standard section headers recognized correctly")

    # Contact info placement is critical for Workday's auto-fill
    if sig["has_contact_buried"]:
        score -= 10
        breaks.append("Contact info not at top — Workday may fail to auto-populate applicant profile")
        tips.append(VendorTip("warning", "Workday pre-fills your applicant profile from the resume header. If name/email/phone aren't in the first few lines, you may need to manually re-enter everything.", "structure"))

    # Encoding issues break Workday's text extraction
    if sig["has_encoding_issues"]:
        score -= 8
        breaks.append("Character encoding issues corrupt text extraction")

    # Graphic ratings are invisible
    if sig["has_graphic_ratings"]:
        score -= 10
        breaks.append("Skill bar/star ratings are invisible to Workday")
        tips.append(VendorTip("warning", "Workday extracts zero information from graphic skill ratings. If Python shows as '●●●●○', Workday sees nothing. List skills as plain text.", "formatting"))

    # Date format strictness -- Workday is very strict
    if sig["has_mixed_dates"]:
        score -= 8
        breaks.append("Mixed date formats confuse Workday's date parser")
        tips.append(VendorTip("warning", "Workday's date parser expects a single consistent format. Use 'Month YYYY' everywhere (e.g., 'January 2024').", "dates"))

    if sig["has_missing_dates"]:
        score -= 12
        breaks.append("Missing dates prevent Workday from calculating years of experience")
        tips.append(VendorTip("critical", "Workday auto-calculates 'years of experience' from your date ranges. Missing dates = 0 years in the system, even if you have 5 years of real experience.", "dates"))

    # Missing core contact fields
    if not sig["has_email"]:
        score -= 10
        breaks.append("No email found — Workday cannot create applicant profile")
    if not sig["has_name"]:
        score -= 8
        breaks.append("Name not extracted — profile will be blank")
    if not sig["has_phone"]:
        score -= 5
        breaks.append("No phone number — recruiters can't call you")

    # Section completeness -- Workday needs all three
    for section in ("education", "experience", "skills"):
        if section in [s.lower() for s in sig["missing_sections"]]:
            score -= 10
            breaks.append(f"Missing '{section.title()}' section — Workday requires all three core sections")

    # Content quality (minor impact on Workday, it's mostly structural)
    if sig["has_weak_verbs"]:
        score -= 3
    if sig["has_no_quantified"]:
        score -= 3

    # Bullets help Workday parse individual achievements
    if not sig["has_bullets"]:
        score -= 6
        breaks.append("No bullet points — Workday may merge your achievements into one block")
        tips.append(VendorTip("warning", "Without bullets, Workday treats your experience descriptions as one paragraph. Individual achievements become invisible to keyword matching.", "formatting"))
    else:
        works.append("Bullet points help Workday parse individual achievements")

    # Dense text blocks
    if not sig["no_dense_blocks"]:
        score -= 5
        breaks.append("Dense text paragraphs are poorly parsed")

    # ALL CAPS overuse
    if sig["has_all_caps"]:
        score -= 4
        breaks.append("Excessive ALL CAPS can confuse text normalization")

    # --- Workday-specific deep checks ---

    # Workday auto-calculates experience years from dates for knockout screening
    if sig["experience_clean"] < sig["experience_count"] and sig["experience_count"] > 0:
        missing_data = sig["experience_count"] - sig["experience_clean"]
        score -= 4 * missing_data
        tips.append(VendorTip("critical", f"Workday auto-calculates 'years of experience' for knockout questions. {missing_data} of your {sig['experience_count']} roles are missing clean dates or company names — these won't count toward your total.", "structure"))

    # Workday uses knockout screening questions (GPA, graduation date, location)
    knockout_gaps = []
    if not sig["has_graduation"]:
        knockout_gaps.append("graduation date")
    if not sig["has_location"]:
        knockout_gaps.append("location")
    if knockout_gaps:
        score -= 4 * len(knockout_gaps)
        tips.append(VendorTip("warning", f"Workday uses knockout screening questions that auto-filter by {', '.join(knockout_gaps)}. If these fields aren't parseable, you may be auto-rejected before a human sees your resume.", "structure"))

    # Workday experience entries without bullets get merged
    if sig["experience_missing_bullets"] > 0:
        score -= 3 * sig["experience_missing_bullets"]
        breaks.append(f"{sig['experience_missing_bullets']} role(s) have no bullet points — Workday can't separate your achievements")

    score = max(0, min(100, score))

    if score >= 75:
        verdict = "pass"
        summary = "Your resume should parse cleanly through Workday. Focus on keyword matching for specific roles."
    elif score >= 50:
        verdict = "risky"
        summary = "Workday will parse most of your resume, but structural issues may cause some data loss. Fix the critical items."
    else:
        verdict = "fail"
        summary = "Workday's strict parser will likely misread or lose significant parts of your resume. Major reformatting needed."

    if not tips:
        tips.append(VendorTip("tip", "Your resume structure is Workday-ready. Focus on matching keywords from the job description — Workday's ranking is heavily keyword-driven.", "content"))

    if sig["has_linkedin"]:
        works.append("LinkedIn URL extracted (Workday links to LinkedIn profiles)")
    if sig["has_gpa"]:
        works.append("GPA extracted for automated screening filters")
    if sig["experience_clean"] == sig["experience_count"] and sig["experience_count"] > 0:
        works.append(f"All {sig['experience_count']} roles have clean dates for experience calculation")

    # Section reorder suggestion
    section_order = sig.get("section_order") or []
    reorder = get_reorder_suggestion(section_order, "workday")
    section_reorder = None
    if reorder:
        msg, current, suggested = reorder
        tips.append(VendorTip("tip", msg, "structure"))
        section_reorder = {"current": current, "suggested": suggested, "reason": msg}

    return VendorResult(
        vendor="workday",
        display_name="Workday",
        score=score,
        verdict=verdict,
        summary=summary,
        what_breaks=breaks,
        what_works=works,
        tips=tips,
        used_by=["Amazon", "Netflix", "Walmart", "JPMorgan", "Bank of America", "Meta"],
        section_reorder=section_reorder,
    )


def _score_greenhouse(sig: dict) -> VendorResult:
    """
    Greenhouse: Modern API-based parser. Popular with tech companies.
    94% parsing success rate. More tolerant of formatting.
    Human-centric: minimal auto-rejection, uses structured scorecards.
    Used by Airbnb, Spotify, HubSpot, Cloudflare, Notion, Stripe.
    """
    score = 100
    tips: List[VendorTip] = []
    breaks: List[str] = []
    works: List[str] = []

    # Greenhouse is more tolerant of multi-column but still loses sidebar content
    if sig["has_multi_column"]:
        score -= 10
        breaks.append("Multi-column layout may lose sidebar content during parsing")
        tips.append(VendorTip("warning", "Greenhouse handles multi-column better than Workday, but sidebar content (skills, contact) can still get jumbled. Single-column is safest.", "formatting"))
    else:
        works.append("Single-column layout parses optimally")

    # Tables are handled better than Workday but still problematic
    if sig["has_tables"]:
        score -= 10
        breaks.append("Table layouts partially break parsing")
        tips.append(VendorTip("warning", "Greenhouse's API parser can extract some table content, but the structure/order may be wrong. Remove tables for reliable parsing.", "formatting"))

    # Non-standard headers -- Greenhouse handles some creative headers
    if sig["has_non_standard_headers"]:
        score -= 6
        breaks.append("Creative section headers may not map to Greenhouse's candidate profile fields")
        tips.append(VendorTip("tip", "Greenhouse is more flexible with headers than Workday, but standard labels still map better to candidate profile fields that recruiters search.", "structure"))
    else:
        works.append("Section headers map correctly to candidate profile")

    # Contact placement -- Greenhouse is flexible
    if sig["has_contact_buried"]:
        score -= 5
        tips.append(VendorTip("tip", "Greenhouse can find contact info anywhere, but top placement ensures accurate auto-fill when applying.", "structure"))

    # Encoding
    if sig["has_encoding_issues"]:
        score -= 6
        breaks.append("Character encoding issues affect text extraction")

    # Graphic ratings
    if sig["has_graphic_ratings"]:
        score -= 7
        breaks.append("Visual skill ratings extracted as empty text")
        tips.append(VendorTip("warning", "Greenhouse's parser ignores graphic elements. Skill bars render as blank space in your candidate profile.", "formatting"))

    # Dates -- Greenhouse is more lenient
    if sig["has_mixed_dates"]:
        score -= 4
        tips.append(VendorTip("tip", "Greenhouse handles mixed date formats better than most ATS, but consistency still helps recruiters scan your timeline.", "dates"))
    if sig["has_missing_dates"]:
        score -= 8
        breaks.append("Missing employment dates leave gaps in timeline")
        tips.append(VendorTip("warning", "Even though Greenhouse relies on human review (scorecards), missing dates create timeline gaps that raise questions during screening.", "dates"))

    # Missing contact fields
    if not sig["has_email"]:
        score -= 8
        breaks.append("No email — can't create candidate profile")
    if not sig["has_name"]:
        score -= 6
        breaks.append("Name not extracted")
    if not sig["has_phone"]:
        score -= 3

    # Section completeness
    missing_core = sum(1 for s in sig["missing_sections"] if any(x in s for x in ("education", "experience", "skills")))
    if missing_core > 0:
        score -= 6 * missing_core
        breaks.append(f"{missing_core} core section(s) missing — limits candidate profile completeness")

    # Content matters more for Greenhouse (scorecard-based evaluation)
    if sig["has_no_quantified"]:
        score -= 5
        tips.append(VendorTip("warning", "Greenhouse uses structured scorecards — interviewers rate specific criteria. Quantified achievements give them concrete evidence to score you higher.", "content"))
    if sig["has_weak_verbs"]:
        score -= 3
        tips.append(VendorTip("tip", "Greenhouse resumes that mirror job posting language had 28% higher interview rates. Replace weak verbs with language from the job description.", "content"))

    if not sig["has_bullets"]:
        score -= 4
        breaks.append("No bullet points — harder for scorecard evaluation")

    if not sig["no_dense_blocks"]:
        score -= 3

    # ALL CAPS
    if sig["has_all_caps"]:
        score -= 2

    # --- Greenhouse-specific deep checks ---

    # Greenhouse uses structured scorecards: each interviewer rates specific criteria
    # Content quality has outsized impact because interviewers USE the parsed resume
    if sig["experience_missing_bullets"] > 0 and sig["experience_count"] > 0:
        score -= 3 * sig["experience_missing_bullets"]
        tips.append(VendorTip("warning", f"Greenhouse interviewers evaluate you using structured scorecards based on your parsed resume. {sig['experience_missing_bullets']} role(s) without bullets give scorers nothing specific to evaluate.", "content"))

    # Greenhouse's scorecard system means skills tags matter for candidate filtering
    if sig["skills_count"] < 3:
        score -= 5
        tips.append(VendorTip("warning", "Greenhouse tags candidates by skills for pipeline filtering. With fewer than 3 extractable skills, recruiters may never find you when searching their pipeline.", "content"))

    # Greenhouse companies (tech startups) care about projects section
    if not any("project" in s for s in sig["detected_sections"]):
        tips.append(VendorTip("tip", "Most Greenhouse companies are tech startups (Stripe, Notion, Cloudflare). A 'Projects' section with GitHub links or technical work significantly boosts your profile.", "structure"))

    # Greenhouse doesn't auto-reject, but incomplete profiles get deprioritized
    if sig["education_complete"] == 0 and sig["education_count"] > 0:
        score -= 4
        tips.append(VendorTip("tip", "Greenhouse doesn't auto-reject, but incomplete education data means your profile is deprioritized in recruiter searches.", "structure"))

    score = max(0, min(100, score))

    if score >= 75:
        verdict = "pass"
        summary = "Greenhouse will parse your resume well. Its scorecard system means content quality matters most — focus on matching the role's criteria."
    elif score >= 50:
        verdict = "risky"
        summary = "Greenhouse will parse most of your resume, but some fields may not map correctly. Fix structural issues for a complete candidate profile."
    else:
        verdict = "fail"
        summary = "Greenhouse's parser will lose significant content. Even though it relies on human review, a poorly parsed profile starts you at a disadvantage."

    if not tips:
        tips.append(VendorTip("tip", "Your resume is Greenhouse-ready. Pro tip: tailor your bullets to mirror the exact language in the job posting — Greenhouse tracks language match.", "content"))

    if sig["has_linkedin"]:
        works.append("LinkedIn URL extracted (Greenhouse links profiles to LinkedIn)")
    if sig["skills_count"] >= 5:
        works.append(f"{sig['skills_count']} skills extracted for candidate tagging")
    if sig["experience_count"] >= 2:
        works.append(f"{sig['experience_count']} experience entries parsed for timeline")

    section_order = sig.get("section_order") or []
    reorder = get_reorder_suggestion(section_order, "greenhouse")
    section_reorder = None
    if reorder:
        msg, current, suggested = reorder
        tips.append(VendorTip("tip", msg, "structure"))
        section_reorder = {"current": current, "suggested": suggested, "reason": msg}

    return VendorResult(
        vendor="greenhouse",
        display_name="Greenhouse",
        score=score,
        verdict=verdict,
        summary=summary,
        what_breaks=breaks,
        what_works=works,
        tips=tips,
        used_by=["Airbnb", "Spotify", "HubSpot", "Cloudflare", "Notion", "Stripe"],
        section_reorder=section_reorder,
    )


def _score_icims(sig: dict) -> VendorResult:
    """
    iCIMS: Textkernel (Sovren) parsing engine. Enterprise-grade.
    Strict on section headers. DOCX parses better than PDF.
    Uses keyword + semantic matching. Stores profiles indefinitely.
    Used by Target, UnitedHealth, Southwest Airlines, Comcast, T-Mobile.
    """
    score = 100
    tips: List[VendorTip] = []
    breaks: List[str] = []
    works: List[str] = []

    # Multi-column -- Textkernel handles it slightly better than raw parsers
    if sig["has_multi_column"]:
        score -= 12
        breaks.append("Multi-column layout disrupts Textkernel's section parsing")
        tips.append(VendorTip("warning", "iCIMS uses Textkernel (formerly Sovren) which does NLP-based section detection. Multi-column confuses the entity recognition, causing skills to merge with experience text.", "formatting"))
    else:
        works.append("Single-column layout compatible with Textkernel parser")

    # Tables
    if sig["has_tables"]:
        score -= 12
        breaks.append("Tables break Textkernel's entity extraction")

    # NON-STANDARD HEADERS -- This is iCIMS's biggest weakness
    if sig["has_non_standard_headers"]:
        score -= 16
        breaks.append("Non-standard headers cause content to be dumped into unstructured field")
        tips.append(VendorTip("critical", "This is critical for iCIMS: non-standard headers (like 'My Journey' instead of 'Experience') cause your content to be dumped into an unstructured catch-all field that recruiters almost never search. Use EXACTLY: 'Experience', 'Education', 'Skills'.", "structure"))
    else:
        works.append("Standard headers map to iCIMS's structured profile fields")

    # Contact placement
    if sig["has_contact_buried"]:
        score -= 7
        breaks.append("Contact info position affects Textkernel's name/email extraction")

    # Encoding
    if sig["has_encoding_issues"]:
        score -= 8
        breaks.append("Character encoding breaks Textkernel's NLP pipeline")
        tips.append(VendorTip("warning", "iCIMS's Textkernel engine uses NLP for entity recognition. Encoding corruption (mojibake, smart quotes) breaks the entire pipeline, not just the affected text.", "formatting"))

    # Graphic ratings
    if sig["has_graphic_ratings"]:
        score -= 8
        breaks.append("Visual skill ratings invisible to Textkernel")

    # Dates -- iCIMS needs clear structure
    if sig["has_mixed_dates"]:
        score -= 7
        breaks.append("Mixed date formats confuse Textkernel's timeline extraction")
        tips.append(VendorTip("warning", "iCIMS builds a structured timeline from your dates. Mixed formats (e.g., 'Jan 2024' and '01/2024') cause parsing errors that can misrepresent your experience length.", "dates"))
    if sig["has_missing_dates"]:
        score -= 12
        breaks.append("Missing dates prevent timeline construction — experience may show as 0 years")
        tips.append(VendorTip("critical", "iCIMS auto-calculates total experience for recruiter filters. No dates = no experience in the system. Add 'Month YYYY – Month YYYY' to every role.", "dates"))

    # Contact fields
    if not sig["has_email"]:
        score -= 10
        breaks.append("No email — iCIMS cannot create candidate record")
    if not sig["has_name"]:
        score -= 8
    if not sig["has_phone"]:
        score -= 4

    # Section completeness -- very important for iCIMS
    for section in ("education", "experience", "skills"):
        if section in [s.lower() for s in sig["missing_sections"]]:
            score -= 10
            breaks.append(f"Missing '{section.title()}' — iCIMS profile field will be empty")

    # iCIMS uses keyword + semantic matching
    if sig["has_no_quantified"]:
        score -= 4
    if sig["has_weak_verbs"]:
        score -= 4
        tips.append(VendorTip("tip", "iCIMS uses semantic matching — it understands synonyms. But weak verbs like 'responsible for' have low semantic weight. Use strong action verbs that match the job description's language.", "content"))

    if not sig["has_bullets"]:
        score -= 5
        breaks.append("No bullets — Textkernel merges achievement text")

    if not sig["no_dense_blocks"]:
        score -= 4

    # ALL CAPS
    if sig["has_all_caps"]:
        score -= 3

    # iCIMS-specific tip: DOCX advantage
    tips.append(VendorTip("tip", "Pro tip for iCIMS: DOCX files parse more reliably than PDFs. If applying through iCIMS (Target, T-Mobile, UnitedHealth), upload DOCX when possible.", "file_format"))

    # iCIMS stores profiles indefinitely
    if sig["skills_count"] >= 5:
        works.append(f"{sig['skills_count']} skills mapped to iCIMS's skills taxonomy (searchable across all jobs)")
        tips.append(VendorTip("tip", "iCIMS stores your profile indefinitely and surfaces it for future job searches. Well-tagged skills mean recruiters may find you for roles you never applied to.", "content"))

    # --- iCIMS-specific deep checks ---

    # Textkernel classifies skills against a standardized taxonomy (not just keyword matching)
    if sig["skills_count"] < 3:
        score -= 6
        tips.append(VendorTip("warning", "iCIMS uses Textkernel's skills taxonomy to classify your skills into standardized categories. Fewer than 3 extractable skills means your profile is nearly invisible in recruiter searches.", "content"))

    # iCIMS experience parsing needs very clear structure: role, company, dates on separate/clear lines
    if sig["experience_clean"] < sig["experience_count"] and sig["experience_count"] > 0:
        messy = sig["experience_count"] - sig["experience_clean"]
        score -= 5 * messy
        tips.append(VendorTip("critical", f"Textkernel needs clean entity separation: company name, job title, and dates on clearly structured lines. {messy} role(s) couldn't be fully extracted — those roles won't appear in your iCIMS profile.", "structure"))

    # iCIMS candidate profiles are searched across ALL open positions at that company
    if sig["has_email"] and sig["has_phone"] and sig["has_name"] and sig["skills_count"] >= 5:
        works.append("Complete candidate profile — searchable across all open positions at this company")

    # Textkernel does semantic matching, not just keyword matching
    if sig["content_issues"] == 0:
        works.append("Clean content structure for Textkernel's semantic matching engine")

    score = max(0, min(100, score))

    if score >= 75:
        verdict = "pass"
        summary = "Your resume will parse well through iCIMS's Textkernel engine. Your profile will be searchable across their system."
    elif score >= 50:
        verdict = "risky"
        summary = "iCIMS will parse your resume with some issues. Non-standard structure may cause data to land in unstructured fields."
    else:
        verdict = "fail"
        summary = "iCIMS's parser will struggle with your resume. Critical content may be dumped into unsearchable fields. Restructure with standard headers."

    if sig["has_linkedin"]:
        works.append("LinkedIn URL extracted for profile enrichment")
    if sig["has_university"]:
        works.append("University extracted for education filters")
    if sig["experience_count"] >= 2:
        works.append(f"{sig['experience_count']} roles parsed for experience timeline")

    section_order = sig.get("section_order") or []
    reorder = get_reorder_suggestion(section_order, "icims")
    section_reorder = None
    if reorder:
        msg, current, suggested = reorder
        tips.append(VendorTip("tip", msg, "structure"))
        section_reorder = {"current": current, "suggested": suggested, "reason": msg}

    return VendorResult(
        vendor="icims",
        display_name="iCIMS",
        score=score,
        verdict=verdict,
        summary=summary,
        what_breaks=breaks,
        what_works=works,
        tips=tips,
        used_by=["Target", "UnitedHealth", "Southwest Airlines", "Comcast", "T-Mobile"],
        section_reorder=section_reorder,
    )


def _score_lever(sig: dict) -> VendorResult:
    """
    Lever: Modern, startup-friendly ATS. Most forgiving parser.
    Better at inferring structure from context. Good at handling varied formats.
    Used by Shopify, Atlassian, KPMG, Lyft, Twilio, Databricks.
    """
    score = 100
    tips: List[VendorTip] = []
    breaks: List[str] = []
    works: List[str] = []

    # Lever handles multi-column better than anyone, but not perfectly
    if sig["has_multi_column"]:
        score -= 6
        breaks.append("Multi-column may cause minor content reordering")
        tips.append(VendorTip("tip", "Lever's parser handles multi-column better than most ATS, but sidebar content may still end up in unexpected places. Single-column is still recommended.", "formatting"))
    else:
        works.append("Clean single-column layout")

    # Tables -- Lever handles them better but not perfectly
    if sig["has_tables"]:
        score -= 7
        breaks.append("Table layouts partially parsed")
        tips.append(VendorTip("tip", "Lever can read basic tables, but complex nested structures still break. Remove tables for best results.", "formatting"))

    # Non-standard headers -- Lever's context inference is better
    if sig["has_non_standard_headers"]:
        score -= 4
        tips.append(VendorTip("tip", "Lever is better at inferring section types from context, but standard headers still ensure the most accurate mapping to candidate profile fields.", "structure"))
    else:
        works.append("Standard headers correctly parsed")

    # Contact placement -- Lever is flexible
    if sig["has_contact_buried"]:
        score -= 3
        tips.append(VendorTip("tip", "Lever can find contact info throughout the document, but top placement is still best practice.", "structure"))

    # Encoding
    if sig["has_encoding_issues"]:
        score -= 5
        breaks.append("Encoding issues affect some text extraction")

    # Graphic ratings
    if sig["has_graphic_ratings"]:
        score -= 6
        breaks.append("Visual skill ratings not extracted")
        tips.append(VendorTip("warning", "Even Lever can't read star/bar skill ratings. The parser sees empty space where your skill level should be.", "formatting"))

    # Dates -- Lever is good at date inference
    if sig["has_mixed_dates"]:
        score -= 3
        works.append("Lever handles mixed date formats reasonably well")
        tips.append(VendorTip("tip", "Lever's date parser is the most flexible among major ATS. It can handle most formats, but consistency still helps.", "dates"))
    else:
        works.append("Consistent date format parsed accurately")

    if sig["has_missing_dates"]:
        score -= 7
        breaks.append("Missing dates leave timeline gaps")
        tips.append(VendorTip("warning", "Even though Lever is lenient, missing dates still mean your experience can't be quantified in searches.", "dates"))

    # Contact fields
    if not sig["has_email"]:
        score -= 8
        breaks.append("No email found")
    if not sig["has_name"]:
        score -= 5
    if not sig["has_phone"]:
        score -= 2

    # Section completeness -- Lever is more lenient
    missing_core = sum(1 for s in sig["missing_sections"] if any(x in s for x in ("education", "experience", "skills")))
    if missing_core > 0:
        score -= 5 * missing_core
        breaks.append(f"{missing_core} core section(s) missing")

    # Content quality matters at Lever companies (competitive roles)
    if sig["has_no_quantified"]:
        score -= 4
        tips.append(VendorTip("warning", "Companies using Lever (Shopify, Atlassian, Databricks) are competitive. Quantified achievements make your resume stand out during human review.", "content"))
    if sig["has_weak_verbs"]:
        score -= 3
        tips.append(VendorTip("tip", "Lever companies tend to be tech-forward. Use strong, specific verbs that show impact: 'shipped', 'scaled', 'reduced', 'automated'.", "content"))

    if not sig["has_bullets"]:
        score -= 3
    if not sig["no_dense_blocks"]:
        score -= 2
    if sig["has_all_caps"]:
        score -= 2

    # --- Lever-specific deep checks ---

    # Lever companies heavily value culture and impact — content quality is paramount
    if sig["experience_missing_bullets"] > 0:
        tips.append(VendorTip("tip", f"Lever companies evaluate culture fit and impact from your bullets. {sig['experience_missing_bullets']} role(s) lack bullets — even at forgiving Lever, this means less for reviewers to work with.", "content"))

    # Lever is great at context inference — it can read between the lines
    if sig["section_count"] >= 4:
        works.append(f"{sig['section_count']} sections detected — Lever's context inference handles diverse section types well")

    # Lever companies often care about side projects and open source
    if any("project" in s for s in sig["detected_sections"]):
        works.append("Projects section detected — highly valued by Lever companies (Shopify, Databricks)")

    # If the resume fails even on Lever, that's a strong signal
    if sig["parseability_issues"] >= 3:
        score -= 5
        tips.append(VendorTip("critical", f"Your resume has {sig['parseability_issues']} parseability issues. If Lever — the most forgiving ATS — struggles, Workday and iCIMS will reject significant portions. Fix formatting first.", "formatting"))

    score = max(0, min(100, score))

    if score >= 75:
        verdict = "pass"
        summary = "Lever will parse your resume without issues. Its modern parser is the most forgiving — focus on content quality for these competitive companies."
    elif score >= 50:
        verdict = "risky"
        summary = "Lever will handle most of your resume fine, but there are some issues worth fixing for a complete profile."
    else:
        verdict = "fail"
        summary = "Even Lever's lenient parser struggles with your resume's structure. If it can't parse here, it won't parse anywhere."

    if not tips:
        tips.append(VendorTip("tip", "Your resume is Lever-ready. Focus on tailoring content — Lever companies (Shopify, Atlassian) care about impact and culture fit.", "content"))

    if sig["has_linkedin"]:
        works.append("LinkedIn URL extracted for profile enrichment")
    if sig["skills_count"] >= 5:
        works.append(f"{sig['skills_count']} skills extracted for candidate tagging")
    if sig["experience_count"] >= 1:
        works.append(f"{sig['experience_count']} experience entries cleanly parsed")
    if sig["education_count"] >= 1:
        works.append("Education section parsed correctly")

    section_order = sig.get("section_order") or []
    reorder = get_reorder_suggestion(section_order, "lever")
    section_reorder = None
    if reorder:
        msg, current, suggested = reorder
        tips.append(VendorTip("tip", msg, "structure"))
        section_reorder = {"current": current, "suggested": suggested, "reason": msg}

    return VendorResult(
        vendor="lever",
        display_name="Lever",
        score=score,
        verdict=verdict,
        summary=summary,
        what_breaks=breaks,
        what_works=works,
        tips=tips,
        used_by=["Shopify", "Atlassian", "KPMG", "Lyft", "Twilio", "Databricks"],
        section_reorder=section_reorder,
    )


# ---------------------------------------------------------------------------
# Universal tips
# ---------------------------------------------------------------------------

def _generate_universal_tips(sig: dict, vendors: List[VendorResult]) -> List[str]:
    """Generate tips that apply across all vendors."""
    tips: List[str] = []

    all_pass = all(v.verdict == "pass" for v in vendors)
    any_fail = any(v.verdict == "fail" for v in vendors)

    if any_fail:
        tips.append("At least one major ATS would reject your resume's structure. Fix critical issues first — they affect ALL platforms.")

    if sig["has_multi_column"]:
        tips.append("Every ATS struggles with multi-column layouts. Single-column is the universal safe choice.")

    if sig["has_non_standard_headers"]:
        tips.append("Use standard section headers (Experience, Education, Skills) — this single change improves scores across all four vendors.")

    if sig["has_missing_dates"]:
        tips.append("Add dates to every role and your education. All ATS vendors calculate experience from dates — no dates means zero experience in their system.")

    if not sig["has_email"]:
        tips.append("Add your email in the first few lines. Without it, no ATS can create your applicant profile.")

    if all_pass:
        tips.append("Your resume structure passes all four major ATS vendors. Now focus on tailoring content to each specific role.")

    if not tips:
        tips.append("Your resume is well-structured for ATS parsing. Focus on keyword optimization for specific job descriptions.")

    return tips


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_vendor_simulation(ats: ATSAnalysisResult) -> VendorSimulationResult:
    """
    Simulate how four major ATS vendors would parse and score this resume.

    Args:
        ats: ATSAnalysisResult from run_ats_analysis()

    Returns:
        VendorSimulationResult with per-vendor scores, tips, and comparison
    """
    sig = _extract_signals(ats)

    vendors = [
        _score_workday(sig),
        _score_greenhouse(sig),
        _score_icims(sig),
        _score_lever(sig),
    ]

    best = max(vendors, key=lambda v: v.score)
    worst = min(vendors, key=lambda v: v.score)

    universal = _generate_universal_tips(sig, vendors)

    return VendorSimulationResult(
        vendors=vendors,
        best_vendor=best.display_name,
        worst_vendor=worst.display_name,
        universal_tips=universal,
    )
