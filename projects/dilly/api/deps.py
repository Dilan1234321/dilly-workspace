"""
Shared dependencies for Meridian API routers.
Use these for auth, rate limiting, and recruiter checks.
All raises use api.errors so the response has a stable `code` for the frontend.
"""
import os
import threading
import time
from collections import defaultdict
from typing import Dict, List

from fastapi import Request

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
    """Require valid session and subscribed; return user dict. Raises 401/403 otherwise.
    If request.state.first_run_bypass is True, subscription check is skipped (used by /audit/first-run)."""
    user = bearer_user(request)
    if not user:
        raise errors.unauthorized("Sign in to run audits.")
    if getattr(request.state, "first_run_bypass", False):
        return user
    if not user.get("subscribed"):
        raise errors.forbidden("Subscribe to run audits. $9.99/month.")
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


def require_recruiter(request: Request) -> None:
    """Recruiter endpoints are currently open (no API key required). To require a key, set RECRUITER_API_KEY and uncomment the check below."""
    return
    # When you want to lock down recruiter access, uncomment:
    # key = (os.environ.get("RECRUITER_API_KEY") or "").strip()
    # if not key:
    #     raise errors.service_unavailable("Recruiter API not configured.")
    # header_key = (request.headers.get("x-recruiter-api-key") or "").strip()
    # auth = request.headers.get("authorization") or ""
    # if auth.lower().startswith("bearer "):
    #     header_key = header_key or auth[7:].strip()
    # if not header_key or header_key != key:
    #     raise errors.unauthorized("Invalid or missing recruiter API key.")


def is_dev_allowed(request: Request) -> bool:
    """True when DILLY_DEV=1, localhost, or by default (pay-button bypass). Set DILLY_DEV_UNLOCK=0 in prod to require real payment."""
    if os.environ.get("DILLY_DEV_UNLOCK", "1").strip().lower() in ("0", "false", "no"):
        return False
    if os.environ.get("DILLY_DEV", "").strip().lower() in ("1", "true", "yes"):
        return True
    client = request.client
    if client and client.host in ("127.0.0.1", "localhost", "::1"):
        return True
    return True  # default: allow so "Unlock full access" lets you in without payment
