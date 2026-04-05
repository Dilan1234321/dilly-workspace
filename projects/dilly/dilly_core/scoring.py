"""
Dilly Core - Scoring Engine (Ground Truth V6.5).
Implements Smart Score, Grit Score, and International (Global Grit) multiplier.
Zero-hallucination: only evidence present in the provided signals affects scores.
"""

import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import List, Tuple

# Major multipliers (Smart score: GPA × 15 × multiplier). One entry per UT catalog major.
# Every value is research-backed; see docs/MAJOR_MULTIPLIERS_RESEARCH.md for sources and tiers.
# Unknown = 1.00 (neutral).
MAJOR_MULTIPLIERS = {
    # Pre-Health / Science
    "Biochemistry and Allied Health": 1.26,
    "Biochemistry": 1.40,
    "Allied Health": 1.12,
    "Biomedical Sciences": 1.12,
    "Nursing": 1.15,
    "Public Health": 1.10,
    "Health Science": 1.10,
    "Human Performance": 1.08,
    "Art Therapy": 1.05,
    # Pre-Law
    "Political Science": 1.00,
    "Criminology": 1.00,
    "Criminology and Criminal Justice": 1.00,
    "History": 1.00,
    "International Studies": 1.00,
    "History & International Studies": 1.00,
    "Philosophy": 1.00,
    "Law, Justice and Advocacy": 1.00,
    # Tech
    "Data Science": 1.30,
    "Computer Science": 1.30,
    "Cybersecurity": 1.28,
    "Mathematics": 1.28,
    "Actuarial Science": 1.30,
    "Business Information Technology": 1.22,
    "Management Information Systems": 1.22,
    "Mathematics with Computer Science": 1.30,
    "Financial Enterprise Systems": 1.18,
    # Science
    "Biology": 1.18,
    "Chemistry": 1.38,
    "Physics": 1.32,
    "Marine Science": 1.16,
    "Marine Biology": 1.16,
    "Marine Chemistry": 1.18,
    "Environmental Science": 1.14,
    "Environmental Studies": 1.12,
    "Forensic Science": 1.14,
    "Psychology": 1.00,
    # Business
    "Finance": 1.12,
    "Economics": 1.12,
    "Accounting": 1.06,
    "Marketing": 0.92,
    "International Business": 0.92,
    "International Business & Marketing": 0.92,
    "Marketing & Finance": 1.02,
    "Management": 0.86,
    "Business Management": 0.86,
    "Entrepreneurship": 1.00,
    "Sport Management": 1.00,
    # Communications
    "Communication": 0.86,
    "Communication and Media Studies": 0.86,
    "Communication and Speech Studies": 0.86,
    "Advertising and Public Relations": 0.92,
    "Journalism": 0.92,
    # Education
    "Secondary Education": 0.92,
    "Elementary Education": 0.92,
    "Music Education": 0.92,
    "Professional Education": 0.92,
    # Arts
    "Art": 0.94,
    "Animation": 0.94,
    "Design": 0.94,
    "Graphic Design": 0.94,
    "Film and Media Arts": 0.94,
    "New Media": 0.94,
    "Dance": 0.92,
    "Music": 0.94,
    "Music Performance": 0.94,
    "Musical Theatre": 0.92,
    "Theatre": 0.92,
    "Visual Arts": 0.94,
    "Museum Studies": 0.94,
    # Humanities
    "English": 1.00,
    "Writing": 1.00,
    "Liberal Studies": 1.00,
    "Sociology": 1.00,
    "Spanish": 1.00,
    "Applied Linguistics": 1.00,
    # Fallback
    "Unknown": 1.00,
}

