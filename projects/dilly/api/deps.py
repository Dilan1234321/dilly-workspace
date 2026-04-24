"""
Shared dependencies for Dilly API routers.
Use these for auth, rate limiting, and recruiter checks.
All raises use api.errors so the response has a stable `code` for the frontend.

Recruiter auth: use require_recruiter(request) on Blind Audition / recruiter
endpoints.  It validates a Dilly session AND checks account_type == 'recruiter'.
Non-recruiters (students) get a 403 with code RECRUITER_ONLY.
"""
import os
import threading
import time
from collections import defaultdict
from typing import Dict, List

from fastapi import HTTPException, Request

from projects.dilly.api import errors


# ---------------------------------------------------------------------------
# Rate limiter (sliding window per IP)
# ---------------------------------------------------------------------------
_rate_lock = threading.Lock()
_rate_buckets: Dict[str, List[float]] = defaultdict(list)


def rate_limit(request: Request, key_prefix: str, max_requests: int, window_sec: int) -> None:
    """Raise 429 if this IP exceeds max_requests within window_sec."""
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")
    bucket_key = f"{key_prefix}:{ip}"
    now = time.time()
    with _rate_lock:
        hits = _rate_buckets[bucket_key]
        cutoff = now - window_sec
        _rate_buckets[bucket_key] = [t for t in hits if t > cutoff]
        if len(_rate_buckets[bucket_key]) >= max_requests:
            raise errors.rate_limited()
        _rate_buckets[bucket_key].append(now)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def bearer_user(request: Request) -> dict | None:
    """Parse Authorization: Bearer <token> and return session { email, subscribed } or None."""
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        from projects.dilly.api.auth_store import get_session
        from projects.dilly.api.family_store import is_student_in_any_family

        user = get_session(token)
        if user and not user.get("subscribed"):
            if is_student_in_any_family(user.get("email") or ""):
                user = {**user, "subscribed": True}
        return user
    except Exception:
        return None


def require_subscribed(request: Request) -> dict:
    """Require valid session and a paid plan; return user dict. Raises
    401 if unauthenticated, 402 if on starter. first_run_bypass
    (onboarding audit path) skips the plan check.

    Previously this was a no-op ('all users treated as paid'). That
    was turning every LLM endpoint wrapped by require_subscribed
    (templates/cover-letter, thank-you, follow-up, linkedin,
    interview-prep, resume-tailor) into free-tier LLM-burning
    surfaces. Now it actually enforces the plan.
    """
    user = bearer_user(request)
    if not user:
        raise errors.unauthorized("Sign in to continue.")
    if getattr(request.state, "first_run_bypass", False):
        return user
    email = (user.get("email") or "").strip().lower()
    try:
        from projects.dilly.api.profile_store import get_profile
        plan = ((get_profile(email) or {}).get("plan") or "starter").lower().strip()
    except Exception:
        plan = "starter"
    if plan == "starter":
        raise HTTPException(
            status_code=402,
            detail={
                "code": "REQUIRES_PLAN",
                "message": "This feature is part of Dilly.",
                "plan": plan,
                "required_plan": "dilly",
            },
        )
    return user


def require_auth(request: Request) -> dict:
    """Require valid session. Return user dict. Raises 401 if not signed in."""
    user = bearer_user(request)
    if not user:
        raise errors.unauthorized("Sign in to access your profile.")
    return user


def get_recruiter_key(request: Request) -> str:
    """Extract recruiter API key from request headers. Returns empty string if missing."""
    key = (request.headers.get("x-recruiter-api-key") or "").strip()
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        key = key or auth[7:].strip()
    return key


def require_recruiter(request: Request) -> dict:
    """Require a valid Dilly session with account_type == 'recruiter'.

    Returns the user dict on success.
    Raises 401 if not signed in, 403 if signed in but not a recruiter account.
    """
    user = bearer_user(request)
    if not user:
        raise errors.unauthorized("Sign in with your recruiter account to access this resource.")
    if (user.get("account_type") or "student") != "recruiter":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "RECRUITER_ONLY",
                "message": "This endpoint requires a recruiter account. "
                           "Sign up at app.hellodilly.com as a recruiter to get access.",
            },
        )
    return user


# ---------------------------------------------------------------------------
# Internal endpoint protection
# ---------------------------------------------------------------------------
async def require_internal_key(request: Request) -> None:
    """Reject requests to internal endpoints unless X-Internal-Key matches DILLY_INTERNAL_KEY.

    Also accepts the legacy X-Cron-Secret / CRON_SECRET headers so existing
    cron callers keep working without code changes.
    """
    from fastapi import HTTPException
    from projects.dilly.api.config import config

    key = (request.headers.get("X-Internal-Key") or "").strip()
    expected = config.internal_api_key.strip()

    # Also honour the legacy CRON_SECRET for backwards compatibility
    if not key:
        key = (request.headers.get("x-cron-secret") or "").strip()
    if not expected:
        expected = config.cron_secret.strip()

    if not expected or key != expected:
        raise HTTPException(status_code=403, detail="Internal endpoint")


def is_dev_allowed() -> bool:
    """Only returns True when DILLY_DEV_UNLOCK=1 is explicitly set (e.g. in dev environments)."""
    return os.getenv("DILLY_DEV_UNLOCK", "0") == "1"
