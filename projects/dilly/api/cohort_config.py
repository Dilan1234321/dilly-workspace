"""
Cohort system: major → cohort mapping, scoring configs, and helper functions.

Uses the rich 22-cohort system from academic_taxonomy.py (e.g. "Data Science &
Analytics", "Software Engineering & CS") instead of broad buckets ("Tech",
"Business", etc.).  The broad-bucket names are kept only in LEGACY_COHORT_ALIASES
so existing profiles can be silently upgraded.
"""
from __future__ import annotations
import os, sys

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
if _WORKSPACE not in sys.path:
    sys.path.insert(0, _WORKSPACE)

# ── Import authoritative major → cohort mapping ───────────────────────────────
# academic_taxonomy.py lives at workspace root and has 400+ major → rich-cohort
# entries (e.g. "Data Science" → "Data Science & Analytics").
try:
    from projects.dilly.academic_taxonomy import (
        MAJOR_TO_COHORT,
        PRE_PROFESSIONAL_TRACKS as _PRE_PROF_TRACKS,
    )
except ImportError:
    # Fallback: define a minimal rich mapping so nothing crashes
    MAJOR_TO_COHORT: dict[str, str] = {
        "Computer Science": "Software Engineering & CS",
        "Software Engineering": "Software Engineering & CS",
        "Data Science": "Data Science & Analytics",
        "Data Analytics": "Data Science & Analytics",
        "Mathematics": "Physical Sciences & Math",
        "Statistics": "Physical Sciences & Math",
        "Finance": "Finance & Accounting",
        "Accounting": "Finance & Accounting",
        "Marketing": "Marketing & Advertising",
        "Business Administration": "Consulting & Strategy",
        "Economics": "Finance & Accounting",
        "Cybersecurity": "Cybersecurity & IT",
        "Information Technology": "Cybersecurity & IT",
        "Biology": "Life Sciences & Research",
        "Chemistry": "Physical Sciences & Math",
        "Psychology": "Social Sciences & Nonprofit",
        "Nursing": "Healthcare & Clinical",
        "Communication": "Media & Communications",
    }
    _PRE_PROF_TRACKS: dict[str, str] = {
        "Pre-Med": "Healthcare & Clinical",
        "Pre-Health": "Healthcare & Clinical",
        "Pre-Law": "Law & Government",
    }

# ── Import scoring weights ─────────────────────────────────────────────────────
# cohort_scoring_weights.py has 43 research-backed entries keyed by snake_case.
# Build a label → config dict for easy lookup by cohort display name.
try:
    from projects.dilly.api.cohort_scoring_weights import COHORT_SCORING_WEIGHTS as _CSW
    COHORT_SCORING_CONFIG: dict[str, dict] = {}
    for _key, _cfg in _CSW.items():
        _label = _cfg.get("label", _key)
        _s = _cfg.get("smart", 33)
        _g = _cfg.get("grit",  33)
        _b = _cfg.get("build", 34)
        _total = _s + _g + _b or 100
        COHORT_SCORING_CONFIG[_label] = {
            "weights": {
                "smart": round(_s / _total, 4),
                "grit":  round(_g / _total, 4),
                "build": round(_b / _total, 4),
            },
            "recruiter_bar": _cfg.get("recruiter_bar", 70),
            "reference_company": _cfg.get("reference_company", "top employers"),
            "reference_phrase": _cfg.get("reference_benchmark", "the recruiter threshold"),
            "dimension_emphasis": (
                "Build score" if _b >= _s and _b >= _g
                else "Grit score" if _g >= _s
                else "Smart score"
            ),
        }
except ImportError:
    # Minimal fallback
    COHORT_SCORING_CONFIG: dict[str, dict] = {}

# Ensure a General fallback always exists
if "General" not in COHORT_SCORING_CONFIG:
    COHORT_SCORING_CONFIG["General"] = {
        "weights": {"smart": 0.33, "grit": 0.34, "build": 0.33},
        "recruiter_bar": 70,
        "reference_company": "top employers",
        "reference_phrase": "the recruiter threshold",
        "dimension_emphasis": "Grit score",
    }

# ── Legacy alias → rich cohort name ───────────────────────────────────────────
# Any stored cohort value in this set will be re-derived on next profile load.
LEGACY_COHORT_ALIASES: frozenset[str] = frozenset({
    # Old broad buckets
    "Tech", "Business", "Science", "Quantitative", "Health",
    "Social Science", "Humanities", "Sport", "Finance", "General",
    # Very old single-word names
    "technology", "business", "science", "health", "humanities",
})

# ── Pre-professional override mapping ─────────────────────────────────────────
PRE_PROFESSIONAL_TO_COHORT_OVERRIDE: dict[str, str] = _PRE_PROF_TRACKS


# ── assign_cohort ──────────────────────────────────────────────────────────────

def assign_cohort(
    majors: list[str],
    pre_professional_track: str | None = None,
    industry_target: str | None = None,
) -> str:
    """
    Determine a student's primary cohort (rich display name).
    Pre-professional track overrides everything.
    Data Science + Finance/Quant industry target → Finance & Accounting.
    """
    if pre_professional_track:
        override = PRE_PROFESSIONAL_TO_COHORT_OVERRIDE.get(
            (pre_professional_track or "").strip()
        )
        if override:
            return override

    for major in (majors or []):
        cohort = MAJOR_TO_COHORT.get(str(major).strip())
        if cohort:
            # Data Science special case: finance/quant industry → Finance & Accounting
            if str(major).strip() == "Data Science" and industry_target:
                if industry_target in (
                    "Finance & Quant Trading", "Actuarial & Insurance",
                    "Finance & Investment Banking",
                ):
                    return "Finance & Accounting"
            return cohort

    return "General"


# ── Scoring helper functions ───────────────────────────────────────────────────

def get_scoring_weights(cohort: str, industry_target: str | None = None) -> dict[str, float]:
    config = COHORT_SCORING_CONFIG.get(cohort, COHORT_SCORING_CONFIG["General"])
    return config.get("weights", {"smart": 0.33, "grit": 0.34, "build": 0.33})


def get_recruiter_bar(cohort: str, industry_target: str | None = None) -> int:
    config = COHORT_SCORING_CONFIG.get(cohort, COHORT_SCORING_CONFIG["General"])
    return config.get("recruiter_bar", 70)


def get_reference_phrase(cohort: str, industry_target: str | None = None) -> str:
    config = COHORT_SCORING_CONFIG.get(cohort, COHORT_SCORING_CONFIG["General"])
    return config.get("reference_phrase", "the recruiter threshold")


def get_build_signals(cohort: str) -> list[str]:
    """Return cohort-specific Build score signals (delegated to academic_taxonomy)."""
    try:
        from projects.dilly.academic_taxonomy import COHORTS
        entry = COHORTS.get(cohort, {})
        return entry.get("fields", [])
    except ImportError:
        return []


# ── BUILD_SIGNALS compat shim ─────────────────────────────────────────────────
# Some callers import BUILD_SIGNALS directly — provide an empty dict fallback.
BUILD_SIGNALS: dict[str, list[str]] = {}
