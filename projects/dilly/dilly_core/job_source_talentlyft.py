"""
TalentLyft job board scraper.

TalentLyft is a popular ATS used primarily in Eastern Europe and the Balkans.
Each company has a career page at:
  https://<company>.talentlyft.com/jobs

The public JSON API is at:
  GET https://<company>.talentlyft.com/api/v2/jobs

Returns a list of open positions.

De-dupe key: "talentlyft_<company>_<jobId>"
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


def _strip_html(raw: str) -> str:
    text = _HTML_TAG_RE.sub(" ", raw or "")
    return _WS_RE.sub(" ", text).strip()[:2000]


def fetch_talentlyft_jobs(
    company: str,
    company_name: str,
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from a TalentLyft company's public JSON API."""
    try:
        from crawl_internships_v2 import classify_listing, extract_tags
    except ImportError:
        try:
            from projects.dilly.crawl_internships_v2 import classify_listing, extract_tags
        except ImportError:
            classify_listing = lambda t, d="": "other"
            extract_tags = lambda t, d="": []

    results: List[Dict[str, Any]] = []

    for url in [
        f"https://{company}.talentlyft.com/api/v2/jobs",
        f"https://{company}.talentlyft.com/api/jobs",
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
        return []

    jobs_raw = data if isinstance(data, list) else data.get("jobs", data.get("data", []))

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
        is_remote = "remote" in location.lower() or bool(job.get("remote"))
        apply_url = job.get("url") or f"https://{company}.talentlyft.com/jobs/{job_id}"
        posted = (job.get("created_at") or job.get("published_at") or "")[:10]
        dept = (job.get("department") or "").strip() if isinstance(job.get("department"), str) else ""

        results.append({
            "external_id": f"talentlyft_{company}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": location or None,
            "location_state": None,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "talentlyft",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


TALENTLYFT_COMPANIES: Dict[str, Tuple[str, str]] = {
    # TalentLyft is popular in Croatia, Serbia, Bosnia, Slovenia, Romania, Bulgaria
    "infobip":              ("Infobip", "Tech"),
    "eon":                  ("E.ON Croatia", "Tech"),
    "hep":                  ("HEP Group", "Tech"),
    "tankerska":            ("Tankerska", "Consumer"),
    "pliva":                ("PLIVA", "Healthcare"),
    "podravka":             ("Podravka", "Consumer"),
    "konzum":               ("Konzum", "Consumer"),
    "spar-hrvatska":        ("SPAR Croatia", "Consumer"),
    "lidl-hrvatska":        ("Lidl Croatia", "Consumer"),
    "dm-drogerie":          ("dm drogerie", "Consumer"),
    "erste-banka":          ("Erste Bank", "Finance"),
    "pbz":                  ("PBZ", "Finance"),
    "rba":                  ("RBA", "Finance"),
    "otpbanka":             ("OTP Banka", "Finance"),
    "hpb":                  ("HPB", "Finance"),
    "addiko":               ("Addiko Bank", "Finance"),
    "unicredithr":          ("UniCredit Croatia", "Finance"),
    "agram-banka":          ("Agram Banka", "Finance"),
    "nkbm":                 ("NKBM", "Finance"),
    "nlb":                  ("NLB Group", "Finance"),
    "abanka":               ("Abanka", "Finance"),
    "sparkasse-si":         ("Sparkasse Slovenia", "Finance"),
    "intesa-si":            ("Intesa Sanpaolo SI", "Finance"),
    "generali-si":          ("Generali Insurance SI", "Finance"),
    "triglav":              ("Zavarovalnica Triglav", "Finance"),
    "vzajemna":             ("Vzajemna", "Finance"),
    "adriatic-si":          ("Adriatic Slovenica", "Finance"),
    "euroherc":             ("Euroherc", "Finance"),
    "croatia-osiguranje":   ("Croatia Osiguranje", "Finance"),
    "allianz-hr":           ("Allianz Croatia", "Finance"),
    "grawe":                ("Grawe", "Finance"),
    "kbc":                  ("KBC Group", "Finance"),
    "raiffeisen-rs":        ("Raiffeisen Serbia", "Finance"),
    "banca-intesa-rs":      ("Banca Intesa Serbia", "Finance"),
    "airserbia":            ("Air Serbia", "Consumer"),
    "hak":                  ("HAK", "Tech"),
    "h-telekom":            ("Hrvatski Telekom", "Tech"),
    "a1-hr":                ("A1 Croatia", "Tech"),
    "t2":                   ("T-2", "Tech"),
    "bit":                  ("B-IT group", "Tech"),
    "q":                    ("Q", "Tech"),
    "mobilisis":            ("Mobilisis", "Tech"),
    "span":                 ("SPAN", "Tech"),
    "nsoft":                ("NSoft", "Tech"),
    "king-ict":             ("King ICT", "Tech"),
    "combis":               ("Combis", "Tech"),
    "asseco-see":           ("Asseco SEE", "Tech"),
    "s4f":                  ("S4F", "Finance"),
    "orgnostic":            ("Orgnostic", "Tech"),
    "pumox":                ("Pumox", "Tech"),
}


def fetch_all_talentlyft(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured TalentLyft company boards."""
    if companies is None:
        companies = TALENTLYFT_COMPANIES

    results: List[Dict[str, Any]] = []
    for company, (name, industry) in companies.items():
        try:
            jobs = fetch_talentlyft_jobs(company, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[talentlyft] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[talentlyft] {name} ({company}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[talentlyft] total: {len(results)} jobs\n")
    return results
