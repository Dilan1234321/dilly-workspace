"""
Hireology job board scraper.

Hireology is an ATS used primarily by automotive dealerships and franchise
businesses (HVAC, auto repair, home services). Career pages are at:
  https://app.hireology.com/api/organizations/<org_id>/jobs

The public JSON API is:
  GET https://app.hireology.com/api/organizations/<org_id>/jobs?status=open

De-dupe key: "hireology_<org_id>_<jobId>"
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

_USER_AGENT = "Dilly-Job-Ingest/1.0 (+https://hellodilly.com)"
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


def fetch_hireology_jobs(
    org_id: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Hireology organization's public API.

    org_id: Hireology organization ID (numeric string)
    """
    try:
        from crawl_internships_v2 import classify_listing, extract_tags
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing, extract_tags
        except ImportError:
            classify_listing = lambda t, d="": "other"
            extract_tags = lambda t, d="": []

    results: List[Dict[str, Any]] = []

    url = f"https://app.hireology.com/api/organizations/{org_id}/jobs?status=open"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[hireology] {org_id}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or job.get("name") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or job.get("jobDescription") or "")
        job_type = classify_listing(title, desc)

        loc_str = (
            job.get("location") or
            f"{job.get('city', '')}, {job.get('state', '')}".strip(", ") or ""
        )
        city, state, is_remote = _parse_location(loc_str)

        apply_url = (
            job.get("applyUrl") or job.get("url") or
            f"https://app.hireology.com/jobs/{job_id}/apply"
        )
        posted = (job.get("createdAt") or job.get("postedDate") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append({
            "external_id": f"hireology_{org_id}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "hireology",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "consumer",
        })

    return results


HIREOLOGY_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Automotive dealership groups (Hireology's core market)
    # Large dealer groups with many locations = most jobs
    "penske-auto":          ("Penske Automotive Group", "Consumer"),
    "sonic-auto":           ("Sonic Automotive", "Consumer"),
    "group1-auto":          ("Group 1 Automotive", "Consumer"),
    "lithia-motors":        ("Lithia Motors", "Consumer"),
    "autonation-hr":        ("AutoNation", "Consumer"),
    "hendrick-auto":        ("Hendrick Automotive Group", "Consumer"),
    "asbury-auto":          ("Asbury Automotive", "Consumer"),
    "park-place-dealers":   ("Park Place Dealerships", "Consumer"),
    "holman-enterprises":   ("Holman Enterprises", "Consumer"),
    "van-tuyl":             ("Van Tuyl Group/Berkshire Auto", "Consumer"),
    "sewell-auto":          ("Sewell Automotive", "Consumer"),
    "reed-lallier":         ("Reed-Lallier Chevrolet", "Consumer"),
    "hicks-enterprises":    ("Hicks Enterprises", "Consumer"),
    "ken-garff":            ("Ken Garff Automotive", "Consumer"),
    "jim-koons":            ("Jim Koons Automotive", "Consumer"),
    "stivers-ford":         ("Stivers Ford", "Consumer"),
    "denny-menholt":        ("Denny Menholt Chevrolet", "Consumer"),
    "baxter-auto":          ("Baxter Auto", "Consumer"),
    "piazza-auto":          ("Piazza Honda", "Consumer"),
    "mccombs-ford":         ("McCombs Ford", "Consumer"),
    "rick-hendrick":        ("Rick Hendrick Auto", "Consumer"),
    "larry-miller":         ("Larry H. Miller Group", "Consumer"),
    "bob-evans-motors":     ("Bob Evans Motors", "Consumer"),
    "sterling-mccall":      ("Sterling McCall", "Consumer"),
    "courtesy-auto":        ("Courtesy Automotive", "Consumer"),
    "fairway-ford":         ("Fairway Ford", "Consumer"),
    "ford-of-murfreesboro": ("Ford of Murfreesboro", "Consumer"),
    "toyota-of-clermont":   ("Toyota of Clermont", "Consumer"),
    "greenway-auto":        ("Greenway Auto Group", "Consumer"),
    "dch-auto":             ("DCH Auto Group", "Consumer"),
    # Franchise home services (Hireology's second-largest market)
    "servicemaster-clean":  ("ServiceMaster Clean", "Consumer"),
    "merry-maids":          ("Merry Maids", "Consumer"),
    "molly-maids":          ("Molly Maid", "Consumer"),
    "the-maids":            ("The Maids", "Consumer"),
    "home-team-pest":       ("HomeTeam Pest Defense", "Consumer"),
    "terminix":             ("Terminix", "Consumer"),
    "rentokil-north-am":    ("Rentokil North America", "Consumer"),
    "orkin":                ("Orkin", "Consumer"),
    "presto-x":             ("Presto-X", "Consumer"),
    "western-pest":         ("Western Pest Services", "Consumer"),
    "aptive-env":           ("Aptive Environmental", "Consumer"),
    "smarter-pest":         ("Smarter Pest Solutions", "Consumer"),
    "abc-home-services":    ("ABC Home & Commercial", "Consumer"),
    "sunpro-solar":         ("SunPro Solar", "Consumer"),
    "trinity-solar":        ("Trinity Solar", "Consumer"),
    "sunrun-local":         ("Sunrun", "Tech"),
    "vivint-solar-local":   ("Vivint Solar", "Tech"),
    "momentum-solar":       ("Momentum Solar", "Tech"),
    "titan-solar":          ("Titan Solar Power", "Tech"),
    "blue-raven-solar":     ("Blue Raven Solar", "Tech"),
}


def fetch_all_hireology(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Hireology organization boards."""
    if companies is None:
        companies = HIREOLOGY_COMPANIES
    results: List[Dict[str, Any]] = []
    for org_id, (name, industry) in companies.items():
        try:
            jobs = fetch_hireology_jobs(org_id, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[hireology] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[hireology] {name} ({org_id}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[hireology] total: {len(results)} jobs\n")
    return results
