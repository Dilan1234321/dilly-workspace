"""
Workable job-board scraper — public JSON API, no auth.

Workable is used by thousands of mid-market employers (5-500 employees).
Each board has a slug like "scaleupsolutions" or "company-name"; the
public listing endpoint is:

    GET https://apply.workable.com/api/v3/accounts/{slug}/jobs

which returns a paginated list of active public jobs. Individual job
detail is:

    GET https://apply.workable.com/api/v3/accounts/{slug}/jobs/{shortcode}

This module mirrors the shape of job_source_lever.py so the v2
crawler's orchestrator can treat Workable as just another ATS.

Hiring-manager ask: our users complained that Workable roles were
missing. This is the cheapest way to fix that since Workable publishes
a clean, stable JSON feed — no scraping, no auth, no retry hell.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

WORKABLE_API = "https://apply.workable.com/api/v3/accounts"
USER_AGENT = "Dilly-Job-Aggregator/1.0 (+https://trydilly.com)"
REQUEST_DELAY = 2.0  # be a polite citizen — Workable doesn't publish a rate limit
PAGE_SIZE = 100


def _strip_html(html: str) -> str:
    """Cheap HTML stripper — we don't need perfect, just no tags for LLM input."""
    if not html:
        return ""
    # Remove scripts/styles entirely
    html = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html, flags=re.DOTALL | re.IGNORECASE)
    # Convert block breaks to newlines so the description is readable
    html = re.sub(r'<(br|p|div|li|h[1-6])[^>]*>', '\n', html, flags=re.IGNORECASE)
    # Strip everything else
    html = re.sub(r'<[^>]+>', ' ', html)
    # Entities we care about
    html = html.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return re.sub(r'\s+', ' ', html).strip()


def _classify_job_type(title: str, employment_type: str) -> str:
    """Map Workable's employment_type + title into our canonical job_type.

    Workable values we've seen: Full-time, Part-time, Contract, Temporary,
    Internship, Volunteer. Empty strings happen too."""
    t = (title or "").lower()
    et = (employment_type or "").lower()
    if "intern" in t or "intern" in et:
        return "internship"
    if "part" in et or "part-time" in t:
        return "part_time"
    # Anything that looks senior stays classified normally — the caller's
    # classify_listing can reclassify. Default to entry_level so early-
    # career users see a meaningful feed.
    return "entry_level"


def fetch_workable_jobs(company_slug: str, max_jobs: int = 200) -> list[dict]:
    """
    Fetch active public jobs from a single Workable board.

    Returns a list of normalized dicts matching the shape the v2 crawler
    writes to the `internships` table. Empty list on any failure
    (network, 404, bad JSON, rate limit) — fail-open, never raise.
    """
    url = f"{WORKABLE_API}/{company_slug}/jobs"
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

    jobs: list[dict] = []
    next_token: str | None = None
    pages_fetched = 0
    max_pages = 8  # hard cap so we can't accidentally thrash a board

    while True:
        params = {"limit": PAGE_SIZE}
        if next_token:
            params["since_id"] = next_token

        try:
            resp = requests.get(url, headers=headers, params=params, timeout=15)
            if resp.status_code == 404:
                logger.warning("[workable] board not found: %s", company_slug)
                return []
            if resp.status_code == 429:
                logger.warning("[workable] rate limited on %s, backing off", company_slug)
                time.sleep(5.0)
                return jobs  # keep what we have, caller can retry tomorrow
            resp.raise_for_status()
            data = resp.json() or {}
        except Exception as e:
            logger.error("[workable] %s fetch failed: %s", company_slug, e)
            return jobs

        postings = data.get("results") or data.get("jobs") or []
        if not postings:
            break

        for p in postings[: max_jobs - len(jobs)]:
            title = (p.get("title") or "").strip()
            if not title:
                continue

            description_html = p.get("description") or ""
            requirements_html = p.get("requirements") or ""
            benefits_html = p.get("benefits") or ""
            description = _strip_html(description_html)
            # Requirements + benefits contain the keywords our ATS
            # matcher + resume tailor pull from. Concatenate so the
            # downstream scorers see everything.
            extras = " ".join(
                filter(None, [_strip_html(requirements_html), _strip_html(benefits_html)])
            )
            if extras:
                description = f"{description}\n\n{extras}"

            # Location — Workable returns a nested object.
            location_obj = p.get("location") or {}
            city = (location_obj.get("city") or "").strip()
            region = (location_obj.get("region") or "").strip()
            country = (location_obj.get("country_code") or location_obj.get("country") or "").strip()
            # Only US/Canada for now — matches the filter the other
            # ATS crawlers use.
            if country and country.upper() not in {"US", "USA", "UNITED STATES", "CA", "CAN", "CANADA", ""}:
                continue
            location = ", ".join([part for part in [city, region] if part])

            employment_type = p.get("employment_type") or ""
            job_type = _classify_job_type(title, employment_type)

            # Posted date — "published_on" is ISO-like when present.
            posted_iso = (p.get("published_on") or p.get("created_at") or "").strip()
            posted_date = ""
            if posted_iso:
                try:
                    posted_date = datetime.fromisoformat(posted_iso.replace("Z", "+00:00")).strftime("%Y-%m-%d")
                except Exception:
                    posted_date = posted_iso[:10]

            apply_url = (
                p.get("application_url")
                or p.get("shortlink")
                or p.get("url")
                or f"https://apply.workable.com/{company_slug}/j/{p.get('shortcode', '')}"
            )

            remote = bool(p.get("remote") or location_obj.get("is_remote"))

            jobs.append({
                "title": title,
                "company": p.get("company") or company_slug.replace("-", " ").title(),
                "description": description[:8000],
                "location": location,
                "location_city": city or None,
                "location_state": region or None,
                "work_mode": "remote" if remote else "unknown",
                "remote": remote,
                "url": apply_url,
                "apply_url": apply_url,
                "posted_date": posted_date or None,
                "job_type": job_type,
                "source": "workable",
                "source_ats": "workable",
                "source_domain": f"apply.workable.com/{company_slug}",
                "teams": [p.get("department")] if p.get("department") else [],
                "team": (p.get("department") or "").strip(),
                "external_id": f"wk-{company_slug}-{p.get('shortcode') or p.get('id') or ''}",
                "tags": [],
            })
            if len(jobs) >= max_jobs:
                break

        pages_fetched += 1
        if len(jobs) >= max_jobs:
            break
        # Workable paginates via `paging.next` offsets; the API returns
        # <PAGE_SIZE when exhausted.
        if len(postings) < PAGE_SIZE:
            break
        # Some tenants return a "paging" wrapper with a `next` id.
        next_token = (data.get("paging") or {}).get("next")
        if not next_token:
            break
        if pages_fetched >= max_pages:
            break
        time.sleep(REQUEST_DELAY)

    return jobs


def fetch_all_workable(slugs: list[str], max_per_company: int = 100) -> list[dict]:
    """Fetch from many Workable boards in sequence. Never raises."""
    all_jobs: list[dict] = []
    for slug in slugs:
        logger.info("[workable] fetching %s...", slug)
        try:
            jobs = fetch_workable_jobs(slug, max_jobs=max_per_company)
            logger.info("[workable] %s: %d jobs", slug, len(jobs))
            all_jobs.extend(jobs)
        except Exception as e:
            logger.error("[workable] %s crashed: %s", slug, e)
        time.sleep(REQUEST_DELAY)
    return all_jobs
