"""
Pinpoint HQ job board scraper.

Pinpoint is a UK-based ATS used primarily by UK and European companies.
Career pages are at:
  https://<company>.pinpointhq.com

Public JSON API (no auth):
  GET https://<company>.pinpointhq.com/jobs.json
  or
  GET https://<company>.pinpointhq.com/api/v1/job_ads

Also covers:
  Trakstar Hire (formerly Recruiterbox):
    GET https://<company>.trakstar.com/api/recruiting/v1/openings.json
  GoHire:
    GET https://<company>.gohire.io/api/jobs
  Jobylon:
    GET https://<company>.jobylon.com/jobs/feed.json

De-dupe keys:
  "pinpoint_<slug>_<job_id>"
  "trakstar_<slug>_<job_id>"
  "gohire_<slug>_<job_id>"
  "jobylon_<slug>_<job_id>"
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

_US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC",
}


def _strip_html(raw: str) -> str:
    text = _HTML_TAG_RE.sub(" ", raw or "")
    return _WS_RE.sub(" ", text).strip()[:2000]


def _get_classifiers():
    try:
        from crawl_internships_v2 import classify_listing, extract_tags
        return classify_listing, extract_tags
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing, extract_tags
            return classify_listing, extract_tags
        except ImportError:
            return lambda t, d="": "other", lambda t, d="": []


# ── Pinpoint HQ ──────────────────────────────────────────────────────────────

def fetch_pinpoint_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from a Pinpoint HQ company's public JSON feed."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://{slug}.pinpointhq.com/jobs.json",
        f"https://{slug}.pinpointhq.com/api/v1/job_ads",
    ]:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[pinpoint] {slug}: fetch failed\n")
        return []

    jobs_raw = []
    if isinstance(data, list):
        jobs_raw = data
    elif isinstance(data, dict):
        jobs_raw = data.get("job_ads", data.get("jobs", data.get("data", [])))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or job.get("name") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        job_type = classify_listing(title, desc)
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower() or job.get("remote") is True

        apply_url = (
            job.get("url") or job.get("apply_url") or
            f"https://{slug}.pinpointhq.com/postings/{job_id}"
        )
        posted = (job.get("created_at") or job.get("published_at") or "")[:10]
        dept = (job.get("department") or job.get("team") or "").strip()

        results.append({
            "external_id": f"pinpoint_{slug}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": location or None,
            "location_state": None,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "pinpoint",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


PINPOINT_COMPANIES: Dict[str, Tuple[str, str]] = {
    # UK tech & SaaS companies
    "cleo":                 ("Cleo", "Finance"),
    "monzo":                ("Monzo", "Finance"),
    "starling-bank":        ("Starling Bank", "Finance"),
    "revolut":              ("Revolut", "Finance"),
    "curve-card":           ("Curve", "Finance"),
    "pockit":               ("Pockit", "Finance"),
    "tandem-bank":          ("Tandem Bank", "Finance"),
    "plum-savings":         ("Plum", "Finance"),
    "chip-savings":         ("Chip", "Finance"),
    "moneybox":             ("Moneybox", "Finance"),
    "pensionbee":           ("PensionBee", "Finance"),
    "wagestream":           ("Wagestream", "Finance"),
    "hastee":               ("Hastee", "Finance"),
    "salary-finance":       ("Salary Finance", "Finance"),
    "zopa-bank":            ("Zopa", "Finance"),
    "iwoca":                ("iwoca", "Finance"),
    "funding-circle":       ("Funding Circle", "Finance"),
    "tide-banking":         ("Tide", "Finance"),
    "countingup":           ("Countingup", "Finance"),
    "anna-money":           ("ANNA Money", "Finance"),
    # UK HR & people tech
    "citrus-hr":            ("Citrus HR", "Tech"),
    "bamboo-health":        ("Bamboo Health", "Healthcare"),
    "breathehr":            ("BreatHR", "Tech"),
    "charlie-hr":           ("CharlieHR", "Tech"),
    "cezanne-hr":           ("Cezanne HR", "Tech"),
    "natural-hr":           ("Natural HR", "Tech"),
    "sage-hr":              ("Sage HR", "Tech"),
    "myhrtoolkit":          ("MyHRToolkit", "Tech"),
    "people-hr":            ("People HR", "Tech"),
    "peoplehr":             ("PeopleHR", "Tech"),
    # UK property / proptech
    "nested-homes":         ("Nested", "Finance"),
    "heyhabito":            ("Habito", "Finance"),
    "coadjute":             ("Coadjute", "Tech"),
    "matterport-uk":        ("Matterport UK", "Tech"),
    "geomni":               ("Geomni", "Tech"),
    "landmark-info":        ("Landmark Information", "Tech"),
    "terraquest":           ("TerraQuest", "Tech"),
    "lpis-ltd":             ("LPIS", "Tech"),
    # UK legal tech
    "clio-uk":              ("Clio UK", "Tech"),
    "harvey-nash":          ("Harvey Nash", "Tech"),
    "legalzoom-uk":         ("LegalZoom UK", "Tech"),
    "deed-uk":              ("Deed", "Tech"),
    "avvoka":               ("Avvoka", "Tech"),
    # UK media / publishing
    "guardian-news":        ("The Guardian", "Consumer"),
    "the-times":            ("The Times", "Consumer"),
    "daily-mail":           ("Daily Mail & General Trust", "Consumer"),
    "reach-plc":            ("Reach PLC", "Consumer"),
    "immediate-media":      ("Immediate Media", "Consumer"),
    "conde-nast-intl":      ("Conde Nast International", "Consumer"),
}


# ── Trakstar Hire (formerly Recruiterbox) ────────────────────────────────────

def fetch_trakstar_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from a Trakstar Hire company's public JSON feed."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.trakstar.com/api/recruiting/v1/openings.json"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[trakstar] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("openings", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or job.get("position") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        job_type = classify_listing(title, desc)
        city = (job.get("city") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = job.get("remote") is True or "remote" in title.lower()

        apply_url = (
            job.get("url") or
            f"https://{slug}.trakstar.com/jobs/{job_id}"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append({
            "external_id": f"trakstar_{slug}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "trakstar",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


TRAKSTAR_COMPANIES: Dict[str, Tuple[str, str]] = {
    # SMB tech / SaaS
    "wrike-jobs":           ("Wrike", "Tech"),
    "lucidchart":           ("Lucidchart", "Tech"),
    "lucid-software":       ("Lucid Software", "Tech"),
    "podium-hq":            ("Podium", "Tech"),
    "weave-hq":             ("Weave", "Tech"),
    "talkdesk":             ("Talkdesk", "Tech"),
    "five9":                ("Five9", "Tech"),
    "8x8-inc":              ("8x8", "Tech"),
    "nextiva":              ("Nextiva", "Tech"),
    "dialpad-hq":           ("Dialpad", "Tech"),
    "ringcentral":          ("RingCentral", "Tech"),
    "bandwidth-inc":        ("Bandwidth", "Tech"),
    "twilio":               ("Twilio", "Tech"),
    "vonage":               ("Vonage", "Tech"),
    "limeade":              ("Limeade", "Tech"),
    "achievers":            ("Achievers", "Tech"),
    "kazoohr":              ("Kazoo", "Tech"),
    "bonusly":              ("Bonusly", "Tech"),
    "blueboard":            ("Blueboard", "Tech"),
    "workhuman":            ("Workhuman", "Tech"),
    # SMB healthcare
    "kaleo-pharma":         ("kaleo", "Healthcare"),
    "connecture":           ("Connecture", "Healthcare"),
    "clarify-health":       ("Clarify Health", "Healthcare"),
    "arcadian-telepsych":   ("Arcadian Telepsychiatry", "Healthcare"),
    "talkspace":            ("Talkspace", "Healthcare"),
    "betterhelp":           ("BetterHelp", "Healthcare"),
    "alma-health":          ("Alma", "Healthcare"),
    "path-mental-health":   ("Path Mental Health", "Healthcare"),
    "monument-health":      ("Monument", "Healthcare"),
    # Consumer / retail
    "cato-corp":            ("Cato Corporation", "Consumer"),
    "boscovs":              ("Boscov's", "Consumer"),
    "tuesday-morning":      ("Tuesday Morning", "Consumer"),
    "gordmans":             ("Gordmans", "Consumer"),
    "menards":              ("Menards", "Consumer"),
    "do-it-best":           ("Do it Best", "Consumer"),
    "ace-hardware":         ("Ace Hardware", "Consumer"),
    "truevalue":            ("True Value", "Consumer"),
    "orchard-supply":       ("Orchard Supply Hardware", "Consumer"),
    "harbor-freight":       ("Harbor Freight Tools", "Consumer"),
}


# ── GoHire ───────────────────────────────────────────────────────────────────

def fetch_gohire_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from a GoHire company's public API."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.gohire.io/api/jobs"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[gohire] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", [])

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        job_type = classify_listing(title, desc)
        location = (job.get("location") or "").strip()
        is_remote = "remote" in location.lower()

        apply_url = (
            job.get("url") or
            f"https://{slug}.gohire.io/jobs/{job_id}"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append({
            "external_id": f"gohire_{slug}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": location or None,
            "location_state": None,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "gohire",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


GOHIRE_COMPANIES: Dict[str, Tuple[str, str]] = {
    # UK SMB companies (GoHire is UK-focused)
    "butternut-box":        ("Butternut Box", "Consumer"),
    "perkbox":              ("Perkbox", "Tech"),
    "deputy-uk":            ("Deputy", "Tech"),
    "symplify":             ("Symplify", "Tech"),
    "checkout-com":         ("Checkout.com", "Finance"),
    "yapily":               ("Yapily", "Finance"),
    "modulr-finance":       ("Modulr Finance", "Finance"),
    "teampay":              ("Teampay", "Finance"),
    "payhawk":              ("Payhawk", "Finance"),
    "soldo":                ("Soldo", "Finance"),
    "moss-expense":         ("Moss", "Finance"),
    "pleo-uk":              ("Pleo UK", "Finance"),
    "expensify-uk":         ("Expensify UK", "Finance"),
    "satago":               ("Satago", "Finance"),
    "onpay-uk":             ("OnPay UK", "Finance"),
    "telleroo":             ("Telleroo", "Finance"),
    "clear-books":          ("Clear Books", "Finance"),
    "crunch-accounting":    ("Crunch Accounting", "Finance"),
    "freeagent":            ("FreeAgent", "Finance"),
    "kashflow":             ("KashFlow", "Finance"),
    "brightpay":            ("BrightPay", "Finance"),
    "staffology":           ("Staffology", "Finance"),
    "moorepay":             ("Moorepay", "Finance"),
    "paychex-uk":           ("Paychex UK", "Finance"),
    "ceridian-uk":          ("Ceridian UK", "Finance"),
}


# ── Jobylon (Scandinavian ATS) ───────────────────────────────────────────────

def fetch_jobylon_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from a Jobylon company's public JSON feed."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.jobylon.com/jobs/feed.json"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[jobylon] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", [])

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or job.get("body") or "")
        job_type = classify_listing(title, desc)
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()

        apply_url = (
            job.get("url") or
            f"https://{slug}.jobylon.com/jobs/{job_id}"
        )
        posted = (job.get("created_at") or job.get("published_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append({
            "external_id": f"jobylon_{slug}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": location or None,
            "location_state": None,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "jobylon",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


JOBYLON_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Scandinavian companies (Jobylon's main market)
    "klarna":               ("Klarna", "Finance"),
    "spotify-se":           ("Spotify Sweden", "Tech"),
    "ericsson":             ("Ericsson", "Tech"),
    "nokia-se":             ("Nokia Sweden", "Tech"),
    "volvo-cars":           ("Volvo Cars", "Tech"),
    "scania":               ("Scania", "Consumer"),
    "sandvik":              ("Sandvik", "Consumer"),
    "abb-se":               ("ABB Sweden", "Tech"),
    "vattenfall":           ("Vattenfall", "Tech"),
    "electrolux":           ("Electrolux", "Consumer"),
    "ssab":                 ("SSAB", "Consumer"),
    "alfa-laval":           ("Alfa Laval", "Consumer"),
    "atlas-copco":          ("Atlas Copco", "Consumer"),
    "husqvarna":            ("Husqvarna", "Consumer"),
    "hennes-mauritz":       ("H&M Group", "Consumer"),
    "ikea-se":              ("IKEA Sweden", "Consumer"),
    "axfood":               ("Axfood", "Consumer"),
    "coop-se":              ("Coop Sweden", "Consumer"),
    "ica-gruppen":          ("ICA Gruppen", "Consumer"),
    "telia":                ("Telia Company", "Tech"),
    "telenor-se":           ("Telenor Sweden", "Tech"),
    "three-se":             ("Three Sweden", "Tech"),
    "seb-bank":             ("SEB Bank", "Finance"),
    "nordea-se":            ("Nordea Sweden", "Finance"),
    "swedbank":             ("Swedbank", "Finance"),
    "handelsbanken":        ("Handelsbanken", "Finance"),
    "folksam":              ("Folksam", "Finance"),
    "lansen":               ("Länsförsäkringar", "Finance"),
    "trygg-hansa":          ("Trygg-Hansa", "Finance"),
    # Danish companies
    "maersk":               ("A.P. Moller-Maersk", "Consumer"),
    "novo-nordisk":         ("Novo Nordisk", "Healthcare"),
    "coloplast":            ("Coloplast", "Healthcare"),
    "gn-audio":             ("GN Audio (Jabra)", "Tech"),
    "vestas":               ("Vestas", "Tech"),
    "orsted":               ("Ørsted", "Tech"),
    "pandora-jewelry":      ("Pandora Jewelry", "Consumer"),
    "royal-unibrew":        ("Royal Unibrew", "Consumer"),
    "carlsberg-dk":         ("Carlsberg Denmark", "Consumer"),
    "danish-crown":         ("Danish Crown", "Consumer"),
    # Norwegian companies
    "dnb-no":               ("DNB Bank", "Finance"),
    "telenor-no":           ("Telenor Norway", "Tech"),
    "equinor":              ("Equinor", "Tech"),
    "yara":                 ("Yara International", "Consumer"),
    "kongsberg-gruppen":    ("Kongsberg Gruppen", "Tech"),
    "aibel-no":             ("Aibel", "Tech"),
    "tomra-systems":        ("TOMRA Systems", "Tech"),
    "nordic-semiconductor": ("Nordic Semiconductor", "Tech"),
    "pexip":                ("Pexip", "Tech"),
    "visma":                ("Visma", "Tech"),
}


def fetch_all_pinpoint(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Pinpoint HQ company boards."""
    if companies is None:
        companies = PINPOINT_COMPANIES
    results: List[Dict[str, Any]] = []
    for slug, (name, industry) in companies.items():
        try:
            jobs = fetch_pinpoint_jobs(slug, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[pinpoint] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[pinpoint] {name} ({slug}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[pinpoint] total: {len(results)} jobs\n")
    return results


def fetch_all_trakstar(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Trakstar Hire company boards."""
    if companies is None:
        companies = TRAKSTAR_COMPANIES
    results: List[Dict[str, Any]] = []
    for slug, (name, industry) in companies.items():
        try:
            jobs = fetch_trakstar_jobs(slug, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[trakstar] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[trakstar] {name} ({slug}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[trakstar] total: {len(results)} jobs\n")
    return results


def fetch_all_gohire(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured GoHire company boards."""
    if companies is None:
        companies = GOHIRE_COMPANIES
    results: List[Dict[str, Any]] = []
    for slug, (name, industry) in companies.items():
        try:
            jobs = fetch_gohire_jobs(slug, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[gohire] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[gohire] {name} ({slug}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[gohire] total: {len(results)} jobs\n")
    return results


def fetch_all_jobylon(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Jobylon company boards."""
    if companies is None:
        companies = JOBYLON_COMPANIES
    results: List[Dict[str, Any]] = []
    for slug, (name, industry) in companies.items():
        try:
            jobs = fetch_jobylon_jobs(slug, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[jobylon] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[jobylon] {name} ({slug}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[jobylon] total: {len(results)} jobs\n")
    return results
