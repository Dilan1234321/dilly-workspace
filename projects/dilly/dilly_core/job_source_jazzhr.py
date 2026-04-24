"""
JazzHR job board scraper.

JazzHR is an SMB-focused ATS used by ~10,000 US companies. Career pages are at:
  https://<company>.applytojob.com/apply

The public JSON API (no auth):
  GET https://<company>.applytojob.com/apply/jobs/json

De-dupe key: "jazzhr_<slug>_<job_id>"
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


def _parse_location(loc_str: str) -> Tuple[Optional[str], Optional[str], bool]:
    loc = (loc_str or "").strip()
    lower = loc.lower()
    is_remote = "remote" in lower or "hybrid" in lower or "virtual" in lower
    m = re.match(r"^([^,]+),\s*([A-Z]{2})\s*$", loc)
    if m and m.group(2) in _US_STATES:
        return m.group(1).strip(), m.group(2), is_remote
    return (loc or None), None, is_remote


def fetch_jazzhr_jobs(
    slug: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a JazzHR company's public JSON API.

    slug: JazzHR company subdomain (e.g. 'acme' for acme.applytojob.com)
    """
    try:
        from crawl_internships_v2 import classify_listing, extract_tags
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing, extract_tags
        except ImportError:
            classify_listing = lambda t, d="": "other"
            extract_tags = lambda t, d="": []

    url = f"https://{slug}.applytojob.com/apply/jobs/json"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        sys.stderr.write(f"[jazzhr] {slug}: fetch failed: {type(e).__name__}: {e}\n")
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

        desc = _strip_html(job.get("description") or job.get("notes") or "")
        job_type = classify_listing(title, desc)

        city = (job.get("city") or "").strip() or None
        state_raw = (job.get("state") or "").strip()
        state = state_raw if state_raw in _US_STATES else None
        loc_str = f"{city or ''}, {state_raw}".strip(", ")
        _, _, is_remote = _parse_location(loc_str)
        if not is_remote:
            is_remote = job.get("remote") is True or "remote" in title.lower()

        apply_url = (
            job.get("apply_url") or
            f"https://{slug}.applytojob.com/apply/{job_id}"
        )
        posted = (job.get("open_date") or job.get("created_at") or "")[:10]
        dept = (job.get("department") or "").strip()

        results.append({
            "external_id": f"jazzhr_{slug}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "jazzhr",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


JAZZHR_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Tech / SaaS
    "leadpages":            ("Leadpages", "Tech"),
    "sendgrid":             ("SendGrid", "Tech"),
    "yesware":              ("Yesware", "Tech"),
    "unbounce":             ("Unbounce", "Tech"),
    "formstack":            ("Formstack", "Tech"),
    "wistia":               ("Wistia", "Tech"),
    "brightcove":           ("Brightcove", "Tech"),
    "vidyard":              ("Vidyard", "Tech"),
    "drift":                ("Drift", "Tech"),
    "salesloft":            ("Salesloft", "Tech"),
    "outreach-io":          ("Outreach", "Tech"),
    "highspot":             ("Highspot", "Tech"),
    "seismic":              ("Seismic", "Tech"),
    "showpad":              ("Showpad", "Tech"),
    "mindtickle":           ("Mindtickle", "Tech"),
    "chorus-ai":            ("Chorus.ai", "Tech"),
    "gong-io":              ("Gong", "Tech"),
    "clari":                ("Clari", "Tech"),
    "revenue-io":           ("Revenue.io", "Tech"),
    "xactlycorp":           ("Xactly Corp", "Tech"),
    "spiff-inc":            ("Spiff", "Tech"),
    "captivateiq":          ("CaptivateIQ", "Tech"),
    "varicent":             ("Varicent", "Tech"),
    "anaplan":              ("Anaplan", "Tech"),
    "planful":              ("Planful", "Tech"),
    "adaptive-insights":    ("Workday Adaptive Planning", "Tech"),
    "vena-solutions":       ("Vena Solutions", "Tech"),
    "jedox":                ("Jedox", "Tech"),
    "pigment-hq":           ("Pigment", "Tech"),
    "mosaic-tech":          ("Mosaic", "Tech"),
    # Healthcare / medical
    "modernizingmedicine":  ("Modernizing Medicine", "Healthcare"),
    "healthstream":         ("HealthStream", "Healthcare"),
    "healthcaresource":     ("HealthcareSource", "Healthcare"),
    "symplr":               ("symplr", "Healthcare"),
    "netsmart":             ("Netsmart Technologies", "Healthcare"),
    "alayacare":            ("AlayaCare", "Healthcare"),
    "wellsky":              ("WellSky", "Healthcare"),
    "sagimedical":          ("Sagi Medical", "Healthcare"),
    "medicalguardian":      ("Medical Guardian", "Healthcare"),
    "philips-health":       ("Philips Healthcare", "Healthcare"),
    # Finance / insurance
    "tipalti":              ("Tipalti", "Finance"),
    "bill-com":             ("Bill.com", "Finance"),
    "routable":             ("Routable", "Finance"),
    "melio-payments":       ("Melio", "Finance"),
    "modern-treasury":      ("Modern Treasury", "Finance"),
    "stripe-partner":       ("Stripe Partner", "Finance"),
    "parafin":              ("Parafin", "Finance"),
    "clearco":              ("Clearco", "Finance"),
    "capchase":             ("Capchase", "Finance"),
    "founderpath":          ("Founderpath", "Finance"),
    # Restaurant / food service
    "zaxbys":               ("Zaxby's", "Consumer"),
    "firehouse-subs":       ("Firehouse Subs", "Consumer"),
    "mcalisters-deli":      ("McAlister's Deli", "Consumer"),
    "schlotzskys":          ("Schlotzsky's", "Consumer"),
    "moes-sw-grill":        ("Moe's Southwest Grill", "Consumer"),
    "wingstop":             ("Wingstop", "Consumer"),
    "potbelly":             ("Potbelly", "Consumer"),
    "noodles-company":      ("Noodles & Company", "Consumer"),
    "jason-deli":           ("Jason's Deli", "Consumer"),
    "steak-n-shake":        ("Steak 'n Shake", "Consumer"),
    "checkers-rallys":      ("Checkers / Rally's", "Consumer"),
    "jack-in-the-box":      ("Jack in the Box", "Consumer"),
    "del-taco":             ("Del Taco", "Consumer"),
    "el-pollo-loco":        ("El Pollo Loco", "Consumer"),
    "fatburger":            ("Fatburger", "Consumer"),
    "johnny-rockets":       ("Johnny Rockets", "Consumer"),
    "smashburger":          ("Smashburger", "Consumer"),
    "the-habit-burger":     ("The Habit Burger Grill", "Consumer"),
    "shake-shack-corp":     ("Shake Shack", "Consumer"),
    "whataburger":          ("Whataburger", "Consumer"),
    # Construction / trades
    "sunbelt-rentals":      ("Sunbelt Rentals", "Consumer"),
    "unitedrentals":        ("United Rentals", "Consumer"),
    "herc-rentals":         ("Herc Rentals", "Consumer"),
    "ahern-rentals":        ("Ahern Rentals", "Consumer"),
    "bluebird-network":     ("Bluebird Network", "Tech"),
    "mastec":               ("MasTec", "Consumer"),
    "quanta-services":      ("Quanta Services", "Consumer"),
    "dycom-industries":     ("Dycom Industries", "Consumer"),
    # Staffing / recruiting
    "staffmark":            ("Staffmark", "Consumer"),
    "spherion":             ("Spherion", "Consumer"),
    "resourcemfg":          ("ResourceMFG", "Consumer"),
    "staffingplus":         ("Staffing Plus", "Consumer"),
    "expresspros":          ("Express Employment Professionals", "Consumer"),
    "labor-finders":        ("Labor Finders", "Consumer"),
    "pro-unlimited":        ("Pro Unlimited", "Consumer"),
    "strategic-staffing":   ("Strategic Staffing Solutions", "Consumer"),
    "volt-workforce":       ("Volt Workforce Solutions", "Consumer"),
    "staffmark-group":      ("Staffmark Group", "Consumer"),
    # Nonprofit / education
    "nationalparkfnd":      ("National Park Foundation", "Consumer"),
    "redcross-careers":     ("American Red Cross", "Consumer"),
    "unitedway":            ("United Way", "Consumer"),
    "ymca-careers":         ("YMCA", "Consumer"),
    "bgca-org":             ("Boys & Girls Clubs", "Consumer"),
    "habitatforhumanity":   ("Habitat for Humanity", "Consumer"),
    "feedingamerica":       ("Feeding America", "Consumer"),
    "salvationarmy":        ("The Salvation Army", "Consumer"),
    "goodwill-careers":     ("Goodwill Industries", "Consumer"),
}


def fetch_all_jazzhr(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured JazzHR company boards."""
    if companies is None:
        companies = JAZZHR_COMPANIES
    results: List[Dict[str, Any]] = []
    for slug, (name, industry) in companies.items():
        try:
            jobs = fetch_jazzhr_jobs(slug, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[jazzhr] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[jazzhr] {name} ({slug}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)
    sys.stderr.write(f"[jazzhr] total: {len(results)} jobs\n")
    return results
