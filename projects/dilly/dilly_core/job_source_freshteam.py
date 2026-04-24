"""
Freshteam (Freshworks HR) job board scraper.

Freshteam is an HR platform by Freshworks used by thousands of SMBs.
Each company has a career site at:
  https://<company>.freshteam.com/jobs

The public JSON API (no auth) is at:
  GET https://<company>.freshteam.com/api/job_postings

Returns a list of open positions.

De-dupe key: "freshteam_<company>_<jobId>"
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


def fetch_freshteam_jobs(
    company: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Freshteam company's public API.

    company: the Freshteam subdomain slug (e.g. 'freshworks', 'kayako')
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

    url = f"https://{company}.freshteam.com/api/job_postings"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[freshteam] {company}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("job_postings", data.get("jobs", []))

    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or job.get("job_description") or "")
        job_type = classify_listing(title, desc)

        branch = job.get("branch") or {}
        if isinstance(branch, dict):
            loc_str = f"{branch.get('city', '')}, {branch.get('state_code', '')}".strip(", ")
        else:
            loc_str = str(branch or "")
        city, state, is_remote = _parse_location(loc_str)

        if not is_remote:
            is_remote = bool(job.get("remote"))

        apply_url = (
            job.get("url") or
            f"https://{company}.freshteam.com/jobs/{job_id}/apply"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or {})
        dept_name = dept.get("name", "") if isinstance(dept, dict) else str(dept or "")

        results.append({
            "external_id": f"freshteam_{company}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "freshteam",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept_name,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


FRESHTEAM_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Freshworks products use Freshteam for hiring
    "freshworks":           ("Freshworks", "Tech"),
    "freshdesk":            ("Freshdesk", "Tech"),
    "freshservice":         ("Freshservice", "Tech"),
    "freshsales":           ("Freshsales", "Tech"),
    "freshmarketer":        ("Freshmarketer", "Tech"),
    "freshchat":            ("Freshchat", "Tech"),
    # Other Freshteam customers (SMBs)
    "kayako":               ("Kayako", "Tech"),
    "helpshift":            ("Helpshift", "Tech"),
    "supportbee":           ("SupportBee", "Tech"),
    "groove":               ("Groove", "Tech"),
    "happyfox":             ("HappyFox", "Tech"),
    "teamviewer":           ("TeamViewer", "Tech"),
    "zoho-freshteam":       ("Zoho Corp", "Tech"),
    "chargebee-hr":         ("Chargebee", "Tech"),
    "clevertap":            ("CleverTap", "Tech"),
    "webengage":            ("WebEngage", "Tech"),
    "moengage":             ("MoEngage", "Tech"),
    "netcore-cloud":        ("Netcore Cloud", "Tech"),
    "kaleyra":              ("Kaleyra", "Tech"),
    "exotel":               ("Exotel", "Tech"),
    "knowlarity":           ("Knowlarity", "Tech"),
    "ozonetel":             ("Ozonetel", "Tech"),
    "myoperator":           ("MyOperator", "Tech"),
    "servetel":             ("Servetel", "Tech"),
    "mcube":                ("MCube", "Tech"),
    "vasl":                 ("VASL", "Tech"),
    "asterisk":             ("Asterisk Global", "Tech"),
    "portaone":             ("PortaOne", "Tech"),
    "ameyo":                ("Ameyo", "Tech"),
    "vocalcom":             ("Vocalcom", "Tech"),
    "avaya-smb":            ("Avaya SMB", "Tech"),
    "five9-smb":            ("Five9", "Tech"),
    "talkdesk-smb":         ("Talkdesk", "Tech"),
    "genesys-smb":          ("Genesys", "Tech"),
    "dialpad-hr":           ("Dialpad", "Tech"),
    "ringcentral-smb":      ("RingCentral", "Tech"),
    "aircall-hr":           ("Aircall", "Tech"),
    "cloudtalk":            ("CloudTalk", "Tech"),
    "vonage-smb":           ("Vonage", "Tech"),
    "nextiva-hr":           ("Nextiva", "Tech"),
    "8x8-hr":               ("8x8", "Tech"),
    "mitel-hr":             ("Mitel", "Tech"),
    "polycom-hr":           ("Poly", "Tech"),
    "jabra-hr":             ("Jabra", "Tech"),
    "plantronics-hr":       ("Plantronics", "Tech"),
    "sennheiser-hr":        ("Sennheiser", "Consumer"),
    "logitech-hr":          ("Logitech", "Consumer"),
    "corsair-hr":           ("Corsair", "Consumer"),
    "turtle-beach":         ("Turtle Beach", "Consumer"),
    "steelseries":          ("SteelSeries", "Consumer"),
    "razer-hr":             ("Razer", "Consumer"),
    "roccat":               ("ROCCAT", "Consumer"),
    "glorious-pc":          ("Glorious PC", "Consumer"),
    "ducky":                ("Ducky Channel", "Consumer"),
    "keychron":             ("Keychron", "Consumer"),
    "zsa":                  ("ZSA Technology", "Consumer"),
    "drop-inc":             ("Drop (formerly Massdrop)", "Consumer"),
}


def fetch_all_freshteam(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Freshteam company boards."""
    if companies is None:
        companies = FRESHTEAM_COMPANIES

    results: List[Dict[str, Any]] = []
    for company, (name, industry) in companies.items():
        try:
            jobs = fetch_freshteam_jobs(company, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[freshteam] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[freshteam] {name} ({company}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[freshteam] total: {len(results)} jobs\n")
    return results
