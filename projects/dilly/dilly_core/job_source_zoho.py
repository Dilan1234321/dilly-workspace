"""
Zoho Recruit job board scraper.

Zoho Recruit is used by SMBs globally. Each company's career page is at:
  https://<company>.zohorecruit.com/careers
  or
  https://recruit.zoho.com/recruit/v1/job-openings/<department>

The public XML/RSS feed is at:
  GET https://<company>.zohorecruit.com/jobs/rss
  (returns RSS XML with all active job openings)

De-dupe key: "zoho_<company>_<jobId>"
"""
from __future__ import annotations

import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
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


def fetch_zoho_jobs(
    company: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Zoho Recruit company's RSS feed.

    company: the Zoho Recruit subdomain slug (e.g. 'zoho', 'freshworks')
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

    # Try RSS feed
    urls = [
        f"https://{company}.zohorecruit.com/jobs/rss",
        f"https://{company}.zohorecruit.eu/jobs/rss",
    ]

    raw_xml = ""
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                raw_xml = resp.read().decode("utf-8", errors="replace")
            if "<" in raw_xml:
                break
        except Exception:
            continue

    if not raw_xml:
        sys.stderr.write(f"[zoho] {company}: RSS feed not available\n")
        return []

    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as e:
        sys.stderr.write(f"[zoho] {company}: XML parse error: {e}\n")
        return []

    items = root.findall(".//item")
    for item in items[:max_jobs]:
        def _text(tag: str, ns: str = "") -> str:
            el = item.find(f"{ns}{tag}" if ns else tag)
            return (el.text or "").strip() if el is not None else ""

        title = _text("title")
        link = _text("link") or _text("guid")
        if not title:
            continue

        desc = _strip_html(_text("description"))
        job_type = classify_listing(title, desc)

        # Zoho RSS may include location in various namespaced tags
        location = (
            _text("{http://jobposting.org/schema}location") or
            _text("location") or
            ""
        )
        city, state, is_remote = _parse_location(location)

        # Extract job ID from URL
        job_id = link.split("/")[-1] if link else str(hash(title))
        posted = _text("pubDate")[:10] if _text("pubDate") else ""

        results.append({
            "external_id": f"zoho_{company}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": link or f"https://{company}.zohorecruit.com/careers",
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "zoho_recruit",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": "",
            "posted_date": posted,
            "industry": "technology",
        })

    return results


ZOHO_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Zoho Recruit is popular across India, SE Asia, and mid-market US
    "zoho":                 ("Zoho Corporation", "Tech"),
    "freshworks":           ("Freshworks", "Tech"),
    "chargebee":            ("Chargebee", "Tech"),
    "cleartax":             ("ClearTax", "Finance"),
    "razorpay":             ("Razorpay", "Finance"),
    "zerodha":              ("Zerodha", "Finance"),
    "groww":                ("Groww", "Finance"),
    "paytm":                ("Paytm", "Finance"),
    "phonepe":              ("PhonePe", "Finance"),
    "meesho":               ("Meesho", "Consumer"),
    "zomato":               ("Zomato", "Consumer"),
    "swiggy":               ("Swiggy", "Consumer"),
    "byjus":                ("BYJU'S", "Tech"),
    "unacademy":            ("Unacademy", "Tech"),
    "vedantu":              ("Vedantu", "Tech"),
    "physicswallah":        ("Physics Wallah", "Tech"),
    "naukri":               ("Naukri/Info Edge", "Tech"),
    "quikr":                ("Quikr", "Tech"),
    "urbanclap":            ("Urban Company", "Consumer"),
    "lenskart":             ("Lenskart", "Consumer"),
    "myntra":               ("Myntra", "Consumer"),
    "nykaa":                ("Nykaa", "Consumer"),
    "clovia":               ("Clovia", "Consumer"),
    "bewakoof":             ("Bewakoof", "Consumer"),
    "boat":                 ("boAt", "Consumer"),
    "mamaearth":            ("Mamaearth", "Consumer"),
    "mccoy-global":         ("McCoy Global", "Tech"),
    "vtiger":               ("Vtiger CRM", "Tech"),
    "kissflow":             ("Kissflow", "Tech"),
    "leena-ai":             ("Leena AI", "Tech"),
    "draup":                ("Draup", "Tech"),
    "sensehq":              ("SenseHQ", "Tech"),
    "darwinbox":            ("Darwinbox", "Tech"),
    "keka":                 ("Keka", "Tech"),
    "sumhr":                ("sumHR", "Tech"),
    "greythr":              ("greytHR", "Tech"),
    "zimyo":                ("Zimyo", "Tech"),
    "hrmantra":             ("HRMantra", "Tech"),
    "factorhr":             ("FactoHR", "Tech"),
    "akrivia":              ("Akrivia HCM", "Tech"),
    "spine-hr":             ("Spine HR", "Tech"),
    "qandle":               ("Qandle", "Tech"),
    "zimyo-hr":             ("Zimyo HR", "Tech"),
    "hrone":                ("HROne", "Tech"),
    "employwise":           ("EmployWise", "Tech"),
    "kredily":              ("Kredily", "Tech"),
    "hrms-pockethrms":      ("PocketHRMS", "Tech"),
    # Southeast Asia
    "grab":                 ("Grab", "Tech"),
    "gojek":                ("GoTo/Gojek", "Tech"),
    "tokopedia":            ("Tokopedia", "Consumer"),
    "bukalapak":            ("Bukalapak", "Consumer"),
    "traveloka":            ("Traveloka", "Consumer"),
    "shopee":               ("Shopee/Sea Group", "Consumer"),
    "lazada":               ("Lazada", "Consumer"),
    "carousell":            ("Carousell", "Consumer"),
    "garena":               ("Garena", "Media"),
    "razer":                ("Razer", "Consumer"),
    "sea-limited":          ("Sea Limited", "Consumer"),
    # Middle East
    "noon":                 ("Noon", "Consumer"),
    "souq":                 ("Souq/Amazon AE", "Consumer"),
    "namshi":               ("Namshi", "Consumer"),
    "wadi":                 ("Wadi", "Consumer"),
    "fetchr":               ("Fetchr", "Consumer"),
    "careem":               ("Careem", "Tech"),
    "telr":                 ("Telr", "Finance"),
    "payfort":              ("PayFort", "Finance"),
    "network-international":("Network International", "Finance"),
}


def fetch_all_zoho(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Zoho Recruit company boards."""
    if companies is None:
        companies = ZOHO_COMPANIES

    results: List[Dict[str, Any]] = []
    for company, (name, industry) in companies.items():
        try:
            jobs = fetch_zoho_jobs(company, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[zoho] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[zoho] {name} ({company}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[zoho] total: {len(results)} jobs\n")
    return results
