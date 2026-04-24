"""
Personio job board scraper.

Personio is the leading HR platform in Europe (DACH, Benelux, UK, Iberia).
Each company has a careers page at:
  https://<company>.jobs.personio.de/
  or
  https://<company>.jobs.personio.com/

The public JSON API is:
  GET https://<company>.jobs.personio.de/xml  → XML with all jobs
  GET https://<company>.jobs.personio.com/xml → XML with all jobs

Alternatively a JSON endpoint exists at:
  GET https://api.personio.de/v1/recruiting/jobboard/positions
  with Host header: <company>.jobs.personio.de
  (Requires knowing the internal employer slug though)

Most reliable: parse the XML feed directly, which all Personio boards expose.

De-dupe key: "personio_<company>_<jobId>"
"""
from __future__ import annotations

import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

_USER_AGENT = "Dilly-Job-Ingest/1.0 (+https://hellodilly.com)"
_TIMEOUT = 20

_WS_RE = re.compile(r"\s+")
_HTML_TAG_RE = re.compile(r"<[^>]+>")

_US_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC",
}


def _strip_html(raw: str) -> str:
    text = _HTML_TAG_RE.sub(" ", raw or "")
    return _WS_RE.sub(" ", text).strip()[:2000]


def _fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT, "Accept": "application/xml, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_personio_jobs(
    company: str,
    company_name: str,
    tld: str = "de",
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a Personio company's XML feed.

    company: the Personio subdomain slug (e.g. 'n26', 'sumup', 'babbel')
    tld: 'de' for German-hosted or 'com' for international
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

    # Try .de first, then .com
    raw_xml = ""
    for domain_tld in [tld, "com" if tld == "de" else "de"]:
        url = f"https://{company}.jobs.personio.{domain_tld}/xml"
        try:
            raw_xml = _fetch_text(url)
            if raw_xml.strip().startswith("<"):
                break
        except Exception:
            continue

    if not raw_xml:
        sys.stderr.write(f"[personio] {company}: could not fetch XML feed\n")
        return []

    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as e:
        sys.stderr.write(f"[personio] {company}: XML parse error: {e}\n")
        return []

    # Personio XML structure: <workzag-jobs><job><...fields...></job></workzag-jobs>
    # or <jobs><position><...></position></jobs>
    jobs_el = root.findall(".//job") or root.findall(".//position") or root.findall(".//vacancy")

    for job in jobs_el[:max_jobs]:
        def _text(tag: str) -> str:
            el = job.find(tag)
            return (el.text or "").strip() if el is not None else ""

        job_id = _text("id") or _text("jobId") or _text("externalId")
        title = _text("name") or _text("title") or _text("position")
        if not title or not job_id:
            continue

        desc = _strip_html(_text("jobDescriptions") or _text("description") or _text("body") or "")
        job_type = classify_listing(title, desc)

        location = _text("office") or _text("location") or _text("city") or ""
        city = location.split(",")[0].strip() if location else None
        state_raw = location.split(",")[1].strip() if "," in location else ""
        state = state_raw if state_raw in _US_STATES else None
        is_remote = "remote" in (location or "").lower() or "remote" in title.lower()

        apply_url = _text("url") or _text("applyUrl") or f"https://{company}.jobs.personio.de/job/{job_id}"
        posted = (_text("createdAt") or _text("datePosted") or "")[:10]
        dept = _text("department") or _text("team") or ""

        results.append({
            "external_id": f"personio_{company}_{job_id}",
            "company": company_name,
            "title": title,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote" if is_remote else "unknown",
            "remote": is_remote,
            "source_ats": "personio",
            "job_type": job_type,
            "cohorts": [],
            "tags": extract_tags(title, desc),
            "team": dept,
            "posted_date": posted,
            "industry": "technology",
        })

    return results


