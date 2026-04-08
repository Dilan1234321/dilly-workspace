"""
rubric_scorer.py — Employer-calibrated, cohort-aware resume scoring.

This module implements a NEW scoring path that runs *alongside* the existing
dilly_core/auditor.py. It does not modify or replace the existing auditor.
Both paths are callable, and callers can A/B the output.

## Design

A "rubric" is a JSON document describing what a specific cohort's employers
look for in a strong intern candidate. Each rubric has:

  - dimension_weights: {smart, grit, build}  (sum to 1.0)
  - recruiter_bar_overall: int 0-100
  - signals per dimension, grouped by impact tier:
      high_impact (weight ~1.0)
      medium_impact (weight ~0.5)
      low_impact (weight ~0.1, or 0 if actively negative)
  - each signal has a "detector" — a small JSON DSL that describes how to
    check whether a resume has that signal

## Detectors — the tiny DSL

Every signal dict MAY include a `detector` field. If present, the scorer uses
it to decide whether the signal is "matched" for a given (ScoringSignals, raw_text).
If no detector is present, the signal is recorded as "unmeasured" and counted
at zero (so unverified rubric signals never inflate a score — MTS principle).

Detector types:

  {"type": "field", "field": "gpa", "op": ">=", "value": 3.5}
    Check a ScoringSignals dataclass field with a comparison operator.
    ops: ==, !=, >=, <=, >, <, in, not_in, truthy, falsy

  {"type": "major_in", "majors": ["Computer Science", "Data Science"]}
    Check if signals.major matches (case-insensitive, substring) any entry.

  {"type": "regex", "pattern": "CFA\\s*(Level\\s*)?(1|I)", "flags": "i"}
    Search raw_text with a regex. "flags" is an optional string of
    single-char flags: i, m, s.

  {"type": "keyword_any", "keywords": ["Kaggle", "kaggle.com"]}
    Case-insensitive substring match on raw_text. True if ANY match.

  {"type": "keyword_all", "keywords": ["python", "sql"]}
    Case-insensitive substring match. True if ALL match.

  {"type": "composite", "all_of": [...], "any_of": [...], "none_of": [...]}
    Boolean composition of other detectors.
    all_of: every sub-detector must match
    any_of: at least one sub-detector must match (OR)
    none_of: no sub-detector may match (NAND — used for negative signals)

## Scoring math

For each dimension (smart, grit, build):

  raw_score = sum(signal.weight for matched signals)
  max_score = sum(signal.weight for ALL signals with detectors)
  dimension_pct = min(100, (raw_score / max_score) * 100) if max_score > 0 else 0

Composite:
  composite = (smart_pct * dim_weights.smart) +
              (grit_pct  * dim_weights.grit ) +
              (build_pct * dim_weights.build)

This is intentionally simple. Every matched signal contributes proportionally
to its weight. Unmatched signals reduce your score by not contributing. The
normalization ensures every cohort's rubric produces comparable 0-100 scores
regardless of how many signals are defined.

## What this does NOT do

- Does NOT modify ScoringSignals, AuditorResult, or run_audit()
- Does NOT touch the database
- Does NOT make LLM calls
- Does NOT invent scores for signals it couldn't detect (MTS: only detected
  evidence affects scores — see INFERENCE_STANDARDS.md)

## Integration

Call sites invoke score_with_rubric(signals, raw_text, rubric_id). The rubric
is loaded from knowledge/cohort_rubrics.json by rubric_id. Existing callers of
run_audit() are unaffected — they keep getting AuditorResult objects with flat
fields. The new rubric path is opt-in only.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from dilly_core.scoring import ScoringSignals


# ---------------------------------------------------------------------------
# Rubric loading
# ---------------------------------------------------------------------------

_RUBRIC_CACHE: Optional[Dict[str, Dict[str, Any]]] = None


def _default_rubric_path() -> str:
    """Return the canonical path to cohort_rubrics.json."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "knowledge", "cohort_rubrics.json"))


def load_rubrics(path: Optional[str] = None, force: bool = False) -> Dict[str, Dict[str, Any]]:
    """
    Load all cohort rubrics from JSON. Cached by path.

    Returns: dict mapping cohort_id -> rubric dict.
    Raises FileNotFoundError if the rubrics file is missing.
    Raises ValueError if the JSON is malformed or missing required fields.
    """
    global _RUBRIC_CACHE
    if _RUBRIC_CACHE is not None and not force:
        return _RUBRIC_CACHE

    path = path or _default_rubric_path()
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Rubric file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if not isinstance(raw, dict):
        raise ValueError("cohort_rubrics.json must be a JSON object at the top level")

    rubrics = raw.get("rubrics", raw)  # allow either {"rubrics": {...}} or {...}
    if not isinstance(rubrics, dict):
        raise ValueError("Rubrics section must be a JSON object")

    # Validate each rubric has the minimum required shape
    for cohort_id, rubric in rubrics.items():
        _validate_rubric(cohort_id, rubric)

    _RUBRIC_CACHE = rubrics
    return rubrics