# Minor bonus points (Smart score). Every University of Tampa minor (Catalog 2025–2026).
# Values justified in docs/MINOR_BONUS_RESEARCH.md (cited sources). Unlisted = 0 (MTS).
MINOR_BONUS_PTS = {
    # Tier 1 (9–10): STEM / quant hardest
    "Chemistry": 9,
    "Computer Science": 9,
    "Cybersecurity": 9,
    "Data Science": 9,
    "Mathematics": 9,
    "Mathematics with Computer Science": 10,
    "Mathematics & Computer Science": 10,
    "Math & Computer Science": 10,
    "Physics": 9,
    # Tier 2 (7–8): STEM/quant/health
    "Accounting": 7,
    "Biology": 8,
    "Business Analytics": 7,
    "Economics": 7,
    "Finance": 7,
    "Management Information Systems": 7,
    "Marine Biology": 8,
    # Tier 3 (5–6): social science, languages, professional
    "Applied Linguistics": 5,
    "Asian Studies": 5,
    "Black Studies": 5,
    "Criminal Investigation": 6,
    "Criminology and Criminal Justice": 6,
    "English": 5,
    "Environmental Criminology and Crime Analysis": 6,
    "Exercise Science and Sport Studies": 5,
    "French": 5,
    "Geography": 5,
    "International Studies": 5,
    "Latin American and Caribbean Studies": 5,
    "Law, Justice and Advocacy": 6,
    "Law, Justice & Advocacy": 6,
    "Leadership Studies": 5,
    "Military Science": 5,
    "Philosophy": 5,
    "Political Science": 5,
    "Professional Education": 5,
    "Professional and Technical Writing": 5,
    "Psychology": 5,
    "Recreation": 5,
    "Sociology": 5,
    "Spanish": 5,
    "Sustainability": 5,
    "Women, Gender and Sexuality Studies": 5,
    "Writing": 5,
    # Tier 4 (3–4): communications, arts, softer business
    "Advertising": 3,
    "Advertising and Public Relations": 3,
    "Art": 3,
    "Business Administration": 4,
    "Cinema Studies": 3,
    "Communication": 3,
    "Communications": 3,
    "Design": 3,
    "Digital Media": 3,
    "Dance": 3,
    "Film and Media Arts": 3,
    "Interactive Media": 3,
    "Journalism": 3,
    "Management": 4,
    "Marketing": 4,
    "Music": 3,
    "Professional Selling": 4,
    "Public Relations": 3,
    "Speech Studies": 3,
    "Speech and Theatre": 3,
    "Theatre": 3,
    "Visual Arts": 3,
}
MINOR_DEFAULT_PTS = 0  # Unlisted minor: no points without research-backed value (see docs/MINOR_BONUS_RESEARCH.md)

# Fallback when knowledge/recognized_tech_employers.txt is not found
_RECOGNIZED_TECH_EMPLOYERS_FALLBACK = (
    "google", "alphabet", "meta", "facebook", "amazon", "aws", "apple", "netflix", "microsoft",
    "stripe", "figma", "jane street", "citadel", "two sigma",
    "ibm", "oracle", "salesforce", "adobe", "intel", "nvidia", "qualcomm", "cisco", "vmware",
    "spotify", "uber", "lyft", "airbnb", "twitter", "linkedin", "snap", "pinterest", "square",
    "shopify", "slack", "atlassian", "servicenow", "snowflake", "databricks", "palantir",
    "bloomberg", "goldman sachs", "morgan stanley", "jpmorgan", "jp morgan", "blackrock",
)


@lru_cache(maxsize=1)
def _get_recognized_tech_employers() -> Tuple[str, ...]:
    """
    Load recognized tech employers from knowledge/recognized_tech_employers.txt.
    One name per line, lowercase; lines starting with # or empty are skipped.
    Falls back to built-in list if file not found.
    """
    _dir = os.path.dirname(os.path.abspath(__file__))
    for base in (
        os.path.normpath(os.path.join(_dir, "..", "projects", "dilly", "knowledge")),
        os.path.normpath(os.path.join(_dir, "..", "knowledge")),
        os.path.join(os.getcwd(), "knowledge"),
    ):
        path = os.path.join(base, "recognized_tech_employers.txt")
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    names = [
                        line.strip().lower()
                        for line in f
                        if line.strip() and not line.strip().startswith("#")
                    ]
                return tuple(names) if names else _RECOGNIZED_TECH_EMPLOYERS_FALLBACK
            except Exception:
                pass
    return _RECOGNIZED_TECH_EMPLOYERS_FALLBACK

# Tech stack keywords for outcome-tie check (must appear in bullet with outcome to count). Default for CS / general Tech.
TECH_STACK_KEYWORDS = [
    "python", "sql", "javascript", "aws", "docker", "excel", "tableau", "react", "git",
    "machine learning", "pandas", "seaborn", "r ", "java", "typescript", "tensorflow", "pytorch",
    "node", "html", "css", "gcp", "azure", "kubernetes", "linux", "scala", "c++", "go ", "golang",
]

