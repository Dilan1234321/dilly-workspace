"""
Cron / internal endpoints. Protected by CRON_SECRET.
"""
import os, sys

from fastapi import APIRouter, Body, HTTPException, Request

router = APIRouter(prefix="/cron", tags=["cron"])

_DRAFT_CLEANUP_DAYS = 3

_DILLY_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
if _DILLY_ROOT not in sys.path:
    sys.path.insert(0, _DILLY_ROOT)


def _require_cron_secret(token: str) -> None:
    secret = os.environ.get("CRON_SECRET", "").strip()
    if not secret or (token or "").strip() != secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


@router.get("/setup-users-table", summary="One-time: create users table in PG")
def setup_users_table(token: str = ""):
    """Create the users table if it doesn't exist. Run once, then forget."""
    _require_cron_secret(token)
    from projects.dilly.api.database import get_db
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                first_name TEXT,
                last_name TEXT,
                full_name TEXT,
                major TEXT,
                minor TEXT,
                track TEXT,
                application_target TEXT,
                school TEXT,
                onboarding_complete BOOLEAN DEFAULT FALSE,
                has_run_first_audit BOOLEAN DEFAULT FALSE,
                subscribed BOOLEAN DEFAULT FALSE,
                profile_status TEXT DEFAULT 'draft',
                leaderboard_opt_in BOOLEAN DEFAULT TRUE,
                referral_code TEXT,
                voice_avatar_index INTEGER,
                profile_json JSONB,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """)
        # Add columns introduced after initial table creation
        for stmt in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS majors JSONB",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS minors JSONB",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS pre_professional_track TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS narrative_count_month INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS narrative_count_reset_date TEXT DEFAULT ''",
            # Interview feedback monthly cap (Dilly tier = 10/mo, Pro = unlimited)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS interview_count_month INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS interview_count_reset_date TEXT DEFAULT ''",
            # Resume generation monthly cap (Free=2, Dilly=30, Pro=unlimited)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_count_month INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_count_reset_date TEXT DEFAULT ''",
            # generated_resumes: ATS system the resume was formatted for + verification score
            "ALTER TABLE generated_resumes ADD COLUMN IF NOT EXISTS ats_system TEXT DEFAULT 'greenhouse'",
            "ALTER TABLE generated_resumes ADD COLUMN IF NOT EXISTS ats_parse_score INTEGER DEFAULT 0",
            "ALTER TABLE generated_resumes ADD COLUMN IF NOT EXISTS keyword_coverage_pct INTEGER DEFAULT 0",
            # Recruiter accounts (Phase 1 — 2026-04-24)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'student'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_domain TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_verified_at TIMESTAMPTZ",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_logo_url TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_jobs_count INTEGER",
            # Backfill: pull mode out of profile_json for existing student sub-modes
            """UPDATE users SET account_type = COALESCE(
                CASE WHEN profile_json->>'mode' IN ('seeker','holder')
                     THEN profile_json->>'mode' ELSE 'student' END,
                'student'
            ) WHERE account_type IS NULL OR account_type = 'student'""",
        ]:
            cur.execute(stmt)
        # -- Sessions table (auth_store) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token TEXT UNIQUE NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        # -- Verification codes table (auth_store) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS verification_codes (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                code TEXT NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        # -- Audit results table (audit_history) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_results (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                email TEXT,
                final_score INTEGER,
                smart INTEGER,
                grit INTEGER,
                build INTEGER,
                track TEXT,
                candidate_name TEXT,
                major TEXT,
                findings JSONB,
                recommendations JSONB,
                evidence JSONB,
                peer_percentiles JSONB,
                dilly_take TEXT,
                strongest_signal TEXT,
                skill_tags JSONB,
                raw_audit JSONB,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        # Add email column to audit_results if missing
        cur.execute("ALTER TABLE audit_results ADD COLUMN IF NOT EXISTS email TEXT")

        # -- Students table (scored profiles used by match engine) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS students (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                major TEXT,
                majors JSONB DEFAULT '[]',
                minors JSONB DEFAULT '[]',
                interests JSONB DEFAULT '[]',
                smart_score FLOAT,
                grit_score FLOAT,
                build_score FLOAT,
                cohort_scores JSONB DEFAULT '{}',
                preferred_cities JSONB DEFAULT '[]',
                work_mode_pref TEXT,
                track TEXT,
                cohort TEXT,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        # -- Companies table (crawled from ATS sources) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS companies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT UNIQUE NOT NULL,
                ats_type TEXT,
                industry TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        # -- Internships table (crawled listings) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS internships (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                apply_url TEXT,
                location_city TEXT,
                location_state TEXT,
                work_mode TEXT DEFAULT 'unknown',
                status TEXT DEFAULT 'active',
                source_ats TEXT,
                external_id TEXT,
                tags JSONB DEFAULT '[]',
                team TEXT,
                remote BOOLEAN DEFAULT FALSE,
                is_internship BOOLEAN DEFAULT TRUE,
                is_paid BOOLEAN,
                job_type TEXT DEFAULT 'internship',
                cohort_requirements JSONB,
                deadline TEXT,
                posted_date TEXT,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """)
        # Partial unique index for ON CONFLICT (company_id, title) WHERE status = 'active'
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS internships_company_title_active
            ON internships (company_id, title) WHERE status = 'active'
        """)

        # -- Match scores table (student <-> internship rankings) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS match_scores (
                id UUID PRIMARY KEY,
                student_id UUID REFERENCES students(id) ON DELETE CASCADE,
                internship_id UUID REFERENCES internships(id) ON DELETE CASCADE,
                rank_score FLOAT,
                readiness TEXT,
                cohort_readiness JSONB,
                location_score FLOAT,
                work_mode_score FLOAT,
                compensation_score FLOAT,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        # -- Push tokens (mobile notifications) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS push_tokens (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                token TEXT NOT NULL,
                platform TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        # -- Internship applications --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS internship_applications (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                internship_id UUID,
                status TEXT DEFAULT 'applied',
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

        # -- Profile facts (AI-extracted profile signals) --
        cur.execute("""
            CREATE TABLE IF NOT EXISTS profile_facts (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                fact_key TEXT,
                fact_value TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """)

    return {"ok": True, "message": "All tables ready"}


# ---------------------------------------------------------------------------
# Admin: promote a user to recruiter account type
#
# Use this for early partners who can't self-serve (personal email, etc.).
# Gated by DILLY_INTERNAL_KEY (same key as the internal API endpoints).
# No UI — call via curl or your admin client.
#
# curl -X POST \
#   "https://api.hellodilly.com/cron/admin/promote-to-recruiter" \
#   -H "X-Internal-Key: $DILLY_INTERNAL_KEY" \
#   -H "Content-Type: application/json" \
#   -d '{"email": "recruiter@acme.com", "company_name": "Acme Corp", "company_domain": "acme.com"}'
# ---------------------------------------------------------------------------

@router.post("/admin/promote-to-recruiter", summary="Admin: promote user to recruiter account type")
async def admin_promote_to_recruiter(request: Request, body: dict = Body(default={})):
    """Promote an existing Dilly user to account_type='recruiter'.

    Accepts optional company_name and company_domain overrides.
    Protected by X-Internal-Key header (DILLY_INTERNAL_KEY env var).
    """
    from fastapi import HTTPException as _HTTPException
    from projects.dilly.api.deps import require_internal_key
    await require_internal_key(request)

    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise _HTTPException(status_code=400, detail="'email' is required.")

    from projects.dilly.api.auth_store import (
        get_user_by_email,
        set_account_type,
        update_company_fields,
    )
    user = get_user_by_email(email)
    if not user:
        raise _HTTPException(status_code=404, detail=f"No user found with email: {email}")

    set_account_type(email, "recruiter")

    # Optionally override company fields
    company_name = (body.get("company_name") or "").strip() or None
    company_domain = (body.get("company_domain") or "").strip() or None

    if not company_domain and "@" in email:
        company_domain = email.split("@", 1)[1].strip()

    # If no name provided, try enrichment
    if not company_name and company_domain:
        try:
            from projects.dilly.api.company_enrichment import enrich_recruiter
            enrichment = enrich_recruiter(email)
            company_name = enrichment.get("company_name") or None
            update_company_fields(
                email,
                company_domain=company_domain,
                company_name=company_name,
                company_logo_url=enrichment.get("company_logo_url"),
                company_jobs_count=enrichment.get("company_jobs_count"),
            )
        except Exception:
            update_company_fields(email, company_domain=company_domain, company_name=company_name)
    else:
        update_company_fields(email, company_domain=company_domain, company_name=company_name)

    return {
        "ok": True,
        "email": email,
        "account_type": "recruiter",
        "company_domain": company_domain,
        "company_name": company_name,
        "message": f"{email} is now a recruiter account.",
    }


@router.post("/admin/demote-from-recruiter", summary="Admin: revert recruiter to student account type")
async def admin_demote_from_recruiter(request: Request, body: dict = Body(default={})):
    """Revert a recruiter account back to student. Protected by X-Internal-Key."""
    from fastapi import HTTPException as _HTTPException
    from projects.dilly.api.deps import require_internal_key
    await require_internal_key(request)

    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise _HTTPException(status_code=400, detail="'email' is required.")

    from projects.dilly.api.auth_store import set_account_type
    set_account_type(email, "student")
    return {"ok": True, "email": email, "account_type": "student"}


@router.get("/cleanup-draft-profiles", summary="Cleanup draft profiles")
def cleanup_draft_profiles(token: str = ""):
    """Delete draft profiles older than 3 days. Call from cron with ?token=CRON_SECRET."""
    _require_cron_secret(token)
    from projects.dilly.api.profile_store import delete_draft_profiles_older_than_days
    deleted = delete_draft_profiles_older_than_days(_DRAFT_CLEANUP_DAYS)
    return {"ok": True, "deleted": deleted}


@router.get("/recompute-matches", summary="Recompute match scores for all students")
def recompute_matches(token: str = ""):
    """Recompute match_scores for every student with audit scores.
    Run daily so existing users see newly scraped internships.
    Call with ?token=CRON_SECRET."""
    _require_cron_secret(token)
    from projects.dilly.match_engine import run_matching
    run_matching()
    return {"ok": True}


@router.get("/admin-delete-account", summary="Admin: permanently delete a user account by email")
def admin_delete_account(token: str = "", email: str = ""):
    """Permanently delete a user account. Protected by CRON_SECRET. Temporary admin tool."""
    _require_cron_secret(token)
    email = (email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email param required.")
    import traceback

    # 1. Profile folder + file-based data
    try:
        from projects.dilly.api.profile_store import delete_account_data
        deleted_profile = delete_account_data(email)
    except Exception:
        traceback.print_exc()
        deleted_profile = False

    # 2. PostgreSQL tables. Order matters: push_tokens FKs to students(id)
    # and has no email column of its own — delete it FIRST via a subquery
    # against students, then students, then the rest. The previous loop
    # assumed every table had an email column and blew up silently on
    # push_tokens (column doesn't exist).
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    "DELETE FROM push_tokens WHERE student_id IN (SELECT id FROM students WHERE LOWER(email) = LOWER(%s))",
                    (email,),
                )
            except Exception:
                pass
            for table in ("profile_facts", "students", "internship_applications"):
                try:
                    cur.execute(f"DELETE FROM {table} WHERE LOWER(email) = LOWER(%s)", (email,))
                except Exception:
                    pass
    except Exception:
        traceback.print_exc()

    # 3. Auth: user + sessions
    try:
        from projects.dilly.api.auth_store import delete_user_and_sessions
        delete_user_and_sessions(email)
    except Exception:
        traceback.print_exc()

    return {"ok": True, "deleted": email, "profile_deleted": deleted_profile}


@router.post("/migrate-profile", summary="Admin: upsert a profile JSON blob into PG")
async def migrate_profile(request: Request, token: str = ""):
    """Accept a full profile JSON body and upsert it into the users table via save_profile."""
    _require_cron_secret(token)
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email required in body.")
    from projects.dilly.api.profile_store import save_profile
    save_profile(email, body)
    return {"ok": True, "email": email}


@router.get("/crawl-internships", summary="Scrape internships + classify new listings")
def crawl_internships(token: str = "", sync: bool = False):
    """Scrape all ATS sources (Greenhouse, Lever, Ashby, SmartRecruiters) into
    the internships table, then run Claude classification on any new listings
    that are missing cohort_requirements.

    By default runs ASYNC in a background thread and returns immediately
    so Railway's HTTP gateway doesn't kill the request. Pass ?sync=true
    to wait for the whole crawl to finish (useful for the daily cron
    runner which doesn't have an HTTP timeout in the way).
    """
    _require_cron_secret(token)
    from projects.dilly.crawl_internships_v2 import crawl_all, classify_unclassified, get_db

    if sync:
        crawl_all()
        conn = get_db()
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        classified = classify_unclassified(conn, api_key)
        conn.close()
        return {"ok": True, "classified": classified, "mode": "sync"}

    # Async path: spawn a thread, return immediately. The crawler
    # commits to Postgres incrementally, so partial progress is always
    # preserved even if Railway restarts the worker mid-crawl.
    import threading
    def _run_crawl_bg():
        try:
            crawl_all()
        except Exception as e:
            print(f"[cron.crawl_internships] crawl_all error: {e}", flush=True)
        try:
            conn = get_db()
            api_key = os.environ.get("ANTHROPIC_API_KEY", "")
            classify_unclassified(conn, api_key)
            conn.close()
        except Exception as e:
            print(f"[cron.crawl_internships] classify error: {e}", flush=True)

    threading.Thread(target=_run_crawl_bg, daemon=True).start()
    return {"ok": True, "mode": "async", "message": "Crawl running in background. Check job counts via /v2/internships/feed or wait ~15 min."}


@router.get("/discover-boards", summary="Probe candidate slugs against Greenhouse/Lever/Ashby/Workday, persist hits")
def discover_boards_cron(
    token: str = "",
    vendor: str = "all",
    limit: int = 0,
    sync: bool = False,
):
    """Run ATS slug discovery. Persists every hit to discovered_boards
    so the next crawl picks them up. Candidate list lives in
    api/ingest/candidate_slugs.py (~900 slugs today).

    Query params:
      - vendor: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'all' (default)
      - limit:  max slugs to probe per vendor (0 = no cap)
      - sync:   false (default) -> run in background thread, return
                immediately. true -> caller blocks for completion (used
                for local testing; Railway's HTTP gateway times out at
                ~30s so sync=true will 500 on large vendors).

    Greenhouse ~3 min per 1k probes; Workday ~8 min (up to 16 variants
    per slug). ALWAYS use sync=false in prod; poll /cron/discovery-stats
    to see progress.
    """
    _require_cron_secret(token)
    from projects.dilly.api.ingest.candidate_slugs import CANDIDATE_SLUGS
    from projects.dilly.api.ingest.slug_discovery import (
        discover_greenhouse, discover_lever, discover_ashby, discover_workday,
    )

    cap = int(limit) if limit and int(limit) > 0 else None
    v = (vendor or "all").lower().strip()

    def _run_all():
        try:
            if v in ("greenhouse", "all"):
                r = discover_greenhouse(CANDIDATE_SLUGS, limit=cap)
                print(f"[discover-boards] {r}", flush=True)
            if v in ("lever", "all"):
                r = discover_lever(CANDIDATE_SLUGS, limit=cap)
                print(f"[discover-boards] {r}", flush=True)
            if v in ("ashby", "all"):
                r = discover_ashby(CANDIDATE_SLUGS, limit=cap)
                print(f"[discover-boards] {r}", flush=True)
            if v in ("workday", "all"):
                wd_cap = cap or 200
                r = discover_workday(CANDIDATE_SLUGS, limit=wd_cap)
                print(f"[discover-boards] {r}", flush=True)
        except Exception as e:
            import sys as _s, traceback as _tb
            _s.stderr.write(f"[discover-boards] fatal: {type(e).__name__}: {e}\n")
            _tb.print_exc(file=_s.stderr)

    if sync:
        _run_all()
        return {"ok": True, "mode": "sync"}

    import threading
    threading.Thread(target=_run_all, daemon=True).start()
    return {
        "ok": True,
        "mode": "async",
        "vendor": v,
        "candidate_count": len(CANDIDATE_SLUGS),
        "message": "Discovery running in background. Poll /cron/discovery-stats to see hits as they land, or tail Railway logs.",
    }


@router.get("/discovery-stats", summary="Show persisted discovered_boards counts by vendor")
def discovery_stats(token: str = ""):
    """Report how many boards the discovery pass has persisted so far
    per vendor. Zero-cost — just a COUNT over the discovered_boards
    table."""
    _require_cron_secret(token)
    from projects.dilly.api.ingest.slug_discovery import _get_db, ensure_discovered_boards_table
    ensure_discovered_boards_table()
    conn = _get_db()
    try:
        import psycopg2.extras
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT vendor, COUNT(*) as n, SUM(job_count_sample) as jobs "
                "FROM discovered_boards GROUP BY vendor ORDER BY vendor"
            )
            rows = [dict(r) for r in cur.fetchall()]
            # Recent hits for quick visual check
            cur.execute(
                "SELECT vendor, slug, display_name, job_count_sample, last_seen_at "
                "FROM discovered_boards ORDER BY last_seen_at DESC LIMIT 20"
            )
            recent = [dict(r) for r in cur.fetchall()]
        # Convert timestamps for JSON serialization
        for r in recent:
            if r.get("last_seen_at"):
                r["last_seen_at"] = r["last_seen_at"].isoformat()
        return {"by_vendor": rows, "recent_20": recent}
    finally:
        conn.close()


@router.get("/ingest-quality-sweep", summary="Dedup + stale + spam + reclassify the internships table")
def ingest_quality_sweep(token: str = "", sync: bool = False):
    """Run the full ingest quality pipeline:
      1. Fingerprint dedup (cross-source same-job merge)
      2. Stale pruning (posted_date > 45 days -> expired)
      3. Spam filter (MLM / scam patterns -> spam)
      4. Level classifier sweep (fill job_type=NULL/'other' rows)

    Async by default — takes 1-3 minutes on a 100k-row table which
    exceeds Railway's HTTP gateway timeout. Use sync=true only for
    local testing. Idempotent."""
    _require_cron_secret(token)
    from projects.dilly.api.ingest.quality_pipeline import run_all
    if sync:
        stats = run_all()
        return {"ok": True, "mode": "sync", "stats": stats}

    import threading
    def _bg():
        try:
            stats = run_all()
            print(f"[ingest-quality-sweep] {stats}", flush=True)
        except Exception as e:
            import sys as _s, traceback as _tb
            _s.stderr.write(f"[ingest-quality-sweep] fatal: {type(e).__name__}: {e}\n")
            _tb.print_exc(file=_s.stderr)

    threading.Thread(target=_bg, daemon=True).start()
    return {
        "ok": True,
        "mode": "async",
        "message": "Quality sweep running in background. Tail Railway logs or query /v2/internships/feed for active counts.",
    }


@router.get("/reclassify-job-types", summary="Backfill job_type for ALL active rows with the current classifier")
def reclassify_job_types(token: str = "", sync: bool = False):
    """Re-run the level classifier on every active internship row.
    Unlike the quality-sweep's pass_reclassify_levels (which only fills
    NULL/'other' rows), this overwrites every active row so classifier
    improvements take effect immediately across the full feed.

    Returns before/after distribution by job_type plus per-cohort counts.
    Pass sync=true to wait for completion (slow on large tables — use for
    manual runs; leave async for cron calls)."""
    _require_cron_secret(token)
    from projects.dilly.api.ingest.quality_pipeline import pass_reclassify_all_levels
    from projects.dilly.api.database import get_db as _get_db_ctx

    def _run():
        with _get_db_ctx() as conn:
            result = pass_reclassify_all_levels(conn)
            # Append per-cohort internship count for reporting
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        cr->>'cohort' AS cohort,
                        job_type,
                        COUNT(*) AS cnt
                    FROM internships,
                         LATERAL jsonb_array_elements(cohort_requirements) AS cr
                    WHERE status='active'
                    GROUP BY cohort, job_type
                    ORDER BY cohort, job_type
                    """
                )
                rows = cur.fetchall()
            result["cohort_breakdown"] = [
                {"cohort": r[0], "job_type": r[1], "count": r[2]} for r in rows
            ]
        return result

    if sync:
        return {"ok": True, "result": _run()}

    import threading
    threading.Thread(target=_run, daemon=True).start()
    return {"ok": True, "mode": "async", "message": "Reclassification running in background."}


