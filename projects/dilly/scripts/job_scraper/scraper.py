#!/usr/bin/env python3
"""
Dilly Job Scraper — Ethical and legal sources only.

Sources:
1. Greenhouse Job Board API — public, no auth. GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
2. USAJobs API — free, requires USAJOBS_API_KEY. developer.usajobs.gov

Respects robots.txt, rate limits, ToS. No LinkedIn, Indeed, Glassdoor.
"""

import argparse
import html
import json
import os
import re
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    raise

from .config import (
    GREENHOUSE_BOARD_TOKENS,
    LEVER_COMPANY_SLUGS,
    ASHBY_ORG_SLUGS,
    REQUEST_DELAY_SEC,
    USER_AGENT,
    USAJOBS_INTERNSHIP_KEYWORDS,
)

GREENHOUSE_BASE = "https://boards-api.greenhouse.io/v1/boards"
USAJOBS_SEARCH = "https://data.usajobs.gov/api/Search"


def _strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:8000]  # Cap for storage


def _infer_job_type(title: str, description: str) -> str:
    """Infer internship vs full_time from title/description."""
    tl = title.lower()
    dl = description.lower()[:2000]
    # Check title first (more reliable) — use word boundaries to avoid "internal" matching "intern"
    if re.search(r'\bintern\b|\binternship\b|\bco-op\b|\bcoop\b', tl):
        return "internship"
    if re.search(r'\bentry.level\b|\bjunior\b|\bassociate\b|\bnew.grad\b|\bgraduate\b', tl):
        return "entry_level"
    # Fallback to description keywords
    if re.search(r'\bintern\b|\binternship\b', dl):
        return "internship"
    if re.search(r'\bentry.level\b|\bjunior\b|\bnew.grad\b', dl):
        return "entry_level"
    return "full_time"


