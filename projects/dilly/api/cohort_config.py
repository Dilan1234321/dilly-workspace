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
    from projects.dilly.api.cohort_scoring_weights import (
        COHORT_SCORING_WEIGHTS as _CSW,
        COHORT_EXPECTED_GPA as _CGPA,
        COHORT_ACTIVITY_KEYWORDS as _CAKW,
    )
    COHORT_SCORING_CONFIG: dict[str, dict] = {}
    for _key, _cfg in _CSW.items():
        _label = _cfg.get("label", _key)
        _s = _cfg.get("smart", 33)
        _g = _cfg.get("grit",  33)
        _b = _cfg.get("build", 34)
        _total = _s + _g + _b or 100
        COHORT_SCORING_CONFIG[_label] = {
            "label": _label,
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
            "expected_gpa":       _CGPA.get(_label, 3.0),
            "activity_keywords":  _CAKW.get(_label, []),
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


# ── Cohort-specific scoring ────────────────────────────────────────────────────

def score_for_cohort(
    signals: dict,
    resume_text: str,
    cohort_label: str,
    global_build: float,
) -> dict[str, float]:
    """
    Compute Smart, Grit, Build scores through a specific cohort's lens.

    • Smart  — cohort-relative GPA (3.5 in Communications > 3.5 in Biochemistry
               because Communications expects 2.8, Biochemistry expects 3.7).
               Also scaled by field-fit: domain knowledge signals in this field.

    • Grit   — leadership credit is reduced when the activity is not field-relevant
               (Biology Club presidency boosts Life Sciences Grit more than
               Business Grit).  Quantifiable impact and work entries are universal.

    • Build  — global audit build score scaled by field-fit: a CS portfolio does
               not count as Architecture build evidence.

    Args:
        signals:      Serialised ScoringSignals dict (stored in audit_history.json).
        resume_text:  Full resume text for keyword matching.
        cohort_label: Cohort display name (e.g. "Software Engineering & CS").
        global_build: Audit-computed Build score (track-specific, from audit engine).

    Returns:
        {"smart": float, "grit": float, "build": float}  — each 0–100.
    """
    cfg         = COHORT_SCORING_CONFIG.get(cohort_label, COHORT_SCORING_CONFIG.get("General", {}))
    text        = (resume_text or "").lower()

    # ── Raw signal extraction ─────────────────────────────────────────────────
    gpa          = float(signals.get("gpa", 0) or 0)
    honors_ws    = float(signals.get("honors_weighted_sum", 0) or 0)
    honors_cnt   = int(signals.get("honors_count", 0) or 0)
    has_research = bool(signals.get("has_research"))
    impact_ws    = float(signals.get("impact_weighted_sum", 0) or 0)
    impact_cnt   = int(signals.get("quantifiable_impact_count", 0) or 0)
    lead_ws      = float(signals.get("leadership_weighted_sum", 0) or 0)
    lead_cnt     = int(signals.get("leadership_density", 0) or 0)
    work_entries = int(signals.get("work_entry_count", 0) or 0)
    international = bool(signals.get("international_markers"))

    expected_gpa     = float(cfg.get("expected_gpa", 3.0))
    activity_kws     = cfg.get("activity_keywords", [])

    # ── Field-fit rate (shared by Smart and Build) ────────────────────────────
    # How many of this cohort's distinctive keywords appear in the resume?
    # High match → user has direct experience in this field.
    # Zero match → they're exploring from a completely different background.
    try:
        from projects.dilly.api.cohort_scoring_weights import COHORT_FIELD_KEYWORDS
        field_kws = COHORT_FIELD_KEYWORDS.get(cohort_label, [])
    except ImportError:
        field_kws = []

    if field_kws and text:
        kw_hits   = sum(1 for kw in field_kws if kw.lower() in text)
        fit_rate  = min(1.0, kw_hits / max(1, len(field_kws) * 0.4))
    else:
        fit_rate  = 1.0   # no keywords defined → can't penalise

    # ── SMART ─────────────────────────────────────────────────────────────────
    # Cohort-relative GPA component (base multiplier 70 calibrated so that
    # a student at their cohort's expected GPA scores roughly 70 from GPA alone,
    # leaving room for research/honors bonuses).
    gpa_ratio   = min(1.30, gpa / max(0.01, expected_gpa))
    smart_base  = gpa_ratio * 70.0

    # Research bonus: full credit only if research is field-relevant
    if has_research:
        research_relevant = field_kws and any(kw.lower() in text for kw in field_kws)
        research_pts = 22.0 if research_relevant else 8.0
    else:
        research_pts = 0.0

    honors_pts = min(22.0, honors_ws * 8 if honors_ws > 0 else honors_cnt * 8)

    # Field-fit applied to Smart: a CS student's 3.5 GPA ÷ Architecture's
    # 3.3 expected = ratio 1.06, smart_base = 74.  But they have no Architecture
    # knowledge signals → smart_ff = 0.40 → smart ≈ 30.  Accurate.
    smart_ff   = 0.40 + 0.60 * fit_rate
    raw_smart  = min(100.0, smart_base + research_pts + honors_pts)
    smart      = round(min(100.0, max(0.0, raw_smart * smart_ff)), 2)

    # ── GRIT ──────────────────────────────────────────────────────────────────
    # Leadership: reduce credit when the activity isn't field-relevant.
    raw_lead = lead_ws * 12 if lead_ws > 0 else lead_cnt * 12

    if activity_kws and raw_lead > 0:
        relevant_act = any(kw.lower() in text for kw in activity_kws)
        lead_pts = raw_lead if relevant_act else raw_lead * 0.35
    else:
        lead_pts = raw_lead   # no activity_kws defined → full credit

    impact_pts = impact_ws * 15 if impact_ws > 0 else impact_cnt * 15
    work_pts   = work_entries * 5
    raw_grit   = impact_pts + lead_pts + work_pts
    if international:
        raw_grit *= 1.10
    grit = round(min(100.0, max(0.0, raw_grit)), 2)

    # ── BUILD ─────────────────────────────────────────────────────────────────
    # Reuse the audit-computed build score (track-specific, outcome-tied) but
    # scale by field-fit.  A deployed app / GitHub portfolio does not count as
    # Architecture or Fashion build evidence.
    build_fit   = 0.25 + 0.75 * fit_rate
    build       = round(min(100.0, max(0.0, global_build * build_fit)), 2)

    return {"smart": smart, "grit": grit, "build": build}


# ── BUILD_SIGNALS compat shim ─────────────────────────────────────────────────
# Some callers import BUILD_SIGNALS directly — provide an empty dict fallback.
BUILD_SIGNALS: dict[str, list[str]] = {}
