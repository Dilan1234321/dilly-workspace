"""
Board / tenant discovery for Greenhouse, Lever, Ashby, Workday.

Given a big candidate list of lowercased company slugs, probe each
vendor's public API. Successful hits get persisted to
`discovered_boards` table so every subsequent crawl reads them
without re-probing.

Usage:
    from api.ingest.slug_discovery import (
        discover_greenhouse, discover_lever, discover_ashby, discover_workday
    )
    discover_greenhouse(candidate_slugs, limit=5000)

Discovered slugs are stored in the database (not a file) so they're
shared across Railway workers and persist through deploys. First call
idempotently creates the table.

Probe cadence:
  - ~50ms between requests → 20 RPS per vendor (well under their free-
    tier limits, won't trigger rate-limiting).
  - 8s per-request timeout — most 404 in <300ms; slow tenants are
    skipped rather than holding the crawl.

Exits on any unrecoverable DB error; skips on transient network error.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Iterable

logger = logging.getLogger(__name__)

USER_AGENT = "Dilly-Discovery/1.0 (+https://trydilly.com)"
PROBE_TIMEOUT = 8.0
INTER_REQUEST_DELAY = 0.05  # 50ms


# ──────────────────────────────────────────────────────────────────────
# DB — single table keyed by (vendor, slug, wd_number, site_path).
# wd_number + site_path only relevant for Workday; NULL for others.
# ──────────────────────────────────────────────────────────────────────

def _get_db():
    import psycopg2
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try:
            pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except Exception:
            pass
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly",
        user="dilly_admin",
        password=pw,
        sslmode="require",
    )


def ensure_discovered_boards_table() -> None:
    """Idempotent CREATE. Called before every discover_*() run.

    PostgreSQL disallows function calls (e.g. COALESCE) inside a
    table-level UNIQUE constraint — those need a unique INDEX. That's
    why the initial version 500'd on import. We now build the table
    with a plain schema and enforce uniqueness via a separate unique
    expression index that handles the NULL-collapse correctly."""
    conn = _get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS discovered_boards (
                    id SERIAL PRIMARY KEY,
                    vendor TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    display_name TEXT,
                    wd_number TEXT,
                    site_path TEXT,
                    found_at TIMESTAMPTZ DEFAULT now(),
                    last_seen_at TIMESTAMPTZ DEFAULT now(),
                    job_count_sample INTEGER DEFAULT 0
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_discovered_boards_vendor "
                "ON discovered_boards (vendor)"
            )
            # Unique index with expressions — the proper way to enforce
            # uniqueness across (vendor, slug, nullable cols).
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_discovered_boards_key "
                "ON discovered_boards (vendor, slug, COALESCE(wd_number, ''), COALESCE(site_path, ''))"
            )
        conn.commit()
    finally:
        conn.close()


def _upsert(vendor: str, slug: str, display_name: str | None,
            wd_number: str | None, site_path: str | None,
            job_count: int) -> None:
    conn = _get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO discovered_boards
                    (vendor, slug, display_name, wd_number, site_path,
                     last_seen_at, job_count_sample)
                VALUES (%s, %s, %s, %s, %s, now(), %s)
                ON CONFLICT (vendor, slug, COALESCE(wd_number, ''), COALESCE(site_path, ''))
                DO UPDATE SET
                    last_seen_at = now(),
                    job_count_sample = EXCLUDED.job_count_sample,
                    display_name = COALESCE(discovered_boards.display_name, EXCLUDED.display_name)
                """,
                (vendor, slug, display_name, wd_number, site_path, job_count),
            )
        conn.commit()
    finally:
        conn.close()


def list_discovered(vendor: str) -> list[dict]:
    """Return every persisted hit for a vendor, most recent first."""
    conn = _get_db()
    try:
        import psycopg2.extras
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT slug, display_name, wd_number, site_path, job_count_sample "
                "FROM discovered_boards WHERE vendor = %s ORDER BY last_seen_at DESC",
                (vendor,),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────────────
# HTTP helper
# ──────────────────────────────────────────────────────────────────────

