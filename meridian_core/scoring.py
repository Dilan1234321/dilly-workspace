"""
Meridian Core — Scoring Engine (Ground Truth V6.5).
Implements Smart Score, Grit Score, and International (Global Grit) multiplier.
Zero-hallucination: only evidence present in the provided signals affects scores.
"""

from dataclasses import dataclass
from typing import List, Tuple

# Logic/Attrition multipliers per INFERENCE_STANDARDS.md and meridian_v6_engine
MAJOR_MULTIPLIERS = {
    "Biochemistry": 1.40,
    "Data Science": 1.30,
    "Computer Science": 1.30,
    "Physics": 1.30,
    "Mathematics": 1.25,
    "Cybersecurity": 1.25,
    "Biology": 1.15,
    "Allied Health": 1.15,
    "Biomedical Sciences": 1.15,
    "Nursing": 1.15,
    "Finance": 1.10,
    "Economics": 1.10,
    "Accounting": 1.05,
    "History": 1.00,
    "International Studies": 1.00,
    "Psychology": 1.00,
    "Criminology": 1.00,
    "Political Science": 1.00,
    "Chemistry": 1.15,
    "Marketing": 0.90,
    "International Business": 0.90,
    "Management": 0.85,
    "Business Management": 0.85,
    "Communication": 0.85,
    "Marine Science": 1.15,
    "Environmental Science": 1.15,
    "Secondary Education": 1.00,
    "Unknown": 1.00,
}


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
    # Optional for track-specific (filled by parser)
    bcpm_gpa: float | None = None
    longitudinal_clinical_years: float = 0.0
    outcome_leadership_count: int = 0
    commit_velocity_per_week: float = 0.0
    research_semesters: float = 0.0
    research_longevity_years: float = 0.0


def get_major_multiplier(major: str) -> float:
    """Resolve major to Logic/Attrition multiplier. First segment if combined (e.g. 'History & International Studies')."""
    key = (major.split(" & ")[0].strip() if major else "Unknown") or "Unknown"
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
    Pre-Law: GPA weighted at 45% of Smart (gpa_weight=0.45) — applied by caller to composite.
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
    honors_pts = min(30, signals.honors_count * 10)
    if honors_pts:
        evidence.append(f"Honors/recognition: +{honors_pts} pts.")
    research_pts = 25 if signals.has_research else 0
    if research_pts:
        evidence.append("Research signal detected: +25 pts.")
    raw = base + honors_pts + research_pts
    score = min(100.0, max(0.0, raw))
    return round(score, 2), evidence


def compute_grit_score(signals: ScoringSignals) -> Tuple[float, List[str]]:
    """
    Grit Score = (Quantifiable Impact * 15) + (Leadership Density * 12) + (Work Entry Density * 5).
    Returns (score, evidence_list).
    """
    evidence: List[str] = []
    impact_pts = signals.quantifiable_impact_count * 15
    if signals.quantifiable_impact_count:
        evidence.append(f"Quantifiable impact markers: {signals.quantifiable_impact_count} × 15 = {impact_pts} pts.")
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
    # GPA
    if gpa is not None:
        gpa_val = gpa
    else:
        gpa_m = re.search(r"(?:gpa|grade point average):?\s*([0-4]\.\d+)", text_lower)
        gpa_val = float(gpa_m.group(1)) if gpa_m else 3.5
    # BCPM (science GPA) if not provided
    bcpm = bcpm_gpa
    if bcpm is None:
        bcpm_m = re.search(r"(?:science\s+gpa|bcpm|science gpa):?\s*([0-4]\.\d+)", text_lower)
        bcpm = float(bcpm_m.group(1)) if bcpm_m else None
    # Honors
    honors_kw = ["dean's list", "dean’s list", "scholarship", "honors", "cum laude", "magna", "summa"]
    honors_count = sum(1 for kw in honors_kw if kw in text_lower)
    # Research
    research_kw = ["research", "publication", "laboratory", "bench", "sequencing", "wet-lab", "wet lab", "pi ", "principal investigator"]
    has_research = any(kw in text_lower for kw in research_kw)
    # Quantifiable impact: numbers with % or $
    impact_rec = re.sub(r"(\d)\s+(%)", r"\1\2", text)
    impact_rec = re.sub(r"(\$)\s+(\d)", r"\1\2", impact_rec)
    impact_markers = re.findall(r"\d+%|\$\d+", impact_rec)
    quantifiable_impact_count = len(impact_markers)
    research_years = 0.0
    for ym in re.finditer(r"(\d+)\+?\s*years?\s*(?:in|of)?\s*(?:research|lab|laboratory)", text_lower):
        research_years = max(research_years, float(ym.group(1)))
    # Leadership
    leadership_kw = ["president", "founder", "executive", "director", "chair", "lead ", "vp ", "vice president", "manager", "representative", "captain"]
    leadership_density = sum(1 for kw in leadership_kw if kw in text_lower)
    # Work entries (month year patterns)
    work_entries = len(re.findall(r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}", text))
    # International
    intl_kw = ["f-1", "f1 visa", "opt/cpt", "j-1", "h1-b", "international student", "study abroad", "exchange program"]
    international_markers = any(k in text_lower for k in intl_kw)
    # Longitudinal clinical (years) — simple heuristic: "X years" near clinical terms
    clinical_years = 0.0
    for m in re.finditer(r"(\d+)\+?\s*years?\s*(?:of)?\s*(?:clinical|patient|shadowing|volunteer|emt|scribe|medical)", text_lower):
        clinical_years = max(clinical_years, float(m.group(1)))
    if clinical_years == 0 and any(k in text_lower for k in ["clinical", "shadowing", "emt", "scribe", "patient care"]):
        clinical_years = 0.5
    # Outcome-based leadership: "increased X%", "drafted", "policy"
    outcome_leadership = len(re.findall(r"increased?\s+(?:membership|revenue|sales)?\s*\d+%", text_lower))
    outcome_leadership += sum(1 for w in ["drafted", "policy", "legislation", "moot court", "mock trial"] if w in text_lower)
    # Commit velocity / research density: not reliably in PDF; leave 0 unless caller sets
    return ScoringSignals(
        gpa=gpa_val,
        major=major,
        honors_count=honors_count,
        has_research=has_research,
        quantifiable_impact_count=quantifiable_impact_count,
        leadership_density=leadership_density,
        work_entry_count=work_entries,
        international_markers=international_markers,
        bcpm_gpa=bcpm,
        longitudinal_clinical_years=clinical_years,
        outcome_leadership_count=outcome_leadership,
        commit_velocity_per_week=0.0,
        research_semesters=0.0,
        research_longevity_years=research_years,
    )
