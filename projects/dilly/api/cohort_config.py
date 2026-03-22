"""
Cohort system: major → cohort mapping, scoring configs, and helper functions.
Replaces the old track system. Cohort is the source of truth going forward.
track field is kept for backward compatibility but cohort is canonical.
"""
from __future__ import annotations

# ── Major → cohort mapping ────────────────────────────────────────────────────

MAJOR_TO_COHORT: dict[str, str] = {
    # Tech cohort
    "Computer Science": "Tech",
    "Computer Information Systems": "Tech",
    "Software Engineering": "Tech",
    "Cybersecurity": "Tech",
    "Information Technology": "Tech",
    "Data Science": "Tech",  # default; may change based on industry_target

    # Business cohort
    "Finance": "Business",
    "Accounting": "Business",
    "Economics": "Business",
    "Business Administration": "Business",
    "International Business": "Business",
    "Management": "Business",
    "Marketing": "Business",
    "Advertising and Public Relations": "Business",

    # Science cohort
    "Biology": "Science",
    "Chemistry": "Science",
    "Biochemistry": "Science",
    "Physics": "Science",
    "Environmental Science": "Science",
    "Marine Science": "Science",
    "Forensic Science": "Science",

    # Quantitative cohort
    "Mathematics": "Quantitative",
    "Statistics": "Quantitative",

    # Health cohort
    "Nursing": "Health",
    "Health Sciences": "Health",
    "Exercise Science": "Health",
    "Kinesiology": "Health",
    "Allied Health": "Health",
    "Public Health": "Health",

    # Social Science cohort
    "Psychology": "Social Science",
    "Sociology": "Social Science",
    "Political Science": "Social Science",
    "Criminal Justice": "Social Science",
    "Government and World Affairs": "Social Science",
    "Social Work": "Social Science",
    "History": "Social Science",
    "Philosophy": "Social Science",

    # Humanities cohort
    "English": "Humanities",
    "Journalism": "Humanities",
    "Communication": "Humanities",
    "Liberal Arts": "Humanities",
    "Education": "Humanities",
    "Theatre Arts": "Humanities",
    "Music": "Humanities",
    "Digital Arts and Design": "Humanities",

    # Sport cohort
    "Sport Management": "Sport",
}

# Pre-professional overrides (always takes precedence over major)
PRE_PROFESSIONAL_TO_COHORT_OVERRIDE: dict[str, str] = {
    "Pre-Med": "Pre-Health",
    "Pre-Dental": "Pre-Health",
    "Pre-Pharmacy": "Pre-Health",
    "Pre-Veterinary": "Pre-Health",
    "Pre-Vet": "Pre-Health",
    "Pre-Physical Therapy": "Pre-Health",
    "Pre-PT": "Pre-Health",
    "Pre-Occupational Therapy": "Pre-Health",
    "Pre-OT": "Pre-Health",
    "Pre-Physician Assistant": "Pre-Health",
    "Pre-PA": "Pre-Health",
    "Pre-Law": "Pre-Law",
}


def assign_cohort(
    majors: list[str],
    pre_professional_track: str | None,
    industry_target: str | None,
) -> str:
    """
    Determine a student's cohort.
    Pre-professional overrides everything. Data Science may shift to Quantitative
    depending on industry_target.
    """
    # Pre-professional overrides everything
    if pre_professional_track:
        override = PRE_PROFESSIONAL_TO_COHORT_OVERRIDE.get(pre_professional_track.strip())
        if override:
            return override

    # Get cohort from first recognized major
    for major in (majors or []):
        cohort = MAJOR_TO_COHORT.get(str(major).strip())
        if cohort:
            # Data Science special case: industry target can shift to Quantitative
            if str(major).strip() == "Data Science" and industry_target:
                if industry_target in ("Finance & Quant Trading", "Actuarial & Insurance", "Research & Academia"):
                    return "Quantitative"
                # else stays Tech
            return cohort

    return "General"


# ── Scoring config per cohort ─────────────────────────────────────────────────

