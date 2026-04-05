#!/usr/bin/env python3
"""
Ethical company criteria scraper for Dilly.

Scrapes PUBLIC career pages to extract what companies look for in candidates.
Respects robots.txt, rate limits, and only targets legal/ethical sources.

Usage:
  python projects/dilly/scripts/company_criteria_scraper.py [--dry-run] [--output knowledge/scraped_criteria.json]

Sources: Company career pages, "what we look for" sections, job requirement pages.
All data is public (no login required). We cite source URLs for every criterion.
"""

import argparse
import json
import re
import time
import urllib.parse
import urllib.robotparser
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    raise

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Install beautifulsoup4: pip install beautifulsoup4")
    raise

USER_AGENT = "Dilly-Research-Bot/1.0 (+https://trydilly.com)"
REQUEST_DELAY_SEC = 2.0  # Minimum seconds between requests per domain

# Curated list of public career pages. Only include pages that are clearly public.
# We avoid LinkedIn, Indeed, and sites that prohibit scraping in ToS.
CAREER_PAGE_URLS = [
    # Tech
    "https://www.google.com/about/careers/applications/students/",
    "https://careers.microsoft.com/students/",
    "https://www.amazon.jobs/en/teams/internships",
    "https://www.meta.com/careers/students/",
    "https://www.apple.com/careers/",
    # Finance
    "https://www.goldmansachs.com/careers/students/",
    "https://careers.morganstanley.com/students/",
    "https://careers.jpmorgan.com/global/en/students",
    # Consulting
    "https://www.mckinsey.com/careers/students",
    "https://careers.bcg.com/students",
    "https://www.bain.com/careers/students/",
]

# Domains we skip (ToS prohibit scraping or we choose not to)
SKIP_DOMAINS = {"linkedin.com", "indeed.com", "glassdoor.com", "bloomberg.com"}


def get_domain(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    domain = (parsed.netloc or "").lower()
    return domain


def check_robots_txt(url: str) -> bool:
    """Return True if our User-Agent is allowed to fetch this URL."""
    domain = get_domain(url)
    if any(skip in domain for skip in SKIP_DOMAINS):
        return False
    robots_url = f"https://{domain}/robots.txt"
    rp = urllib.robotparser.RobotFileParser()
    try:
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        # If we can't read robots.txt, be conservative: don't scrape
        return False


def fetch_page(url: str) -> str | None:
    """Fetch page content. Returns HTML or None on failure."""
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=15,
            allow_redirects=True,
        )
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        print(f"  Fetch failed: {e}")
        return None


def extract_criteria_from_html(html: str, url: str) -> dict:
    """
    Extract "what we look for" style content from career page HTML.
    Returns structured dict with criteria, source_url, and extracted text.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Remove script and style elements
    for tag in soup(["script", "style"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    # Look for common section headers
    criteria_keywords = [
        r"what we look for",
        r"what we're looking for",
        r"qualifications",
        r"requirements",
        r"you have",
        r"you bring",
        r"ideal candidate",
        r"we value",
        r"key qualities",
        r"skills we look for",
        r"experience we look for",
        r"students",
        r"interns",
    ]

    found_sections = []
    current_section = None
    current_lines = []

    for i, line in enumerate(lines):
        line_lower = line.lower()
        matched = False
        for kw in criteria_keywords:
            if re.search(kw, line_lower) and len(line) < 150:
                if current_section:
                    found_sections.append({"heading": current_section, "content": "\n".join(current_lines[:15])})
                current_section = line[:200]
                current_lines = []
                matched = True
                break
        if not matched and current_section and len(line) > 10 and len(line) < 500:
            current_lines.append(line)
            if len(current_lines) >= 15:
                found_sections.append({"heading": current_section, "content": "\n".join(current_lines)})
                current_section = None
                current_lines = []

    if current_section:
        found_sections.append({"heading": current_section, "content": "\n".join(current_lines[:15])})

    # Fallback: take first 3000 chars of main content as raw extract
    if not found_sections:
        body = soup.find("body") or soup
        body_text = body.get_text(separator=" ", strip=True)[:3000] if body else ""
        found_sections = [{"heading": "Page content", "content": body_text[:2000]}]

    return {
        "source_url": url,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "sections": found_sections,
        "company": _infer_company_name(url),
    }


def _infer_company_name(url: str) -> str:
    """Infer company name from URL."""
    domain = get_domain(url)
    name_map = {
        "google.com": "Google",
        "microsoft.com": "Microsoft",
        "amazon.com": "Amazon",
        "meta.com": "Meta",
        "apple.com": "Apple",
        "goldmansachs.com": "Goldman Sachs",
        "morganstanley.com": "Morgan Stanley",
        "jpmorgan.com": "JP Morgan",
        "mckinsey.com": "McKinsey",
        "bcg.com": "BCG",
        "bain.com": "Bain",
    }
    for d, name in name_map.items():
        if d in domain:
            return name
    return domain.split(".")[0].replace("-", " ").title()


def run_scraper(dry_run: bool = False, output_path: str | None = None, limit: int | None = None) -> dict:
    """Run the scraper. Returns aggregated results."""
    results = []
    last_domain = None
    urls = CAREER_PAGE_URLS[:limit] if limit else CAREER_PAGE_URLS

    for url in urls:
        domain = get_domain(url)
        if any(skip in domain for skip in SKIP_DOMAINS):
            print(f"Skip (domain): {url}")
            continue

        if dry_run:
            print(f"[DRY RUN] Would scrape: {url}")
            continue

        # Rate limit: wait between requests to same domain
        if last_domain == domain:
            time.sleep(REQUEST_DELAY_SEC)
        last_domain = domain

        if not check_robots_txt(url):
            print(f"Skip (robots.txt): {url}")
            continue

        print(f"Scraping: {url}")
        html = fetch_page(url)
        if not html:
            continue

        criteria = extract_criteria_from_html(html, url)
        results.append(criteria)
        print(f"  -> Extracted {len(criteria.get('sections', []))} sections for {criteria.get('company', '?')}")

    output = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "sources": results,
        "policy": "Ethical scraping: robots.txt respected, rate limited, public pages only. See docs/DATA_SOURCES.md",
    }

    if output_path and not dry_run and results:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2)
        print(f"\nWrote {len(results)} company extracts to {output_path}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Scrape company career pages for hiring criteria")
    parser.add_argument("--dry-run", action="store_true", help="Check robots.txt and URLs only, do not fetch")
    parser.add_argument(
        "--output",
        default="knowledge/scraped_criteria.json",
        help="Output path for scraped data (default: knowledge/scraped_criteria.json)",
    )
    parser.add_argument("--limit", type=int, help="Limit number of URLs to scrape (for testing)")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    output_path = (project_root / args.output).resolve()

    run_scraper(dry_run=args.dry_run, output_path=str(output_path), limit=args.limit)


if __name__ == "__main__":
    main()