@router.get("/crawl-niche-sources", summary="Scrape NSF REU + USAJobs into internships table")
def crawl_niche_sources(token: str = ""):
    """Run the niche-source ingester (NSF REU for pre-health/science research,
    USAJobs for pre-law + federal entry-level) and upsert into the internships
    table. Intended to run once per day alongside /crawl-internships."""
    _require_cron_secret(token)
    from projects.dilly.api.database import get_db as _get_db_ctx
    from dilly_core.job_source_ingest import ingest_niche_sources
    with _get_db_ctx() as conn:
        stats = ingest_niche_sources(conn)
    return {"ok": True, "stats": stats}


@router.get("/dedup-jobs", summary="Dedup + quality gate on internship listings")
def dedup_jobs(token: str = ""):
    """Remove exact-match duplicates and jobs without descriptions.
    Call with ?token=CRON_SECRET. Run daily after crawl."""
    _require_cron_secret(token)
    from projects.dilly.api.scripts.dedup_jobs import dedup_exact, enforce_quality_gate, _get_db
    conn = _get_db()
    try:
        deduped = dedup_exact(conn)
        gated = enforce_quality_gate(conn)
        return {"ok": True, "duplicates_removed": deduped, "quality_gate_removed": gated}
    finally:
        conn.close()


@router.get("/rescore-jobs", summary="Rescore all jobs missing S/G/B requirements")
def rescore_jobs(token: str = ""):
    """Run the job rescoring engine on all active jobs with cohort_requirements
    but missing per-cohort S/G/B scores. Call with ?token=CRON_SECRET."""
    _require_cron_secret(token)
    _SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(_SCRIPT_DIR, "..", "scripts", "rescore_jobs.py")
    import subprocess
    result = subprocess.run(
        [sys.executable, script_path],
        capture_output=True, text=True, timeout=600
    )
    return {"ok": result.returncode == 0, "output": result.stdout[-2000:] if result.stdout else result.stderr[-500:]}


