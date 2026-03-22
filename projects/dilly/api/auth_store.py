"""
Magic-link auth store: users, magic tokens, and sessions.
MIGRATED: all functions now delegate to auth_store_pg (Postgres/Supabase).
"""

# Re-export everything from the Postgres-backed module so existing callers
# (routers/auth.py, deps.py, etc.) need zero import changes.
from projects.dilly.api.auth_store_pg import (  # noqa: F401
    create_verification_code,
    verify_verification_code,
    create_magic_token,
    verify_magic_token,
    create_session,
    get_session,
    delete_session,
    delete_user_and_sessions,
    set_subscribed,
    list_active_subscribed_users,
)