def get_rubric(cohort_id: str, path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Fetch a single rubric by cohort id. Returns None if not found."""
    try:
        rubrics = load_rubrics(path)
    except FileNotFoundError:
        return None
    return rubrics.get(cohort_id)


def list_cohort_ids(path: Optional[str] = None) -> List[str]:
    """Return the list of cohort ids with rubrics available."""
    try:
        rubrics = load_rubrics(path)
    except FileNotFoundError:
        return []
    return sorted(rubrics.keys())


def _validate_rubric(cohort_id: str, rubric: Dict[str, Any]) -> None:
    """Ensure a rubric has the minimum required fields. Raises on failure."""
    if not isinstance(rubric, dict):
        raise ValueError(f"Rubric '{cohort_id}' must be a dict")
    for required in ("dimension_weights", "signals"):
        if required not in rubric:
            raise ValueError(f"Rubric '{cohort_id}' missing required field: {required}")
    dw = rubric["dimension_weights"]
    for dim in ("smart", "grit", "build"):
        if dim not in dw:
            raise ValueError(f"Rubric '{cohort_id}' dimension_weights missing '{dim}'")
    total = sum(float(dw[d]) for d in ("smart", "grit", "build"))
    if abs(total - 1.0) > 0.05:
        raise ValueError(
            f"Rubric '{cohort_id}' dimension_weights must sum to ~1.0, got {total:.3f}"
        )
    sigs = rubric["signals"]
    for dim in ("smart", "grit", "build"):
        if dim not in sigs:
            raise ValueError(f"Rubric '{cohort_id}' signals missing '{dim}'")


# ---------------------------------------------------------------------------
# Detector evaluation
# ---------------------------------------------------------------------------

_FIELD_OPS = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    ">=": lambda a, b: a is not None and a >= b,
    "<=": lambda a, b: a is not None and a <= b,
    ">":  lambda a, b: a is not None and a > b,
    "<":  lambda a, b: a is not None and a < b,
    "in": lambda a, b: a in b,
    "not_in": lambda a, b: a not in b,
    "truthy": lambda a, _: bool(a),
    "falsy":  lambda a, _: not bool(a),
}


def _get_signal_field(signals: ScoringSignals, name: str) -> Any:
    """Read a field from ScoringSignals by name. Returns None if missing."""
    return getattr(signals, name, None)


def _eval_detector(
    detector: Dict[str, Any],
    signals: ScoringSignals,
    raw_text: str,
) -> bool:
    """
    Return True if the detector matches the resume. Unknown detector types
    return False (fail closed — never inflate a score on a typo).
    """
    if not isinstance(detector, dict):
        return False
    dtype = detector.get("type")

    if dtype == "field":
        field_name = detector.get("field")
        op = detector.get("op", "==")
        expected = detector.get("value")
        if field_name is None:
            return False
        actual = _get_signal_field(signals, field_name)
        fn = _FIELD_OPS.get(op)
        if fn is None:
            return False
        try:
            return bool(fn(actual, expected))
        except Exception:
            return False

    if dtype == "major_in":
        majors = detector.get("majors") or []
        major = (getattr(signals, "major", "") or "").lower()
        return any(m.lower() in major or major in m.lower() for m in majors if m)

    if dtype == "regex":
        pattern = detector.get("pattern")
        if not pattern:
            return False
        flags_str = detector.get("flags", "")
        flag_val = 0
        if "i" in flags_str: flag_val |= re.IGNORECASE
        if "m" in flags_str: flag_val |= re.MULTILINE
        if "s" in flags_str: flag_val |= re.DOTALL
        try:
            return re.search(pattern, raw_text or "", flag_val) is not None
        except re.error:
            return False

    if dtype == "keyword_any":
        kws = detector.get("keywords") or []
        low = (raw_text or "").lower()
        return any(k.lower() in low for k in kws if k)

    if dtype == "keyword_all":
        kws = detector.get("keywords") or []
        low = (raw_text or "").lower()
        return all(k.lower() in low for k in kws if k)

    if dtype == "composite":
        all_of = detector.get("all_of") or []
        any_of = detector.get("any_of") or []
        none_of = detector.get("none_of") or []
        if all_of and not all(_eval_detector(d, signals, raw_text) for d in all_of):
            return False
        if any_of and not any(_eval_detector(d, signals, raw_text) for d in any_of):
            return False
        if none_of and any(_eval_detector(d, signals, raw_text) for d in none_of):
            return False
        # If only one of the three is present, default-true others are fine
        return bool(all_of or any_of or none_of)

    return False


# ---------------------------------------------------------------------------
# Main scoring entry point
# ---------------------------------------------------------------------------

@dataclass
class SignalEvaluation:
    """Per-signal record of what was matched and why."""
    signal: str
    weight: float
    matched: bool
    tier: str          # "high" | "medium" | "low"
    dimension: str     # "smart" | "grit" | "build"
    has_detector: bool
    rationale: str = ""


@dataclass
class RubricScore:
    """Result of scoring one resume against one rubric."""
    cohort_id: str
    display_name: str
    smart: float         # 0..100
    grit: float          # 0..100
    build: float         # 0..100
    composite: float     # 0..100
    recruiter_bar: float # 0..100, from rubric
    above_bar: bool
    dimension_weights: Dict[str, float]
    matched_signals: List[SignalEvaluation] = field(default_factory=list)
    unmatched_signals: List[SignalEvaluation] = field(default_factory=list)
    unmeasured_signals: List[SignalEvaluation] = field(default_factory=list)
    fastest_path_moves: List[Any] = field(default_factory=list)
    common_rejection_reasons: List[Any] = field(default_factory=list)
    diagnostics: Dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        """Serialize to JSON-friendly dict."""
        return {
            "cohort_id": self.cohort_id,
            "display_name": self.display_name,
            "smart": round(self.smart, 2),
            "grit":  round(self.grit,  2),
            "build": round(self.build, 2),
            "composite": round(self.composite, 2),
            "recruiter_bar": self.recruiter_bar,
            "above_bar": self.above_bar,
            "dimension_weights": self.dimension_weights,
            "matched_signals": [s.__dict__ for s in self.matched_signals],
            "unmatched_signals": [s.__dict__ for s in self.unmatched_signals],
            "unmeasured_signals": [s.__dict__ for s in self.unmeasured_signals],
            "fastest_path_moves": self.fastest_path_moves,
            "common_rejection_reasons": self.common_rejection_reasons,
            "diagnostics": self.diagnostics,
        }


# Default weights if a signal dict doesn't specify one explicitly
_DEFAULT_TIER_WEIGHTS = {
    "high_impact":   1.0,
    "medium_impact": 0.5,
    "low_impact":    0.1,
}


def _score_dimension(
    dim_name: str,
    dim_signals: Dict[str, List[Dict[str, Any]]],
    signals: ScoringSignals,
    raw_text: str,
) -> Tuple[float, List[SignalEvaluation], List[SignalEvaluation], List[SignalEvaluation]]:
    """
    Score one dimension (smart/grit/build) using TIER-WEIGHTED scoring.

    Tier contribution to final dimension score:
      - High-impact signals:   70% of the dimension ceiling
      - Medium-impact signals: 25% of the dimension ceiling
      - Low-impact signals:    5% of the dimension ceiling

    This means matching ALL high-impact signals alone produces a 70 — which
    is "at the recruiter bar for most cohorts." Adding medium-impact pushes
    it to 95. Adding low-impact polishes to 100. The tier weighting ensures
    that students who match the most important signals feel rewarded, and
    students who miss rare/exceptional signals (like CFA) are not crushed
    by having them in the denominator.

    Previous formula (pre-2026-04-08) was raw sum-of-matched / sum-of-all,
    which meant a 4.0 GPA Finance student would score only 33% smart because
    the CFA and BMC signals in the denominator dragged her down even though
    she matched the single strongest signal (GPA+major).

    Returns (pct_0_to_100, matched_list, unmatched_list, unmeasured_list).
    """
    matched: List[SignalEvaluation] = []
    unmatched: List[SignalEvaluation] = []
    unmeasured: List[SignalEvaluation] = []

    # Tier contributions to the 0-100 dimension score
    TIER_MAX = {
        "high_impact":   70.0,
        "medium_impact": 25.0,
        "low_impact":     5.0,
    }

    dimension_score = 0.0

    for tier_key in ("high_impact", "medium_impact", "low_impact"):
        tier_signals = dim_signals.get(tier_key, []) or []
        tier_max = TIER_MAX[tier_key]
        default_weight = _DEFAULT_TIER_WEIGHTS[tier_key]
        tier_short = tier_key.replace("_impact", "")

        # Compute within-tier possible and matched weight
        tier_possible = 0.0
        tier_matched = 0.0

        for sig in tier_signals:
            if not isinstance(sig, dict):
                continue
            name = sig.get("signal", "(unnamed)")
            weight = float(sig.get("weight", default_weight))
            rationale = sig.get("rationale", "") or ""
            detector = sig.get("detector")

            evaluation = SignalEvaluation(
                signal=name,
                weight=weight,
                matched=False,
                tier=tier_short,
                dimension=dim_name,
                has_detector=bool(detector),
                rationale=rationale,
            )

            if detector is None:
                # Unmeasured — no detector provided. Do NOT count toward
                # tier_possible so undocumented signals can't affect the
                # dimension score in either direction (MTS principle).
                unmeasured.append(evaluation)
                continue

            tier_possible += weight
            is_match = _eval_detector(detector, signals, raw_text)
            if is_match:
                tier_matched += weight
                evaluation.matched = True
                matched.append(evaluation)
            else:
                unmatched.append(evaluation)

        # Add this tier's contribution to dimension score. If tier has no
        # measurable signals at all, it contributes 0 (not its max) — we
        # can't reward what we can't measure.
        if tier_possible > 0:
            tier_pct = tier_matched / tier_possible
            dimension_score += tier_max * tier_pct

    # Cap at 100 (should be impossible to exceed but belt-and-suspenders)
    return max(0.0, min(100.0, dimension_score)), matched, unmatched, unmeasured


def score_with_rubric(
    signals: ScoringSignals,
    raw_text: str,
    rubric: Dict[str, Any],
) -> RubricScore:
    """
    Score a single resume against a single cohort rubric.

    Args:
        signals: extracted ScoringSignals (from dilly_core.scoring.extract_scoring_signals)
        raw_text: the raw resume text
        rubric: a rubric dict (as returned by get_rubric)

    Returns:
        RubricScore with per-dimension scores, composite, and evidence.
    """
    if not isinstance(rubric, dict):
        raise ValueError("rubric must be a dict")

    cohort_id = rubric.get("cohort_id", "unknown")
    display_name = rubric.get("display_name", cohort_id)
    dim_weights = rubric.get("dimension_weights", {"smart": 0.33, "grit": 0.33, "build": 0.34})
    recruiter_bar = float(rubric.get("recruiter_bar_overall", 72))
    all_signals = rubric.get("signals", {})

    # Score each dimension
    smart_pct, sm_match, sm_unm, sm_um = _score_dimension("smart", all_signals.get("smart", {}), signals, raw_text)
    grit_pct,  gr_match, gr_unm, gr_um = _score_dimension("grit",  all_signals.get("grit",  {}), signals, raw_text)
    build_pct, bl_match, bl_unm, bl_um = _score_dimension("build", all_signals.get("build", {}), signals, raw_text)

    composite = (
        smart_pct * float(dim_weights.get("smart", 0.33)) +
        grit_pct  * float(dim_weights.get("grit",  0.33)) +
        build_pct * float(dim_weights.get("build", 0.34))
    )
    composite = max(0.0, min(100.0, composite))

    return RubricScore(
        cohort_id=cohort_id,
        display_name=display_name,
        smart=smart_pct,
        grit=grit_pct,
        build=build_pct,
        composite=composite,
        recruiter_bar=recruiter_bar,
        above_bar=composite >= recruiter_bar,
        dimension_weights=dim_weights,
        matched_signals=sm_match + gr_match + bl_match,
        unmatched_signals=sm_unm + gr_unm + bl_unm,
        unmeasured_signals=sm_um + gr_um + bl_um,
        fastest_path_moves=rubric.get("fastest_path_moves", []) or [],
        common_rejection_reasons=rubric.get("common_rejection_reasons", []) or [],
        diagnostics={
            "smart_measured_signals": len(sm_match) + len(sm_unm),
            "grit_measured_signals":  len(gr_match) + len(gr_unm),
            "build_measured_signals": len(bl_match) + len(bl_unm),
            "unmeasured_count": len(sm_um) + len(gr_um) + len(bl_um),
        },
    )


def score_for_cohorts(
    signals: ScoringSignals,
    raw_text: str,
    cohort_ids: List[str],
    path: Optional[str] = None,
) -> Dict[str, RubricScore]:
    """
    Score a resume against multiple cohort rubrics. Returns dict of results.
    Missing cohorts are silently skipped (logged to stderr via _log_missing).
    """
    results: Dict[str, RubricScore] = {}
    rubrics = load_rubrics(path)
    for cid in cohort_ids:
        rubric = rubrics.get(cid)
        if rubric is None:
            _log_missing(cid)
            continue
        try:
            results[cid] = score_with_rubric(signals, raw_text, rubric)
        except Exception as exc:
            import sys, traceback
            sys.stderr.write(f"[rubric_scorer] Failed to score cohort {cid}: {exc}\n")
            traceback.print_exc(file=sys.stderr)
    return results


def _log_missing(cohort_id: str) -> None:
    import sys
    sys.stderr.write(f"[rubric_scorer] No rubric defined for cohort_id={cohort_id}\n")


# ---------------------------------------------------------------------------
# Convenience: end-to-end from raw resume text
# ---------------------------------------------------------------------------

def audit_with_rubric(
    resume_text: str,
    cohort_id: str,
    *,
    candidate_name: str = "Unknown",
    major: str = "Unknown",
    gpa: Optional[float] = None,
) -> Optional[RubricScore]:
    """
    Run the existing signal extraction pipeline, then score against a rubric.

    This is the one-stop entry point for "give me a rubric-scored audit."
    It does NOT call the existing run_audit() — it calls extract_scoring_signals
    directly so you get the raw signals without the legacy scoring applied on top.
    """
    from dilly_core.scoring import extract_scoring_signals

    rubric = get_rubric(cohort_id)
    if rubric is None:
        return None
    signals = extract_scoring_signals(resume_text, gpa=gpa, major=major)
    return score_with_rubric(signals, resume_text, rubric)


# ---------------------------------------------------------------------------
# Cohort selection — pick which rubrics to score a student against
# ---------------------------------------------------------------------------

def select_cohorts_for_student(
    major: Optional[str],
    minors: Optional[List[str]] = None,
    pre_professional_track: Optional[str] = None,
    industry_target: Optional[str] = None,
    extra_cohorts: Optional[List[str]] = None,
    path: Optional[str] = None,
) -> List[str]:
    """
    Given a student's academic identity, return the list of cohort_ids they
    should be scored against.

    Rules:
      1. Pre-professional track wins (pre_health, pre_law) — these are the
         primary cohort regardless of major because they represent the
         student's actual intent.
      2. Otherwise, derive cohort from major using a mapping table.
      3. Minors add additional cohorts (max 2) but never replace primary.
      4. Extra cohorts (student-selected) are appended, up to 5 active total.
      5. Deduplicated while preserving order (primary first).

    This is pure: no DB, no API, just string matching.
    """
    try:
        rubrics = load_rubrics(path)
    except Exception:
        rubrics = {}

    selected: List[str] = []

    def _add(cid: Optional[str]) -> None:
        if cid and cid in rubrics and cid not in selected:
            selected.append(cid)

    # 1. Pre-professional track takes priority
    pre_prof_key = (pre_professional_track or "").strip().lower()
    if any(x in pre_prof_key for x in ("pre-med", "pre-dental", "pre-pa", "pre-pharm", "pre-vet", "pre-pt", "pre-health", "pre-physician")):
        _add("pre_health")
    if "pre-law" in pre_prof_key:
        _add("pre_law")

    # 2. Primary cohort from major
    primary = _cohort_for_major(major or "", industry_target=industry_target)
    _add(primary)

    # 3. Minor cohorts (up to 2)
    minor_added = 0
    for minor in (minors or [])[:2]:
        minor_cid = _cohort_for_major(minor, industry_target=None)
        if minor_cid and minor_cid != primary and minor_cid not in selected:
            _add(minor_cid)
            minor_added += 1

    # 4. Extra cohorts (student-selected)
    for cid in (extra_cohorts or []):
        if len(selected) >= 5:
            break
        _add(cid)

    # 5. Fallback — if nothing matched, try humanities_communications as a generalist
    if not selected:
        _add("humanities_communications")

    return selected[:5]  # hard cap


def _cohort_for_major(major: str, industry_target: Optional[str] = None) -> Optional[str]:
    """
    Map a major string to a cohort_id. Two-phase lookup:

      1. EXACT TAXONOMY LOOKUP — dilly_core.major_taxonomy maps ~270 common
         US undergrad majors to cohort IDs. Case-insensitive, normalized.
         This is the primary path and covers most students.

      2. FUZZY KEYWORD FALLBACK — for non-standard major names that aren't
         in the taxonomy (e.g. "Applied Data and Intelligence" or some
         UTampa-specific variant), fall back to substring matching on
         recognizable keywords.

    Returns None only if BOTH phases fail. Callers should treat None as
    "route to humanities_communications as a last-resort generalist fallback"
    so a student never sees zero scores across all cohorts just because
    their major name is unusual.
    """
    if not major:
        return None

    # ── Phase 1: explicit taxonomy lookup ─────────────────────────────
    try:
        from dilly_core.major_taxonomy import lookup_major
        result = lookup_major(major)
        if result is not None:
            _canonical_major, cohort_id = result
            return cohort_id
    except ImportError:
        pass  # taxonomy not available — fall through to fuzzy matching

    # ── Phase 2: fuzzy keyword fallback ───────────────────────────────
    m = major.strip().lower()

    # Tech / data / CS family
    if any(k in m for k in ("data science", "data analytics", "data analysis", "informatics", "bioinformatics")):
        return "tech_data_science"
    if any(k in m for k in ("cybersecurity", "cyber security", "information security", "network security", "digital forensics", "infosec")):
        return "tech_cybersecurity"
    if any(k in m for k in ("computer science", "software engineering", "computer engineering", "electrical engineering", "information technology", "information systems", "mathematics with computer", "mathematics & computer", "management information systems", "business information technology", "web development", "game development", "game design")):
        return "tech_software_engineering"

    # Pure math / stats / actuarial — quantitative cohort
    if any(k in m for k in ("actuarial", "mathematics", "math ", "statistics", "applied mathematics", "operations research", "probability")):
        # Disambiguate: if pure math, quantitative; if math+cs, tech
        if "computer" in m:
            return "tech_software_engineering"
        return "quantitative_math_stats"

    # Business family
    if any(k in m for k in ("finance", "financial enterprise", "banking", "investment", "wealth", "real estate", "insurance", "risk management")):
        return "business_finance"
    if any(k in m for k in ("accounting", "accountancy", "audit", "taxation")):
        return "business_accounting"
    if any(k in m for k in ("marketing", "advertising", "public relations", "brand", "fashion merchandising", "retail")):
        return "business_marketing"
    if any(k in m for k in ("consulting", "strategy", "strategic management", "organizational")):
        return "business_consulting"
    if any(k in m for k in ("economics", "econometrics")):
        return "business_finance"  # economics usually finance-adjacent for undergrads
    if any(k in m for k in ("international business", "business administration", "general business", "management ", "entrepreneurship", "supply chain", "logistics", "operations management", "human resource", "hospitality", "hotel", "tourism", "event management")):
        return "business_consulting"

    # Pre-health signals (when the major itself says "pre-")
    if any(k in m for k in ("pre-med", "pre-medic", "premedic", "pre-dent", "pre-pharm", "pre-vet", "pre-physician", "pre-physical therapy", "pre-occupational", "pre-optometry", "pre-pa", "pre-ot", "pre-pt")):
        return "pre_health"
    if any(k in m for k in ("biomedical", "biochemistry", "biomedical science", "medical science", "pharmaceutical")):
        return "pre_health"

    # Pre-law
    if any(k in m for k in ("pre-law", "prelaw", "legal studies", "paralegal", "law and society", "law, justice", "jurisprudence")):
        return "pre_law"
    if "philosophy" in m:
        return "pre_law"  # philosophy majors most commonly target law

    # Nursing & allied health
    if any(k in m for k in ("nursing", "bsn", "allied health", "health science", "public health", "exercise science", "kinesiology", "human performance", "athletic training", "dietetics", "nutrition", "physical therapy", "occupational therapy", "speech pathology", "audiology", "respiratory therapy", "radiologic", "medical laboratory", "dental hygiene", "sports medicine", "health administration", "healthcare")):
        return "health_nursing_allied"

    # Science research (bio, chem, physics, engineering, earth/env, agriculture)
    if any(k in m for k in ("biology", "chemistry", "physics", "astronomy", "astrophysics", "geology", "geoscience", "earth science", "environmental", "sustainability", "marine science", "marine biology", "oceanography", "meteorology", "atmospheric", "forensic science", "neuroscience", "cognitive science", "microbiology", "molecular biology", "cell biology", "genetics", "ecology", "botany", "zoology", "food science", "agriculture", "agronomy", "horticulture", "animal science", "plant science", "wildlife", "forestry", "fisheries", "natural resources", "conservation")):
        return "science_research"
    if any(k in m for k in ("mechanical engineering", "civil engineering", "chemical engineering", "aerospace", "aeronautical", "industrial engineering", "materials", "nuclear engineering", "petroleum", "structural engineering", "architectural engineering", "agricultural engineering", "biomedical engineering", "systems engineering", "manufacturing engineering", "mining engineering")):
        return "science_research"

    # Social sciences
    if any(k in m for k in ("psychology", "sociology", "anthropology", "archaeology", "political science", "government", "international relations", "international studies", "international affairs", "global studies", "public policy", "public administration", "public affairs", "urban studies", "urban planning", "criminology", "criminal justice", "criminal investigation", "law enforcement", "social work", "human services", "human development", "family studies", "child development", "geography", "women's studies", "gender studies", "ethnic studies", "african american studies", "black studies", "latin american", "asian studies", "american studies", "native american studies", "middle eastern studies", "peace studies", "conflict resolution", "leadership studies")):
        return "social_sciences"
    if "history" in m:
        return "humanities_communications"  # history is humanities, not social sci (CIP convention)

    # Humanities / communications
    if any(k in m for k in ("english", "literature", "comparative literature", "writing", "rhetoric", "linguistics", "classics", "classical studies", "theology", "religious studies", "biblical studies", "divinity", "ministry", "liberal arts", "liberal studies", "general studies", "interdisciplinary", "humanities")):
        return "humanities_communications"
    if any(k in m for k in ("spanish", "french", "german", "italian", "portuguese", "russian", "chinese", "mandarin", "japanese", "korean", "arabic", "hebrew", "latin", "greek", "modern languages", "foreign languages", "romance languages", "east asian languages")):
        return "humanities_communications"
    if any(k in m for k in ("communication", "journalism", "broadcasting", "broadcast", "mass communication", "media studies", "film studies", "television studies", "cinema studies", "media production", "rhetoric")):
        return "humanities_communications"
    if "education" in m and not any(k in m for k in ("music education", "art education")):
        return "humanities_communications"

    # Arts & design
    if any(k in m for k in ("graphic design", "visual communication design", "industrial design", "interior design", "fashion design", "apparel design", "product design", "ux design", "ui design", "user experience design", "interaction design", "photography", "animation", "digital animation", "digital media", "new media", "interactive media", "digital arts", "studio art", "fine arts", "visual arts", "drawing", "painting", "sculpture", "printmaking", "ceramics", "music performance", "music composition", "music theory", "musicology", "jazz studies", "music production", "audio engineering", "sound design", "vocal performance", "instrumental", "theater", "theatre", "drama", "acting", "musical theatre", "dance", "ballet", "choreography", "museum studies", "arts administration", "arts management", "architecture", "landscape architecture", "film production", "film and television", "cinematography")):
        return "arts_design"
    if any(k in m for k in ("music", "art ", "art education", "music education", "design", "digital media", "new media")):
        return "arts_design"
    if m.strip() == "art":
        return "arts_design"

    # Sport management & recreation
    if any(k in m for k in ("sport management", "sports management", "sports administration", "sports marketing", "sport business", "recreation", "leisure studies", "parks and recreation", "outdoor recreation")):
        return "sport_management"

    # Aviation / military / emergency
    if any(k in m for k in ("aviation", "aeronautics", "pilot")):
        return "science_research"
    if any(k in m for k in ("military science", "rotc", "national security", "homeland security", "emergency management", "fire science")):
        return "social_sciences"

    # Culinary / hospitality (fallbacks)
    if any(k in m for k in ("culinary", "baking and pastry")):
        return "arts_design"

    # Unknown — caller falls back to humanities_communications via select_cohorts
    return None


# ---------------------------------------------------------------------------
# Legacy shape translator — maps rubric output back to AuditResponseV2
# ---------------------------------------------------------------------------

def rubric_to_legacy_shape(
    primary_score: RubricScore,
    *,
    candidate_name: str,
    major: str,
    resume_text: Optional[str] = None,
    evidence: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Convert a RubricScore (for the student's PRIMARY cohort) into a dict
    shaped like AuditResponseV2. This is the backward-compatibility layer
    that lets downstream consumers (audit_history, leaderboard, coach context)
    keep reading the old flat-field shape without changes.

    The rich rubric output (matched/unmatched signals, fastest path moves,
    per-cohort scores) is preserved in a new `rubric_analysis` field for
    the mobile client to render.

    This function does NOT modify the legacy auditor. It produces a dict
    that LOOKS like AuditResponseV2 but was generated from rubric scoring.
    """
    scores = {
        "smart": round(primary_score.smart, 1),
        "grit":  round(primary_score.grit,  1),
        "build": round(primary_score.build, 1),
    }

    # Generate evidence text from matched signals (pick the top matched
    # signal per dimension to surface as evidence copy)
    ev: Dict[str, str] = evidence or {}
    for dim in ("smart", "grit", "build"):
        if dim in ev:
            continue
        top = next(
            (s for s in primary_score.matched_signals if s.dimension == dim),
            None,
        )
        if top:
            ev[dim] = f"Matched: {top.signal}"
        else:
            ev[dim] = f"No strong {dim} signal detected for {primary_score.display_name}."

    # Generate audit_findings — one short line per dimension summarizing
    # what was (or wasn't) matched
    audit_findings = []
    for dim_name in ("smart", "grit", "build"):
        matched = [s for s in primary_score.matched_signals if s.dimension == dim_name]
        unmatched = [s for s in primary_score.unmatched_signals if s.dimension == dim_name]
        dim_score = getattr(primary_score, dim_name)
        if matched:
            audit_findings.append(
                f"{dim_name.capitalize()}: {dim_score:.0f} — matched {len(matched)} of "
                f"{len(matched) + len(unmatched)} signals for {primary_score.display_name}."
            )
        else:
            audit_findings.append(
                f"{dim_name.capitalize()}: {dim_score:.0f} — no signals matched. "
                f"See path forward."
            )

    # Build recommendations from fastest_path_moves (rubric-native actions)
    recommendations = []
    for move in (primary_score.fastest_path_moves or [])[:5]:
        if isinstance(move, dict):
            title = move.get("move") or move.get("title") or "Next move"
            description = move.get("move") or move.get("description") or ""
            recommendations.append({
                "type": "action",
                "title": title if title != description else "Next move",
                "action": description,
            })
        elif isinstance(move, str):
            recommendations.append({
                "type": "action",
                "title": "Next move",
                "action": move,
            })

    # One-line "dilly take" — pick the biggest lever from unmatched signals.
    # Prefer HIGH-impact unmatched over medium/low because high-impact signals
    # are the ones that move scores fastest. Also skip signals that look like
    # fallback-tier GPA bands (e.g. "3.0-3.49 GPA") because those are lower
    # bands the student is either above or doesn't have at all.
    def _is_fallback_gpa_band(signal_text: str) -> bool:
        s = (signal_text or "").lower()
        return ("to 3." in s and "gpa" in s) or ("3.0 to" in s) or ("3.5 to" in s)

    high_impact_unmatched = [
        s for s in primary_score.unmatched_signals
        if s.tier == "high" and not _is_fallback_gpa_band(s.signal)
    ]
    medium_unmatched = [
        s for s in primary_score.unmatched_signals
        if s.tier == "medium" and not _is_fallback_gpa_band(s.signal)
    ]
    top_unmatched = (
        next(iter(high_impact_unmatched), None)
        or next(iter(medium_unmatched), None)
        or next(iter(primary_score.unmatched_signals), None)
    )

    if primary_score.above_bar:
        dilly_take = (
            f"You're above the recruiter bar for {primary_score.display_name}. "
            f"Keep compounding."
        )
    elif top_unmatched:
        # Truncate very long signal labels so the dilly_take stays readable
        lever = top_unmatched.signal
        if len(lever) > 80:
            lever = lever[:77] + "..."
        dilly_take = (
            f"Biggest lever for {primary_score.display_name}: {lever}."
        )
    else:
        dilly_take = (
            f"Your starting line for {primary_score.display_name}. "
            f"Run your first audit moves this week."
        )

    result = {
        "candidate_name": candidate_name or "Unknown",
        "detected_track": primary_score.cohort_id,  # use cohort_id as the "track" field
        "major": major or "Unknown",
        "scores": scores,
        "final_score": round(primary_score.composite, 1),
        "audit_findings": audit_findings,
        "evidence": ev,
        "recommendations": recommendations,
        "raw_logs": [
            f"Rubric scorer: {primary_score.cohort_id}",
            f"Matched {len(primary_score.matched_signals)} signals, "
            f"{len(primary_score.unmatched_signals)} unmatched, "
            f"{len(primary_score.unmeasured_signals)} unmeasured.",
        ],
        "dilly_take": dilly_take,
        "resume_text": resume_text,
    }
    return result


# ── Rubric ID → existing rich cohort name (for jobs / internships matching) ──
# The rubric scorer uses snake_case cohort IDs, but the existing internships
# infrastructure (cohort_requirements JSONB, students.cohort field, match_scores
# pipeline) uses the rich display names from academic_taxonomy.COHORTS.
# This map bridges the two so jobs can be filtered/scored per the new rubric
# cohort without rewriting the legacy pipeline.
RUBRIC_TO_RICH_COHORT: Dict[str, str] = {
    "tech_software_engineering": "Software Engineering & CS",
    "tech_data_science":         "Data Science & Analytics",
    "tech_cybersecurity":        "Cybersecurity & IT",
    "business_finance":          "Finance & Accounting",
    "business_consulting":       "Consulting & Strategy",
    "business_marketing":        "Marketing & Advertising",
    "business_accounting":       "Finance & Accounting",
    "pre_health":                "Healthcare & Clinical",
    "pre_law":                   "Law & Government",
    "science_research":          "Life Sciences & Research",
    "health_nursing_allied":     "Healthcare & Clinical",
    "social_sciences":           "Social Sciences & Nonprofit",
    "humanities_communications": "Media & Communications",
    "arts_design":               "Design & Creative Arts",
    "quantitative_math_stats":   "Physical Sciences & Math",
    "sport_management":          "Management & Operations",
}


def rich_cohort_for_rubric_id(cohort_id: str) -> Optional[str]:
    """Return the rich display name used by the legacy internships pipeline."""
    return RUBRIC_TO_RICH_COHORT.get(cohort_id)


def build_rubric_analysis_payload(
    primary_cohort_id: str,
    scores_by_cohort: Dict[str, RubricScore],
) -> Dict[str, Any]:
    """
    Build the `rubric_analysis` payload that gets attached to audit responses.
    This is the rich data the mobile client uses to render matched signals,
    unmatched signals, and fastest path moves.
    """
    primary = scores_by_cohort.get(primary_cohort_id)
    if primary is None:
        # Fallback to the highest-scoring cohort
        sorted_scores = sorted(
            scores_by_cohort.items(),
            key=lambda kv: kv[1].composite,
            reverse=True,
        )
        if not sorted_scores:
            return {}
        primary_cohort_id, primary = sorted_scores[0]

    def _eval_to_dict(e: SignalEvaluation) -> Dict[str, Any]:
        return {
            "signal": e.signal,
            "dimension": e.dimension,
            "tier": e.tier,
            "weight": e.weight,
            "rationale": e.rationale,
        }

    # Build per-cohort summary (for "other cohorts" display)
    other_cohorts = []
    for cid, rs in sorted(scores_by_cohort.items(), key=lambda kv: kv[1].composite, reverse=True):
        if cid == primary_cohort_id:
            continue
        other_cohorts.append({
            "cohort_id": cid,
            "display_name": rs.display_name,
            "composite": round(rs.composite, 1),
            "smart": round(rs.smart, 1),
            "grit": round(rs.grit, 1),
            "build": round(rs.build, 1),
            "recruiter_bar": rs.recruiter_bar,
            "above_bar": rs.above_bar,
        })

    return {
        "primary_cohort_id": primary_cohort_id,
        "primary_cohort_display_name": primary.display_name,
        "primary_composite": round(primary.composite, 1),
        "primary_smart": round(primary.smart, 1),
        "primary_grit": round(primary.grit, 1),
        "primary_build": round(primary.build, 1),
        "recruiter_bar": primary.recruiter_bar,
        "above_bar": primary.above_bar,
        "matched_signals": [_eval_to_dict(s) for s in primary.matched_signals],
        "unmatched_signals": [_eval_to_dict(s) for s in primary.unmatched_signals],
        "fastest_path_moves": primary.fastest_path_moves or [],
        "common_rejection_reasons": primary.common_rejection_reasons or [],
        "other_cohorts": other_cohorts,
    }
