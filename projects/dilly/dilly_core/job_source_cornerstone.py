"""
Cornerstone OnDemand job board scraper.

Cornerstone OnDemand (CSOD) is a large enterprise LMS+ATS used by many
Fortune 500 companies (particularly retail, healthcare, manufacturing,
government contractors). Each tenant has a career site at:

  https://<company>.csod.com/ux/ats/careersite/<id>/home
  or
  https://<company>.taleo.net  (Taleo-powered in some cases)

The public RSS/XML feed for CSOD is at:
  GET https://<company>.csod.com/rss/jobs.aspx

The JSON API (widget endpoint, no auth) is:
  GET https://<company>.csod.com/services/api/ats/job/getJobs
    ?careerSiteId=<id>&culture=en-US&countryCodes=US

De-dupe key: "csod_<company>_<jobId>"
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


def fetch_cornerstone_jobs(
    company: str,
    company_name: str,
    career_site_id: int = 1,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Cornerstone OnDemand tenant via their RSS feed
    and JSON API widget endpoint.

    company: the CSOD subdomain slug (e.g. 'mcdonalds', 'walmart')
    career_site_id: the internal career site ID (usually 1 or 2)
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

    # Strategy 1: Try JSON API widget endpoint
    for site_id in [career_site_id, 1, 2, 3]:
        url = (
            f"https://{company}.csod.com/services/api/ats/job/getJobs"
            f"?careerSiteId={site_id}&culture=en-US&countryCodes=US"
        )
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest",
            })
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
            jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("requisitions", []))
            if jobs_raw:
                break
        except Exception:
            jobs_raw = []
        time.sleep(0.3)

    # Strategy 2: Try RSS feed
    if not jobs_raw:
        rss_url = f"https://{company}.csod.com/rss/jobs.aspx"
        try:
            req = urllib.request.Request(rss_url, headers={"User-Agent": _USER_AGENT})
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                raw_xml = resp.read().decode("utf-8", errors="replace")
            root = ET.fromstring(raw_xml)
            items = root.findall(".//item")
            for item in items[:max_jobs]:
                def _text(tag: str) -> str:
                    el = item.find(tag)
                    return (el.text or "").strip() if el is not None else ""
                title = _text("title")
                link = _text("link") or _text("guid")
                if not title:
                    continue
                desc = _strip_html(_text("description"))
                job_type = classify_listing(title, desc)
                location = _text("{http://jobposting.org/schema}location") or _text("location") or ""
                city, state, is_remote = _parse_location(location)
                results.append({
                    "external_id": f"csod_{company}_{link.split('=')[-1] if '=' in link else hash(title)}",
                    "company": company_name,
                    "title": title,
                    "description": desc,
                    "apply_url": link or f"https://{company}.csod.com/ux/ats/careersite/{career_site_id}/home",
                    "location_city": city,
                    "location_state": state,
                    "work_mode": "remote" if is_remote else "unknown",
                    "remote": is_remote,
                    "source_ats": "cornerstone",
                    "job_type": job_type,
                    "cohorts": [],
                    "tags": extract_tags(title, desc),
                    "team": "",
                    "posted_date": _text("pubDate")[:10] if _text("pubDate") else "",
                    "industry": "technology",
                })
        except Exception as e:
            sys.stderr.write(f"[csod] {company} RSS failed: {type(e).__name__}: {e}\n")
        return results

    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("Id") or job.get("id") or job.get("jobId") or "")
        title = (job.get("Title") or job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("Description") or job.get("description") or "")
        job_type = classify_listing(title, desc)

        loc_str = (
            job.get("Location") or job.get("location") or
            job.get("City") or job.get("city") or ""
        ).strip()
        city, state, is_remote = _parse_location(loc_str)

        apply_url = (
            job.get("ApplyUrl") or job.get("applyUrl") or
            f"https://{company}.csod.com/ux/ats/careersite/{career_site_id}/requisition/{job_id}"
        )
        posted = (job.get("PostedDate") or job.get("postedDate") or job.get("DatePosted") or "")[:10]
        dept = (job.get("Department") or job.get("department") or "").strip()

        results.append({
            "external_id": f"csod_{company}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "cornerstone",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


CORNERSTONE_COMPANIES: Dict[str, Tuple[str, str, int]] = {
    # Format: tenant → (display_name, industry, career_site_id)
    # Retail / restaurants
    "mcdonalds":        ("McDonald's", "Consumer", 1),
    "wendys":           ("Wendy's", "Consumer", 1),
    "darden":           ("Darden Restaurants", "Consumer", 1),
    "panerabread":      ("Panera Bread", "Consumer", 1),
    "burgerking":       ("Burger King", "Consumer", 1),
    "wingstop":         ("Wingstop", "Consumer", 1),
    "jackinthebox":     ("Jack in the Box", "Consumer", 1),
    "whataburger":      ("Whataburger", "Consumer", 1),
    "sonic":            ("Sonic Drive-In", "Consumer", 1),
    "culvers":          ("Culver's", "Consumer", 1),
    "chickfila":        ("Chick-fil-A", "Consumer", 1),
    "panda":            ("Panda Express", "Consumer", 1),
    "chipotle":         ("Chipotle", "Consumer", 1),
    "moes":             ("Moe's Southwest Grill", "Consumer", 1),
    "qdoba":            ("QDOBA", "Consumer", 1),
    "tacobell":         ("Taco Bell", "Consumer", 1),
    "pizzahut":         ("Pizza Hut", "Consumer", 1),
    "kfc":              ("KFC", "Consumer", 1),
    "longjohnsilvers":  ("Long John Silver's", "Consumer", 1),
    "arbys":            ("Arby's", "Consumer", 1),
    "five-guys":        ("Five Guys", "Consumer", 1),
    "shake-shack":      ("Shake Shack", "Consumer", 1),
    "in-n-out":         ("In-N-Out Burger", "Consumer", 1),
    "firehouse-subs":   ("Firehouse Subs", "Consumer", 1),
    "jimmyjohns":       ("Jimmy John's", "Consumer", 1),
    "jerseymikes":      ("Jersey Mike's", "Consumer", 1),
    "subway":           ("Subway", "Consumer", 1),
    "schlotzkys":       ("Schlotzsky's", "Consumer", 1),
    "mcalister":        ("McAlister's Deli", "Consumer", 1),
    "jason":            ("Jason's Deli", "Consumer", 1),
    "potbelly":         ("Potbelly", "Consumer", 1),
    "wawa":             ("Wawa", "Consumer", 1),
    "sheetz":           ("Sheetz", "Consumer", 1),
    "caseys":           ("Casey's", "Consumer", 1),
    "maverick":         ("Maverick Country Stores", "Consumer", 1),
    "pilot":            ("Pilot Flying J", "Consumer", 1),
    "ta":               ("TravelCenters of America", "Consumer", 1),
    # Healthcare / hospital groups
    "northwell":        ("Northwell Health", "Healthcare", 1),
    "nyu-langone":      ("NYU Langone", "Healthcare", 1),
    "montefiore":       ("Montefiore Medical", "Healthcare", 1),
    "mountsinai":       ("Mount Sinai", "Healthcare", 1),
    "stlukes":          ("St. Luke's Health System", "Healthcare", 1),
    "mercy-health":     ("Mercy Health", "Healthcare", 1),
    "ohiohealth":       ("OhioHealth", "Healthcare", 1),
    "presenchealth":    ("Presence Health", "Healthcare", 1),
    "iuhealth":         ("IU Health", "Healthcare", 1),
    "uch":              ("UCHealth", "Healthcare", 1),
    "ucsfhealth":       ("UCSF Health", "Healthcare", 1),
    "stanfordhealthcare":("Stanford Health Care","Healthcare",1),
    "sutterhealth":     ("Sutter Health", "Healthcare", 1),
    "dignity-health":   ("Dignity Health", "Healthcare", 1),
    "sharp":            ("Sharp HealthCare", "Healthcare", 1),
    "scrippshealth":    ("Scripps Health", "Healthcare", 1),
    "rady":             ("Rady Children's", "Healthcare", 1),
    "choc":             ("CHOC", "Healthcare", 1),
    # Manufacturing / industrial
    "3m":               ("3M", "Tech", 1),
    "parker":           ("Parker Hannifin", "Tech", 1),
    "emerson":          ("Emerson Electric", "Tech", 1),
    "illinois-tool":    ("Illinois Tool Works", "Tech", 1),
    "dover":            ("Dover Corporation", "Tech", 1),
    "graco":            ("Graco", "Tech", 1),
    "nordson":          ("Nordson", "Tech", 1),
    "ametek":           ("AMETEK", "Tech", 1),
    "roper-tech":       ("Roper Technologies", "Tech", 1),
    "watts-water":      ("Watts Water Technologies", "Tech", 1),
    "xylem":            ("Xylem", "Tech", 1),
    "pall":             ("Pall Corporation", "Tech", 1),
    "danaher":          ("Danaher", "Tech", 1),
    "becton":           ("Becton Dickinson", "Healthcare", 1),
    "hologic":          ("Hologic", "Healthcare", 1),
    "edwards":          ("Edwards Lifesciences", "Healthcare", 1),
    "teleflex":         ("Teleflex", "Healthcare", 1),
    "natus":            ("Natus Medical", "Healthcare", 1),
    "invacare":         ("Invacare", "Healthcare", 1),
    "sunrise":          ("Sunrise Medical", "Healthcare", 1),
    "permobil":         ("Permobil", "Healthcare", 1),
    # Staffing / workforce
    "adecco":           ("Adecco", "Consulting", 1),
    "manpower":         ("ManpowerGroup", "Consulting", 1),
    "randstad":         ("Randstad", "Consulting", 1),
    "kelly":            ("Kelly Services", "Consulting", 1),
    "robert-half":      ("Robert Half", "Consulting", 1),
    "staffmark":        ("Staffmark", "Consulting", 1),
    "spherion":         ("Spherion", "Consulting", 1),
    "trueblue":         ("TrueBlue", "Consulting", 1),
    "insight-global":   ("Insight Global", "Consulting", 1),
    "aerotek":          ("Aerotek/Allegis", "Consulting", 1),
    "teksystems":       ("TEKsystems", "Consulting", 1),
    "modis":            ("Modis", "Consulting", 1),
    "experis":          ("Experis", "Consulting", 1),
    "paladin":          ("Paladin", "Consulting", 1),
    "burnett":          ("Burnett Specialists", "Consulting", 1),
}


def fetch_all_cornerstone(
    companies: Optional[Dict[str, Tuple[str, str, int]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Cornerstone OnDemand tenants."""
    if companies is None:
        companies = CORNERSTONE_COMPANIES

    results: List[Dict[str, Any]] = []
    for tenant, (name, industry, site_id) in companies.items():
        try:
            jobs = fetch_cornerstone_jobs(tenant, name, career_site_id=site_id, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[csod] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[csod] {name} ({tenant}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[csod] total: {len(results)} jobs from configured tenants\n")
    return results