# Per-major keywords for Build (outcome-tie). TECH_RUBRICS_BY_MAJOR.md. Fallback: TECH_STACK_KEYWORDS.
TECH_MAJOR_KEYWORDS = {
    "Data Science": [
        "python", "sql", "pandas", "scikit-learn", "sklearn", "tensorflow", "pytorch", "tableau", "power bi",
        "machine learning", "aws", "sagemaker", "databricks", "snowflake", "bigquery", "r ", "seaborn",
        "excel", "statistics", "data analysis", "visualization",
    ],
    "Computer Science": TECH_STACK_KEYWORDS,
    "Cybersecurity": [
        "splunk", "sentinel", "wireshark", "siem", "edr", "python", "bash", "mitre", "incident response",
        "crowdstrike", "sentinelone", "qradar", "firewall", "ids", "ips", "malware", "threat",
        "tryhackme", "letsdefend", "ctf", "security+", "comptia", "giac", "gsec",
    ],
    # Mathematics is Science track (not Tech); Math+CS stays Tech
    "Actuarial Science": [
        "excel", "vba", "r ", "python", "sql", "reserving", "pricing", "experience studies",
        "soa", "cas", "exam p", "exam fm", "valuation", "risk", "insurance",
    ],
    "Business Information Technology": [
        "sql", "tableau", "power bi", "sap", "excel", "etl", "data warehouse", "erp",
        "aws", "azure", "database", "bi ", "business intelligence", "reporting",
    ],
    "Management Information Systems": [
        "sql", "tableau", "power bi", "sap", "oracle", "excel", "etl", "data warehouse", "erp",
        "aws", "azure", "database", "bi ", "business intelligence", "mis ", "reporting",
    ],
    "Mathematics with Computer Science": TECH_STACK_KEYWORDS,
    "Financial Enterprise Systems": [
        "excel", "sql", "tableau", "power bi", "financial", "reporting", "erp", "sap",
        "aws", "azure", "data warehouse", "etl", "valuation", "revenue", "budget",
    ],
}


def get_tech_keywords_for_major(major: str) -> List[str]:
    """Return outcome-tie keyword list for this Tech major. Fallback: TECH_STACK_KEYWORDS."""
    if not major or not major.strip():
        return TECH_STACK_KEYWORDS
    key = major.strip()
    if key in TECH_MAJOR_KEYWORDS:
        return TECH_MAJOR_KEYWORDS[key]
    for k, keywords in TECH_MAJOR_KEYWORDS.items():
        if k.lower() in key.lower():
            return keywords
    return TECH_STACK_KEYWORDS


# Impact magnitude weights (Grit): weight by % value. 1-9%=0.5, 10-24%=1.0, 25-49%=1.5, 50-99%=2.0, 100%+=2.5. $ = 1.0.
def _impact_magnitude_weight(pct_val: float | None, is_dollar: bool) -> float:
    """Return weight for one impact marker. Cap at 2.5."""
    if is_dollar:
        return 1.0
    if pct_val is None:
        return 1.0
    if pct_val >= 100:
        return 2.5
    if pct_val >= 50:
        return 2.0
    if pct_val >= 25:
        return 1.5
    if pct_val >= 10:
        return 1.0
    if pct_val >= 1:
        return 0.5
    return 0.5  # 0-1% still counts

# Leadership tier weights (Grit): Founder 2.0, Executive 1.5, Lead 1.0, Representative 0.5.
# Order matters: match "vice president" before "president".
LEADERSHIP_TIERS = [
    ("vice president", 1.5),
    ("vp ", 1.5),
    ("founder", 2.0),
    ("founded", 2.0),  # "Founded X" = founder signal
    ("president", 1.5),
    ("executive", 1.5),
    ("director", 1.5),
    ("chair", 1.5),
    ("lead ", 1.0),
    ("manager", 1.0),
    ("captain", 1.0),
    ("representative", 0.5),
]

# Honors tier pts (Smart): Latin 15, Dean's 8, Scholarship 5. Cap total at 30.
HONORS_LATIN = ("summa", "magna", "cum laude")
HONORS_DEANS = ("dean's list", "dean\u2019s list")  # straight and curly apostrophe
HONORS_SCHOLARSHIP = ("scholarship", "honors program", "honors")


@dataclass
class ScoringSignals:
    """Extracted signals used for scoring. Only these drive the engine."""
    gpa: float
    major: str
    honors_count: int
    has_research: bool
    quantifiable_impact_count: int
    leadership_density: int
    work_entry_count: int
    international_markers: bool
    has_minor: bool = False  # Deprecated: use minor (canonical name) for multiplier-based bonus
    minor: str = ""  # Canonical minor name(s); used for MINOR_BONUS_PTS. Empty = no minor or unknown.
    # Optional for track-specific (filled by parser)
    bcpm_gpa: float | None = None
    longitudinal_clinical_years: float = 0.0
    outcome_leadership_count: int = 0
    commit_velocity_per_week: float = 0.0
    research_semesters: float = 0.0
    research_longevity_years: float = 0.0
    # Tech-specific (TECH_SCORING_EXTRACTION_AND_RECOMMENDATIONS.md)
    deployed_app_or_live_link: bool = False
    hackathon_mention: bool = False
    recognized_tech_employer: bool = False
    competitive_programming: bool = False
    actuarial_exams_passed: int = 0
    certifications_list: List[str] = field(default_factory=list)
    # Cybersecurity: security-specific quantified impact in bullets (SOC analyst guides)
    security_metrics_count: int = 0
    # Phase 1 pillar improvements (docs/SCORING_IMPROVEMENT_PROPOSAL.md)
    impact_weighted_sum: float = 0.0  # sum of magnitude weights per impact marker
    leadership_weighted_sum: float = 0.0  # sum of tier weights per leadership hit
    honors_weighted_sum: float = 0.0  # sum of tier pts per honors hit


