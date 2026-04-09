"""
USAJobs scraper — federal jobs via the public data.usajobs.gov search API.

USAJobs exposes a clean REST API at https://data.usajobs.gov/api/search that
returns structured JSON for any query. It's an ideal source for Dilly's
pre-law cohort (clerkships, honors programs) and for anyone looking at
federal internships (Pathways program, student trainee positions).

API docs: https://developer.usajobs.gov/api-reference/get-api-search
The "official" API asks for a User-Agent email + Authorization-Key header,
but the keys are free and granted instantly on request. For this scraper
we set reasonable UA/Host headers; callers should provide a USAJOBS_API_KEY
env var in production via a Railway secret.

Same output shape as job_source_nsf_reu so the cron harness can handle both
sources with one codepath.

Search buckets we pull (one request per bucket):

    1. Legal clerkships & attorney honors programs  -> pre_law
    2. Pathways Internship Program (student interns) -> general, cohort-routed
       by keywords in the description
    3. Recent Graduates Program (entry-level)        -> general, cohort-routed
"""

from __future__ import annotations

import html
import os
import re
import json
import urllib.parse
import urllib.request
import urllib.error
from typing import Dict, List, Optional

_USER_AGENT = os.environ.get("USAJOBS_USER_AGENT", "contact@trydilly.com")
_API_KEY = os.environ.get("USAJOBS_API_KEY", "")
_HTTP_TIMEOUT = 15.0
_API_ENDPOINT = "https://data.usajobs.gov/api/search"


def _fetch_json(query: Dict[str, str]) -> Optional[Dict]:
    """Hit the USAJobs search API with the given query params."""
    qs = urllib.parse.urlencode(query)
    url = f"{_API_ENDPOINT}?{qs}"
    headers = {
        "Host": "data.usajobs.gov",
        "User-Agent": _USER_AGENT,
        "Accept": "application/json",
    }
    if _API_KEY:
        headers["Authorization-Key"] = _API_KEY
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
            if resp.status != 200:
                return None
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except Exception:
        return None


def _strip_tags(s: str) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()[:1000]


# ── Bucket definitions ─────────────────────────────────────────────────────
# Each bucket is a search query + the cohort tags to apply to every result.
# A bucket can override cohort routing by setting route_by_description=True,
# in which case we sniff keywords in each posting to pick cohorts.

BUCKETS: List[Dict] = [
    {
        "name": "Legal Honors & Clerkships",
        "query": {
            "Keyword": "honors attorney",
            "JobCategoryCode": "0905",  # General Attorney
            "ResultsPerPage": "25",
        },
        "cohorts": ["pre_law"],
        "job_type": "entry_level",
    },
    {
        "name": "Pathways Internships",
        "query": {
            "Keyword": "pathways internship student",
            "ResultsPerPage": "25",
        },
        "cohorts": [],  # route by description
        "route_by_description": True,
        "job_type": "internship",
    },
    {
        "name": "Recent Graduates Program",
        "query": {
            "Keyword": "recent graduates program",
            "ResultsPerPage": "25",
        },
        "cohorts": [],  # route by description
        "route_by_description": True,
        "job_type": "entry_level",
    },
]

# Keyword → cohort heuristics for route-by-description buckets
_ROUTE_KEYWORDS: Dict[str, List[str]] = {
    "pre_law":                   ["legal", "attorney", "law ", "judicial", "clerk"],
    "pre_health":                ["medical", "clinical", "nursing", "health", "epidemiolog", "public health"],
    "tech_software_engineering": ["software", "developer", "programmer", "engineer", "IT specialist"],
    "tech_data_science":         ["data scien", "data analy", "statistician", "machine learning"],
    "tech_cybersecurity":        ["cyber", "security analyst", "infosec", "information security"],
    "business_finance":          ["budget", "accountant", "financial", "audit", "treasury"],
    "business_accounting":       ["accountant", "audit", "tax"],
    "science_research":          ["biologist", "chemist", "physicist", "researcher", "scientist"],
    "social_sciences":           ["social worker", "psychologist", "sociolog", "policy analyst"],
    "humanities_communications": ["writer", "editor", "public affairs", "communications"],
    "quantitative_math_stats":   ["mathematician", "statistician", "actuar", "econometric"],
}


def _route_cohorts_by_text(text: str) -> List[str]:
    """Infer Dilly cohorts from a job title + description."""
    lower = (text or "").lower()
    cohorts: set = set()
    for cohort, kws in _ROUTE_KEYWORDS.items():
        for kw in kws:
            if kw in lower:
                cohorts.add(cohort)
                break
    return sorted(cohorts)


