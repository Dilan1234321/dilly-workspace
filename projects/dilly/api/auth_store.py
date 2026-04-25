"""
Postgres-backed auth store (canonical implementation).
Verification codes, users, sessions — all in the users/sessions/verification_codes tables.
"""

import os
import secrets
import time

import psycopg2
import psycopg2.extras
from projects.dilly.api.database import get_db

_MAGIC_LINK_EXPIRY_SEC = 900       # 15 min
_VERIFICATION_CODE_EXPIRY_SEC = 600  # 10 min
_VERIFICATION_CODE_LENGTH = 6
_SESSION_EXPIRY_SEC = 30 * 86400   # 30 days


# ── 1. store_verification_code (create_verification_code) ─────────────────────

def create_verification_code(email: str) -> str:
    """Create a 6-digit verification code for email. Replaces any existing unused code."""
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    code = "".join(secrets.choice("0123456789") for _ in range(_VERIFICATION_CODE_LENGTH))
    expires_at = _pg_ts(time.time() + _VERIFICATION_CODE_EXPIRY_SEC)
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Invalidate prior unused codes for this email
        cur.execute(
            "UPDATE verification_codes SET used = true WHERE email = %s AND used = false",
            (email,),
        )
        cur.execute(
            """
            INSERT INTO verification_codes (email, code, expires_at)
            VALUES (%s, %s, %s)
            """,
            (email, code, expires_at),
        )
    return code


# ── 2. get_verification_code ───────────────────────────────────────────────────

def _get_verification_code_row(email: str, code: str) -> dict | None:
    """Return the verification_codes row for (email, code) if valid and unused."""
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT * FROM verification_codes
            WHERE email = %s AND code = %s AND used = false AND expires_at > now()
            """,
            (email, code),
        )
        return cur.fetchone()


# ── 3. mark_code_used (consumed inside verify_verification_code) ───────────────

def _mark_code_used(row_id: str) -> None:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("UPDATE verification_codes SET used = true WHERE id = %s", (str(row_id),))


def verify_verification_code(email: str, code: str) -> bool:
    """Verify code for email. Returns True if valid and marks it used."""
    email = (email or "").strip().lower()
    code = (code or "").strip()
    if not email or not code or len(code) != _VERIFICATION_CODE_LENGTH or not code.isdigit():
        return False
    row = _get_verification_code_row(email, code)
    if not row:
        return False
    _mark_code_used(row["id"])
    return True


# ── 4. create_user (upsert) ────────────────────────────────────────────────────

def _upsert_user(email: str, account_type: str = "student") -> dict:
    """Insert user if not exists. Returns the row."""
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO users (email, subscribed, account_type)
            VALUES (%s, false, %s)
            ON CONFLICT (email) DO NOTHING
            """,
            (email, account_type),
        )
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        return dict(cur.fetchone())


# ── 5. get_user_by_email ───────────────────────────────────────────────────────

def get_user_by_email(email: str) -> dict | None:
    email = (email or "").strip().lower()
    if not email:
        return None
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        return dict(row) if row else None


# ── 6. get_user_by_id ─────────────────────────────────────────────────────────

def get_user_by_id(user_id: str) -> dict | None:
    if not user_id:
        return None
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None


# ── 7. create_session ─────────────────────────────────────────────────────────