PERSONIO_COMPANIES: Dict[str, Tuple[str, str]] = {
    # German / DACH tech companies
    "n26":                  ("N26", "Finance"),
    "sumup":                ("SumUp", "Finance"),
    "babbel":               ("Babbel", "Tech"),
    "taxfix":               ("Taxfix", "Finance"),
    "clark":                ("Clark", "Finance"),
    "getsafe":              ("Getsafe", "Finance"),
    "friday":               ("Friday Insurance", "Finance"),
    "element":              ("Element", "Finance"),
    "ottonova":             ("Ottonova", "Healthcare"),
    "Ada-Health":           ("Ada Health", "Healthcare"),
    "kry":                  ("KRY/Livi", "Healthcare"),
    "meditopia":            ("Meditopia", "Healthcare"),
    "care-com-eu":          ("Care.com EU", "Tech"),
    "thermondo":            ("Thermondo", "Tech"),
    "bilendi":              ("Bilendi", "Tech"),
    "chrono24":             ("Chrono24", "Consumer"),
    "home24":               ("Home24", "Consumer"),
    "westwing":             ("Westwing", "Consumer"),
    "windeln":              ("Windeln", "Consumer"),
    "idealo":               ("Idealo", "Tech"),
    "check24":              ("Check24", "Tech"),
    "verivox":              ("Verivox", "Tech"),
    "smava":                ("Smava", "Finance"),
    "auxmoney":             ("Auxmoney", "Finance"),
    "kreditech":            ("Kreditech", "Finance"),
    "penta-bank":           ("Penta", "Finance"),
    "kontist":              ("Kontist", "Finance"),
    "holvi":                ("Holvi", "Finance"),
    "payfit":               ("PayFit", "Finance"),
    "personio":             ("Personio", "Tech"),
    "factorial-hr":         ("Factorial HR", "Tech"),
    "kenjo":                ("Kenjo", "Tech"),
    "rexx-systems":         ("rexx systems", "Tech"),
    "sage-hr":              ("Sage HR", "Tech"),
    "hrworks":              ("HRworks", "Tech"),
    "bamboohr-eu":          ("BambooHR EU", "Tech"),
    "agendrix":             ("Agendrix", "Tech"),
    "trainyo":              ("Trainyo", "Tech"),
    "learnerbly":           ("Learnerbly", "Tech"),
    "degreed":              ("Degreed", "Tech"),
    "cornerstone-eu":       ("Cornerstone OnDemand EU", "Tech"),
    # French tech
    "doctolib":             ("Doctolib", "Healthcare"),
    "content-square":       ("Contentsquare", "Tech"),
    "qonto":                ("Qonto", "Finance"),
    "lydia":                ("Lydia", "Finance"),
    "younited-credit":      ("Younited Credit", "Finance"),
    "swan":                 ("Swan", "Finance"),
    "spendesk":             ("Spendesk", "Finance"),
    "treezor":              ("Treezor", "Finance"),
    "bankin":               ("Bankin", "Finance"),
    "budget-insight":       ("Budget Insight", "Finance"),
    "alma":                 ("Alma", "Finance"),
    "pledg":                ("Pledg", "Finance"),
    "pay-green":            ("PayGreen", "Finance"),
    "memo-bank":            ("Memo Bank", "Finance"),
    "fintecture":           ("Fintecture", "Finance"),
    "aria-finance":         ("Aria", "Finance"),
    "ibanfirst":            ("iBanFirst", "Finance"),
    "linxo":                ("Linxo", "Finance"),
    "powens":               ("Powens", "Finance"),
    "tink-eu":              ("Tink", "Finance"),
    "bridge-api":           ("Bridge API", "Finance"),
    "finapi":               ("finAPI", "Finance"),
    "klarna-eu":            ("Klarna EU", "Finance"),
    "banxa":                ("Banxa", "Finance"),
    # Spanish / Iberia tech
    "typeform":             ("Typeform", "Tech"),
    "jobandtalent":         ("Job&Talent", "Tech"),
    "wallapop":             ("Wallapop", "Tech"),
    "idealista":            ("Idealista", "Tech"),
    "fotocasa":             ("Fotocasa", "Tech"),
    "infojobs":             ("InfoJobs", "Tech"),
    "eurecat":              ("Eurecat", "Tech"),
    "flywire":              ("Flywire", "Finance"),
    "aplazame":             ("Aplazame", "Finance"),
    "pagantis":             ("Pagantis", "Finance"),
    "solaris-se":           ("Solaris SE", "Finance"),
    "lendix":               ("Lendix/October", "Finance"),
    "younited-es":          ("Younited Credit ES", "Finance"),
    "carto":                ("CARTO", "Tech"),
    "landbot":              ("Landbot", "Tech"),
    "signaturit":           ("Signaturit", "Tech"),
    "plex":                 ("Plex", "Tech"),
    # Nordic tech
    "voi-technology":       ("Voi Technology", "Tech"),
    "einride":              ("Einride", "Tech"),
    "northvolt":            ("Northvolt", "Tech"),
    "polestar":             ("Polestar", "Tech"),
    "einride-eu":           ("Einride", "Tech"),
    "zettle":               ("Zettle/PayPal", "Finance"),
    "izettle-eu":           ("iZettle EU", "Finance"),
    "capcito-eu":           ("Capcito EU", "Finance"),
    "tink":                 ("Tink", "Finance"),
    "zimpler":              ("Zimpler", "Finance"),
    "trustly":              ("Trustly", "Finance"),
    "klarna-sweden":        ("Klarna SE", "Finance"),
    "collector-bank":       ("Collector Bank", "Finance"),
    "re-lease":             ("Re:lease", "Finance"),
    "lunar":                ("Lunar", "Finance"),
    # Netherlands / Benelux tech
    "adyen":                ("Adyen", "Finance"),
    "mollie":               ("Mollie", "Finance"),
    "bunq":                 ("Bunq", "Finance"),
    "tikkie":               ("Tikkie/ABN AMRO", "Finance"),
    "payvision":            ("PayVision", "Finance"),
    "exact":                ("Exact", "Tech"),
    "unit4":                ("Unit4", "Tech"),
    "mendix":               ("Mendix", "Tech"),
    "companyinfo":          ("CompanyInfo", "Tech"),
    "thuisbezorgd":         ("Thuisbezorgd", "Consumer"),
    "takeaway":             ("Takeaway.com", "Consumer"),
    "coolblue":             ("Coolblue", "Consumer"),
    "bol-com":              ("Bol.com", "Consumer"),
    "catawiki":             ("Catawiki", "Consumer"),
}


def fetch_all_personio(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch jobs from all configured Personio company boards."""
    if companies is None:
        companies = PERSONIO_COMPANIES

    results: List[Dict[str, Any]] = []
    for company, (name, industry) in companies.items():
        try:
            jobs = fetch_personio_jobs(company, name, max_jobs=max_per_company)
            if jobs:
                results.extend(jobs)
                sys.stderr.write(f"[personio] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[personio] {name} ({company}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[personio] total: {len(results)} jobs from configured companies\n")
    return results
