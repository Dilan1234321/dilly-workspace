"""
SAP SuccessFactors job board scraper.

SuccessFactors is used by global enterprises. Each company has a tenant at:
  https://<company>.successfactors.com/sf/careers

The public OData-based API (no auth for public postings) is at:
  GET https://<company>.successfactors.com/odata/v2/JobRequisitionPosting?
      $format=json&$select=JobRequisitionId,JobTitle,Country,StateProvince,
      City,PostingDatePosted,JobDescription&$filter=JobStatus eq 'Open'

Some tenants use EU endpoints (.eu or .sapsf.com domain variants).

De-dupe key: "sfsf_<tenant>_<JobRequisitionId>"
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
_TIMEOUT = 25
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


def fetch_successfactors_jobs(
    tenant: str,
    company_name: str,
    domain_suffix: str = "successfactors.com",
    max_jobs: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from a SuccessFactors tenant via OData API.

    tenant: the SF tenant subdomain (e.g. 'apple', 'walmart', 'siemens')
    domain_suffix: 'successfactors.com' (US) or 'successfactors.eu' (EU)
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
    skip = 0
    top = 50

    while len(results) < max_jobs:
        url = (
            f"https://{tenant}.{domain_suffix}/odata/v2/JobRequisitionPosting"
            f"?$format=json&$top={top}&$skip={skip}"
            f"&$select=JobRequisitionId,JobTitle,Country,StateProvince,City,"
            f"PostingDatePosted,JobDescription,Department,EmploymentType"
            f"&$filter=JobStatus%20eq%20'Open'"
        )
        try:
            data = _fetch_json(url)
        except Exception as e:
            sys.stderr.write(f"[sfsf] {tenant} skip={skip}: {type(e).__name__}: {e}\n")
            break

        entries: List[Dict] = []
        if isinstance(data, dict):
            entries = (
                data.get("d", {}).get("results", []) if "d" in data
                else data.get("value", [])
            )
        elif isinstance(data, list):
            entries = data

        if not entries:
            break

        for job in entries:
            job_id = str(job.get("JobRequisitionId") or job.get("externalId") or "")
            title = (job.get("JobTitle") or "").strip()
            if not title or not job_id:
                continue

            desc = _strip_html(job.get("JobDescription") or "")
            job_type = classify_listing(title, desc)

            city = (job.get("City") or "").strip() or None
            state_raw = (job.get("StateProvince") or "").strip()
            country_raw = (job.get("Country") or "").strip().upper()
            # Keep only US/Canada/UK jobs to avoid irrelevant international noise
            if country_raw and country_raw not in (
                "US", "USA", "UNITED STATES", "CA", "CAN", "CANADA",
                "GB", "GBR", "UNITED KINGDOM", ""
            ):
                continue

            state = state_raw if state_raw in _US_STATES else None
            is_remote = "remote" in (city or "").lower() or "remote" in title.lower()

            apply_url = f"https://{tenant}.{domain_suffix}/sf/careers?jobId={job_id}"
            posted = (job.get("PostingDatePosted") or "")[:10]
            # SuccessFactors wraps dates in "/Date(<epoch>)/" format sometimes
            if posted.startswith("/Date("):
                try:
                    epoch = int(re.search(r"\d+", posted).group()) // 1000
                    from datetime import datetime, timezone
                    posted = datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%d")
                except Exception:
                    posted = ""

            dept = (job.get("Department") or "").strip()

            results.append({
                "external_id": f"sfsf_{tenant}_{job_id}",
                "company": company_name,
                "title": title,
                "description": desc,
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if is_remote else "unknown",
                "remote": is_remote,
                "source_ats": "successfactors",
                "job_type": job_type,
                "cohorts": [],
                "tags": extract_tags(title, desc),
                "team": dept,
                "posted_date": posted,
                "industry": "technology",
            })

        if len(entries) < top:
            break
        skip += top
        time.sleep(0.5)

    return results


SUCCESSFACTORS_COMPANIES: Dict[str, Tuple[str, str]] = {
    # Tech giants
    "apple":            ("Apple", "Tech"),
    "walmart-recruiting": ("Walmart", "Consumer"),
    "walmart1":         ("Walmart", "Consumer"),
    "ibm":              ("IBM", "Tech"),
    "intel":            ("Intel", "Tech"),
    "cisco":            ("Cisco", "Tech"),
    "sap":              ("SAP", "Tech"),
    "siemens":          ("Siemens", "Tech"),
    "ericsson":         ("Ericsson", "Tech"),
    "nokia":            ("Nokia", "Tech"),
    "philips":          ("Philips", "Tech"),
    "schneider":        ("Schneider Electric", "Tech"),
    "danfoss":          ("Danfoss", "Tech"),
    "siemens-energy":   ("Siemens Energy", "Tech"),
    # Finance
    "visa":             ("Visa", "Finance"),
    "mastercard":       ("Mastercard", "Finance"),
    "amex":             ("American Express", "Finance"),
    "fiserv":           ("Fiserv", "Finance"),
    "fisglobal":        ("FIS Global", "Finance"),
    "ncr":              ("NCR", "Tech"),
    "aci-worldwide":    ("ACI Worldwide", "Finance"),
    "jack-henry":       ("Jack Henry", "Finance"),
    "ss-and-c":         ("SS&C Technologies", "Finance"),
    "broadridge":       ("Broadridge", "Finance"),
    "morningstar":      ("Morningstar", "Finance"),
    "msci":             ("MSCI", "Finance"),
    "factset":          ("FactSet", "Finance"),
    "refinitiv":        ("Refinitiv/LSEG", "Finance"),
    # Healthcare
    "abbott":           ("Abbott", "Healthcare"),
    "baxter":           ("Baxter", "Healthcare"),
    "cardinal-health":  ("Cardinal Health", "Healthcare"),
    "mckesson":         ("McKesson", "Healthcare"),
    "amerisourcebergen": ("AmerisourceBergen", "Healthcare"),
    "labcorp":          ("LabCorp", "Healthcare"),
    "quest-diagnostics": ("Quest Diagnostics", "Healthcare"),
    "illumina":         ("Illumina", "Biotech"),
    "bruker":           ("Bruker", "Biotech"),
    "bio-rad":          ("Bio-Rad", "Biotech"),
    "agilent":          ("Agilent Technologies", "Biotech"),
    "thermo-fisher":    ("Thermo Fisher Scientific", "Biotech"),
    "waters":           ("Waters Corporation", "Biotech"),
    "mettler-toledo":   ("Mettler-Toledo", "Tech"),
    # Consumer / retail
    "pg":               ("Procter & Gamble", "Consumer"),
    "unilever":         ("Unilever", "Consumer"),
    "nestle":           ("Nestlé", "Consumer"),
    "colgate":          ("Colgate-Palmolive", "Consumer"),
    "kimberly-clark":   ("Kimberly-Clark", "Consumer"),
    "church-dwight":    ("Church & Dwight", "Consumer"),
    "henkel":           ("Henkel", "Consumer"),
    "beiersdorf":       ("Beiersdorf", "Consumer"),
    "reckitt":          ("Reckitt", "Consumer"),
    "johnson-controls": ("Johnson Controls", "Tech"),
    "ingersoll-rand":   ("Ingersoll Rand", "Tech"),
    "carrier":          ("Carrier Global", "Tech"),
    "trane":            ("Trane Technologies", "Tech"),
    "lennox":           ("Lennox International", "Tech"),
    # Media / entertainment
    "comcast":          ("Comcast NBCUniversal", "Media"),
    "disney":           ("The Walt Disney Company", "Media"),
    "warner-bros":      ("Warner Bros. Discovery", "Media"),
    "viacomcbs":        ("Paramount Global", "Media"),
    "fox":              ("Fox Corporation", "Media"),
    "hearst":           ("Hearst", "Media"),
    "condé-nast":       ("Condé Nast", "Media"),
    "meredith":         ("Meredith/Dotdash", "Media"),
    # Consulting / professional services
    "deloitte":         ("Deloitte", "Consulting"),
    "pwc":              ("PwC", "Consulting"),
    "ey":               ("Ernst & Young", "Consulting"),
    "kpmg":             ("KPMG", "Consulting"),
    "accenture":        ("Accenture", "Consulting"),
    "capgemini":        ("Capgemini", "Consulting"),
    "cognizant":        ("Cognizant", "Consulting"),
    "infosys":          ("Infosys", "Consulting"),
    "wipro":            ("Wipro", "Consulting"),
    "tcs":              ("Tata Consultancy Services", "Consulting"),
    # ── Added 2026-04-24: more SuccessFactors tenants ──
    # Aerospace / defense
    "lockheed-martin":  ("Lockheed Martin", "Tech"),
    "raytheon":         ("Raytheon Technologies", "Tech"),
    "northrop-grumman": ("Northrop Grumman", "Tech"),
    "general-dynamics": ("General Dynamics", "Tech"),
    "l3harris":         ("L3Harris", "Tech"),
    "bae-systems":      ("BAE Systems", "Tech"),
    "textron-inc":      ("Textron", "Tech"),
    "leidos":           ("Leidos", "Government"),
    "saic":             ("SAIC", "Government"),
    "mantech":          ("ManTech", "Government"),
    "boozallenham":     ("Booz Allen Hamilton", "Consulting"),
    "mitre":            ("MITRE Corporation", "Government"),
    "miter":            ("MITRE", "Government"),
    # Automotive / industrial (big SAP users)
    "bmw-group":        ("BMW Group", "Tech"),
    "mercedes-benz":    ("Mercedes-Benz", "Tech"),
    "volkswagen":       ("Volkswagen", "Tech"),
    "audi":             ("Audi", "Tech"),
    "porsche":          ("Porsche", "Tech"),
    "continental":      ("Continental AG", "Tech"),
    "bosch-careers":    ("Bosch", "Tech"),
    "zf-group":         ("ZF Group", "Tech"),
    "schaeffler":       ("Schaeffler Group", "Tech"),
    "knorr-bremse":     ("Knorr-Bremse", "Tech"),
    "mahle":            ("MAHLE", "Tech"),
    "hella":            ("HELLA", "Tech"),
    "brose":            ("Brose Group", "Tech"),
    "thyssenkrupp":     ("thyssenkrupp", "Tech"),
    "sms-group":        ("SMS Group", "Tech"),
    "voith":            ("Voith", "Tech"),
    "wacker-chemie":    ("Wacker Chemie", "Tech"),
    "basf":             ("BASF", "Tech"),
    "bayer":            ("Bayer AG", "Healthcare"),
    "lanxess":          ("LANXESS", "Tech"),
    "evonik":           ("Evonik Industries", "Tech"),
    "merck-kgaa":       ("Merck KGaA", "Healthcare"),
    "fresenius":        ("Fresenius", "Healthcare"),
    "ottobock":         ("Ottobock", "Healthcare"),
    "dräger":           ("Drägerwerk", "Healthcare"),
    "b-braun":          ("B. Braun Melsungen", "Healthcare"),
    "paul-hartmann":    ("Paul Hartmann AG", "Healthcare"),
    # Financial services (Global)
    "allianz":          ("Allianz", "Finance"),
    "munich-re":        ("Munich Re", "Finance"),
    "hannover-re":      ("Hannover Re", "Finance"),
    "swiss-re":         ("Swiss Re", "Finance"),
    "zurich":           ("Zurich Insurance", "Finance"),
    "axa-group":        ("AXA Group", "Finance"),
    "generali":         ("Generali", "Finance"),
    "socgen":           ("Société Générale", "Finance"),
    "bnp-paribas":      ("BNP Paribas", "Finance"),
    "credit-agricole":  ("Crédit Agricole", "Finance"),
    "natixis":          ("Natixis", "Finance"),
    "ing-group":        ("ING Group", "Finance"),
    "abn-amro":         ("ABN AMRO", "Finance"),
    "rabobank":         ("Rabobank", "Finance"),
    "aegon":            ("Aegon", "Finance"),
    "nn-group":         ("NN Group", "Finance"),
    "deutsche-bank":    ("Deutsche Bank", "Finance"),
    "commerzbank":      ("Commerzbank", "Finance"),
    "dz-bank":          ("DZ Bank", "Finance"),
    "sparkasse-deka":   ("Deka Bank", "Finance"),
    "hsbc-global":      ("HSBC", "Finance"),
    "barclays":         ("Barclays", "Finance"),
    "standard-chartered":("Standard Chartered", "Finance"),
    "lloyds":           ("Lloyds Banking Group", "Finance"),
    "natwest":          ("NatWest Group", "Finance"),
    "santander":        ("Santander", "Finance"),
    "bbva":             ("BBVA", "Finance"),
    "caixabank":        ("CaixaBank", "Finance"),
    # Retail (global brands on SAP SF)
    "ikea":             ("IKEA", "Consumer"),
    "h-and-m":          ("H&M", "Consumer"),
    "zara-inditex":     ("Inditex/Zara", "Consumer"),
    "lidl-global":      ("Lidl", "Consumer"),
    "aldi-global":      ("ALDI", "Consumer"),
    "carrefour":        ("Carrefour", "Consumer"),
    "tesco":            ("Tesco", "Consumer"),
    "asda":             ("ASDA", "Consumer"),
    "sainsburys":       ("Sainsbury's", "Consumer"),
    "marks-spencer":    ("Marks & Spencer", "Consumer"),
    "boots":            ("Boots", "Healthcare"),
    "dm-markt":         ("dm-drogerie markt", "Consumer"),
    "rewe-group":       ("REWE Group", "Consumer"),
    "edeka":            ("EDEKA", "Consumer"),
    "metro-ag":         ("METRO AG", "Consumer"),
    "otto-group":       ("Otto Group", "Consumer"),
    "zalando":          ("Zalando", "Consumer"),
    # CPG / consumer goods (large SAP users)
    "henkel":           ("Henkel", "Consumer"),
    "beiersdorf":       ("Beiersdorf", "Consumer"),
    "reckitt-benckiser":("Reckitt Benckiser", "Consumer"),
    "sab-miller":       ("AB InBev", "Consumer"),
    "pernod-ricard":    ("Pernod Ricard", "Consumer"),
    "diageo":           ("Diageo", "Consumer"),
    "danone":           ("Danone", "Consumer"),
    "loreal":           ("L'Oréal", "Consumer"),
    "lvmh":             ("LVMH", "Consumer"),
    "kering":           ("Kering", "Consumer"),
    "hermes":           ("Hermès", "Consumer"),
    "richemont":        ("Richemont", "Consumer"),
    "swatch":           ("Swatch Group", "Consumer"),
    "rolex":            ("Rolex", "Consumer"),
    "patek-philippe":   ("Patek Philippe", "Consumer"),
    "omega":            ("Omega/Swatch", "Consumer"),
    "breitling":        ("Breitling", "Consumer"),
    "tag-heuer":        ("TAG Heuer/LVMH", "Consumer"),
    "cartier":          ("Cartier/Richemont", "Consumer"),
    "bulgari":          ("Bulgari/LVMH", "Consumer"),
    # Energy (global)
    "bp":               ("BP", "Tech"),
    "shell":            ("Shell", "Tech"),
    "totalenergies":    ("TotalEnergies", "Tech"),
    "equinor":          ("Equinor", "Tech"),
    "eni":              ("Eni", "Tech"),
    "repsol":           ("Repsol", "Tech"),
    "petrobras":        ("Petrobras", "Tech"),
    "pemex":            ("Pemex", "Tech"),
    "ecopetrol":        ("Ecopetrol", "Tech"),
    "aramco":           ("Saudi Aramco", "Tech"),
    "adnoc":            ("ADNOC", "Tech"),
    "qatarenergy":      ("QatarEnergy", "Tech"),
    "petronas":         ("PETRONAS", "Tech"),
    "pttep":            ("PTTEP", "Tech"),
    "woodside":         ("Woodside Energy", "Tech"),
    "santos":           ("Santos", "Tech"),
    "neste":            ("Neste", "Tech"),
    "orsted":           ("Ørsted", "Tech"),
    "iberdrola":        ("Iberdrola", "Tech"),
    "enel":             ("Enel", "Tech"),
    "eon-group":        ("E.ON", "Tech"),
    "rwe":              ("RWE", "Tech"),
    "vattenfall":       ("Vattenfall", "Tech"),
    "engie":            ("Engie", "Tech"),
    "veolia":           ("Veolia", "Tech"),
    "suez":             ("Suez", "Tech"),
    # Telecom (global)
    "deutsche-telekom": ("Deutsche Telekom", "Tech"),
    "vodafone":         ("Vodafone", "Tech"),
    "orange":           ("Orange SA", "Tech"),
    "telefonica":       ("Telefónica", "Tech"),
    "telenor":          ("Telenor", "Tech"),
    "telia":            ("Telia Company", "Tech"),
    "proximus":         ("Proximus", "Tech"),
    "kpn":              ("KPN", "Tech"),
    "bt-group":         ("BT Group", "Tech"),
    "sky":              ("Sky", "Media"),
    "liberty-global":   ("Liberty Global", "Media"),
    "altice":           ("Altice", "Media"),
    "vivendi":          ("Vivendi", "Media"),
    "bertelsmann":      ("Bertelsmann", "Media"),
    "springer-nature":  ("Springer Nature", "Media"),
    "axel-springer":    ("Axel Springer", "Media"),
}


def fetch_all_successfactors(
    companies: Optional[Dict[str, Tuple[str, str]]] = None,
    max_per_company: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch jobs from all configured SuccessFactors tenants.
    """
    if companies is None:
        companies = SUCCESSFACTORS_COMPANIES

    results: List[Dict[str, Any]] = []
    for tenant, (name, industry) in companies.items():
        try:
            jobs = fetch_successfactors_jobs(tenant, name, max_jobs=max_per_company)
            results.extend(jobs)
            sys.stderr.write(f"[sfsf] {name}: {len(jobs)} jobs\n")
        except Exception as e:
            sys.stderr.write(f"[sfsf] {name} ({tenant}): {type(e).__name__}: {e}\n")
        time.sleep(0.4)

    sys.stderr.write(f"[sfsf] total: {len(results)} jobs from {len(companies)} tenants\n")
    return results
