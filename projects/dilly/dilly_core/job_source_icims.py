"""
iCIMS job board scraper.

iCIMS is one of the largest enterprise ATSs. Companies host at:
  https://<company>.icims.com/jobs/search

The public JSON feed is at:
  GET https://<company>.icims.com/jobs/search?pr=<page>&ss=1&searchCategory=0
  with Accept: application/json → returns structured job list

OR the more reliable path via the portal API:
  GET https://careers.icims.com/jobs/<company>/search

This module uses the iframe/widget JSON endpoint which is public and
does not require authentication.

Companies have an iCIMS tenant ID (numeric) that maps to their
subdomain. The subdomain is often 'careers-<company>' or
'<company>-careers' or just '<company>'.

De-dupe key: "icims_<tenant>_<job_id>"
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


def _fetch_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={
        "User-Agent": _USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _parse_location(loc_str: str) -> Tuple[Optional[str], Optional[str], bool]:
    """Returns (city, state, is_remote)."""
    loc = (loc_str or "").strip()
    lower = loc.lower()
    is_remote = "remote" in lower or "hybrid" in lower or "virtual" in lower
    # "City, ST" pattern
    m = re.match(r"^([^,]+),\s*([A-Z]{2})\s*$", loc)
    if m and m.group(2) in _US_STATES:
        return m.group(1).strip(), m.group(2), is_remote
    # bare city
    if loc and not is_remote:
        return loc, None, False
    return None, None, is_remote


def fetch_icims_jobs(subdomain: str, company_name: str, max_jobs: int = 200) -> List[Dict[str, Any]]:
    """
    Fetch open jobs from an iCIMS company portal.

    subdomain: the company's iCIMS subdomain, e.g. 'careers-amazon' or 'abbott'
    Returns normalized listing dicts.
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
    page = 1
    per_page = 50

    while len(results) < max_jobs:
        url = (
            f"https://{subdomain}.icims.com/jobs/search"
            f"?ss=1&searchCategory=0&searchLocation=0"
            f"&searchZip=&searchRadius=30&searchType=basic"
            f"&in_iframe=1&mobile=false&width=820&height=500"
            f"&bga=true&needsRedirect=false&pr={page}&jobs_per_page={per_page}"
        )
        try:
            data = _fetch_json(url)
        except Exception as e:
            sys.stderr.write(f"[icims] {subdomain} page {page} failed: {type(e).__name__}: {e}\n")
            break

        # iCIMS can return JSON or HTML depending on config. Try to parse jobs.
        jobs_raw: List[Dict] = []
        if isinstance(data, dict):
            jobs_raw = data.get("searchResults", data.get("jobs", data.get("items", [])))
        elif isinstance(data, list):
            jobs_raw = data

        if not jobs_raw:
            break

        for job in jobs_raw:
            job_id = str(job.get("id") or job.get("jobId") or job.get("job_id") or "")
            title = (job.get("title") or job.get("job_title") or "").strip()
            if not title or not job_id:
                continue
            desc = _strip_html(job.get("description") or job.get("jobDescription") or "")
            job_type = classify_listing(title, desc)
            loc_str = (job.get("location") or job.get("city") or "").strip()
            city, state, is_remote = _parse_location(loc_str)
            apply_url = (
                job.get("url") or job.get("applyUrl") or
                f"https://{subdomain}.icims.com/jobs/{job_id}/job"
            )
            posted = (job.get("datePosted") or job.get("posted_date") or "")[:10]
            dept = (job.get("category") or job.get("department") or "").strip()

            results.append({
                "external_id": f"icims_{subdomain}_{job_id}",
                "company": company_name,
                "title": title,
                "description": desc,
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if is_remote else "unknown",
                "remote": is_remote,
                "source_ats": "icims",
                "job_type": job_type,
                "cohorts": [],
                "tags": extract_tags(title, desc),
                "team": dept,
                "posted_date": posted,
                "industry": "technology",
            })

        if len(jobs_raw) < per_page:
            break
        page += 1
        time.sleep(0.5)

    return results