def create_session(email: str, account_type: str = "student") -> str:
    """Create a 30-day session for email. Returns session token."""
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    user = _upsert_user(email, account_type=account_type)
    token = secrets.token_urlsafe(32)
    expires_at = _pg_ts(time.time() + _SESSION_EXPIRY_SEC)
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO sessions (user_id, token, expires_at)
            VALUES (%s, %s, %s)
            """,
            (user["id"], token, expires_at),
        )
    return token


# ── 8. validate_session (get_session) ─────────────────────────────────────────

def get_session(token: str) -> dict | None:
    """Validate session token. Returns user dict or None."""
    if not token or not token.strip():
        return None
    try:
        with get_db() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                SELECT u.email, u.subscribed, u.id,
                       u.account_type,
                       u.company_name, u.company_domain,
                       u.company_verified_at, u.company_logo_url,
                       u.company_jobs_count
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = %s AND s.expires_at > now()
                """,
                (token.strip(),),
            )
            row = cur.fetchone()
            if not row:
                return None
            account_type = (row.get("account_type") or "student")
            result = {
                "email": row["email"],
                "subscribed": bool(row["subscribed"]),
                "account_type": account_type,
            }
            if account_type == "recruiter":
                result["company_name"] = row.get("company_name")
                result["company_domain"] = row.get("company_domain")
                result["company_verified_at"] = str(row["company_verified_at"]) if row.get("company_verified_at") else None
                result["company_logo_url"] = row.get("company_logo_url")
                result["company_jobs_count"] = row.get("company_jobs_count")
            return result
    except Exception:
        return None


# ── delete_session (logout) ───────────────────────────────────────────────────

def delete_session(token: str) -> bool:
    if not token or not token.strip():
        return False
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("DELETE FROM sessions WHERE token = %s", (token.strip(),))
        return (cur.rowcount or 0) > 0


# ── set_subscribed ────────────────────────────────────────────────────────────

def set_subscribed(email: str, subscribed: bool) -> None:
    email = (email or "").strip().lower()
    if not email:
        return
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "UPDATE users SET subscribed = %s, updated_at = now() WHERE email = %s",
            (subscribed, email),
        )


# ── set_account_type ─────────────────────────────────────────────────────────

def set_account_type(email: str, account_type: str) -> None:
    email = (email or "").strip().lower()
    if not email:
        return
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "UPDATE users SET account_type = %s, updated_at = now() WHERE email = %s",
            (account_type, email),
        )


# ── update_company_fields ─────────────────────────────────────────────────────

def update_company_fields(
    email: str,
    *,
    company_name: str | None = None,
    company_domain: str | None = None,
    company_logo_url: str | None = None,
    company_jobs_count: int | None = None,
    company_verified_at: str | None = None,
) -> None:
    email = (email or "").strip().lower()
    if not email:
        return
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            UPDATE users SET
                company_name = COALESCE(%s, company_name),
                company_domain = COALESCE(%s, company_domain),
                company_logo_url = COALESCE(%s, company_logo_url),
                company_jobs_count = COALESCE(%s, company_jobs_count),
                company_verified_at = COALESCE(%s::TIMESTAMPTZ, company_verified_at),
                updated_at = now()
            WHERE email = %s
            """,
            (company_name, company_domain, company_logo_url, company_jobs_count, company_verified_at, email),
        )


# ── list_active_subscribed_users ──────────────────────────────────────────────

def list_active_subscribed_users() -> list[str]:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT email FROM users WHERE subscribed = true ORDER BY email")
        return [r["email"] for r in cur.fetchall()]


# ── delete_user_and_sessions ──────────────────────────────────────────────────

def delete_user_and_sessions(email: str) -> None:
    email = (email or "").strip().lower()
    if not email:
        return
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("DELETE FROM users WHERE email = %s", (email,))


# ── magic-link (kept for compatibility; not migrated to DB table) ─────────────
# Magic tokens are low-volume and short-lived (15 min). Keep in memory dict.

_MAGIC_TOKENS: dict[str, dict] = {}

def create_magic_token(email: str) -> str:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    token = secrets.token_urlsafe(32)
    _MAGIC_TOKENS[token] = {"email": email, "expires_at": time.time() + _MAGIC_LINK_EXPIRY_SEC}
    return token

def verify_magic_token(token: str) -> str | None:
    if not token:
        return None
    entry = _MAGIC_TOKENS.pop(token, None)
    if not entry:
        return None
    if entry["expires_at"] < time.time():
        return None
    return entry["email"]


# ── helpers ───────────────────────────────────────────────────────────────────

def _pg_ts(unix_ts: float) -> str:
    """Convert a Unix timestamp to a Postgres-compatible ISO string."""
    import datetime
    return datetime.datetime.utcfromtimestamp(unix_ts).strftime("%Y-%m-%d %H:%M:%S")
