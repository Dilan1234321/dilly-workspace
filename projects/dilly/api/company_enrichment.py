"""
Company enrichment for recruiter signups.

On recruiter account creation we:
1. Cross-check the company domain against the companies table (ATS sources) to
   pull an existing name and job count without any external API call.
2. Best-effort fetch the company logo from Clearbit's free logo endpoint
   (no API key, returns null on failure).

Results are stored on the users row immediately; no retry logic needed here —
this is "first-run magic", not critical path.
"""

import urllib.request
import urllib.error

from projects.dilly.api.database import get_db


# ---------------------------------------------------------------------------
# Free-email domain blocklist. Reject these for recruiter signups.
# ---------------------------------------------------------------------------
FREE_EMAIL_DOMAINS = frozenset(
    [
        "gmail.com", "googlemail.com",
        "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "ymail.com",
        "hotmail.com", "hotmail.co.uk", "hotmail.fr",
        "outlook.com", "outlook.co.uk",
        "live.com", "live.co.uk",
        "aol.com",
        "icloud.com", "me.com", "mac.com",
        "protonmail.com", "proton.me", "pm.me",
        "zohomail.com", "zoho.com",
        "mail.com", "email.com",
        "msn.com",
        "rocketmail.com",
        "inbox.com",
        "fastmail.com", "fastmail.fm",
        "hey.com",
    ]
)


def is_free_email(email: str) -> bool:
    """Return True if email is from a known free provider."""
    email = (email or "").strip().lower()
    if "@" not in email:
        return False
    domain = email.split("@", 1)[1].strip()
    return domain in FREE_EMAIL_DOMAINS


def domain_from_email(email: str) -> str:
    """Extract the domain from an email address."""
    email = (email or "").strip().lower()
    if "@" not in email:
        return ""
    return email.split("@", 1)[1].strip()


# ---------------------------------------------------------------------------
# Companies table cross-check
# ---------------------------------------------------------------------------

def _match_company_in_db(domain: str) -> dict | None:
    """
    Look for an existing company in the companies table whose name or ATS slug
    resembles the recruiter's email domain (e.g. stripe.com → Stripe Inc.).

    We do a simple ILIKE match on name vs. the bare domain stem (everything
    before the first dot).  Returns {name, jobs_count} or None.
    """
    if not domain:
        return None
    stem = domain.split(".")[0]  # "stripe" from "stripe.com"
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT c.name,
                       COUNT(i.id) FILTER (WHERE i.status = 'active') AS jobs_count
                FROM companies c
                LEFT JOIN internships i ON i.company_id = c.id
                WHERE LOWER(c.name) ILIKE %s
                GROUP BY c.name
                LIMIT 1
                """,
                (f"%{stem}%",),
            )
            row = cur.fetchone()
            if row:
                return {"name": row[0], "jobs_count": int(row[1] or 0)}
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Clearbit logo (best-effort, no key required)
# ---------------------------------------------------------------------------

def _fetch_clearbit_logo_url(domain: str) -> str | None:
    """
    Return the Clearbit logo URL for the domain if reachable, else None.
    We do a HEAD request to avoid downloading the image; if Clearbit returns
    a redirect or 200 the logo exists.
    """
    if not domain:
        return None
    url = f"https://logo.clearbit.com/{domain}"
    try:
        req = urllib.request.Request(url, method="HEAD")
        req.add_header("User-Agent", "Dilly/1.0 recruiter-enrichment")
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status in (200, 301, 302):
                return url
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def enrich_recruiter(email: str) -> dict:
    """
    Given a recruiter email, return enrichment dict:
      {company_domain, company_name, company_logo_url, company_jobs_count}

    All fields may be None if lookup fails.  Never raises.
    """
    result: dict = {
        "company_domain": None,
        "company_name": None,
        "company_logo_url": None,
        "company_jobs_count": None,
    }
    try:
        domain = domain_from_email(email)
        if not domain:
            return result
        result["company_domain"] = domain

        # 1. Cross-check companies table for name + job count
        match = _match_company_in_db(domain)
        if match:
            result["company_name"] = match["name"]
            result["company_jobs_count"] = match["jobs_count"]

        # 2. Best-effort logo
        result["company_logo_url"] = _fetch_clearbit_logo_url(domain)

    except Exception:
        pass
    return result
