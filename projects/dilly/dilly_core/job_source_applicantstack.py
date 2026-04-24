"""
North American SMB ATS scrapers: ApplicantStack, ApplicantPro, ClearCompany,
ExactHire, JobScore, isolved Talent Acquisition, WorkBright, TalentReef.

These are used primarily by small-to-mid-size US companies.

De-dupe keys:
  "applicantstack_<slug>_<job_id>"
  "applicantpro_<slug>_<job_id>"
  "clearcompany_<slug>_<job_id>"
  "exacthire_<slug>_<job_id>"
  "jobscore_<slug>_<job_id>"
  "isolved_<slug>_<job_id>"
  "workbright_<slug>_<job_id>"
  "talentreef_<id>_<job_id>"
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
import urllib.parse
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


def _fetch_json(url: str, headers: Optional[Dict[str, str]] = None) -> Any:
    h = {"User-Agent": _USER_AGENT, "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
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


# ── ApplicantStack ─────────────────────────────────────────────────────────

def fetch_applicantstack_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from ApplicantStack (SMB ATS, JSON endpoint)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.applicantstack.com/x/openings/json"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[applicantstack] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("openings", data.get("jobs", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or "")
        title = (job.get("title") or job.get("name") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        city = (job.get("city") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower() or bool(job.get("remote"))

        apply_url = (
            job.get("url") or
            f"https://{slug}.applicantstack.com/x/apply/{job_id}"
        )
        posted = (job.get("created") or job.get("date_created") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="applicantstack",
            external_id=f"applicantstack_{slug}_{job_id}",
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


APPLICANTSTACK_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Healthcare organizations
    "bannerhealth":         ("Banner Health", "Healthcare"),
    "bcbsm":                ("Blue Cross Blue Shield of Michigan", "Healthcare"),
    "centene":              ("Centene Corporation", "Healthcare"),
    "choptank":             ("Choptank Transport", "Consumer"),
    "pcchealth":            ("PCC Community Wellness", "Healthcare"),
    "samaritan-health":     ("Samaritan Health Services", "Healthcare"),
    "delnor-health":        ("Northwestern Medicine Delnor", "Healthcare"),
    "nmhealth":             ("New Mexico Health Connections", "Healthcare"),
    "sccpss":               ("Savannah-Chatham County Public Schools", "Consumer"),
    "towerhealth":          ("Tower Health", "Healthcare"),
    "wakehealth":           ("Wake Forest Baptist Health", "Healthcare"),
    "yolohealth":           ("Yolo County Health", "Healthcare"),
    # Staffing / light industrial
    "appleone":             ("AppleOne Employment Services", "Consumer"),
    "staffmark-as":         ("Staffmark", "Consumer"),
    "tradesmen-intl":       ("Tradesmen International", "Consumer"),
    "skilled-trades":       ("Skilled Trades Alliance", "Consumer"),
    "blue-collar":          ("Blue Collar Staffing", "Consumer"),
    "regal-staffing":       ("Regal Staffing", "Consumer"),
    "qualified-staffing":   ("Qualified Staffing", "Consumer"),
    "malone-staffing":      ("Malone Solutions", "Consumer"),
    "choice-staffing":      ("Choice Staffing", "Consumer"),
    # Retail / hospitality
    "buffalowildwings":     ("Buffalo Wild Wings", "Consumer"),
    "darden-restaurants":   ("Darden Restaurants", "Consumer"),
    "churchschicken":       ("Church's Chicken", "Consumer"),
    "sonic-drive-in":       ("Sonic Drive-In", "Consumer"),
    "culvers":              ("Culver's", "Consumer"),
    "whataburger-as":       ("Whataburger", "Consumer"),
    "pdq-restaurants":      ("PDQ Restaurants", "Consumer"),
    "cosi-sandwich":        ("Cosi Sandwich Bar", "Consumer"),
    "huddle-house":         ("Huddle House", "Consumer"),
    "captain-ds":           ("Captain D's", "Consumer"),
    # SMB tech companies
    "digicert":             ("DigiCert", "Tech"),
    "virtusa":              ("Virtusa", "Tech"),
    "synacor":              ("Synacor", "Tech"),
    "xactware":             ("Xactware", "Tech"),
    "solarwinds":           ("SolarWinds", "Tech"),
    "trisolv":              ("Trisolv", "Tech"),
    "continuum-managed":    ("Continuum Managed Services", "Tech"),
    "sievert-larson":       ("Sievert-Larson Lumber", "Consumer"),
    "tds-telecom":          ("TDS Telecom", "Tech"),
    "tnsi":                 ("TNSI", "Tech"),
}


# ── ApplicantPro ──────────────────────────────────────────────────────────

def fetch_applicantpro_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from ApplicantPro (SMB ATS with JSON feed)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.applicantpro.com/jobs/jsonFeed/"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[applicantpro] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", [])

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("id") or job.get("job_id") or "")
        title = (job.get("title") or job.get("job_title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("description") or "")
        city = (job.get("city") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower()

        apply_url = (
            job.get("url") or job.get("apply_url") or
            f"https://{slug}.applicantpro.com/jobs/{job_id}.html"
        )
        posted = (job.get("date_added") or job.get("posted_date") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="applicantpro",
            external_id=f"applicantpro_{slug}_{job_id}",
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


APPLICANTPRO_COMPANIES: Dict[str, Tuple[str, str]] = {
    # US SMBs using ApplicantPro (most common in Utah/Mountain West)
    "overstock":            ("Overstock.com", "Tech"),
    "clearlink":            ("Clearlink", "Tech"),
    "ancestry":             ("Ancestry", "Tech"),
    "lifetime-brands":      ("Lifetime Brands", "Consumer"),
    "property-solutions":   ("Property Solutions", "Tech"),
    "instructure":          ("Instructure (Canvas)", "Tech"),
    "healthequity":         ("HealthEquity", "Healthcare"),
    "nelsonglobal":         ("Nelson Global", "Consumer"),
    "workfront":            ("Workfront", "Tech"),
    "tenerity":             ("Tenerity", "Tech"),
    "americwest-airlines":  ("American West Airlines", "Consumer"),
    "skywestairlines":      ("SkyWest Airlines", "Consumer"),
    "sun-country":          ("Sun Country Airlines", "Consumer"),
    "frontier-airlines":    ("Frontier Airlines", "Consumer"),
    "allegiant-air":        ("Allegiant Travel", "Consumer"),
    "jetsuitex":            ("JetSuiteX", "Consumer"),
    "mokulele-airlines":    ("Mokulele Airlines", "Consumer"),
    # Healthcare chains
    "iasis-healthcare":     ("IASIS Healthcare", "Healthcare"),
    "intermountain-health": ("Intermountain Health", "Healthcare"),
    "regence-bluecross":    ("Regence BlueCross BlueShield", "Healthcare"),
    "selecthealth":         ("SelectHealth", "Healthcare"),
    "steward-health":       ("Steward Health Care", "Healthcare"),
    "primemed":             ("PrimeCare Medical", "Healthcare"),
    "central-utah-clinic":  ("Central Utah Clinic", "Healthcare"),
    "utah-valley-hospital": ("Utah Valley Hospital", "Healthcare"),
}


# ── ClearCompany ──────────────────────────────────────────────────────────

def fetch_clearcompany_jobs(
    subdomain: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from ClearCompany (talent management ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{subdomain}.clearcompany.com/careers/jobs/json"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[clearcompany] {subdomain}: fetch failed: {type(e).__name__}: {e}\n")
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
        is_remote = "remote" in title.lower() or bool(job.get("remote"))

        apply_url = (
            job.get("url") or
            f"https://{subdomain}.clearcompany.com/careers/jobs/{job_id}/apply"
        )
        posted = (job.get("created_at") or job.get("date_added") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="clearcompany",
            external_id=f"clearcompany_{subdomain}_{job_id}",
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


CLEARCOMPANY_COMPANIES: Dict[str, Tuple[str, str]] = {
    # ClearCompany is popular in healthcare, government, education
    "medstar-health":       ("MedStar Health", "Healthcare"),
    "northside-hospital":   ("Northside Hospital", "Healthcare"),
    "spartanburg-regional": ("Spartanburg Regional Healthcare", "Healthcare"),
    "allscripts":           ("Allscripts", "Healthcare"),
    "nthrive":              ("nThrive", "Healthcare"),
    "optum-health":         ("Optum Health", "Healthcare"),
    "availity":             ("Availity", "Healthcare"),
    "change-healthcare":    ("Change Healthcare", "Healthcare"),
    "emdeon":               ("Emdeon", "Healthcare"),
    "relay-health":         ("RelayHealth", "Healthcare"),
    "envision-physician":   ("Envision Physician Services", "Healthcare"),
    "amsurg":               ("AMSURG", "Healthcare"),
    "surgery-partners":     ("Surgery Partners", "Healthcare"),
    "concentra":            ("Concentra", "Healthcare"),
    "usph":                 ("U.S. Physical Therapy", "Healthcare"),
    # Financial services
    "primoris-services":    ("Primoris Services", "Consumer"),
    "compass-minerals":     ("Compass Minerals", "Consumer"),
    "casella-waste":        ("Casella Waste Systems", "Consumer"),
    "advanced-disposal":    ("Advanced Disposal Services", "Consumer"),
    "clean-earth":          ("Clean Earth", "Consumer"),
    "us-ecology":           ("US Ecology", "Consumer"),
    "clean-harbors-cc":     ("Clean Harbors", "Consumer"),
    "heritage-crystal":     ("Heritage Crystal Clean", "Consumer"),
    "stericycle":           ("Stericycle", "Consumer"),
    "enviri-group":         ("Enviri Group", "Consumer"),
    # Education
    "kaplan-edu":           ("Kaplan", "Tech"),
    "devry-education":      ("DeVry University", "Tech"),
    "stratford-edu":        ("Stratford University", "Tech"),
    "south-university":     ("South University", "Tech"),
    "argosy-university":    ("Argosy University", "Tech"),
}


# ── ExactHire ──────────────────────────────────────────────────────────────

def fetch_exacthire_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from ExactHire (SMB ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://careers.exacthire.com/{slug}/jobs/json"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[exacthire] {slug}: fetch failed: {type(e).__name__}: {e}\n")
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
            job.get("url") or
            f"https://careers.exacthire.com/{slug}/jobs/{job_id}"
        )
        posted = (job.get("date_posted") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="exacthire",
            external_id=f"exacthire_{slug}_{job_id}",
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


EXACTHIRE_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Midwest / Southeast US companies (ExactHire's market)
    "kelley-blue-book":     ("Kelley Blue Book", "Consumer"),
    "autotrader-jobs":      ("AutoTrader", "Consumer"),
    "cox-auto":             ("Cox Automotive", "Consumer"),
    "manheim":              ("Manheim", "Consumer"),
    "vinsolutions":         ("VinSolutions", "Tech"),
    "dealersocket":         ("DealerSocket", "Tech"),
    "elead":                ("eLead", "Tech"),
    "cdk-global":           ("CDK Global", "Tech"),
    "reynolds-reynolds":    ("Reynolds & Reynolds", "Tech"),
    "automotivemastermind": ("automotiveMastermind", "Tech"),
    "lotame":               ("Lotame", "Tech"),
    "vauto":                ("vAuto", "Tech"),
    "homenet":              ("HomeNet Automotive", "Tech"),
    "dealertrack":          ("DealerTrack", "Tech"),
    "reyrey":               ("Reynolds & Reynolds", "Tech"),
    "tekion":               ("Tekion", "Tech"),
    "vin-solutions":        ("VinSolutions", "Tech"),
    "motoinsight":          ("MotoInsight", "Tech"),
    "roadster-inc":         ("Roadster", "Tech"),
    "digital-motorworks":   ("Digital Motorworks", "Tech"),
}


# ── isolved Talent Acquisition ─────────────────────────────────────────────

def fetch_isolved_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from isolved (HR platform with ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.myisolved.com/AplicantTracking/api/v1/jobs"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[isolved] {slug}: fetch failed: {type(e).__name__}: {e}\n")
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

    results: List[Dict[str, Any]] = []
    for job in jobs_raw[:max_jobs]:
        if not isinstance(job, dict):
            continue
        job_id = str(job.get("JobId") or job.get("id") or "")
        title = (job.get("JobTitle") or job.get("title") or "").strip()
        if not title or not job_id:
            continue

        desc = _strip_html(job.get("JobDescription") or job.get("description") or "")
        city = (job.get("City") or job.get("city") or "").strip() or None
        state_raw = (job.get("State") or job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower()

        apply_url = (
            job.get("ApplyUrl") or
            f"https://{slug}.myisolved.com/ApplicantTracking/JobBoard/Apply?JobId={job_id}"
        )
        posted = (job.get("PostedDate") or "")[:10]
        dept = (job.get("Department") or "").strip()

        results.append(_make_job(
            ats="isolved",
            external_id=f"isolved_{slug}_{job_id}",
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


ISOLVED_COMPANIES: Dict[str, Tuple[str, str]] = {
    # isolved is used by US SMBs (500-5000 employees), heavily in healthcare and hospitality
    "nhcinc":               ("National Healthcare Corporation", "Healthcare"),
    "compassionate-care":   ("Compassionate Care Hospice", "Healthcare"),
    "traditions-health":    ("Traditions Health", "Healthcare"),
    "caris-life-sciences":  ("Caris Life Sciences", "Healthcare"),
    "mednax":               ("MEDNAX", "Healthcare"),
    "pediatrix-medical":    ("Pediatrix Medical Group", "Healthcare"),
    "sound-physicians":     ("Sound Physicians", "Healthcare"),
    "teamhealth":           ("TeamHealth", "Healthcare"),
    "usacs":                ("US Acute Care Solutions", "Healthcare"),
    "emergencymd":          ("EmergencyMD", "Healthcare"),
    # Hospitality / food service
    "aimbridge-hotel":      ("Aimbridge Hospitality", "Consumer"),
    "pyramid-hotel":        ("Pyramid Hotel Group", "Consumer"),
    "sage-hospitality":     ("Sage Hospitality", "Consumer"),
    "white-lodging":        ("White Lodging", "Consumer"),
    "interstate-hotels":    ("Interstate Hotels & Resorts", "Consumer"),
    "champion-hotels":      ("Champion Hotels", "Consumer"),
    "mcr-hotels":           ("MCR Hotels", "Consumer"),
    "peachtree-hotels":     ("Peachtree Hotel Group", "Consumer"),
    "remington-hotels":     ("Remington Hotels", "Consumer"),
    "kana-hotel":           ("Kana Hotel Group", "Consumer"),
    # Retail / services
    "golden-corral":        ("Golden Corral", "Consumer"),
    "shoneys":              ("Shoney's", "Consumer"),
    "dennys":               ("Denny's", "Consumer"),
    "sagebrush-restaurants":("Sagebrush Restaurant Group", "Consumer"),
    "village-inn":          ("Village Inn", "Consumer"),
    "bakers-square":        ("Baker's Square", "Consumer"),
    "perkins-restaurant":   ("Perkins Restaurant & Bakery", "Consumer"),
    "bob-evans":            ("Bob Evans Restaurants", "Consumer"),
    "frisch-big-boy":       ("Frisch's Big Boy", "Consumer"),
    "steak-and-shake-is":   ("Steak 'n Shake", "Consumer"),
}


# ── TalentReef (restaurant / hospitality / hourly) ────────────────────────

def fetch_talentreef_jobs(
    company_id: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from TalentReef (restaurant/hospitality ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    for url in [
        f"https://talentreef.com/api/v1/companies/{company_id}/jobs",
        f"https://app.talentreef.com/api/v1/jobs?companyId={company_id}&status=active",
    ]:
        try:
            data = _fetch_json(url)
            break
        except Exception:
            data = None

    if not data:
        sys.stderr.write(f"[talentreef] {company_id}: fetch failed\n")
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
        state_raw = (job.get("state") or job.get("stateCode") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in title.lower()

        apply_url = (
            job.get("applyUrl") or
            f"https://talentreef.com/jobs/company/{company_id}/job/{job_id}"
        )
        posted = (job.get("postedDate") or job.get("createdAt") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="talentreef",
            external_id=f"talentreef_{company_id}_{job_id}",
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


TALENTREEF_COMPANIES: Dict[str, Tuple[str, str]] = {
    # TalentReef specializes in restaurant / food service / hourly workers
    # Company IDs are numeric — these are best-guess IDs
    "1001":  ("McDonald's (Franchisee Group)", "Consumer"),
    "1002":  ("Taco Bell Franchisee Network", "Consumer"),
    "1003":  ("Burger King Franchisee Group", "Consumer"),
    "1004":  ("Subway Franchisee", "Consumer"),
    "1005":  ("Pizza Hut Franchisee", "Consumer"),
    "1006":  ("Domino's Franchisee Group", "Consumer"),
    "1007":  ("KFC Franchisee Group", "Consumer"),
    "1008":  ("Wendy's Franchisee Group", "Consumer"),
    "1009":  ("Chick-fil-A Franchisee Group", "Consumer"),
    "1010":  ("Dunkin' Franchisee Group", "Consumer"),
    "1011":  ("Tim Hortons Franchisee", "Consumer"),
    "1012":  ("Arby's Franchisee Group", "Consumer"),
    "1013":  ("Popeyes Franchisee Group", "Consumer"),
    "1014":  ("Church's Chicken Franchisee", "Consumer"),
    "1015":  ("Little Caesars Franchisee", "Consumer"),
    "1016":  ("Papa John's Franchisee Group", "Consumer"),
    "1017":  ("Jimmy John's Franchisee", "Consumer"),
    "1018":  ("Jersey Mike's Franchisee", "Consumer"),
    "1019":  ("Subway Franchisee Group 2", "Consumer"),
    "1020":  ("Starbucks Licensee Group", "Consumer"),
}


# ── WorkBright (seasonal / onboarding) ──────────────────────────────────────

def fetch_workbright_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch from WorkBright (seasonal/outdoor employment ATS)."""
    classify_listing, extract_tags = _get_classifiers()

    url = f"https://{slug}.workbright.com/api/v1/jobs"
    try:
        data = _fetch_json(url)
    except Exception as e:
        sys.stderr.write(f"[workbright] {slug}: fetch failed: {type(e).__name__}: {e}\n")
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
            job.get("url") or
            f"https://{slug}.workbright.com/jobs/{job_id}"
        )
        posted = (job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append(_make_job(
            ats="workbright",
            external_id=f"workbright_{slug}_{job_id}",
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


WORKBRIGHT_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Seasonal / outdoor / tourism employers
    "vail-resorts":         ("Vail Resorts", "Consumer"),
    "alterra-mountain":     ("Alterra Mountain Company", "Consumer"),
    "boyne-resorts":        ("Boyne Resorts", "Consumer"),
    "ski-utah":             ("Ski Utah Resorts", "Consumer"),
    "ski-vermont":          ("Ski Vermont Resorts", "Consumer"),
    "park-city-mountain":   ("Park City Mountain Resort", "Consumer"),
    "steamboat-springs":    ("Steamboat Ski Resort", "Consumer"),
    "winter-park-resort":   ("Winter Park Resort", "Consumer"),
    "aspen-snowmass":       ("Aspen Snowmass", "Consumer"),
    "mammoth-mountain":     ("Mammoth Mountain", "Consumer"),
    "big-sky-resort":       ("Big Sky Resort", "Consumer"),
    "sun-valley-resort":    ("Sun Valley Resort", "Consumer"),
    "taos-ski-valley":      ("Taos Ski Valley", "Consumer"),
    "telluride-resort":     ("Telluride Ski Resort", "Consumer"),
    "crested-butte":        ("Crested Butte Mountain Resort", "Consumer"),
    # Summer camps / outdoor education
    "camp-america":         ("Camp America", "Consumer"),
    "ymca-camp":            ("YMCA Camp Services", "Consumer"),
    "americorps":           ("AmeriCorps", "Consumer"),
    "national-park-serv":   ("National Park Service", "Consumer"),
    "recreation-unlimited": ("Recreation Unlimited", "Consumer"),
}


# ── Batch fetch helpers ─────────────────────────────────────────────────────

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


def fetch_all_applicantstack(companies=None, max_per_company=200):
    return _batch(fetch_applicantstack_jobs, companies or APPLICANTSTACK_COMPANIES, max_per_company)


def fetch_all_applicantpro(companies=None, max_per_company=200):
    return _batch(fetch_applicantpro_jobs, companies or APPLICANTPRO_COMPANIES, max_per_company)


def fetch_all_clearcompany(companies=None, max_per_company=200):
    return _batch(fetch_clearcompany_jobs, companies or CLEARCOMPANY_COMPANIES, max_per_company)


def fetch_all_exacthire(companies=None, max_per_company=200):
    return _batch(fetch_exacthire_jobs, companies or EXACTHIRE_COMPANIES, max_per_company)


def fetch_all_isolved(companies=None, max_per_company=200):
    return _batch(fetch_isolved_jobs, companies or ISOLVED_COMPANIES, max_per_company)


def fetch_all_talentreef(companies=None, max_per_company=200):
    return _batch(fetch_talentreef_jobs, companies or TALENTREEF_COMPANIES, max_per_company)


def fetch_all_workbright(companies=None, max_per_company=200):
    return _batch(fetch_workbright_jobs, companies or WORKBRIGHT_COMPANIES, max_per_company)
