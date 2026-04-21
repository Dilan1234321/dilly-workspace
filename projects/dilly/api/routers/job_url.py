"""
Job URL fetcher - extract job descriptions from career page URLs.

POST /jobs/fetch-jd
  Body: { "url": "https://boards.greenhouse.io/company/jobs/12345" }
  Returns: { "job_description": "...", "job_title": "...", "company": "...", "source": "greenhouse" }

Supports:
  - Greenhouse job boards (boards.greenhouse.io)
  - Lever job pages (jobs.lever.co)
  - Generic career pages (best-effort HTML extraction)

Uses httpx to fetch the page, then extracts the job description using
platform-specific selectors for known ATS vendors, with a generic
fallback that extracts the largest text block on the page.

No LLM needed for extraction. Deterministic.
"""

from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Body, Request
from pydantic import BaseModel

from projects.dilly.api import deps, errors

router = APIRouter(tags=["jobs"])


class FetchJDRequest(BaseModel):
    url: str


def _clean_html(html: str) -> str:
    """Strip HTML tags and decode entities into plain text."""
    # Remove script and style blocks
    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Remove tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Decode common entities
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&nbsp;', ' ').replace('&#39;', "'").replace('&quot;', '"')
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _extract_greenhouse(html: str) -> dict:
    """Extract JD from a Greenhouse job page. Greenhouse redesigned
    their template; current markup (2026-04) uses class='job__title'
    for the title wrapper and class='job__description body' for the
    JD block. Old class='app-title' + id='content' stopped working."""
    result = {"job_description": "", "job_title": "", "company": "", "source": "greenhouse"}

    # Title: new markup nests the h1 inside div.job__title; older pages
    # still render app-title. Try both.
    title_match = (
        re.search(r'class="[^"]*job__title[^"]*"[^>]*>\s*<h1[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
        or re.search(r'<h1[^>]*class="[^"]*app-title[^"]*"[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
        or re.search(r'<h1[^>]*class="[^"]*section-header[^"]*"[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
    )
    if title_match:
        result["job_title"] = _clean_html(title_match.group(1)).strip()[:140]

    # Page title fallback often reads "Job Application for <role> at <company>"
    page_title = re.search(r'<title>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
    if page_title:
        raw = _clean_html(page_title.group(1))
        at = re.search(r'^Job Application for\s+(.+?)\s+at\s+(.+)$', raw, re.IGNORECASE)
        if at:
            if not result["job_title"]:
                result["job_title"] = at.group(1).strip()[:140]
            result["company"] = at.group(2).strip()[:80]

    # Company: old markup used class="company-name"
    if not result["company"]:
        company_match = re.search(r'<span[^>]*class="company-name"[^>]*>(.*?)</span>', html, re.DOTALL | re.IGNORECASE)
        if company_match:
            result["company"] = _clean_html(company_match.group(1)).strip()[:80]

    # JD content: new markup uses class="job__description body"; the
    # block stays open until the </main> near the bottom.
    content_match = re.search(
        r'<div[^>]*class="[^"]*job__description[^"]*"[^>]*>(.*?)</div>\s*</div>\s*</main>',
        html, re.DOTALL | re.IGNORECASE,
    )
    if content_match:
        result["job_description"] = _clean_html(content_match.group(1)).strip()[:8000]

    # Older layouts used id="content"
    if not result["job_description"]:
        content_match = re.search(r'<div[^>]*id="content"[^>]*>(.*?)</div>\s*(?:<div|$)', html, re.DOTALL | re.IGNORECASE)
        if content_match:
            result["job_description"] = _clean_html(content_match.group(1)).strip()[:8000]

    if not result["job_description"]:
        # Last-resort: grab everything inside the main job content area
        main_match = re.search(r'class="[^"]*job[^"]*content[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)
        if main_match:
            result["job_description"] = _clean_html(main_match.group(1)).strip()[:8000]

    return result


def _extract_lever(html: str) -> dict:
    """Extract JD from a Lever job page."""
    result = {"job_description": "", "job_title": "", "company": "", "source": "lever"}

    title_match = re.search(r'<h2[^>]*>(.*?)</h2>', html, re.DOTALL)
    if title_match:
        result["job_title"] = _clean_html(title_match.group(1)).strip()

    # Lever company name is in the page title: "Role - Company"
    page_title = re.search(r'<title>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
    if page_title:
        parts = _clean_html(page_title.group(1)).split(' - ')
        if len(parts) >= 2:
            result["company"] = parts[-1].strip().replace(' - Lever', '').strip()

    # JD in .section-wrapper .content
    content_match = re.search(r'class="[^"]*section-wrapper[^"]*"[^>]*>(.*?)<div[^>]*class="[^"]*lever-application', html, re.DOTALL | re.IGNORECASE)
    if content_match:
        result["job_description"] = _clean_html(content_match.group(1)).strip()

    return result


def _extract_ashby(html: str, url: str) -> dict:
    """Extract JD from an Ashby job page (jobs.ashbyhq.com/{company}/...).
    Ashby pages embed the full posting in a JSON blob inside a <script>
    tag. When present we use it; otherwise fall back to HTML parsing."""
    result = {"job_description": "", "job_title": "", "company": "", "source": "ashby"}

    # Company name lives in the URL: jobs.ashbyhq.com/COMPANY/...
    m = re.search(r'ashbyhq\.com/([^/?#]+)', url, re.IGNORECASE)
    if m:
        result["company"] = m.group(1).replace('-', ' ').title()

    # Ashby inlines __NEXT_DATA__ with the posting body.
    data_match = re.search(
        r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE,
    )
    if data_match:
        try:
            import json as _json
            data = _json.loads(data_match.group(1))
            # Walk a few known paths. The Ashby schema has shifted a few
            # times; we try multiple.
            job = (
                (data.get("props") or {}).get("pageProps", {}).get("posting")
                or (data.get("props") or {}).get("pageProps", {}).get("job")
                or {}
            )
            if isinstance(job, dict):
                if job.get("title"):
                    result["job_title"] = str(job["title"]).strip()[:140]
                desc = job.get("descriptionPlain") or job.get("descriptionHtml") or ""
                if desc:
                    result["job_description"] = _clean_html(str(desc))[:8000]
        except Exception:
            pass

    # Fallbacks if NEXT_DATA didn't give us what we need
    if not result["job_title"]:
        tmatch = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
        if tmatch:
            result["job_title"] = _clean_html(tmatch.group(1))[:140]
    if not result["job_description"]:
        # Ashby wraps the description in a container with a data attr
        dmatch = re.search(
            r'<div[^>]*class="[^"]*_descriptionText[^"]*"[^>]*>(.*?)</div>\s*</div>',
            html, re.DOTALL | re.IGNORECASE,
        )
        if dmatch:
            result["job_description"] = _clean_html(dmatch.group(1)).strip()[:8000]

    return result


def _extract_workday(html: str, url: str) -> dict:
    """Extract JD from a Workday jobs page. Workday pages are SPA shells
    but include an OpenGraph description and a structured JSON in some
    tenants."""
    result = {"job_description": "", "job_title": "", "company": "", "source": "workday"}

    # Company: subdomain (e.g. mayo.wd5.myworkdayjobs.com → mayo)
    m = re.search(r'https?://([^.]+)\.[^/]*workday[^/]*', url, re.IGNORECASE)
    if m:
        result["company"] = m.group(1).replace('-', ' ').title()

    # Title: og:title or <title>
    og_title = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', html, re.IGNORECASE)
    if og_title:
        result["job_title"] = og_title.group(1).strip()[:140]
    elif not result["job_title"]:
        t = re.search(r'<title>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
        if t:
            raw = _clean_html(t.group(1))
            parts = re.split(r'\s*[|]\s*|\s+-\s+', raw)
            if parts:
                result["job_title"] = parts[0].strip()[:140]

    # Description: og:description (truncated) then structured JD
    og_desc = re.search(r'<meta[^>]+property="og:description"[^>]+content="([^"]+)"', html, re.IGNORECASE)
    if og_desc:
        result["job_description"] = og_desc.group(1).strip()

    # Workday embeds the full JD in data-automation-id="jobPostingDescription"
    jd_match = re.search(
        r'data-automation-id="jobPostingDescription"[^>]*>(.*?)</div>\s*(?:<div|<footer|$)',
        html, re.DOTALL | re.IGNORECASE,
    )
    if jd_match:
        text = _clean_html(jd_match.group(1)).strip()
        if len(text) > len(result["job_description"]):
            result["job_description"] = text[:8000]

    return result


def _extract_smartrecruiters(html: str, url: str) -> dict:
    """Extract JD from a SmartRecruiters posting (jobs.smartrecruiters.com)."""
    result = {"job_description": "", "job_title": "", "company": "", "source": "smartrecruiters"}

    m = re.search(r'smartrecruiters\.com/([^/?#]+)', url, re.IGNORECASE)
    if m:
        result["company"] = m.group(1).replace('-', ' ').title()

    og_title = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', html, re.IGNORECASE)
    if og_title:
        result["job_title"] = og_title.group(1).strip()[:140]

    # SmartRecruiters wraps the job description in itemprop="description"
    jd_match = re.search(
        r'itemprop="description"[^>]*>(.*?)</(?:div|section)>\s*(?:<div|<section|<footer|$)',
        html, re.DOTALL | re.IGNORECASE,
    )
    if jd_match:
        result["job_description"] = _clean_html(jd_match.group(1)).strip()[:8000]
    return result


def _extract_workable(html: str, url: str) -> dict:
    """Workable: apply.workable.com/{company}/j/.../"""
    result = {"job_description": "", "job_title": "", "company": "", "source": "workable"}

    m = re.search(r'workable\.com/([^/?#]+)', url, re.IGNORECASE)
    if m:
        result["company"] = m.group(1).replace('-', ' ').title()

    og_title = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', html, re.IGNORECASE)
    if og_title:
        result["job_title"] = og_title.group(1).strip()[:140]
    og_desc = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]+)"', html, re.IGNORECASE)
    if og_desc:
        result["job_description"] = og_desc.group(1).strip()

    # Workable uses data-ui="job-description" containers
    jd_match = re.search(
        r'data-ui="job-description"[^>]*>(.*?)</(?:div|section)>\s*(?:<div|<footer|$)',
        html, re.DOTALL | re.IGNORECASE,
    )
    if jd_match:
        text = _clean_html(jd_match.group(1)).strip()
        if len(text) > len(result["job_description"]):
            result["job_description"] = text[:8000]
    return result


def _extract_generic(html: str, url: str) -> dict:
    """Best-effort extraction from any career page."""
    result = {"job_description": "", "job_title": "", "company": "", "source": "generic"}

    # Title from <title> tag
    title_match = re.search(r'<title>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
    if title_match:
        raw = _clean_html(title_match.group(1))
        # Common pattern: "Job Title | Company" or "Job Title - Company"
        parts = re.split(r'\s*[|]\s*|\s+-\s+', raw)
        if parts:
            result["job_title"] = parts[0].strip()[:120]
        if len(parts) >= 2:
            result["company"] = parts[-1].strip()[:80]

    # Prefer JSON-LD structured data when present — many career pages
    # expose a JobPosting with title/description/company. This gives
    # dramatically better extraction than regex over divs.
    ld_matches = re.findall(
        r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE,
    )
    for ld_raw in ld_matches[:4]:  # usually 1-2 blocks, cap for safety
        try:
            import json as _json
            data = _json.loads(ld_raw)
            blocks = data if isinstance(data, list) else [data]
            for b in blocks:
                if not isinstance(b, dict):
                    continue
                t = b.get("@type")
                if t == "JobPosting" or (isinstance(t, list) and "JobPosting" in t):
                    if b.get("title"):
                        result["job_title"] = str(b["title"]).strip()[:140]
                    if isinstance(b.get("hiringOrganization"), dict):
                        nm = b["hiringOrganization"].get("name")
                        if nm:
                            result["company"] = str(nm).strip()[:80]
                    desc = b.get("description") or ""
                    if desc:
                        result["job_description"] = _clean_html(str(desc))[:8000]
                    break
            if result.get("job_description"):
                break
        except Exception:
            continue

    # Try to find the largest text block that looks like a JD
    # Look for common JD containers
    if not result["job_description"]:
        for pattern in [
            r'class="[^"]*job[-_]?description[^"]*"[^>]*>(.*?)</div>',
            r'class="[^"]*description[-_]?content[^"]*"[^>]*>(.*?)</div>',
            r'class="[^"]*posting[-_]?description[^"]*"[^>]*>(.*?)</div>',
            r'<article[^>]*>(.*?)</article>',
            r'class="[^"]*content[-_]?body[^"]*"[^>]*>(.*?)</div>',
        ]:
            match = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
            if match:
                text = _clean_html(match.group(1)).strip()
                if len(text) > 200:
                    result["job_description"] = text[:8000]
                    break

    # Fallback: just clean the whole body
    if not result["job_description"]:
        body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
        if body_match:
            full_text = _clean_html(body_match.group(1))
            # Take the middle portion (skip header/footer noise)
            if len(full_text) > 500:
                result["job_description"] = full_text[200:8000].strip()
            else:
                result["job_description"] = full_text[:8000].strip()

    return result


@router.post("/jobs/fetch-jd")
async def fetch_job_description(request: Request, body: FetchJDRequest):
    """
    Fetch a job page URL and extract the job description, title, and
    company name. Supports Greenhouse, Lever, and generic career pages.

    The mobile client sends a URL the student pasted, and this endpoint
    returns structured JD data that the Dilly Tailor and Cover Letter
    flows can use directly.
    """
    deps.require_auth(request)

    url = (body.url or "").strip()
    if not url:
        raise errors.validation_error("URL is required.")
    if not url.startswith("http"):
        url = "https://" + url

    # Fetch the page
    import httpx
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; DillyBot/1.0; +https://trydilly.com)",
                "Accept": "text/html,application/xhtml+xml",
            })
            resp.raise_for_status()
            html = resp.text
    except httpx.TimeoutException:
        raise errors.internal("The job page took too long to load. Try pasting the job description directly.")
    except httpx.HTTPStatusError as e:
        raise errors.internal(f"Could not load the page (HTTP {e.response.status_code}). Try pasting the JD.")
    except Exception:
        raise errors.internal("Could not fetch the job page. Check the URL or paste the JD directly.")

    if len(html) < 200:
        raise errors.internal("The page returned very little content. Try pasting the JD directly.")

    # Route to the right extractor. Order matters — more specific
    # matches before the generic fallback.
    url_lower = url.lower()
    if "greenhouse.io" in url_lower or "boards.greenhouse" in url_lower:
        result = _extract_greenhouse(html)
    elif "lever.co" in url_lower or "jobs.lever" in url_lower:
        result = _extract_lever(html)
    elif "ashbyhq.com" in url_lower:
        result = _extract_ashby(html, url)
    elif "smartrecruiters.com" in url_lower:
        result = _extract_smartrecruiters(html, url)
    elif "workable.com" in url_lower or "apply.workable.com" in url_lower:
        result = _extract_workable(html, url)
    elif "workday" in url_lower or "myworkdayjobs" in url_lower:
        result = _extract_workday(html, url)
    else:
        result = _extract_generic(html, url)

    # LinkedIn/Indeed specifically throttle bots. If the generic fallback
    # returns almost nothing from those hosts, give the user a clear
    # message rather than a cryptic error.
    if ("linkedin.com" in url_lower or "indeed.com" in url_lower) and \
       (not result.get("job_description") or len(result["job_description"]) < 200):
        raise errors.validation_error(
            "LinkedIn/Indeed block automated fetching of their job pages. "
            "Open the posting, copy the full job description, and paste it in."
        )

    if not result.get("job_description") or len(result["job_description"]) < 50:
        raise errors.validation_error(
            "Could not extract a job description from this URL. "
            "Try pasting the full job description text instead."
        )

    result["url"] = url
    return result
