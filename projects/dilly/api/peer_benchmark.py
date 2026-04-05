"""
Peer benchmarking: compute percentile of this candidate's scores vs same-track cohort.
Cohort = only dilly_audit_log.jsonl (real Dilly profiles who have been audited).
We do NOT use training_data.json — peer comparison is exclusively vs other Dilly users.
When same-track cohort has < 3, fall back to all-track cohort so percentiles still show.
"""

import json
import os
from typing import Dict, Tuple

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
_LOG_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_audit_log.jsonl")
_MIN_COHORT = 3


def _load_cohort_by_track() -> Dict[str, list]:
    """Load all (track -> list of { smart, grit, build }) from dilly_audit_log only (real Dilly profiles)."""
    by_track: Dict[str, list] = {}
    # Audit log only — real Dilly users who have been audited (no PII)
    if os.path.isfile(_LOG_PATH):
        try:
            with open(_LOG_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    entry = json.loads(line)
                    track = (entry.get("track") or "Humanities").strip()
                    s = entry.get("smart")
                    g = entry.get("grit")
                    b = entry.get("build")
                    if s is None and g is None and b is None:
                        continue
                    by_track.setdefault(track, []).append({
                        "smart": float(s) if s is not None else 0,
                        "grit": float(g) if g is not None else 0,
                        "build": float(b) if b is not None else 0,
                    })
        except Exception:
            pass
    return by_track


def percentile_of(value: float, sorted_values: list) -> int:
    """Return approximate percentile (0-100): % of values <= value."""
    if not sorted_values:
        return 50
    n = len(sorted_values)
    count = sum(1 for v in sorted_values if v <= value)
    return min(100, max(0, int(round(100 * count / n))))


def get_peer_percentiles(track: str, scores: Dict[str, float]) -> Tuple[Dict[str, int] | None, int, bool]:
    """
    Compare this candidate's scores to the same-track cohort (Dilly profiles only, from audit log).
    If same-track has < MIN_COHORT, use all-track cohort so percentiles still show.
    Returns (percentiles_dict, cohort_n, use_fallback).
    - percentiles_dict: { smart, grit, build } 0-100, or None if no cohort has >= MIN_COHORT.
    - cohort_n: number of peers in the cohort used.
    - use_fallback: True when we used all-track because same-track was too small.
    """
    by_track = _load_cohort_by_track()
    track_cohort = by_track.get(track) or []
    all_cohort: list = []
    for lst in by_track.values():
        all_cohort.extend(lst)
    cohort = track_cohort if len(track_cohort) >= _MIN_COHORT else (all_cohort if len(all_cohort) >= _MIN_COHORT else [])
    use_fallback = len(cohort) >= _MIN_COHORT and len(track_cohort) < _MIN_COHORT
    if len(cohort) < _MIN_COHORT:
        return (None, len(cohort), False)
    smart_vals = sorted([c["smart"] for c in cohort])
    grit_vals = sorted([c["grit"] for c in cohort])
    build_vals = sorted([c["build"] for c in cohort])
    percentiles = {
        "smart": percentile_of(scores.get("smart", 0), smart_vals),
        "grit": percentile_of(scores.get("grit", 0), grit_vals),
        "build": percentile_of(scores.get("build", 0), build_vals),
    }
    return (percentiles, len(cohort), use_fallback)


def _quartile(sorted_vals: list, p: float) -> float:
    """Return value at percentile p (0-1) in sorted_vals."""
    if not sorted_vals:
        return 0.0
    n = len(sorted_vals)
    idx = max(0, min(n - 1, int(round(p * (n - 1)))))
    return float(sorted_vals[idx])


def get_cohort_stats(track: str) -> dict | None:
    """
    Return anonymized cohort stats for "Vs Your Peers" full comparison.
    Same cohort as get_peer_percentiles (Dilly profiles only, from audit log).
    Returns: cohort_n, use_fallback, avg/mid/p25/p75 for smart, grit, build; how_to_get_ahead (short copy).
    """
    by_track = _load_cohort_by_track()
    track_cohort = by_track.get(track) or []
    all_cohort: list = []
    for lst in by_track.values():
        all_cohort.extend(lst)
    cohort = track_cohort if len(track_cohort) >= _MIN_COHORT else (all_cohort if len(all_cohort) >= _MIN_COHORT else [])
    use_fallback = len(cohort) >= _MIN_COHORT and len(track_cohort) < _MIN_COHORT
    if len(cohort) < _MIN_COHORT:
        return None
    smart_vals = sorted([c["smart"] for c in cohort])
    grit_vals = sorted([c["grit"] for c in cohort])
    build_vals = sorted([c["build"] for c in cohort])
    n = len(cohort)
    avg_smart = sum(smart_vals) / n
    avg_grit = sum(grit_vals) / n
    avg_build = sum(build_vals) / n
    return {
        "track": track,
        "cohort_n": n,
        "use_fallback": use_fallback,
        "avg": {"smart": round(avg_smart, 1), "grit": round(avg_grit, 1), "build": round(avg_build, 1)},
        "p25": {"smart": round(_quartile(smart_vals, 0.25), 1), "grit": round(_quartile(grit_vals, 0.25), 1), "build": round(_quartile(build_vals, 0.25), 1)},
        "p75": {"smart": round(_quartile(smart_vals, 0.75), 1), "grit": round(_quartile(grit_vals, 0.75), 1), "build": round(_quartile(build_vals, 0.75), 1)},
        "how_to_get_ahead": f"Peers in {track} average Smart {round(avg_smart)}, Grit {round(avg_grit)}, Build {round(avg_build)}. Top quartile is 75+. Focus on your lowest dimension and the playbook for your track.",
    }


def _load_cohort_finals_by_track() -> Dict[str, list]:
    """track -> list of final scores from dilly_audit_log (same cohort source as SGB percentiles)."""
    by_track: Dict[str, list] = {}
    if os.path.isfile(_LOG_PATH):
        try:
            with open(_LOG_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    entry = json.loads(line)
                    tr = (entry.get("track") or "Humanities").strip()
                    fn = entry.get("final")
                    if fn is None:
                        continue
                    try:
                        fv = float(fn)
                    except (TypeError, ValueError):
                        continue
                    by_track.setdefault(tr, []).append(fv)
        except Exception:
            pass
    return by_track


def get_peer_percentile_final(track: str, final_score: float) -> Tuple[int | None, int, bool]:
    """
    Percentile (0–100) of final_score vs Dilly audit-log cohort, same track selection as get_peer_percentiles.
    Returns (percentile or None if cohort too small, cohort_n, use_fallback).
    """
    by_track = _load_cohort_finals_by_track()
    track_cohort = by_track.get(track) or []
    all_cohort: list = []
    for lst in by_track.values():
        all_cohort.extend(lst)
    cohort = track_cohort if len(track_cohort) >= _MIN_COHORT else (all_cohort if len(all_cohort) >= _MIN_COHORT else [])
    use_fallback = len(cohort) >= _MIN_COHORT and len(track_cohort) < _MIN_COHORT
    if len(cohort) < _MIN_COHORT:
        return (None, len(cohort), False)
    sorted_vals = sorted(cohort)
    pct = percentile_of(float(final_score), sorted_vals)
    return (pct, len(cohort), use_fallback)
