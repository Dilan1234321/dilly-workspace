"""
classify_job_attributes.py

Batch runner that finds active internships with NULL degree_required
and fills in ALL attribute verdicts (degree, h1b_sponsor, fair_chance)
using a single Haiku call per job. Safe to run repeatedly — it only
touches rows where degree_required IS NULL (the sentinel for "not
classified yet").

Invocation:
  python -m projects.dilly.api.scripts.classify_job_attributes [--max N]

Or via the cron router (/cron/classify-jobs?token=...) which wraps this
with a hard-cap per run.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_HERE, "..", "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)


def run(max_rows: int = 200) -> dict:
    """Classify up to `max_rows` un-classified active internships.

    Uses the combined classifier — one Haiku call returns all three
    attribute verdicts (degree, h1b_sponsor, fair_chance). Cheaper than
    three separate calls and keeps them synced so a row never has a
    degree verdict without the other two.

    Returns a stats dict for the cron report. `max_rows` is a hard cap
    so a single cron run has predictable duration and cost.
    """
    from projects.dilly.api.database import get_db
    from projects.dilly.api.job_classifiers import classify_all_attributes_batch

    start = time.time()
    classified = 0
    # Track the distribution so cron logs show drift (e.g. if Haiku starts
    # returning 'unclear' for everything, we'll see it here).
    counts = {
        "degree": {"required": 0, "not_required": 0, "unclear": 0},
        "h1b_sponsor": {"sponsors": 0, "no_sponsor": 0, "unclear": 0},
        "fair_chance": {"fair_chance": 0, "standard": 0, "unclear": 0},
    }

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, description
            FROM internships
            WHERE degree_required IS NULL
              AND status = 'active'
              AND description IS NOT NULL
              AND length(description) >= 40
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (max_rows * 2,),
        )
        rows = [{"id": r[0], "description": r[1]} for r in cur.fetchall()]

        if not rows:
            return {"ok": True, "classified": 0, "elapsed_sec": 0, "counts": counts}

        update_cur = conn.cursor()
        for jid, verdicts in classify_all_attributes_batch(rows, max_rows=max_rows):
            update_cur.execute(
                """
                UPDATE internships
                SET degree_required = %s,
                    h1b_sponsor     = %s,
                    fair_chance     = %s,
                    classified_at   = NOW()
                WHERE id = %s
                """,
                (
                    verdicts["degree"],
                    verdicts["h1b_sponsor"],
                    verdicts["fair_chance"],
                    jid,
                ),
            )
            classified += 1
            counts["degree"][verdicts["degree"]] = counts["degree"].get(verdicts["degree"], 0) + 1
            counts["h1b_sponsor"][verdicts["h1b_sponsor"]] = counts["h1b_sponsor"].get(verdicts["h1b_sponsor"], 0) + 1
            counts["fair_chance"][verdicts["fair_chance"]] = counts["fair_chance"].get(verdicts["fair_chance"], 0) + 1

        conn.commit()

    elapsed = round(time.time() - start, 2)
    return {"ok": True, "classified": classified, "elapsed_sec": elapsed, "counts": counts}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=200, help="Max rows to classify in this run.")
    args = ap.parse_args()
    stats = run(max_rows=args.max)
    print(stats)


if __name__ == "__main__":
    main()
