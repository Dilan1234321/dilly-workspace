"""
Dilly Core — Vantage Alpha specialized graduate audit modules.
Pre-Health, Pre-Law, Builder with evidence-based rules only (zero hallucination).
"""

import re
from dataclasses import dataclass
from typing import List, Tuple

from dilly_core.scoring import ScoringSignals, get_major_multiplier


@dataclass
class TrackAuditResult:
    """Build score and audit findings for one track."""
    build_score: float
    findings: List[str]
    elite_status: bool = False


def audit_pre_health(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """
    Pre-Health (MD/DO) Vantage Alpha:
    - +25% weight for longitudinal (1yr+) clinical hours.
    - 3.8 GPA floor for "Elite" status.
    - 1.5x weight for BCPM (Science) GPA when present.
    """
    text = raw_text.lower()
    findings: List[str] = []
    build_raw = 0.0
    # Clinical keyword density
    clinical_kw = ["clinical", "shadowing", "emt", "patient", "hospital", "scribing", "volunteer", "medical", "surgery", "direct patient"]
    clinical_hits = sum(12 for kw in clinical_kw if kw in text)
    research_pts = 25 if signals.has_research else 0
    build_raw = clinical_hits + research_pts
    # +25% for longitudinal clinical (1yr+)
    if signals.longitudinal_clinical_years >= 1.0:
        build_raw *= 1.25
        findings.append("Score +25% for longitudinal (1yr+) clinical/patient care.")
    # BCPM 1.5x: blend with overall GPA for Smart is handled in scoring; here we only note
    if signals.bcpm_gpa is not None:
        findings.append("BCPM (Science) GPA detected; weighted at 1.5x in academic rigor.")
    # Research Longevity: 2+ years in same lab = +20%
    research_years = getattr(signals, "research_longevity_years", 0.0)
    if research_years >= 2.0:
        build_raw *= 1.20
        findings.append("Score +20% for 2+ years Research Longevity (longitudinal lab).")
    # Elite: 3.8+ floor
    elite = signals.gpa >= 3.8
    if elite:
        findings.append("Elite status: GPA meets 3.8+ Pre-Health floor.")
    else:
        findings.append("GPA below 3.8 Elite floor; consider raising academic baseline.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings, elite_status=elite)


def audit_pre_law(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """
    Pre-Law (JD) Vantage Alpha:
    - 45% GPA weighting for Smart (handled in composite; we note it).
    - +20% weight for Outcome-Based leadership metrics.
    """
    text = raw_text.lower()
    findings: List[str] = []
    legal_kw = ["debate", "legal", "advocacy", "court", "internship", "writing", "justice", "political", "international", "moot court", "mock trial", "paralegal"]
    build_raw = sum(12 for kw in legal_kw if kw in text)
    # +20% for outcome-based leadership
    if signals.outcome_leadership_count > 0:
        build_raw *= 1.20
        findings.append("Score +20% for outcome-based leadership (e.g. increased X%, drafted policy).")
    findings.append("Pre-Law Smart score uses 45% GPA weighting.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


def audit_builder(signals: ScoringSignals, raw_text: str) -> TrackAuditResult:
    """
    Builder — Specialized School Metrics 2026:
    - Commit Velocity 3/week = +10% weight.
    - Research Density 1 sem = +20% weight.
    """
    text = raw_text.lower()
    findings: List[str] = []
    tech_stack = ["python", "sql", "javascript", "aws", "docker", "excel", "tableau", "react", "git", "machine learning", "pandas", "seaborn", "r ", "java", "typescript"]
    hits = sum(8 for s in tech_stack if s in text)
    projects = len(re.findall(r"(?:Project|Built|Developed|Created|Deployed)", raw_text))
    build_raw = hits + (projects * 7)
    # Commit velocity 3+/week → +10%
    if signals.commit_velocity_per_week >= 3.0:
        build_raw *= 1.10
        findings.append("Score +10% for Commit Velocity ≥3/week (Pro baseline).")
    # Research density ≥1 sem → +20%
    if signals.research_semesters >= 1.0:
        build_raw *= 1.20
        findings.append("Score +20% for Research Density (1+ sem).")
    if signals.has_research and signals.research_semesters == 0:
        findings.append("Research signal detected; Research Density 1 sem would add +20% weight.")
    build_score = min(100.0, max(0.0, build_raw))
    return TrackAuditResult(build_score=round(build_score, 2), findings=findings)


def run_track_audit(
    track: str,
    signals: ScoringSignals,
    raw_text: str,
) -> TrackAuditResult:
    """Dispatch to Pre-Health, Pre-Law, or Builder audit. Returns build score + findings."""
    if track == "Pre-Health":
        return audit_pre_health(signals, raw_text)
    if track == "Pre-Law":
        return audit_pre_law(signals, raw_text)
    return audit_builder(signals, raw_text)