def _normalize_minor_to_canonical(raw_minor: str) -> str:
    """Map extracted minor phrase to canonical key for MINOR_BONUS_PTS. Returns '' if no match.
    Covers every University of Tampa minor (Catalog 2025–2026) and common resume phrasings."""
    if not raw_minor or not raw_minor.strip():
        return ""
    t = raw_minor.strip().lower()
    # Direct key match (lowercase compare)
    for canonical in MINOR_BONUS_PTS:
        if canonical.lower() == t or canonical.lower() in t:
            return canonical
    # Keyword matches (order: more specific first)
    if "math" in t and ("computer" in t or "cs" in t):
        return "Mathematics with Computer Science"
    if "computer science" in t:
        return "Computer Science"
    if "data science" in t:
        return "Data Science"
    if "cyber" in t:
        return "Cybersecurity"
    if "chem" in t:
        return "Chemistry"
    if "physic" in t:
        return "Physics"
    if "marine" in t and ("bio" in t or "biol" in t or "science" in t):
        return "Marine Biology"
    if "bio" in t and "log" in t:
        return "Biology"
    if "econ" in t:
        return "Economics"
    if "account" in t:
        return "Accounting"
    if "finance" in t and "enterprise" not in t:
        return "Finance"
    if "business analytics" in t or ("analytics" in t and "business" in t):
        return "Business Analytics"
    if "management information" in t or " mis " in t or t.strip() == "mis":
        return "Management Information Systems"
    if "criminal investigation" in t:
        return "Criminal Investigation"
    if "environmental criminology" in t or "crime analysis" in t:
        return "Environmental Criminology and Crime Analysis"
    if "criminology" in t or "criminal justice" in t:
        return "Criminology and Criminal Justice"
    if "law" in t and ("justice" in t or "advocacy" in t):
        return "Law, Justice and Advocacy"
    if "spanish" in t:
        return "Spanish"
    if "french" in t:
        return "French"
    if "applied linguistics" in t or "linguistics" in t:
        return "Applied Linguistics"
    if "asian studies" in t or ("asian" in t and "studies" in t):
        return "Asian Studies"
    if "black studies" in t:
        return "Black Studies"
    if "latin american" in t or "caribbean studies" in t:
        return "Latin American and Caribbean Studies"
    if "women" in t and ("gender" in t or "sexuality" in t):
        return "Women, Gender and Sexuality Studies"
    if "leadership" in t:
        return "Leadership Studies"
    if "sociolog" in t:
        return "Sociology"
    if "psycholog" in t:
        return "Psychology"
    if "political" in t:
        return "Political Science"
    if "international" in t and "business" not in t:
        return "International Studies"
    if "geography" in t:
        return "Geography"
    if "philosophy" in t or "phil " in t:
        return "Philosophy"
    if "english" in t:
        return "English"
    if "technical writing" in t or "professional writing" in t:
        return "Professional and Technical Writing"
    if "writing" in t:
        return "Writing"
    if "exercise science" in t or "sport studies" in t:
        return "Exercise Science and Sport Studies"
    if "recreation" in t:
        return "Recreation"
    if "sustainability" in t:
        return "Sustainability"
    if "professional education" in t:
        return "Professional Education"
    if "military science" in t or "rotc" in t:
        return "Military Science"
    if "business admin" in t or ("business" in t and "administration" in t):
        return "Business Administration"
    if "management" in t and "information" not in t and "sport" not in t:
        return "Management"
    if "marketing" in t:
        return "Marketing"
    if "professional selling" in t or ("selling" in t and "professional" in t):
        return "Professional Selling"
    if "communication" in t or "communications" in t:
        return "Communication"
    if "advertising" in t:
        return "Advertising and Public Relations"
    if "public relation" in t:
        return "Public Relations"
    if "journalism" in t:
        return "Journalism"
    if "cinema" in t:
        return "Cinema Studies"
    if "film" in t and "media" in t:
        return "Film and Media Arts"
    if "digital media" in t:
        return "Digital Media"
    if "interactive media" in t:
        return "Interactive Media"
    if "speech" in t and "theatre" in t:
        return "Speech and Theatre"
    if "speech studies" in t or ("speech" in t and "theatre" not in t):
        return "Speech Studies"
    if "theatre" in t or "theater" in t:
        return "Theatre"
    if "dance" in t:
        return "Dance"
    if "music" in t and "education" not in t and "performance" not in t:
        return "Music"
    if "visual arts" in t or ("art" in t and "visual" in t):
        return "Visual Arts"
    if "art" in t and "design" not in t:
        return "Art"
    if "design" in t:
        return "Design"
    return ""  # unknown minor; caller can use MINOR_DEFAULT_PTS if has_minor


