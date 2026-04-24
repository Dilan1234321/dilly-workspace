"""
BambooHR job board scraper.

BambooHR is used by thousands of tech SMBs (100-2000 employees).
Each company has a public jobs feed at:
  GET https://<company>.bamboohr.com/jobs/embed2.php?departmentId=0
  (returns HTML) OR
  GET https://<company>.bamboohr.com/careers/<jobId>/json
  (returns job detail JSON)

The most reliable public endpoint is the embed list:
  https://<company>.bamboohr.com/jobs/embed2.php

This returns an HTML page with JSON embedded in a <script> tag or
as data attributes. We parse the JSON from that response.

Alternative: some companies expose the positions list at:
  https://<company>.bamboohr.com/jobs/

De-dupe key: "bamboohr_<company>_<jobId>"
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
# Match JSON embedded in BambooHR's embed page
_JSON_RE = re.compile(r'"jobs"\s*:\s*(\[.*?\])', re.DOTALL)
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


def fetch_bamboohr_jobs(company: str, company_name: str, max_jobs: int = 200) -> List[Dict[str, Any]]:
    """
    Fetch open jobs from a BambooHR company's public career page.

    company: the BambooHR subdomain slug (e.g. 'stripe', 'shopify')
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

    # Try the JSON API first
    url_json = f"https://{company}.bamboohr.com/jobs/embed2.php?version=1.0.0&sourceTrackingType=none"
    url_html = f"https://{company}.bamboohr.com/jobs/"

    raw_html = ""
    try:
        req = urllib.request.Request(url_json, headers={"User-Agent": _USER_AGENT, "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            raw_html = resp.read().decode("utf-8", errors="replace")
    except Exception:
        try:
            req = urllib.request.Request(url_html, headers={"User-Agent": _USER_AGENT})
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                raw_html = resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            sys.stderr.write(f"[bamboohr] {company} fetch failed: {type(e).__name__}: {e}\n")
            return []

    # Extract jobs from the embedded JSON in the HTML
    # BambooHR embeds job data in a JSON object inside the page
    jobs_raw: List[Dict] = []

    # Try to find JSON data embedded in page
    # Pattern 1: window.Bamboo = {...jobs: [...]}
    m = re.search(r'window\.\w+\s*=\s*(\{.*?"jobs"\s*:.*?\})\s*;', raw_html, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(1))
            jobs_raw = data.get("jobs", [])
        except Exception:
            pass

    # Pattern 2: data-jobs JSON attribute
    if not jobs_raw:
        m = re.search(r'data-jobs="([^"]+)"', raw_html)
        if m:
            try:
                jobs_raw = json.loads(m.group(1).replace("&quot;", '"'))
            except Exception:
                pass

    # Pattern 3: Inline JSON array
    if not jobs_raw:
        m = _JSON_RE.search(raw_html)
        if m:
            try:
                jobs_raw = json.loads(m.group(1))
            except Exception:
                pass

    # Pattern 4: li elements with data attributes (fallback)
    if not jobs_raw:
        job_ids = re.findall(r'data-id="(\d+)"', raw_html)
        job_titles = re.findall(r'<a[^>]*class="BambooHR-ATS-board-item-title[^"]*"[^>]*>([^<]+)<', raw_html)
        job_locations = re.findall(r'<span[^>]*class="[^"]*location[^"]*"[^>]*>([^<]+)<', raw_html)
        for i, job_id in enumerate(job_ids[:max_jobs]):
            jobs_raw.append({
                "id": job_id,
                "title": job_titles[i] if i < len(job_titles) else "",
                "location": job_locations[i] if i < len(job_locations) else "",
            })

    for job in jobs_raw[:max_jobs]:
        job_id = str(job.get("id") or job.get("jobId") or "")
        title = (job.get("title") or job.get("name") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or job.get("jobDescription") or "")
        job_type = classify_listing(title, desc)

        loc_str = (
            job.get("location") or
            job.get("locationName") or
            job.get("city") or ""
        ).strip()
        city, state, is_remote = _parse_location(loc_str)

        apply_url = (
            job.get("url") or
            job.get("applyUrl") or
            f"https://{company}.bamboohr.com/careers/{job_id}"
        )
        posted = (job.get("datePosted") or job.get("postingDate") or "")[:10]
        dept = (job.get("department") or job.get("departmentLabel") or "").strip()

        results.append({
            "external_id": f"bamboohr_{company}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "bamboohr",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


BAMBOOHR_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Tech SMBs known to use BambooHR
    "hubspot":          ("HubSpot", "Tech"),
    "squarespace":      ("Squarespace", "Tech"),
    "eventbrite":       ("Eventbrite", "Tech"),
    "zendesk":          ("Zendesk", "Tech"),
    "freshbooks":       ("FreshBooks", "Finance"),
    "wave":             ("Wave Financial", "Finance"),
    "bench":            ("Bench", "Finance"),
    "clearbooks":       ("ClearBooks", "Finance"),
    "zoho":             ("Zoho", "Tech"),
    "wrike":            ("Wrike", "Tech"),
    "teamwork":         ("Teamwork", "Tech"),
    "basecamp":         ("Basecamp", "Tech"),
    "asana":            ("Asana", "Tech"),
    "monday":           ("Monday.com", "Tech"),
    "clickup":          ("ClickUp", "Tech"),
    "notion":           ("Notion", "Tech"),
    "coda":             ("Coda", "Tech"),
    "airtable":         ("Airtable", "Tech"),
    "smartsheet":       ("Smartsheet", "Tech"),
    "wrike-careers":    ("Wrike", "Tech"),
    "sprinklr":         ("Sprinklr", "Tech"),
    "hootsuite":        ("Hootsuite", "Tech"),
    "buffer":           ("Buffer", "Tech"),
    "sendgrid":         ("SendGrid/Twilio", "Tech"),
    "mailchimp":        ("Mailchimp", "Tech"),
    "activecampaign":   ("ActiveCampaign", "Tech"),
    "klaviyo":          ("Klaviyo", "Tech"),
    "iterable":         ("Iterable", "Tech"),
    "customer-io":      ("Customer.io", "Tech"),
    "drip":             ("Drip", "Tech"),
    "convertkit":       ("ConvertKit", "Tech"),
    "campaign-monitor": ("Campaign Monitor", "Tech"),
    "constant-contact": ("Constant Contact", "Tech"),
    "mailerlite":       ("MailerLite", "Tech"),
    "omnisend":         ("Omnisend", "Tech"),
    # E-commerce / DTC
    "shopify":          ("Shopify", "Tech"),
    "bigcommerce":      ("BigCommerce", "Tech"),
    "woocommerce":      ("WooCommerce", "Tech"),
    "magento":          ("Adobe Commerce/Magento", "Tech"),
    "volusion":         ("Volusion", "Tech"),
    "3dcart":           ("3dcart/Shift4", "Tech"),
    "netsuite":         ("NetSuite/Oracle", "Tech"),
    "brightpearl":      ("Brightpearl", "Tech"),
    "linnworks":        ("Linnworks", "Tech"),
    "skubana":          ("Skubana/Extensiv", "Tech"),
    "orderhive":        ("OrderHive", "Tech"),
    "shipstation":      ("ShipStation", "Tech"),
    "shippo":           ("Shippo", "Tech"),
    "easyship":         ("Easyship", "Tech"),
    "parcelhub":        ("Parcelhub", "Tech"),
    # SaaS B2B SMBs
    "intercom":         ("Intercom", "Tech"),
    "drift":            ("Drift", "Tech"),
    "hubspot-inc":      ("HubSpot", "Tech"),
    "salesforce-small": ("Salesforce SMB", "Tech"),
    "pipedrive":        ("Pipedrive", "Tech"),
    "close":            ("Close CRM", "Tech"),
    "copper":           ("Copper CRM", "Tech"),
    "insightly":        ("Insightly", "Tech"),
    "zoho-crm":         ("Zoho CRM", "Tech"),
    "freshsales":       ("Freshsales", "Tech"),
    "agilecrm":         ("Agile CRM", "Tech"),
    # HR Tech SMBs
    "bamboohr":         ("BambooHR", "Tech"),
    "gusto":            ("Gusto", "Tech"),
    "rippling":         ("Rippling", "Tech"),
    "justworks":        ("Justworks", "Tech"),
    "paychex":          ("Paychex", "Finance"),
    "adp-smb":          ("ADP SMB", "Finance"),
    "paylocity":        ("Paylocity", "Tech"),
    "paycom":           ("Paycom", "Tech"),
    "ceridian":         ("Ceridian/Dayforce", "Tech"),
    "kronos":           ("UKG/Kronos", "Tech"),
    "workday-smb":      ("Workday SMB", "Tech"),
    "sap-successfactors-smb": ("SAP SuccessFactors SMB", "Tech"),
    "namely":           ("Namely", "Tech"),
    "zenefits":         ("Zenefits", "Tech"),
    "lattice":          ("Lattice", "Tech"),
    "15five":           ("15Five", "Tech"),
    "culture-amp":      ("Culture Amp", "Tech"),
    "leapsome":         ("Leapsome", "Tech"),
    "reflektive":       ("Reflektive", "Tech"),
    "betterworks":      ("BetterWorks", "Tech"),
    "small-improvements": ("Small Improvements", "Tech"),
    # Media / content SMBs
    "contently":        ("Contently", "Media"),
    "percolate":        ("Percolate", "Media"),
    "kapost":           ("Kapost", "Media"),
    "cision-smb":       ("Cision", "Media"),
    "meltwater-smb":    ("Meltwater", "Media"),
    "mention":          ("Mention", "Tech"),
    "brand24":          ("Brand24", "Tech"),
    "talkwalker":       ("Talkwalker", "Tech"),
    "brandwatch":       ("Brandwatch", "Tech"),
    "socialbakers":     ("Socialbakers", "Tech"),
    # Design / creative
    "sketch":           ("Sketch", "Tech"),
    "invision":         ("InVision", "Tech"),
    "zeplin":           ("Zeplin", "Tech"),
    "abstract":         ("Abstract", "Tech"),
    "overflow":         ("Overflow", "Tech"),
    "principle":        ("Principle", "Tech"),
    "flinto":           ("Flinto", "Tech"),
    "origami":          ("Origami Studio", "Tech"),
    "protopie":         ("ProtoPie", "Tech"),
    "maze":             ("Maze", "Tech"),
    "lookback":         ("Lookback", "Tech"),
    "usertesting":      ("UserTesting", "Tech"),
    "userzoom":         ("UserZoom", "Tech"),
    "userlytics":       ("Userlytics", "Tech"),
    # Cybersecurity SMBs
    "dnsfilter":        ("DNSFilter", "Tech"),
    "mailsec":          ("MailSec", "Tech"),
    "knowbe4":          ("KnowBe4", "Tech"),
    "proofpoint-smb":   ("Proofpoint SMB", "Tech"),
    "mimecast-smb":     ("Mimecast", "Tech"),
    "barracuda":        ("Barracuda", "Tech"),
    "sophos":           ("Sophos", "Tech"),
    "eset":             ("ESET", "Tech"),
    "bitdefender":      ("Bitdefender", "Tech"),
    "malwarebytes":     ("Malwarebytes", "Tech"),
    "webroot":          ("Webroot", "Tech"),
    "carbonblack":      ("Carbon Black", "Tech"),
    "cylance":          ("Cylance", "Tech"),
    "cybereason":       ("Cybereason", "Tech"),
    "deepinstinct":     ("Deep Instinct", "Tech"),
    "illumio":          ("Illumio", "Tech"),
    "guardicore":       ("Guardicore", "Tech"),
    "telos":            ("Telos", "Tech"),
}


def fetch_all_bamboohr(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from all configured BambooHR company boards.
    """
    if companies is None:
        companies = BAMBOOHR_COMPANIES

    results: List[Dict[str, Any]] = []
    for company, (name, industry) in companies.items():
        try:
            jobs = fetch_bamboohr_jobs(company, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[bamboohr] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[bamboohr] {name} ({company}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[bamboohr] total: {len(results)} jobs from configured companies\n")
    return results
