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
    """Extract JD from a Greenhouse job page."""
    result = {"job_description": "", "job_title": "", "company": "", "source": "greenhouse"}

    # Title: <h1 class="app-title">...</h1> or <title>...</title>
    title_match = re.search(r'<h1[^>]*class="app-title"[^>]*>(.*?)</h1>', html, re.DOTALL | re.IGNORECASE)
    if title_match:
        result["job_title"] = _clean_html(title_match.group(1)).strip()

    # Company: <span class="company-name">...</span>
    company_match = re.search(r'<span[^>]*class="company-name"[^>]*>(.*?)</span>', html, re.DOTALL | re.IGNORECASE)
    if company_match:
        result["company"] = _clean_html(company_match.group(1)).strip()

    # JD content: <div id="content">...</div>
    content_match = re.search(r'<div[^>]*id="content"[^>]*>(.*?)</div>\s*(?:<div|$)', html, re.DOTALL | re.IGNORECASE)
    if content_match:
        result["job_description"] = _clean_html(content_match.group(1)).strip()

    if not result["job_description"]:
        # Fallback: grab everything inside the main job content area
        main_match = re.search(r'class="[^"]*job[^"]*content[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)
        if main_match:
            result["job_description"] = _clean_html(main_match.group(1)).strip()

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

    # Try to find the largest text block that looks like a JD
    # Look for common JD containers
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

    # Route to the right extractor
    url_lower = url.lower()
    if "greenhouse.io" in url_lower or "boards.greenhouse" in url_lower:
        result = _extract_greenhouse(html)
    elif "lever.co" in url_lower or "jobs.lever" in url_lower:
        result = _extract_lever(html)
    else:
        result = _extract_generic(html, url)

    if not result.get("job_description") or len(result["job_description"]) < 50:
        raise errors.validation_error(
            "Could not extract a job description from this URL. "
            "Try pasting the full job description text instead."
        )

    result["url"] = url
    return result
