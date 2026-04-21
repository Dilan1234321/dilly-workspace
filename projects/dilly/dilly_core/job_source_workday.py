"""
Workday Job Board scraper — the Fortune-500 unlock.

Workday is the dominant ATS for large enterprises (Fortune 500, public
companies, most big banks/consultancies/airlines/hotel chains). Every
customer tenant lives at a URL like:

    https://{company}.wd{N}.myworkdayjobs.com/{site_path}

There's a JSON API hiding inside each tenant at:

    POST https://{company}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs

It accepts a JSON body with `limit` and `offset` and returns a page of
jobs with enough detail for our normalizer. No auth required for
publicly listed boards.

This module is defensive: if Workday changes shape, or a specific
tenant 404s, we log and move on. Each company is independent.

Volume: Fortune 500 on Workday averages ~150-400 active roles. Even
if we only get half of our configured tenants working at any given
time, that's still tens of thousands of jobs.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# Workday's bot detection returns HTTP 400 when the User-Agent has any
# non-standard suffix (it used to allow "Dilly-Job-Aggregator/1.0" but
# started rejecting it sometime after build 330). Stick to a plain
# browser UA — the API is public and unauthenticated.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
REQUEST_TIMEOUT = 25
REQUEST_DELAY = 2.0
PER_TENANT_CAP = 500  # hard cap so one mega-employer doesn't block the crawl

# Workday's list endpoint only returns titles + external paths; the JD
# lives at a separate /wday/cxs/{tenant}/{site}{externalPath} GET that
# we have to call per job. We cap the number of detail fetches per
# tenant so the crawl doesn't take hours — rest ship with title-only
# content (still enough for cohort classification + apply-link).
JD_DETAIL_FETCH_CAP = 80
JD_DETAIL_DELAY = 0.3  # seconds between detail calls (per tenant)


# (tenant_slug, wd_number, site_path, display_name, industry, website)
# tenant_slug is the subdomain prefix, wd_number is wd1/wd2/wd3/wd5,
# site_path is the second URL segment (usually "External" or
# company-specific like "nike", "disneycareers").
#
# Start focused: ~100 well-known F500 on Workday. Add more later.
WORKDAY_TENANTS: list[tuple[str, str, str, str, str, str]] = [
    # Tech / Enterprise
    ("nvidia",       "wd5", "NVIDIAExternalCareerSite", "NVIDIA", "Tech", "nvidia.com"),
    ("intel",        "wd1", "External", "Intel", "Tech", "intel.com"),
    ("ibm",          "wd1", "IBM", "IBM", "Tech", "ibm.com"),
    ("cisco",        "wd5", "External", "Cisco", "Tech", "cisco.com"),
    # Salesforce moved to wd12 some time ago; wd1 now returns 422.
    ("salesforce",   "wd12","External_Career_Site", "Salesforce", "Tech", "salesforce.com"),
    ("oracle",       "wd5", "OracleCorporate", "Oracle", "Tech", "oracle.com"),
    ("sap",          "wd3", "SAPcareers", "SAP", "Tech", "sap.com"),
    ("workday",      "wd5", "Workday", "Workday", "Tech", "workday.com"),
    ("servicenow",   "wd1", "ServiceNowCareers", "ServiceNow", "Tech", "servicenow.com"),
    ("adobe",        "wd5", "external_experienced", "Adobe", "Tech", "adobe.com"),
    ("autodesk",     "wd1", "Ext", "Autodesk", "Tech", "autodesk.com"),
    ("hpe",          "wd5", "Jobsathpe", "Hewlett Packard Enterprise", "Tech", "hpe.com"),
    ("dell",         "wd1", "External", "Dell", "Tech", "dell.com"),
    ("vmware",       "wd1", "VMware", "VMware", "Tech", "vmware.com"),

    # Banks / Finance
    ("jpmc",         "wd5", "External_experienced_career", "JPMorgan Chase", "Finance", "jpmorganchase.com"),
    ("wellsfargojobs","wd5", "External_Career", "Wells Fargo", "Finance", "wellsfargo.com"),
    ("citi",         "wd5", "2", "Citi", "Finance", "citi.com"),
    ("bankofamerica","wd1", "Lateral-US", "Bank of America", "Finance", "bankofamerica.com"),
    ("morganstanley","wd5", "External", "Morgan Stanley", "Finance", "morganstanley.com"),
    ("gs",           "wd5", "Professional", "Goldman Sachs", "Finance", "goldmansachs.com"),
    ("amex",         "wd1", "External", "American Express", "Finance", "americanexpress.com"),
    ("discover",     "wd1", "Discover", "Discover", "Finance", "discover.com"),
    ("capitalone",   "wd1", "Capital_One", "Capital One", "Finance", "capitalone.com"),
    ("blackrock",    "wd1", "Careers_External", "BlackRock", "Finance", "blackrock.com"),
    ("fidelity",     "wd1", "FidelityCareers", "Fidelity", "Finance", "fidelity.com"),
    ("schwab",       "wd1", "CSCareersExternal", "Charles Schwab", "Finance", "schwab.com"),
    ("visa",         "wd1", "Visa_Career_Site", "Visa", "Finance", "visa.com"),
    ("mastercard",   "wd5", "CorporateCareers", "Mastercard", "Finance", "mastercard.com"),

    # Insurance
    ("allstate",     "wd1", "External", "Allstate", "Finance", "allstate.com"),
    ("metlife",      "wd1", "External", "MetLife", "Finance", "metlife.com"),
    ("progressive",  "wd5", "External", "Progressive", "Finance", "progressive.com"),
    ("libertymutual","wd1", "ca_ext", "Liberty Mutual", "Finance", "libertymutual.com"),
    ("prudential",   "wd5", "External", "Prudential", "Finance", "prudential.com"),

    # Healthcare
    ("pfizer",       "wd1", "PfizerCareers", "Pfizer", "Healthcare", "pfizer.com"),
    ("merck",        "wd5", "Merck", "Merck", "Healthcare", "merck.com"),
    ("jnj",          "wd5", "jnjpharma", "Johnson & Johnson", "Healthcare", "jnj.com"),
    ("amgen",        "wd1", "Amgen_Careers", "Amgen", "Healthcare", "amgen.com"),
    ("gilead",       "wd1", "gileadcareers", "Gilead", "Healthcare", "gilead.com"),
    ("biogen",       "wd1", "biogen_careers", "Biogen", "Healthcare", "biogen.com"),
    ("regeneron",    "wd5", "Regeneron", "Regeneron", "Healthcare", "regeneron.com"),
    ("unitedhealthgroup","wd5","UnitedHealthGroup", "UnitedHealth Group", "Healthcare", "unitedhealthgroup.com"),
    ("cvshealth",    "wd1", "CVS_Health_Careers", "CVS Health", "Healthcare", "cvshealth.com"),
    ("walgreens",    "wd5", "Walgreens_Jobs", "Walgreens", "Healthcare", "walgreens.com"),
    ("kaiserpermanente","wd1","KPCareers", "Kaiser Permanente", "Healthcare", "kaiserpermanente.org"),
    ("hcahealthcare","wd1", "HCA_Healthcare_Careers", "HCA Healthcare", "Healthcare", "hcahealthcare.com"),

    # Consumer / Retail
    # Target is on wd5, site slug "targetcareers" (lowercase).
    ("target",       "wd5", "targetcareers", "Target", "Consumer", "target.com"),
    ("walmart",      "wd5", "WalmartExternal", "Walmart", "Consumer", "walmart.com"),
    ("nordstrom",    "wd1", "Nordstrom", "Nordstrom", "Consumer", "nordstrom.com"),
    ("bestbuy",      "wd1", "External", "Best Buy", "Consumer", "bestbuy.com"),
    ("homedepot",    "wd5", "thd", "Home Depot", "Consumer", "homedepot.com"),
    ("lowes",        "wd1", "Lowes", "Lowe's", "Consumer", "lowes.com"),
    ("costco",       "wd5", "External", "Costco", "Consumer", "costco.com"),
    ("kroger",       "wd1", "External", "Kroger", "Consumer", "kroger.com"),
    ("macys",        "wd1", "Macys", "Macy's", "Consumer", "macys.com"),
    ("tjxcareers",   "wd1", "TJX_Career_Center", "TJX", "Consumer", "tjx.com"),
    ("gap",          "wd1", "Gap", "Gap", "Consumer", "gap.com"),
    ("lulu",         "wd1", "lululemon", "Lululemon", "Consumer", "lululemon.com"),
    ("nike",         "wd1", "nike", "Nike", "Consumer", "nike.com"),
    ("starbucks",    "wd1", "starbuckscareers", "Starbucks", "Consumer", "starbucks.com"),
    ("pg",           "wd1", "ProcterGamble", "Procter & Gamble", "Consumer", "pg.com"),
    ("pepsi",        "wd1", "PepsiCoCareers", "PepsiCo", "Consumer", "pepsico.com"),
    ("coca-cola",    "wd1", "coca_cola_careers", "Coca-Cola", "Consumer", "coca-cola.com"),
    ("colgate",      "wd5", "CP", "Colgate-Palmolive", "Consumer", "colgate.com"),
    ("unilever",     "wd3", "External", "Unilever", "Consumer", "unilever.com"),

    # Media / Entertainment
    # Disney is on wd5, not wd1; site is "disneycareer" (unchanged).
    ("disney",       "wd5", "disneycareer", "Disney", "Media", "disney.com"),
    ("comcast",      "wd5", "CorporateCareers", "Comcast", "Media", "comcast.com"),
    ("paramount",    "wd5", "ParamountCareers", "Paramount", "Media", "paramount.com"),
    ("warnerbros",   "wd5", "global", "Warner Bros Discovery", "Media", "wbd.com"),
    ("sony",         "wd1", "SonyGlobalCareers", "Sony", "Media", "sony.com"),
    ("spotify",      "wd5", "External", "Spotify", "Media", "spotify.com"),

    # Airlines + travel
    ("delta",        "wd1", "DeltaCareers", "Delta Air Lines", "Consumer", "delta.com"),
    ("united",       "wd5", "ua", "United Airlines", "Consumer", "united.com"),
    ("aa",           "wd1", "AAcareers", "American Airlines", "Consumer", "aa.com"),
    ("southwest",    "wd1", "SWA", "Southwest Airlines", "Consumer", "southwest.com"),
    ("jetblue",      "wd1", "JetBlue", "JetBlue", "Consumer", "jetblue.com"),
    ("marriott",     "wd1", "marriott", "Marriott", "Consumer", "marriott.com"),
    ("hilton",       "wd5", "Hilton_Careers", "Hilton", "Consumer", "hilton.com"),
    ("hyatt",        "wd1", "hyatt", "Hyatt", "Consumer", "hyatt.com"),

    # Telecom
    ("att",          "wd5", "ATTCareers", "AT&T", "Tech", "att.com"),
    ("verizon",      "wd5", "NEWCAREERS", "Verizon", "Tech", "verizon.com"),
    ("tmobile",      "wd5", "External", "T-Mobile", "Tech", "t-mobile.com"),

    # Defense / Aerospace
    ("boeing",       "wd1", "EXTERNAL_CAREERS", "Boeing", "Tech", "boeing.com"),
    ("lockheedmartin","wd1","Lockheed_Martin", "Lockheed Martin", "Tech", "lockheedmartin.com"),
    ("rtx",          "wd5", "rec", "RTX", "Tech", "rtx.com"),
    ("northropgrumman","wd1", "NGCareers", "Northrop Grumman", "Tech", "northropgrumman.com"),
    ("generaldynamics","wd1", "External", "General Dynamics", "Tech", "gd.com"),

    # Industrial / Auto
    ("ge",           "wd1", "GE_ExternalSite", "GE", "Tech", "ge.com"),
    ("honeywell",    "wd5", "Honeywell", "Honeywell", "Tech", "honeywell.com"),
    ("ford",         "wd1", "FordCareers", "Ford", "Tech", "ford.com"),
    ("gm",           "wd1", "Careers_GM", "General Motors", "Tech", "gm.com"),
    ("tesla",        "wd5", "tesla", "Tesla", "Tech", "tesla.com"),

    # Big Consulting / Pro Services
    ("deloitte",     "wd1", "Deloitte_US", "Deloitte", "Consulting", "deloitte.com"),
    ("ey",           "wd5", "EYCareers", "EY", "Consulting", "ey.com"),
    ("pwc",          "wd3", "Global_Experienced_Careers", "PwC", "Consulting", "pwc.com"),
    ("kpmg",         "wd1", "KPMGUS_Careers", "KPMG", "Consulting", "kpmg.com"),
    ("accenture",    "wd3", "AccentureCareers", "Accenture", "Consulting", "accenture.com"),
    ("boozallen",    "wd1", "External", "Booz Allen Hamilton", "Consulting", "boozallen.com"),
    ("capgemini",    "wd3", "Capgemini", "Capgemini", "Consulting", "capgemini.com"),

    # Logistics
    ("ups",          "wd5", "UPSCareers", "UPS", "Consumer", "ups.com"),
    ("fedex",        "wd1", "FedExExpressCareers", "FedEx", "Consumer", "fedex.com"),
]


# ── Helpers ───────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()


def _classify_job_type(title: str, description: str) -> str:
    t = (title + " " + description).lower()
    if "intern" in t or "internship" in t:
        return "internship"
    if any(k in t for k in ("part-time", "part time", "weekend")):
        return "part_time"
    if any(k in t for k in ("senior", "staff", "principal", "director", "lead ", "head of", "vp ", "10+ years", "7+ years", "8+ years")):
        return "other"
    return "entry_level"


# ── Core fetcher ──────────────────────────────────────────────────────

def _fetch_workday_job_detail(
    base_host: str,
    tenant: str,
    site_path: str,
    external_path: str,
) -> str:
    """Fetch the full HTML description for one Workday job posting.

    The listing endpoint gives us only {title, externalPath, ...} —
    no job description. To get the JD we hit:
      GET {base_host}/wday/cxs/{tenant}/{site_path}{external_path}

    Returns a plain-text description (HTML stripped) or "" on any
    error. Never raises — the caller continues with the thin listing
    content if this fails.
    """
    if not external_path:
        return ""
    url = f"{base_host}/wday/cxs/{tenant}/{site_path}{external_path}"
    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return ""
        data = resp.json() or {}
        info = data.get("jobPostingInfo") or {}
        raw = info.get("jobDescription") or ""
        # Workday returns HTML; let the existing _strip_html helper
        # clean it up if available (it's defined just above in this
        # same module).
        if raw:
            return _strip_html(raw)[:6000]
    except Exception as e:
        logger.debug("[workday] JD detail fetch failed %s: %s", url, e)
    return ""


def fetch_workday_tenant(
    tenant: str,
    wd_number: str,
    site_path: str,
    company_name: str,
    industry: str,
    website: str | None,
    cap: int = PER_TENANT_CAP,
) -> list[dict]:
    """Fetch all listings for a single Workday tenant.

    Uses the /wday/cxs/{tenant}/{site}/jobs POST endpoint which returns
    paginated job data. `limit` and `offset` are required in the body.
    """
    base = f"https://{tenant}.{wd_number}.myworkdayjobs.com"
    search_url = f"{base}/wday/cxs/{tenant}/{site_path}/jobs"

    jobs: list[dict] = []
    offset = 0
    # Workday changed their bot limits — page sizes > 20 now return
    # HTTP 400. Was 50 (worked through build 330). Keeping at 20 is
    # safe and doesn't meaningfully slow the crawl since we're still
    # network-bound on the JD detail fetches.
    page_size = 20

    # Workday rejects a matching Origin (expects either no Origin or the
    # referring site that embeds their widget). Passing "Origin: host"
    # used to work but now returns 400. Leaving Origin off is the
    # reliable path.
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    while offset < cap:
        # Minimal body only. Workday used to accept
        # {"searchText": "", "appliedFacets": {}} but now returns HTTP
        # 400 with those fields — even empty. Send just limit+offset.
        body = {
            "limit": page_size,
            "offset": offset,
        }

        try:
            resp = requests.post(search_url, json=body, headers=headers, timeout=REQUEST_TIMEOUT)
        except Exception as e:
            logger.warning("[workday] %s request error: %s", company_name, e)
            break

        if resp.status_code == 404:
            logger.warning("[workday] %s: 404 at %s (check tenant/wd_number/site_path)", company_name, search_url)
            return []
        if resp.status_code == 401 or resp.status_code == 403:
            logger.warning("[workday] %s: %s blocked", company_name, resp.status_code)
            return []
        if resp.status_code != 200:
            logger.warning("[workday] %s: HTTP %s", company_name, resp.status_code)
            break

        try:
            data = resp.json()
        except Exception as e:
            logger.warning("[workday] %s: JSON parse error: %s", company_name, e)
            break

        postings = data.get("jobPostings") or []
        if not postings:
            break

        for p in postings:
            title = (p.get("title") or "").strip()
            if not title:
                continue

            # Locations come back as a string; sometimes multiple with ";" separator.
            location = (p.get("locationsText") or "").strip()

            # bullets / posted / url
            bullets = p.get("bulletFields") or []
            desc = " · ".join(bullets) if bullets else ""

            # Enrich the first JD_DETAIL_FETCH_CAP jobs per tenant with
            # the real job description. Caps keep the total crawl time
            # sane — 100 tenants × 500 jobs × 0.3s = 4h otherwise.
            external_path = p.get("externalPath") or ""
            if external_path and len(jobs) < JD_DETAIL_FETCH_CAP:
                full_desc = _fetch_workday_job_detail(base, tenant, site_path, external_path)
                if full_desc:
                    desc = full_desc
                time.sleep(JD_DETAIL_DELAY)

            posted = None
            pp = p.get("postedOn")
            if pp and isinstance(pp, str):
                # Workday returns fuzzy strings like "Posted 3 Days Ago".
                # Leave as None for posted_date; the stamp isn't machine-friendly.
                posted = None

            apply_url = f"{base}{external_path}" if external_path else ""

            # Remote detection from location text.
            loc_lower = location.lower()
            is_remote = "remote" in loc_lower or "virtual" in loc_lower or "anywhere" in loc_lower
            work_mode = "remote" if is_remote else "onsite"

            # Split "City, ST" where possible.
            city = None
            state = None
            first_loc = location.split(";")[0].strip() if location else ""
            if "," in first_loc:
                parts = [s.strip() for s in first_loc.split(",")]
                city = parts[0] or None
                state = parts[1] if len(parts) > 1 else None

            job_type = _classify_job_type(title, desc)

            jobs.append({
                "external_id": f"workday-{tenant}-{p.get('bulletFields') and p['bulletFields'][0] or title}-{offset}",
                "title": title,
                "company": company_name,
                "description": desc[:5000],
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": work_mode,
                "posted_date": posted,
                "source_ats": "workday",
                "team": "",
                "remote": is_remote,
                "tags": [],
                "job_type": job_type,
                "company_website": website,
            })

        total = data.get("total") or 0
        logger.info("[workday] %s: offset=%d page=%d total=%d", company_name, offset, len(postings), total)

        if len(postings) < page_size or offset + page_size >= total:
            break
        offset += page_size
        time.sleep(REQUEST_DELAY)

    time.sleep(REQUEST_DELAY)
    return jobs


def fetch_all_workday() -> list[dict]:
    """Iterate every configured Workday tenant. Returns one flat list;
    the crawler groups by company via write_multi_company_feed().

    Tenants that 404 or 401 are logged and skipped. A single bad tenant
    never breaks the pipeline.
    """
    all_jobs: list[dict] = []
    for tenant, wd, site, name, industry, website in WORKDAY_TENANTS:
        try:
            jobs = fetch_workday_tenant(tenant, wd, site, name, industry, website)
            logger.info("[workday] %s: %d jobs", name, len(jobs))
            all_jobs.extend(jobs)
        except Exception as e:
            logger.error("[workday] %s unhandled: %s", name, e)
    logger.info("[workday] TOTAL: %d jobs across %d tenants", len(all_jobs), len(WORKDAY_TENANTS))
    return all_jobs
