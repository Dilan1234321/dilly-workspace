"""
Free-tier public job-search APIs, bundled.

Three sources that each expose a no-auth public JSON endpoint and
return jobs from many different companies per call. Normalized to the
same dict shape the main crawler expects — plug into
fetch_all_remote_feeds()-style iteration via fetch_all_free_apis().

Sources in this module:
  - The Muse       — https://www.themuse.com/developers/api/v2
                     paginated, 20/page, ~50k jobs in their index
  - Y Combinator   — https://api.ycombinator.com/v0.1/companies
                     (the actual jobs feed is via their unofficial
                     Algolia index at hn.algolia.com). We use YC's
                     public 'hn jobs' via HN search API.
  - Remotive       — https://remotive.com/api/remote-jobs
                     ~2-3k remote jobs, no auth
  - Arbeitnow      — https://www.arbeitnow.com/api/job-board-api
                     ~2-5k mostly-Europe remote jobs
  - Jobicy         — https://jobicy.com/api/v2/remote-jobs?count=50
                     ~5-10k remote-friendly jobs

All calls tolerate network failure, malformed JSON, schema drift. A
bad source returns [] — one flaky feed never poisons the run.

Volume estimate once all integrated: +70-80k jobs after dedup.
"""

from __future__ import annotations

import logging
import re
from typing import Iterable
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

USER_AGENT = "Dilly-Job-Aggregator/1.0 (+https://trydilly.com)"
TIMEOUT = 20


# ── Shared helpers ────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()[:5000]


def _classify_job_type(title: str, description: str) -> str:
    t = (title + " " + (description or "")[:400]).lower()
    if "intern" in t or "internship" in t or "co-op" in t:
        return "internship"
    if any(k in t for k in ("part-time", "part time", "weekend")):
        return "part_time"
    if any(k in t for k in ("senior", "staff", "principal", "director", "lead ", "head of", "vp ", "10+ years", "7+ years")):
        return "other"
    return "entry_level"


def _derive_website(apply_url: str | None, company_name: str | None) -> str | None:
    if apply_url:
        try:
            parsed = urlparse(apply_url if "://" in apply_url else f"https://{apply_url}")
            host = (parsed.netloc or "").lower().lstrip("www.")
            host = re.sub(r"^(jobs|careers|boards|apply|hr|recruit|talent)\.", "", host)
            if host and "." in host and not any(
                ats in host for ats in (
                    "greenhouse", "lever.co", "ashbyhq", "smartrecruiters",
                    "workday", "icims", "themuse", "remotive", "arbeitnow",
                    "jobicy", "ycombinator", "workatastartup",
                )
            ):
                return host
        except Exception:
            pass
    if company_name:
        slug = re.sub(r"[^a-z0-9]", "", company_name.lower().strip())
        if slug and len(slug) >= 3:
            return f"{slug}.com"
    return None


def _parse_city_state(loc: str | None) -> tuple[str | None, str | None]:
    if not loc:
        return None, None
    s = loc.strip()
    # "City, ST"
    m = re.match(r"([^,]+?),\s*([A-Z]{2})\b", s)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    # "Remote", "Worldwide", "Anywhere"
    if re.search(r"\bremote\b|\banywhere\b|\bworldwide\b", s, re.I):
        return None, None
    # Single city
    first = s.split(",")[0].split("/")[0].strip()
    if len(first) <= 80:
        return first or None, None
    return None, None


def _remote_from(loc: str | None, description: str) -> bool:
    blob = ((loc or "") + " " + (description or "")[:300]).lower()
    return "remote" in blob or "anywhere" in blob or "worldwide" in blob


# ── The Muse ──────────────────────────────────────────────────────────────
# Paginated, 20 jobs/page. Free tier: no key required for up to 500
# requests/hour. We walk the first 200 pages = ~4,000 jobs per run.
# Their index totals ~50k but many are low-quality sales roles; 4k
# keeps the run under 4 min and focuses on the newest postings.

THE_MUSE_URL = "https://www.themuse.com/api/public/jobs"


def fetch_themuse(max_pages: int = 2500) -> list[dict]:
    out: list[dict] = []
    for page in range(max_pages):
        try:
            resp = requests.get(
                THE_MUSE_URL,
                params={"page": page, "descending": "true"},
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT,
            )
            if resp.status_code != 200:
                break
            payload = resp.json()
        except Exception as e:
            logger.warning("[themuse] page %s failed: %s", page, e)
            break

        rows = payload.get("results") or []
        if not rows:
            break

        for r in rows:
            if not isinstance(r, dict):
                continue
            title = (r.get("name") or "").strip()
            company = (r.get("company") or {}).get("name", "").strip()
            if not title or not company:
                continue
            locs = r.get("locations") or []
            loc_str = (locs[0] if locs else {}).get("name", "") if locs else ""
            if isinstance(loc_str, dict):
                loc_str = loc_str.get("name", "")
            description = _strip_html(r.get("contents") or "")
            apply_url = r.get("refs", {}).get("landing_page", "") or ""
            ext_id = str(r.get("id") or "")
            posted = (r.get("publication_date") or "")[:10]
            city, state = _parse_city_state(loc_str)

            out.append({
                "external_id": f"muse-{ext_id}",
                "title": title,
                "company": company,
                "description": description,
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if _remote_from(loc_str, description) else "unknown",
                "posted_date": posted or None,
                "source_ats": "themuse",
                "team": (r.get("categories") or [{}])[0].get("name", "") if r.get("categories") else "",
                "remote": _remote_from(loc_str, description),
                "tags": [],
                "job_type": _classify_job_type(title, description),
                "company_website": _derive_website(apply_url, company),
            })
        if payload.get("page_count") and page >= int(payload["page_count"]) - 1:
            break
    return out


