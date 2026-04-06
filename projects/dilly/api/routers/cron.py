"""
Cron / internal endpoints. Protected by CRON_SECRET.
"""
import os, sys

from fastapi import APIRouter, HTTPException, Request

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

    # 2. PostgreSQL tables
    try:
        from projects.dilly.api.database import get_db
        with get_db() as conn:
            cur = conn.cursor()
            for table in ("profile_facts", "students", "push_tokens", "internship_applications"):
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
def crawl_internships(token: str = ""):
    """Scrape all ATS sources (Greenhouse, Lever, Ashby, SmartRecruiters) into
    the internships table, then run Claude classification on any new listings
    that are missing cohort_requirements.
    Call with ?token=CRON_SECRET. Intended to run once per day."""
    _require_cron_secret(token)
    from projects.dilly.crawl_internships_v2 import crawl_all, classify_unclassified, get_db
    crawl_all()
    conn = get_db()
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    classified = classify_unclassified(conn, api_key)
    conn.close()
    return {"ok": True, "classified": classified}
