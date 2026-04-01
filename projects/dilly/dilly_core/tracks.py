"""
Meridian Core - Multi-track audit modules.
Tracks: Pre-Health, Pre-Law, Tech, Science, Business, Finance, Consulting, Communications, Education, Arts, Humanities.
Every major maps to a track; unknown majors fall back to Humanities.
Finance: dedicated cohort for Big Four, investment banking, asset management, and financial firms.
"""

import re
from dataclasses import dataclass, field
from typing import List

from dilly_core.scoring import (
    ScoringSignals,
    get_major_multiplier,
    get_tech_outcome_tied_signals,
    get_tech_keywords_for_major,
)


# ---------------------------------------------------------------------------
# Track registry: canonical list and major → default track (when no text override)
# ---------------------------------------------------------------------------

ALL_TRACKS = (
    "Pre-Health",
    "Pre-Law",
    "Tech",
    "Science",
    "Business",
    "Finance",
    "Consulting",
    "Communications",
    "Education",
    "Arts",
    "Humanities",
)

# University of Tampa: every major/concentration mapped to a default academic track (catalog 2025–2026).
# Pre-Health and Pre-Law are tracks assigned only by resume text (intent), not by major.
# Parser normalizes names (e.g. "Criminology and Criminal Justice" → Criminology); first-segment match used for concentrations.
MAJOR_TO_DEFAULT_TRACK = {
    # ----- Tech -----
    "Data Science": "Tech",
    "Computer Science": "Tech",
    "Cybersecurity": "Tech",
    "Actuarial Science": "Tech",
    "Business Information Technology": "Tech",
    "Management Information Systems": "Tech",
    "Mathematics with Computer Science": "Tech",
    "Financial Enterprise Systems": "Tech",
    # ----- Science (includes health/life-science majors; Pre-Health track = text-only) -----
    "Biochemistry and Allied Health": "Science",
    "Biochemistry": "Science",
    "Allied Health": "Science",
    "Biomedical Sciences": "Science",
    "Nursing": "Science",
    "Public Health": "Science",
    "Health Science": "Science",
    "Human Performance": "Science",
    "Art Therapy": "Arts",
    "Biology": "Science",
    "Chemistry": "Science",
    "Mathematics": "Science",
    "Physics": "Science",
    "Marine Science": "Science",
    "Marine Biology": "Science",
    "Marine Chemistry": "Science",
    "Environmental Science": "Science",
    "Environmental Studies": "Science",
    "Forensic Science": "Science",
    "Psychology": "Science",
    # ----- Finance (Big Four, banking, asset management - dedicated cohort) -----
    "Finance": "Finance",
    "Economics": "Finance",
    "Accounting": "Finance",
    # ----- Business (marketing, management, general) -----
    "Marketing": "Business",
    "International Business": "Business",
    "International Business & Marketing": "Business",
    "Marketing & Finance": "Business",
    "Management": "Business",
    "Business Management": "Business",
    "Entrepreneurship": "Business",
    "Sport Management": "Business",
    # ----- Communications -----
    "Communication": "Communications",
    "Communication and Media Studies": "Communications",
    "Communication and Speech Studies": "Communications",
    "Advertising and Public Relations": "Communications",
    "Journalism": "Communications",
    # ----- Education -----
    "Secondary Education": "Education",
    "Elementary Education": "Education",
    "Music Education": "Education",
    "Professional Education": "Education",
    # ----- Arts -----
    "Art": "Arts",
    "Animation": "Arts",
    "Design": "Arts",
    "Graphic Design": "Arts",
    "Film and Media Arts": "Arts",
    "New Media": "Arts",
    "Dance": "Arts",
    "Music": "Arts",
    "Music Performance": "Arts",
    "Musical Theatre": "Arts",
    "Theatre": "Arts",
    "Visual Arts": "Arts",
    "Museum Studies": "Arts",
    # ----- Humanities (includes majors often associated with pre-law; Pre-Law track = text-only) -----
    "Political Science": "Humanities",
    "Criminology": "Humanities",
    "Criminology and Criminal Justice": "Humanities",
    "History": "Humanities",
    "International Studies": "Humanities",
    "History & International Studies": "Humanities",
    "Philosophy": "Humanities",
    "Law, Justice and Advocacy": "Humanities",
    "English": "Humanities",
    "Writing": "Humanities",
    "Liberal Studies": "Humanities",
    "Sociology": "Humanities",
    "Spanish": "Humanities",
    "Applied Linguistics": "Humanities",
    # Unknown or unlisted majors fall back to Humanities
}


