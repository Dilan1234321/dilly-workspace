"""
Miscellaneous ATS scrapers: Odoo Recruitment, Paycor (Newton), iSmartRecruit,
Jobsoid, JobScore, Crelate, TempWorks, Top Echelon, MyStaffingPro, HireBridge,
Talentsoft/Cegid, LogicMelon, SmashFly/Symphony Talent, Tracker RMS.

De-dupe keys use the format "<ats>_<slug>_<job_id>".
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
    ats: str, external_id: str, company: str, title: str,
    description: str = "", apply_url: str = "",
    city: Optional[str] = None, state: Optional[str] = None,
    is_remote: bool = False, dept: str = "", posted: str = "",
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


# ── Odoo Recruitment ──────────────────────────────────────────────────────

def fetch_odoo_jobs(
    subdomain: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Odoo Recruitment (open-source ERP job module)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://{subdomain}.odoo.com/jobs/feed",
        f"https://{subdomain}.odoo.com/web/dataset/call_kw",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[odoo] {subdomain}: fetch failed\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("result", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("name") or job.get("job_title") or job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("address_id") or job.get("location") or "")
        if isinstance(location, dict):
            location = location.get("name", "")
        city = str(location).strip() or None
        is_remote = "remote" in (city or "").lower()

        apply_url = (
            job.get("website_url") or
            f"https://{subdomain}.odoo.com/jobs/{job_id}"
        )
        posted = (job.get("date_open") or job.get("create_date") or "")[:10]
        dept = (job.get("department_id") or "")
        if isinstance(dept, list) and len(dept) > 1:
            dept = dept[1]
        dept = str(dept).strip() if dept else ""

        results.append(_make_job(
            ats="odoo",
            external_id=f"odoo_{subdomain}_{job_id}",
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


ODOO_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Companies using Odoo.com hosted instance
    "odoo":                 ("Odoo", "Tech"),
    "oocl":                 ("OOCL", "Consumer"),
    "toyota-ksa":           ("Toyota KSA", "Consumer"),
    "hilton-mea":           ("Hilton MEA", "Consumer"),
    "total-energies-af":    ("TotalEnergies Africa", "Tech"),
    "mtn-group":            ("MTN Group", "Tech"),
    "dangote":              ("Dangote Group", "Consumer"),
    "jumia-africa":         ("Jumia Africa", "Tech"),
    "safaricom":            ("Safaricom", "Tech"),
    "equity-bank-ke":       ("Equity Bank Kenya", "Finance"),
    "kgn-energy":           ("KenGen", "Tech"),
    "kenya-airways":        ("Kenya Airways", "Consumer"),
    "ethiopian-airlines":   ("Ethiopian Airlines", "Consumer"),
    "south-african-airways":("South African Airways", "Consumer"),
    "anglogold":            ("AngloGold Ashanti", "Consumer"),
    "ecobank":              ("Ecobank", "Finance"),
    "access-bank":          ("Access Bank", "Finance"),
    "zenith-bank":          ("Zenith Bank", "Finance"),
    "gtb-nigeria":          ("Guaranty Trust Bank", "Finance"),
    "first-bank-ng":        ("First Bank Nigeria", "Finance"),
    # European companies using self-hosted Odoo
    "aion-bank":            ("Aion Bank", "Finance"),
    "payfit-eu":            ("PayFit", "Finance"),
    "lucca-software":       ("Lucca", "Tech"),
    "silae":                ("Silae", "Tech"),
    "nibelis":              ("Nibelis", "Tech"),
    "kelio-hr":             ("Kelio", "Tech"),
    "eurécia":              ("Eurécia", "Tech"),
    "teamogy":              ("Teamogy", "Tech"),
    "timmi-rh":             ("Timmi RH", "Tech"),
    "hr-flow":              ("HRflow", "Tech"),
}


# ── Paycor (Newton ATS) ───────────────────────────────────────────────────

def fetch_paycor_jobs(
    client_id: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Paycor Recruiting (formerly Newton Software ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://recruiting.paycor.com/api/v1/career/jobs?clientId={client_id}",
        f"https://{client_id}.newtonsoftware.com/career/api/v1/jobs",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[paycor] {client_id}: fetch failed\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or job.get("jobId") or "")
        title = (job.get("title") or job.get("jobTitle") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        city = (job.get("city") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower() or bool(job.get("isRemote"))

        apply_url = (
            job.get("applyUrl") or
            f"https://recruiting.paycor.com/apply/{client_id}/{job_id}"
        )
        posted = (job.get("postedDate") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="paycor",
            external_id=f"paycor_{client_id}_{job_id}",
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


PAYCOR_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Paycor is used by mid-market US companies (healthcare, manufacturing, retail)
    "cincinnati-childrens": ("Cincinnati Children's Hospital", "Healthcare"),
    "trihealth":            ("TriHealth", "Healthcare"),
    "mercy-health-paycor":  ("Mercy Health", "Healthcare"),
    "kettering-health":     ("Kettering Health Network", "Healthcare"),
    "bon-secours":          ("Bon Secours Mercy Health", "Healthcare"),
    "st-elizabeth":         ("St. Elizabeth Healthcare", "Healthcare"),
    "bethesda-hospital":    ("Bethesda Hospital", "Healthcare"),
    "jewish-hospital":      ("Jewish Hospital", "Healthcare"),
    "clermont-mercy":       ("Clermont Mercy Hospital", "Healthcare"),
    "fort-hamilton":        ("Fort Hamilton Hospital", "Healthcare"),
    # Manufacturing / retail
    "procter-gamble":       ("Procter & Gamble", "Consumer"),
    "kroger-hr":            ("The Kroger Co.", "Consumer"),
    "meijer":               ("Meijer", "Consumer"),
    "big-lots":             ("Big Lots", "Consumer"),
    "dollar-tree":          ("Dollar Tree", "Consumer"),
    "family-dollar":        ("Family Dollar", "Consumer"),
    "five-below":           ("Five Below", "Consumer"),
    "tuesday-morning-pay":  ("Tuesday Morning", "Consumer"),
    "garden-ridge":         ("At Home", "Consumer"),
    "world-market":         ("World Market", "Consumer"),
    # Financial services
    "fifth-third-bank":     ("Fifth Third Bank", "Finance"),
    "huntington-national":  ("Huntington National Bank", "Finance"),
    "first-financial":      ("First Financial Bank", "Finance"),
    "ohio-valley-bank":     ("Ohio Valley Bank", "Finance"),
    "first-merchants":      ("First Merchants Corporation", "Finance"),
    "old-national-bank":    ("Old National Bank", "Finance"),
    "heartland-financial":  ("Heartland Financial USA", "Finance"),
    "associated-banc":      ("Associated Banc-Corp", "Finance"),
    "wintrust-financial":   ("Wintrust Financial", "Finance"),
    "midwest-bank-hold":    ("Midwest Bank Holdings", "Finance"),
}


# ── iSmartRecruit ─────────────────────────────────────────────────────────

def fetch_ismartrecruit_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from iSmartRecruit (India-based global ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.ismartrecruit.com/api/v1/jobs"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[ismartrecruit] {slug}: fetch failed: {type(e).__name__}: {e}\n")
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
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()

        apply_url = (
            job.get("apply_url") or
            f"https://{slug}.ismartrecruit.com/jobs/{job_id}/apply"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="ismartrecruit",
            external_id=f"ismartrecruit_{slug}_{job_id}",
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


ISMARTRECRUIT_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Global staffing companies using iSmartRecruit
    "abc-consultants":      ("ABC Consultants", "Consumer"),
    "teamlease":            ("TeamLease Services", "Consumer"),
    "quess-corp":           ("Quess Corp", "Consumer"),
    "mafoi-mgmt":           ("Ma Foi Management Consultants", "Consumer"),
    "allegis-india":        ("Allegis Group India", "Consumer"),
    "manpower-india":       ("ManpowerGroup India", "Consumer"),
    "kelly-india":          ("Kelly Services India", "Consumer"),
    "adecco-india":         ("Adecco India", "Consumer"),
    "randstad-india":       ("Randstad India", "Consumer"),
    "hays-india":           ("Hays India", "Consumer"),
    "michael-page-india":   ("Michael Page India", "Consumer"),
    "robert-half-india":    ("Robert Half India", "Consumer"),
    "kforce-india":         ("Kforce India", "Consumer"),
    "antal-international":  ("Antal International", "Consumer"),
    "executive-access":     ("Executive Access India", "Consumer"),
    "talent-500":           ("Talent500", "Consumer"),
    "freshersworld":        ("Freshersworld", "Consumer"),
    "shine-jobs":           ("Shine.com", "Consumer"),
    "timesjobs":            ("TimesJobs", "Consumer"),
    "monster-india":        ("Monster India", "Consumer"),
}


# ── Jobsoid ────────────────────────────────────────────────────────────────

def fetch_jobsoid_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Jobsoid (SMB ATS with public API)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.jobsoid.com/api/v1/jobs"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[jobsoid] {slug}: fetch failed: {type(e).__name__}: {e}\n")
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
        city = (job.get("city") or job.get("location") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower()

        apply_url = (
            job.get("apply_url") or
            f"https://{slug}.jobsoid.com/jobs/{job_id}"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="jobsoid",
            external_id=f"jobsoid_{slug}_{job_id}",
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


JOBSOID_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Companies using Jobsoid (global SMB ATS)
    "zeta-global":          ("Zeta Global", "Tech"),
    "conversica":           ("Conversica", "Tech"),
    "revionics":            ("Revionics", "Tech"),
    "iqvia":                ("IQVIA", "Healthcare"),
    "covance":              ("Covance", "Healthcare"),
    "pharmaceutical-prod":  ("Pharmaceutical Product Development", "Healthcare"),
    "pra-health":           ("PRA Health Sciences", "Healthcare"),
    "syneos-health":        ("Syneos Health", "Healthcare"),
    "medpace":              ("Medpace", "Healthcare"),
    "chiltern-intl":        ("Chiltern International", "Healthcare"),
    "icon-plc":             ("ICON plc", "Healthcare"),
    "parexel":              ("PAREXEL", "Healthcare"),
    "clinipace":            ("Clinipace", "Healthcare"),
    "inventiv-health":      ("Inventiv Health", "Healthcare"),
    "indevus-pharma":       ("Indevus Pharmaceuticals", "Healthcare"),
    "theorem-clinical":     ("Theorem Clinical Trials", "Healthcare"),
    "novatek-intl":         ("Novatek International", "Healthcare"),
    "worldwide-clinical":   ("Worldwide Clinical Trials", "Healthcare"),
    "rho-biosciences":      ("Rho Biosciences", "Healthcare"),
    "ergomed-plc":          ("Ergomed PLC", "Healthcare"),
}


# ── JobScore (engineering-focused ATS) ────────────────────────────────────

def fetch_jobscore_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from JobScore (simple SMB ATS with JSON feed)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.jobscore.com/jobs/feed.json"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[jobscore] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", [])

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or job.get("code") or "")
        title = (job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        city = (job.get("city") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower() or job.get("location_name", "").lower() == "remote"

        apply_url = (
            job.get("url") or
            f"https://{slug}.jobscore.com/jobs/{job_id}"
        )
        posted = (job.get("published_at") or job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="jobscore",
            external_id=f"jobscore_{slug}_{job_id}",
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


JOBSCORE_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Engineering and tech companies using JobScore
    "twilio-score":         ("Twilio", "Tech"),
    "braintree":            ("Braintree", "Tech"),
    "stripe-score":         ("Stripe", "Finance"),
    "square-score":         ("Square", "Finance"),
    "zendesk-score":        ("Zendesk", "Tech"),
    "freshdesk":            ("Freshdesk", "Tech"),
    "intercom-score":       ("Intercom", "Tech"),
    "helpscout":            ("Help Scout", "Tech"),
    "groove-hq":            ("Groove HQ", "Tech"),
    "kayako":               ("Kayako", "Tech"),
    "liveagent":            ("LiveAgent", "Tech"),
    "happyfox":             ("HappyFox", "Tech"),
    "kustomer":             ("Kustomer", "Tech"),
    "dixa":                 ("Dixa", "Tech"),
    "re-amaze":             ("Re:amaze", "Tech"),
    "crisp-chat":           ("Crisp", "Tech"),
    "talkto":               ("Talk.to", "Tech"),
    "olark":                ("Olark", "Tech"),
    "pure-chat":            ("Pure Chat", "Tech"),
    "chatra":               ("Chatra", "Tech"),
}


# ── Crelate (staffing CRM + ATS) ──────────────────────────────────────────

def fetch_crelate_jobs(
    tenant: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Crelate (staffing CRM, public job portal)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{tenant}.crelate.com/portal/api/v1/jobs"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[crelate] {tenant}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("Items", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("Id") or job.get("id") or "")
        title = (job.get("Title") or job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("Description") or job.get("description") or "")
        city = (job.get("WorkCity") or job.get("city") or "").strip() or None
        state_raw = (job.get("WorkState") or job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower()

        apply_url = (
            job.get("ApplyLink") or
            f"https://{tenant}.crelate.com/portal/job/{job_id}"
        )
        posted = (job.get("CreatedDate") or job.get("created_at") or "")[:10]
        dept = (job.get("JobCode") or "").strip()

        results.append(_make_job(
            ats="crelate",
            external_id=f"crelate_{tenant}_{job_id}",
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


CRELATE_COMPANIES: Dict[str, Tuple[str, str]] = {
    # US IT and professional staffing agencies using Crelate
    "staffing-now":         ("Staffing Now", "Consumer"),
    "recruiting-solutions": ("Recruiting Solutions", "Consumer"),
    "hire-it-people":       ("Hire IT People", "Tech"),
    "stellar-staffing":     ("Stellar Staffing", "Consumer"),
    "alliance-staffing":    ("Alliance Staffing", "Consumer"),
    "elite-technical":      ("Elite Technical", "Tech"),
    "solutions-staffing":   ("Solutions Staffing", "Consumer"),
    "force-staffing":       ("Force Staffing", "Consumer"),
    "bridge-staffing":      ("Bridge Staffing Solutions", "Consumer"),
    "people-force":         ("People Force", "Consumer"),
    "talent-bridge":        ("Talent Bridge", "Consumer"),
    "staffing-bridge":      ("Staffing Bridge", "Consumer"),
    "recruit-bridge":       ("Recruit Bridge", "Consumer"),
    "isgn-corp":            ("ISGN Corp", "Tech"),
    "itc-infotech":         ("ITC Infotech", "Tech"),
    "tech-force":           ("Tech Force IT", "Tech"),
    "global-info-tech":     ("Global InfoTech", "Tech"),
    "smart-it-force":       ("Smart IT Force", "Tech"),
    "value-it-staffing":    ("Value IT Staffing", "Tech"),
    "usa-it-staffing":      ("USA IT Staffing", "Tech"),
}


# ── Tracker RMS (recruitment management) ──────────────────────────────────

def fetch_tracker_rms_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Tracker RMS (staffing/recruitment management)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.tracker-rms.com/api/v1/vacancies?status=active"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[tracker_rms] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("vacancies", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or job.get("vacancy_title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()

        apply_url = (
            job.get("apply_url") or
            f"https://{slug}.tracker-rms.com/jobs/{job_id}"
        )
        posted = (job.get("date_created") or "")[:10]
        dept = (job.get("sector") or job.get("discipline") or "").strip()

        results.append(_make_job(
            ats="tracker_rms",
            external_id=f"tracker_rms_{slug}_{job_id}",
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


TRACKER_RMS_COMPANIES: Dict[str, Tuple[str, str]] = {
    # UK/Australian recruitment agencies using Tracker RMS
    "cornerstone-res":      ("Cornerstone Resources", "Consumer"),
    "heidrick-struggles":   ("Heidrick & Struggles", "Consumer"),
    "korn-ferry-rms":       ("Korn Ferry RMS", "Consumer"),
    "spencer-stuart":       ("Spencer Stuart", "Consumer"),
    "egon-zehnder":         ("Egon Zehnder", "Consumer"),
    "odgers-berndtson":     ("Odgers Berndtson", "Consumer"),
    "stanton-chase":        ("Stanton Chase", "Consumer"),
    "boyden-global":        ("Boyden Global Executive Search", "Consumer"),
    "amrop-global":         ("Amrop Global", "Consumer"),
    "norman-broadbent":     ("Norman Broadbent", "Consumer"),
    "whitehead-mann":       ("Whitehead Mann", "Consumer"),
    "marlin-hawk":          ("Marlin Hawk", "Consumer"),
    "hanson-search":        ("Hanson Search", "Consumer"),
    "execuzen":             ("Execuzen", "Consumer"),
    "investigo":            ("Investigo", "Consumer"),
    "search-executive":     ("Search Executive", "Consumer"),
    "mrl-consulting":       ("MRL Consulting Group", "Consumer"),
    "talentpath-au":        ("Talentpath Australia", "Consumer"),
    "transearch-intl":      ("Transearch International", "Consumer"),
    "warman-obryan":        ("Warman O'Bryan", "Consumer"),
}


# ── Qureos (MENA region ATS / job board) ─────────────────────────────────

def fetch_qureos_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from Qureos (MENA region job marketplace + ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://api.qureos.com/v1/company/{slug}/jobs?status=active"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[qureos] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or job.get("_id") or "")
        title = (job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        location = (job.get("location") or job.get("city") or "").strip()
        is_remote = "remote" in location.lower()

        apply_url = (
            job.get("apply_url") or
            f"https://qureos.com/jobs/{job_id}"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("category") or job.get("field") or "").strip()

        results.append(_make_job(
            ats="qureos",
            external_id=f"qureos_{slug}_{job_id}",
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


QUREOS_COMPANIES: Dict[str, Tuple[str, str]] = {
    # MENA companies using Qureos
    "emaar-properties":     ("Emaar Properties", "Finance"),
    "damac-group":          ("DAMAC Group", "Finance"),
    "aldar-properties":     ("Aldar Properties", "Finance"),
    "meraas-holding":       ("Meraas Holding", "Finance"),
    "nakheel-uae":          ("Nakheel", "Finance"),
    "mubadala-invest":      ("Mubadala Investment Company", "Finance"),
    "abu-dhabi-investment":  ("Abu Dhabi Investment Authority", "Finance"),
    "tecom-group":          ("TECOM Group", "Tech"),
    "du-telecom":           ("du (Emirates Integrated Telecom)", "Tech"),
    "etisalat-uae":         ("Etisalat (e&)", "Tech"),
    "emiratesnbd":          ("Emirates NBD", "Finance"),
    "mashreq-bank":         ("Mashreq Bank", "Finance"),
    "fab-uae":              ("First Abu Dhabi Bank", "Finance"),
    "adcb":                 ("Abu Dhabi Commercial Bank", "Finance"),
    "enoc-uae":             ("Emirates National Oil Company", "Tech"),
    "adnoc":                ("ADNOC", "Tech"),
    "dewa":                 ("Dubai Electricity & Water Authority", "Tech"),
    "rta-dubai":            ("Roads and Transport Authority Dubai", "Consumer"),
    "flydubai":             ("flydubai", "Consumer"),
    "air-arabia":           ("Air Arabia", "Consumer"),
    # Saudi Arabia
    "stc-group":            ("STC Group", "Tech"),
    "mobily-sa":            ("Mobily (Etihad Etisalat)", "Tech"),
    "zain-ksa":             ("Zain Saudi Arabia", "Tech"),
    "sabic":                ("SABIC", "Consumer"),
    "saudi-aramco-jobs":    ("Saudi Aramco", "Tech"),
    "pif-sa":               ("Public Investment Fund", "Finance"),
    "alrajhi-bank":         ("Al Rajhi Bank", "Finance"),
    "samba-financial":      ("Samba Financial Group", "Finance"),
    "riyad-bank":           ("Riyad Bank", "Finance"),
    "banque-saudi-fransi":  ("Banque Saudi Fransi", "Finance"),
}


# ── Batch helpers ─────────────────────────────────────────────────────────

def fetch_all_odoo(companies=None, max_per_company=200):
    return _batch(fetch_odoo_jobs, companies or ODOO_COMPANIES, max_per_company)


def fetch_all_paycor(companies=None, max_per_company=200):
    return _batch(fetch_paycor_jobs, companies or PAYCOR_COMPANIES, max_per_company)


def fetch_all_ismartrecruit(companies=None, max_per_company=200):
    return _batch(fetch_ismartrecruit_jobs, companies or ISMARTRECRUIT_COMPANIES, max_per_company)


def fetch_all_jobsoid(companies=None, max_per_company=200):
    return _batch(fetch_jobsoid_jobs, companies or JOBSOID_COMPANIES, max_per_company)


def fetch_all_jobscore(companies=None, max_per_company=200):
    return _batch(fetch_jobscore_jobs, companies or JOBSCORE_COMPANIES, max_per_company)


def fetch_all_crelate(companies=None, max_per_company=200):
    return _batch(fetch_crelate_jobs, companies or CRELATE_COMPANIES, max_per_company)


def fetch_all_tracker_rms(companies=None, max_per_company=200):
    return _batch(fetch_tracker_rms_jobs, companies or TRACKER_RMS_COMPANIES, max_per_company)


def fetch_all_qureos(companies=None, max_per_company=200):
    return _batch(fetch_qureos_jobs, companies or QUREOS_COMPANIES, max_per_company)
