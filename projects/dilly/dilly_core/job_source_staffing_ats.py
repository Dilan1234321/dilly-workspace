"""
Staffing & recruiting ATS scrapers: CEIPAL, Avionte, PrismHR, Vincere,
Crelate, JobAdder, Broadbean, LogicMelon, Firefish, TempWorks, Top Echelon.

These are used primarily by staffing agencies that post client job openings
publicly on their career sites.

De-dupe keys:
  "ceipal_<slug>_<job_id>"
  "avionte_<slug>_<job_id>"
  "prismhr_<slug>_<job_id>"
  "vincere_<slug>_<job_id>"
  "crelate_<slug>_<job_id>"
  "jobadder_<slug>_<job_id>"
  "broadbean_<slug>_<job_id>"
  "logicmelon_<slug>_<job_id>"
  "firefish_<slug>_<job_id>"
  "tempworks_<slug>_<job_id>"
  "top_echelon_<slug>_<job_id>"
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

_US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC",
}


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


def _batch(fetch_fn, companies, max_per=200, sleep=0.4):
    results = []
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


# ── CEIPAL ────────────────────────────────────────────────────────────────

def fetch_ceipal_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from CEIPAL (staffing/IT recruiting ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://{slug}.ceipal.com/api/v1/jobs",
        f"https://app.ceipal.com/api/v1/jobs?company={slug}",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[ceipal] {slug}: fetch failed\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("job_id") or job.get("id") or "")
        title = (job.get("job_title") or job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or job.get("job_description") or "")
        city = (job.get("city") or job.get("location") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in (city or "").lower() or "remote" in title.lower()

        apply_url = (
            job.get("apply_url") or
            f"https://{slug}.ceipal.com/jobs/{job_id}/apply"
        )
        posted = (job.get("posted_date") or job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="ceipal",
            external_id=f"ceipal_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=city,
            state=state,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            industry=industry,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


CEIPAL_COMPANIES: Dict[str, Tuple[str, str]] = {
    # CEIPAL is used heavily by IT staffing agencies
    "mastech-digital":      ("Mastech Digital", "Tech"),
    "softpath-systems":     ("Softpath Systems", "Tech"),
    "infosys-bpm":          ("Infosys BPM", "Tech"),
    "hcl-america":          ("HCL America", "Tech"),
    "wipro-technologies":   ("Wipro Technologies", "Tech"),
    "cognizant-staffing":   ("Cognizant Staffing", "Tech"),
    "kforce-staffing":      ("Kforce Technology", "Tech"),
    "insight-global-it":    ("Insight Global IT", "Tech"),
    "tsm-consulting":       ("TSM Consulting", "Tech"),
    "cyient-consulting":    ("Cyient", "Tech"),
    "hexaware-staffing":    ("Hexaware Technologies", "Tech"),
    "tech-mahindra-staffing":("Tech Mahindra", "Tech"),
    "mphasis-staffing":     ("Mphasis", "Tech"),
    "zensar-staffing":      ("Zensar Technologies", "Tech"),
    "geometric-staffing":   ("Geometric", "Tech"),
    "niit-staffing":        ("NIIT Technologies", "Tech"),
    "syntel-staffing":      ("Syntel", "Tech"),
    "igate-staffing":       ("iGate", "Tech"),
    "patni-staffing":       ("Patni Computer Systems", "Tech"),
    "zensar-consulting":    ("Zensar Consulting", "Tech"),
    # US IT staffing firms
    "comforce-it":          ("COMFORCE IT", "Tech"),
    "teksystems-it":        ("TEKsystems", "Tech"),
    "modis-staffing":       ("Modis", "Tech"),
    "avanade-staffing":     ("Avanade", "Tech"),
    "iknow-staffing":       ("IKnow Staffing", "Tech"),
    "genesis10-it":         ("Genesis10", "Tech"),
    "highspring-staffing":  ("Highspring Staffing", "Tech"),
    "client-solve":         ("Client Solve", "Tech"),
    "diverse-staffing":     ("Diverse Staffing", "Tech"),
    "itlinx":               ("ITLinx", "Tech"),
}


# ── Avionte (staffing ATS for light industrial + professional) ────────────

def fetch_avionte_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Avionte Bold (staffing ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://{slug}.avionteboldbolt.com/api/v2/joborders?status=active",
        f"https://{slug}.aviontebol.com/jobs/feed.json",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[avionte] {slug}: fetch failed\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobOrders", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or job.get("jobOrderId") or "")
        title = (job.get("title") or job.get("jobTitle") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        city = (job.get("city") or "").strip() or None
        state_raw = (job.get("state") or job.get("stateCode") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower()

        apply_url = (
            job.get("applyUrl") or
            f"https://{slug}.avionteboldbolt.com/jobs/{job_id}"
        )
        posted = (job.get("dateAdded") or job.get("createdAt") or "")[:10]
        dept = (job.get("department") or job.get("category") or "").strip()

        results.append(_make_job(
            ats="avionte",
            external_id=f"avionte_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=city,
            state=state,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            industry="consumer",
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


AVIONTE_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Light industrial and professional staffing firms using Avionte
    "staffmark-avionte":    ("Staffmark", "Consumer"),
    "spherion-avionte":     ("Spherion", "Consumer"),
    "adia-staffing":        ("Adia", "Consumer"),
    "resourcemfg-avi":      ("ResourceMFG", "Consumer"),
    "tradesmen-avi":        ("Tradesmen International", "Consumer"),
    "labor-ready":          ("TrueBlue (Labor Ready)", "Consumer"),
    "staffing-solutions-ent":("Staffing Solutions Enterprises", "Consumer"),
    "complete-staffing":    ("Complete Staffing Solutions", "Consumer"),
    "qualified-staffing-avi":("Qualified Staffing", "Consumer"),
    "firstsource-solutions":("FirstSource Solutions", "Consumer"),
    "manpower-avi":         ("ManpowerGroup Avionte", "Consumer"),
    "kelly-industrial":     ("Kelly Industrial", "Consumer"),
    "adecco-industrial":    ("Adecco Industrial", "Consumer"),
    "aerotek-industrial":   ("Aerotek Industrial", "Consumer"),
    "cintas-staffing":      ("Cintas Staffing", "Consumer"),
    "g4s-staffing":         ("G4S Staffing", "Consumer"),
    "securitas-staffing":   ("Securitas Staffing", "Consumer"),
    "allied-universal-staff":("Allied Universal Staffing", "Consumer"),
    "usprotect":            ("US Protect", "Consumer"),
    "firstguard":           ("FirstGuard Security", "Consumer"),
}


# ── PrismHR (PEO / ASO HR platform) ──────────────────────────────────────

def fetch_prismhr_jobs(
    client_id: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from PrismHR (Professional Employer Organization platform)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://secure.prismhr.com/client/{client_id}/api/v1/jobs",
        f"https://jobs.prismhr.com/api/v1/jobs?client={client_id}",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[prismhr] {client_id}: fetch failed\n")
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
        city = (job.get("city") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower()

        apply_url = (
            job.get("apply_url") or
            f"https://jobs.prismhr.com/{client_id}/job/{job_id}"
        )
        posted = (job.get("posted_date") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="prismhr",
            external_id=f"prismhr_{client_id}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=city,
            state=state,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


PRISMHR_COMPANIES: Dict[str, Tuple[str, str]] = {
    # PEO companies that use PrismHR — SMBs that outsource HR
    "extensis-hr":          ("Extensis HR", "Consumer"),
    "genesys-health":       ("Genesys Health", "Healthcare"),
    "oasis-outsourcing":    ("Oasis Outsourcing", "Consumer"),
    "vensure-employer":     ("Vensure Employer Services", "Consumer"),
    "trinet-prism":         ("TriNet PrismHR", "Consumer"),
    "insperity-prism":      ("Insperity PrismHR", "Consumer"),
    "paychex-peo":          ("Paychex PEO", "Consumer"),
    "adp-peo-prism":        ("ADP TotalSource", "Consumer"),
    "justworks-prism":      ("Justworks", "Tech"),
    "gusto-peo":            ("Gusto PEO", "Tech"),
    "rippling-prism":       ("Rippling PEO", "Tech"),
    "bamboo-peo":           ("BambooHR PEO", "Tech"),
    "namely-hr":            ("Namely HR", "Tech"),
    "zenefits-prism":       ("Zenefits", "Tech"),
    "sequoia-benefits":     ("Sequoia Benefits", "Finance"),
    "hrone-consulting":     ("HR One Consulting", "Consumer"),
    "hrns-group":           ("HRNS Group", "Consumer"),
    "peo-nationwide":       ("PEO Nationwide", "Consumer"),
    "hrpro-outsourcing":    ("HR Pro Outsourcing", "Consumer"),
    "abacus-payroll":       ("Abacus Payroll", "Finance"),
}


# ── JobAdder (Australian / UK staffing ATS) ───────────────────────────────

def fetch_jobadder_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from JobAdder (Australia/UK staffing ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://{slug}.jobadder.com/api/v2/jobads?limit=100",
        f"https://{slug}.jobadder.com/jobs/feed",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[jobadder] {slug}: fetch failed\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("items", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("jobAdId") or job.get("id") or "")
        title = (job.get("title") or job.get("jobTitle") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("summary") or job.get("description") or "")
        location = (job.get("location") or {})
        city = (location.get("name") if isinstance(location, dict) else str(location)).strip() or None
        is_remote = "remote" in (city or "").lower()

        apply_url = (
            job.get("ref") or
            job.get("applyUrl") or
            f"https://{slug}.jobadder.com/job/{job_id}"
        )
        posted = (job.get("createdAt") or job.get("postedAt") or "")[:10]
        dept = (job.get("category") or {})
        dept_name = dept.get("name", "") if isinstance(dept, dict) else str(dept)

        results.append(_make_job(
            ats="jobadder",
            external_id=f"jobadder_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=city,
            is_remote=is_remote,
            dept=dept_name,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


JOBADDER_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Australian and NZ staffing firms (JobAdder's primary market)
    "hays-anz":             ("Hays ANZ", "Consumer"),
    "michael-page-anz":     ("Michael Page ANZ", "Consumer"),
    "robert-half-anz":      ("Robert Half ANZ", "Consumer"),
    "hudson-anz":           ("Hudson ANZ", "Consumer"),
    "people2people":        ("people2people", "Consumer"),
    "davidson-staffing":    ("Davidson Recruitment", "Consumer"),
    "recruitment-solutions":("Recruitment Solutions", "Consumer"),
    "white-collar-anz":     ("White Collar Blue", "Consumer"),
    "fourquarters":         ("FourQuarters Recruitment", "Consumer"),
    "kaizen-recruit":       ("Kaizen Recruitment", "Consumer"),
    "ambition-group":       ("Ambition Group", "Consumer"),
    "watermark-search":     ("Watermark Search International", "Consumer"),
    "beaumont-people":      ("Beaumont People", "Consumer"),
    "talent-right":         ("Talent Right", "Consumer"),
    "salt-anz":             ("Salt ANZ", "Consumer"),
    "tiger-recruitment":    ("Tiger Recruitment", "Consumer"),
    "sharp-carter":         ("Sharp & Carter", "Consumer"),
    "hender-group":         ("Hender Group", "Consumer"),
    "searson-buck":         ("Searson Buck Recruitment", "Consumer"),
    "profusion":            ("Profusion Group", "Consumer"),
    # UK staffing firms using JobAdder
    "tiger-uk":             ("Tiger Recruitment UK", "Consumer"),
    "nicholson-glover":     ("Nicholson Glover", "Consumer"),
    "talent-spark":         ("Talent Spark", "Consumer"),
    "distinct-recruitment": ("Distinct Recruitment", "Consumer"),
    "digital-republic":     ("Digital Republic Recruitment", "Consumer"),
    "pod-talent":           ("Pod Talent", "Consumer"),
    "bramwith-consulting":  ("Bramwith Consulting", "Consumer"),
    "empiric-solutions":    ("Empiric Solutions", "Consumer"),
    "oscar-recruitment":    ("OSCAR Technology", "Consumer"),
    "la-fosse-associates":  ("La Fosse Associates", "Consumer"),
}


# ── Broadbean (job distribution) ──────────────────────────────────────────

def fetch_broadbean_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Broadbean (job distribution + ATS integration)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://my.broadbean.com/api/v1/jobs/{slug}?format=json"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[broadbean] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", [])

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("reference") or job.get("id") or "")
        title = (job.get("title") or job.get("jobTitle") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        city = (job.get("location") or job.get("city") or "").strip() or None
        state_raw = (job.get("region") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in (city or "").lower()

        apply_url = job.get("url") or f"https://my.broadbean.com/jobs/{job_id}"
        posted = (job.get("datePosted") or "")[:10]
        dept = (job.get("sector") or job.get("department") or "").strip()

        results.append(_make_job(
            ats="broadbean",
            external_id=f"broadbean_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=city,
            state=state,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


BROADBEAN_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Broadbean is used by UK and EMEA staffing agencies
    "gi-group":             ("Gi Group", "Consumer"),
    "manpower-eu":          ("ManpowerGroup Europe", "Consumer"),
    "adecco-eu":            ("Adecco Europe", "Consumer"),
    "hays-uk":              ("Hays UK", "Consumer"),
    "robert-half-uk":       ("Robert Half UK", "Consumer"),
    "michael-page-uk":      ("Michael Page UK", "Consumer"),
    "page-group":           ("PageGroup", "Consumer"),
    "blue-arrow":           ("Blue Arrow", "Consumer"),
    "pertemps":             ("Pertemps Network Group", "Consumer"),
    "manpower-uk":          ("ManpowerGroup UK", "Consumer"),
    "reed-staffing":        ("Reed", "Consumer"),
    "randstad-uk":          ("Randstad UK", "Consumer"),
    "vedior-uk":            ("Vedior UK", "Consumer"),
    "select-uk":            ("Select Service Partner UK", "Consumer"),
    "talentsolutions":      ("Talent Solutions UK", "Consumer"),
    "experis-uk":           ("Experis UK", "Consumer"),
    "brook-street":         ("Brook Street", "Consumer"),
    "kelly-uk":             ("Kelly UK", "Consumer"),
    "corestaff-uk":         ("CoreStaff UK", "Consumer"),
    "search-consult":       ("Search Consultancy", "Consumer"),
}


# ── Firefish (UK recruitment CRM + ATS) ───────────────────────────────────

def fetch_firefish_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Firefish (UK recruitment software)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.firefishsoftware.com/api/v1/jobs"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[firefish] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", [])

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or job.get("jobTitle") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or "").strip()
        is_remote = "remote" in location.lower()

        apply_url = (
            job.get("url") or
            f"https://{slug}.firefishsoftware.com/jobs/{job_id}"
        )
        posted = (job.get("dateCreated") or "")[:10]
        dept = (job.get("sector") or job.get("discipline") or "").strip()

        results.append(_make_job(
            ats="firefish",
            external_id=f"firefish_{slug}_{job_id}",
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


FIREFISH_COMPANIES: Dict[str, Tuple[str, str]] = {
    # UK recruitment agencies using Firefish
    "it-works-group":       ("IT Works Group", "Tech"),
    "hive-it":              ("Hive IT", "Tech"),
    "circle-it":            ("Circle Recruitment IT", "Tech"),
    "pure-technology":      ("Pure Technology Recruitment", "Tech"),
    "arc-it-recruitment":   ("ARC IT Recruitment", "Tech"),
    "nexus-it":             ("Nexus IT Recruitment", "Tech"),
    "redtech-recruit":      ("Redtech Recruitment", "Tech"),
    "blue-orange-digital":  ("Blue Orange Digital", "Tech"),
    "mason-frank":          ("Mason Frank International", "Tech"),
    "burns-sheehan":        ("Burns Sheehan", "Tech"),
    "forward-role":         ("Forward Role Recruitment", "Tech"),
    "talent-works-intl":    ("Talent Works International", "Tech"),
    "nigel-frank":          ("Nigel Frank International", "Tech"),
    "darwin-recruitment":   ("Darwin Recruitment", "Tech"),
    "sphere-digital":       ("Sphere Digital Recruitment", "Tech"),
    "quantica-tech":        ("Quantica Technology", "Tech"),
    "amber-mace":           ("Amber Mace", "Tech"),
    "gattaca-plc":          ("Gattaca PLC", "Tech"),
    "matchtech":            ("Matchtech", "Tech"),
    "exacta-solutions":     ("Exacta Solutions", "Tech"),
}


# ── Vincere (global staffing CRM + ATS) ──────────────────────────────────

def fetch_vincere_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Vincere (global recruitment CRM)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.vincere.io/api/v1/jobs?status=active&limit=100"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[vincere] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("response", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("job_title") or job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or {})
        city = (location.get("city") if isinstance(location, dict) else str(location)).strip() or None
        is_remote = "remote" in (city or "").lower()

        apply_url = (
            job.get("apply_url") or
            f"https://{slug}.vincere.io/jobs/{job_id}"
        )
        posted = (job.get("created") or "")[:10]
        dept = (job.get("function") or job.get("category") or "").strip()

        results.append(_make_job(
            ats="vincere",
            external_id=f"vincere_{slug}_{job_id}",
            company=company_name,
            title=title,
            description=desc,
            apply_url=apply_url,
            city=city,
            is_remote=is_remote,
            dept=dept,
            posted=posted,
            classify_listing=classify_listing,
            extract_tags=extract_tags,
        ))

    return results


VINCERE_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Global recruitment agencies using Vincere
    "kaizen-global":        ("Kaizen Recruitment Global", "Consumer"),
    "salt-global":          ("Salt Global", "Consumer"),
    "michael-page-global":  ("Michael Page Global", "Consumer"),
    "robert-walters":       ("Robert Walters", "Consumer"),
    "morgan-mckinley":      ("Morgan McKinley", "Consumer"),
    "walters-people":       ("Walters People", "Consumer"),
    "bss-staffing":         ("BSS Staffing", "Consumer"),
    "link-group-anz":       ("Link Group ANZ", "Consumer"),
    "paxus-it":             ("Paxus IT Recruitment", "Consumer"),
    "hays-it":              ("Hays IT Recruitment", "Consumer"),
    "bayside-group":        ("Bayside Group", "Consumer"),
    "rec-con":              ("Rec-Con", "Consumer"),
    "adaps-it":             ("ADAPS IT", "Consumer"),
    "slade-group":          ("Slade Group", "Consumer"),
    "recruitment-plus":     ("Recruitment Plus", "Consumer"),
    "talentpath":           ("Talentpath", "Consumer"),
    "global-talent-sg":     ("Global Talent Singapore", "Consumer"),
    "achieve-group":        ("Achieve Group", "Consumer"),
    "persolkelly-ap":       ("Persolkelly APAC", "Consumer"),
    "rge-staffing":         ("RGE Staffing", "Consumer"),
}


# ── Batch helpers ────────────────────────────────────────────────────────────

def fetch_all_ceipal(companies=None, max_per_company=200):
    return _batch(fetch_ceipal_jobs, companies or CEIPAL_COMPANIES, max_per_company)


def fetch_all_avionte(companies=None, max_per_company=200):
    return _batch(fetch_avionte_jobs, companies or AVIONTE_COMPANIES, max_per_company)


def fetch_all_prismhr(companies=None, max_per_company=200):
    return _batch(fetch_prismhr_jobs, companies or PRISMHR_COMPANIES, max_per_company)


def fetch_all_jobadder(companies=None, max_per_company=200):
    return _batch(fetch_jobadder_jobs, companies or JOBADDER_COMPANIES, max_per_company)


def fetch_all_broadbean(companies=None, max_per_company=200):
    return _batch(fetch_broadbean_jobs, companies or BROADBEAN_COMPANIES, max_per_company)


def fetch_all_firefish(companies=None, max_per_company=200):
    return _batch(fetch_firefish_jobs, companies or FIREFISH_COMPANIES, max_per_company)


def fetch_all_vincere(companies=None, max_per_company=200):
    return _batch(fetch_vincere_jobs, companies or VINCERE_COMPANIES, max_per_company)
