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


@router.get("/applications/{app_id}/context")
async def application_context(app_id: str, request: Request):
    """Pull all the chat context Dilly knows about ONE specific application.

    This is what pushes the tracker from "list of jobs" to "live coaching
    surface." Each card can show:
      - The recruiter (from memory_items category=person matched to this company)
      - The fit gap (vs cohort bar — pulled from latest audit scores)
      - Recent prep notes (chat snippets that mentioned this company)
      - The company's known interview process (Field Intel)
      - Suggested next move

    No competitor tracker has this — Huntr / Teal / Simplify only know the
    company name. Dilly knows the conversation.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    apps = _load_applications(email)
    app = next((a for a in apps if isinstance(a, dict) and str(a.get("id")) == app_id), None)
    if not app:
        raise errors.not_found("application")

    company = (app.get("company") or "").strip()
    role = (app.get("role") or "").strip()
    company_norm = " ".join(company.lower().split())

    out: dict = {
        "id": app_id,
        "company": company,
        "role": role,
        "status": app.get("status"),
        "recruiter": None,
        "people_at_company": [],
        "gap": None,
        "prep_notes": [],
        "next_milestone": None,
    }

    # ── Recruiter / people at this company ─────────────────────────────
    # Pull from memory_surface items where the value mentions the company.
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = get_memory_surface(email) or {}
        items = surface.get("items") or []
        people: list[dict] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            cat = (it.get("category") or "").lower()
            if cat not in ("person_to_follow_up", "person", "recruiter"):
                continue
            label = (it.get("label") or "").strip()
            value = (it.get("value") or "").strip()
            text = f"{label} {value}".lower()
            if company_norm and company_norm in text:
                people.append({
                    "label": label,
                    "value": value,
                    "category": cat,
                    "source": it.get("source") or "chat",
                })
        if people:
            out["people_at_company"] = people[:5]
            # Pick the highest-confidence person as the primary recruiter
            out["recruiter"] = people[0]
    except Exception:
        pass

    # ── Fit gap ─────────────────────────────────────────────────────────
    # Latest audit composite vs cohort bar. If user is below bar, surface
    # by how much.
    try:
        from projects.dilly.api.audit_history import get_audits
        from projects.dilly.api.profile_store import get_profile
        profile = get_profile(email) or {}
        track = (profile.get("track") or "General").strip()
        cohort_bar_map = {"Tech": 75, "Finance": 72, "Health": 68, "General": 65}
        bar = cohort_bar_map.get(track, 65)
        audits = get_audits(email) or []
        latest = audits[0] if audits else {}
        scores = latest.get("scores") or {}
        composite = None
        if all(scores.get(k) is not None for k in ("smart", "grit", "build")):
            composite = round((scores["smart"] + scores["grit"] + scores["build"]) / 3)
        if composite is not None:
            delta = composite - bar
            out["gap"] = {
                "score": composite,
                "cohort_bar": bar,
                "delta": delta,  # negative means below bar
                "message": (
                    f"You're {abs(delta)} pts above this cohort's bar"
                    if delta >= 0
                    else f"{abs(delta)} pts below the cohort bar — work on weakest dimension"
                ),
            }
    except Exception:
        pass

    # ── Prep notes from chat ────────────────────────────────────────────
    # Pull the user's last 30 chat turns and surface lines that mention
    # this company. The user already wrote them — surfacing them here
    # makes the tracker card a place where their prep lives.
    try:
        from projects.dilly.api.chat_thread_store import list_threads, get_thread_messages
        threads = list_threads(email, limit=10) or []
        snippets: list[str] = []
        for t in threads:
            if not isinstance(t, dict):
                continue
            conv_id = t.get("conv_id")
            if not conv_id:
                continue
            try:
                msgs = get_thread_messages(email, conv_id) or []
            except Exception:
                msgs = []
            for m in msgs:
                if not isinstance(m, dict):
                    continue
                content = (m.get("content") or "").strip()
                if not content:
                    continue
                if company_norm and company_norm in content.lower():
                    role_label = "You" if (m.get("role") or "") == "user" else "Dilly"
                    snippets.append(f"{role_label}: {content[:240]}")
                    if len(snippets) >= 6:
                        break
            if len(snippets) >= 6:
                break
        out["prep_notes"] = snippets
    except Exception:
        pass

    # ── Next milestone (deadline, interview date, follow-up) ───────────
    if app.get("deadline"):
        out["next_milestone"] = {
            "type": "deadline",
            "date": app["deadline"],
            "label": f"Application deadline for {company}",
        }
    elif app.get("status") == "applied" and app.get("applied_at"):
        out["next_milestone"] = {
            "type": "follow_up",
            "label": "Send a follow-up if you haven't heard back in 2 weeks",
        }
    elif app.get("status") == "interviewing":
        out["next_milestone"] = {
            "type": "interview_prep",
            "label": f"Practice {company} mock interview before your next round",
        }

    return out


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

    # ── ORGANISM #474.1 — write back to Profile ─────────────────────
    # Adding to the tracker is itself a signal: the user is targeting
    # this company. Write 1-2 facts so every other surface (chat woven
    # context, cohort signal, calendar suggestions, jobs feed chip)
    # learns about it instantly. Without this, the tracker was a
    # one-way sink — the rest of the organism stayed blind to apps.
    facts_added = 0
    try:
        from projects.dilly.api.memory_surface_store import save_memory_surface
        from datetime import datetime as _dt_app
        _now = _dt_app.utcnow().isoformat() + "Z"
        items_to_write: list[dict] = []
        company_clean = (body.company or "").strip()
        role_clean = (body.role or "").strip()
        if company_clean:
            items_to_write.append({
                "id": str(_uuid.uuid4()),
                "uid": email,
                "category": "target_company",
                "label": company_clean[:80],
                "value": (
                    f"Tracking {company_clean}"
                    + (f" for {role_clean}" if role_clean else "")
                    + " — added to Tracker."
                )[:500],
                "source": "application",
                "confidence": "high",
                "created_at": _now,
                "updated_at": _now,
                "shown_to_user": True,
            })
            # Also write an explicit "application" fact so the calendar
            # suggestions endpoint and chat woven context can both see
            # this as live in-flight activity.
            status_label = (body.status or "saved").lower()
            items_to_write.append({
                "id": str(_uuid.uuid4()),
                "uid": email,
                "category": "application",
                "label": (
                    f"{company_clean}"
                    + (f" — {role_clean}" if role_clean else "")
                )[:80],
                "value": (
                    f"Status: {status_label}"
                    + (f". Deadline {body.deadline}." if body.deadline else ".")
                    + (f" Applied {body.applied_at}." if body.applied_at else "")
                )[:500],
                "source": "application",
                "confidence": "high",
                "created_at": _now,
                "updated_at": _now,
                "shown_to_user": True,
            })
        if items_to_write:
            save_memory_surface(email, items=items_to_write)
            facts_added = len(items_to_write)
    except Exception:
        pass  # Non-critical; tracker save still succeeded above

    return {
        "ok": True,
        "application": new_app.model_dump(),
        "deadline_added": deadline_added,
        "profile_facts_added": facts_added,
    }


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
