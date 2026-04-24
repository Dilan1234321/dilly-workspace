"""
RemoteOK API scraper.

Source: https://remoteok.com/api — returns ~100 active remote jobs as JSON.
No API key required; respectful User-Agent required per their ToS.

Attribution: apply_url points to the original company posting; the listing
url field points to RemoteOK's own page (used as the canonical link per ToS).

All listings are remote by definition.
"""
from __future__ import annotations

import html
import json
import re
import urllib.request
from typing import Any, Dict, List, Optional

_API_URL = "https://remoteok.com/api"
_USER_AGENT = "Dilly-Job-Ingest/1.0 (+https://hellodilly.com)"

# Map RemoteOK tag strings → Dilly snake_case cohort IDs.
# Tags skew senior/lead but entry-level ones do appear — classifier handles rest.
_TAG_TO_COHORTS: Dict[str, List[str]] = {
    "software":         ["tech_software_engineering"],
    "engineering":      ["tech_software_engineering"],
    "backend":          ["tech_software_engineering"],
    "frontend":         ["tech_software_engineering"],
    "fullstack":        ["tech_software_engineering"],
    "dev":              ["tech_software_engineering"],
    "python":           ["tech_software_engineering"],
    "javascript":       ["tech_software_engineering"],
    "react":            ["tech_software_engineering"],
    "node":             ["tech_software_engineering"],
    "ai":               ["tech_data_science", "tech_software_engineering"],
    "machine learning": ["tech_data_science"],
    "data":             ["tech_data_science"],
    "analytics":        ["tech_data_science"],
    "cybersecurity":    ["tech_cybersecurity"],
    "security":         ["tech_cybersecurity"],
    "devops":           ["tech_cybersecurity"],
    "infra":            ["tech_cybersecurity"],
    "marketing":        ["business_marketing"],
    "growth":           ["business_marketing"],
    "sales":            ["business_marketing"],
    "finance":          ["business_finance"],
    "accounting":       ["business_accounting"],
    "consulting":       ["business_consulting"],
    "design":           ["arts_design"],
    "ux":               ["arts_design"],
    "ui":               ["arts_design"],
    "healthcare":       ["pre_health"],
    "legal":            ["pre_law"],
    "education":        ["education"],
    "teaching":         ["education"],
    "research":         ["science_research"],
    "writing":          ["humanities_communications"],
    "content":          ["humanities_communications"],
    "video":            ["arts_design"],
    "product":          ["sport_management"],
    "operations":       ["sport_management"],
    "hr":               ["sport_management"],
    "recruiting":       ["sport_management"],
}

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def _strip_html(raw: str) -> str:
    """Strip HTML tags and decode entities, collapse whitespace."""
    text = _HTML_TAG_RE.sub(" ", raw or "")
    text = html.unescape(text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def _cohorts_from_tags(tags: List[str]) -> List[str]:
    """
    Map RemoteOK tag list to Dilly cohort IDs.
    Returns deduplicated list; empty if no tag matches.
    """
    seen: set[str] = set()
    out: List[str] = []
    for tag in tags:
        t = (tag or "").lower().strip()
        cohort_ids = _TAG_TO_COHORTS.get(t, [])
        for cid in cohort_ids:
            if cid not in seen:
                seen.add(cid)
                out.append(cid)
    return out


def _fetch_json() -> List[Dict[str, Any]]:
    req = urllib.request.Request(_API_URL, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    # First element is a legal/attribution note dict — skip it
    return [d for d in data if d.get("id") and d.get("position")]


def _normalize(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    slug = str(item.get("slug") or item.get("id") or "").strip()
    title = (item.get("position") or "").strip()
    company = (item.get("company") or "").strip()
    if not slug or not title or not company:
        return None

    # Use RemoteOK's own listing URL as apply_url (per ToS attribution)
    apply_url = (item.get("url") or "").strip()
    if not apply_url:
        return None

    tags = [str(t) for t in (item.get("tags") or []) if t]
    cohorts = _cohorts_from_tags(tags)

    raw_desc = item.get("description") or ""
    description = _strip_html(raw_desc)[:2000]

    # Date: ISO string or epoch int
    date_posted = ""
    raw_date = item.get("date")
    if isinstance(raw_date, str) and raw_date:
        date_posted = raw_date[:10]
    elif item.get("epoch"):
        from datetime import datetime, timezone
        date_posted = datetime.fromtimestamp(int(item["epoch"]), tz=timezone.utc).strftime("%Y-%m-%d")

    # Classify job type from title/description
    try:
        from crawl_internships_v2 import classify_listing as _clf
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing as _clf
        except ImportError:
            _clf = None
    job_type = _clf(title, description) if _clf else "other"

    # Detect real ATS from the apply URL (RemoteOK URL → company's actual ATS)
    try:
        from dilly_core.ats_detector import detect_ats_or_keep
        source_ats = detect_ats_or_keep(apply_url, "remoteok")
    except ImportError:
        source_ats = "remoteok"

    # All RemoteOK jobs are remote
    return {
        "external_id": f"remoteok_{slug}",
        "company": company,
        "title": title,
        "description": description,
        "apply_url": apply_url,
        "location_city": None,
        "location_state": None,
        "work_mode": "remote",
        "remote": True,
        "source_ats": source_ats,
        "job_type": job_type,
        "cohorts": cohorts,
        "tags": tags[:10],
        "team": "",
        "posted_date": date_posted,
        "industry": "technology",
    }


def fetch_remoteok_listings() -> List[Dict[str, Any]]:
    """
    Fetch ~100 active remote listings from RemoteOK.
    Returns normalized listing dicts ready for _upsert_listing().
    """
    import sys
    try:
        raw = _fetch_json()
    except Exception as e:
        sys.stderr.write(f"[remoteok] fetch failed: {type(e).__name__}: {e}\n")
        return []

    results: List[Dict[str, Any]] = []
    for item in raw:
        listing = _normalize(item)
        if listing:
            results.append(listing)

    sys.stderr.write(
        f"[remoteok] {len(raw)} fetched → {len(results)} normalized\n"
    )
    return results