def get_major_multiplier(major: str) -> float:
    """Resolve major to Logic/Attrition multiplier. Tries full name, then first segment (e.g. 'Biology–Pre-Professional' → Biology)."""
    if not major or not major.strip():
        return MAJOR_MULTIPLIERS["Unknown"]
    key = major.strip()
    if key in MAJOR_MULTIPLIERS:
        return MAJOR_MULTIPLIERS[key]
    for sep in [" & ", "–", " - ", "-"]:
        if sep in key:
            first = key.split(sep)[0].strip()
            if first in MAJOR_MULTIPLIERS:
                return MAJOR_MULTIPLIERS[first]
    return MAJOR_MULTIPLIERS.get(key, MAJOR_MULTIPLIERS["Unknown"])


def compute_smart_score(
    signals: ScoringSignals,
    *,
    track: str = "",
    gpa_weight: float | None = None,
) -> Tuple[float, List[str]]:
    """
    Smart Score = (GPA * 15 * Major_Multiplier) + Honors + Research.
    Pre-Health: BCPM (science GPA) weighted 1.5x when present.
    Pre-Law: GPA weighted at 45% of Smart (gpa_weight=0.45). Applied by caller to composite.
    Returns (score, evidence_list). Evidence only for claims actually used.
    """
    evidence: List[str] = []
    mult = get_major_multiplier(signals.major)
    # Pre-Health: blend GPA with BCPM at 1.5x weight when BCPM present
    if track == "Pre-Health" and signals.bcpm_gpa is not None:
        effective_gpa = (signals.gpa * 0.4) + (signals.bcpm_gpa * 1.5 * 0.6)
        base = effective_gpa * 15 * mult
        evidence.append(f"GPA {signals.gpa:.2f} + BCPM {signals.bcpm_gpa:.2f} (1.5x): effective × 15 × {mult:.2f}x = {base:.1f} base.")
    else:
        base = signals.gpa * 15 * mult
        evidence.append(f"GPA {signals.gpa:.2f} × 15 × {signals.major} multiplier ({mult:.2f}x) = {base:.1f} base.")
    honors_weighted = getattr(signals, "honors_weighted_sum", 0.0)
    if honors_weighted > 0:
        honors_pts = min(30.0, honors_weighted)
    else:
        honors_pts = min(30, signals.honors_count * 10)
    if honors_pts:
        evidence.append(f"Honors/recognition: +{honors_pts:.0f} pts.")
    research_pts = 25 if signals.has_research else 0
    if research_pts:
        evidence.append("Research signal detected: +25 pts.")
    minor_canonical = getattr(signals, "minor", "") or ""
    has_minor_legacy = getattr(signals, "has_minor", False)
    if minor_canonical:
        minor_pts = MINOR_BONUS_PTS.get(minor_canonical, MINOR_DEFAULT_PTS)
        evidence.append(f"Minor ({minor_canonical}): +{minor_pts} pts.")
    elif has_minor_legacy:
        minor_pts = MINOR_DEFAULT_PTS  # 0: unlisted minor not in research-backed table
        if minor_pts:
            evidence.append(f"Minor(s) present (additional coursework): +{minor_pts} pts.")
    else:
        minor_pts = 0
    raw = base + honors_pts + research_pts + minor_pts
    score = min(100.0, max(0.0, raw))
    return round(score, 2), evidence


def compute_grit_score(signals: ScoringSignals) -> Tuple[float, List[str]]:
    """
    Grit Score = (Impact weighted sum × 15) + (Leadership weighted sum × 12) + (Work Entry × 5).
    Impact: magnitude-weighted (5%=0.5×, 50%=2×). Leadership: tiered (Founder 2×, President 1.5×, etc).
    Returns (score, evidence_list).
    """
    evidence: List[str] = []
    impact_weighted = getattr(signals, "impact_weighted_sum", 0.0)
    if impact_weighted > 0:
        impact_pts = impact_weighted * 15
        evidence.append(f"Quantifiable impact (magnitude-weighted): {impact_weighted:.1f} × 15 = {impact_pts:.0f} pts.")
    else:
        impact_pts = signals.quantifiable_impact_count * 15
        if signals.quantifiable_impact_count:
            evidence.append(f"Quantifiable impact markers: {signals.quantifiable_impact_count} × 15 = {impact_pts} pts.")
    lead_weighted = getattr(signals, "leadership_weighted_sum", 0.0)
    if lead_weighted > 0:
        lead_pts = lead_weighted * 12
        evidence.append(f"Leadership (tiered): {lead_weighted:.1f} × 12 = {lead_pts:.0f} pts.")
    else:
        lead_pts = signals.leadership_density * 12
        if signals.leadership_density:
            evidence.append(f"Leadership density: {signals.leadership_density} × 12 = {lead_pts} pts.")
    work_pts = signals.work_entry_count * 5
    if signals.work_entry_count:
        evidence.append(f"Work/experience entries: {signals.work_entry_count} × 5 = {work_pts} pts.")
    raw = impact_pts + lead_pts + work_pts
    score = min(100.0, max(0.0, raw))
    return round(score, 2), evidence


