"""
Lever Job Board scraper — public API, no auth needed.

Fetches job listings from Lever-hosted job boards.
API: GET https://api.lever.co/v0/postings/{company}?mode=json

Each company has a slug (e.g., "netflix", "spotify").
Returns structured job data including title, description, location, teams.
"""

import time
import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

LEVER_API = "https://api.lever.co/v0/postings"
USER_AGENT = "Dilly-Job-Aggregator/1.0 (+https://trydilly.com)"
REQUEST_DELAY = 2.0


def fetch_lever_jobs(company_slug: str, max_jobs: int = 100) -> list[dict]:
    """
    Fetch all open positions from a Lever job board.

    Returns list of normalized job dicts:
        {title, company, description, location, url, posted_date, job_type, source, teams}
    """
    url = f"{LEVER_API}/{company_slug}?mode=json"
    headers = {"User-Agent": USER_AGENT}

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 404:
            logger.warning(f"[lever] Company not found: {company_slug}")
            return []
        resp.raise_for_status()
        postings = resp.json()
    except Exception as e:
        logger.error(f"[lever] Failed to fetch {company_slug}: {e}")
        return []

    jobs = []
    for p in postings[:max_jobs]:
        title = (p.get("text") or "").strip()
        if not title:
            continue

        # Extract location
        categories = p.get("categories") or {}
        location = categories.get("location") or ""
        team = categories.get("team") or ""
        commitment = categories.get("commitment") or ""  # Full-time, Part-time, Intern

        # Build description from lists
        desc_parts = []
        for section in (p.get("lists") or []):
            content = section.get("content") or ""
            if content:
                # Strip HTML tags
                import re
                clean = re.sub(r'<[^>]+>', ' ', content).strip()
                desc_parts.append(clean)
        description = "\n".join(desc_parts)

        # Additional description from "additional" and "opening" fields
        opening = (p.get("descriptionPlain") or p.get("description") or "").strip()
        if opening:
            import re
            opening = re.sub(r'<[^>]+>', ' ', opening).strip()
            description = f"{opening}\n\n{description}" if description else opening

        # Detect job type
        cl = commitment.lower()
        tl = title.lower()
        if "intern" in cl or "intern" in tl:
            job_type = "internship"
        elif "part" in cl:
            job_type = "part_time"
        else:
            job_type = "entry_level"

        # Posted date
        created_at = p.get("createdAt")
        posted_date = ""
        if created_at:
            try:
                from datetime import datetime
                posted_date = datetime.fromtimestamp(created_at / 1000).strftime("%Y-%m-%d")
            except Exception:
                pass

        jobs.append({
            "title": title,
            "company": company_slug.replace("-", " ").title(),
            "description": description[:8000],
            "location": location,
            "url": p.get("hostedUrl") or p.get("applyUrl") or "",
            "posted_date": posted_date,
            "job_type": job_type,
            "source": "lever",
            "source_domain": f"jobs.lever.co/{company_slug}",
            "teams": [team] if team else [],
            "external_id": p.get("id") or "",
        })

    time.sleep(REQUEST_DELAY)
    return jobs


def fetch_all_lever(slugs: list[str], max_per_company: int = 50) -> list[dict]:
    """Fetch jobs from multiple Lever boards."""
    all_jobs = []
    for slug in slugs:
        logger.info(f"[lever] Fetching {slug}...")
        jobs = fetch_lever_jobs(slug, max_jobs=max_per_company)
        all_jobs.extend(jobs)
        logger.info(f"[lever] {slug}: {len(jobs)} jobs")
    return all_jobs