@router.get("/apply-job-attributes-migration", summary="One-time: add degree_required column + indexes")
def apply_job_attributes_migration(token: str = ""):
    """Idempotent bootstrap: runs 20260417_job_attributes.sql. Safe to hit
    multiple times — uses IF NOT EXISTS on every DDL. Call once after
    deploying this build, then forget.

    Why this lives in /cron instead of a startup hook: schema changes
    shouldn't happen on every server boot. Manual trigger keeps the
    application layer dumb about migrations."""
    _require_cron_secret(token)
    from projects.dilly.api.database import get_db
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            ALTER TABLE internships
                ADD COLUMN IF NOT EXISTS degree_required TEXT,
                ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_internships_unclassified_degree
                ON internships (created_at DESC)
                WHERE degree_required IS NULL AND status = 'active'
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_internships_no_degree
                ON internships (created_at DESC)
                WHERE degree_required IN ('not_required', 'unclear') AND status = 'active'
        """)
        # v2: h1b_sponsor + fair_chance columns
        cur.execute("""
            ALTER TABLE internships
                ADD COLUMN IF NOT EXISTS h1b_sponsor TEXT,
                ADD COLUMN IF NOT EXISTS fair_chance TEXT
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_internships_h1b
                ON internships (created_at DESC)
                WHERE h1b_sponsor IN ('sponsors', 'unclear') AND status = 'active'
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_internships_fair_chance
                ON internships (created_at DESC)
                WHERE fair_chance IN ('fair_chance', 'unclear') AND status = 'active'
        """)
        conn.commit()
    return {"ok": True, "migrations": ["20260417_job_attributes", "20260417_job_attributes_v2"]}


@router.get("/backfill-company-websites", summary="Populate companies.website for existing rows")
def backfill_company_websites(token: str = "", limit: int = 500):
    """Walk companies rows with NULL website and set website = <slug>.com
    where slug = lowercase-name with non-alphanumerics removed. This
    unblocks the Clearbit logo pipeline for the ~10k companies the
    app scraped before the crawler learned to populate the column.

    Conservative by design: only touches rows where website IS NULL.
    Never overwrites manually curated values. Pass ?limit=N to
    control batch size per call.
    """
    _require_cron_secret(token)
    import re as _re
    from projects.dilly.api.database import get_db
    updated = 0
    skipped = 0
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name FROM companies WHERE website IS NULL ORDER BY name LIMIT %s",
            (int(limit),),
        )
        rows = cur.fetchall()
        for row in rows:
            cid, name = row[0], row[1]
            if not name:
                skipped += 1
                continue
            slug = _re.sub(r"[^a-z0-9]", "", str(name).lower().strip())
            if not slug or len(slug) < 3:
                skipped += 1
                continue
            cur.execute(
                "UPDATE companies SET website = %s WHERE id = %s AND website IS NULL",
                (f"{slug}.com", cid),
            )
            updated += 1
        conn.commit()
    return {"ok": True, "updated": updated, "skipped": skipped, "hint": "call repeatedly until updated=0"}


@router.get("/classify-jobs", summary="Classify un-classified active internships (degree requirement)")
def classify_jobs(token: str = "", max: int = 200):
    """Run the attribute classifier on active internships with NULL
    degree_required. Capped at ?max=N per call (default 200) so a single
    run has predictable duration + Anthropic cost.

    Intended to be called daily after /crawl-internships so any fresh
    rows get a degree verdict within one cron cycle. Safe to call more
    often if we're catching up a backlog."""
    _require_cron_secret(token)
    from projects.dilly.api.scripts.classify_job_attributes import run
    try:
        stats = run(max_rows=max)
        return stats
    except Exception as e:
        return {"ok": False, "error": str(e)[:500]}