def fetch_greenhouse_jobs(board_token: str) -> list[dict]:
    """Fetch jobs from Greenhouse Job Board API. Public, no auth."""
    url = f"{GREENHOUSE_BASE}/{board_token}/jobs"
    params = {"content": "true"}
    try:
        resp = requests.get(
            url,
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  Greenhouse {board_token}: {e}")
        return []

    jobs = []
    for j in data.get("jobs", []):
        loc = j.get("location") or {}
        loc_name = loc.get("name", "") if isinstance(loc, dict) else str(loc)
        content = _strip_html(j.get("content") or "")
        title = (j.get("title") or "").strip()
        job_type = _infer_job_type(title, content)

        # Extract company from board token (e.g. stripe -> Stripe)
        company = board_token.replace("-", " ").title()

        jobs.append({
            "id": str(uuid.uuid4()),
            "external_id": f"gh:{board_token}:{j.get('id')}",
            "title": title,
            "company": company,
            "location": loc_name,
            "description": content[:5000],
            "url": j.get("absolute_url") or "",
            "posted_date": (j.get("updated_at") or "")[:10],
            "source": "greenhouse",
            "source_domain": "boards.greenhouse.io",
            "job_type": job_type,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })
    return jobs


def fetch_usajobs(api_key: str, user_agent_email: str | None = None, limit: int = 100) -> list[dict]:
    """Fetch jobs from USAJobs API. Requires API key. User-Agent should be email used for API request."""
    if not api_key:
        return []

    ua = (user_agent_email or "").strip() or USER_AGENT
    jobs = []
    seen_ids: set[str] = set()

    for kw in USAJOBS_INTERNSHIP_KEYWORDS[:2]:  # intern, internship
        try:
            resp = requests.get(
                USAJOBS_SEARCH,
                params={
                    "Keyword": kw,
                    "ResultsPerPage": min(limit, 100),
                    "Page": 1,
                    "WhoMayApply": "public",
                },
                headers={
                    "Host": "data.usajobs.gov",
                    "User-Agent": ua,
                    "Authorization-Key": api_key,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  USAJobs ({kw}): {e}")
            continue

        for item in data.get("SearchResult", {}).get("SearchResultItems", []):
            mat = item.get("MatchedObjectDescriptor") or {}
            pos_id = mat.get("PositionID") or item.get("MatchedObjectId") or ""
            if pos_id in seen_ids:
                continue
            seen_ids.add(str(pos_id))

            pos = mat.get("PositionTitle") or ""
            org = mat.get("OrganizationName") or ""
            loc_display = mat.get("PositionLocationDisplay")
            loc = loc_display if isinstance(loc_display, str) else ""
            if isinstance(loc_display, list) and loc_display:
                loc = loc_display[0].get("LocationName", "") if isinstance(loc_display[0], dict) else str(loc_display[0])
            desc = (mat.get("UserArea") or {}).get("Details", {}) or {}
            if isinstance(desc, dict):
                desc = desc.get("JobSummary", "") or ""
            url = mat.get("PositionURI") or ""
            posted = (mat.get("PublicationStartDate") or "")[:10]

            jobs.append({
                "id": str(uuid.uuid4()),
                "external_id": f"usajobs:{pos_id}",
                "title": pos,
                "company": org,
                "location": loc,
                "description": _strip_html(str(desc))[:5000],
                "url": url,
                "posted_date": posted,
                "source": "usajobs",
                "source_domain": "usajobs.gov",
                "job_type": "internship" if "intern" in f"{pos}{desc}".lower() else "full_time",
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            })
        time.sleep(REQUEST_DELAY_SEC)

    return jobs


def init_db(db_path: Path) -> None:
    """Create jobs table if not exists."""
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            external_id TEXT UNIQUE,
            title TEXT,
            company TEXT,
            location TEXT,
            description TEXT,
            url TEXT,
            posted_date TEXT,
            source TEXT,
            source_domain TEXT,
            job_type TEXT,
            scraped_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_scraped ON jobs(scraped_at)")
    conn.commit()
    conn.close()


def upsert_jobs(db_path: Path, jobs: list[dict]) -> int:
    """Insert or replace jobs. Returns count inserted."""
    if not jobs:
        return 0
    conn = sqlite3.connect(db_path)
    count = 0
    for j in jobs:
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO jobs (
                    id, external_id, title, company, location, description,
                    url, posted_date, source, source_domain, job_type, scraped_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    j["id"],
                    j.get("external_id", ""),
                    j.get("title", ""),
                    j.get("company", ""),
                    j.get("location", ""),
                    j.get("description", ""),
                    j.get("url", ""),
                    j.get("posted_date", ""),
                    j.get("source", ""),
                    j.get("source_domain", ""),
                    j.get("job_type", "full_time"),
                    j.get("scraped_at", ""),
                ),
            )
            count += 1
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    conn.close()
    return count


def run_job_scraper(
    db_path: Path | str | None = None,
    dry_run: bool = False,
    greenhouse_only: bool = False,
    limit_boards: int | None = None,
) -> dict[str, Any]:
    """Run the job scraper. Returns stats."""
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent
    db = Path(db_path) if db_path else Path(project_root / "dilly_jobs.db")

    stats = {"greenhouse": 0, "usajobs": 0, "total_inserted": 0, "errors": []}

    if dry_run:
        print("[DRY RUN] Would scrape:")
        for t in GREENHOUSE_BOARD_TOKENS[:limit_boards or 5]:
            print(f"  - Greenhouse: {t}")
        if not greenhouse_only:
            print("  - USAJobs (if USAJOBS_API_KEY set)")
        return stats

    init_db(db)
    tokens = GREENHOUSE_BOARD_TOKENS[:limit_boards] if limit_boards else GREENHOUSE_BOARD_TOKENS

    for i, token in enumerate(tokens):
        if i > 0:
            time.sleep(REQUEST_DELAY_SEC)
        print(f"Scraping Greenhouse: {token}")
        jobs = fetch_greenhouse_jobs(token)
        stats["greenhouse"] += len(jobs)
        if jobs:
            inserted = upsert_jobs(db, jobs)
            stats["total_inserted"] += inserted
            print(f"  -> {len(jobs)} jobs, {inserted} new/updated")

    if not greenhouse_only:
        api_key = os.environ.get("USAJOBS_API_KEY", "").strip()
        user_agent = os.environ.get("USAJOBS_USER_AGENT", "").strip()  # Email used when requesting API key
        if api_key:
            print("Scraping USAJobs...")
            jobs = fetch_usajobs(api_key, user_agent_email=user_agent or None, limit=50)
            stats["usajobs"] = len(jobs)
            if jobs:
                inserted = upsert_jobs(db, jobs)
                stats["total_inserted"] += inserted
                print(f"  -> {len(jobs)} jobs, {inserted} new/updated")
        else:
            print("Skipping USAJobs (set USAJOBS_API_KEY for federal jobs)")

    # Lever boards
    stats["lever"] = 0
    try:
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
        from dilly_core.job_source_lever import fetch_lever_jobs
        for slug in LEVER_COMPANY_SLUGS:
            time.sleep(REQUEST_DELAY_SEC)
            print(f"Scraping Lever: {slug}")
            jobs = fetch_lever_jobs(slug, max_jobs=30)
            # Normalize to scraper format
            for j in jobs:
                j["id"] = j.get("id") or str(uuid.uuid4())
                j["external_id"] = j.get("external_id") or f"lever:{slug}:{j.get('id', '')}"
                j["source_domain"] = j.get("source_domain") or f"jobs.lever.co/{slug}"
                j["scraped_at"] = j.get("scraped_at") or datetime.now(timezone.utc).isoformat()
                j["description"] = (j.get("description") or "")[:5000]
            stats["lever"] += len(jobs)
            if jobs:
                inserted = upsert_jobs(db, jobs)
                stats["total_inserted"] += inserted
                print(f"  -> {len(jobs)} jobs, {inserted} new/updated")
    except Exception as e:
        print(f"Lever scraping failed: {e}")
        stats["errors"].append(f"lever: {str(e)[:100]}")

    # Ashby boards
    stats["ashby"] = 0
    try:
        from dilly_core.job_source_ashby import fetch_ashby_jobs
        for slug in ASHBY_ORG_SLUGS:
            time.sleep(REQUEST_DELAY_SEC)
            print(f"Scraping Ashby: {slug}")
            jobs = fetch_ashby_jobs(slug, max_jobs=30)
            for j in jobs:
                j["id"] = j.get("id") or str(uuid.uuid4())
                j["external_id"] = j.get("external_id") or f"ashby:{slug}:{j.get('id', '')}"
                j["source_domain"] = j.get("source_domain") or f"jobs.ashbyhq.com/{slug}"
                j["scraped_at"] = j.get("scraped_at") or datetime.now(timezone.utc).isoformat()
                j["description"] = (j.get("description") or "")[:5000]
            stats["ashby"] += len(jobs)
            if jobs:
                inserted = upsert_jobs(db, jobs)
                stats["total_inserted"] += inserted
                print(f"  -> {len(jobs)} jobs, {inserted} new/updated")
    except Exception as e:
        print(f"Ashby scraping failed: {e}")
        stats["errors"].append(f"ashby: {str(e)[:100]}")

    total = stats['greenhouse'] + stats['usajobs'] + stats['lever'] + stats['ashby']
    print(f"\nDone. {total} scraped, {stats['total_inserted']} inserted. Errors: {len(stats['errors'])}")

    return stats
