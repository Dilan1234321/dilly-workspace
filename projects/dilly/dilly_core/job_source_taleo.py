"""
Oracle Taleo job board scraper.

Taleo is widely used by large enterprises (AT&T, Ford, Comcast, FedEx,
UPS, many banks, federal contractors). Each company has a tenant at:

  https://<company>.taleo.net/careersection/<section>/jobsearch.ftl

The public JSON API (no auth) is at:
  POST https://<company>.taleo.net/careersection/rest/jobboard/job/list
  Body: {"multiLanguage":false,"searchText":"","pageSize":25,"pageNo":0}

OR the simpler RS endpoint:
  GET https://<company>.taleo.net/careersection/rest/jobboard/job/list?
      jobFamily=&site=<site>&sortField=POSTING_DATE&sortOrder=DESC&pageSize=25&pageNo=0

de-dupe key: "taleo_<tenant>_<jobId>"
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
_TIMEOUT = 25

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


def fetch_taleo_jobs(tenant: str, company_name: str, site: str = "External", max_jobs: int = 200) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Taleo tenant via their public REST endpoint.

    tenant: the Taleo subdomain (e.g. 'att', 'ford', 'fedex')
    site: the career section name (commonly 'External', 'CampusStudentInternship', etc.)
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
    page = 0
    per_page = 25

    while len(results) < max_jobs:
        url = (
            f"https://{tenant}.taleo.net/careersection/rest/jobboard/job/list"
            f"?site={site}&sortField=POSTING_DATE&sortOrder=DESC"
            f"&pageSize={per_page}&pageNo={page}"
        )
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest",
            })
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception as e:
            sys.stderr.write(f"[taleo] {tenant} page {page}: {type(e).__name__}: {e}\n")
            break

        jobs_raw: List[Dict] = []
        if isinstance(data, dict):
            jobs_raw = (
                data.get("requisitionList") or
                data.get("jobs") or
                data.get("jobList") or
                []
            )
        elif isinstance(data, list):
            jobs_raw = data

        if not jobs_raw:
            break

        for job in jobs_raw:
            job_id = str(job.get("contestNo") or job.get("jobId") or job.get("id") or "")
            title = (job.get("title") or job.get("jobTitle") or "").strip()
            if not title or not job_id:
                continue

            desc = _strip_html(job.get("description") or job.get("jobDescription") or "")
            job_type = classify_listing(title, desc)

            loc_parts = []
            for k in ("city", "location", "locationDesc", "locationCode"):
                v = job.get(k)
                if v:
                    loc_parts.append(str(v).strip())
            loc_str = ", ".join(loc_parts[:2])
            city, state, is_remote = _parse_location(loc_str)

            apply_url = (
                job.get("applyUrl") or
                f"https://{tenant}.taleo.net/careersection/{site}/jobdetail.ftl?job={job_id}"
            )
            posted = (job.get("postingDate") or job.get("postedDate") or "")[:10]
            dept = (job.get("jobFamily") or job.get("department") or "").strip()

            results.append({
                "external_id": f"taleo_{tenant}_{job_id}",
                "company": company_name,
                "title": title,
                "description": desc,
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if is_remote else "unknown",
                "remote": is_remote,
                "source_ats": "taleo",
                "job_type": job_type,
                "cohorts": [],
                "tags": extract_tags(title, desc),
                "team": dept,
                "posted_date": posted,
                "industry": "technology",
            })

        if len(jobs_raw) < per_page:
            break
        page += 1
        time.sleep(0.5)

    return results


# Known Taleo tenant subdomains. Format: tenant → (display_name, industry, site_override)
# site_override=None means use the default "External" section.
TALEO_COMPANIES: Dict[str, Tuple[str, str, Optional[str]]] = {
    # Telecom
    "att":              ("AT&T", "Tech", None),
    "verizon":          ("Verizon", "Tech", None),
    "comcast":          ("Comcast", "Media", None),
    "tmobile":          ("T-Mobile", "Tech", None),
    "charter":          ("Charter Communications", "Media", None),
    "centurylink":      ("CenturyLink/Lumen", "Tech", None),
    "frontier":         ("Frontier Communications", "Tech", None),
    "windstream":       ("Windstream", "Tech", None),
    "zayo":             ("Zayo Group", "Tech", None),
    # Logistics / shipping
    "fedex":            ("FedEx", "Consumer", None),
    "ups":              ("UPS", "Consumer", None),
    "xpo":              ("XPO Logistics", "Consumer", None),
    "werner":           ("Werner Enterprises", "Consumer", None),
    "estes":            ("Estes Express", "Consumer", None),
    "landstar":         ("Landstar", "Consumer", None),
    "ryder":            ("Ryder System", "Consumer", None),
    "penske":           ("Penske", "Consumer", None),
    # Automotive
    "ford":             ("Ford Motor Company", "Tech", None),
    "gm":               ("General Motors", "Tech", None),
    "fca":              ("Stellantis", "Tech", None),
    "mopar":            ("Mopar/Stellantis", "Tech", None),
    "toyota":           ("Toyota", "Tech", None),
    "honda":            ("Honda", "Tech", None),
    "bmw":              ("BMW", "Tech", None),
    "mercedes-benz":    ("Mercedes-Benz", "Tech", None),
    "vw":               ("Volkswagen Group", "Tech", None),
    "autozone":         ("AutoZone", "Consumer", None),
    "oreilly":          ("O'Reilly Auto Parts", "Consumer", None),
    "advance-auto":     ("Advance Auto Parts", "Consumer", None),
    "napa":             ("NAPA Auto Parts", "Consumer", None),
    # Energy / utilities
    "chevron":          ("Chevron", "Tech", None),
    "conocophillips":   ("ConocoPhillips", "Tech", None),
    "marathon":         ("Marathon Oil", "Tech", None),
    "phillips66":       ("Phillips 66", "Tech", None),
    "valero":           ("Valero Energy", "Tech", None),
    "hess":             ("Hess Corporation", "Tech", None),
    "pioneer":          ("Pioneer Natural Resources", "Tech", None),
    "schlumberger":     ("SLB (Schlumberger)", "Tech", None),
    "halliburton":      ("Halliburton", "Tech", None),
    "baker-hughes":     ("Baker Hughes", "Tech", None),
    "weatherford":      ("Weatherford", "Tech", None),
    "nexteraenergy":    ("NextEra Energy", "Tech", None),
    "duke-energy":      ("Duke Energy", "Tech", None),
    "dominion":         ("Dominion Energy", "Tech", None),
    "entergy":          ("Entergy", "Tech", None),
    "exelon":           ("Exelon", "Tech", None),
    "pg-e":             ("PG&E", "Tech", None),
    "sce":              ("Southern California Edison", "Tech", None),
    "con-ed":           ("Con Edison", "Tech", None),
    "national-grid":    ("National Grid", "Tech", None),
    # Finance / banking
    "jpmorgan":         ("JPMorgan Chase", "Finance", None),
    "citi":             ("Citi", "Finance", None),
    "bankofamerica":    ("Bank of America", "Finance", None),
    "wellsfargo":       ("Wells Fargo", "Finance", None),
    "usbank":           ("U.S. Bank", "Finance", None),
    "pnc":              ("PNC Financial", "Finance", None),
    "regions":          ("Regions Financial", "Finance", None),
    "truist":           ("Truist Financial", "Finance", None),
    "huntington":       ("Huntington National Bank", "Finance", None),
    "citizens":         ("Citizens Financial", "Finance", None),
    "fifth-third":      ("Fifth Third Bank", "Finance", None),
    "keybank":          ("KeyBank", "Finance", None),
    "m-and-t":          ("M&T Bank", "Finance", None),
    "suntrust":         ("SunTrust (Truist)", "Finance", None),
    "bbandt":           ("BB&T (Truist)", "Finance", None),
    "svb":              ("Silicon Valley Bank", "Finance", None),
    "first-republic":   ("First Republic Bank", "Finance", None),
    "nycb":             ("NYCB", "Finance", None),
    "signature-bank":   ("Signature Bank", "Finance", None),
    # Healthcare / hospital
    "hca":              ("HCA Healthcare", "Healthcare", None),
    "uhc":              ("UnitedHealth Group", "Healthcare", None),
    "cigna":            ("Cigna", "Healthcare", None),
    "aetna":            ("Aetna/CVS", "Healthcare", None),
    "humana":           ("Humana", "Healthcare", None),
    "anthem":           ("Anthem/Elevance", "Healthcare", None),
    "bcbs":             ("BCBS", "Healthcare", None),
    "centene":          ("Centene", "Healthcare", None),
    "molina":           ("Molina Healthcare", "Healthcare", None),
    "cvs":              ("CVS Health", "Healthcare", None),
    "walgreens":        ("Walgreens Boots Alliance", "Healthcare", None),
    "rite-aid":         ("Rite Aid", "Healthcare", None),
    # Manufacturing / industrial
    "ge":               ("GE", "Tech", None),
    "honeywell":        ("Honeywell", "Tech", None),
    "3m":               ("3M", "Tech", None),
    "caterpillar":      ("Caterpillar", "Tech", None),
    "deere":            ("John Deere", "Tech", None),
    "parker":           ("Parker Hannifin", "Tech", None),
    "emerson":          ("Emerson Electric", "Tech", None),
    "illinois-tool":    ("Illinois Tool Works", "Tech", None),
    "dover":            ("Dover Corporation", "Tech", None),
    "danaher":          ("Danaher", "Tech", None),
    "roper":            ("Roper Technologies", "Tech", None),
    "xylem":            ("Xylem", "Tech", None),
    "watts":            ("Watts Water", "Tech", None),
    "graco":            ("Graco", "Tech", None),
    "nordson":          ("Nordson", "Tech", None),
    "ametek":           ("AMETEK", "Tech", None),
    "rexnord":          ("Rexnord", "Tech", None),
    # Defense / aerospace
    "boeing":           ("Boeing", "Tech", None),
    "lockheed":         ("Lockheed Martin", "Tech", None),
    "rtx":              ("RTX (Raytheon)", "Tech", None),
    "northrop-grumman": ("Northrop Grumman", "Tech", None),
    "generaldynamics":  ("General Dynamics", "Tech", None),
    "l3harris":         ("L3Harris", "Tech", None),
    "bae-careers":      ("BAE Systems", "Tech", None),
    "textron":          ("Textron", "Tech", None),
    "leidos":           ("Leidos", "Government", None),
    "saic":             ("SAIC", "Government", None),
    # Retail
    "kroger":           ("Kroger", "Consumer", None),
    "albertsons":       ("Albertsons", "Consumer", None),
    "safeway":          ("Safeway", "Consumer", None),
    "target":           ("Target", "Consumer", None),
    "bestbuy":          ("Best Buy", "Consumer", None),
    "lowes":            ("Lowe's", "Consumer", None),
    "homedepot":        ("Home Depot", "Consumer", None),
    "sears":            ("Sears", "Consumer", None),
    "macys":            ("Macy's", "Consumer", None),
    "nordstromjobs":    ("Nordstrom", "Consumer", None),
}


def fetch_all_taleo(
    companies: Optional[Dict[str, Tuple[str, str, Optional[str]]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from all configured Taleo tenants.
    Returns a flat list of normalized listing dicts.
    """
    if companies is None:
        companies = TALEO_COMPANIES

    results: List[Dict[str, Any]] = []
    for tenant, (name, industry, site) in companies.items():
        site_name = site or "External"
        try:
            jobs = fetch_taleo_jobs(tenant, name, site=site_name, max_jobs=max_per_company)
            results.extend(jobs)
            sys.stderr.write(f"[taleo] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[taleo] {name} ({tenant}): {type(e).__name__}: {e}\n")
        time.sleep(0.5)

    sys.stderr.write(f"[taleo] total: {len(results)} jobs from {len(companies)} tenants\n")
    return results
