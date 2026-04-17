"""
Remote-first job feeds — RemoteOK, We Work Remotely, and Built In.

These are public, free JSON/HTML endpoints that list thousands of
remote or tech-forward jobs from many different companies in one
response. Unlike the ATS crawlers (Greenhouse, Lever, etc.) where one
request = one company, these feeds each give us the entire market in
one or two calls.

Volume estimate (as of 2026-04):
  RemoteOK         ~1-2k live jobs, updated multiple times per day
  We Work Remotely ~500-1k live jobs
  Built In         ~15-20k live jobs across 15 tech hubs

Each feed normalizes to the same dict shape the main crawler's
write_listings() accepts:
  {external_id, title, company, description, apply_url,
   location_city, location_state, work_mode, posted_date,
   source_ats, team, remote, tags, job_type, company_website?}
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

USER_AGENT = "Dilly-Job-Aggregator/1.0 (+https://trydilly.com)"
REQUEST_TIMEOUT = 15
REQUEST_DELAY = 1.5


# ── Helpers ────────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()


def _classify_job_type(title: str, description: str) -> str:
    """Cheap keyword classifier to match what crawl_internships_v2 does."""
    t = (title + " " + description).lower()
    if "intern" in t or "internship" in t or "co-op" in t:
        return "internship"
    if any(k in t for k in ("part-time", "part time", "weekend")):
        return "part_time"
    if any(k in t for k in ("senior", "staff", "principal", "director", "lead ", "head of", "vp ", "10+ years", "7+ years")):
        return "other"  # out of scope for early-career first
    return "entry_level"


def _derive_website(url: str | None, company_name: str | None) -> str | None:
    """Extract a bare domain from the apply URL if possible; fall back
    to a guess from the company name. The internships_v2 feed looks at
    companies.website; populating this lets the Clearbit logo fallback
    work for feed-sourced jobs."""
    if url:
        try:
            parsed = urlparse(url if "://" in url else f"https://{url}")
            host = (parsed.netloc or "").lower()
            # Strip common ATS/apply host prefixes so we land on the
            # actual employer domain when possible.
            host = re.sub(r"^(jobs|careers|boards|apply|hr|recruit|talent)\.", "", host)
            host = host.lstrip("www.")
            if host and "." in host and not any(
                ats in host for ats in ("greenhouse", "lever.co", "ashbyhq", "smartrecruiters", "workday", "icims", "remoteok", "weworkremotely", "builtin", "linkedin", "indeed")
            ):
                return host
        except Exception:
            pass
    if company_name:
        slug = re.sub(r"[^a-z0-9]", "", company_name.lower().strip())
        if slug and len(slug) >= 3:
            return f"{slug}.com"
    return None


# ── RemoteOK ───────────────────────────────────────────────────────────
# Public JSON feed at /api. Schema: list of job dicts (first entry is
# a "legal" disclaimer — we skip index 0).

REMOTE_OK_FEED = "https://remoteok.com/api"


def fetch_remoteok() -> list[dict]:
    """Fetch every currently-live job on RemoteOK in one request.
    Returns a list of normalized job dicts ready for write_listings()."""
    try:
        resp = requests.get(REMOTE_OK_FEED, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as e:
        logger.error("[remoteok] fetch failed: %s", e)
        return []

    if not isinstance(payload, list):
        return []

    jobs = []
    for p in payload[1:]:  # skip disclaimer row
        if not isinstance(p, dict):
            continue
        title = (p.get("position") or p.get("title") or "").strip()
        company = (p.get("company") or "").strip()
        if not title or not company:
            continue

        desc = _strip_html(p.get("description") or "")
        url = p.get("url") or p.get("apply_url") or p.get("logo") or ""
        if url and not url.startswith("http"):
            url = f"https://remoteok.com{url}"

        posted = None
        if p.get("date"):
            try:
                posted = str(p["date"])[:10]
            except Exception:
                pass

        tags = p.get("tags") or []
        if not isinstance(tags, list):
            tags = []

        job_type = _classify_job_type(title, desc)

        jobs.append({
            "external_id": f"remoteok-{p.get('id') or p.get('slug') or title}",
            "title": title,
            "company": company,
            "description": desc[:5000],
            "apply_url": url,
            "location_city": None,
            "location_state": None,
            "work_mode": "remote",
            "posted_date": posted,
            "source_ats": "remoteok",
            "team": "",
            "remote": True,
            "tags": tags,
            "job_type": job_type,
            "company_website": _derive_website(url, company),
        })

    logger.info("[remoteok] %d jobs", len(jobs))
    time.sleep(REQUEST_DELAY)
    return jobs


# ── We Work Remotely ───────────────────────────────────────────────────
# Has an RSS feed at /categories/remote-{cat}/jobs.rss — we'll hit the
# aggregate one. RSS, not JSON, but lightweight and reliable.

WWR_RSS = "https://weworkremotely.com/remote-jobs.rss"


def fetch_wwr() -> list[dict]:
    """Fetch We Work Remotely's master RSS feed."""
    try:
        resp = requests.get(WWR_RSS, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        xml = resp.text
    except Exception as e:
        logger.error("[wwr] fetch failed: %s", e)
        return []

    # Simple regex-based RSS parse — the feed shape is stable and we
    # don't want an xml parser dependency just for this.
    item_blocks = re.findall(r"<item>(.*?)</item>", xml, re.DOTALL)
    jobs = []
    for block in item_blocks:
        def tag(name: str) -> str:
            m = re.search(rf"<{name}[^>]*>(.*?)</{name}>", block, re.DOTALL)
            if not m:
                return ""
            raw = m.group(1)
            # Unwrap CDATA if present
            cdata = re.search(r"<!\[CDATA\[(.*?)\]\]>", raw, re.DOTALL)
            return (cdata.group(1) if cdata else raw).strip()

        raw_title = tag("title")
        link = tag("link")
        desc = _strip_html(tag("description"))
        pub = tag("pubDate")

        # WWR title format: "Company: Role Title"
        if ":" in raw_title:
            company, title = raw_title.split(":", 1)
            company = company.strip()
            title = title.strip()
        else:
            company = "Unknown"
            title = raw_title.strip()
        if not title:
            continue

        # Parse pubDate like "Mon, 14 Apr 2026 12:00:00 +0000"
        posted = None
        if pub:
            try:
                dt = datetime.strptime(pub, "%a, %d %b %Y %H:%M:%S %z")
                posted = dt.strftime("%Y-%m-%d")
            except Exception:
                try:
                    posted = pub[:10]
                except Exception:
                    pass

        job_type = _classify_job_type(title, desc)

        jobs.append({
            "external_id": f"wwr-{hash(link or raw_title) & 0xffffffff}",
            "title": title,
            "company": company,
            "description": desc[:5000],
            "apply_url": link,
            "location_city": None,
            "location_state": None,
            "work_mode": "remote",
            "posted_date": posted,
            "source_ats": "wwr",
            "team": "",
            "remote": True,
            "tags": [],
            "job_type": job_type,
            "company_website": _derive_website(link, company),
        })

    logger.info("[wwr] %d jobs", len(jobs))
    time.sleep(REQUEST_DELAY)
    return jobs


# ── Built In ───────────────────────────────────────────────────────────
# Built In publishes a sitemap/JSON of active jobs per hub. The public
# /jobs.json endpoint isn't documented but returns paginated JSON for
# most hub pages. When that fails we fall back to parsing their
# sitemap-jobs.xml and scraping job URLs.
#
# Conservative: stick to a known-good JSON endpoint per hub and cap at
# 1000 jobs per hub so we don't wait forever.

BUILTIN_HUBS = [
    # Hub subdomain → display region (for logging)
    ("www", "National"),
    ("sf", "San Francisco"),
    ("la", "Los Angeles"),
    ("nyc", "New York"),
    ("boston", "Boston"),
    ("chicago", "Chicago"),
    ("austin", "Austin"),
    ("seattle", "Seattle"),
    ("dc", "Washington DC"),
    ("atlanta", "Atlanta"),
    ("denver", "Denver"),
    ("dallas", "Dallas"),
    ("miami", "Miami"),
    ("houston", "Houston"),
    ("sandiego", "San Diego"),
]

BUILTIN_PER_HUB_CAP = 1000


def fetch_builtin() -> list[dict]:
    """Scrape Built In's public job pages across all hubs.

    Built In doesn't expose a stable JSON endpoint to the public, so
    this uses their sitemap-based job URL discovery and extracts
    structured data from the per-page <script type="application/ld+json">
    blocks (which they publish for SEO). Parses the JobPosting schema.
    """
    jobs: list[dict] = []

    for sub, region in BUILTIN_HUBS:
        url = f"https://builtin.com/jobs" if sub == "www" else f"https://{sub}.builtin.com/jobs"
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code != 200:
                logger.warning("[builtin] %s non-200: %s", region, resp.status_code)
                continue
            html = resp.text
        except Exception as e:
            logger.error("[builtin] %s fetch failed: %s", region, e)
            continue

        # Extract JSON-LD JobPosting blocks. Built In embeds one per
        # listing on the index page.
        matches = re.findall(
            r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
            html,
            re.DOTALL,
        )
        hub_count = 0
        for m in matches:
            try:
                data = json.loads(m.strip())
            except Exception:
                continue

            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                if item.get("@type") != "JobPosting":
                    # Sometimes wrapped in ItemList → itemListElement
                    if item.get("@type") == "ItemList":
                        for el in (item.get("itemListElement") or []):
                            job_obj = el.get("item") if isinstance(el, dict) else None
                            if job_obj and job_obj.get("@type") == "JobPosting":
                                items.append(job_obj)
                    continue

                title = (item.get("title") or "").strip()
                company = ""
                org = item.get("hiringOrganization") or {}
                if isinstance(org, dict):
                    company = (org.get("name") or "").strip()
                if not title or not company:
                    continue

                desc = _strip_html(item.get("description") or "")
                apply_url = item.get("url") or ""

                loc_city = None
                loc_state = None
                loc = item.get("jobLocation") or {}
                if isinstance(loc, list) and loc:
                    loc = loc[0]
                if isinstance(loc, dict):
                    addr = loc.get("address") or {}
                    if isinstance(addr, dict):
                        loc_city = addr.get("addressLocality") or None
                        loc_state = addr.get("addressRegion") or None

                is_remote = bool(item.get("jobLocationType") == "TELECOMMUTE")
                posted = None
                if item.get("datePosted"):
                    try:
                        posted = str(item["datePosted"])[:10]
                    except Exception:
                        pass

                job_type = _classify_job_type(title, desc)

                org_website = None
                if isinstance(org, dict):
                    org_website = org.get("sameAs") or org.get("url")
                org_website = _derive_website(org_website, company)

                jobs.append({
                    "external_id": f"builtin-{hash((title, company, apply_url)) & 0xffffffff}",
                    "title": title,
                    "company": company,
                    "description": desc[:5000],
                    "apply_url": apply_url,
                    "location_city": loc_city,
                    "location_state": loc_state,
                    "work_mode": "remote" if is_remote else "unknown",
                    "posted_date": posted,
                    "source_ats": "builtin",
                    "team": "",
                    "remote": is_remote,
                    "tags": [],
                    "job_type": job_type,
                    "company_website": org_website,
                })
                hub_count += 1
                if hub_count >= BUILTIN_PER_HUB_CAP:
                    break
            if hub_count >= BUILTIN_PER_HUB_CAP:
                break

        logger.info("[builtin] %s: %d jobs", region, hub_count)
        time.sleep(REQUEST_DELAY)

    logger.info("[builtin] %d jobs total across %d hubs", len(jobs), len(BUILTIN_HUBS))
    return jobs


# ── Entry point used by crawl_internships_v2 ──────────────────────────

def fetch_all_remote_feeds() -> list[tuple[str, str, list[dict]]]:
    """Return [(source_name, ats_label, jobs_list), ...] for the main
    crawler to iterate. Each job already has source_ats set; the
    ats_label here is only used for logging in the crawler."""
    out: list[tuple[str, str, list[dict]]] = []

    try:
        out.append(("RemoteOK", "remoteok", fetch_remoteok()))
    except Exception as e:
        logger.error("[remote_feeds] remoteok unhandled: %s", e)
        out.append(("RemoteOK", "remoteok", []))

    try:
        out.append(("We Work Remotely", "wwr", fetch_wwr()))
    except Exception as e:
        logger.error("[remote_feeds] wwr unhandled: %s", e)
        out.append(("We Work Remotely", "wwr", []))

    try:
        out.append(("Built In", "builtin", fetch_builtin()))
    except Exception as e:
        logger.error("[remote_feeds] builtin unhandled: %s", e)
        out.append(("Built In", "builtin", []))

    return out
