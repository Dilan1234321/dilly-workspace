"""
Per-user profile store.
MIGRATED: all functions now delegate to profile_store_pg (Postgres/Supabase).
"""

# Re-export everything from the Postgres-backed module so existing callers
# (routers/profile.py, routers/auth.py, routers/audit.py, etc.) need zero changes.
from projects.dilly.api.profile_store_pg import (  # noqa: F401
    get_profile,
    save_profile,
    ensure_profile_exists,
    ensure_referral_code,
    get_profile_slug,
    get_profile_by_slug,
    get_profile_folder_path,
    get_profile_photo_path,
    get_profile_photo_path_by_slug,
    save_profile_photo,
    delete_profile_photo,
    get_transcript_path,
    save_transcript_file,
    delete_transcript,
    ensure_parent_invite_token,
    get_email_by_parent_invite_token,
    is_leaderboard_participating,
    delete_account_data,
    delete_draft_profiles_older_than_days,
)
