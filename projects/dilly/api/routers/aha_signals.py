"""
/aha endpoints — submit and check the "aha moment" signal.

Mobile client fires POST /aha/signal when the user either answers or
skips the one-time prompt. Client first checks GET /aha/status so it
never shows the prompt twice. The ADMIN GET /aha/list is scoped to
a shared admin token for now (no full admin system yet).
"""

from fastapi import APIRouter, Body, Request, HTTPException
import os

from projects.dilly.api import deps, errors

router = APIRouter(tags=["aha"])


@router.get("/aha/status")
async def aha_status(request: Request):
    """Has the current user already submitted (or skipped) the aha
    prompt? Returns { has_responded: bool }. Cheap DB check; on error
    returns has_responded=false so the prompt falls through to
    showing — a duplicate prompt is a better UX than missing it on
    a transient DB blip."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        return {"has_responded": False}
    try:
        from projects.dilly.api.aha_signals_store import has_responded
        return {"has_responded": bool(has_responded(email))}
    except Exception:
        return {"has_responded": False}


@router.post("/aha/signal")
async def aha_signal(request: Request, body: dict = Body(...)):
    """Record a user's aha-moment response or skip. One row per user
    ever (unique constraint on email). Subsequent submissions are
    no-ops on the DB side.

    Body:
      response:  string | null   (the user's words, null if skipped)
      skipped:   bool            (true if they tapped Skip)
      minutes_in_app: int | null (rough minutes since first open)
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.validation_error("Email required.")

    response = body.get("response")
    skipped = bool(body.get("skipped", False))
    minutes_in_app = body.get("minutes_in_app")
    try:
        minutes_in_app = int(minutes_in_app) if minutes_in_app is not None else None
    except Exception:
        minutes_in_app = None

    # Pull plan + path from profile so the admin dashboard can slice
    # signals by user type without needing a JOIN later.
    try:
        from projects.dilly.api.profile_store import get_profile as _get_profile
        profile = _get_profile(email) or {}
    except Exception:
        profile = {}
    plan = (profile.get("plan") or "starter").lower()
    user_path = (profile.get("user_path") or "").lower() or None
    app_mode = (profile.get("app_mode") or "").lower() or None

    try:
        from projects.dilly.api.aha_signals_store import record_signal
        inserted = record_signal(
            email,
            response=response if not skipped else None,
            skipped=skipped,
            minutes_in_app=minutes_in_app,
            plan=plan,
            user_path=user_path,
            app_mode=app_mode,
        )
    except Exception:
        # Never block the client on logging. They got the ack.
        inserted = False

    return {"ok": True, "inserted": inserted}


@router.get("/aha/list")
async def aha_list(request: Request, limit: int = 50):
    """Admin read of recent signals. Gated by the ADMIN_TOKEN env
    var passed as ?token= for now — no shared admin auth system
    exists yet. Keep this tight: the free-text responses are honest
    and potentially sensitive."""
    admin_token = (os.environ.get("ADMIN_TOKEN") or "").strip()
    caller_token = (request.query_params.get("token") or "").strip()
    if not admin_token or caller_token != admin_token:
        raise HTTPException(status_code=403, detail="Admin only.")
    try:
        from projects.dilly.api.aha_signals_store import list_recent
        return {"items": list_recent(limit)}
    except Exception:
        return {"items": []}
