"""
Ashby Job Board scraper — public API, no auth needed.

Fetches job listings from Ashby-hosted job boards.
API: POST https://jobs.ashbyhq.com/api/non-user-graphql
with: {"operationName": "ApiJobBoardWithTeams", "variables": {"organizationHostedJobsPageName": "{org}"}}

Simpler alternative: GET https://api.ashbyhq.com/posting-api/job-board/{org}
"""

import time
import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

ASHBY_API = "https://api.ashbyhq.com/posting-api/job-board"
USER_AGENT = "Dilly-Job-Aggregator/1.0 (+https://trydilly.com)"
REQUEST_DELAY = 2.0


def fetch_ashby_jobs(org_slug: str, max_jobs: int = 100) -> list[dict]:
    """
    Fetch all open positions from an Ashby job board.

    Returns list of normalized job dicts.
    """
    url = f"{ASHBY_API}/{org_slug}"
    headers = {"User-Agent": USER_AGENT}

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 404:
            logger.warning(f"[ashby] Org not found: {org_slug}")
            return []
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"[ashby] Failed to fetch {org_slug}: {e}")
        return []

    postings = data.get("jobs") or []
    jobs = []
    for p in postings[:max_jobs]:
        title = (p.get("title") or "").strip()
        if not title:
            continue

        location = p.get("location") or ""
        if isinstance(location, dict):
            location = location.get("name") or ""

        department = p.get("department") or ""
        team = p.get("team") or ""
        employment_type = (p.get("employmentType") or "").lower()

        # Detect job type
        tl = title.lower()
        if "intern" in tl or "internship" in employment_type:
            job_type = "internship"
        elif "part" in employment_type:
            job_type = "part_time"
        else:
            job_type = "entry_level"

        # Description
        description = (p.get("descriptionHtml") or p.get("descriptionPlain") or "").strip()
        import re
        description = re.sub(r'<[^>]+>', ' ', description).strip()[:8000]

        # Posted date
        posted_date = (p.get("publishedDate") or p.get("createdAt") or "")[:10]

        jobs.append({
            "title": title,
            "company": org_slug.replace("-", " ").title(),
            "description": description,
            "location": location,
            "url": p.get("jobUrl") or p.get("applyUrl") or f"https://jobs.ashbyhq.com/{org_slug}/{p.get('id', '')}",
            "posted_date": posted_date,
            "job_type": job_type,
            "source": "ashby",
            "source_domain": f"jobs.ashbyhq.com/{org_slug}",
            "teams": [t for t in [department, team] if t],
            "external_id": p.get("id") or "",
        })

    time.sleep(REQUEST_DELAY)
    return jobs


def fetch_all_ashby(slugs: list[str], max_per_org: int = 50) -> list[dict]:
    """Fetch jobs from multiple Ashby boards."""
    all_jobs = []
    for slug in slugs:
        logger.info(f"[ashby] Fetching {slug}...")
        jobs = fetch_ashby_jobs(slug, max_jobs=max_per_org)
        all_jobs.extend(jobs)
        logger.info(f"[ashby] {slug}: {len(jobs)} jobs")
    return all_jobs
