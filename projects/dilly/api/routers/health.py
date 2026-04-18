"""
Health check for dashboards and load balancers.
"""
import os

import psycopg2
from fastapi import APIRouter

router = APIRouter(tags=["health"])


def _db_connect():
    """Cheap-ish connect reused for stats.

    Falls back to None on any config or network error — caller treats
    that as 'unknown' and just omits the stat instead of 500ing."""
    try:
        return psycopg2.connect(
            host=os.environ.get("DILLY_DB_HOST", ""),
            database=os.environ.get("DILLY_DB_NAME", "dilly"),
            user=os.environ.get("DILLY_DB_USER", "dilly_admin"),
            password=os.environ.get("DILLY_DB_PASSWORD", ""),
            sslmode="require",
            connect_timeout=3,
        )
    except Exception:
        return None


@router.get("/health", summary="Health check")
def health():
    """Confirm backend is reachable. Used by dashboard 'Test Connection' and health probes."""
    return {"status": "ok", "backend": "Dilly API"}


@router.get("/stats/jobs", summary="Public job-count stats")
def stats_jobs():
    """
    Returns total active jobs + per-ATS breakdown. Public — no auth
    required. Used by the mobile app's market tile so it can honestly
    say "Dilly is tracking N roles" instead of guessing.
    """
    out = {"total": None, "by_ats": {}, "by_type": {}}
    conn = _db_connect()
    if conn is None:
        return out
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM internships WHERE status = 'active'")
        row = cur.fetchone()
        out["total"] = int(row[0]) if row and row[0] is not None else 0

        cur.execute(
            "SELECT COALESCE(source_ats, 'unknown'), COUNT(*) "
            "FROM internships WHERE status = 'active' GROUP BY source_ats"
        )
        out["by_ats"] = {str(r[0]): int(r[1]) for r in cur.fetchall() if r}

        cur.execute(
            "SELECT COALESCE(job_type, 'unknown'), COUNT(*) "
            "FROM internships WHERE status = 'active' GROUP BY job_type"
        )
        out["by_type"] = {str(r[0]): int(r[1]) for r in cur.fetchall() if r}
    except Exception:
        # Keep the shape stable even on failure — callers should
        # tolerate None/empty and not blow up.
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return out
