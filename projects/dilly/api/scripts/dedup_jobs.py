"""
dedup_jobs.py — Exact-match deduplication engine for internship listings.

Finds active jobs where (title, company_id) appears more than once.
Keeps the newest (by posted_date or created_at) and deactivates the rest.

Run as a cron job (daily) or manually:
    python3 scripts/dedup_jobs.py

Also enforces the quality gate: deactivates jobs without descriptions.
"""
import os
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.normpath(os.path.join(_SCRIPT_DIR, ".."))
_WORKSPACE = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
if _WORKSPACE not in sys.path:
    sys.path.insert(0, _WORKSPACE)

import psycopg2
import psycopg2.extras


def _get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try:
            pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except Exception:
            pass
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly", user="dilly_admin", password=pw, sslmode="require",
    )


def dedup_exact(conn, dry_run=False):
    """Find exact (title, company_id) duplicates and deactivate older copies."""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Find all duplicate groups
    cur.execute("""
        SELECT title, company_id, COUNT(*) as cnt
        FROM internships
        WHERE status = 'active'
        GROUP BY title, company_id
        HAVING COUNT(*) > 1
    """)
    groups = cur.fetchall()

    if not groups:
        print("No duplicates found.")
        return 0

    total_deactivated = 0
    for g in groups:
        # For each group, keep the one with the latest posted_date (or id as tiebreaker)
        cur.execute("""
            SELECT id, posted_date, created_at
            FROM internships
            WHERE status = 'active' AND title = %s AND company_id = %s
            ORDER BY COALESCE(posted_date, created_at) DESC, id ASC
        """, (g["title"], g["company_id"]))
        rows = cur.fetchall()
        if len(rows) < 2:
            continue

        # Keep first (newest), deactivate rest
        keep = rows[0]["id"]
        deactivate = [r["id"] for r in rows[1:]]

        if not dry_run:
            cur.execute(
                "UPDATE internships SET status = 'duplicate' WHERE id = ANY(%s)",
                (deactivate,)
            )

        total_deactivated += len(deactivate)

    if not dry_run:
        conn.commit()

    print(f"Dedup complete: {len(groups)} duplicate groups, {total_deactivated} listings deactivated.")
    return total_deactivated


def enforce_quality_gate(conn, dry_run=False):
    """Deactivate jobs without meaningful descriptions."""
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) FROM internships
        WHERE status = 'active' AND (description IS NULL OR length(description) < 100)
    """)
    count = cur.fetchone()[0]

    if count == 0:
        print("All active jobs have descriptions.")
        return 0

    if not dry_run:
        cur.execute("""
            UPDATE internships SET status = 'no_description'
            WHERE status = 'active' AND (description IS NULL OR length(description) < 100)
        """)
        conn.commit()

    print(f"Quality gate: {count} jobs deactivated (missing/short description).")
    return count


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")
    args = parser.parse_args()

    conn = _get_db()
    try:
        print("=== Dilly Job Dedup Engine ===")
        print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}\n")

        dedup_exact(conn, dry_run=args.dry_run)
        enforce_quality_gate(conn, dry_run=args.dry_run)

        # Summary
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM internships WHERE status = 'active'")
        active = cur.fetchone()[0]
        print(f"\nActive jobs remaining: {active}")
    finally:
        conn.close()