def get_default_track_for_major(major: str) -> str:
    """Return the default track for a major when no text-based override applies. Every major maps to a track; unknown majors fall back to Humanities."""
    if not major or major == "Unknown":
        return "Humanities"
    key = major.strip()
    if key in MAJOR_TO_DEFAULT_TRACK:
        return MAJOR_TO_DEFAULT_TRACK[key]
    # First segment: "History & International Studies" → History; "Biology–Pre-Professional" → Biology
    for sep in [" & ", "–", " - ", "-"]:
        if sep in key:
            first = key.split(sep)[0].strip()
            if first in MAJOR_TO_DEFAULT_TRACK:
                return MAJOR_TO_DEFAULT_TRACK[first]
    # Substring match: "Bachelor of Arts in Advertising and Public Relations" → Communications (longest match first)
    key_lower = key.lower()
    for phrase, track in sorted(MAJOR_TO_DEFAULT_TRACK.items(), key=lambda x: -len(x[0])):
        if phrase.lower() in key_lower:
            return track
    return MAJOR_TO_DEFAULT_TRACK.get(key, "Humanities")


# Composite weights (smart, grit, build) for final_score. Pre-Law emphasizes GPA.
# Tech: average FAANG (Google, Meta, Amazon, Apple, Microsoft) from tech.json — scores based on top tech hiring guidelines.
COMPOSITE_WEIGHTS = {
    "Pre-Law": (0.45, 0.35, 0.20),
    "Tech": (0.36, 0.37, 0.27),  # Average FAANG: Smart 0.36, Grit 0.37, Build 0.27
}
# Industry archetypes: fallback when no company-specific weights. Used by company_fit for industry-weighted score.
INDUSTRY_WEIGHTS = {
    "Pre-Health": (0.40, 0.35, 0.25),  # GPA/BCPM heavy
    "Pre-Law": (0.45, 0.35, 0.20),
    "Tech": (0.36, 0.37, 0.27),
    "Consulting": (0.35, 0.40, 0.25),  # Grit/impact heavy
    "Finance": (0.35, 0.40, 0.25),  # Grit/ownership heavy
    "Science": (0.35, 0.40, 0.25),
    "Business": (0.30, 0.45, 0.25),
    "Communications": (0.30, 0.45, 0.25),
    "Education": (0.30, 0.45, 0.25),
    "Arts": (0.30, 0.45, 0.25),
    "Humanities": (0.30, 0.45, 0.25),
}
# Default for all other tracks
DEFAULT_COMPOSITE = (0.30, 0.45, 0.25)


def get_composite_weights(track: str) -> tuple:
    """Return (smart_weight, grit_weight, build_weight) for final score."""
    return COMPOSITE_WEIGHTS.get(track, DEFAULT_COMPOSITE)


def get_industry_weights(track: str) -> tuple:
    """Return industry-weighted (smart, grit, build) for track. Fallback when no company match."""
    return INDUSTRY_WEIGHTS.get(track, DEFAULT_COMPOSITE)


@dataclass
class TrackAuditResult:
    """Build score and audit findings for one track."""
    build_score: float
    findings: List[str]
    elite_status: bool = False
    skills_without_outcome: List[str] = field(default_factory=list)  # Tech: skills to recommend "tie to outcome"


# ---------------------------------------------------------------------------
# Pre-Health (MD/DO)
# ---------------------------------------------------------------------------