# ── Known iCIMS company subdomains ────────────────────────────────────────────
# Format: subdomain → (display_name, industry)
ICIMS_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Healthcare / hospital systems
    "hcahealthcare":        ("HCA Healthcare", "Healthcare"),
    "clevelandclinic":      ("Cleveland Clinic", "Healthcare"),
    "mayoclinic":           ("Mayo Clinic", "Healthcare"),
    "johnshopkins":         ("Johns Hopkins", "Healthcare"),
    "kaiser":               ("Kaiser Permanente", "Healthcare"),
    "cedars-sinai":         ("Cedars-Sinai", "Healthcare"),
    "uchealth":             ("UCHealth", "Healthcare"),
    "adventhealth":         ("AdventHealth", "Healthcare"),
    "dignityhealth":        ("Dignity Health", "Healthcare"),
    "commonspirit":         ("CommonSpirit Health", "Healthcare"),
    "ascension":            ("Ascension Health", "Healthcare"),
    "tenetcare":            ("Tenet Healthcare", "Healthcare"),
    "community-health":     ("Community Health Systems", "Healthcare"),
    "lifepoint":            ("LifePoint Health", "Healthcare"),
    "steward":              ("Steward Health Care", "Healthcare"),
    "banner":               ("Banner Health", "Healthcare"),
    "providence":           ("Providence Health", "Healthcare"),
    "intermountain":        ("Intermountain Healthcare", "Healthcare"),
    "spectrum-health":      ("Spectrum Health", "Healthcare"),
    "geisinger":            ("Geisinger", "Healthcare"),
    "froedtert":            ("Froedtert Health", "Healthcare"),
    "ssm-health":           ("SSM Health", "Healthcare"),
    "mercy":                ("Mercy Health", "Healthcare"),
    "christus":             ("CHRISTUS Health", "Healthcare"),
    "bswhealth":            ("Baylor Scott & White", "Healthcare"),
    "texaschildrens":       ("Texas Children's Hospital", "Healthcare"),
    "bostonchildrens":      ("Boston Children's Hospital", "Healthcare"),
    "childrens-national":   ("Children's National", "Healthcare"),
    "chop":                 ("Children's Hospital of Philadelphia", "Healthcare"),
    "nationwidechildrens":  ("Nationwide Children's Hospital", "Healthcare"),
    # Pharma / life sciences
    "careers-abbott":       ("Abbott", "Biotech"),
    "lilly-jobs":           ("Eli Lilly", "Biotech"),
    "merck":                ("Merck", "Biotech"),
    "careers-jnj":          ("Johnson & Johnson", "Biotech"),
    "bmscareer":            ("Bristol Myers Squibb", "Biotech"),
    "gskjobs":              ("GSK", "Biotech"),
    "careers-astrazeneca":  ("AstraZeneca", "Biotech"),
    "jobs-pfizer":          ("Pfizer", "Biotech"),
    "novartis-jobs":        ("Novartis", "Biotech"),
    "sanofi":               ("Sanofi", "Biotech"),
    "boehringer":           ("Boehringer Ingelheim", "Biotech"),
    "medtronic":            ("Medtronic", "Healthcare"),
    "careers-bard":         ("BD (Becton Dickinson)", "Healthcare"),
    "stryker":              ("Stryker", "Healthcare"),
    "careers-zimmer":       ("Zimmer Biomet", "Healthcare"),
    "smith-nephew":         ("Smith & Nephew", "Healthcare"),
    "haemonetics":          ("Haemonetics", "Healthcare"),
    "integra":              ("Integra LifeSciences", "Healthcare"),
    "globus-medical":       ("Globus Medical", "Healthcare"),
    # Finance / insurance
    "progressive":          ("Progressive Insurance", "Finance"),
    "allstate":             ("Allstate", "Finance"),
    "metlife":              ("MetLife", "Finance"),
    "prudential":           ("Prudential", "Finance"),
    "unum":                 ("Unum", "Finance"),
    "lincoln-national":     ("Lincoln National", "Finance"),
    "principals":           ("Principal Financial", "Finance"),
    "nationwide":           ("Nationwide", "Finance"),
    "manulife":             ("Manulife", "Finance"),
    "sunlife":              ("Sun Life", "Finance"),
    "great-west":           ("Great-West Life", "Finance"),
    "aflac":                ("Aflac", "Finance"),
    "assurant":             ("Assurant", "Finance"),
    "torchmark":            ("Globe Life", "Finance"),
    "cmfg":                 ("CUNA Mutual Group", "Finance"),
    "securian":             ("Securian Financial", "Finance"),
    "ameritas":             ("Ameritas", "Finance"),
    "pacific-life":         ("Pacific Life", "Finance"),
    "protective":           ("Protective Life", "Finance"),
    "guardian-life":        ("Guardian Life", "Finance"),
    "massmutual":           ("MassMutual", "Finance"),
    "nycers":               ("NYCERS", "Government"),
    "navyfederal":          ("Navy Federal Credit Union", "Finance"),
    "penfed":               ("PenFed Credit Union", "Finance"),
    "schoolsfirstfcu":      ("SchoolsFirst FCU", "Finance"),
    # Retail / consumer
    "walmart":              ("Walmart", "Consumer"),
    "target-careers":       ("Target", "Consumer"),
    "kohls":                ("Kohl's", "Consumer"),
    "nordstrom":            ("Nordstrom", "Consumer"),
    "tjx":                  ("TJX Companies", "Consumer"),
    "ross-stores":          ("Ross Stores", "Consumer"),
    "Burlington":           ("Burlington", "Consumer"),
    "bed-bath-beyond":      ("Bed Bath & Beyond", "Consumer"),
    "michaels":             ("Michaels", "Consumer"),
    "joann":                ("JOANN", "Consumer"),
    "hobbylobby":           ("Hobby Lobby", "Consumer"),
    "five-below":           ("Five Below", "Consumer"),
    "dollar-general":       ("Dollar General", "Consumer"),
    "dollar-tree":          ("Dollar Tree", "Consumer"),
    "familydollar":         ("Family Dollar", "Consumer"),
    "aldi":                 ("ALDI", "Consumer"),
    "lidl":                 ("Lidl", "Consumer"),
    "trader-joes":          ("Trader Joe's", "Consumer"),
    "publix":               ("Publix", "Consumer"),
    "heb":                  ("HEB", "Consumer"),
    "wegmans":              ("Wegmans", "Consumer"),
    "meijer":               ("Meijer", "Consumer"),
    # Technology / enterprise
    "careers-sap":          ("SAP", "Tech"),
    "oracle-careers":       ("Oracle", "Tech"),
    "hp-careers":           ("HP", "Tech"),
    "careers-dell":         ("Dell Technologies", "Tech"),
    "careers-xerox":        ("Xerox", "Tech"),
    "careers-leidos":       ("Leidos", "Government"),
    "careers-booz":         ("Booz Allen Hamilton", "Consulting"),
    "saic-careers":         ("SAIC", "Government"),
    "general-dynamics":     ("General Dynamics", "Tech"),
    "northrop":             ("Northrop Grumman", "Tech"),
    "raytheon":             ("Raytheon", "Tech"),
    "l3harris":             ("L3Harris", "Tech"),
    "bae-systems":          ("BAE Systems", "Tech"),
    "textron":              ("Textron", "Tech"),
    "harris":               ("Harris Corporation", "Tech"),
    "cubic":                ("Cubic Corporation", "Tech"),
    "dxc-technology":       ("DXC Technology", "Consulting"),
    "cognizant":            ("Cognizant", "Consulting"),
    "infosys":              ("Infosys", "Consulting"),
    "wipro":                ("Wipro", "Consulting"),
    "tcs":                  ("TCS", "Consulting"),
    "hcl-technologies":     ("HCL Technologies", "Consulting"),
    # ── Added 2026-04-24: more iCIMS tenants ──
    # Academic medical centers
    "mgh":                  ("Massachusetts General Hospital", "Healthcare"),
    "bwh":                  ("Brigham & Women's Hospital", "Healthcare"),
    "dana-farber":          ("Dana-Farber Cancer Institute", "Healthcare"),
    "childrenshospital":    ("Boston Children's Hospital", "Healthcare"),
    "bmc":                  ("Boston Medical Center", "Healthcare"),
    "umassmemorial":        ("UMass Memorial Medical", "Healthcare"),
    "laheyhealth":          ("Lahey Health", "Healthcare"),
    "bidmc":                ("BIDMC", "Healthcare"),
    "tufts-medical":        ("Tufts Medical Center", "Healthcare"),
    "newton-wellesley":     ("Newton-Wellesley Hospital", "Healthcare"),
    "hallmarkhealth":       ("Hallmark Health", "Healthcare"),
    "nwmh":                 ("Northwestern Medical", "Healthcare"),
    "rush":                 ("Rush University Medical", "Healthcare"),
    "loyola":               ("Loyola Medicine", "Healthcare"),
    "advocate-aurora":      ("Advocate Aurora Health", "Healthcare"),
    "uic-health":           ("UI Health", "Healthcare"),
    "sinai-chicago":        ("Sinai Chicago", "Healthcare"),
    "stroger":              ("Cook County Health", "Healthcare"),
    "elmhurst":             ("Elmhurst Hospital", "Healthcare"),
    "endeavorhealthjobs":   ("Endeavor Health", "Healthcare"),
    "cdh-health":           ("CDH-Delnor Health", "Healthcare"),
    "central-dupage":       ("Central DuPage Hospital", "Healthcare"),
    "lnrh":                 ("Little Company of Mary", "Healthcare"),
    "mercy-chicago":        ("Mercy Hospital Chicago", "Healthcare"),
    "presence-stjoes":      ("Presence St. Joseph", "Healthcare"),
    "resurrection":         ("Resurrection Health Care", "Healthcare"),
    "westsuburbmed":        ("West Suburban Medical", "Healthcare"),
    "uofchicago":           ("UChicago Medicine", "Healthcare"),
    "ingalls":              ("Ingalls Memorial Hospital", "Healthcare"),
    "metropolitan":         ("Metropolitan Health", "Healthcare"),
    # More pharma / biotech
    "takeda":               ("Takeda Pharmaceuticals", "Biotech"),
    "abbvie":               ("AbbVie", "Biotech"),
    "regeneron":            ("Regeneron", "Biotech"),
    "vertex":               ("Vertex Pharmaceuticals", "Biotech"),
    "biogen":               ("Biogen", "Biotech"),
    "alexion":              ("Alexion/AstraZeneca", "Biotech"),
    "alkermes":             ("Alkermes", "Biotech"),
    "catalent":             ("Catalent", "Biotech"),
    "lonza":                ("Lonza", "Biotech"),
    "fujifilm-diosynth":    ("FUJIFILM Diosynth", "Biotech"),
    "cambrex":              ("Cambrex", "Biotech"),
    "recipharm":            ("Recipharm", "Biotech"),
    "piramal":              ("Piramal Pharma", "Biotech"),
    "divi-labs":            ("Divi's Laboratories", "Biotech"),
    "ipca":                 ("IPCA Laboratories", "Biotech"),
    "sun-pharma":           ("Sun Pharmaceutical", "Biotech"),
    "cipla":                ("Cipla", "Biotech"),
    "dr-reddy":             ("Dr. Reddy's", "Biotech"),
    "lupin":                ("Lupin Pharmaceuticals", "Biotech"),
    "aurobindo":            ("Aurobindo Pharma", "Biotech"),
    # Education
    "arizona-state":        ("Arizona State University", "Education"),
    "ohio-state":           ("Ohio State University", "Education"),
    "penn-state":           ("Penn State", "Education"),
    "michigan-state":       ("Michigan State University", "Education"),
    "purdue":               ("Purdue University", "Education"),
    "rutgers":              ("Rutgers University", "Education"),
    "uconn":                ("University of Connecticut", "Education"),
    "iowa-state":           ("Iowa State University", "Education"),
    "kansas-state":         ("Kansas State University", "Education"),
    "colorado-state":       ("Colorado State University", "Education"),
    "oregon-state":         ("Oregon State University", "Education"),
    "washington-state":     ("Washington State University", "Education"),
    "virginia-tech":        ("Virginia Tech", "Education"),
    "clemson":              ("Clemson University", "Education"),
    "auburn":               ("Auburn University", "Education"),
    "mississippi-state":    ("Mississippi State University", "Education"),
    "boise-state":          ("Boise State University", "Education"),
    "new-mexico-state":     ("New Mexico State University", "Education"),
    "nevada-reno":          ("University of Nevada Reno", "Education"),
    "nevada-las-vegas":     ("UNLV", "Education"),
    # Government / public sector
    "nyc-gov":              ("NYC Government", "Government"),
    "la-county":            ("Los Angeles County", "Government"),
    "cook-county":          ("Cook County Government", "Government"),
    "miami-dade":           ("Miami-Dade County", "Government"),
    "harris-county":        ("Harris County", "Government"),
    "maricopa":             ("Maricopa County", "Government"),
    "king-county":          ("King County", "Government"),
    "sf-city":              ("City of San Francisco", "Government"),
    "seattle-gov":          ("City of Seattle", "Government"),
    "boston-gov":           ("City of Boston", "Government"),
    "chicago-gov":          ("City of Chicago", "Government"),
    "dc-gov":               ("DC Government", "Government"),
    "phoenix-gov":          ("City of Phoenix", "Government"),
    "san-antonio":          ("City of San Antonio", "Government"),
    "dallas-gov":           ("City of Dallas", "Government"),
    "houston-gov":          ("City of Houston", "Government"),
    "austin-gov":           ("City of Austin", "Government"),
    "denver-gov":           ("City of Denver", "Government"),
    "portland-gov":         ("City of Portland", "Government"),
    "san-diego-gov":        ("City of San Diego", "Government"),
    "san-jose-gov":         ("City of San Jose", "Government"),
    "jacksonville-gov":     ("City of Jacksonville", "Government"),
    "columbus-gov":         ("City of Columbus", "Government"),
    "charlotte-gov":        ("City of Charlotte", "Government"),
    "fort-worth-gov":       ("City of Fort Worth", "Government"),
    "el-paso-gov":          ("City of El Paso", "Government"),
    "memphis-gov":          ("City of Memphis", "Government"),
    "nashville-gov":        ("Metropolitan Nashville", "Government"),
    "baltimore-gov":        ("City of Baltimore", "Government"),
    "milwaukee-gov":        ("City of Milwaukee", "Government"),
    "louisville-gov":       ("Louisville Metro Government", "Government"),
    "albuquerque-gov":      ("City of Albuquerque", "Government"),
    "tucson-gov":           ("City of Tucson", "Government"),
    "fresno-gov":           ("City of Fresno", "Government"),
    "mesa-gov":             ("City of Mesa", "Government"),
    "sacramento-gov":       ("City of Sacramento", "Government"),
    "minneapolis-gov":      ("City of Minneapolis", "Government"),
    "omaha-gov":            ("City of Omaha", "Government"),
    "cleveland-gov":        ("City of Cleveland", "Government"),
    "raleigh-gov":          ("City of Raleigh", "Government"),
    "virginia-beach-gov":   ("City of Virginia Beach", "Government"),
    "colorado-springs-gov": ("City of Colorado Springs", "Government"),
    "tampa-gov":            ("City of Tampa", "Government"),
    "new-orleans-gov":      ("City of New Orleans", "Government"),
    "las-vegas-gov":        ("City of Las Vegas", "Government"),
    "atlanta-gov":          ("City of Atlanta", "Government"),
    "kansas-city-gov":      ("Kansas City MO", "Government"),
    "oklahoma-city-gov":    ("City of Oklahoma City", "Government"),
    "indianapolis-gov":     ("City of Indianapolis", "Government"),
}


def fetch_all_icims(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from all iCIMS tenants in the companies dict.
    Returns a flat list of normalized listing dicts.
    """
    if companies is None:
        companies = ICIMS_COMPANIES

    results: List[Dict[str, Any]] = []
    for subdomain, (name, industry) in companies.items():
        try:
            jobs = fetch_icims_jobs(subdomain, name, max_jobs=max_per_company)
            results.extend(jobs)
            sys.stderr.write(f"[icims] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[icims] {name} ({subdomain}) failed: {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[icims] total: {len(results)} jobs from {len(companies)} tenants\n")
    return results