def apply_international_multiplier(grit_score: float, has_international: bool) -> Tuple[float, List[str]]:
    """
    Global Grit: apply multiplier for international educational markers.
    Only applied when marker is present. Returns (adjusted_score, evidence).
    """
    if not has_international:
        return grit_score, []
    # Standard Global Grit bonus: +10% to Grit (documented in resume_auditor and v6 behavior)
    adjusted = min(100.0, grit_score * 1.10)
    return round(adjusted, 2), ["International educational markers: Global Grit +10% applied."]


def get_tech_outcome_tied_signals(
    raw_text: str,
    tech_keywords: List[str] | None = None,
) -> Tuple[int, List[str]]:
    """
    Outcome-tie rule: tech stack only counts when in a bullet with a measurable outcome.
    Returns (outcome_tied_tech_hits, skills_without_outcome).
    tech_keywords: major-specific list (from get_tech_keywords_for_major); default TECH_STACK_KEYWORDS.
    Traceability: TECH_RUBRICS_BY_MAJOR.md, TECH_SCORING_EXTRACTION_AND_RECOMMENDATIONS.md.
    """
    import re
    keywords = tech_keywords if tech_keywords is not None else TECH_STACK_KEYWORDS
    text = raw_text.replace("\r", "\n")
    text_lower = text.lower()
    # Bullets: lines that start with - • * or digit. or are indented (common resume pattern)
    lines = text.split("\n")
    bullets = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if re.match(r"^[\-\•\*]\s", s) or re.match(r"^\d+[.)]\s", s):
            bullets.append(s.lower())
        elif line.startswith("  ") or line.startswith("\t"):
            bullets.append(s.lower())
    # Outcome pattern in a bullet: %, $, or explicit metric phrases
    def has_outcome(bullet: str) -> bool:
        if re.search(r"\d+%|\$\d+", bullet):
            return True
        if re.search(r"(?:reduced|increased|improved|saved|decreased|by\s+\d+|to\s+\d+)", bullet):
            return True
        return False
    outcome_tied_hits = 0
    tech_in_outcome_bullets = set()
    for b in bullets:
        if not has_outcome(b):
            continue
        for kw in keywords:
            k = kw.strip()
            if not k:
                continue
            if k in b or (kw in b):
                outcome_tied_hits += 1
                tech_in_outcome_bullets.add(k)
    # Skills without outcome: tech keywords that appear in text but never in an outcome bullet
    all_tech_in_text = [kw for kw in keywords if kw.strip() and (kw.strip() in text_lower or kw in text_lower)]
    skills_without_outcome = [kw.strip() for kw in all_tech_in_text if kw.strip() not in tech_in_outcome_bullets]
    # Cap for recommendation (top 5)
    return outcome_tied_hits, skills_without_outcome[:5]


