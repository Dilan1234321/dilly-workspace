"""
Jobs listings endpoint — serves crawled internships directly from dilly_jobs.db.
Bypasses the premium company_criteria filter for crawled public listings.
GET /jobs/listings — search, filter, paginate
"""

import json
import os
import sqlite3

from fastapi import APIRouter, Request, Query
from typing import Optional

from projects.dilly.api import deps

router = APIRouter(tags=["jobs"])

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_DB_PATH = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "dilly_jobs.db"))


@router.get("/internships/listings")
async def get_job_listings(
    request: Request,
    q: Optional[str] = Query(None, description="Search query (title, company, tags)"),
    company: Optional[str] = Query(None, description="Filter by company name"),
    source: Optional[str] = Query(None, description="Filter by source (Greenhouse, Lever)"),
    remote: Optional[bool] = Query(None, description="Filter remote-only"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Return crawled internship listings from the SQLite database.
    Supports search, company filter, source filter, remote filter, and pagination.
    """
    deps.require_auth(request)

    if not os.path.isfile(_DB_PATH):
        return {"listings": [], "total": 0, "has_more": False}

    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row

    where_clauses = []
    params = []

    if q:
        where_clauses.append("(title LIKE ? OR company LIKE ? OR tags LIKE ? OR description LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like, like])

    if company:
        where_clauses.append("company LIKE ?")
        params.append(f"%{company}%")

    if source:
        where_clauses.append("source = ?")
        params.append(source)

    if remote is True:
        where_clauses.append("remote = 1")

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    # Count total
    count_sql = f"SELECT COUNT(*) FROM jobs{where_sql}"
    total = conn.execute(count_sql, params).fetchone()[0]

    # Fetch page
    query_sql = f"""
        SELECT id, external_id, title, company, location, description, url,
               posted_date, source, job_type, scraped_at, tags, team, remote, required_scores
        FROM jobs
        {where_sql}
        ORDER BY scraped_at DESC
        LIMIT ? OFFSET ?
    """
    rows = conn.execute(query_sql, params + [limit, offset]).fetchall()
    conn.close()

    listings = []
    for row in rows:
        r = dict(row)
        # Parse tags JSON
        try:
            r["tags"] = json.loads(r.get("tags") or "[]")
        except (json.JSONDecodeError, TypeError):
            r["tags"] = []
        # Parse required_scores JSON
        try:
            r["required_scores"] = json.loads(r.get("required_scores") or "{}")
        except (json.JSONDecodeError, TypeError):
            r["required_scores"] = {}
        r["remote"] = bool(r.get("remote"))
        listings.append(r)

    return {
        "listings": listings,
        "total": total,
        "has_more": (offset + limit) < total,
    }


@router.get("/internships/companies")
async def get_job_companies(request: Request):
    """Return distinct companies in the database for filter UI."""
    deps.require_auth(request)

    if not os.path.isfile(_DB_PATH):
        return {"companies": []}

    conn = sqlite3.connect(_DB_PATH)
    rows = conn.execute(
        "SELECT company, COUNT(*) as count FROM jobs GROUP BY company ORDER BY count DESC"
    ).fetchall()
    conn.close()

    return {"companies": [{"name": r[0], "count": r[1]} for r in rows]}