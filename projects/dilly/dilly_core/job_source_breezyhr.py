"""
BreezyHR job board scraper.

BreezyHR is an SMB-focused ATS used by thousands of companies globally.
Public JSON API (no auth):
  GET https://<company>.breezy.hr/json

De-dupe key: "breezyhr_<slug>_<position_id>"
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
_TIMEOUT = 20

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

_US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC",
}


def _strip_html(raw: str) -> str:
    text = _HTML_TAG_RE.sub(" ", raw or "")
    return _WS_RE.sub(" ", text).strip()[:2000]


def _parse_location(loc_str: str) -> Tuple[Optional[str], Optional[str], bool]:
    loc = (loc_str or "").strip()
    lower = loc.lower()
    is_remote = "remote" in lower or "hybrid" in lower or "virtual" in lower
    m = re.match(r"^([^,]+),\s*([A-Z]{2})\s*$", loc)
    if m and m.group(2) in _US_STATES:
        return m.group(1).strip(), m.group(2), is_remote
    return (loc or None), None, is_remote


def fetch_breezyhr_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a BreezyHR company's public JSON feed.

    slug: BreezyHR company subdomain (e.g. 'buffer' for buffer.breezy.hr)
    """
    try:
        from crawl_internships_v2 import classify_listing, extract_tags
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing, extract_tags
        except ImportError:
            classify_listing = lambda t, d="": "other"
            extract_tags = lambda t, d="": []

    url = f"https://{slug}.breezy.hr/json"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[breezyhr] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("positions", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("_id") or job.get("id") or "")
        title = (job.get("name") or job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        job_type = classify_listing(title, desc)

        loc_obj = job.get("location") or {}
        loc_str = ""
        if isinstance(loc_obj, dict):
            city = (loc_obj.get("city") or "").strip()
            state = (loc_obj.get("state") or "").strip()
            loc_str = f"{city}, {state}".strip(", ")
        elif isinstance(loc_obj, str):
            loc_str = loc_obj

        city, state, is_remote = _parse_location(loc_str)
        if not is_remote:
            is_remote = job.get("location_type") == "remote" or "remote" in title.lower()

        apply_url = (
            job.get("url") or
            f"https://{slug}.breezy.hr/p/{job_id}"
        )
        posted = (job.get("creation_date") or "")[:10]
        dept = (job.get("department") or {})
        dept_name = dept.get("name", "") if isinstance(dept, dict) else str(dept)

        results.append({
            "external_id": f"breezyhr_{slug}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "breezyhr",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept_name,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


BREEZYHR_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Tech / SaaS companies
    "buffer":               ("Buffer", "Tech"),
    "zapier":               ("Zapier", "Tech"),
    "invision-app":         ("InVision", "Tech"),
    "doist":                ("Doist (Todoist)", "Tech"),
    "basecamp":             ("Basecamp", "Tech"),
    "close-crm":            ("Close CRM", "Tech"),
    "paperform":            ("Paperform", "Tech"),
    "whereby":              ("Whereby", "Tech"),
    "remote":               ("Remote.com", "Tech"),
    "hotjar":               ("Hotjar", "Tech"),
    "typeform-jobs":        ("Typeform", "Tech"),
    "loom":                 ("Loom", "Tech"),
    "miro-board":           ("Miro", "Tech"),
    "pitch-app":            ("Pitch", "Tech"),
    "tally-so":             ("Tally", "Tech"),
    "cal-com":              ("Cal.com", "Tech"),
    "plane-so":             ("Plane", "Tech"),
    "twenty-crm":           ("Twenty CRM", "Tech"),
    "formbricks":           ("Formbricks", "Tech"),
    "appflowy":             ("AppFlowy", "Tech"),
    "n8n-io":               ("n8n", "Tech"),
    "airbyte":              ("Airbyte", "Tech"),
    "prefect":              ("Prefect", "Tech"),
    "dagster":              ("Dagster Labs", "Tech"),
    "temporal":             ("Temporal Technologies", "Tech"),
    "windmill-dev":         ("Windmill", "Tech"),
    "novu-co":              ("Novu", "Tech"),
    "posthog":              ("PostHog", "Tech"),
    "metabase":             ("Metabase", "Tech"),
    "redash-io":            ("Redash", "Tech"),
    "superset-apache":      ("Apache Superset", "Tech"),
    "evidence-dev":         ("Evidence", "Tech"),
    # Marketing / creative agencies
    "wpromote":             ("Wpromote", "Tech"),
    "tinuiti":              ("Tinuiti", "Tech"),
    "power-digital":        ("Power Digital Marketing", "Tech"),
    "hawke-media":          ("Hawke Media", "Tech"),
    "column5":              ("Column Five Media", "Tech"),
    "digital-silk":         ("Digital Silk", "Tech"),
    "brafton":              ("Brafton", "Tech"),
    "siege-media":          ("Siege Media", "Tech"),
    "clearvoice":           ("ClearVoice", "Tech"),
    "scripted-io":          ("Scripted", "Tech"),
    # Healthcare / wellness
    "hims-hers":            ("Hims & Hers", "Healthcare"),
    "noom":                 ("Noom", "Healthcare"),
    "headspace":            ("Headspace", "Healthcare"),
    "calm":                 ("Calm", "Healthcare"),
    "teladoc-health":       ("Teladoc Health", "Healthcare"),
    "ro-health":            ("Ro Health", "Healthcare"),
    "carbon-health":        ("Carbon Health", "Healthcare"),
    "spring-health":        ("Spring Health", "Healthcare"),
    "brightline":           ("Brightline", "Healthcare"),
    "cerebral-care":        ("Cerebral", "Healthcare"),
    # Fintech
    "pocketsmith":          ("PocketSmith", "Finance"),
    "empower-finance":      ("Empower Finance", "Finance"),
    "brigit-app":           ("Brigit", "Finance"),
    "dave-banking":         ("Dave", "Finance"),
    "chime":                ("Chime", "Finance"),
    "current-banking":      ("Current", "Finance"),
    "varo-bank":            ("Varo Bank", "Finance"),
    # E-commerce / retail
    "gorgias":              ("Gorgias", "Tech"),
    "recharge-payments":    ("Recharge", "Tech"),
    "bold-commerce":        ("Bold Commerce", "Tech"),
    "shogun-page-builder":  ("Shogun", "Tech"),
    "nacelle-io":           ("Nacelle", "Tech"),
    "rebuy-engine":         ("Rebuy", "Tech"),
    # Education
    "teachable":            ("Teachable", "Tech"),
    "kajabi":               ("Kajabi", "Tech"),
    "podia":                ("Podia", "Tech"),
    "thinkific":            ("Thinkific", "Tech"),
    "learnworlds":          ("LearnWorlds", "Tech"),
    "maven-platform":       ("Maven", "Tech"),
    # Construction / field service
    "buildertrend":         ("Buildertrend", "Tech"),
    "procore-tech":         ("Procore Technologies", "Tech"),
    "contractor-foreman":   ("Contractor Foreman", "Tech"),
    "fieldwire":            ("Fieldwire", "Tech"),
    "servicetitan":         ("ServiceTitan", "Tech"),
    "housecall-pro":        ("Housecall Pro", "Tech"),
    "jobber-hq":            ("Jobber", "Tech"),
    "kickserv":             ("Kickserv", "Tech"),
}


def fetch_all_breezyhr(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured BreezyHR company boards."""
    if companies is None:
        companies = BREEZYHR_COMPANIES
    results: List[Dict[str, Any]] = []
    for slug, (name, industry) in companies.items():
        try:
            jobs = fetch_breezyhr_jobs(slug, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[breezyhr] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[breezyhr] {name} ({slug}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[breezyhr] total: {len(results)} jobs\n")
    return results
