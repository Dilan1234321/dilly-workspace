"""
Cron endpoint: validate internship listing URLs and remove dead/closed postings.

Adds to the existing cron router. Dead listings are hard-deleted from dilly_jobs.db
but user application tracker files (applications.json) are NEVER touched — they
already store company/role/url inline, so no data is lost.

Setup:
  1. Drop this file at: projects/dilly/api/routers/cron_jobs_cleanup.py
  2. In main.py, mount it:  app.include_router(cron_jobs_cleanup.router)
  3. Schedule: GET /cron/cleanup-dead-listings?token=YOUR_CRON_SECRET every 6h

Or run manually:  curl "http://localhost:8000/cron/cleanup-dead-listings?token=YOUR_SECRET"
"""

import json
import os
import asyncio
import logging
import sqlite3
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/cron", tags=["cron"])

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_LISTINGS_DB = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "dilly_jobs.db"))

# Greenhouse / Lever "closed" indicators in final URL or page body
CLOSED_INDICATORS = [
    "/jobs?error=404",
    "this job is no longer available",
    "this position has been closed",
    "page not found",
    "no longer accepting applications",
    "job_not_found",
    "job not found",
    "this posting has been closed",
    "the position you were looking for",
]

MAX_CONCURRENCY = 10
REQUEST_TIMEOUT = 15

log = logging.getLogger("jobs_cleanup")

# ---------------------------------------------------------------------------
# Auth (same pattern as existing cron.py)
# ---------------------------------------------------------------------------


def _require_cron_secret(token: str) -> None:
    secret = os.environ.get("CRON_SECRET", "").strip()
    if not secret or (token or "").strip() != secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------


async def _check_url(
    client: httpx.AsyncClient,
    job: dict,
    semaphore: asyncio.Semaphore,
) -> dict | None:
    """
    Returns the job dict with a 'reason' key if dead, else None (still alive).
    """
    url = (job.get("url") or "").strip()
    if not url:
        return {**job, "reason": "missing_url"}

    async with semaphore:
        try:
            resp = await client.get(url, follow_redirects=True, timeout=REQUEST_TIMEOUT)

            # Hard 404 / 410
            if resp.status_code in (404, 410):
                return {**job, "reason": f"http_{resp.status_code}"}

            # Redirected to a closed/error page
            final_url = str(resp.url).lower()
            for indicator in CLOSED_INDICATORS:
                if indicator in final_url:
                    return {**job, "reason": f"redirect_closed: {indicator}"}

            # Check page body for closed indicators
            if resp.status_code == 200 and len(resp.content) < 500_000:
                body = resp.text.lower()
                for indicator in CLOSED_INDICATORS:
                    if indicator in body:
                        return {**job, "reason": f"body_closed: {indicator}"}

            # Still alive
            return None

        except httpx.TimeoutException:
            # Don't delete on timeout — could be transient
            log.warning(f"Timeout: {job.get('company')} - {job.get('title')}")
            return None
        except httpx.HTTPError as e:
            log.warning(f"HTTP error: {job.get('company')} - {job.get('title')}: {e}")
            return None


# ---------------------------------------------------------------------------
# Core cleanup logic
# ---------------------------------------------------------------------------


async def _run_cleanup() -> dict:
    """Validate all listing URLs, delete dead ones, return summary."""

    if not os.path.isfile(_LISTINGS_DB):
        return {"error": "dilly_jobs.db not found", "path": _LISTINGS_DB}

    conn = sqlite3.connect(_LISTINGS_DB)
    conn.row_factory = sqlite3.Row

    # Ensure removal log table exists
    conn.execute("""
        CREATE TABLE IF NOT EXISTS removal_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id      TEXT,
            external_id TEXT,
            company     TEXT,
            title       TEXT,
            url         TEXT,
            reason      TEXT,
            removed_at  TEXT
        )
    """)
    conn.commit()

    # Load all listings
    rows = conn.execute("SELECT id, external_id, company, title, url FROM jobs").fetchall()
    jobs = [dict(r) for r in rows]

    if not jobs:
        conn.close()
        return {"checked": 0, "removed": 0, "remaining": 0}

    # Check URLs concurrently
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    dead: list[dict] = []

    async with httpx.AsyncClient(
        headers={"User-Agent": "DillyBot/1.0 (internship-tracker)"},
    ) as client:
        tasks = [_check_url(client, job, semaphore) for job in jobs]
        results = await asyncio.gather(*tasks)
        dead = [r for r in results if r is not None]

    # Delete dead listings and log removals
    now = datetime.now(timezone.utc).isoformat()
    removed = 0

    for d in dead:
        try:
            conn.execute("DELETE FROM jobs WHERE id = ?", (d["id"],))
            conn.execute(
                """INSERT INTO removal_log
                   (job_id, external_id, company, title, url, reason, removed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (d["id"], d.get("external_id"), d["company"], d["title"],
                 d.get("url"), d["reason"], now),
            )
            removed += 1
            log.info(f"REMOVED: {d['company']} — {d['title']} ({d['reason']})")
        except Exception as e:
            log.error(f"Failed to remove {d['id']}: {e}")

    conn.commit()

    # Get remaining count
    remaining = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    conn.close()

    return {
        "checked": len(jobs),
        "removed": removed,
        "remaining": remaining,
        "dead_listings": [
            {"company": d["company"], "title": d["title"], "reason": d["reason"]}
            for d in dead
        ],
    }


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get("/cleanup-dead-listings", summary="Remove dead/closed internship listings")
async def cleanup_dead_listings(token: str = ""):
    """
    Validate all listing URLs in dilly_jobs.db. Remove any that return 404,
    410, or contain 'position closed' language. Logs all removals.

    User application tracker data is never touched.

    Call from cron every 6 hours:
        GET /cron/cleanup-dead-listings?token=CRON_SECRET
    """
    _require_cron_secret(token)

    start = time.monotonic()
    result = await _run_cleanup()
    result["elapsed_seconds"] = round(time.monotonic() - start, 1)

    return {"ok": True, **result}