# ── Curated fallback ──────────────────────────────────────────────────────
# Well-known recurring federal programs that don't change URLs year to year.
# Used when USAJOBS_API_KEY isn't set or the API is unreachable. Shipped as
# an always-on baseline so the feature works on fresh deploys.

_CURATED_FEDERAL_PROGRAMS: List[Dict] = [
    {
        "title": "DOJ Honors Program (Entry-Level Attorney)",
        "company": "U.S. Department of Justice",
        "description": "The flagship federal entry-level attorney program. Two-year rotational positions across DOJ litigating divisions. Highly competitive — apply in the fall of your final law school year.",
        "apply_url": "https://www.justice.gov/legal-careers/honors-program",
        "cohorts": ["pre_law"],
        "job_type": "entry_level",
        "team": "Legal Honors & Clerkships",
    },
    {
        "title": "Federal Judicial Clerkships (via OSCAR)",
        "company": "U.S. Courts",
        "description": "Federal judges hire recent law graduates for 1-2 year clerkships. Applications submitted centrally through the OSCAR system. Prestigious springboard for legal careers.",
        "apply_url": "https://oscar.uscourts.gov/",
        "cohorts": ["pre_law"],
        "job_type": "entry_level",
        "team": "Legal Honors & Clerkships",
    },
    {
        "title": "Presidential Management Fellows (PMF)",
        "company": "U.S. Office of Personnel Management",
        "description": "Two-year paid leadership-development program for recent graduate students from all fields. Placements across dozens of federal agencies.",
        "apply_url": "https://www.pmf.gov/",
        "cohorts": ["social_sciences", "humanities_communications", "business_consulting"],
        "job_type": "entry_level",
        "team": "Recent Graduates Program",
    },
    {
        "title": "Pathways Internship Program",
        "company": "U.S. Federal Government",
        "description": "Federal paid internships for currently-enrolled students across every agency and job family. Can convert to full-time after graduation.",
        "apply_url": "https://www.usajobs.gov/Help/working-in-government/unique-hiring-paths/students/",
        "cohorts": ["tech_software_engineering", "business_finance", "social_sciences",
                     "science_research", "pre_law", "humanities_communications"],
        "job_type": "internship",
        "team": "Pathways Internships",
    },
    {
        "title": "NIH Postbaccalaureate IRTA Program",
        "company": "National Institutes of Health",
        "description": "1-2 year paid biomedical research traineeship at the NIH for recent graduates. Excellent pre-med gap year program.",
        "apply_url": "https://www.training.nih.gov/programs/postbac_irta",
        "cohorts": ["pre_health", "science_research", "health_nursing_allied"],
        "job_type": "entry_level",
        "team": "Recent Graduates Program",
    },
    {
        "title": "CDC Public Health Associate Program (PHAP)",
        "company": "Centers for Disease Control and Prevention",
        "description": "Two-year paid fellowship placing recent graduates in state, tribal, local, and territorial health departments.",
        "apply_url": "https://www.cdc.gov/phap/",
        "cohorts": ["pre_health", "health_nursing_allied", "social_sciences"],
        "job_type": "entry_level",
        "team": "Recent Graduates Program",
    },
    {
        "title": "State Department Pickering Fellowship",
        "company": "U.S. Department of State",
        "description": "Graduate school funding + summer internships leading to a Foreign Service Officer appointment. For students interested in international affairs.",
        "apply_url": "https://pickeringfellowship.org/",
        "cohorts": ["social_sciences", "humanities_communications", "pre_law"],
        "job_type": "entry_level",
        "team": "Legal Honors & Clerkships",
    },
    {
        "title": "NASA Pathways Intern Employment Program",
        "company": "National Aeronautics and Space Administration",
        "description": "Paid engineering and science internships at NASA centers. STEM majors with 3.0+ GPA.",
        "apply_url": "https://intern.nasa.gov/",
        "cohorts": ["science_research", "tech_software_engineering", "quantitative_math_stats"],
        "job_type": "internship",
        "team": "Pathways Internships",
    },
    {
        "title": "DOD SMART Scholarship",
        "company": "U.S. Department of Defense",
        "description": "Full tuition scholarship + stipend + summer internship + guaranteed DoD position for STEM students.",
        "apply_url": "https://www.smartscholarship.org/",
        "cohorts": ["science_research", "tech_software_engineering", "tech_cybersecurity",
                     "quantitative_math_stats"],
        "job_type": "entry_level",
        "team": "Recent Graduates Program",
    },
    {
        "title": "Treasury Pathways Recent Graduates Program",
        "company": "U.S. Department of the Treasury",
        "description": "Two-year developmental program for recent graduates in finance, economics, accounting, and related fields across Treasury bureaus.",
        "apply_url": "https://careers.treasury.gov/pathways/",
        "cohorts": ["business_finance", "business_accounting", "quantitative_math_stats"],
        "job_type": "entry_level",
        "team": "Recent Graduates Program",
    },
]


