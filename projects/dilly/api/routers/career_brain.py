"""
Career Brain router: Second Brain for Career.
Timeline, search, connections, progress, decision log.
"""

import time
import uuid

from fastapi import APIRouter, Request, Body
from fastapi.responses import JSONResponse

from projects.dilly.api import deps, errors
from projects.dilly.api.career_brain import (
    build_timeline,
    search_career_data,
    get_connections,
    get_progress,
)
from projects.dilly.api.profile_store import get_profile, save_profile

router = APIRouter(tags=["career_brain"])


@router.get("/career-brain/timeline")
async def career_timeline(request: Request, limit: int = 100):
    """Unified timeline: applications, audits, beyond_resume, deadlines, decision log."""
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    events = build_timeline(email, limit=min(limit, 200))
    return {"events": events, "count": len(events)}


@router.get("/career-brain/search")
async def career_search(request: Request, q: str = "", limit: int = 30):
    """Search across applications, beyond_resume, decision_log, profile."""
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    results = search_career_data(email, q, limit=min(limit, 50))
    return {"results": results, "query": q}


@router.get("/career-brain/connections")
async def career_connections(request: Request):
    """People and companies from beyond_resume and applications."""
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    conn = get_connections(email)
    return conn


@router.get("/career-brain/progress")
async def career_progress(request: Request):
    """Score trends, application funnel."""
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    prog = get_progress(email)
    return prog


@router.post("/career-brain/decision-log")
async def add_decision_log(request: Request, body: dict = Body(...)):
    """Add a decision or learning entry. Stored in profile.decision_log."""
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    text = (body.get("text") or "").strip()
    if not text or len(text) < 3:
        return JSONResponse(status_code=400, content={"error": "text required (min 3 chars)"})

    entry_type = (body.get("type") or "learning").strip().lower()
    if entry_type not in ("decision", "learning"):
        entry_type = "learning"

    related_to = body.get("related_to")
    if related_to and isinstance(related_to, dict):
        related_to = {
            "company": (related_to.get("company") or "").strip()[:100],
            "role": (related_to.get("role") or "").strip()[:100],
        }
    else:
        related_to = {}

    profile = get_profile(email) or {}
    log = profile.get("decision_log") or []
    if not isinstance(log, list):
        log = []

    entry = {
        "id": str(uuid.uuid4())[:12],
        "text": text[:1000],
        "type": entry_type,
        "related_to": related_to,
        "ts": time.time(),
    }
    log.insert(0, entry)
    if len(log) > 100:
        log = log[:100]

    save_profile(email, {"decision_log": log})
    try:
        from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt
        write_dilly_profile_txt(email)
    except Exception:
        pass
    return {"ok": True, "entry": entry}
