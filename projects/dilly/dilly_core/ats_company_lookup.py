"""
Dilly Company-to-ATS Lookup.

Maps well-known companies to the ATS vendor they use. When a student says
"I'm applying to Amazon," Dilly auto-identifies Workday and highlights
that vendor's simulation results.

Sources: Published job boards, careers pages, and ATS vendor customer lists.
This is a curated dataset — not scraped — kept conservative (only add companies
we're confident about).

The lookup is fuzzy: "amazon" matches "Amazon", "AMAZON", "amazon.com", etc.
"""

import re
from typing import Optional, Tuple


# ---------------------------------------------------------------------------
# Company → ATS vendor database
# ---------------------------------------------------------------------------
# Format: canonical_name -> (vendor_key, display_name)
# vendor_key must match VendorResult.vendor: "workday" | "greenhouse" | "icims" | "lever"

_COMPANY_ATS: dict[str, tuple[str, str]] = {
    # ===== WORKDAY =====
    "amazon": ("workday", "Amazon"),
    "netflix": ("workday", "Netflix"),
    "walmart": ("workday", "Walmart"),
    "jpmorgan": ("workday", "JPMorgan Chase"),
    "jp morgan": ("workday", "JPMorgan Chase"),
    "chase": ("workday", "JPMorgan Chase"),
    "bank of america": ("workday", "Bank of America"),
    "bofa": ("workday", "Bank of America"),
    "meta": ("workday", "Meta"),
    "facebook": ("workday", "Meta"),
    "google": ("workday", "Google"),
    "alphabet": ("workday", "Google"),
    "microsoft": ("workday", "Microsoft"),
    "apple": ("workday", "Apple"),
    "disney": ("workday", "Disney"),
    "nike": ("workday", "Nike"),
    "pfizer": ("workday", "Pfizer"),
    "johnson & johnson": ("workday", "Johnson & Johnson"),
    "j&j": ("workday", "Johnson & Johnson"),
    "procter & gamble": ("workday", "Procter & Gamble"),
    "p&g": ("workday", "Procter & Gamble"),
    "ge": ("workday", "GE"),
    "general electric": ("workday", "GE"),
    "ibm": ("workday", "IBM"),
    "salesforce": ("workday", "Salesforce"),
    "adobe": ("workday", "Adobe"),
    "intel": ("workday", "Intel"),
    "cisco": ("workday", "Cisco"),
    "oracle": ("workday", "Oracle"),
    "verizon": ("workday", "Verizon"),
    "pepsico": ("workday", "PepsiCo"),
    "pepsi": ("workday", "PepsiCo"),
    "coca-cola": ("workday", "Coca-Cola"),
    "coke": ("workday", "Coca-Cola"),
    "goldman sachs": ("workday", "Goldman Sachs"),
    "morgan stanley": ("workday", "Morgan Stanley"),
    "citi": ("workday", "Citi"),
    "citigroup": ("workday", "Citi"),
    "wells fargo": ("workday", "Wells Fargo"),
    "deloitte": ("workday", "Deloitte"),
    "pwc": ("workday", "PwC"),
    "pricewaterhousecoopers": ("workday", "PwC"),
    "ey": ("workday", "EY"),
    "ernst & young": ("workday", "EY"),
    "kpmg": ("workday", "KPMG"),
    "mckinsey": ("workday", "McKinsey"),
    "bain": ("workday", "Bain & Company"),
    "bcg": ("workday", "BCG"),
    "boston consulting": ("workday", "BCG"),
    "accenture": ("workday", "Accenture"),
    "unilever": ("workday", "Unilever"),
    "3m": ("workday", "3M"),
    "lockheed martin": ("workday", "Lockheed Martin"),
    "raytheon": ("workday", "Raytheon"),
    "northrop grumman": ("workday", "Northrop Grumman"),
    "boeing": ("workday", "Boeing"),
    "ford": ("workday", "Ford"),
    "gm": ("workday", "General Motors"),
    "general motors": ("workday", "General Motors"),
    "uber": ("workday", "Uber"),
    "airbnb": ("greenhouse", "Airbnb"),
    "visa": ("workday", "Visa"),
    "mastercard": ("workday", "Mastercard"),
    "american express": ("workday", "American Express"),
    "amex": ("workday", "American Express"),
    "mayo clinic": ("workday", "Mayo Clinic"),
    "cleveland clinic": ("workday", "Cleveland Clinic"),
    "kaiser permanente": ("workday", "Kaiser Permanente"),
    "humana": ("workday", "Humana"),
    "cigna": ("workday", "Cigna"),
    "anthem": ("workday", "Anthem"),

    # ===== GREENHOUSE =====
    "spotify": ("greenhouse", "Spotify"),
    "hubspot": ("greenhouse", "HubSpot"),
    "cloudflare": ("greenhouse", "Cloudflare"),
    "notion": ("greenhouse", "Notion"),
    "stripe": ("greenhouse", "Stripe"),
    "figma": ("greenhouse", "Figma"),
    "pinterest": ("greenhouse", "Pinterest"),
    "discord": ("greenhouse", "Discord"),
    "datadog": ("greenhouse", "Datadog"),
    "plaid": ("greenhouse", "Plaid"),
    "airtable": ("greenhouse", "Airtable"),
    "canva": ("greenhouse", "Canva"),
    "coinbase": ("greenhouse", "Coinbase"),
    "doordash": ("greenhouse", "DoorDash"),
    "duolingo": ("greenhouse", "Duolingo"),
    "gusto": ("greenhouse", "Gusto"),
    "instacart": ("greenhouse", "Instacart"),
    "reddit": ("greenhouse", "Reddit"),
    "robinhood": ("greenhouse", "Robinhood"),
    "squarespace": ("greenhouse", "Squarespace"),
    "webflow": ("greenhouse", "Webflow"),
    "zillow": ("greenhouse", "Zillow"),
    "buzzfeed": ("greenhouse", "BuzzFeed"),
    "medium": ("greenhouse", "Medium"),
    "warby parker": ("greenhouse", "Warby Parker"),
    "glossier": ("greenhouse", "Glossier"),
    "allbirds": ("greenhouse", "Allbirds"),
    "calm": ("greenhouse", "Calm"),
    "peloton": ("greenhouse", "Peloton"),

    # ===== iCIMS =====
    "target": ("icims", "Target"),
    "unitedhealth": ("icims", "UnitedHealth Group"),
    "uhg": ("icims", "UnitedHealth Group"),
    "united health": ("icims", "UnitedHealth Group"),
    "southwest airlines": ("icims", "Southwest Airlines"),
    "southwest": ("icims", "Southwest Airlines"),
    "comcast": ("icims", "Comcast"),
    "t-mobile": ("icims", "T-Mobile"),
    "tmobile": ("icims", "T-Mobile"),
    "costco": ("icims", "Costco"),
    "home depot": ("icims", "Home Depot"),
    "lowes": ("icims", "Lowe's"),
    "lowe's": ("icims", "Lowe's"),
    "cvs": ("icims", "CVS Health"),
    "cvs health": ("icims", "CVS Health"),
    "walgreens": ("icims", "Walgreens"),
    "kroger": ("icims", "Kroger"),
    "publix": ("icims", "Publix"),
    "fedex": ("icims", "FedEx"),
    "ups": ("icims", "UPS"),
    "delta": ("icims", "Delta Air Lines"),
    "delta airlines": ("icims", "Delta Air Lines"),
    "united airlines": ("icims", "United Airlines"),
    "american airlines": ("icims", "American Airlines"),
    "hilton": ("icims", "Hilton"),
    "marriott": ("icims", "Marriott"),
    "starbucks": ("icims", "Starbucks"),
    "mcdonald's": ("icims", "McDonald's"),
    "mcdonalds": ("icims", "McDonald's"),
    "chipotle": ("icims", "Chipotle"),

    # ===== LEVER =====
    "shopify": ("lever", "Shopify"),
    "atlassian": ("lever", "Atlassian"),
    "lyft": ("lever", "Lyft"),
    "twilio": ("lever", "Twilio"),
    "databricks": ("lever", "Databricks"),
    "netflix games": ("lever", "Netflix Games"),
    "snap": ("lever", "Snap"),
    "snapchat": ("lever", "Snap"),
    "quora": ("lever", "Quora"),
    "rippling": ("lever", "Rippling"),
    "carta": ("lever", "Carta"),
    "brex": ("lever", "Brex"),
    "nerdwallet": ("lever", "NerdWallet"),
    "gopuff": ("lever", "Gopuff"),
    "faire": ("lever", "Faire"),
    "scale ai": ("lever", "Scale AI"),
    "anduril": ("lever", "Anduril"),
    "palantir": ("lever", "Palantir"),
    "flexport": ("lever", "Flexport"),
    "grammarly": ("lever", "Grammarly"),
    "zapier": ("lever", "Zapier"),
}

