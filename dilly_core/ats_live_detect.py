"""
Live ATS auto-detection via public job-board APIs.

Greenhouse, Lever, and Ashby all expose unauthenticated public endpoints that
return a company's current job listings. If a slug hits a 200, we know with
certainty that the company posts there — and therefore uses that ATS.

This complements the hardcoded company lookup in ats_company_lookup.py:
    1. Hardcoded lookup tries first (instant, offline, 185 companies)
    2. Live detection falls back for unknowns (~400ms, covers the long tail)
    3. Positive results are cached in-process so repeated lookups are cheap

We try several slug variants per company name because each ATS vendor has
its own slug convention ("acme-corp", "acmecorp", "acme") and the user
doesn't know which one to type.

No auth, no rate-limit pain for normal user traffic. The endpoints we use:

    Greenhouse: https://boards-api.greenhouse.io/v1/boards/<slug>/jobs
                https://boards.greenhouse.io/<slug>.json
    Lever:      https://api.lever.co/v0/postings/<slug>?mode=json&limit=1
    Ashby:      https://api.ashbyhq.com/posting-api/job-board/<slug>
"""

from __future__ import annotations

import re
import time
import urllib.request
import urllib.error
import json
import threading
from typing import Optional, Tuple

# Process-level cache: slug → (vendor_key, vendor_display, company_display, ts)
_CACHE: dict = {}
_CACHE_TTL_SEC = 60 * 60 * 24 * 7  # 7 days
_CACHE_NEGATIVE_TTL_SEC = 60 * 60 * 6  # 6 hours for negatives
_CACHE_LOCK = threading.Lock()

_USER_AGENT = "DillyATSBot/1.0 (+https://trydilly.com)"
_HTTP_TIMEOUT = 3.0

_VENDOR_DISPLAY = {
    "greenhouse": "Greenhouse",
    "lever": "Lever",
    "ashby": "Ashby",
}


def _slug_variants(company: str) -> list[str]:
    """
    Generate plausible slug variants for a company name.
    "Acme Corp, Inc." → ["acme-corp", "acmecorp", "acme", "acme-corp-inc"]
    """
    if not company:
        return []
    name = company.lower().strip()
    # Strip legal suffixes
    name = re.sub(
        r"\s*(?:inc\.?|corp\.?|co\.?|llc|ltd\.?|group|holdings?|limited|plc|the)\s*$",
        "",
        name,
    ).strip()
    # Strip punctuation except hyphens and letters/digits/spaces
    name = re.sub(r"[^\w\s-]", "", name).strip()
    if not name:
        return []

    tokens = [t for t in re.split(r"\s+", name) if t]
    variants: list[str] = []

    if tokens:
        # "acme-corp"
        variants.append("-".join(tokens))
        # "acmecorp"
        variants.append("".join(tokens))
        # First word only — catches "Airbnb" from "Airbnb Inc", "Stripe" from "Stripe Payments Inc"
        variants.append(tokens[0])
        # First two words joined — "acme corp labs" → "acmecorp"
        if len(tokens) >= 2:
            variants.append("".join(tokens[:2]))
            variants.append("-".join(tokens[:2]))
        # Full cleaned name with hyphens kept as-is
        variants.append(name.replace(" ", "-"))

    # Dedup while preserving order, strip empties/too-short slugs
    seen: set = set()
    out: list[str] = []
    for v in variants:
        v = v.strip("-").strip()
        if not v or len(v) < 2 or v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out[:6]  # cap at 6 variants to bound request count


def _http_head_or_get(url: str) -> Optional[int]:
    """
    Issue a GET (HEAD doesn't work on most boards) and return the status code.
    Returns None on any error. Short timeout so lookups feel snappy.
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def _fetch_json(url: str) -> Optional[dict]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
            if resp.status != 200:
                return None
            data = resp.read().decode("utf-8", errors="replace")
            return json.loads(data)
    except Exception:
        return None


def _check_greenhouse(slug: str) -> Optional[dict]:
    """
    Returns {"company_name": str, "job_count": int} if slug exists.
    Uses the public board-api endpoint.
    """
    data = _fetch_json(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs")
    if data and isinstance(data, dict):
        jobs = data.get("jobs") or []
        meta = data.get("meta") or {}
        if jobs or meta:
            return {
                "company_name": data.get("name") or slug.title(),
                "job_count": len(jobs) if isinstance(jobs, list) else 0,
            }
    return None


def _check_lever(slug: str) -> Optional[dict]:
    """
    Lever's public postings API returns a JSON array of postings when the slug
    exists. An unknown slug returns 404.
    """
    data = _fetch_json(f"https://api.lever.co/v0/postings/{slug}?mode=json&limit=1")
    if isinstance(data, list):
        return {
            "company_name": slug.title(),
            "job_count": len(data),
        }
    return None


def _check_ashby(slug: str) -> Optional[dict]:
    """
    Ashby's posting-api returns a JSON object with jobBoard + jobPostings.
    """
    data = _fetch_json(f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=false")
    if data and isinstance(data, dict):
        jobs = data.get("jobs") or data.get("jobPostings") or []
        if jobs or data.get("jobBoard"):
            board = data.get("jobBoard") or {}
            return {
                "company_name": board.get("name") or slug.title(),
                "job_count": len(jobs) if isinstance(jobs, list) else 0,
            }
    return None


def detect_live_ats(company: str) -> Optional[Tuple[str, str, str, dict]]:
    """
    Run live detection against Greenhouse, Lever, Ashby for the given company name.

    Returns (vendor_key, vendor_display, company_display, meta_dict) on a hit,
    where meta_dict includes job_count and the winning slug. Returns None if
    none of the public APIs recognize any slug variant.

    Results are cached in-process for 7 days (positive) or 6 hours (negative).
    """
    if not company or not company.strip():
        return None

    cache_key = company.strip().lower()
    now = time.time()

    # Cache check
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        if cached is not None:
            cached_vkey, cached_vdisp, cached_cdisp, cached_meta, cached_ts = cached
            age = now - cached_ts
            ttl = _CACHE_TTL_SEC if cached_vkey else _CACHE_NEGATIVE_TTL_SEC
            if age < ttl:
                if cached_vkey is None:
                    return None
                return (cached_vkey, cached_vdisp, cached_cdisp, cached_meta)

    variants = _slug_variants(company)
    if not variants:
        return None

    # Try each vendor/slug combination. First hit wins.
    # Order: Greenhouse (most common), Ashby (growing fast), Lever.
    checkers = [
        ("greenhouse", _check_greenhouse),
        ("ashby", _check_ashby),
        ("lever", _check_lever),
    ]

    for slug in variants:
        for vendor_key, checker in checkers:
            try:
                hit = checker(slug)
            except Exception:
                hit = None
            if hit:
                vendor_display = _VENDOR_DISPLAY[vendor_key]
                company_display = hit.get("company_name") or company
                meta = {
                    "slug": slug,
                    "job_count": int(hit.get("job_count") or 0),
                    "source": "live",
                }
                with _CACHE_LOCK:
                    _CACHE[cache_key] = (
                        vendor_key, vendor_display, company_display, meta, now,
                    )
                return (vendor_key, vendor_display, company_display, meta)

    # Negative cache
    with _CACHE_LOCK:
        _CACHE[cache_key] = (None, None, None, None, now)
    return None


def clear_cache() -> None:
    with _CACHE_LOCK:
        _CACHE.clear()


__all__ = ["detect_live_ats", "clear_cache"]