COHORT_SCORING_CONFIG: dict[str, dict] = {
    "Tech": {
        "weights": {"smart": 0.20, "grit": 0.30, "build": 0.50},
        "recruiter_bar": 78,
        "reference_company": "Google",
        "reference_phrase": "Google's hiring bar",
        "dimension_emphasis": "Build score",
    },
    "Business": {
        "weights": {"smart": 0.25, "grit": 0.55, "build": 0.20},
        "recruiter_bar": 82,
        "reference_company": "Goldman Sachs",
        "reference_phrase": "Goldman's filter threshold",
        "dimension_emphasis": "Grit score",
    },
    "Science": {
        "weights": {"smart": 0.45, "grit": 0.35, "build": 0.20},
        "recruiter_bar": 75,
        "reference_company": "NIH",
        "reference_phrase": "top research lab bar",
        "dimension_emphasis": "Smart score",
    },
    "Quantitative": {
        # Sub-weights by industry_target — see QUANTITATIVE_INDUSTRY_WEIGHTS
        "recruiter_bar": 80,
        "reference_company": "Jane Street",
        "reference_phrase": "Jane Street's hiring bar",
        "dimension_emphasis": "Smart score",
    },
    "Health": {
        "weights": {"smart": 0.30, "grit": 0.45, "build": 0.25},
        "recruiter_bar": 73,
        "reference_company": "Tampa General Hospital",
        "reference_phrase": "top hospital hiring bar",
        "dimension_emphasis": "Grit score",
    },
    "Social Science": {
        "weights": {"smart": 0.30, "grit": 0.50, "build": 0.20},
        "recruiter_bar": 70,
        "reference_company": "Deloitte",
        "reference_phrase": "top employer bar",
        "dimension_emphasis": "Grit score",
    },
    "Humanities": {
        "weights": {"smart": 0.25, "grit": 0.40, "build": 0.35},
        "recruiter_bar": 70,
        "reference_company": "NBCUniversal",
        "reference_phrase": "top employer bar",
        "dimension_emphasis": "Build score",
    },
    "Sport": {
        "weights": {"smart": 0.20, "grit": 0.50, "build": 0.30},
        "recruiter_bar": 72,
        "reference_company": "ESPN",
        "reference_phrase": "top sports industry bar",
        "dimension_emphasis": "Grit score",
    },
    "Pre-Health": {
        "weights": {"smart": 0.55, "grit": 0.30, "build": 0.15},
        "recruiter_bar": 85,
        "reference_company": "Mayo Clinic",
        "reference_phrase": "top med school threshold",
        "dimension_emphasis": "Smart score",
    },
    "Pre-Law": {
        "weights": {"smart": 0.50, "grit": 0.35, "build": 0.15},
        "recruiter_bar": 82,
        "reference_company": "Skadden",
        "reference_phrase": "top law school threshold",
        "dimension_emphasis": "Smart score",
    },
    "General": {
        "weights": {"smart": 0.33, "grit": 0.34, "build": 0.33},
        "recruiter_bar": 70,
        "reference_company": "top employers",
        "reference_phrase": "the recruiter threshold",
        "dimension_emphasis": "Grit score",
    },
    # Backward compat aliases
    "Finance": {
        "weights": {"smart": 0.25, "grit": 0.55, "build": 0.20},
        "recruiter_bar": 82,
        "reference_company": "Goldman Sachs",
        "reference_phrase": "Goldman's filter threshold",
        "dimension_emphasis": "Grit score",
    },
}

# Quantitative sub-weights by industry target
QUANTITATIVE_INDUSTRY_WEIGHTS: dict[str, dict] = {
    "Finance & Quant Trading": {
        "weights": {"smart": 0.40, "grit": 0.30, "build": 0.30},
        "recruiter_bar": 82,
        "reference_company": "Jane Street",
        "reference_phrase": "Jane Street's hiring bar",
    },
    "Tech & Data Science": {
        "weights": {"smart": 0.30, "grit": 0.30, "build": 0.40},
        "recruiter_bar": 78,
        "reference_company": "Google",
        "reference_phrase": "Google's hiring bar",
    },
    "Actuarial & Insurance": {
        "weights": {"smart": 0.35, "grit": 0.35, "build": 0.30},
        "recruiter_bar": 78,
        "reference_company": "Milliman",
        "reference_phrase": "top actuarial firm bar",
    },
    "Research & Academia": {
        "weights": {"smart": 0.55, "grit": 0.25, "build": 0.20},
        "recruiter_bar": 80,
        "reference_company": "NSF",
        "reference_phrase": "top PhD program threshold",
    },
    "Not sure yet": {
        "weights": {"smart": 0.38, "grit": 0.32, "build": 0.30},
        "recruiter_bar": 78,
        "reference_company": "top quantitative employers",
        "reference_phrase": "the quantitative employer bar",
    },
}

