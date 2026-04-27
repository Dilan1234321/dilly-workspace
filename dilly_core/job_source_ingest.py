"""
Unified ingester for Dilly's niche job sources (NSF REU, USAJobs).

This module is the glue between the per-source scrapers (job_source_*.py)
and the existing `internships` + `companies` tables. It:

    1. Runs each scraper in sequence, collecting listings
    2. Ensures a `companies` row exists per scraped organization
    3. UPSERTs into `internships` with deduping by (external_id)
    4. Writes `cohort_requirements` JSONB so the v2 feed can target
       the right students (pre_health → NSF BIO, pre_law → USAJobs
       legal, etc.)

Two entry points:

    ingest_niche_sources(conn)
        Runs all scrapers, writes everything, returns a stats dict.
        Called by the nightly cron.

    ensure_niche_sources_populated(conn, cohort_ids=None)
        Checks whether any niche-source listings exist for the given
        cohorts. If the table is empty (e.g. fresh deploy, failed cron),
        runs ingestion inline. Called by the /v2/internships/feed
        request handler as a fallback.

No LLM. No external dependencies beyond psycopg2 and stdlib urllib.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any, Dict, Iterable, List, Optional


# ── Core ingestion ────────────────────────────────────────────────────────

def _ensure_company(cur, name: str, ats_type: str, industry: str) -> str:
    """Get-or-create a companies row for this org, return the uuid."""
    cur.execute("SELECT id FROM companies WHERE name = %s", (name,))
    row = cur.fetchone()
    if row:
        return row[0] if not isinstance(row, dict) else row["id"]
    cid = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO companies (id, name, ats_type, industry) "
        "VALUES (%s, %s, %s, %s) ON CONFLICT (name) DO NOTHING RETURNING id",
        (cid, name, ats_type, industry),
    )
    result = cur.fetchone()
    if result:
        return result[0] if not isinstance(result, dict) else result["id"]
    # Race: another writer got in first — read it back
    cur.execute("SELECT id FROM companies WHERE name = %s", (name,))
    row = cur.fetchone()
    return (row[0] if not isinstance(row, dict) else row["id"]) if row else cid


def _cohort_requirements_from_cohorts(cohort_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Translate a list of Dilly cohort ids to the cohort_requirements JSONB
    shape expected by internships_v2._cohort_readiness().

    Each entry is {cohort: rich_display_name, smart, grit, build} — baseline
    thresholds at 60 so the job shows up for anyone in the cohort who isn't
    far below average. The ATS feed layer will refine per-student.
    """
    try:
        from dilly_core.rubric_scorer import RUBRIC_TO_RICH_COHORT
    except Exception:
        RUBRIC_TO_RICH_COHORT = {}
    out: List[Dict[str, Any]] = []
    for cid in cohort_ids or []:
        rich = RUBRIC_TO_RICH_COHORT.get(cid)
        if not rich:
            continue
        out.append({
            "cohort": rich,
            "smart": 60,
            "grit":  60,
            "build": 60,
        })
    return out


_INTERN_RE = re.compile(r"\b(intern(ship)?|co-?op|reu)\b", re.IGNORECASE)
_NEW_GRAD_RE = re.compile(
    r"\b(new\s*grad|entry\s*level|junior|associate|graduate\s+engineer|early\s+career)\b",
    re.IGNORECASE,
)
_SENIOR_RE = re.compile(
    r"\b(senior|sr\.?|staff|principal|lead|head\s+of|director|vp\b|chief|manager|mgr\b|architect)\b",
    re.IGNORECASE,
)
_PART_TIME_RE = re.compile(r"\bpart[-\s]?time\b", re.IGNORECASE)


def _classify_job_type(listing: Dict[str, Any]) -> str:
    """Best-effort job_type classification from title + explicit hint.

    Old behavior: defaulted to "internship" when source omitted job_type,
    which let general full-time / senior listings flood the Internship
    tab. Now we only return "internship" when the title actually says so;
    otherwise we route by title heuristics, falling back to "other".
    """
    explicit = (listing.get("job_type") or "").strip().lower()
    title = (listing.get("title") or "").strip()
    valid = {"internship", "research_internship", "entry_level",
             "full_time", "part_time", "senior", "other"}
    if explicit in valid and explicit != "":
        # Even when source supplied a job_type, override to "senior" if
        # the title screams senior - we have seen ATS exports tag
        # "Senior Software Engineer" as job_type=internship.
        if explicit in ("internship", "research_internship", "entry_level"):
            if _SENIOR_RE.search(title):
                return "senior"
        return explicit
    if _INTERN_RE.search(title):
        return "internship"
    if _SENIOR_RE.search(title):
        return "senior"
    if _NEW_GRAD_RE.search(title):
        return "entry_level"
    if _PART_TIME_RE.search(title):
        return "part_time"
    return "other"