def _curated_to_listing(program: Dict) -> Dict:
    """Convert a curated federal program entry into the standard listing shape."""
    slug_source = program["title"].lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug_source).strip("-")
    return {
        "external_id": f"usajobs-curated-{slug[:60]}",
        "title": program["title"][:200],
        "company": program["company"],
        "description": program["description"][:1000],
        "apply_url": program["apply_url"],
        "location_city": None,
        "location_state": None,
        "work_mode": "unknown",
        "posted_date": None,
        "close_date": None,
        "source_ats": "usajobs",
        "team": program.get("team", "Federal"),
        "remote": False,
        "tags": ["federal", "government", "usajobs", "curated"],
        "job_type": program["job_type"],
        "cohorts": program.get("cohorts", []),
    }


def fetch_usajobs_listings(max_per_bucket: int = 25) -> List[Dict]:
    """
    Return federal job listings for ingestion.

    Strategy:
        1. Start from CURATED_FEDERAL_PROGRAMS — always-on baseline of ~10
           flagship recurring programs with stable apply URLs (DOJ Honors,
           NASA Pathways, NIH IRTA, etc.). Works with no API key.
        2. If USAJOBS_API_KEY is set, augment with live search buckets.

    Returns a list of dicts shaped like the existing internship pipeline.
    """
    results: List[Dict] = [_curated_to_listing(p) for p in _CURATED_FEDERAL_PROGRAMS]
    seen_ids = {r["external_id"] for r in results}

    # Only run live search if we have an API key — the USAJobs API requires
    # it in production and returns 401 otherwise. The curated list is enough
    # to make the feature useful without credentials.
    if not _API_KEY:
        return results

    for bucket in BUCKETS:
        query = dict(bucket["query"])
        query["ResultsPerPage"] = str(max_per_bucket)
        data = _fetch_json(query)
        if not data:
            continue

        items = (
            data.get("SearchResult", {})
                .get("SearchResultItems") or []
        )
        for item in items:
            descriptor = item.get("MatchedObjectDescriptor") or {}
            position_title = descriptor.get("PositionTitle") or ""
            if not position_title:
                continue

            org = descriptor.get("OrganizationName") or "US Government"
            dept = descriptor.get("DepartmentName") or ""
            position_uri = descriptor.get("PositionURI") or ""
            position_id = descriptor.get("PositionID") or ""

            locations = descriptor.get("PositionLocation") or []
            city = None
            state = None
            if locations and isinstance(locations, list):
                first_loc = locations[0] or {}
                city = first_loc.get("CityName") or None
                state = first_loc.get("CountrySubDivisionCode") or None

            remote_flag = any(
                (loc.get("LocationName") or "").lower().startswith("anywhere")
                for loc in locations
            ) if locations else False

            qualifications = descriptor.get("QualificationSummary") or ""
            user_brief = descriptor.get("UserArea", {}).get("Details", {}).get("JobSummary") or ""
            description = _strip_tags(user_brief or qualifications)

            posted_date = (descriptor.get("PublicationStartDate") or "")[:10]
            close_date = (descriptor.get("ApplicationCloseDate") or "")[:10] or None

            if bucket.get("route_by_description"):
                inferred = _route_cohorts_by_text(position_title + " " + description)
                cohorts = inferred or ["humanities_communications"]  # government default
            else:
                cohorts = list(bucket.get("cohorts") or [])

            ext_id = f"usajobs-{position_id or (hash(position_uri) & 0xffffffff)}"
            if ext_id in seen_ids:
                continue
            seen_ids.add(ext_id)
            results.append({
                "external_id": ext_id,
                "title": position_title[:200],
                "company": f"{dept} · {org}" if dept else org,
                "description": description[:1000] or f"Federal position. Apply at {position_uri}",
                "apply_url": position_uri or f"https://www.usajobs.gov/job/{position_id}",
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if remote_flag else "in_person",
                "posted_date": posted_date or None,
                "close_date": close_date,
                "source_ats": "usajobs",
                "team": bucket["name"],
                "remote": remote_flag,
                "tags": ["federal", "government", "usajobs", bucket["name"].lower().replace(" ", "_")],
                "job_type": bucket["job_type"],
                "cohorts": cohorts,
            })
    return results


__all__ = ["fetch_usajobs_listings", "BUCKETS"]
