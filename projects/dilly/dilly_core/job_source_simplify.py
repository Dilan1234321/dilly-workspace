"""
SimplifyJobs GitHub feed scraper.

Fetches active listings from:
  - SimplifyJobs/Summer2026-Internships  (job_type=internship)
  - SimplifyJobs/New-Grad-Positions      (job_type=entry_level)

Both repos publish a JSON array at:
  .github/scripts/listings.json on the `dev` branch.

Only records with active=true and is_visible=true are ingested.
De-duplication key: external_id = "simplify_<uuid>" (the listing's id field).
"""
from __future__ import annotations

import json
import re
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

_INTERNSHIPS_URL = (
    "https://raw.githubusercontent.com/SimplifyJobs/"
    "Summer2026-Internships/dev/.github/scripts/listings.json"
)
_NEW_GRAD_URL = (
    "https://raw.githubusercontent.com/SimplifyJobs/"
    "New-Grad-Positions/dev/.github/scripts/listings.json"
)

_USER_AGENT = "Dilly-Job-Ingest/1.0 (+https://hellodilly.com)"

# SimplifyJobs category → Dilly snake_case cohort IDs (from RUBRIC_TO_RICH_COHORT).
# Unmapped categories get cohorts=[] and are picked up by the LLM classifier.
_CATEGORY_TO_COHORTS: Dict[str, List[str]] = {
    "Software Engineering":     ["tech_software_engineering"],
    "Software":                 ["tech_software_engineering"],
    "AI/ML/Data":               ["tech_data_science", "tech_software_engineering"],
    "Data Science/AI/ML":       ["tech_data_science"],
    "Data":                     ["tech_data_science"],
    "Machine Learning":         ["tech_data_science", "tech_software_engineering"],
    "Cybersecurity":            ["tech_cybersecurity"],
    "Security":                 ["tech_cybersecurity"],
    "IT":                       ["tech_cybersecurity"],
    "Information Technology":   ["tech_cybersecurity"],
    "Finance":                  ["business_finance"],
    "Accounting":               ["business_accounting"],
    "Consulting":               ["business_consulting"],
    "Marketing":                ["business_marketing"],
    "Sales":                    ["business_marketing"],
    "Product":                  ["sport_management"],
    "Product Management":       ["sport_management"],
    "Operations":               ["sport_management"],
    "Supply Chain":             ["sport_management"],
    "Business":                 ["business_consulting"],
    "Quant":                    ["quantitative_math_stats"],
    "Quantitative":             ["quantitative_math_stats"],
    "Actuarial":                ["quantitative_math_stats"],
    "Biotech":                  ["biotech_pharma"],
    "Pharmaceutical":           ["biotech_pharma"],
    "Healthcare":               ["pre_health"],
    "Medical":                  ["pre_health"],
    "Research":                 ["science_research", "life_sciences"],
    "Life Sciences":            ["life_sciences"],
    "Biology":                  ["life_sciences"],
    "Chemistry":                ["physical_sciences"],
    "Physics":                  ["physical_sciences"],
    "Environmental":            ["physical_sciences"],
    "Legal":                    ["pre_law"],
    "Law":                      ["pre_law"],
    "Policy":                   ["economics_policy"],
    "Economics":                ["economics_policy"],
    "Education":                ["education"],
    "Social Sciences":          ["social_sciences"],
    "Nonprofit":                ["social_sciences"],
    "Media":                    ["humanities_communications"],
    "Communications":           ["humanities_communications"],
    "Journalism":               ["humanities_communications"],
    "Design":                   ["arts_design"],
    "UX":                       ["arts_design"],
    "Creative":                 ["arts_design"],
    # Hardware / EE / ME have no snake_case entry in the rubric map
    # → cohorts=[] → LLM classifier handles them
}

_US_STATE_ABBREVS = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
}

_REMOTE_TOKENS = {"remote", "hybrid", "virtual", "work from home", "wfh"}


