"""
Dilly Core - Ground Truth V6.5 scoring and Vantage Alpha track logic.
Zero-hallucination: only claims proven by extracted data affect scores.
"""

from dilly_core.scoring import (
    MAJOR_MULTIPLIERS,
    compute_smart_score,
    compute_grit_score,
    compute_build_score,
    apply_international_multiplier,
    extract_scoring_signals,
)
from dilly_core.tracks import (
    audit_pre_health,
    audit_pre_law,
    run_track_audit,
)

__all__ = [
    "MAJOR_MULTIPLIERS",
    "compute_smart_score",
    "compute_grit_score",
    "compute_build_score",
    "apply_international_multiplier",
    "extract_scoring_signals",
    "audit_pre_health",
    "audit_pre_law",
    "run_track_audit",
]