def _upsert_listing(cur, listing: Dict[str, Any]) -> bool:
    """Insert one listing. Returns True if a new row landed, False on update/skip."""
    external_id = listing.get("external_id") or ""
    if not external_id:
        return False

    company_name = listing.get("company") or "Unknown Organization"
    source_ats = listing.get("source_ats") or "unknown"
    industry = listing.get("industry") or "government" if source_ats == "usajobs" else "research"
    company_id = _ensure_company(cur, company_name, source_ats, industry)

    cohort_reqs = _cohort_requirements_from_cohorts(listing.get("cohorts") or [])
    cohort_reqs_json = json.dumps(cohort_reqs)

    try:
        cur.execute(
            """
            INSERT INTO internships (
                id, company_id, title, description, apply_url,
                location_city, location_state, work_mode, status,
                source_ats, external_id, tags, team, remote,
                is_internship, posted_date, job_type, cohort_requirements
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, 'active',
                %s, %s, %s, %s, %s,
                true, %s, %s, %s::jsonb
            )
            ON CONFLICT (company_id, title) WHERE status = 'active' DO UPDATE SET
                description = EXCLUDED.description,
                apply_url = EXCLUDED.apply_url,
                cohort_requirements = EXCLUDED.cohort_requirements,
                updated_at = now()
            """,
            (
                str(uuid.uuid4()), company_id,
                listing.get("title", "")[:300],
                listing.get("description", "")[:2000],
                listing.get("apply_url", ""),
                listing.get("location_city"),
                listing.get("location_state"),
                listing.get("work_mode", "unknown"),
                source_ats,
                external_id[:200],
                json.dumps(listing.get("tags") or []),
                listing.get("team", "")[:100],
                bool(listing.get("remote", False)),
                listing.get("posted_date"),
                _classify_job_type(listing),
                cohort_reqs_json,
            ),
        )
        return cur.rowcount > 0
    except Exception as e:
        import sys
        sys.stderr.write(f"[ingest] upsert failed for {external_id}: {type(e).__name__}: {str(e)[:200]}\n")
        return False


# ── Public API ────────────────────────────────────────────────────────────

def ingest_niche_sources(conn) -> Dict[str, Any]:
    """
    Run all niche-source scrapers and ingest results into the internships table.
    Returns a stats dict showing how many listings were fetched and inserted
    per source.
    """
    stats: Dict[str, Any] = {"sources": {}, "total_fetched": 0, "total_inserted": 0, "errors": []}
    cur = conn.cursor()

    # NSF REU
    try:
        from dilly_core.job_source_nsf_reu import fetch_nsf_reu_listings
        nsf = fetch_nsf_reu_listings() or []
        inserted = sum(1 for item in nsf if _upsert_listing(cur, item))
        stats["sources"]["nsf_reu"] = {"fetched": len(nsf), "inserted": inserted}
        stats["total_fetched"] += len(nsf)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"nsf_reu: {type(e).__name__}: {str(e)[:200]}")

    # USAJobs
    try:
        from dilly_core.job_source_usajobs import fetch_usajobs_listings
        usajobs = fetch_usajobs_listings() or []
        inserted = sum(1 for item in usajobs if _upsert_listing(cur, item))
        stats["sources"]["usajobs"] = {"fetched": len(usajobs), "inserted": inserted}
        stats["total_fetched"] += len(usajobs)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"usajobs: {type(e).__name__}: {str(e)[:200]}")

    conn.commit()
    return stats


def ensure_niche_sources_populated(conn, cohort_ids: Optional[Iterable[str]] = None) -> bool:
    """
    Cold-start fallback: trigger inline ingestion when the internships
    table is sparse. Originally only checked nsf_reu/usajobs; that left
    students seeing empty internship feeds whenever those two sources
    had rows but the rest hadn't backfilled. Now we also fire ingestion
    when total active internships are below a comfortable floor, so any
    fresh deploy or DB wipe rehydrates fast without waiting on cron.

    Returns True if ingestion ran, False if the table was already
    well-populated.
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM internships "
        "WHERE source_ats IN ('nsf_reu', 'usajobs') AND status = 'active'"
    )
    row = cur.fetchone()
    try:
        niche_count = int(row[0] if not isinstance(row, dict) else row.get("count", 0))
    except (TypeError, ValueError):
        niche_count = 0

    cur.execute(
        "SELECT COUNT(*) FROM internships "
        "WHERE status = 'active' AND job_type IN ('internship', 'research_internship')"
    )
    row = cur.fetchone()
    try:
        intern_count = int(row[0] if not isinstance(row, dict) else row.get("count", 0))
    except (TypeError, ValueError):
        intern_count = 0

    # <500 active internships across all sources is "sparse". The
    # cron-fed steady state should sit in the thousands.
    if niche_count > 0 and intern_count >= 500:
        return False

    ingest_niche_sources(conn)
    return True


__all__ = ["ingest_niche_sources", "ensure_niche_sources_populated"]
