"""
Cron / internal endpoints. Protected by CRON_SECRET.
"""
import os, sys

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/cron", tags=["cron"])

_DRAFT_CLEANUP_DAYS = 3

_DILLY_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
if _DILLY_ROOT not in sys.path:
    sys.path.insert(0, _DILLY_ROOT)


def _require_cron_secret(token: str) -> None:
    secret = os.environ.get("CRON_SECRET", "").strip()
    if not secret or (token or "").strip() != secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


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
