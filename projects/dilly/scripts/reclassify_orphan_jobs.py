"""
reclassify_orphan_jobs.py — pick up every internship row whose
cohort_requirements is null/empty, run analyze_job() on it, and write
both the legacy cohort_requirements list AND a canonical_cohorts
jsonb column.

Safe to run multiple times. Idempotent per row. Skips rows that
already have non-empty cohort_requirements unless --force is passed.

Usage:
    python3 scripts/reclassify_orphan_jobs.py             # orphans only
    python3 scripts/reclassify_orphan_jobs.py --all       # every row
    python3 scripts/reclassify_orphan_jobs.py --limit 500 # cap

Writes to:
    internships.cohort_requirements  (list of {cohort, smart, grit, build})
    internships.canonical_cohorts    (list of canonical cohort IDs —
                                      column added on first run if missing)

This module is read by:
    - api/routers/internships_v2.py (via cohort_requirements)
    - downstream narrative + filtering (via canonical_cohorts)
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dilly_core.job_analyzer import analyze_job  # noqa: E402


def _db_config() -> dict:
    pw_path = os.path.expanduser("~/.dilly_db_pass")
    pw = open(pw_path).read().strip() if os.path.exists(pw_path) else os.environ.get("DILLY_DB_PASSWORD", "")
    return {
        "host": os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        "database": os.environ.get("DILLY_DB_NAME", "dilly"),
        "user": os.environ.get("DILLY_DB_USER", "dilly_admin"),
        "password": pw,
        "sslmode": "require",
    }


def _ensure_canonical_column(cur) -> None:
    """Add canonical_cohorts jsonb if it doesn't exist. Idempotent."""
    cur.execute(
        """
        ALTER TABLE internships
        ADD COLUMN IF NOT EXISTS canonical_cohorts jsonb NOT NULL DEFAULT '[]'::jsonb
        """
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="Reclassify every row, not just orphans")
    ap.add_argument("--limit", type=int, default=0, help="Cap the number of rows processed (0 = no cap)")
    ap.add_argument("--dry-run", action="store_true", help="Don't write anything, just print what we'd do")
    args = ap.parse_args()

    conn = psycopg2.connect(**_db_config())
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    _ensure_canonical_column(cur)
    conn.commit()

    where = (
        "WHERE cohort_requirements IS NULL "
        "   OR cohort_requirements = '[]'::jsonb "
        "   OR canonical_cohorts IS NULL "
        "   OR canonical_cohorts = '[]'::jsonb"
    )
    if args.all:
        where = ""
    limit_clause = f" LIMIT {args.limit}" if args.limit > 0 else ""

    cur.execute(f"SELECT COUNT(*) AS n FROM internships {where}")
    total = cur.fetchone()["n"]
    print(f"[reclassify] {total} rows match{' (--all)' if args.all else ' (orphans)'}")
    if args.limit > 0:
        print(f"[reclassify] processing up to {args.limit}")

    cur.execute(
        f"""
        SELECT id, title, description, location_city, location_state
        FROM internships
        {where}
        ORDER BY created_at DESC
        {limit_clause}
        """
    )
    rows = cur.fetchall()
    print(f"[reclassify] fetched {len(rows)} rows, analyzing...")

    started = time.time()
    updates = 0
    orphans_rescued = 0

    for i, row in enumerate(rows):
        title = row.get("title") or ""
        desc = row.get("description") or ""
        loc = ", ".join(filter(None, [row.get("location_city"), row.get("location_state")]))

        try:
            analysis = analyze_job(title=title, company="", description=desc, location=loc)
        except Exception as e:
            print(f"[reclassify] skip row {row['id']} — analyze_job errored: {e}")
            continue

        cohort_reqs = analysis.get("cohort_requirements") or []
        canonical = analysis.get("canonical_cohorts") or []

        if args.dry_run:
            if i < 10:
                print(f"  [{row['id']}] {title[:60]!r}")
                print(f"      legacy  = {[c['cohort'] for c in cohort_reqs]}")
                print(f"      canon   = {canonical}")
            updates += 1
            continue

        cur.execute(
            """
            UPDATE internships
            SET cohort_requirements = %s::jsonb,
                canonical_cohorts   = %s::jsonb,
                classified_at       = NOW()
            WHERE id = %s
            """,
            (json.dumps(cohort_reqs), json.dumps(canonical), row["id"]),
        )
        updates += 1
        if cohort_reqs:
            orphans_rescued += 1

        if updates % 200 == 0:
            conn.commit()
            print(f"  {updates} / {len(rows)} committed ({int(time.time() - started)}s)")

    if not args.dry_run:
        conn.commit()

    print(f"\n[reclassify] done. {updates} rows updated, {orphans_rescued} had cohorts assigned.")

    # Sanity — quick per-canonical count
    cur.execute(
        """
        SELECT c AS canonical, COUNT(*)
        FROM internships,
             LATERAL jsonb_array_elements_text(canonical_cohorts) AS c
        GROUP BY c
        ORDER BY 2 DESC
        """
    )
    print("\n[reclassify] canonical cohort counts after this run:")
    for r in cur.fetchall():
        print(f"  {r['canonical']}: {r['count']}")

    conn.close()


if __name__ == "__main__":
    main()
