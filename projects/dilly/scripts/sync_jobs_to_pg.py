#!/usr/bin/env python3
"""
Sync scraped jobs from local SQLite to PostgreSQL internships table.
Also runs the job analyzer to assign cohorts + S/G/B requirements.
"""

import json
import os
import sqlite3
import sys
import uuid
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2


def get_pg_conn():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try:
            pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except Exception:
            pass
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly",
        user="dilly_admin",
        password=pw,
        sslmode="require",
    )


def sync():
    db_path = Path(__file__).resolve().parent.parent / "dilly_jobs.db"
    if not db_path.exists():
        print(f"No SQLite DB at {db_path}. Run the scraper first.")
        return

    conn_sqlite = sqlite3.connect(db_path)
    conn_sqlite.row_factory = sqlite3.Row
    cur_sqlite = conn_sqlite.cursor()

    # Load the job analyzer
    from dilly_core.job_analyzer import analyze_job

    # Get all jobs from SQLite
    cur_sqlite.execute("SELECT * FROM jobs ORDER BY scraped_at DESC")
    rows = cur_sqlite.fetchall()
    print(f"Found {len(rows)} jobs in SQLite")

    conn_pg = get_pg_conn()
    cur_pg = conn_pg.cursor()

    inserted = 0
    skipped = 0
    errors = 0

    for row in rows:
        title = row["title"] or ""
        company = row["company"] or ""
        description = row["description"] or ""
        location = row["location"] or ""
        url = row["url"] or ""
        job_type = row["job_type"] or "full_time"
        posted_date = row["posted_date"] or None
        source = row["source"] or ""

        if not title or not company:
            skipped += 1
            continue

        # Run job analyzer to get cohort assignments + S/G/B requirements
        analysis = analyze_job(title, company, description, location, url)
        cohort_reqs = analysis.get("cohort_requirements", [])
        primary_cohort = analysis.get("primary_cohort", "General")

        # Use the first cohort's S/G/B as the flat required scores
        req_smart = cohort_reqs[0]["smart"] if cohort_reqs else 55
        req_grit = cohort_reqs[0]["grit"] if cohort_reqs else 55
        req_build = cohort_reqs[0]["build"] if cohort_reqs else 55

        # Parse location into city/state
        parts = location.split(",")
        city = parts[0].strip() if parts else ""
        state = parts[1].strip() if len(parts) > 1 else ""

        # Work mode detection
        loc_lower = location.lower()
        work_mode = "remote" if "remote" in loc_lower else "hybrid" if "hybrid" in loc_lower else "onsite"

        try:
            cur_pg.execute("""
                INSERT INTO internships (
                    id, title, description, location_city, location_state,
                    work_mode, is_paid, apply_url, deadline, job_type,
                    posted_date, required_smart, required_grit, required_build,
                    quality_score, cohort_requirements, status, company_id
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s,
                    %s, TRUE, %s, NULL, %s,
                    %s, %s, %s, %s,
                    50, %s, 'active',
                    (SELECT id FROM companies WHERE LOWER(name) = LOWER(%s) LIMIT 1)
                )
                ON CONFLICT DO NOTHING
            """, (
                title, description[:5000], city, state,
                work_mode, url, job_type,
                posted_date, req_smart, req_grit, req_build,
                json.dumps(cohort_reqs), company,
            ))
            if cur_pg.rowcount > 0:
                inserted += 1
        except Exception as e:
            # Company might not exist in companies table — create it
            try:
                cur_pg.execute("""
                    INSERT INTO companies (id, name, website, industry)
                    VALUES (gen_random_uuid(), %s, '', '')
                    ON CONFLICT DO NOTHING
                """, (company,))
                # Retry the job insert
                cur_pg.execute("""
                    INSERT INTO internships (
                        id, title, description, location_city, location_state,
                        work_mode, is_paid, apply_url, deadline, job_type,
                        posted_date, required_smart, required_grit, required_build,
                        quality_score, cohort_requirements, status, company_id
                    ) VALUES (
                        gen_random_uuid(), %s, %s, %s, %s,
                        %s, TRUE, %s, NULL, %s,
                        %s, %s, %s, %s,
                        50, %s, 'active',
                        (SELECT id FROM companies WHERE LOWER(name) = LOWER(%s) LIMIT 1)
                    )
                    ON CONFLICT DO NOTHING
                """, (
                    title, description[:5000], city, state,
                    work_mode, url, job_type,
                    posted_date, req_smart, req_grit, req_build,
                    json.dumps(cohort_reqs), company,
                ))
                if cur_pg.rowcount > 0:
                    inserted += 1
            except Exception as e2:
                errors += 1
                if errors <= 5:
                    print(f"  Error inserting {title} at {company}: {e2}")

    conn_pg.commit()
    conn_pg.close()
    conn_sqlite.close()

    print(f"\nDone. {inserted} inserted, {skipped} skipped, {errors} errors (of {len(rows)} total)")


if __name__ == "__main__":
    sync()