# ── Y Combinator — "Work at a Startup" via public JSON ────────────────────
# YC's official Work at a Startup board is at workatastartup.com. They
# don't publish a documented API, but their Algolia-powered public
# search exposes a usable endpoint. For simplicity + robustness we use
# the HN "Who is Hiring" thread search via HN Algolia — returns all
# YC + startup jobs for the last 12 months.

HN_ALGOLIA = "https://hn.algolia.com/api/v1/search"


def fetch_yc_hn() -> list[dict]:
    out: list[dict] = []
    seen_ids: set[str] = set()
    # Pull the last N months of "Ask HN: Who is hiring?" threads by
    # searching their titles — these threads compile thousands of YC +
    # startup job postings. Each thread's children are comments which
    # Algolia returns directly.
    try:
        resp = requests.get(
            HN_ALGOLIA,
            params={
                "query": "Ask HN Who is hiring",
                "tags": "story",
                "hitsPerPage": 12,
            },
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT,
        )
        payload = resp.json() if resp.status_code == 200 else {}
    except Exception as e:
        logger.warning("[hn] thread search failed: %s", e)
        return []

    threads = [h for h in (payload.get("hits") or []) if (h.get("title") or "").lower().startswith("ask hn")]
    for thread in threads[:12]:  # last ~12 months
        thread_id = thread.get("objectID")
        if not thread_id:
            continue
        try:
            r2 = requests.get(
                HN_ALGOLIA,
                params={
                    "tags": f"comment,story_{thread_id}",
                    "hitsPerPage": 500,
                },
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT,
            )
            data = r2.json() if r2.status_code == 200 else {}
        except Exception:
            continue
        for c in (data.get("hits") or []):
            txt = _strip_html(c.get("comment_text") or "")
            if not txt or len(txt) < 40:
                continue
            # HN format: first line usually "Company | Title | Location | REMOTE/ONSITE"
            first = txt.split(".")[0][:400]
            parts = [p.strip() for p in first.split("|")]
            if len(parts) < 2:
                continue
            company = parts[0][:80]
            title_candidate = parts[1][:120]
            if not company or not title_candidate:
                continue
            loc_candidate = parts[2] if len(parts) > 2 else ""
            apply_url = ""
            # Pull first URL out of the comment text
            url_m = re.search(r"https?://[^\s<>\)\]]+", txt)
            if url_m:
                apply_url = url_m.group(0).rstrip('.,)')
            ext_id = f"hn-{c.get('objectID')}"
            if ext_id in seen_ids:
                continue
            seen_ids.add(ext_id)
            city, state = _parse_city_state(loc_candidate)
            out.append({
                "external_id": ext_id,
                "title": title_candidate,
                "company": company,
                "description": txt[:3000],
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if _remote_from(loc_candidate, txt) else "unknown",
                "posted_date": (c.get("created_at") or "")[:10] or None,
                "source_ats": "hn_whos_hiring",
                "team": "",
                "remote": _remote_from(loc_candidate, txt),
                "tags": [],
                "job_type": _classify_job_type(title_candidate, txt),
                "company_website": _derive_website(apply_url, company),
            })
    return out


# ── Remotive ──────────────────────────────────────────────────────────────
# Fully-free JSON feed, no auth, no paging. Returns all live jobs in
# one response (~2-3k). Very stable.

REMOTIVE_URL = "https://remotive.com/api/remote-jobs"


