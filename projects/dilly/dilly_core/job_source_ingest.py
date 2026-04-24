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
    # Inline fallback so Railway path issues never silently drop cohort assignments.
    _RUBRIC_FALLBACK: Dict[str, str] = {
        "tech_software_engineering": "Software Engineering & CS",
        "tech_data_science":         "Data Science & Analytics",
        "tech_cybersecurity":        "Cybersecurity & IT",
        "business_finance":          "Finance & Accounting",
        "business_consulting":       "Consulting & Strategy",
        "business_marketing":        "Marketing & Advertising",
        "business_accounting":       "Finance & Accounting",
        "pre_health":                "Healthcare & Clinical",
        "pre_law":                   "Law & Government",
        "science_research":          "Life Sciences & Research",
        "health_nursing_allied":     "Healthcare & Clinical",
        "social_sciences":           "Social Sciences & Nonprofit",
        "humanities_communications": "Media & Communications",
        "arts_design":               "Design & Creative Arts",
        "quantitative_math_stats":   "Physical Sciences & Math",
        "sport_management":          "Management & Operations",
        "education":                 "Education & Human Development",
        "economics_policy":          "Economics & Public Policy",
        "biotech_pharma":            "Biotech & Pharmaceutical",
        "life_sciences":             "Life Sciences & Research",
        "physical_sciences":         "Physical Sciences & Math",
        "entrepreneurship":          "Entrepreneurship & Innovation",
    }
    try:
        from dilly_core.rubric_scorer import RUBRIC_TO_RICH_COHORT
        RUBRIC_TO_RICH_COHORT = {**_RUBRIC_FALLBACK, **RUBRIC_TO_RICH_COHORT}
    except Exception:
        RUBRIC_TO_RICH_COHORT = _RUBRIC_FALLBACK
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
                listing.get("job_type", "internship"),
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

    # SimplifyJobs (Summer internships + New-Grad entry-level)
    try:
        from dilly_core.job_source_simplify import fetch_simplify_listings
        simplify = fetch_simplify_listings() or []
        inserted = sum(1 for item in simplify if _upsert_listing(cur, item))
        stats["sources"]["simplify"] = {"fetched": len(simplify), "inserted": inserted}
        stats["total_fetched"] += len(simplify)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"simplify: {type(e).__name__}: {str(e)[:200]}")

    # RemoteOK (~100 remote jobs, refreshed daily)
    try:
        from dilly_core.job_source_remoteok import fetch_remoteok_listings
        remoteok = fetch_remoteok_listings() or []
        inserted = sum(1 for item in remoteok if _upsert_listing(cur, item))
        stats["sources"]["remoteok"] = {"fetched": len(remoteok), "inserted": inserted}
        stats["total_fetched"] += len(remoteok)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"remoteok: {type(e).__name__}: {str(e)[:200]}")

    # WeWorkRemotely (~100 remote jobs, refreshed daily)
    try:
        from dilly_core.job_source_weworkremotely import fetch_weworkremotely_listings
        wwr = fetch_weworkremotely_listings() or []
        inserted = sum(1 for item in wwr if _upsert_listing(cur, item))
        stats["sources"]["weworkremotely"] = {"fetched": len(wwr), "inserted": inserted}
        stats["total_fetched"] += len(wwr)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"weworkremotely: {type(e).__name__}: {str(e)[:200]}")

    # SAP SuccessFactors (big tech, pharma, consumer goods, consulting)
    try:
        from dilly_core.job_source_successfactors import fetch_all_successfactors
        sfsf = fetch_all_successfactors() or []
        inserted = sum(1 for item in sfsf if _upsert_listing(cur, item))
        stats["sources"]["successfactors"] = {"fetched": len(sfsf), "inserted": inserted}
        stats["total_fetched"] += len(sfsf)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"successfactors: {type(e).__name__}: {str(e)[:200]}")

    # Taleo / Oracle (telecom, automotive, energy, banking, defense, retail)
    try:
        from dilly_core.job_source_taleo import fetch_all_taleo
        taleo = fetch_all_taleo() or []
        inserted = sum(1 for item in taleo if _upsert_listing(cur, item))
        stats["sources"]["taleo"] = {"fetched": len(taleo), "inserted": inserted}
        stats["total_fetched"] += len(taleo)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"taleo: {type(e).__name__}: {str(e)[:200]}")

    # iCIMS (enterprise: hospitals, pharma, defense, retail, insurance)
    try:
        from dilly_core.job_source_icims import fetch_all_icims
        icims = fetch_all_icims() or []
        inserted = sum(1 for item in icims if _upsert_listing(cur, item))
        stats["sources"]["icims"] = {"fetched": len(icims), "inserted": inserted}
        stats["total_fetched"] += len(icims)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"icims: {type(e).__name__}: {str(e)[:200]}")

    # JazzHR (SMBs, staffing, agencies, healthcare SMBs)
    try:
        import sys as _sys, os as _os
        _sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), "..", ".."))
        from projects.dilly.crawl_internships_v2 import (
            JAZZHR_COMPANIES, crawl_jazzhr,
            RECRUITEE_COMPANIES, crawl_recruitee,
            BREEZYHR_COMPANIES, crawl_breezyhr,
            PINPOINT_COMPANIES, crawl_pinpoint,
        )
        for company_dict, crawl_fn, label in [
            (JAZZHR_COMPANIES, crawl_jazzhr, "jazzhr"),
            (RECRUITEE_COMPANIES, crawl_recruitee, "recruitee"),
            (BREEZYHR_COMPANIES, crawl_breezyhr, "breezyhr"),
            (PINPOINT_COMPANIES, crawl_pinpoint, "pinpoint"),
        ]:
            fetched = 0
            inserted_count = 0
            for slug, (name, industry) in company_dict.items():
                try:
                    jobs = crawl_fn(slug, name)
                    fetched += len(jobs)
                    for job in jobs:
                        item = {
                            **job,
                            "external_id": job.get("external_id", f"{label}-{slug}-{job.get('title','')}"),
                            "source_ats": label,
                            "cohorts": [],
                            "industry": industry.lower(),
                        }
                        if _upsert_listing(cur, item):
                            inserted_count += 1
                except Exception:
                    pass
            stats["sources"][label] = {"fetched": fetched, "inserted": inserted_count}
            stats["total_fetched"] += fetched
            stats["total_inserted"] += inserted_count
    except Exception as e:
        stats["errors"].append(f"new_ats_scrapers: {type(e).__name__}: {str(e)[:200]}")

    # BambooHR (tech SMBs, HR tools, design, e-commerce, cybersecurity)
    try:
        from dilly_core.job_source_bamboohr import fetch_all_bamboohr
        bamboo = fetch_all_bamboohr() or []
        inserted = sum(1 for item in bamboo if _upsert_listing(cur, item))
        stats["sources"]["bamboohr"] = {"fetched": len(bamboo), "inserted": inserted}
        stats["total_fetched"] += len(bamboo)
        stats["total_inserted"] += inserted
    except Exception as e:
        stats["errors"].append(f"bamboohr: {type(e).__name__}: {str(e)[:200]}")

    conn.commit()
    return stats


def ensure_niche_sources_populated(conn, cohort_ids: Optional[Iterable[str]] = None) -> bool:
    """
    If the internships table has zero listings from nsf_reu/usajobs, run
    ingestion inline. Used as a cold-start fallback by the feed handler
    so newly-deployed instances don't show an empty pre_health/pre_law feed
    until the nightly cron runs.

    Returns True if ingestion ran, False if the table was already populated.
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM internships "
        "WHERE source_ats IN ('nsf_reu', 'usajobs') AND status = 'active'"
    )
    row = cur.fetchone()
    try:
        count = int(row[0] if not isinstance(row, dict) else row.get("count", 0))
    except (TypeError, ValueError):
        count = 0

    if count > 0:
        return False

    ingest_niche_sources(conn)
    return True


__all__ = ["ingest_niche_sources", "ensure_niche_sources_populated"]