@router.get("/backfill-ats-detection", summary="Detect real ATS from apply_url + update source_ats for aggregator rows")
def backfill_ats_detection(token: str = "", limit: int = 5000):
    """Re-detect the real ATS (Greenhouse/Lever/Workday/etc.) from apply_url
    for jobs that came through aggregators (simplify, remoteok, weworkremotely)
    or that have source_ats='unknown'. Updates source_ats in-place so the
    resume tailorer uses the correct ATS formatting rules.

    Safe to run multiple times — only touches rows where source_ats is an
    aggregator or unknown. ?limit=N controls max rows per call (default 5000).
    Call with ?token=CRON_SECRET."""
    _require_cron_secret(token)
    from projects.dilly.api.database import get_db as _get_db_ctx
    try:
        from dilly_core.ats_detector import detect_ats_or_keep
    except ImportError:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        from dilly_core.ats_detector import detect_ats_or_keep

    AGGREGATORS = ("simplify", "remoteok", "weworkremotely", "unknown", "")
    updated = 0
    errors = 0
    with _get_db_ctx() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, apply_url, source_ats
            FROM internships
            WHERE status = 'active'
              AND (source_ats IS NULL OR source_ats = ANY(%s))
            LIMIT %s
            """,
            (list(AGGREGATORS), int(limit)),
        )
        rows = cur.fetchall()
        for row in rows:
            rid = row[0] if not isinstance(row, dict) else row["id"]
            url = row[1] if not isinstance(row, dict) else row["apply_url"]
            existing = row[2] if not isinstance(row, dict) else row["source_ats"]
            try:
                new_ats = detect_ats_or_keep(url or "", existing or "")
                if new_ats != existing:
                    cur.execute(
                        "UPDATE internships SET source_ats = %s WHERE id = %s",
                        (new_ats, rid),
                    )
                    updated += 1
            except Exception:
                errors += 1
        conn.commit()
    return {"ok": True, "rows_checked": len(rows), "updated": updated, "errors": errors}


@router.get("/daily-pipeline", summary="Run full daily job pipeline: scrape → dedup → rescore → classify")
def daily_pipeline(token: str = ""):
    """Master endpoint: runs the full daily job pipeline in order.
    1. Scrape all ATS sources
    2. Scrape niche sources
    3. Dedup + quality gate
    4. Rescore any new unscored jobs
    5. Classify job attributes (degree requirement, etc.) on newly-ingested
       rows so filters on Jobs page are accurate same-day.

    Call with ?token=CRON_SECRET. Intended to run once per day."""
    _require_cron_secret(token)
    results = {}

    # 1. Scrape. Run sync here — the daily-pipeline endpoint itself is
    # called from APScheduler inside the FastAPI process and doesn't
    # route through the Railway HTTP gateway, so there's no request
    # timeout to dodge.
    try:
        r = crawl_internships(token=token, sync=True)
        results["crawl"] = r
    except Exception as e:
        results["crawl"] = {"error": str(e)}

    # 2. Niche sources
    try:
        r = crawl_niche_sources(token=token)
        results["niche"] = r
    except Exception as e:
        results["niche"] = {"error": str(e)}

    # 3. Dedup
    try:
        r = dedup_jobs(token=token)
        results["dedup"] = r
    except Exception as e:
        results["dedup"] = {"error": str(e)}

    # 4. Rescore — DISABLED. The S/G/B per-cohort scoring framework is
    #    retired (no longer user-facing). The rescore_jobs endpoint still
    #    exists for manual backfill if we ever need to replay historical
    #    data, but we don't run it nightly anymore. Saves a Haiku call
    #    per active job every day.
    results["rescore"] = {"skipped": "cohort scoring retired"}

    # 5. Classify (degree requirement, etc.). Capped per run so a full
    #    daily pipeline never runs a huge Anthropic bill on a backlog.
    try:
        r = classify_jobs(token=token, max=300)
        results["classify"] = r
    except Exception as e:
        results["classify"] = {"error": str(e)}

    # 6. Backfill ATS detection — fix source_ats for aggregator rows so
    #    resume tailoring uses the correct ATS formatting rules.
    try:
        r = backfill_ats_detection(token=token, limit=5000)
        results["ats_detection"] = r
    except Exception as e:
        results["ats_detection"] = {"error": str(e)}

    return {"ok": True, "pipeline": results}


# ── AI Arena Phase 2 ─────────────────────────────────────────────────────────
# Cohort → role_cluster search terms (used by regenerate-cohort-skills to find
# relevant active postings for each cohort's skill-list generation).
_AI_ARENA_COHORT_ROLE_TERMS: dict[str, list[str]] = {
    "Software Engineering & CS": ["software engineer", "software developer", "backend engineer", "frontend engineer", "full stack engineer"],
    "Data Science & Analytics": ["data analyst", "data scientist", "analytics engineer", "business analyst", "bi analyst"],
    "Cybersecurity & IT": ["security engineer", "cybersecurity analyst", "it analyst", "information security analyst"],
    "Finance & Accounting": ["financial analyst", "investment banking analyst", "accountant", "finance analyst", "auditor"],
    "Consulting & Strategy": ["consultant", "strategy analyst", "management consultant", "business analyst"],
    "Marketing & Advertising": ["marketing manager", "marketing analyst", "digital marketing specialist", "brand manager", "growth marketer"],
    "Management & Operations": ["operations analyst", "operations manager", "project manager", "supply chain analyst", "program manager"],
    "Healthcare & Clinical": ["nurse", "clinical researcher", "medical assistant", "healthcare analyst", "clinical coordinator"],
    "Biotech & Pharmaceutical": ["biomedical researcher", "research scientist", "lab scientist", "pharmaceutical analyst"],
    "Life Sciences & Research": ["research scientist", "lab researcher", "environmental scientist", "research assistant"],
    "Electrical & Computer Engineering": ["electrical engineer", "hardware engineer", "embedded systems engineer"],
    "Mechanical & Aerospace Engineering": ["mechanical engineer", "aerospace engineer", "design engineer"],
    "Civil & Environmental Engineering": ["civil engineer", "environmental engineer", "structural engineer"],
    "Chemical & Biomedical Engineering": ["chemical engineer", "biomedical engineer", "process engineer"],
    "Economics & Public Policy": ["public policy analyst", "economist", "policy analyst", "economic analyst"],
    "Law & Government": ["lawyer", "legal analyst", "policy analyst", "paralegal"],
    "Media & Communications": ["journalist", "communications manager", "content strategist", "media analyst", "copywriter"],
    "Design & Creative Arts": ["designer", "ux designer", "graphic designer", "product designer", "ui designer"],
    "Education & Human Development": ["teacher", "education consultant", "instructional designer"],
    "Social Sciences & Nonprofit": ["program coordinator", "nonprofit analyst", "social worker", "community manager"],
    "Entrepreneurship & Innovation": ["entrepreneur", "product manager", "startup founder", "venture analyst"],
    "Physical Sciences & Math": ["quantitative analyst", "math researcher", "physicist", "computational scientist"],
    "Sports & Athletic Performance": ["sports analyst", "athletic trainer", "sports medicine", "performance coach"],
}


@router.get("/setup-ai-arena-tables", summary="One-time: add AI Arena Phase 2 schema (idempotent)")
def setup_ai_arena_tables(token: str = ""):
    """Add ai_fluency + role_cluster to internships, create cohort_skill_lists
    table, and create aggregation indexes. All DDL uses IF NOT EXISTS so safe
    to re-run. Call once after deploying this build, then forget."""
    _require_cron_secret(token)
    import traceback
    from projects.dilly.api.database import get_db

    stmts = [
        # New nullable columns on internships (safe — existing rows get NULL)
        "ALTER TABLE internships ADD COLUMN IF NOT EXISTS ai_fluency TEXT",
        "ALTER TABLE internships ADD COLUMN IF NOT EXISTS role_cluster TEXT",
        # Partial indexes for aggregation queries (only active rows)
        "CREATE INDEX IF NOT EXISTS idx_internships_ai_fluency ON internships (ai_fluency) WHERE status = 'active'",
        "CREATE INDEX IF NOT EXISTS idx_internships_role_cluster ON internships (role_cluster) WHERE status = 'active'",
        "CREATE INDEX IF NOT EXISTS idx_internships_cohort_ai ON internships (role_cluster, ai_fluency) WHERE status = 'active'",
        # Versioned per-cohort skill lists
        """CREATE TABLE IF NOT EXISTS cohort_skill_lists (
    month   TEXT  NOT NULL,
    cohort  TEXT  NOT NULL,
    skill   TEXT  NOT NULL,
    weight  FLOAT NOT NULL DEFAULT 1.0,
    PRIMARY KEY (month, cohort, skill)
)""",
        "CREATE INDEX IF NOT EXISTS idx_cohort_skill_lists_cohort ON cohort_skill_lists (cohort, month DESC)",
    ]

    results = []
    with get_db() as conn:
        cur = conn.cursor()
        for stmt in stmts:
            try:
                cur.execute(stmt)
                results.append({"stmt": stmt.strip()[:80], "ok": True})
            except Exception as e:
                traceback.print_exc()
                results.append({"stmt": stmt.strip()[:80], "ok": False, "error": str(e)[:200]})
    return {"ok": True, "migrations": results}


@router.get("/classify-roles", summary="Classify role_cluster + ai_fluency for un-classified active internships")
def classify_roles(token: str = "", max: int = 200):
    """Batch-classify internships WHERE role_cluster IS NULL using Haiku.
    Resumable — processes at most ?max=N rows per call then commits.
    ~$0.0003/row. Safe to call repeatedly; only touches unclassified rows.

    After completion, invalidates the field-intel in-process cache so
    the next /ai-arena/field-intel request reflects the new data."""
    _require_cron_secret(token)
    import json as _json
    import traceback
    import anthropic as _anthropic
    from projects.dilly.api.database import get_db

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"ok": False, "error": "ANTHROPIC_API_KEY not set"}

    classified = 0
    errors = 0
    skipped = 0

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, title, description
            FROM internships
            WHERE role_cluster IS NULL
              AND status = 'active'
              AND title IS NOT NULL
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (int(max),),
        )
        rows = cur.fetchall()

        if not rows:
            return {
                "ok": True, "classified": 0, "errors": 0, "skipped": 0,
                "total_fetched": 0, "message": "No unclassified rows found.",
            }

        client = _anthropic.Anthropic(api_key=api_key)
        update_cur = conn.cursor()

        for row in rows:
            rid, title, description = row[0], row[1], row[2]
            if not title:
                skipped += 1
                continue
            jd_snippet = f"Title: {title}\n{(description or '')[:600]}"
            try:
                resp = client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=120,
                    system=(
                        "Classify this job into ONE coarse role cluster and rate its AI fluency. "
                        "Return ONLY valid JSON, no markdown fences: "
                        "{\"role_cluster\": \"...\", \"ai_fluency\": \"low|medium|high\"}\n"
                        "role_cluster: short lowercase label, e.g. 'software engineer', 'data analyst', "
                        "'ml engineer', 'product manager', 'investment banking analyst', "
                        "'marketing manager', 'financial analyst', 'consultant', 'ux designer', "
                        "'operations analyst', 'research scientist', 'nurse', 'lawyer', 'accountant', "
                        "'civil engineer', 'mechanical engineer', 'biomedical researcher', "
                        "'public policy analyst', 'journalist', 'entrepreneur'\n"
                        "ai_fluency: how central is AI/ML tooling in the JD? "
                        "low=not mentioned, medium=useful but optional, high=core to the role"
                    ),
                    messages=[{"role": "user", "content": jd_snippet}],
                )
                raw = resp.content[0].text.strip()
                if "```" in raw:
                    parts = raw.split("```")
                    raw = parts[1] if len(parts) > 1 else parts[0]
                    if raw.startswith("json"):
                        raw = raw[4:]
                    raw = raw.strip()
                data = _json.loads(raw)
                rc = str(data.get("role_cluster") or "").strip().lower()[:100]
                af = str(data.get("ai_fluency") or "low").strip().lower()
                if af not in ("low", "medium", "high"):
                    af = "low"
                if rc:
                    update_cur.execute(
                        "UPDATE internships SET role_cluster = %s, ai_fluency = %s WHERE id = %s",
                        (rc, af, rid),
                    )
                    classified += 1
                else:
                    skipped += 1
            except _json.JSONDecodeError:
                skipped += 1
            except Exception:
                traceback.print_exc()
                errors += 1

        conn.commit()

    try:
        from projects.dilly.api.routers.ai_arena import _invalidate_field_intel_cache
        _invalidate_field_intel_cache()
    except Exception:
        pass

    return {
        "ok": True,
        "classified": classified,
        "errors": errors,
        "skipped": skipped,
        "total_fetched": len(rows),
    }


@router.get("/regenerate-cohort-skills", summary="Generate per-cohort AI-resilient skill lists for this month")
def regenerate_cohort_skills(token: str = "", max_postings_per_cohort: int = 25):
    """For each of the 23 cohorts, find active postings with medium/high
    AI-tooling demand, extract top 10-15 AI-resilient skills via Haiku,
    and write to cohort_skill_lists (month, cohort, skill, weight).

    Month-keyed so we can track skill drift over time. Upserts on conflict
    so re-running a month is safe. After completion, invalidates the
    field-intel cache.

    Call monthly (or after a large crawl) with ?token=CRON_SECRET."""
    _require_cron_secret(token)
    import json as _json
    import traceback
    import datetime as _dt
    import anthropic as _anthropic
    import psycopg2.extras
    from projects.dilly.api.database import get_db
    from projects.dilly.api.cohort_scorer import COHORT_CRITERIA

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"ok": False, "error": "ANTHROPIC_API_KEY not set"}

    month = _dt.datetime.utcnow().strftime("%Y-%m")
    client = _anthropic.Anthropic(api_key=api_key)
    results: dict = {}

    with get_db() as conn:
        read_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        write_cur = conn.cursor()

        for cohort in COHORT_CRITERIA.keys():
            role_terms = _AI_ARENA_COHORT_ROLE_TERMS.get(cohort, [])
            try:
                if role_terms:
                    read_cur.execute(
                        """
                        SELECT title, description
                        FROM internships
                        WHERE status = 'active'
                          AND ai_fluency IN ('medium', 'high')
                          AND role_cluster = ANY(%s)
                        ORDER BY created_at DESC
                        LIMIT %s
                        """,
                        (role_terms, int(max_postings_per_cohort)),
                    )
                else:
                    read_cur.execute(
                        """
                        SELECT title, description
                        FROM internships
                        WHERE status = 'active'
                          AND ai_fluency IN ('medium', 'high')
                        ORDER BY created_at DESC
                        LIMIT %s
                        """,
                        (int(max_postings_per_cohort),),
                    )
                rows = read_cur.fetchall()

                if not rows:
                    results[cohort] = {"skipped": "no ai-fluent postings found", "skills_written": 0}
                    continue

                jd_text = "\n---\n".join(
                    f"Title: {r['title']}\n{(r['description'] or '')[:400]}"
                    for r in rows[:15]
                )

                resp = client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=500,
                    system=(
                        f"You are a career advisor analyzing job postings for the '{cohort}' field. "
                        "Extract the top 10-15 skills that are AI-resilient — things humans must bring "
                        "because AI cannot fully replace them (e.g. stakeholder management, domain "
                        "judgment, client relationships, creative direction, ethical oversight, "
                        "field-specific expertise, physical presence). Avoid generic buzzwords. "
                        "Return ONLY valid JSON array, no markdown: "
                        "[{\"skill\": \"...\", \"weight\": 0.0-1.0}] sorted by weight descending. "
                        "weight=1.0 for the most critical, 0.5 for moderate importance."
                    ),
                    messages=[{"role": "user", "content": f"Job postings:\n{jd_text}"}],
                )
                raw = resp.content[0].text.strip()
                if "```" in raw:
                    parts = raw.split("```")
                    raw = parts[1] if len(parts) > 1 else parts[0]
                    if raw.startswith("json"):
                        raw = raw[4:]
                    raw = raw.strip()

                skill_list = _json.loads(raw)
                if not isinstance(skill_list, list):
                    results[cohort] = {"error": "non-list response from Haiku", "skills_written": 0}
                    continue

                written = 0
                for item in skill_list[:15]:
                    skill = str(item.get("skill") or "").strip()[:200]
                    try:
                        weight = max(0.0, min(1.0, float(item.get("weight") or 0.5)))
                    except (TypeError, ValueError):
                        weight = 0.5
                    if not skill:
                        continue
                    write_cur.execute(
                        """
                        INSERT INTO cohort_skill_lists (month, cohort, skill, weight)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (month, cohort, skill) DO UPDATE SET weight = EXCLUDED.weight
                        """,
                        (month, cohort, skill, weight),
                    )
                    written += 1
                results[cohort] = {"skills_written": written}

            except _json.JSONDecodeError:
                results[cohort] = {"error": "bad JSON from Haiku", "skills_written": 0}
            except Exception as e:
                traceback.print_exc()
                results[cohort] = {"error": str(e)[:200], "skills_written": 0}

        conn.commit()

    try:
        from projects.dilly.api.routers.ai_arena import _invalidate_field_intel_cache
        _invalidate_field_intel_cache()
    except Exception:
        pass

    total_written = sum(
        v.get("skills_written", 0) for v in results.values() if isinstance(v, dict)
    )
    return {"ok": True, "month": month, "total_skills_written": total_written, "cohorts": results}


@router.get(
    "/setup-chapter-tables",
    summary="One-time: create chapter advisor tables and add users columns",
)
def setup_chapter_tables(token: str = ""):
    """
    Materialize the Chapter advisor schema — Phase 2.

    Creates:
      - chapter_recaps
      - chapter_sessions
      - chapter_messages

    Adds columns to users:
      - chapter_cadence, next_chapter_at,
        chapter_calendar_event_id, chapter_total_sessions

    All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS for columns).
    Run once after deploy. Never called automatically at startup.
    """
    _require_cron_secret(token)
    from projects.dilly.api.database import get_db

    results = {}
    try:
        with get_db() as conn:
            cur = conn.cursor()

            # 1. chapter_recaps (no FK to sessions — avoids circular dep)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chapter_recaps (
                    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    session_id              UUID NOT NULL,
                    user_id                 TEXT NOT NULL,
                    headline                TEXT NOT NULL DEFAULT '',
                    observations            TEXT[] NOT NULL DEFAULT '{}',
                    commitment              TEXT NOT NULL DEFAULT '',
                    commitment_deadline     DATE,
                    between_sessions_prompt TEXT NOT NULL DEFAULT '',
                    next_chapter_at         TIMESTAMPTZ,
                    render_json             JSONB,
                    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_chapter_recaps_user "
                "ON chapter_recaps(user_id, created_at DESC)"
            )
            results["chapter_recaps"] = "ok"

            # 2. chapter_sessions (FK to chapter_recaps.id for recap_id)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chapter_sessions (
                    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id           TEXT NOT NULL,
                    persona_at_time   TEXT NOT NULL DEFAULT 'student',
                    is_first_session  BOOLEAN NOT NULL DEFAULT false,
                    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
                    completed_at      TIMESTAMPTZ,
                    screens_completed INTEGER NOT NULL DEFAULT 0,
                    recap_id          UUID,
                    calendar_event_id TEXT,
                    intake_json       JSONB,
                    arena_snapshot    JSONB,
                    screen_captures   JSONB DEFAULT '{}',
                    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_chapter_sessions_user "
                "ON chapter_sessions(user_id, started_at DESC)"
            )
            results["chapter_sessions"] = "ok"

            # 3. chapter_messages
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chapter_messages (
                    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    session_id   UUID NOT NULL,
                    screen_index INTEGER NOT NULL DEFAULT 0,
                    role         TEXT NOT NULL DEFAULT 'user',
                    content      TEXT NOT NULL DEFAULT '',
                    ts           TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_chapter_messages_session "
                "ON chapter_messages(session_id, screen_index, ts)"
            )
            results["chapter_messages"] = "ok"

            # 4. Add columns to users table
            for stmt in [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS chapter_cadence TEXT DEFAULT 'weekly'",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS next_chapter_at TIMESTAMPTZ",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS chapter_calendar_event_id TEXT",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS chapter_total_sessions INTEGER NOT NULL DEFAULT 0",
            ]:
                cur.execute(stmt)
            results["users_columns"] = "ok"

        return {"ok": True, "tables": results}
    except Exception as exc:
        import traceback as _tb
        _tb.print_exc()
        return {"ok": False, "error": str(exc)[:500]}


@router.get(
    "/purge-llm-usage-log",
    summary="Daily: purge llm_usage_log rows older than 90 days",
)
def purge_llm_usage_log(token: str = "", retention_days: int = 90):
    """Daily cron target. Deletes per-call rows older than `retention_days`
    so the ledger stays bounded. Idempotent. Aggregates can be rolled
    up into a separate monthly table later if we need longer history.

    Call this once per day. No LLM, pure SQL delete."""
    _require_cron_secret(token)
    try:
        from projects.dilly.api.llm_usage_log import purge_old_rows
        n = purge_old_rows(retention_days=max(7, min(365, int(retention_days))))
        return {"ok": True, "purged": n, "retention_days": retention_days}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/backfill-transcript-facts", summary="One-shot: fan transcript data from profile_json into profile_facts")
def backfill_transcript_facts(token: str = ""):
    """Scan every user whose profile_json has transcript_uploaded_at set and upsert
    profile_facts rows for courses, GPA, major, minor, honors, and school.
    Idempotent — ON CONFLICT DO UPDATE means re-running is safe."""
    _require_cron_secret(token)
    import json as _json
    try:
        from projects.dilly.api.database import get_db
        from projects.dilly.api.routers.profile import _fan_out_transcript_facts
        processed = 0
        errors = 0
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT email, profile_json FROM users WHERE profile_json->>'transcript_uploaded_at' IS NOT NULL"
            )
            rows = cur.fetchall()
        for row in rows:
            try:
                email = row[0]
                pj = row[1] or {}
                if isinstance(pj, str):
                    pj = _json.loads(pj)
                courses = pj.get("transcript_courses") or []
                if isinstance(courses, str):
                    courses = _json.loads(courses)
                _fan_out_transcript_facts(
                    email,
                    gpa=pj.get("transcript_gpa"),
                    bcpm_gpa=pj.get("transcript_bcpm_gpa"),
                    major=pj.get("transcript_major"),
                    minor=pj.get("transcript_minor"),
                    honors=pj.get("transcript_honors"),
                    courses=courses,
                    school=pj.get("transcript_school"),
                )
                processed += 1
            except Exception:
                errors += 1
        return {"ok": True, "processed": processed, "errors": errors}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/backfill-resume-facts", summary="Re-run LLM resume fact extraction for all uploaded resumes")
def backfill_resume_facts(token: str = ""):
    """Scan every user who has resume_uploaded_at + resume_text in their profile and
    kick off _fan_out_resume_facts for each. Idempotent (ON CONFLICT DO UPDATE).
    Fan-out runs in background threads per user; this endpoint returns immediately."""
    _require_cron_secret(token)
    import json as _json
    try:
        from projects.dilly.api.database import get_db
        from projects.dilly.api.routers.profile import _fan_out_resume_facts
        processed = 0
        errors_count = 0
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT email, profile_json FROM users "
                "WHERE profile_json->>'resume_uploaded_at' IS NOT NULL "
                "  AND profile_json->>'resume_text' IS NOT NULL"
            )
            rows = cur.fetchall()
        for row in rows:
            try:
                email = row[0]
                pj = row[1] or {}
                if isinstance(pj, str):
                    pj = _json.loads(pj)
                resume_text = pj.get("resume_text") or ""
                if not resume_text:
                    continue
                name = pj.get("resume_name") or pj.get("first_name") or ""
                _fan_out_resume_facts(email, resume_text, name)
                processed += 1
            except Exception:
                errors_count += 1
        return {"ok": True, "processed": processed, "errors": errors_count,
                "note": "fan-out runs in background; check profile_facts for results"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/healthcheck-deps", summary="Verify parsing deps are installed")
def healthcheck_deps(token: str = ""):
    """Check that pypdf and pymupdf (fitz) are importable in the deployed environment."""
    _require_cron_secret(token)
    results = {}
    for pkg, import_name in [("pypdf", "pypdf"), ("pymupdf", "fitz"), ("docx2txt", "docx2txt")]:
        try:
            mod = __import__(import_name)
            results[pkg] = {"ok": True, "version": getattr(mod, "__version__", "unknown")}
        except ImportError as e:
            results[pkg] = {"ok": False, "error": str(e)}
    return {"deps": results, "all_ok": all(v["ok"] for v in results.values())}
