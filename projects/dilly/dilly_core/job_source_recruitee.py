"""
Recruitee job board scraper.

Recruitee is a European ATS used by companies across Europe. Career pages:
  https://<company>.recruitee.com/

Public JSON API (no auth):
  GET https://<company>.recruitee.com/api/offers/?scope=active

De-dupe key: "recruitee_<slug>_<offer_id>"
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

_EU_COUNTRY_CODES = {
    "PL","CZ","SK","HU","RO","BG","HR","SI","LT","LV","EE",
    "NL","BE","DE","FR","ES","IT","SE","NO","DK","FI","AT","CH",
    "PT","IE","GB","GR","CY","MT","LU",
}


def _strip_html(raw: str) -> str:
    text = _HTML_TAG_RE.sub(" ", raw or "")
    return _WS_RE.sub(" ", text).strip()[:2000]


def fetch_recruitee_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Recruitee company's public API.

    slug: Recruitee company subdomain (e.g. 'vinted' for vinted.recruitee.com)
    """
    try:
        from crawl_internships_v2 import classify_listing, extract_tags
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing, extract_tags
        except ImportError:
            classify_listing = lambda t, d="": "other"
            extract_tags = lambda t, d="": []

    url = f"https://{slug}.recruitee.com/api/offers/?scope=active"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[recruitee] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = []
    if isinstance(data, dict):
        jobs_raw = data.get("offers", data.get("jobs", []))
    elif isinstance(data, list):
        jobs_raw = data

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or job.get("name") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or job.get("requirements") or "")
        job_type = classify_listing(title, desc)

        location = (job.get("location") or job.get("city") or "").strip()
        country = (job.get("country_code") or "").strip().upper()
        is_remote = (
            job.get("remote") is True or
            "remote" in location.lower() or
            "remote" in title.lower()
        )

        apply_url = (
            job.get("careers_url") or
            job.get("url") or
            f"https://{slug}.recruitee.com/o/{job_id}"
        )
        posted = (job.get("created_at") or job.get("published_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append({
            "external_id": f"recruitee_{slug}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": location or None,
            "location_state": None,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "recruitee",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


RECRUITEE_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Polish tech companies (Recruitee's home market)
    "vinted":               ("Vinted", "Tech"),
    "brainly":              ("Brainly", "Tech"),
    "booksy":               ("Booksy", "Tech"),
    "packhelp":             ("Packhelp", "Tech"),
    "docplanner":           ("Docplanner", "Tech"),
    "nethone":              ("Nethone", "Tech"),
    "softserve":            ("SoftServe", "Tech"),
    "clearcode":            ("Clearcode", "Tech"),
    "nomagic":              ("Nomagic", "Tech"),
    "growbots":             ("Growbots", "Tech"),
    "firework":             ("Firework", "Tech"),
    "zowie-ai":             ("Zowie", "Tech"),
    "tidio":                ("Tidio", "Tech"),
    "livechat-inc":         ("LiveChat", "Tech"),
    "chatbot-com":          ("ChatBot.com", "Tech"),
    "helpdesk-com":         ("HelpDesk", "Tech"),
    "survicate":            ("Survicate", "Tech"),
    "usercom":              ("User.com", "Tech"),
    "vue-storefront":       ("Vue Storefront", "Tech"),
    "piwik-pro":            ("Piwik PRO", "Tech"),
    "nethermind":           ("Nethermind", "Tech"),
    "infermedica":          ("Infermedica", "Tech"),
    "cosmose-ai":           ("Cosmose AI", "Tech"),
    "apliqo":               ("Apliqo", "Tech"),
    "codewise":             ("Codewise", "Tech"),
    "sealights":            ("SeaLights", "Tech"),
    # Dutch / Belgian companies
    "mollie":               ("Mollie", "Finance"),
    "bol-com":              ("Bol.com", "Tech"),
    "coolblue":             ("Coolblue", "Tech"),
    "sendcloud":            ("Sendcloud", "Tech"),
    "messagebird":          ("MessageBird", "Tech"),
    "bunq":                 ("bunq", "Finance"),
    "adyen":                ("Adyen", "Finance"),
    "picnic":               ("Picnic Technologies", "Tech"),
    "catawiki":             ("Catawiki", "Tech"),
    "travix":               ("Travix", "Tech"),
    "takeaway-com":         ("Just Eat Takeaway", "Tech"),
    "wetransfer":           ("WeTransfer", "Tech"),
    "elastic-path":         ("Elastic Path", "Tech"),
    "dealroom-co":          ("Dealroom", "Tech"),
    # Czech / Slovak companies
    "productboard":         ("Productboard", "Tech"),
    "rossum-ai":            ("Rossum", "Tech"),
    "keboola":              ("Keboola", "Tech"),
    "apify":                ("Apify", "Tech"),
    "pipedrive-ee":         ("Pipedrive EE", "Tech"),
    "mall-group":           ("Mall Group", "Consumer"),
    "rohlik":               ("Rohlik Group", "Tech"),
    "mall-cz":              ("Mall.cz", "Consumer"),
    "alza-cz":              ("Alza.cz", "Consumer"),
    "jumperto":             ("Jumperto", "Tech"),
    # German companies
    "taxfix":               ("Taxfix", "Finance"),
    "flixbus":              ("FlixBus", "Tech"),
    "idealo":               ("Idealo", "Tech"),
    "about-you":            ("About You", "Tech"),
    "homeday":              ("Homeday", "Tech"),
    "spotinst":             ("Spot.io", "Tech"),
    "solarisbank":          ("Solarisbank", "Finance"),
    "mambu":                ("Mambu", "Finance"),
    "raisin":               ("Raisin", "Finance"),
    "auxmoney":             ("auxmoney", "Finance"),
    "billie":               ("Billie", "Finance"),
    # Scandinavian companies
    "funnel-io":            ("Funnel.io", "Tech"),
    "supermetrics":         ("Supermetrics", "Tech"),
    "trustpilot":           ("Trustpilot", "Tech"),
    "aiven-io":             ("Aiven", "Tech"),
    "wolt":                 ("Wolt", "Tech"),
    "swappie":              ("Swappie", "Tech"),
    "sana-commerce":        ("Sana Commerce", "Tech"),
    "mews-systems":         ("Mews", "Tech"),
    "exponea":              ("Exponea", "Tech"),
    "kentico":              ("Kentico", "Tech"),
    # UK / Irish companies
    "wayflyer":             ("Wayflyer", "Finance"),
    "swoop-funding":        ("Swoop Funding", "Finance"),
    "cuvva":                ("Cuvva", "Finance"),
    "zego-cover":           ("Zego", "Finance"),
    "marshmallow-insurance":("Marshmallow", "Finance"),
    "spoke-london":         ("Spoke", "Consumer"),
    "made-com":             ("Made.com", "Consumer"),
    "beauty-pie":           ("Beauty Pie", "Consumer"),
    # Spanish / Southern European companies
    "milanuncios":          ("Milanuncios", "Tech"),
    "factorial-hr":         ("Factorial HR", "Tech"),
    "cobee-benefits":       ("Cobee", "Tech"),
    "sesame-hr":            ("Sesame HR", "Tech"),
    "personio-es":          ("Personio Spain", "Tech"),
    "packlink":             ("Packlink", "Tech"),
    "wallapop":             ("Wallapop", "Tech"),
    "glovo":                ("Glovo", "Tech"),
    "cabify":               ("Cabify", "Tech"),
}


def fetch_all_recruitee(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Recruitee company boards."""
    if companies is None:
        companies = RECRUITEE_COMPANIES
    results: List[Dict[str, Any]] = []
    for slug, (name, industry) in companies.items():
        try:
            jobs = fetch_recruitee_jobs(slug, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[recruitee] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[recruitee] {name} ({slug}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[recruitee] total: {len(results)} jobs\n")
    return results