# Aliases and common misspellings (mapped to canonical keys above)
_ALIASES: dict[str, str] = {
    "amzn": "amazon",
    "aws": "amazon",
    "fb": "meta",
    "ig": "meta",
    "instagram": "meta",
    "whatsapp": "meta",
    "msft": "microsoft",
    "goog": "google",
    "aapl": "apple",
    "jpm": "jpmorgan",
    "gs": "goldman sachs",
    "ms": "morgan stanley",
    "wfc": "wells fargo",
    "ba": "boeing",
    "lmt": "lockheed martin",
    "tgt": "target",
    "wmt": "walmart",
    "cost": "costco",
    "hd": "home depot",
    "sbux": "starbucks",
    "mcd": "mcdonalds",
    "dal": "delta airlines",
    "shop": "shopify",
    "twtr": "twitter",
}


def lookup_company_ats(company: str) -> Optional[Tuple[str, str, str]]:
    """
    Look up which ATS a company uses.

    Args:
        company: Company name (case-insensitive, fuzzy)

    Returns:
        (vendor_key, vendor_display_name, company_display_name) or None if unknown.
        vendor_key is "workday" | "greenhouse" | "icims" | "lever"
    """
    if not company or not company.strip():
        return None

    cleaned = company.strip().lower()
    # Remove common suffixes
    cleaned = re.sub(r"\s*(?:inc\.?|corp\.?|co\.?|llc|ltd\.?|group|holdings?|\.com|\.org|\.io)$", "", cleaned).strip()

    # Direct lookup
    if cleaned in _COMPANY_ATS:
        vendor_key, display = _COMPANY_ATS[cleaned]
        vendor_display = {"workday": "Workday", "greenhouse": "Greenhouse", "icims": "iCIMS", "lever": "Lever"}[vendor_key]
        return (vendor_key, vendor_display, display)

    # Check aliases
    if cleaned in _ALIASES:
        canonical = _ALIASES[cleaned]
        if canonical in _COMPANY_ATS:
            vendor_key, display = _COMPANY_ATS[canonical]
            vendor_display = {"workday": "Workday", "greenhouse": "Greenhouse", "icims": "iCIMS", "lever": "Lever"}[vendor_key]
            return (vendor_key, vendor_display, display)

    # Fuzzy substring match (e.g., "JPMorgan Chase & Co" → "jpmorgan")
    for key, (vendor_key, display) in _COMPANY_ATS.items():
        if key in cleaned or cleaned in key:
            vendor_display = {"workday": "Workday", "greenhouse": "Greenhouse", "icims": "iCIMS", "lever": "Lever"}[vendor_key]
            return (vendor_key, vendor_display, display)

    return None


def get_all_companies_for_vendor(vendor_key: str) -> list[str]:
    """Get all known company display names for a given vendor."""
    return sorted(set(
        display for key, (vk, display) in _COMPANY_ATS.items() if vk == vendor_key
    ))
