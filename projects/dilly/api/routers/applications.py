"""
Application Tracker endpoints.
GET  /applications              — list all tracked applications
POST /applications              — add a new application (manual or auto from job apply)
PATCH /applications/{id}        — update status or fields
DELETE /applications/{id}       — remove an application
"""
import json
import os
import sys
import time
import uuid as _uuid

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

from projects.dilly.api import deps, errors
from projects.dilly.api.profile_store import get_profile_folder_path

router = APIRouter(tags=["applications"])

_TRACKER_FILENAME = "applications.json"

ApplicationStatus = Literal["saved", "applied", "interviewing", "offer", "rejected"]

_STATUS_ORDER = {"saved": 0, "applied": 1, "interviewing": 2, "offer": 3, "rejected": 4}


class ApplicationEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(_uuid.uuid4()))
    company: str
    role: str
    status: ApplicationStatus = "saved"
    applied_at: Optional[str] = None       # ISO date string
    deadline: Optional[str] = None         # ISO date string
    match_pct: Optional[int] = None
    job_id: Optional[str] = None           # job listing ID if from Meridian
    job_url: Optional[str] = None
    notes: Optional[str] = None
    next_action: Optional[str] = None
    created_at: str = Field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    updated_at: str = Field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    outcome_captured: bool = False


class AddApplicationRequest(BaseModel):
    company: str
    role: str
    status: ApplicationStatus = "saved"
    applied_at: Optional[str] = None
    deadline: Optional[str] = None
    match_pct: Optional[int] = None
    job_id: Optional[str] = None
    job_url: Optional[str] = None
    notes: Optional[str] = None
    next_action: Optional[str] = None


class PatchApplicationRequest(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    status: Optional[ApplicationStatus] = None
    applied_at: Optional[str] = None
    deadline: Optional[str] = None
    notes: Optional[str] = None
    next_action: Optional[str] = None
    outcome_captured: Optional[bool] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tracker_path(email: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        return ""
    return os.path.join(folder, _TRACKER_FILENAME)


def _load_applications(email: str) -> list[dict]:
    path = _tracker_path(email)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        return data.get("applications", [])
    except Exception:
        return []


def _save_applications(email: str, apps: list[dict]) -> None:
    path = _tracker_path(email)
    if not path:
        raise ValueError("Invalid email")
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"applications": apps, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, f, indent=2)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/applications")
async def list_applications(request: Request):
    """List all tracked applications for the current user."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    apps = _load_applications(email)
    return {"applications": apps, "count": len(apps)}


@router.get("/applications/stats")
async def application_stats(request: Request):
    """Application funnel stats: applied, responses, interviews, silent 2+ weeks."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()
    apps = _load_applications(email)
    from projects.dilly.api.proactive_nudges import compute_app_funnel_stats
    stats = compute_app_funnel_stats(apps)
    return {"stats": stats}


@router.post("/applications")
async def add_application(request: Request, body: AddApplicationRequest):
    """Add a new application (manual or auto-populated from job listing)."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()

    apps = _load_applications(email)

    new_app = ApplicationEntry(
        company=(body.company or "").strip()[:200],
        role=(body.role or "").strip()[:200],
        status=body.status,
        applied_at=body.applied_at,
        deadline=body.deadline,
        match_pct=body.match_pct,
        job_id=body.job_id,
        job_url=body.job_url,
        notes=(body.notes or "")[:500] if body.notes else None,
        next_action=(body.next_action or "")[:200] if body.next_action else None,
    )

    apps.insert(0, new_app.model_dump())

    try:
        _save_applications(email, apps)
    except Exception:
        raise errors.internal("Could not save application.")

    return {"ok": True, "application": new_app.model_dump()}


@router.patch("/applications/{app_id}")
async def update_application(request: Request, app_id: str, body: PatchApplicationRequest):
    """Update status or fields of an application."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()

    apps = _load_applications(email)
    target = next((a for a in apps if a.get("id") == app_id), None)
    if not target:
        raise errors.not_found("Application not found.")

    if body.company is not None:
        target["company"] = body.company.strip()[:200]
    if body.role is not None:
        target["role"] = body.role.strip()[:200]
    if body.status is not None:
        target["status"] = body.status
        # Auto-set applied_at when moving to applied
        if body.status == "applied" and not target.get("applied_at"):
            target["applied_at"] = time.strftime("%Y-%m-%d", time.gmtime())
    if body.applied_at is not None:
        target["applied_at"] = body.applied_at
    if body.deadline is not None:
        target["deadline"] = body.deadline
    if body.notes is not None:
        target["notes"] = body.notes[:500]
    if body.next_action is not None:
        target["next_action"] = body.next_action[:200]
    if body.outcome_captured is not None:
        target["outcome_captured"] = body.outcome_captured

    target["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    try:
        _save_applications(email, apps)
    except Exception:
        raise errors.internal("Could not update application.")

    return {"ok": True, "application": target}


@router.delete("/applications/{app_id}")
async def delete_application(request: Request, app_id: str):
    """Remove an application from the tracker."""
    user = deps.require_auth(request)
    email = user.get("email") or ""
    if not email:
        raise errors.unauthorized()

    apps = _load_applications(email)
    before = len(apps)
    apps = [a for a in apps if a.get("id") != app_id]
    if len(apps) == before:
        raise errors.not_found("Application not found.")

    try:
        _save_applications(email, apps)
    except Exception:
        raise errors.internal("Could not delete application.")

    return {"ok": True}