def _fetch(url: str, timeout: float = PROBE_TIMEOUT,
           method: str = "GET", data: bytes | None = None,
           headers: dict | None = None) -> tuple[int, bytes]:
    """Return (status_code, body). Status 0 on network error."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, **(headers or {})},
        method=method,
        data=data,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, b""


# ──────────────────────────────────────────────────────────────────────
# Greenhouse
# ──────────────────────────────────────────────────────────────────────

def probe_greenhouse(slug: str) -> tuple[bool, int, str | None]:
    """(hit, job_count, display_name) for a candidate Greenhouse slug.
    Hit = True when the API returned a non-empty jobs list."""
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    status, body = _fetch(url)
    if status != 200 or not body:
        return False, 0, None
    try:
        payload = json.loads(body)
    except Exception:
        return False, 0, None
    jobs = payload.get("jobs") or []
    if not jobs:
        return False, 0, None
    # Display name: the first job has a department or metadata block;
    # failing that we format the slug.
    display = slug.replace("-", " ").title()
    return True, len(jobs), display


def discover_greenhouse(candidates: Iterable[str], limit: int | None = None) -> dict:
    """Probe every candidate against Greenhouse. Persist hits. Return stats."""
    ensure_discovered_boards_table()
    seen: set[str] = set()
    hits = 0
    checked = 0
    started = time.time()
    for slug in candidates:
        slug = (slug or "").strip().lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        if limit and checked >= limit:
            break
        checked += 1
        ok, count, display = probe_greenhouse(slug)
        if ok:
            _upsert("greenhouse", slug, display, None, None, count)
            hits += 1
        time.sleep(INTER_REQUEST_DELAY)
    return {
        "vendor": "greenhouse",
        "checked": checked,
        "hits": hits,
        "elapsed_sec": round(time.time() - started, 1),
    }


# ──────────────────────────────────────────────────────────────────────
# Lever — https://api.lever.co/v0/postings/{slug}?mode=json
# ──────────────────────────────────────────────────────────────────────

def probe_lever(slug: str) -> tuple[bool, int, str | None]:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    status, body = _fetch(url)
    if status != 200 or not body:
        return False, 0, None
    try:
        payload = json.loads(body)
    except Exception:
        return False, 0, None
    if not isinstance(payload, list) or not payload:
        return False, 0, None
    return True, len(payload), slug.replace("-", " ").title()


def discover_lever(candidates: Iterable[str], limit: int | None = None) -> dict:
    ensure_discovered_boards_table()
    seen: set[str] = set()
    hits = 0
    checked = 0
    started = time.time()
    for slug in candidates:
        slug = (slug or "").strip().lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        if limit and checked >= limit:
            break
        checked += 1
        ok, count, display = probe_lever(slug)
        if ok:
            _upsert("lever", slug, display, None, None, count)
            hits += 1
        time.sleep(INTER_REQUEST_DELAY)
    return {
        "vendor": "lever",
        "checked": checked,
        "hits": hits,
        "elapsed_sec": round(time.time() - started, 1),
    }


# ──────────────────────────────────────────────────────────────────────
# Ashby — GraphQL endpoint; we check if the jobBoard resolves.
# ──────────────────────────────────────────────────────────────────────

_ASHBY_QUERY = (
    '{"operationName":"ApiJobBoardWithTeams","variables":'
    '{"organizationHostedJobsPageName":"%s"},'
    '"query":"query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { '
    'jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) '
    '{ teams { name jobs { id } } } }"}'
)


def probe_ashby(slug: str) -> tuple[bool, int, str | None]:
    body_str = _ASHBY_QUERY % slug
    status, resp_body = _fetch(
        "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams",
        method="POST",
        data=body_str.encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    if status != 200 or not resp_body:
        return False, 0, None
    try:
        data = json.loads(resp_body)
    except Exception:
        return False, 0, None
    board = ((data.get("data") or {}).get("jobBoard") or {})
    if not board:
        return False, 0, None
    teams = board.get("teams") or []
    total = sum(len(t.get("jobs") or []) for t in teams)
    if total == 0:
        return False, 0, None
    return True, total, slug.replace("-", " ").title()


def discover_ashby(candidates: Iterable[str], limit: int | None = None) -> dict:
    ensure_discovered_boards_table()
    seen: set[str] = set()
    hits = 0
    checked = 0
    started = time.time()
    for slug in candidates:
        slug = (slug or "").strip().lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        if limit and checked >= limit:
            break
        checked += 1
        ok, count, display = probe_ashby(slug)
        if ok:
            _upsert("ashby", slug, display, None, None, count)
            hits += 1
        time.sleep(INTER_REQUEST_DELAY)
    return {
        "vendor": "ashby",
        "checked": checked,
        "hits": hits,
        "elapsed_sec": round(time.time() - started, 1),
    }


# ──────────────────────────────────────────────────────────────────────
# Workday — much harder: tenant requires (slug, wd_number, site_path).
# ──────────────────────────────────────────────────────────────────────

WD_NUMBERS = ["wd1", "wd5", "wd3", "wd12"]
# site_path is usually "External" but some tenants use custom paths.
# We try the most common variants per slug.
WD_SITE_PATHS = ["External", "Careers", "External_Career_Site", "JobsAtCompany"]


def probe_workday(slug: str, wd: str, site: str) -> tuple[bool, int]:
    """Return (hit, job_count). One probe = one tenant variant.

    Workday exposes a JSON API at:
      {slug}.{wd}.myworkdayjobs.com/wday/cxs/{slug}/{site}/jobs
    (POST with an empty JSON body). Most 422/404 — a hit returns a
    jobs list with a total count.
    """
    url = f"https://{slug}.{wd}.myworkdayjobs.com/wday/cxs/{slug}/{site}/jobs"
    status, body = _fetch(
        url,
        method="POST",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        timeout=6.0,
    )
    if status != 200 or not body:
        return False, 0
    try:
        payload = json.loads(body)
    except Exception:
        return False, 0
    total = int(payload.get("total") or 0)
    if total <= 0:
        return False, 0
    return True, total


def discover_workday(candidates: Iterable[str], limit: int | None = None) -> dict:
    """Probe every (slug, wd_number, site_path) combo.
    Stops probing wd_numbers/site_paths for a slug once the first hit
    lands — most tenants live on exactly one combination."""
    ensure_discovered_boards_table()
    seen: set[str] = set()
    hits = 0
    checked = 0
    started = time.time()
    for slug in candidates:
        slug = (slug or "").strip().lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        if limit and checked >= limit:
            break

        found = False
        for wd in WD_NUMBERS:
            if found:
                break
            for site in WD_SITE_PATHS:
                checked += 1
                ok, count = probe_workday(slug, wd, site)
                if ok:
                    _upsert("workday", slug, slug.replace("-", " ").title(), wd, site, count)
                    hits += 1
                    found = True
                    break
                time.sleep(INTER_REQUEST_DELAY)
    return {
        "vendor": "workday",
        "checked": checked,
        "hits": hits,
        "elapsed_sec": round(time.time() - started, 1),
    }