def _parse_city_state(loc_str: str) -> Tuple[Optional[str], Optional[str]]:
    """Parse 'City, ST' → (city, state_abbrev). Returns (None, None) otherwise."""
    loc = (loc_str or "").strip()
    if not loc or loc.lower() in _REMOTE_TOKENS:
        return None, None
    m = re.match(r"^([^,]+),\s*([A-Z]{2})\s*$", loc)
    if m and m.group(2) in _US_STATE_ABBREVS:
        return m.group(1).strip(), m.group(2)
    # "City, Country" or bare city — return city only
    m = re.match(r"^([^,]+),\s*(.+)$", loc)
    if m:
        return m.group(1).strip(), None
    return loc, None


def _parse_locations(locations: List[str]) -> Tuple[Optional[str], Optional[str], bool, str]:
    """
    Returns (city, state, is_remote, work_mode) from a locations array.
    Prefers first concrete non-remote location; sets remote/hybrid work_mode.
    """
    locs_lower = [l.strip().lower() for l in locations]
    has_remote = any(t in locs_lower for t in ("remote", "virtual", "work from home"))
    has_hybrid = "hybrid" in locs_lower

    city: Optional[str] = None
    state: Optional[str] = None
    for loc in locations:
        ll = loc.strip().lower()
        if ll in _REMOTE_TOKENS or not ll:
            continue
        c, s = _parse_city_state(loc.strip())
        if c:
            city, state = c, s
            break

    if has_remote and has_hybrid:
        work_mode = "hybrid"
    elif has_remote:
        work_mode = "remote"
    elif has_hybrid:
        work_mode = "hybrid"
    else:
        work_mode = "onsite"

    return city, state, has_remote, work_mode


def _fetch_json(url: str) -> List[Dict[str, Any]]:
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _normalize(item: Dict[str, Any], job_type: str) -> Optional[Dict[str, Any]]:
    if not item.get("active") or not item.get("is_visible", True):
        return None

    title = (item.get("title") or "").strip()
    company = (item.get("company_name") or "").strip()
    url = (item.get("url") or "").strip()
    external_id = (item.get("id") or "").strip()
    if not external_id or not title or not company:
        return None

    category = (item.get("category") or "").strip()
    cohorts = _CATEGORY_TO_COHORTS.get(category, [])

    locations = [str(l) for l in (item.get("locations") or []) if l]
    city, state, is_remote, work_mode = _parse_locations(locations)

    raw_date = item.get("date_posted")
    if isinstance(raw_date, int):
        from datetime import datetime, timezone
        date_posted = datetime.fromtimestamp(raw_date, tz=timezone.utc).strftime("%Y-%m-%d")
    else:
        date_posted = str(raw_date or "")[:20]

    return {
        "external_id": f"simplify_{external_id}",
        "company": company,
        "title": title,
        "description": "",
        "apply_url": url,
        "location_city": city,
        "location_state": state,
        "work_mode": work_mode,
        "remote": is_remote,
        "source_ats": "simplify",
        "job_type": job_type,
        "cohorts": cohorts,
        "tags": [],
        "team": category,
        "posted_date": date_posted,
        "industry": "technology",
    }


def fetch_simplify_listings() -> List[Dict[str, Any]]:
    """
    Fetch active listings from both SimplifyJobs GitHub feeds.
    Returns normalized listing dicts ready for _upsert_listing().
    """
    results: List[Dict[str, Any]] = []

    for url, job_type in [
        (_INTERNSHIPS_URL, "internship"),
        (_NEW_GRAD_URL, "entry_level"),
    ]:
        try:
            raw = _fetch_json(url)
        except Exception as e:
            import sys
            sys.stderr.write(f"[simplify] fetch failed ({job_type}): {type(e).__name__}: {e}\n")
            continue

        before = len(results)
        for item in raw:
            listing = _normalize(item, job_type)
            if listing:
                results.append(listing)

        import sys
        sys.stderr.write(
            f"[simplify] {job_type}: {len(raw)} total → "
            f"{len(results) - before} active added\n"
        )

    return results
