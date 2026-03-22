"""
Meridian Job Scraper — Ethical and legal sources only.

Sources:
- Greenhouse Job Board API (public, no auth for listing)
- USAJobs API (free, requires API key from developer.usajobs.gov)

Respects robots.txt, rate limits, and ToS. See docs/DATA_SOURCES.md.
"""

from .scraper import run_job_scraper

__all__ = ["run_job_scraper"]
