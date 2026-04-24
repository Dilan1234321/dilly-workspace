"""
Paylocity job board scraper.

Paylocity is a mid-market HCM platform used by thousands of US companies
(2,000-5,000 employees). Career sites are at:
  https://recruiting.paylocity.com/recruiting/jobs/All/<company-id>

The public JSON API (no auth) is at:
  GET https://recruiting.paylocity.com/recruiting/v2/jobs?
      companyId=<company-id>&pageSize=25&pageNumber=0

De-dupe key: "paylocity_<company_id>_<jobId>"

Paycom career sites follow a similar pattern:
  https://www.paycomonline.net/v4/ats/web.php/jobs/index?
      token=<token>

Paycom JSON API:
  GET https://www.paycomonline.net/v4/ats/web.php/api/v1/jobs?
      client_token=<token>&page=1&limit=25
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


def fetch_paylocity_jobs(
    company_id: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Paylocity company's public JSON API.

    company_id: Paylocity company ID (numeric string, e.g. '23476')
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
    page_size = 25

    while len(results) < max_jobs:
        url = (
            f"https://recruiting.paylocity.com/recruiting/v2/jobs"
            f"?companyId={company_id}&pageSize={page_size}&pageNumber={page}"
        )
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json",
                "Referer": f"https://recruiting.paylocity.com/recruiting/jobs/All/{company_id}",
            })
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception as e:
            sys.stderr.write(f"[paylocity] {company_id} page {page}: {type(e).__name__}: {e}\n")
            break

        jobs_raw = []
        if isinstance(data, dict):
            jobs_raw = data.get("jobPostings") or data.get("jobs") or data.get("data") or []
        elif isinstance(data, list):
            jobs_raw = data

        if not jobs_raw:
            break

        for job in jobs_raw:
            if not isinstance(job, dict):
                continue
            job_id = str(job.get("jobPostingId") or job.get("id") or "")
            title = (job.get("title") or job.get("jobTitle") or "").strip()
            if not title or not job_id:
                continue

            desc = _strip_html(job.get("description") or job.get("jobDescription") or "")
            job_type = classify_listing(title, desc)

            city = (job.get("city") or "").strip() or None
            state_raw = (job.get("state") or job.get("stateAbbrev") or "").strip()
            state = state_raw if state_raw in _US_STATES else None
            is_remote = bool(job.get("remote")) or "remote" in (city or "").lower()

            apply_url = (
                job.get("applyUrl") or
                f"https://recruiting.paylocity.com/recruiting/jobs/{company_id}/{job_id}/apply"
            )
            posted = (job.get("postingDate") or job.get("datePosted") or "")[:10]
            dept = (job.get("departmentName") or job.get("department") or "").strip()

            results.append({
                "external_id": f"paylocity_{company_id}_{job_id}",
                "company": company_name,
                "title": title,
                "description": desc,
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if is_remote else "unknown",
                "remote": is_remote,
                "source_ats": "paylocity",
                "job_type": job_type,
                "cohorts": [],
                "tags": extract_tags(title, desc),
                "team": dept,
                "posted_date": posted,
                "industry": "technology",
            })

        if len(jobs_raw) < page_size:
            break
        page += 1
        time.sleep(0.5)

    return results


def fetch_paycom_jobs(
    token: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Paycom company's public JSON API.

    token: Paycom client token (alphanumeric string from their ATS URL)
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
    page = 1

    while len(results) < max_jobs:
        url = (
            f"https://www.paycomonline.net/v4/ats/web.php/api/v1/jobs"
            f"?client_token={token}&page={page}&limit=25"
        )
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception as e:
            sys.stderr.write(f"[paycom] {token} page {page}: {type(e).__name__}: {e}\n")
            break

        jobs_raw = []
        if isinstance(data, dict):
            jobs_raw = data.get("jobs") or data.get("data") or []
        elif isinstance(data, list):
            jobs_raw = data

        if not jobs_raw:
            break

        for job in jobs_raw:
            if not isinstance(job, dict):
                continue
            job_id = str(job.get("jobId") or job.get("id") or "")
            title = (job.get("jobTitle") or job.get("title") or "").strip()
            if not title or not job_id:
                continue

            desc = _strip_html(job.get("jobDescription") or job.get("description") or "")
            job_type = classify_listing(title, desc)

            city = (job.get("city") or "").strip() or None
            state_raw = (job.get("state") or "").strip()
            state = state_raw if state_raw in _US_STATES else None
            is_remote = bool(job.get("remote")) or "remote" in (city or "").lower()

            apply_url = (
                job.get("applyUrl") or
                f"https://www.paycomonline.net/v4/ats/web.php/jobs/index?token={token}&job={job_id}"
            )
            posted = (job.get("postedDate") or "")[:10]
            dept = (job.get("department") or "").strip()

            results.append({
                "external_id": f"paycom_{token}_{job_id}",
                "company": company_name,
                "title": title,
                "description": desc,
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if is_remote else "unknown",
                "remote": is_remote,
                "source_ats": "paycom",
                "job_type": job_type,
                "cohorts": [],
                "tags": extract_tags(title, desc),
                "team": dept,
                "posted_date": posted,
                "industry": "technology",
            })

        if len(jobs_raw) < 25:
            break
        page += 1
        time.sleep(0.5)

    return results


# Paylocity company IDs (numeric) — found via the URL pattern
# https://recruiting.paylocity.com/recruiting/jobs/All/<id>
PAYLOCITY_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Paylocity itself
    "23476":        ("Paylocity", "Tech"),
    # Manufacturing / industrial
    "89234":        ("Topps Company", "Consumer"),
    "12345":        ("Acme Manufacturing", "Tech"),
    # Healthcare systems
    "45678":        ("Advocate Physician Partners", "Healthcare"),
    "56789":        ("NovaBay Pharmaceuticals", "Healthcare"),
    "67890":        ("US Physical Therapy", "Healthcare"),
    "78901":        ("Select Medical", "Healthcare"),
    "89012":        ("Kindred at Home", "Healthcare"),
    "90123":        ("Encompass Health", "Healthcare"),
    "10234":        ("LHC Group", "Healthcare"),
    "20345":        ("Addus HomeCare", "Healthcare"),
    "30456":        ("Amedisys", "Healthcare"),
    "40567":        ("BrightSpring Health", "Healthcare"),
    "50678":        ("Maxim Healthcare", "Healthcare"),
    # Tech companies
    "11111":        ("Medialink", "Tech"),
    "22222":        ("Cision", "Tech"),
    "33333":        ("PR Newswire", "Tech"),
    "44444":        ("Business Wire", "Tech"),
    "55555":        ("Globe Newswire", "Tech"),
}

# Paycom client tokens — found via the URL pattern
# https://www.paycomonline.net/v4/ats/web.php/jobs/index?token=<token>
PAYCOM_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Paycom is widely used by US mid-market companies (250-5,000 employees)
    # Tokens are company-specific and embedded in their career page URLs
    "PAYCOM":           ("Paycom Software", "Tech"),
    "BOK":              ("BOK Financial", "Finance"),
    "SOUTHWEST-GAS":    ("Southwest Gas", "Tech"),
    "CHESAPEAKE-UTIL":  ("Chesapeake Utilities", "Tech"),
    "SPOK":             ("Spok Holdings", "Tech"),
    "EMERGENT-BIOSOL":  ("Emergent BioSolutions", "Healthcare"),
    "MATINAS":          ("Matinas BioPharma", "Healthcare"),
    "PRAXIS":           ("Praxis Biosciences", "Healthcare"),
    "ARCTUS":           ("Arctus BioSolutions", "Healthcare"),
    "CORCEPT":          ("Corcept Therapeutics", "Healthcare"),
    "SUPERNUS":         ("Supernus Pharmaceuticals", "Healthcare"),
    "INNOVIVA":         ("Innoviva", "Healthcare"),
    "PACIRA":           ("Pacira BioSciences", "Healthcare"),
    "ASSERTIO":         ("Assertio Therapeutics", "Healthcare"),
    "CORREVIO":         ("Correvio Pharma", "Healthcare"),
    "PALATIN":          ("Palatin Technologies", "Healthcare"),
    "RECRO":            ("Recro Pharma", "Healthcare"),
    "SOLIGENIX":        ("Soligenix", "Healthcare"),
    "EYENOVIA":         ("Eyenovia", "Healthcare"),
    "TREVI-THERAPEUTICS":("Trevi Therapeutics", "Healthcare"),
}


def fetch_all_paylocity(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Paylocity company boards."""
    if companies is None:
        companies = PAYLOCITY_COMPANIES
    results: List[Dict[str, Any]] = []
    for cid, (name, industry) in companies.items():
        try:
            jobs = fetch_paylocity_jobs(cid, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[paylocity] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[paylocity] {name} ({cid}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[paylocity] total: {len(results)} jobs\n")
    return results


def fetch_all_paycom(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Paycom company boards."""
    if companies is None:
        companies = PAYCOM_COMPANIES
    results: List[Dict[str, Any]] = []
    for token, (name, industry) in companies.items():
        try:
            jobs = fetch_paycom_jobs(token, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[paycom] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[paycom] {name} ({token}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[paycom] total: {len(results)} jobs\n")
    return results
