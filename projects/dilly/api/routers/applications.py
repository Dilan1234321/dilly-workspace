"""
Application Tracker endpoints.
GET  /applications              — list all tracked applications
POST /applications              — add a new application (manual or auto from job apply)
PATCH /applications/{id}        — update status or fields
DELETE /applications/{id}       — remove an application

Storage: applications are stored in profile_json["applications"] in PostgreSQL
so they survive Railway deploys and are consistent across desktop + mobile.
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

router = APIRouter(tags=["applications"])

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
    job_id: Optional[str] = None           # job listing ID if from Dilly
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
# Helpers — PostgreSQL-backed (survives deploys, syncs desktop + mobile)
# ---------------------------------------------------------------------------

def _load_applications(email: str) -> list[dict]:
    """Load applications from profile_json in PostgreSQL."""
    from projects.dilly.api.profile_store import get_profile
    profile = get_profile(email) or {}
    apps = profile.get("applications")
    if isinstance(apps, list):
        return apps
    # One-time migration: pull from legacy filesystem JSON if DB is empty
    try:
        from projects.dilly.api.profile_store import get_profile_folder_path
        folder = get_profile_folder_path(email)
        path = os.path.join(folder, "applications.json") if folder else ""
        if path and os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            migrated = data if isinstance(data, list) else data.get("applications", [])
            if migrated:
                _save_applications(email, migrated)
                return migrated
    except Exception:
        pass
    return []


def _save_applications(email: str, apps: list[dict]) -> None:
    """Persist applications to profile_json in PostgreSQL."""
    from projects.dilly.api.profile_store import save_profile
    save_profile(email, {"applications": apps})


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

    # ── Auto-import deadline to calendar ────────────────────────────────────
    deadline_added = False
    if body.deadline:
        try:
            from projects.dilly.api.profile_store import get_profile, save_profile
            profile = get_profile(email) or {}
            deadlines = profile.get("deadlines") if isinstance(profile.get("deadlines"), list) else []
            label = f"{(body.company or '').strip()} \u2014 {(body.role or 'Application').strip()} deadline"
            # Check for duplicate (same label + date)
            already_exists = any(
                d.get("label") == label and d.get("date") == body.deadline
                for d in deadlines if isinstance(d, dict)
            )
            if not already_exists:
                new_deadline = {
                    "id": str(_uuid.uuid4()),
                    "label": label,
                    "date": body.deadline,
                    "type": "application",
                    "createdBy": "dilly",
                    "subDeadlines": [],
                }
                deadlines.append(new_deadline)
                save_profile(email, {"deadlines": deadlines})
                deadline_added = True
        except Exception:
            pass  # Non-critical; don't fail the application save

    return {"ok": True, "application": new_app.model_dump(), "deadline_added": deadline_added}


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


# ---------------------------------------------------------------------------
# Job Collections
# ---------------------------------------------------------------------------

def _load_collections(email: str) -> list[dict]:
    from projects.dilly.api.profile_store import get_profile
    profile = get_profile(email) or {}
    return profile.get("collections") or []


def _save_collections(email: str, collections: list[dict]) -> None:
    from projects.dilly.api.profile_store import save_profile
    save_profile(email, {"collections": collections})


@router.get("/collections")
async def list_collections(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    return {"collections": _load_collections(email)}


@router.post("/collections")
async def create_collection(request: Request, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    name = (body.get("name") or "").strip()[:100]
    if not name:
        raise errors.validation_error("Collection name is required.")
    collections = _load_collections(email)
    collection = {
        "id": _uuid.uuid4().hex[:12],
        "name": name,
        "jobs": [],
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    collections.append(collection)
    _save_collections(email, collections)
    return {"ok": True, "collection": collection}


@router.patch("/collections/{collection_id}")
async def update_collection(request: Request, collection_id: str, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    collections = _load_collections(email)
    target = next((c for c in collections if c.get("id") == collection_id), None)
    if not target:
        raise errors.not_found("Collection not found.")
    name = (body.get("name") or "").strip()[:100]
    if name:
        target["name"] = name
    target["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _save_collections(email, collections)
    return {"ok": True, "collection": target}


@router.delete("/collections/{collection_id}")
async def delete_collection(request: Request, collection_id: str):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    collections = _load_collections(email)
    before = len(collections)
    collections = [c for c in collections if c.get("id") != collection_id]
    if len(collections) == before:
        raise errors.not_found("Collection not found.")
    _save_collections(email, collections)
    return {"ok": True}


@router.post("/collections/{collection_id}/jobs")
async def add_job_to_collection(request: Request, collection_id: str, body: dict = Body(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    collections = _load_collections(email)
    target = next((c for c in collections if c.get("id") == collection_id), None)
    if not target:
        raise errors.not_found("Collection not found.")
    job_id = body.get("job_id") or ""
    if not job_id:
        raise errors.validation_error("job_id is required.")
    # Don't add duplicates
    if any(j.get("job_id") == job_id for j in target.get("jobs", [])):
        return {"ok": True, "already_exists": True}
    target.setdefault("jobs", []).append({
        "job_id": job_id,
        "title": (body.get("title") or "")[:200],
        "company": (body.get("company") or "")[:200],
        "url": (body.get("url") or "")[:500],
        "added_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    target["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _save_collections(email, collections)
    return {"ok": True}


@router.delete("/collections/{collection_id}/jobs/{job_id}")
async def remove_job_from_collection(request: Request, collection_id: str, job_id: str):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()
    collections = _load_collections(email)
    target = next((c for c in collections if c.get("id") == collection_id), None)
    if not target:
        raise errors.not_found("Collection not found.")
    jobs = target.get("jobs", [])
    target["jobs"] = [j for j in jobs if j.get("job_id") != job_id]
    target["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _save_collections(email, collections)
    return {"ok": True}
