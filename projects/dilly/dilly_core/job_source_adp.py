"""
ADP Recruiting / TotalSource job board scraper.

ADP is one of the largest HR/payroll providers. Their recruiting module
exposes a public JSON feed for job postings. ADP job boards are at:

  https://jobs.adp.com/<company-slug>/
  or
  https://jobs.adp.com/jobs/?company=<company-id>

The public API endpoint (no auth) is:
  GET https://jobs.adp.com/api/jobs/search?company=<company>&page=0&size=25

or via the consolidated XML at:
  GET https://api.adp.com/staffing/v2/job-requisitions  (needs OAuth — skip)

Better: use the ADP Career Center public widget JSON:
  GET https://jobs.adp.com/api/v1/jobs?clientId=<clientId>&locale=en_US&size=25&page=0

De-dupe key: "adp_<company>_<jobId>"
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


def fetch_adp_jobs(
    client_id: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from ADP Career Center via public widget JSON API.

    client_id: the ADP client identifier for the company
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
    size = 25

    while len(results) < max_jobs:
        # Try multiple ADP URL patterns
        urls = [
            f"https://jobs.adp.com/api/v1/jobs?clientId={client_id}&locale=en_US&size={size}&page={page}",
            f"https://jobs.adp.com/jobs/search?company={client_id}&page={page}&size={size}",
        ]
        data = None
        for url in urls:
            try:
                req = urllib.request.Request(url, headers={
                    "User-Agent": _USER_AGENT,
                    "Accept": "application/json",
                })
                with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                    data = json.loads(resp.read().decode("utf-8", errors="replace"))
                if data:
                    break
            except Exception:
                continue

        if not data:
            break

        jobs_raw = []
        if isinstance(data, dict):
            jobs_raw = (
                data.get("jobs") or data.get("jobPostings") or
                data.get("content") or data.get("results") or []
            )
        elif isinstance(data, list):
            jobs_raw = data

        if not jobs_raw:
            break

        for job in jobs_raw:
            if not isinstance(job, dict):
                continue
            job_id = str(job.get("id") or job.get("jobId") or job.get("requisitionId") or "")
            title = (job.get("title") or job.get("jobTitle") or "").strip()
            if not title or not job_id:
                continue

            desc = _strip_html(job.get("description") or job.get("jobDescription") or "")
            job_type = classify_listing(title, desc)

            city = (job.get("city") or job.get("location") or "").strip() or None
            state_raw = (job.get("state") or job.get("stateCode") or "").strip()
            state = state_raw if state_raw in _US_STATES else None
            is_remote = "remote" in (city or "").lower() or "remote" in title.lower()

            apply_url = (
                job.get("applyUrl") or job.get("url") or
                f"https://jobs.adp.com/jobs/{job_id}"
            )
            posted = (job.get("postedDate") or job.get("datePosted") or "")[:10]
            dept = (job.get("department") or job.get("category") or "").strip()

            results.append({
                "external_id": f"adp_{client_id}_{job_id}",
                "company": company_name,
                "title": title,
                "description": desc,
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if is_remote else "unknown",
                "remote": is_remote,
                "source_ats": "adp",
                "job_type": job_type,
                "cohorts": [],
                "tags": extract_tags(title, desc),
                "team": dept,
                "posted_date": posted,
                "industry": "technology",
            })

        if len(jobs_raw) < size:
            break
        page += 1
        time.sleep(0.5)

    return results


ADP_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Major ADP TotalSource / Workforce Now clients
    # ADP is used heavily by mid-market to enterprise companies in
    # retail, healthcare, manufacturing, and logistics
    "adp":                  ("ADP", "Tech"),
    "mckesson":             ("McKesson", "Healthcare"),
    "cardinal-health":      ("Cardinal Health", "Healthcare"),
    "amerisource":          ("AmerisourceBergen", "Healthcare"),
    "owens-minor":          ("Owens & Minor", "Healthcare"),
    "medline":              ("Medline Industries", "Healthcare"),
    "henry-schein":         ("Henry Schein", "Healthcare"),
    "patterson-companies":  ("Patterson Companies", "Healthcare"),
    "covetrus":             ("Covetrus", "Healthcare"),
    "petsmart-distribution":("PetSmart Distribution", "Consumer"),
    "sysco":                ("Sysco", "Consumer"),
    "us-foods":             ("US Foods", "Consumer"),
    "performance-food":     ("Performance Food Group", "Consumer"),
    "gordon-food":          ("Gordon Food Service", "Consumer"),
    "shamrock-foods":       ("Shamrock Foods", "Consumer"),
    "associated-wholesale": ("Associated Wholesale Grocers", "Consumer"),
    "spartan-nash":         ("SpartanNash", "Consumer"),
    "c-and-s-wholesale":    ("C&S Wholesale Grocers", "Consumer"),
    "mclane-company":       ("McLane Company", "Consumer"),
    "nash-finch":           ("Nash Finch", "Consumer"),
    "quality-food":         ("Quality Food Centers", "Consumer"),
    "roundys":              ("Roundy's", "Consumer"),
    "stater-bros":          ("Stater Bros.", "Consumer"),
    "giant-eagle":          ("Giant Eagle", "Consumer"),
    "weis-markets":         ("Weis Markets", "Consumer"),
    "ingles-markets":       ("Ingles Markets", "Consumer"),
    "fresh-market":         ("Fresh Market", "Consumer"),
    "sprouts":              ("Sprouts Farmers Market", "Consumer"),
    "earth-fare":           ("Earth Fare", "Consumer"),
    "natural-grocers":      ("Natural Grocers", "Consumer"),
    # Building / construction
    "lennar":               ("Lennar", "Tech"),
    "dr-horton":            ("D.R. Horton", "Tech"),
    "pulte":                ("PulteGroup", "Tech"),
    "nvryan":               ("NVR/Ryan Homes", "Tech"),
    "meritage-homes":       ("Meritage Homes", "Tech"),
    "century-communities":  ("Century Communities", "Tech"),
    "smith-douglas":        ("Smith Douglas Homes", "Tech"),
    "beazer-homes":         ("Beazer Homes", "Tech"),
    "green-brick":          ("Green Brick Partners", "Tech"),
    "forestar":             ("Forestar Group", "Tech"),
    "taylor-morrison":      ("Taylor Morrison", "Tech"),
    "kb-home":              ("KB Home", "Consumer"),
    "william-lyon":         ("William Lyon Homes", "Tech"),
    "tri-pointe":           ("Tri Pointe Homes", "Tech"),
    # Financial services
    "ameriprise":           ("Ameriprise Financial", "Finance"),
    "raymond-james":        ("Raymond James", "Finance"),
    "edward-jones":         ("Edward Jones", "Finance"),
    "lpl-financial":        ("LPL Financial", "Finance"),
    "stifel":               ("Stifel Financial", "Finance"),
    "baird":                ("Baird", "Finance"),
    "piper-sandler":        ("Piper Sandler", "Finance"),
    "wfa":                  ("Wells Fargo Advisors", "Finance"),
    "merrill-lynch":        ("Merrill Lynch/BofA", "Finance"),
    "ubs-wealth":           ("UBS Wealth Management", "Finance"),
    "morgan-stanley-fa":    ("Morgan Stanley FA", "Finance"),
    "fidelity-investments": ("Fidelity Investments", "Finance"),
    "vanguard":             ("Vanguard", "Finance"),
    "tiaa":                 ("TIAA", "Finance"),
    "pimco":                ("PIMCO", "Finance"),
    "invesco":              ("Invesco", "Finance"),
    "franklin-templeton":   ("Franklin Templeton", "Finance"),
    "t-rowe-price":         ("T. Rowe Price", "Finance"),
    "legg-mason":           ("Legg Mason", "Finance"),
    "nuveen":               ("Nuveen", "Finance"),
    "calvert":              ("Calvert", "Finance"),
    "northern-trust":       ("Northern Trust", "Finance"),
    "brown-brothers":       ("Brown Brothers Harriman", "Finance"),
    "manning-napier":       ("Manning & Napier", "Finance"),
}


def fetch_all_adp(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured ADP company boards."""
    if companies is None:
        companies = ADP_COMPANIES

    results: List[Dict[str, Any]] = []
    for client_id, (name, industry) in companies.items():
        try:
            jobs = fetch_adp_jobs(client_id, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[adp] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[adp] {name} ({client_id}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[adp] total: {len(results)} jobs from configured companies\n")
    return results