def extract_scoring_signals(
    raw_text: str,
    *,
    gpa: float | None = None,
    major: str = "Unknown",
    bcpm_gpa: float | None = None,
) -> ScoringSignals:
    """
    Derive ScoringSignals from raw resume text. Used when caller has not pre-extracted.
    Zero-hallucination: only regex/detected values; defaults are conservative.
    """
    import re
    text = raw_text.replace("\r", "\n")
    text_lower = text.lower()
    # GPA: only use extracted value if in plausible range (2.0-4.0); else default 3.5 (no hallucination)
    if gpa is not None:
        gpa_val = gpa
    else:
        gpa_m = re.search(r"(?:gpa|grade point average):?\s*([0-4]\.\d+)(?!\s*%)", text_lower)
        if gpa_m:
            try:
                v = float(gpa_m.group(1))
                gpa_val = v if 2.0 <= v <= 4.0 else 3.5
            except ValueError:
                gpa_val = 3.5
        else:
            gpa_val = 3.5
    # BCPM (science GPA) if not provided
    bcpm = bcpm_gpa
    if bcpm is None:
        bcpm_m = re.search(r"(?:science\s+gpa|bcpm|science gpa):?\s*([0-4]\.\d+)", text_lower)
        bcpm = float(bcpm_m.group(1)) if bcpm_m else None
    # Honors
    honors_count = 0
    honors_weighted_sum = 0.0
    for kw in HONORS_LATIN:
        if kw in text_lower:
            honors_count += 1
            honors_weighted_sum += 15
    for kw in HONORS_DEANS:
        if kw in text_lower:
            honors_count += 1
            honors_weighted_sum += 8
    for kw in HONORS_SCHOLARSHIP:
        if kw in text_lower:
            honors_count += 1
            honors_weighted_sum += 5
    honors_weighted_sum = min(30.0, honors_weighted_sum)
    # Research
    research_kw = ["research", "publication", "laboratory", "bench", "sequencing", "wet-lab", "wet lab", "pi ", "principal investigator"]
    has_research = any(kw in text_lower for kw in research_kw)
    # Quantifiable impact: numbers with % or $; weight by magnitude (docs/SCORING_IMPROVEMENT_PROPOSAL.md)
    impact_rec = re.sub(r"(\d)\s+(%)", r"\1\2", text)
    impact_rec = re.sub(r"(\$)\s+(\d)", r"\1\2", impact_rec)
    impact_markers = re.findall(r"\d+%|\$\d+", impact_rec)
    quantifiable_impact_count = len(impact_markers)
    impact_weighted_sum = 0.0
    for m in impact_markers:
        if m.startswith("$"):
            impact_weighted_sum += 1.0
        else:
            pct = float(m.replace("%", ""))
            impact_weighted_sum += _impact_magnitude_weight(pct, False)
    # "doubled", "tripled", "2x" etc.
    for mult_phrase, pct_val in [
        (r"\bdoubled\b", 100), (r"\btripled\b", 200), (r"\bquadrupled\b", 300),
        (r"\b2x\b", 100), (r"\b3x\b", 200), (r"\b4x\b", 300),
        (r"\b2\s*x\b", 100), (r"\b3\s*x\b", 200),
    ]:
        if re.search(mult_phrase, text_lower):
            impact_weighted_sum += _impact_magnitude_weight(float(pct_val), False)
    impact_weighted_sum = min(impact_weighted_sum, 20.0)  # cap to avoid runaway
    research_years = 0.0
    for ym in re.finditer(r"(\d+)\+?\s*years?\s*(?:in|of)?\s*(?:research|lab|laboratory)", text_lower):
        research_years = max(research_years, float(ym.group(1)))
    # Leadership (tiered: Founder 2.0, Executive 1.5, Lead 1.0, Representative 0.5)
    # Avoid double-counting "president" in "vice president"
    leadership_density = 0
    leadership_weighted_sum = 0.0
    text_for_lead = text_lower
    for phrase, weight in LEADERSHIP_TIERS:
        count = text_for_lead.count(phrase)
        if count > 0:
            leadership_density += count
            leadership_weighted_sum += weight * count
        if phrase in ("vice president", "vp "):
            text_for_lead = text_for_lead.replace(phrase, " ")
    # Work entries (month year patterns): abbreviated or full month names
    work_entries = len(re.findall(
        r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}",
        text,
        re.IGNORECASE,
    ))
    # International
    intl_kw = ["f-1", "f1 visa", "opt/cpt", "j-1", "h1-b", "international student", "study abroad", "exchange program"]
    international_markers = any(k in text_lower for k in intl_kw)
    # Minor(s): extract phrase and map to canonical for multiplier-based bonus
    minor_canonical = ""
    for pat in [
        r"\bminors?\s+in\s+([a-z][a-z\s,&\-]+?)(?:\s*[|\-\n]|\s*;\s*|$)",
        r"\bminor\s*[:\-]\s*([a-z][a-z\s,&\-]+?)(?:\s*[|\-\n]|$)",
    ]:
        for m in re.finditer(pat, text_lower):
            phrase = m.group(1).strip()
            if len(phrase) < 2 or len(phrase) > 60:
                continue
            # If multiple (e.g. "French, Asian Studies, Economics"), take first that maps
            for part in re.split(r"\s*[,&]\s*|\s+and\s+", phrase):
                part = part.strip()
                if not part:
                    continue
                cand = _normalize_minor_to_canonical(part)
                if cand and (not minor_canonical or MINOR_BONUS_PTS.get(cand, 0) > MINOR_BONUS_PTS.get(minor_canonical, 0)):
                    minor_canonical = cand
            if minor_canonical:
                break
        if minor_canonical:
            break
    if not minor_canonical and (re.search(r"\bminor\s*[:\-]\s*\w+", text_lower) or re.search(r"\bminors?\s+in\s+", text_lower)):
        has_minor = True  # detected but not mapped
    else:
        has_minor = bool(minor_canonical)
    # Longitudinal clinical (years) - simple heuristic: "X years" near clinical terms
    clinical_years = 0.0
    for m in re.finditer(r"(\d+)\+?\s*years?\s*(?:of)?\s*(?:clinical|patient|shadowing|volunteer|emt|scribe|medical)", text_lower):
        clinical_years = max(clinical_years, float(m.group(1)))
    if clinical_years == 0 and any(k in text_lower for k in ["clinical", "shadowing", "emt", "scribe", "patient care"]):
        clinical_years = 0.5
    # Outcome-based leadership: "increased X%", "drafted", "policy"
    outcome_leadership = len(re.findall(r"increased?\s+(?:membership|revenue|sales)?\s*\d+%", text_lower))
    outcome_leadership += sum(1 for w in ["drafted", "policy", "legislation", "moot court", "mock trial"] if w in text_lower)
    # Tech-specific extraction (TECH_SCORING_EXTRACTION_AND_RECOMMENDATIONS.md)
    deployed_app = bool(
        re.search(r"(?:https?://|www\.|github\.io|vercel\.app|herokuapp|netlify\.app)", text_lower)
        or re.search(r"(?:deployed|live at|link:)\s*(?:https?://|\w+\.(?:com|io|app))", text_lower)
    )
    hackathon = bool(re.search(r"hackathon", text_lower)) and bool(
        re.search(r"(?:hackathon|won|1st|2nd|3rd|first|second|third|placed|finalist|top\s*\d+)", text_lower)
    )
    # Recognized employer: name in employment context (at X, company: X, intern at X) to avoid "AWS" in skills counting as Amazon
    recog_employer = False
    for emp in _get_recognized_tech_employers():
        if emp not in text_lower:
            continue
        if re.search(rf"(?:at|company|intern|employed|role at)\s+[^,\n]*{re.escape(emp)}", text_lower):
            recog_employer = True
            break
        if re.search(rf"{re.escape(emp)}\s*(?:intern|engineer|developer|analyst)", text_lower):
            recog_employer = True
            break
    comp_prog = any(
        x in text_lower for x in ["codeforces", "leetcode", "icpc", "competitive programming", "putnam", "coding competition"]
    )
    actuarial_exams = len(re.findall(r"(?:SOA|CAS)\s*Exam\s*(?:P|FM|IFM|LTAM|STAM|SRM|PA|P\b|FM\b)", text, re.IGNORECASE))
    actuarial_exams += len(re.findall(r"Exam\s*(?:P|FM)\s*(?:passed|Pass)", text, re.IGNORECASE))
    cert_kw = [
        "aws", "gcp", "azure", "comptia", "security+", "cysa+", "giac", "gsec", "tensorflow", "splunk",
        "cfa", "cpa", "certified", "certification", "microsoft certified", "google cloud certified",
    ]
    certs_found = [c for c in cert_kw if c in text_lower]
    # Cybersecurity: security-specific quantified outcomes (TECH_SCORING_EXTRACTION: alerts triaged, MTTR, etc.)
    security_phrases = [
        "alerts triaged", "mttr", "mean time to", "incidents investigated", "false positive reduction",
        "false positive rate", "triage", "containment", "dwell time", "response time",
    ]
    security_metrics_count = sum(1 for p in security_phrases if p in text_lower)
    if re.search(r"\d+%", text) and any(s in text_lower for s in ["alert", "incident", "security", "siem", "edr", "threat", "malware"]):
        security_metrics_count = max(security_metrics_count, 1)
    security_metrics_count = min(10, security_metrics_count)
    # Commit velocity / research density: not reliably in PDF; leave 0 unless caller sets
    return ScoringSignals(
        gpa=gpa_val,
        major=major,
        honors_count=honors_count,
        has_research=has_research,
        quantifiable_impact_count=quantifiable_impact_count,
        leadership_density=leadership_density,
        work_entry_count=work_entries,
        impact_weighted_sum=impact_weighted_sum,
        leadership_weighted_sum=leadership_weighted_sum,
        honors_weighted_sum=honors_weighted_sum,
        international_markers=international_markers,
        has_minor=has_minor,
        minor=minor_canonical,
        bcpm_gpa=bcpm,
        longitudinal_clinical_years=clinical_years,
        outcome_leadership_count=outcome_leadership,
        commit_velocity_per_week=0.0,
        research_semesters=0.0,
        research_longevity_years=research_years,
        deployed_app_or_live_link=deployed_app,
        hackathon_mention=hackathon,
        recognized_tech_employer=recog_employer,
        competitive_programming=comp_prog,
        actuarial_exams_passed=min(10, actuarial_exams),
        certifications_list=certs_found,
        security_metrics_count=security_metrics_count,
    )