def audit_pre_health(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """
    Pre-Health (MD/DO): clinical, shadowing, research longevity, BCPM, 3.8 Elite floor.
    """
    text = raw_text.lower()
    findings: List[str] = []
    build_raw = 0.0
    clinical_kw = ["clinical", "shadowing", "emt", "patient", "hospital", "scribing", "volunteer", "medical", "surgery", "direct patient"]
    clinical_hits = sum(12 for kw in clinical_kw if kw in text)
    research_pts = 25 if signals.has_research else 0
    build_raw = clinical_hits + research_pts
    if signals.longitudinal_clinical_years >= 1.0:
        build_raw *= 1.25
        findings.append("Score +25% for longitudinal (1yr+) clinical/patient care.")
    if signals.bcpm_gpa is not None:
        findings.append("BCPM (Science) GPA detected; weighted at 1.5x in academic rigor.")
    research_years = getattr(signals, "research_longevity_years", 0.0)
    if research_years >= 2.0:
        build_raw *= 1.20
        findings.append("Score +20% for 2+ years Research Longevity (longitudinal lab).")
    elite = signals.gpa >= 3.8
    if elite:
        findings.append("Elite status: GPA meets 3.8+ Pre-Health floor.")
    else:
        findings.append("GPA below 3.8 Elite floor; consider raising academic baseline.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings, elite_status=elite)


# ---------------------------------------------------------------------------
# Pre-Law (JD)
# ---------------------------------------------------------------------------

def audit_pre_law(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Pre-Law: legal/advocacy keywords, outcome-based leadership +20%."""
    text = raw_text.lower()
    findings: List[str] = []
    legal_kw = ["debate", "legal", "advocacy", "court", "internship", "writing", "justice", "political", "international", "moot court", "mock trial", "paralegal"]
    build_raw = sum(12 for kw in legal_kw if kw in text)
    if signals.outcome_leadership_count > 0:
        build_raw *= 1.20
        findings.append("Score +20% for outcome-based leadership (e.g. increased X%, drafted policy).")
    findings.append("Pre-Law Smart score uses 45% GPA weighting.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Tech (software, data, security)
# ---------------------------------------------------------------------------

def audit_tech(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """
    Tech: per-major Build (TECH_RUBRICS_BY_MAJOR.md). Outcome-tied keywords per major; major-specific bonuses.
    Skills count only when in a bullet with measurable outcome; otherwise skills_without_outcome for recommendation.
    """
    text = raw_text.lower()
    major = (signals.major or "").strip()
    keywords = get_tech_keywords_for_major(major)
    outcome_tied_hits, skills_without_outcome = get_tech_outcome_tied_signals(raw_text, tech_keywords=keywords)
    findings: List[str] = []

    # Base: outcome-tied hits × 8, projects × 7 (all majors)
    build_raw = outcome_tied_hits * 8
    projects = len(re.findall(r"(?:Project|Built|Developed|Created|Deployed)", raw_text))
    build_raw += projects * 7
    if outcome_tied_hits > 0:
        findings.append("Tech stack counted only where tied to outcome (metric in same bullet).")

    # ----- Per-major bonuses (TECH_RUBRICS_BY_MAJOR.md) -----
    if major == "Cybersecurity":
        # Certs critical for SOC; lab/CTF
        certs = getattr(signals, "certifications_list", None) or []
        if certs:
            build_raw += min(20, len(certs) * 6)
            findings.append(f"Security certifications: +{min(20, len(certs) * 6)} pts.")
        if any(x in text for x in ["tryhackme", "letsdefend", "ctf", "capture the flag"]):
            build_raw += 10
            findings.append("Hands-on lab / CTF: +10 pts.")
        if getattr(signals, "deployed_app_or_live_link", False):
            build_raw += 8
            findings.append("Portfolio/writeup or live link: +8 pts.")
    elif major == "Actuarial Science":
        # Exam progress primary; domain keywords in outcome bullets
        exam_pts = getattr(signals, "actuarial_exams_passed", 0)
        if exam_pts > 0:
            build_raw += min(25, exam_pts * 10)
            findings.append(f"Actuarial exam progress: +{min(25, exam_pts * 10)} pts.")
        if any(x in text for x in ["reserving", "pricing", "experience studies", "valuation", "soa", "cas"]):
            build_raw += 8
            findings.append("Actuarial domain (reserving/pricing/valuation): +8 pts.")
        certs = getattr(signals, "certifications_list", None) or []
        if certs:
            build_raw += min(10, len(certs) * 4)
    elif major in ("Business Information Technology", "Management Information Systems", "Financial Enterprise Systems"):
        # BI/ERP focus; leadership + quant impact support Build
        if signals.leadership_density >= 1:
            build_raw += 8
            findings.append("Leadership/cross-functional: +8 pts.")
        if signals.quantifiable_impact_count >= 2:
            build_raw += 8
            findings.append("Quantifiable impact in systems/analytics: +8 pts.")
        if getattr(signals, "deployed_app_or_live_link", False):
            build_raw += 8
        certs = getattr(signals, "certifications_list", None) or []
        if certs:
            build_raw += min(12, len(certs) * 4)
    else:
        # Data Science, Computer Science, Mathematics with Computer Science: shared tech bonuses
        if getattr(signals, "deployed_app_or_live_link", False):
            build_raw += 12
            findings.append("Deployed app or live link: +12 pts.")
        if getattr(signals, "hackathon_mention", False):
            build_raw += 10
            findings.append("Hackathon participation/placement: +10 pts.")
        if getattr(signals, "recognized_tech_employer", False):
            build_raw += 15
            findings.append("Internship/role at recognized tech company: +15 pts.")
        if getattr(signals, "competitive_programming", False):
            build_raw += 10
            findings.append("Competitive programming (e.g. LeetCode, Codeforces): +10 pts.")
        certs = getattr(signals, "certifications_list", None) or []
        if certs:
            build_raw += min(15, len(certs) * 5)
            findings.append(f"Certifications: +{min(15, len(certs) * 5)} pts.")

    # ----- Shared (all Tech majors) -----
    if signals.commit_velocity_per_week >= 3.0:
        build_raw *= 1.10
        findings.append("Score +10% for Commit Velocity ≥3/week (Pro baseline).")
    if signals.research_semesters >= 1.0:
        build_raw *= 1.20
        findings.append("Score +20% for Research Density (1+ sem).")
    if signals.has_research and signals.research_semesters == 0 and major not in ("Actuarial Science", "Business Information Technology", "Management Information Systems", "Financial Enterprise Systems"):
        findings.append("Research signal detected; Research Density 1 sem would add +20% weight.")

    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(
        build_score=round(build_score, 2),
        findings=findings,
        skills_without_outcome=skills_without_outcome,
    )


# ---------------------------------------------------------------------------
# Science (research/industry science, not pre-health)
# ---------------------------------------------------------------------------

def audit_science(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Science: lab/research keywords, publication, instrumentation; research longevity bonus."""
    text = raw_text.lower()
    findings: List[str] = []
    science_kw = ["research", "laboratory", "lab", "publication", "sequencing", "bench", "wet-lab", "wet lab", "microscopy", "data analysis", "pi ", "principal investigator", "grants", "funding"]
    build_raw = sum(6 for kw in science_kw if kw in text)
    if signals.has_research:
        build_raw += 25
        findings.append("Research signal: +25 pts.")
    research_years = getattr(signals, "research_longevity_years", 0.0)
    if research_years >= 2.0:
        build_raw *= 1.20
        findings.append("Score +20% for 2+ years research longevity.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Business
# ---------------------------------------------------------------------------

def audit_business(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Business: quantifiable impact, leadership, analytics/tools (Excel, Tableau), internships."""
    text = raw_text.lower()
    findings: List[str] = []
    business_kw = ["excel", "tableau", "financial", "revenue", "budget", "analysis", "internship", "consulting", "sales", "marketing", "management", "leadership"]
    build_raw = sum(6 for kw in business_kw if kw in text)
    # Leadership and quantifiable impact already in Grit; add bonus for density
    if signals.leadership_density >= 2:
        build_raw += 15
        findings.append("Leadership density supports Build score.")
    if signals.quantifiable_impact_count >= 2:
        build_raw += 15
        findings.append("Quantifiable impact supports Build score.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Finance (Big Four, banking, asset management, financial firms)
# ---------------------------------------------------------------------------

def audit_finance(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Finance: Big Four, investment banking, asset management. Excel/CFA, quant impact, internships, deal/audit experience."""
    text = raw_text.lower()
    findings: List[str] = []
    finance_kw = [
        "excel", "tableau", "cfa", "cpa", "financial", "audit", "tax", "advisory", "valuation", "modeling",
        "investment", "banking", "asset management", "private equity", "hedge fund", "analyst", "internship",
        "revenue", "budget", "forecast", "due diligence", "transaction", "deal", "compliance", "gaap", "sec",
    ]
    build_raw = sum(6 for kw in finance_kw if kw in text)
    if signals.leadership_density >= 1:
        build_raw += 12
        findings.append("Leadership density supports Build score for finance roles.")
    if signals.quantifiable_impact_count >= 2:
        build_raw += 18
        findings.append("Quantifiable impact ($, %, growth) strongly valued by Big Four and financial firms.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Consulting (MBB, strategy, case work)
# ---------------------------------------------------------------------------

def audit_consulting(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Consulting: strategy, case work, client impact, leadership. MBB and consulting firms."""
    text = raw_text.lower()
    findings: List[str] = []
    consulting_kw = [
        "consulting", "strategy", "case", "client", "analysis", "recommendation", "mckinsey", "bcg", "bain",
        "deloitte", "ey ", "kpmg", "accenture", "internship", "framework", "stakeholder", "synthesis",
        "revenue", "growth", "efficiency", "impact", "leadership", "team", "presentation",
    ]
    build_raw = sum(6 for kw in consulting_kw if kw in text)
    if signals.leadership_density >= 1:
        build_raw += 14
        findings.append("Leadership density supports Build score for consulting.")
    if signals.quantifiable_impact_count >= 2:
        build_raw += 16
        findings.append("Quantifiable impact ($, %, growth) strongly valued by consulting firms.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Communications
# ---------------------------------------------------------------------------

def audit_communications(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Communications: writing, media, PR, campaigns, content, social media."""
    text = raw_text.lower()
    findings: List[str] = []
    comm_kw = ["writing", "content", "social media", "pr ", "public relations", "campaign", "media", "communication", "audience", "brand", "press", "journalism"]
    build_raw = sum(7 for kw in comm_kw if kw in text)
    if signals.leadership_density >= 1:
        build_raw += 10
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------

def audit_education(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Education: teaching, tutoring, curriculum, student engagement, certifications."""
    text = raw_text.lower()
    findings: List[str] = []
    ed_kw = ["teaching", "tutor", "curriculum", "lesson", "student", "classroom", "education", "certification", "certified", "mentor", "instruction"]
    build_raw = sum(8 for kw in ed_kw if kw in text)
    if signals.leadership_density >= 1:
        build_raw += 12
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Arts (creative / studio: art, film, music, theatre, design)
# ---------------------------------------------------------------------------

def audit_arts(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Arts: portfolio, exhibitions, productions, performances, design projects, media work."""
    text = raw_text.lower()
    findings: List[str] = []
    arts_kw = ["portfolio", "exhibition", "performance", "production", "design", "film", "animation", "theatre", "theater", "music", "dance", "studio", "art", "graphic", "media", "bfa", "b.f.a.", "curated", "exhibited", "composed", "directed", "edited", "reel", "showcase"]
    build_raw = sum(6 for kw in arts_kw if kw in text)
    if signals.leadership_density >= 1:
        build_raw += 12
    if signals.quantifiable_impact_count >= 1:
        build_raw += 10
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Humanities (English, writing, philosophy, liberal studies, sociology, languages)
# ---------------------------------------------------------------------------

def audit_humanities(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """Humanities: writing, research, analysis, language, publication, teaching/tutoring."""
    text = raw_text.lower()
    findings: List[str] = []
    humanities_kw = ["writing", "published", "publication", "research", "analysis", "essay", "thesis", "journal", "edit", "translation", "language", "philosophy", "sociology", "literature", "tutor", "teaching", "presentation", "conference"]
    build_raw = sum(6 for kw in humanities_kw if kw in text)
    if signals.has_research:
        build_raw += 20
    if signals.leadership_density >= 1:
        build_raw += 10
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

_TRACK_AUDITORS = {
    "Pre-Health": audit_pre_health,
    "Pre-Law": audit_pre_law,
    "Tech": audit_tech,
    "Science": audit_science,
    "Business": audit_business,
    "Finance": audit_finance,
    "Consulting": audit_consulting,
    "Communications": audit_communications,
    "Education": audit_education,
    "Arts": audit_arts,
    "Humanities": audit_humanities,
}


def run_track_audit(
    track: str,
    signals: ScoringSignals,
    raw_text: str,
) -> TrackAuditResult:
    """Dispatch to the correct audit function. Unknown track → Humanities."""
    fn = _TRACK_AUDITORS.get(track, audit_humanities)
    return fn(signals, raw_text)
