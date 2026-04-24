"""
WeWorkRemotely RSS scraper.

Source: https://weworkremotely.com/remote-jobs.rss — ~100 listings.
No API key required; feed is public.

All listings are remote. De-dupe key: "wwr_<slug>" from the guid URL path.
"""
from __future__ import annotations

import html
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional

_RSS_URL = "https://weworkremotely.com/remote-jobs.rss"
_USER_AGENT = "Dilly-Job-Ingest/1.0 (+https://hellodilly.com)"

# WeWorkRemotely category → Dilly snake_case cohort IDs
_CATEGORY_TO_COHORTS: Dict[str, List[str]] = {
    "Full-Stack Programming":   ["tech_software_engineering"],
    "Back-End Programming":     ["tech_software_engineering"],
    "Front-End Programming":    ["tech_software_engineering"],
    "Mobile Programming":       ["tech_software_engineering"],
    "DevOps and Sysadmin":      ["tech_cybersecurity"],
    "Security":                 ["tech_cybersecurity"],
    "Data Science":             ["tech_data_science"],
    "Product":                  ["sport_management"],
    "Sales and Marketing":      ["business_marketing"],
    "Design":                   ["arts_design"],
    "Management and Finance":   ["business_finance", "business_consulting"],
    "Copywriting":              ["humanities_communications"],
    "Writing":                  ["humanities_communications"],
    "Customer Support":         ["sport_management"],
    "Healthcare / Medical":     ["pre_health"],
    "Legal / Compliance":       ["pre_law"],
    "Teaching / Education":     ["education"],
    "Business":                 ["business_consulting"],
    # "All Other Remote" → [] → LLM classifier
}

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_SLUG_RE = re.compile(r"/remote-jobs/([^?#\s]+)")


def _strip_html(raw: str) -> str:
    text = _HTML_TAG_RE.sub(" ", raw or "")
    return _WS_RE.sub(" ", html.unescape(text)).strip()


def _slug_from_url(url: str) -> Optional[str]:
    m = _SLUG_RE.search(url or "")
    return m.group(1) if m else None


def _parse_pubdate(raw: str) -> str:
    """Parse RFC-2822 pubDate to YYYY-MM-DD."""
    try:
        dt = parsedate_to_datetime(raw)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return ""


def _fetch_rss() -> List[ET.Element]:
    req = urllib.request.Request(_RSS_URL, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
    root = ET.fromstring(raw)
    return root.findall(".//item")


def _normalize(item: ET.Element) -> Optional[Dict[str, Any]]:
    def _t(tag: str) -> str:
        return (item.findtext(tag) or "").strip()

    guid = _t("guid") or _t("link")
    slug = _slug_from_url(guid)
    if not slug:
        return None

    # Parse company + title from the RSS title field ("Company: Role Title")
    raw_title = _t("title")
    if ": " in raw_title:
        company, title = raw_title.split(": ", 1)
    else:
        company, title = "", raw_title
    company = company.strip()
    title = title.strip()
    if not title:
        return None
    if not company:
        company = "Unknown"

    link = _t("link") or guid
    category = _t("category")
    cohorts = _CATEGORY_TO_COHORTS.get(category, [])

    raw_desc = _t("description")
    description = _strip_html(raw_desc)[:2000]

    date_posted = _parse_pubdate(_t("pubDate"))

    # Classify job type from title + description
    try:
        from crawl_internships_v2 import classify_listing as _clf
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing as _clf
        except ImportError:
            _clf = None
    job_type = _clf(title, description) if _clf else "other"

    return {
        "external_id": f"wwr_{slug}",
        "company": company,
        "title": title,
        "description": description,
        "apply_url": link,
        "location_city": None,
        "location_state": None,
        "work_mode": "remote",
        "remote": True,
        "source_ats": "weworkremotely",
        "job_type": job_type,
        "cohorts": cohorts,
        "tags": [category] if category else [],
        "team": category,
        "posted_date": date_posted,
        "industry": "technology",
    }


def fetch_weworkremotely_listings() -> List[Dict[str, Any]]:
    """
    Fetch ~100 remote listings from WeWorkRemotely RSS.
    Returns normalized listing dicts ready for _upsert_listing().
    """
    import sys
    try:
        items = _fetch_rss()
    except Exception as e:
        sys.stderr.write(f"[wwr] fetch failed: {type(e).__name__}: {e}\n")
        return []

    results: List[Dict[str, Any]] = []
    for item in items:
        listing = _normalize(item)
        if listing:
            results.append(listing)

    sys.stderr.write(
        f"[wwr] {len(items)} fetched → {len(results)} normalized\n"
    )
    return results
