"""
jobs_cleanup_cron.py — Background job that validates internship listings
and removes dead/closed postings from the active listings pool.

Run via cron every 6 hours:
    0 */6 * * * cd /path/to/api && python jobs_cleanup_cron.py

Or via APScheduler if you want it in-process (see bottom of file).

Behavior:
  - Fetches all active listings from the DB
  - HEAD-requests each Greenhouse URL (fast, no body download)
  - If 404, 410, or redirects to a "closed" page → mark as dead
  - Dead listings are hard-deleted from the active listings table
  - BUT: any listing a user has interacted with (saved, applied,
    interviewing, offer, rejected) is preserved in their application
    tracker — we never touch user interaction data
  - Logs all removals for audit trail
"""

import asyncio
import sqlite3
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_PATH = Path(__file__).parent / "dilly.db"  # adjust to your actual DB path
LOG_PATH = Path(__file__).parent / "logs" / "jobs_cleanup.log"

# Greenhouse "closed" indicators — if the final URL or page body contains these
CLOSED_INDICATORS = [
    "/jobs?error=404",
    "This job is no longer available",
    "This position has been closed",
    "Page not found",
    "no longer accepting applications",
    "job_not_found",
]

# How many concurrent requests to fire (be polite to Greenhouse)
MAX_CONCURRENCY = 10

# Request timeout per URL (seconds)
REQUEST_TIMEOUT = 15

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("jobs_cleanup")

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def get_active_listings(conn: sqlite3.Connection) -> list[dict]:
    """Return all listings currently in the active pool."""
    rows = conn.execute(
        "SELECT id, company, title, url FROM listings WHERE active = 1"
    ).fetchall()
    return [dict(r) for r in rows]


def hard_delete_listing(conn: sqlite3.Connection, listing_id: str):
    """
    Remove listing from the active pool.
    We do NOT touch the `user_applications` table — if a user saved/applied
    to this listing, their record stays intact with a snapshot of the job info.
    """
    conn.execute("DELETE FROM listings WHERE id = ?", (listing_id,))


def log_removal(conn: sqlite3.Connection, listing_id: str, company: str,
                title: str, reason: str):
    """Audit trail so you can review what was removed and why."""
    conn.execute(
        """
        INSERT INTO listing_removal_log (listing_id, company, title, reason, removed_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (listing_id, company, title, reason, datetime.now(timezone.utc).isoformat()),
    )


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------


async def check_listing_url(
    client: httpx.AsyncClient,
    listing: dict,
    semaphore: asyncio.Semaphore,
) -> dict | None:
    """
    Check if a listing URL is still live.
    Returns the listing dict with a `reason` key if dead, else None.
    """
    url = listing.get("url", "")
    if not url:
        return {**listing, "reason": "missing_url"}

    async with semaphore:
        try:
            # Use GET (not HEAD) because Greenhouse sometimes returns 200
            # on HEAD but the page body says "job closed"
            resp = await client.get(url, follow_redirects=True, timeout=REQUEST_TIMEOUT)

            # Hard 404 / 410
            if resp.status_code in (404, 410):
                return {**listing, "reason": f"http_{resp.status_code}"}

            # Redirected to an error/closed page
            final_url = str(resp.url)
            for indicator in CLOSED_INDICATORS:
                if indicator.lower() in final_url.lower():
                    return {**listing, "reason": f"redirect_closed: {final_url}"}

            # Check page body for closed indicators (only if small enough)
            if resp.status_code == 200 and len(resp.content) < 500_000:
                body = resp.text.lower()
                for indicator in CLOSED_INDICATORS:
                    if indicator.lower() in body:
                        return {**listing, "reason": f"body_closed: {indicator}"}

            # Still alive
            return None

        except httpx.TimeoutException:
            # Don't delete on timeout — could be transient
            log.warning(f"Timeout checking {listing['company']} - {listing['title']}: {url}")
            return None

        except httpx.HTTPError as e:
            log.warning(f"HTTP error checking {listing['company']} - {listing['title']}: {e}")
            return None


# ---------------------------------------------------------------------------
# Main cleanup flow
# ---------------------------------------------------------------------------


async def run_cleanup():
    start = time.monotonic()
    conn = get_db()

    listings = get_active_listings(conn)
    log.info(f"Checking {len(listings)} active listings...")

    if not listings:
        log.info("No active listings to check.")
        conn.close()
        return

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    dead_listings: list[dict] = []

    async with httpx.AsyncClient(
        headers={
            "User-Agent": "DillyBot/1.0 (internship-tracker; contact@dillyapp.com)"
        },
    ) as client:
        tasks = [check_listing_url(client, listing, semaphore) for listing in listings]
        results = await asyncio.gather(*tasks)
        dead_listings = [r for r in results if r is not None]

    # Process removals
    removed_count = 0
    for dead in dead_listings:
        try:
            hard_delete_listing(conn, dead["id"])
            log_removal(conn, dead["id"], dead["company"], dead["title"], dead["reason"])
            removed_count += 1
            log.info(f"REMOVED: {dead['company']} — {dead['title']} ({dead['reason']})")
        except Exception as e:
            log.error(f"Failed to remove {dead['id']}: {e}")

    conn.commit()
    conn.close()

    elapsed = time.monotonic() - start
    log.info(
        f"Cleanup complete: {removed_count}/{len(listings)} listings removed "
        f"in {elapsed:.1f}s"
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    asyncio.run(run_cleanup())