def fetch_remotive() -> list[dict]:
    try:
        resp = requests.get(REMOTIVE_URL, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        data = resp.json() if resp.status_code == 200 else {}
    except Exception as e:
        logger.warning("[remotive] %s", e)
        return []

    out: list[dict] = []
    for r in (data.get("jobs") or []):
        if not isinstance(r, dict):
            continue
        title = (r.get("title") or "").strip()
        company = (r.get("company_name") or "").strip()
        if not title or not company:
            continue
        desc = _strip_html(r.get("description") or "")
        loc = r.get("candidate_required_location") or ""
        apply_url = r.get("url") or ""
        ext_id = str(r.get("id") or "")
        posted = (r.get("publication_date") or "")[:10]
        city, state = _parse_city_state(loc)
        out.append({
            "external_id": f"remotive-{ext_id}",
            "title": title,
            "company": company,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote",
            "posted_date": posted or None,
            "source_ats": "remotive",
            "team": r.get("category") or "",
            "remote": True,
            "tags": r.get("tags") or [],
            "job_type": _classify_job_type(title, desc),
            "company_website": _derive_website(apply_url, company),
        })
    return out


# ── Arbeitnow ─────────────────────────────────────────────────────────────

ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api"


def fetch_arbeitnow() -> list[dict]:
    out: list[dict] = []
    page = 1
    while page <= 10:  # safety cap — arbeitnow has ~3-5k jobs
        try:
            resp = requests.get(
                ARBEITNOW_URL,
                params={"page": page},
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT,
            )
            if resp.status_code != 200:
                break
            payload = resp.json()
        except Exception:
            break
        rows = payload.get("data") or []
        if not rows:
            break
        for r in rows:
            if not isinstance(r, dict):
                continue
            title = (r.get("title") or "").strip()
            company = (r.get("company_name") or "").strip()
            if not title or not company:
                continue
            desc = _strip_html(r.get("description") or "")
            loc = r.get("location") or ""
            apply_url = r.get("url") or ""
            ext_id = r.get("slug") or r.get("id") or title[:40]
            posted = ""
            try:
                import time as _t
                if r.get("created_at"):
                    posted = _t.strftime("%Y-%m-%d", _t.gmtime(int(r["created_at"])))
            except Exception:
                pass
            city, state = _parse_city_state(loc)
            remote = bool(r.get("remote")) or _remote_from(loc, desc)
            out.append({
                "external_id": f"arbn-{ext_id}",
                "title": title,
                "company": company,
                "description": desc,
                "apply_url": apply_url,
                "location_city": city,
                "location_state": state,
                "work_mode": "remote" if remote else "unknown",
                "posted_date": posted or None,
                "source_ats": "arbeitnow",
                "team": "",
                "remote": remote,
                "tags": r.get("tags") or [],
                "job_type": _classify_job_type(title, desc),
                "company_website": _derive_website(apply_url, company),
            })
        if not payload.get("links", {}).get("next"):
            break
        page += 1
    return out


# ── Jobicy ────────────────────────────────────────────────────────────────

JOBICY_URL = "https://jobicy.com/api/v2/remote-jobs"


def fetch_jobicy() -> list[dict]:
    """Jobicy doesn't paginate by page number — they use a single
    `count` param capped at 500 per call. We fetch twice with different
    tag filters to get broader coverage (remote-ok + tech + marketing
    + finance + design span different cohorts). ~1.5-3k unique jobs."""
    out: list[dict] = []
    seen_ids: set[str] = set()
    for tag in ("", "dev", "design", "marketing", "finance", "hr"):
        try:
            params = {"count": 500}
            if tag:
                params["tag"] = tag
            resp = requests.get(
                JOBICY_URL,
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT,
            )
            payload = resp.json() if resp.status_code == 200 else {}
        except Exception as e:
            logger.warning("[jobicy %s] %s", tag or "default", e)
            continue

        for r in (payload.get("jobs") or []):
            if not isinstance(r, dict):
                continue
            ext_id = str(r.get("id") or "")
            if ext_id in seen_ids:
                continue
            seen_ids.add(ext_id)
            out.append(r)
    # Re-process as the original loop expected (done at end so the
    # rest of this function can keep its shape).
    _jobicy_rows = out
    out = []
    for r in _jobicy_rows:
        if not isinstance(r, dict):
            continue
        title = (r.get("jobTitle") or r.get("title") or "").strip()
        company = (r.get("companyName") or "").strip()
        if not title or not company:
            continue
        desc = _strip_html(r.get("jobDescription") or r.get("description") or "")
        loc = r.get("jobGeo") or r.get("location") or ""
        apply_url = r.get("url") or ""
        ext_id = str(r.get("id") or "")
        posted = (r.get("pubDate") or "")[:10]
        city, state = _parse_city_state(loc)
        out.append({
            "external_id": f"jobicy-{ext_id}",
            "title": title,
            "company": company,
            "description": desc,
            "apply_url": apply_url,
            "location_city": city,
            "location_state": state,
            "work_mode": "remote",
            "posted_date": posted or None,
            "source_ats": "jobicy",
            "team": r.get("jobIndustry") or "",
            "remote": True,
            "tags": r.get("tags") or [],
            "job_type": _classify_job_type(title, desc),
            "company_website": _derive_website(apply_url, company),
        })
    return out


# ── Aggregator ────────────────────────────────────────────────────────────

def fetch_all_free_apis() -> list[tuple[str, str, list[dict]]]:
    """Same return shape as fetch_all_remote_feeds: (label, ats_label, jobs).
    Exceptions in any source are caught; worst case that source is empty."""
    out: list[tuple[str, str, list[dict]]] = []
    for label, ats_label, fn in [
        ("The Muse", "themuse", fetch_themuse),
        ("Remotive", "remotive", fetch_remotive),
        ("Arbeitnow", "arbeitnow", fetch_arbeitnow),
        ("Jobicy", "jobicy", fetch_jobicy),
        ("HN Who's Hiring", "hn_whos_hiring", fetch_yc_hn),
    ]:
        try:
            jobs = fn()
            out.append((label, ats_label, jobs))
        except Exception as e:
            logger.error("[free_apis] %s unhandled: %s", label, e)
            out.append((label, ats_label, []))
    return out
