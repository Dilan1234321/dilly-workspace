"""
UKG (Ultimate Kronos Group) / Dayforce job board scraper.

UKG (UKG Pro formerly UltiPro, UKG Ready formerly Kronos) is widely used
in healthcare, manufacturing, hospitality, and retail.

UKG Pro career sites are at:
  https://recruiting.ultipro.com/<company_code>/<job_code>/

The public XML/JSON feed is at:
  GET https://recruiting.ultipro.com/xml/<company_code>

Dayforce (Ceridian) career sites:
  https://jobs.dayforcehcm.com/<company_id>/en-US/Careers

Dayforce JSON API (no auth):
  GET https://jobs.dayforcehcm.com/api/<company_id>/Careers/GetJobPostings

De-dupe key: "ukg_<company>_<jobId>" or "dayforce_<company>_<jobId>"
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
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


def fetch_ukg_jobs(
    company_code: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a UKG Pro (UltiPro) tenant via their XML feed.

    company_code: the UltiPro company code (e.g. 'HCRTX', 'MCNCO')
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

    # UKG Pro XML feed
    url = f"https://recruiting.ultipro.com/xml/{company_code}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            raw_xml = resp.read().decode("utf-8", errors="replace")
        root = ET.fromstring(raw_xml)
        jobs_el = root.findall(".//job") or root.findall(".//Job") or root.findall(".//position")
    except Exception as e:
        sys.stderr.write(f"[ukg] {company_code}: XML fetch failed: {type(e).__name__}: {e}\n")
        return []

    for job in jobs_el[:max_jobs]:
        def _text(tag: str) -> str:
            for t in [tag, tag.lower(), tag.upper(), tag.title()]:
                el = job.find(t)
                if el is not None:
                    return (el.text or "").strip()
            return ""

        job_id = _text("RequisitionId") or _text("JobId") or _text("id") or _text("Id")
        title = _text("JobTitle") or _text("Title") or _text("title")
        if not title or not job_id:
            continue

        desc = _strip_html(_text("JobDescription") or _text("description") or "")
        job_type = classify_listing(title, desc)

        location = _text("Location") or _text("City") or ""
        city, state, is_remote = _parse_location(location)

        apply_url = _text("ApplyUrl") or _text("Url") or f"https://recruiting.ultipro.com/{company_code}"
        posted = (_text("PostedDate") or _text("DatePosted") or "")[:10]
        dept = _text("Department") or _text("Category") or ""

        results.append({
            "external_id": f"ukg_{company_code}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "ukg",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


def fetch_dayforce_jobs(
    company_id: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Ceridian Dayforce tenant via their public JSON API.

    company_id: the Dayforce company identifier string (e.g. '1234567')
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

    url = f"https://jobs.dayforcehcm.com/api/{company_id}/Careers/GetJobPostings"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[dayforce] {company_id}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("Data", data.get("jobs", []))

    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("JobPostingId") or job.get("RequisitionId") or job.get("Id") or "")
        title = (job.get("Title") or job.get("JobTitle") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("Description") or job.get("JobDescription") or "")
        job_type = classify_listing(title, desc)

        loc_str = (
            job.get("City") or job.get("Location") or job.get("LocationName") or ""
        ).strip()
        state_raw = (job.get("State") or job.get("StateCode") or "").strip()
        city = loc_str or None
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in (loc_str or "").lower() or "remote" in title.lower()

        apply_url = (
            job.get("ApplyUrl") or
            f"https://jobs.dayforcehcm.com/{company_id}/en-US/Careers/JobDetail/{job_id}"
        )
        posted = (job.get("PostedDate") or job.get("DatePosted") or "")[:10]
        dept = (job.get("Department") or job.get("Category") or "").strip()

        results.append({
            "external_id": f"dayforce_{company_id}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "dayforce",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


# UKG Pro company codes (alphanumeric, not subdomains)
# Lookup: https://recruiting.ultipro.com/xml/<code>
UKG_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Healthcare — UKG is dominant in hospital staffing
    "HCAHLT":       ("HCA Healthcare", "Healthcare"),
    "ADVENTL":      ("AdventHealth", "Healthcare"),
    "COMMNS":       ("CommonSpirit Health", "Healthcare"),
    "ASCENS":       ("Ascension Health", "Healthcare"),
    "TENET1":       ("Tenet Healthcare", "Healthcare"),
    "LPHLTH":       ("LifePoint Health", "Healthcare"),
    "PRMH01":       ("Prime Healthcare", "Healthcare"),
    "STEWAR":       ("Steward Health Care", "Healthcare"),
    "EMRCHS":       ("EMHS/Northern Light", "Healthcare"),
    "MTRCHM":       ("Multicare Health System", "Healthcare"),
    "OHSYST":       ("Ochsner Health", "Healthcare"),
    "LHSCSC":       ("LHS Community", "Healthcare"),
    "EMCARE":       ("EmCare/Envision", "Healthcare"),
    "TEAMHE":       ("TeamHealth", "Healthcare"),
    "NUVECR":       ("Nuvance Health", "Healthcare"),
    "TRIHLTH":      ("TriHealth", "Healthcare"),
    "WVUMED":       ("WVU Medicine", "Healthcare"),
    "MSYCH1":       ("Mary Washington Healthcare", "Healthcare"),
    "CHSNWK":       ("ChristianaCare", "Healthcare"),
    "UMRYLND":      ("University of Maryland Medical", "Healthcare"),
    # Hospitality / restaurants — heavy UKG users
    "HILTON":       ("Hilton", "Consumer"),
    "MARRIOT":      ("Marriott Hotels", "Consumer"),
    "IHG":          ("IHG Hotels", "Consumer"),
    "WYNDMH":       ("Wyndham Hotels", "Consumer"),
    "CHSCRT":       ("Choice Hotels", "Consumer"),
    "BESTWY":       ("Best Western", "Consumer"),
    "RADSSN":       ("Radisson Hotels", "Consumer"),
    "ACCRNT":       ("Accor Hotels", "Consumer"),
    "DOMINO":       ("Domino's Pizza", "Consumer"),
    "YUM1":         ("Yum! Brands", "Consumer"),
    "SBWAYG":       ("Subway", "Consumer"),
    "DUNKIN":       ("Dunkin'", "Consumer"),
    "BSKROB":       ("Baskin-Robbins", "Consumer"),
    "PAPAJN":       ("Papa John's", "Consumer"),
    "LITTLZ":       ("Little Caesars", "Consumer"),
    # Retail / CPG
    "TARGET":       ("Target", "Consumer"),
    "DOLGEN":       ("Dollar General", "Consumer"),
    "DOLRTG":       ("Dollar Tree", "Consumer"),
    "FIVBLW":       ("Five Below", "Consumer"),
    "GAMEST":       ("GameStop", "Consumer"),
    "AUTZON":       ("AutoZone", "Consumer"),
    "ADVAUT":       ("Advance Auto Parts", "Consumer"),
    "OREIYL":       ("O'Reilly Auto", "Consumer"),
    "PETZNT":       ("Petco", "Consumer"),
    "PETSMR":       ("PetSmart", "Consumer"),
    "MICHAELS":     ("Michaels", "Consumer"),
    "JOANNS":       ("JOANN", "Consumer"),
    "HBYLBY":       ("Hobby Lobby", "Consumer"),
    "ARMTAY":       ("Armani Exchange", "Consumer"),
    "ANNTYL":       ("Ann Taylor", "Consumer"),
    "LORENA":       ("Loft", "Consumer"),
    # Manufacturing / industrial
    "PARKER":       ("Parker Hannifin", "Tech"),
    "EMRSNL":       ("Emerson Electric", "Tech"),
    "HONWEL":       ("Honeywell", "Tech"),
    "DOVERP":       ("Dover Corporation", "Tech"),
    "LTITEK":       ("Illinois Tool Works", "Tech"),
    "XYLEM1":       ("Xylem", "Tech"),
    "GRAFCO":       ("Graco", "Tech"),
    "NORDSO":       ("Nordson", "Tech"),
    "AMETEK":       ("AMETEK", "Tech"),
    "ROPTEC":       ("Roper Technologies", "Tech"),
}

DAYFORCE_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Ceridian Dayforce company IDs
    "ceridian":         ("Ceridian", "Tech"),
    "dayforce":         ("Dayforce/Ceridian", "Tech"),
    "schneider":        ("Schneider National", "Consumer"),
    "werner":           ("Werner Enterprises", "Consumer"),
    "jbhunt":           ("J.B. Hunt Transport", "Consumer"),
    "swift":            ("Swift Transportation", "Consumer"),
    "knight":           ("Knight-Swift", "Consumer"),
    "landstar":         ("Landstar System", "Consumer"),
    "heartland":        ("Heartland Express", "Consumer"),
    "marten":           ("Marten Transport", "Consumer"),
    "covenant":         ("Covenant Transport", "Consumer"),
    "usfreightways":    ("USFreightways", "Consumer"),
    "vitran":           ("Vitran", "Consumer"),
    "tfsi":             ("TFI International", "Consumer"),
    "transforce":       ("Transforce", "Consumer"),
    "loblaws":          ("Loblaw Companies", "Consumer"),
    "sobeys":           ("Sobeys", "Consumer"),
    "empire-company":   ("Empire Company", "Consumer"),
    "metro-inc":        ("Metro Inc.", "Consumer"),
    "canadian-tire":    ("Canadian Tire", "Consumer"),
    "tim-hortons":      ("Tim Hortons", "Consumer"),
    "rona":             ("RONA", "Consumer"),
    "jean-coutu":       ("Jean Coutu", "Consumer"),
    "shoppers":         ("Shoppers Drug Mart", "Consumer"),
    "dollarama":        ("Dollarama", "Consumer"),
    "winners":          ("Winners/TJX Canada", "Consumer"),
    "marshalls-ca":     ("Marshalls Canada", "Consumer"),
    "homesense":        ("HomeSense", "Consumer"),
    "sportchek":        ("Sport Chek", "Consumer"),
    "mark-work":        ("Mark's Work Wearhouse", "Consumer"),
}


def fetch_all_ukg(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured UKG Pro tenants."""
    if companies is None:
        companies = UKG_COMPANIES
    results: List[Dict[str, Any]] = []
    for code, (name, industry) in companies.items():
        try:
            jobs = fetch_ukg_jobs(code, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[ukg] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[ukg] {name} ({code}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[ukg] total: {len(results)} jobs\n")
    return results


def fetch_all_dayforce(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Dayforce tenants."""
    if companies is None:
        companies = DAYFORCE_COMPANIES
    results: List[Dict[str, Any]] = []
    for cid, (name, industry) in companies.items():
        try:
            jobs = fetch_dayforce_jobs(cid, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[dayforce] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[dayforce] {name} ({cid}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[dayforce] total: {len(results)} jobs\n")
    return results
