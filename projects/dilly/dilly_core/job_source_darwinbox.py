"""
India / APAC ATS scrapers: Darwinbox, Keka, TurboHire, Zappyhire,
TalentRecruit, Springrecruit, X0PA AI, Manatal, Skeeled.

These ATSs are predominantly used by companies in India, Southeast Asia,
the Middle East, and Europe.

De-dupe keys:
  "darwinbox_<slug>_<job_id>"
  "keka_<slug>_<job_id>"
  "turbohire_<slug>_<job_id>"
  "zappyhire_<slug>_<job_id>"
  "talentrecruit_<slug>_<job_id>"
  "springrecruit_<slug>_<job_id>"
  "x0pa_<slug>_<job_id>"
  "manatal_<slug>_<job_id>"
  "skeeled_<slug>_<job_id>"
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
_TIMEOUT = 20

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_html(raw: str) -> str:
    text = _HTML_TAG_RE.sub(" ", raw or "")
    return _WS_RE.sub(" ", text).strip()[:2000]


def _get_classifiers() -> Tuple[Callable, Callable]:
    try:
        from crawl_internships_v2 import classify_listing, extract_tags
        return classify_listing, extract_tags
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing, extract_tags
            return classify_listing, extract_tags
        except ImportError:
            return lambda t, d="": "other", lambda t, d="": []


def _fetch_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={
        "User-Agent": _USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _make_job(
    *,
    ats: str,
    external_id: str,
    company: str,
    title: str,
    description: str = "",
    apply_url: str = "",
    city: Optional[str] = None,
    state: Optional[str] = None,
    is_remote: bool = False,
    dept: str = "",
    posted: str = "",
    industry: str = "technology",
    classify_listing: Callable = lambda t, d="": "other",
    extract_tags: Callable = lambda t, d="": [],
) -> Dict[str, Any]:
    return {
        "external_id": external_id,
        "company": company,
        "title": title,
        "description": description,
        "apply_url": apply_url,
        "location_city": city,
        "location_state": state,
        "work_mode": "remote" if is_remote else "unknown",
        "remote": is_remote,
        "source_ats": ats,
        "job_type": classify_listing(title, description),
        "cohorts": [],
        "tags": extract_tags(title, description),
        "team": dept,
        "posted_date": posted,
        "industry": industry,
    }


# ── Darwinbox ──────────────────────────────────────────────────────────────

def fetch_darwinbox_jobs(
    subdomain: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Darwinbox career portal (India HRMS)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://{subdomain}.darwinbox.in/ms/candidate/careers/get_jobs",
        f"https://{subdomain}.darwinbox.in/candidate/careers/getJobs",
        f"https://{subdomain}.darwinbox.com/ms/candidate/careers/get_jobs",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[darwinbox] {subdomain}: fetch failed\n")
        return []

    jobs_raw = []
    if isinstance(data, list):
        jobs_raw = data
    elif isinstance(data, dict):
        jobs_raw = data.get("data", data.get("jobs", data.get("openings", [])))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("job_id") or job.get("id") or "")
        title = (job.get("title") or job.get("job_title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or job.get("job_description") or "")
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()
        apply_url = (
            job.get("apply_url") or
            f"https://{subdomain}.darwinbox.in/ms/candidate/careers/job/{job_id}"
        )
        posted = (job.get("created_on") or job.get("posted_date") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="darwinbox",
            external_id=f"darwinbox_{subdomain}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=location or None,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


DARWINBOX_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Indian unicorns / large tech
    "swiggy":               ("Swiggy", "Tech"),
    "zomato":               ("Zomato", "Tech"),
    "meesho":               ("Meesho", "Tech"),
    "groww":                ("Groww", "Finance"),
    "zepto":                ("Zepto", "Tech"),
    "blinkit":              ("Blinkit", "Tech"),
    "dunzo":                ("Dunzo", "Tech"),
    "bigbasket":            ("BigBasket", "Tech"),
    "nykaa":                ("Nykaa", "Consumer"),
    "myntra":               ("Myntra", "Consumer"),
    "ajio":                 ("AJIO", "Consumer"),
    "boat-lifestyle":       ("boAt Lifestyle", "Consumer"),
    "noise-gadgets":        ("Noise", "Consumer"),
    "mamaearth":            ("Mamaearth", "Consumer"),
    "healthkart":           ("HealthKart", "Consumer"),
    "lenskart":             ("Lenskart", "Consumer"),
    "caratlane":            ("CaratLane", "Consumer"),
    "bluestone-jewelry":    ("BlueStone", "Consumer"),
    "manyavar":             ("Manyavar", "Consumer"),
    "vedant-fashions":      ("Vedant Fashions", "Consumer"),
    # Indian fintech
    "razorpay":             ("Razorpay", "Finance"),
    "paytm":                ("Paytm", "Finance"),
    "phonepe":              ("PhonePe", "Finance"),
    "bharat-pe":            ("BharatPe", "Finance"),
    "slice":                ("Slice", "Finance"),
    "jupiter-bank":         ("Jupiter Money", "Finance"),
    "fi-money":             ("Fi", "Finance"),
    "niyo":                 ("Niyo", "Finance"),
    "credit-mantri":        ("CreditMantri", "Finance"),
    "cred-club":            ("CRED", "Finance"),
    # Indian enterprise
    "wipro-hr":             ("Wipro", "Tech"),
    "hcltech":              ("HCL Technologies", "Tech"),
    "mphasis":              ("Mphasis", "Tech"),
    "hexaware":             ("Hexaware Technologies", "Tech"),
    "cyient":               ("Cyient", "Tech"),
    "kpit-tech":            ("KPIT Technologies", "Tech"),
    "persistent":           ("Persistent Systems", "Tech"),
    "l-and-t-infotech":     ("LTI Mindtree", "Tech"),
    "mindtree":             ("Mindtree", "Tech"),
    "sonata-software":      ("Sonata Software", "Tech"),
    # SE Asian companies
    "grab-sg":              ("Grab", "Tech"),
    "gojek":                ("GoJek", "Tech"),
    "tokopedia":            ("Tokopedia", "Tech"),
    "bukalapak":            ("Bukalapak", "Tech"),
    "traveloka":            ("Traveloka", "Tech"),
    "tiket-com":            ("Tiket.com", "Tech"),
    "ovo-pay":              ("OVO", "Finance"),
    "dana-id":              ("DANA", "Finance"),
    "linkaja":              ("LinkAja", "Finance"),
    "kredivo":              ("Kredivo", "Finance"),
    # Middle East
    "noon-mena":            ("Noon", "Tech"),
    "careem-uae":           ("Careem", "Tech"),
    "talabat":              ("Talabat", "Tech"),
    "bayt-com":             ("Bayt.com", "Tech"),
    "nana-sa":              ("Nana", "Tech"),
}


# ── Keka HR ────────────────────────────────────────────────────────────────

def fetch_keka_jobs(
    subdomain: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Keka HR career portal (India HR SaaS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{subdomain}.keka.com/careers/api/job-postings"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[keka] {subdomain}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = []
    if isinstance(data, list):
        jobs_raw = data
    elif isinstance(data, dict):
        jobs_raw = data.get("data", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or job.get("jobId") or "")
        title = (job.get("title") or job.get("jobTitle") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()
        apply_url = (
            job.get("applyUrl") or
            f"https://{subdomain}.keka.com/careers/job-details/{job_id}"
        )
        posted = (job.get("postedDate") or job.get("createdOn") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="keka",
            external_id=f"keka_{subdomain}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=location or None,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


KEKA_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Indian companies using Keka HR
    "zerodha":              ("Zerodha", "Finance"),
    "freshworks":           ("Freshworks", "Tech"),
    "chargebee":            ("Chargebee", "Tech"),
    "postman":              ("Postman", "Tech"),
    "browserstack":         ("BrowserStack", "Tech"),
    "hasura":               ("Hasura", "Tech"),
    "saastraat":            ("SaaStraat", "Tech"),
    "yellowmessenger":      ("Yellow.ai", "Tech"),
    "haptik":               ("Haptik", "Tech"),
    "moengage":             ("MoEngage", "Tech"),
    "webengage":            ("WebEngage", "Tech"),
    "clevertap":            ("CleverTap", "Tech"),
    "netcore-cloud":        ("Netcore Cloud", "Tech"),
    "ameyo":                ("Ameyo", "Tech"),
    "exotel":               ("Exotel", "Tech"),
    "ozonetel":             ("Ozonetel", "Tech"),
    "msg91":                ("MSG91", "Tech"),
    "kaleyra":              ("Kaleyra", "Tech"),
    "valuecommerce":        ("ValueCommerce", "Tech"),
    "rocketlane":           ("Rocketlane", "Tech"),
    "sprinklr-in":          ("Sprinklr India", "Tech"),
    "leadsquared":          ("LeadSquared", "Tech"),
    "capillary-tech":       ("Capillary Technologies", "Tech"),
    "darwinbox-co":         ("Darwinbox", "Tech"),
    "zimyo":                ("Zimyo", "Tech"),
    "kredx":                ("KredX", "Finance"),
    "loanfront":            ("LoanFront", "Finance"),
    "yubi-finance":         ("Yubi", "Finance"),
    "axio-finance":         ("Axio", "Finance"),
    "moneyview":            ("MoneyView", "Finance"),
    "rupeek":               ("Rupeek", "Finance"),
}


# ── TurboHire ────────────────────────────────────────────────────────────────

def fetch_turbohire_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from TurboHire (India AI ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://app.turbohire.co/api/v1/public/jobs?company={slug}"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[turbohire] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or "").strip()
        is_remote = "remote" in location.lower()
        apply_url = job.get("apply_url") or f"https://app.turbohire.co/apply/{job_id}"
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="turbohire",
            external_id=f"turbohire_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=location or None,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


TURBOHIRE_COMPANIES: Dict[str, Tuple[str, str]] = {
    "infosys":              ("Infosys", "Tech"),
    "tcs":                  ("Tata Consultancy Services", "Tech"),
    "wipro":                ("Wipro", "Tech"),
    "accenture-in":         ("Accenture India", "Tech"),
    "cognizant":            ("Cognizant", "Tech"),
    "capgemini-in":         ("Capgemini India", "Tech"),
    "tech-mahindra":        ("Tech Mahindra", "Tech"),
    "mphasis-hr":           ("Mphasis", "Tech"),
    "niit-tech":            ("NIIT Technologies", "Tech"),
    "mastech":              ("Mastech Digital", "Tech"),
    "zensar":               ("Zensar Technologies", "Tech"),
    "geometric-ltd":        ("Geometric", "Tech"),
    "rpg-group":            ("RPG Group", "Consumer"),
    "jsw-group":            ("JSW Group", "Consumer"),
    "aditya-birla":         ("Aditya Birla Group", "Consumer"),
    "reliance-industries":  ("Reliance Industries", "Consumer"),
    "tata-group":           ("Tata Group", "Consumer"),
    "mahindra-group":       ("Mahindra Group", "Consumer"),
    "larsen-toubro":        ("Larsen & Toubro", "Consumer"),
    "bajaj-auto":           ("Bajaj Auto", "Consumer"),
}


# ── Manatal ───────────────────────────────────────────────────────────────────

def fetch_manatal_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Manatal (Thailand/SE Asian ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://careers.manatal.com/{slug}/api/jobs",
        f"https://careers.manatal.com/api/{slug}/jobs",
        f"https://{slug}.manatal.com/api/v1/jobs",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[manatal] {slug}: fetch failed\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()
        apply_url = (
            job.get("apply_url") or
            f"https://careers.manatal.com/{slug}/job/{job_id}"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="manatal",
            external_id=f"manatal_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=location or None,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


MANATAL_COMPANIES: Dict[str, Tuple[str, str]] = {
    # SE Asian companies using Manatal
    "sea-group":            ("Sea Group (Shopee/SeaMoney)", "Tech"),
    "lazada":               ("Lazada", "Tech"),
    "agoda":                ("Agoda", "Tech"),
    "line-th":              ("LINE Thailand", "Tech"),
    "scb-tech":             ("SCB TechX", "Finance"),
    "kbank-kasikorn":       ("Kasikorn Bank", "Finance"),
    "truemoney":            ("TrueMoney", "Finance"),
    "omise":                ("Omise", "Finance"),
    "ascend-money":         ("Ascend Money", "Finance"),
    "2c2p":                 ("2C2P", "Finance"),
    "krungsri":             ("Krungsri Bank", "Finance"),
    "krungthai":            ("Krungthai Bank", "Finance"),
    "bitkub":               ("Bitkub", "Finance"),
    "zipmex":               ("Zipmex", "Finance"),
    "pomelo-fashion":       ("Pomelo Fashion", "Consumer"),
    "central-retail":       ("Central Retail", "Consumer"),
    "the-mall-group":       ("The Mall Group", "Consumer"),
    "foodpanda-th":         ("Foodpanda Thailand", "Tech"),
    "grab-th":              ("Grab Thailand", "Tech"),
    "lineman":              ("LINE MAN", "Tech"),
    "robinhood-th":         ("Robinhood", "Tech"),
    "flashexpress":         ("Flash Express", "Tech"),
    "shippop":              ("Shippop", "Tech"),
    "pomelo-tech":          ("Pomelo", "Tech"),
    "wongnai":              ("Wongnai", "Tech"),
    # Middle East companies using Manatal
    "souq-uae":             ("Souq (Amazon UAE)", "Tech"),
    "property-finder":      ("Property Finder", "Tech"),
    "dubizzle":             ("Dubizzle", "Tech"),
    "angi-mena":            ("Angi MENA", "Tech"),
    "fetchr":               ("Fetchr", "Tech"),
    "tabby-ae":             ("Tabby", "Finance"),
    "tamara-sa":            ("Tamara", "Finance"),
    "postpay":              ("Postpay", "Finance"),
}


# ── Skeeled (European ATS — Luxembourg/France) ─────────────────────────────

def fetch_skeeled_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Skeeled (European ATS, Luxembourg-based)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://api.skeeled.com/api/v1/companies/{slug}/job-openings?limit=100"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[skeeled] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobOpenings", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or job.get("name") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()
        apply_url = (
            job.get("applyUrl") or
            f"https://app.skeeled.com/jobs/{job_id}/apply"
        )
        posted = (job.get("createdAt") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="skeeled",
            external_id=f"skeeled_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=location or None,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


SKEELED_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Luxembourg / Benelux companies (Skeeled's home market)
    "bnl-luxembourg":       ("BNL Luxembourg", "Finance"),
    "bcee":                 ("BCEE (Spuerkeess)", "Finance"),
    "bgl-bnp-paribas":      ("BGL BNP Paribas", "Finance"),
    "post-luxembourg":      ("POST Luxembourg", "Tech"),
    "luxair":               ("Luxair", "Consumer"),
    "cargolux":             ("Cargolux", "Consumer"),
    "rtl-group":            ("RTL Group", "Consumer"),
    "skype-lux":            ("Skype Luxembourg", "Tech"),
    "amazon-lux":           ("Amazon Luxembourg", "Tech"),
    "paypal-lux":           ("PayPal Luxembourg", "Finance"),
    "rakuten-lux":          ("Rakuten Luxembourg", "Tech"),
    # French companies using Skeeled
    "decathlon-hr":         ("Decathlon", "Consumer"),
    "leroy-merlin":         ("Leroy Merlin", "Consumer"),
    "fnac-darty":           ("Fnac Darty", "Consumer"),
    "maisons-du-monde":     ("Maisons du Monde", "Consumer"),
    "la-redoute":           ("La Redoute", "Consumer"),
    "cdiscount":            ("Cdiscount", "Consumer"),
    "vente-privee":         ("Veepee", "Consumer"),
    "showroomprive":        ("Showroomprivé", "Consumer"),
    "boulanger":            ("Boulanger", "Consumer"),
    "darty":                ("Darty", "Consumer"),
    # Belgian companies
    "delhaize":             ("Delhaize Belgium", "Consumer"),
    "colruyt-group":        ("Colruyt Group", "Consumer"),
    "bpost":                ("bpost", "Consumer"),
    "proximus":             ("Proximus", "Tech"),
    "telenet-be":           ("Telenet", "Tech"),
}


# ── Springrecruit ──────────────────────────────────────────────────────────

def fetch_springrecruit_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Springrecruit (Indian startup ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://app.springrecruit.com/api/v1/public/jobs?company_slug={slug}"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[springrecruit] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or "").strip()
        is_remote = "remote" in location.lower()
        apply_url = (
            job.get("apply_url") or
            f"https://app.springrecruit.com/jobs/{job_id}"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="springrecruit",
            external_id=f"springrecruit_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=location or None,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


SPRINGRECRUIT_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Indian startups using Springrecruit
    "unacademy":            ("Unacademy", "Tech"),
    "byju-s":               ("BYJU'S", "Tech"),
    "vedantu":              ("Vedantu", "Tech"),
    "toppr":                ("Toppr", "Tech"),
    "testbook":             ("Testbook", "Tech"),
    "adda247":              ("Adda247", "Tech"),
    "physicswallah":        ("Physics Wallah", "Tech"),
    "classplus":            ("Classplus", "Tech"),
    "doubtnut":             ("Doubtnut", "Tech"),
    "extramarks":           ("Extramarks", "Tech"),
    "embibe":               ("Embibe", "Tech"),
    "filo-tutors":          ("Filo", "Tech"),
    "cuemath":              ("Cuemath", "Tech"),
    "brainly-in":           ("Brainly India", "Tech"),
    "simplilearn":          ("Simplilearn", "Tech"),
    "upgrad":               ("upGrad", "Tech"),
    "great-learning":       ("Great Learning", "Tech"),
    "scaler":               ("Scaler", "Tech"),
    "almabetter":           ("AlmaBetter", "Tech"),
    "newton-school":        ("Newton School", "Tech"),
    "masaiSchool":          ("Masai School", "Tech"),
}


# ── X0PA AI ──────────────────────────────────────────────────────────────────

def fetch_x0pa_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from X0PA AI ATS (Singapore-based)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://app.x0pa.ai/api/v1/public/jobs?company={slug}"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[x0pa] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", [])

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("jobTitle") or job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("jobDescription") or "")
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()
        apply_url = (
            job.get("applyUrl") or
            f"https://app.x0pa.ai/jobs/{job_id}"
        )
        posted = (job.get("createdAt") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="x0pa",
            external_id=f"x0pa_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=location or None,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


X0PA_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Singapore / APAC government and enterprises
    "moe-sg":               ("Singapore Ministry of Education", "Consumer"),
    "mom-sg":               ("Ministry of Manpower Singapore", "Consumer"),
    "psa-intl":             ("PSA International", "Consumer"),
    "dbs-bank":             ("DBS Bank", "Finance"),
    "uob-sg":               ("United Overseas Bank", "Finance"),
    "ocbc-sg":              ("OCBC Bank", "Finance"),
    "singtel":              ("Singtel", "Tech"),
    "starhub":              ("StarHub", "Tech"),
    "m1-sg":                ("M1 Limited", "Tech"),
    "sats-sg":              ("SATS", "Consumer"),
    "sia-engineering":      ("SIA Engineering", "Consumer"),
    "capitaland":           ("CapitaLand", "Finance"),
    "mapletree":            ("Mapletree Investments", "Finance"),
    "keppel-corp":          ("Keppel Corporation", "Consumer"),
    "sembcorp":             ("Sembcorp Industries", "Consumer"),
    "sme-sg":               ("Singapore SME Centre", "Consumer"),
    "a-star":               ("A*STAR", "Tech"),
    "ntuc-sg":              ("NTUC", "Consumer"),
    "spf-sg":               ("Singapore Police Force", "Consumer"),
    "saf-sg":               ("Singapore Armed Forces", "Consumer"),
}


# ── Batch fetch helpers ─────────────────────────────────────────────────────

def _fetch_all(
    fetch_fn: Callable,
    companies: Dict[str, Tuple[str, str]],
    max_per: int = 200,
    sleep: float = 0.4,
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    ats = fetch_fn.__name__.replace("fetch_", "").replace("_jobs", "")
    for slug, (name, industry) in companies.items():
        try:
            jobs = fetch_fn(slug, name, max_jobs=max_per)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[{ats}] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[{ats}] {name} ({slug}): {type(e).__name__}: {e}\n")
        time.sleep(sleep)
    sys.stderr.write(f"[{ats}] total: {len(results)} jobs\n")
    return results


def fetch_all_darwinbox(companies=None, max_per_company=200):
    return _fetch_all(fetch_darwinbox_jobs, companies or DARWINBOX_COMPANIES, max_per_company)


def fetch_all_keka(companies=None, max_per_company=200):
    return _fetch_all(fetch_keka_jobs, companies or KEKA_COMPANIES, max_per_company)


def fetch_all_turbohire(companies=None, max_per_company=200):
    return _fetch_all(fetch_turbohire_jobs, companies or TURBOHIRE_COMPANIES, max_per_company)


def fetch_all_manatal(companies=None, max_per_company=200):
    return _fetch_all(fetch_manatal_jobs, companies or MANATAL_COMPANIES, max_per_company)


def fetch_all_skeeled(companies=None, max_per_company=200):
    return _fetch_all(fetch_skeeled_jobs, companies or SKEELED_COMPANIES, max_per_company)


def fetch_all_springrecruit(companies=None, max_per_company=200):
    return _fetch_all(fetch_springrecruit_jobs, companies or SPRINGRECRUIT_COMPANIES, max_per_company)


def fetch_all_x0pa(companies=None, max_per_company=200):
    return _fetch_all(fetch_x0pa_jobs, companies or X0PA_COMPANIES, max_per_company)
