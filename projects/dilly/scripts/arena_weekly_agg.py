"""
Weekly aggregation for AI Arena field intelligence.

Runs every Monday at 06:00 UTC (registered in main.py's APScheduler).
Reads classified internships, computes per-cohort AI stats, writes
to memory/arena_weekly.json for fast serving by /ai-arena/field-intel.

Also runs the nightly classifier first so the aggregation always has
fresh data.

Zero LLM. Typical runtime: <15s.

Usage (manual trigger):
    python scripts/arena_weekly_agg.py [--force]
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
import tempfile
import time

# ── Path setup ─────────────────────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# scripts/ → dilly/ → projects/ → dilly-workspace/
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

import psycopg2
import psycopg2.extras
from projects.dilly.api.database import get_db
from projects.dilly.dilly_core.role_clusters import CLUSTER_LABELS

_MEMORY_DIR = os.path.join(_WORKSPACE_ROOT, "memory")
_OUTPUT_PATH = os.path.join(_MEMORY_DIR, "arena_weekly.json")
_LOCK_PATH = _OUTPUT_PATH + ".lock"

# How old the file can be before we re-generate even without --force (7 days)
_MAX_STALE_SECONDS = 7 * 86400


# ── Headline copy templates ────────────────────────────────────────────────
# Filled at render time from computed stats.

def _headline(cohort_short: str, ai_pct: float, rank: int, total_cohorts: int, total: int) -> str:
    """Generate a terse, data-backed pulse headline."""
    pct_int = round(ai_pct)
    if ai_pct >= 60:
        intensity = "over half"
    elif ai_pct >= 40:
        intensity = "nearly half"
    elif ai_pct >= 25:
        intensity = "a quarter"
    else:
        intensity = "a growing slice"

    rank_str = (
        f"#1 most AI-exposed field" if rank == 1
        else f"#{rank} most AI-exposed of {total_cohorts} tracked fields"
    )
    return (
        f"{pct_int}% of {cohort_short} listings require AI or ML skills right now — "
        f"{intensity} of the {total:,} postings we're tracking. "
        f"Your field ranks {rank_str}."
    )


# ── Cohort name → short display label ─────────────────────────────────────
_COHORT_SHORT: dict[str, str] = {
    "Software Engineering & CS":          "SWE",
    "Data Science & Analytics":           "Data Science",
    "Finance & Accounting":               "Finance",
    "Consulting & Strategy":              "Consulting",
    "Management & Operations":            "Ops & Strategy",
    "Marketing & Advertising":            "Marketing",
    "Entrepreneurship & Innovation":      "Entrepreneurship",
    "Healthcare & Clinical":              "Healthcare",
    "Cybersecurity & IT":                 "Cybersecurity",
    "Design & Creative Arts":             "Design",
    "Education & Human Development":      "Education",
    "Law & Government":                   "Law & Policy",
    "Human Resources & People":           "HR & People",
    "Life Sciences & Research":           "Life Sciences",
    "Physical Sciences & Math":           "Physical Sciences",
    "Media & Communications":             "Media & Comms",
    "Electrical & Computer Engineering":  "Electrical Eng",
    "Mechanical & Aerospace Engineering": "Mechanical Eng",
    "Economics & Public Policy":          "Economics",
    "Social Sciences & Nonprofit":        "Social Sciences",
    "Biotech & Pharmaceutical":           "Biotech",
    "Civil & Environmental Engineering":  "Civil Eng",
    "Accounting & Audit":                 "Accounting",
    "Design & Creative":                  "Design",
    "Chemical & Biomedical Engineering":  "Chemical Eng",
}


def _short(cohort: str) -> str:
    return _COHORT_SHORT.get(cohort, cohort.split(" &")[0].split(" and")[0])


# ── Main aggregation ───────────────────────────────────────────────────────

def run(force: bool = False) -> dict:
    os.makedirs(_MEMORY_DIR, exist_ok=True)

    # Skip if fresh enough and not forced.
    if not force and os.path.isfile(_OUTPUT_PATH):
        age = time.time() - os.path.getmtime(_OUTPUT_PATH)
        if age < _MAX_STALE_SECONDS:
            print(
                f"[arena_weekly_agg] Skipping — output is {age/3600:.1f}h old "
                f"(max {_MAX_STALE_SECONDS/3600:.0f}h). Use --force to override.",
                flush=True,
            )
            with open(_OUTPUT_PATH, "r", encoding="utf-8") as f:
                return json.load(f)

    # Step 1: Run classifier to catch any un-classified listings first.
    try:
        from projects.dilly.scripts.classify_arena_attrs import run as classify_run  # noqa: PLC0415
        classify_run(batch_size=500)
    except Exception as e:
        print(f"[arena_weekly_agg] WARNING: classifier failed — {e}. Aggregating with existing data.", flush=True)

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ── Step 2: Per-cohort AI fluency stats ───────────────────────────
        cur.execute("""
            SELECT
                cr->>'cohort'                                               AS cohort,
                COUNT(*)                                                    AS total,
                COUNT(*) FILTER (WHERE i.ai_fluency IN ('high','medium'))  AS ai_count,
                ROUND(
                    100.0
                    * COUNT(*) FILTER (WHERE i.ai_fluency IN ('high','medium'))
                    / NULLIF(COUNT(*), 0),
                1)                                                          AS ai_pct,
                COUNT(*) FILTER (WHERE i.ai_fluency = 'high')              AS high_count,
                COUNT(*) FILTER (WHERE i.ai_fluency = 'medium')            AS medium_count
            FROM internships i,
                 jsonb_array_elements(i.cohort_requirements) cr
            WHERE i.status = 'active'
              AND i.cohort_requirements IS NOT NULL
              AND i.cohort_requirements != 'null'::jsonb
              AND i.cohort_requirements != '[]'::jsonb
            GROUP BY cohort
            HAVING COUNT(*) >= 30        -- filter noise
            ORDER BY ai_pct DESC NULLS LAST
        """)
        cohort_rows = cur.fetchall()

        if not cohort_rows:
            print("[arena_weekly_agg] No data — internships table empty or unclassified.", flush=True)
            return {}

        # Build cross-cohort ranking list
        cross_cohort = [
            {
                "cohort": r["cohort"],
                "ai_pct": float(r["ai_pct"] or 0),
                "total_listings": int(r["total"] or 0),
            }
            for r in cohort_rows
        ]
        total_cohorts = len(cross_cohort)
        avg_ai_pct = sum(c["ai_pct"] for c in cross_cohort) / max(total_cohorts, 1)

        # ── Step 3: Role Radar per cohort ─────────────────────────────────
        cur.execute("""
            SELECT
                cr->>'cohort'                                               AS cohort,
                i.role_cluster,
                COUNT(*)                                                    AS vol,
                ROUND(
                    100.0
                    * COUNT(*) FILTER (WHERE i.ai_fluency IN ('high','medium'))
                    / NULLIF(COUNT(*), 0),
                1)                                                          AS ai_pct
            FROM internships i,
                 jsonb_array_elements(i.cohort_requirements) cr
            WHERE i.status = 'active'
              AND i.cohort_requirements IS NOT NULL
              AND i.cohort_requirements != 'null'::jsonb
              AND i.cohort_requirements != '[]'::jsonb
              AND i.role_cluster IS NOT NULL
            GROUP BY cohort, i.role_cluster
            HAVING COUNT(*) >= 10
            ORDER BY cohort, vol DESC
        """)
        radar_rows = cur.fetchall()

    # Group radar rows by cohort
    radar_by_cohort: dict[str, list[dict]] = {}
    for r in radar_rows:
        c = r["cohort"]
        if c not in radar_by_cohort:
            radar_by_cohort[c] = []
        radar_by_cohort[c].append({
            "role_cluster": r["role_cluster"],
            "label": CLUSTER_LABELS.get(r["role_cluster"], r["role_cluster"]),
            "vol": int(r["vol"] or 0),
            "ai_pct": float(r["ai_pct"] or 0),
        })

    # ── Step 4: Build output payload ──────────────────────────────────────
    week_start = _current_week_start()
    cohorts_out: dict[str, dict] = {}

    for rank_idx, r in enumerate(cohort_rows):
        cohort = r["cohort"]
        ai_pct = float(r["ai_pct"] or 0)
        total = int(r["total"] or 0)
        rank = rank_idx + 1  # 1-indexed
        short = _short(cohort)

        cohorts_out[cohort] = {
            "total_listings": total,
            "ai_listings": int(r["ai_count"] or 0),
            "ai_fluency_pct": ai_pct,
            "high_count": int(r["high_count"] or 0),
            "medium_count": int(r["medium_count"] or 0),
            "cross_cohort_rank": rank,
            "cross_cohort_total": total_cohorts,
            "cohort_avg_pct": round(avg_ai_pct, 1),
            "above_average": ai_pct > avg_ai_pct,
            "headline": _headline(short, ai_pct, rank, total_cohorts, total),
            "role_radar": radar_by_cohort.get(cohort, []),
        }

    output = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "week_start": week_start,
        "cohorts": cohorts_out,
        "cross_cohort": cross_cohort,
    }

    # ── Step 5: Atomic write ───────────────────────────────────────────────
    os.makedirs(_MEMORY_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=_MEMORY_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2)
        os.replace(tmp, _OUTPUT_PATH)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

    cohort_count = len(cohorts_out)
    print(
        f"[arena_weekly_agg] Done — {cohort_count} cohorts, week_start={week_start}, "
        f"avg_ai_pct={avg_ai_pct:.1f}%",
        flush=True,
    )
    return output


def _current_week_start() -> str:
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    return monday.isoformat()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute weekly AI Arena field intelligence")
    parser.add_argument("--force", action="store_true", help="Re-generate even if output is fresh")
    args = parser.parse_args()

    t0 = time.time()
    result = run(force=args.force)
    elapsed = round(time.time() - t0, 1)
    cohort_count = len((result or {}).get("cohorts", {}))
    print(f"[arena_weekly_agg] Finished in {elapsed}s — {cohort_count} cohorts written to {_OUTPUT_PATH}", flush=True)
