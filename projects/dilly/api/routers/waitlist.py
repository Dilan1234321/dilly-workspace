"""
Marketing waitlist signup (no auth). Rate limited.
"""
import os
import time

from fastapi import APIRouter, Request

from projects.dilly.api import deps, errors
from projects.dilly.api.schemas import WaitlistSignupRequest

router = APIRouter(tags=["waitlist"])

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", ".."))
_WAITLIST_FILE = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_waitlist.txt")


@router.post("/waitlist", summary="Join waitlist")
async def waitlist_signup(request: Request, body: WaitlistSignupRequest):
    """Append email to waitlist file. No auth. Rate limited. CORS allows trydilly.com."""
    deps.rate_limit(request, "waitlist", max_requests=5, window_sec=60)
    email = (body.email or "").strip().lower()
    if not email or "@" not in email:
        raise errors.validation_error("Email required.")
    os.makedirs(os.path.dirname(_WAITLIST_FILE), exist_ok=True)
    try:
        with open(_WAITLIST_FILE, "a") as f:
            f.write(email + "\t" + time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) + "\n")
    except OSError:
        raise errors.internal("Could not save signup.")
    return {"ok": True, "message": "You're on the list."}