# ── Build signals per cohort ──────────────────────────────────────────────────

BUILD_SIGNALS: dict[str, list[str]] = {
    "Tech": [
        "github", "gitlab", "portfolio", "deployed", "built", "developed",
        "app", "website", "project", "open source", "hackathon", "kaggle",
        "aws", "gcp", "azure", "docker", "kubernetes",
    ],
    "Business": [
        "bloomberg terminal", "cfa", "series 7", "series 63", "excel",
        "financial model", "dcf", "pitch competition", "case competition",
        "consulting club", "investment club", "bloomberg",
    ],
    "Science": [
        "research", "lab", "publication", "poster", "presented", "journal",
        "NIH", "NSF", "REU", "thesis", "dissertation", "protocol", "assay",
    ],
    "Quantitative": [
        "putnam", "actuarial", "exam p", "exam fm", "exam ifm",
        "kaggle", "mathematical olympiad", "arxiv", "publication",
        "quant", "stochastic", "monte carlo", "python", "matlab",
        "statistical model", "regression",
    ],
    "Health": [
        "clinical hours", "patient", "shadowing", "cpr", "emt", "cna",
        "certified", "volunteer", "hospital", "clinic", "nursing",
        "hipaa", "ehr", "patient care",
    ],
    "Social Science": [
        "research", "publication", "survey", "irb", "spss", "policy",
        "internship", "nonprofit", "advocacy", "community", "fieldwork",
    ],
    "Humanities": [
        "published", "article", "byline", "portfolio", "produced",
        "directed", "performed", "exhibition", "teaching", "tutored",
        "editorial", "broadcast", "podcast", "documentary",
    ],
    "Sport": [
        "event", "managed", "coordinated", "athletic", "team",
        "facility", "game day", "marketing", "sponsorship", "ticketing",
        "nirsa", "nassm", "sports management",
    ],
    "Pre-Health": [
        "clinical hours", "shadowing", "mcat", "research", "patient care",
        "volunteer", "hospital", "emt", "scribe", "publication",
    ],
    "Pre-Law": [
        "lsat", "mock trial", "moot court", "legal intern", "law review",
        "paralegal", "debate", "published", "policy", "research",
    ],
    "General": [
        "internship", "volunteer", "project", "research", "leadership",
        "published", "built", "organized", "managed",
    ],
    # Finance alias
    "Finance": [
        "bloomberg terminal", "cfa", "series 7", "series 63", "excel",
        "financial model", "dcf", "pitch competition", "case competition",
        "consulting club", "investment club", "bloomberg",
    ],
}

# ── Scoring helper functions ──────────────────────────────────────────────────

def _get_quant_config(industry_target: str | None) -> dict:
    key = (industry_target or "").strip()
    return QUANTITATIVE_INDUSTRY_WEIGHTS.get(key, QUANTITATIVE_INDUSTRY_WEIGHTS["Not sure yet"])


def get_scoring_weights(cohort: str, industry_target: str | None) -> dict[str, float]:
    """Return {smart, grit, build} weights for final score calculation."""
    if cohort == "Quantitative":
        return _get_quant_config(industry_target)["weights"]
    config = COHORT_SCORING_CONFIG.get(cohort, COHORT_SCORING_CONFIG["General"])
    return config.get("weights", COHORT_SCORING_CONFIG["General"]["weights"])


def get_recruiter_bar(cohort: str, industry_target: str | None) -> int:
    """Return the recruiter bar threshold for this cohort."""
    if cohort == "Quantitative":
        return _get_quant_config(industry_target)["recruiter_bar"]
    config = COHORT_SCORING_CONFIG.get(cohort, COHORT_SCORING_CONFIG["General"])
    return config.get("recruiter_bar", 70)


def get_reference_phrase(cohort: str, industry_target: str | None) -> str:
    """Return the human-readable company/bar reference for this cohort."""
    if cohort == "Quantitative":
        return _get_quant_config(industry_target)["reference_phrase"]
    config = COHORT_SCORING_CONFIG.get(cohort, COHORT_SCORING_CONFIG["General"])
    return config.get("reference_phrase", "the recruiter threshold")


def get_build_signals(cohort: str) -> list[str]:
    """Return cohort-specific Build score signals."""
    return BUILD_SIGNALS.get(cohort, BUILD_SIGNALS["General"])
