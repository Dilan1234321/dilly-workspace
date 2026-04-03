"""
Jobs: recommended jobs, JD→Meridian scores, job required-scores, door eligibility.
"""
import os
import json
import sqlite3

from fastapi import APIRouter, Body, HTTPException, Request

from projects.dilly.api import deps
from projects.dilly.api.resume_loader import load_parsed_resume_for_voice
from projects.dilly.api.schemas import ApplyThroughMeridianRequest

router = APIRouter(tags=["jobs"])


@router.get("/jobs/recommended")
async def get_recommended_jobs(request: Request, limit: int = 15, offset: int = 0):
    """Return jobs tailored to the user's profile, resume, and audit. Requires signed-in user."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    limit = min(max(1, limit), 50)
    offset = max(0, offset)
    try:
        from projects.dilly.api.profile_store import get_profile
        from projects.dilly.api.audit_history_pg import get_audits
        from projects.dilly.api.job_matching import get_recommended_jobs as match_jobs
        profile = get_profile(email) or {}
        audits = get_audits(email)
        latest_audit = audits[0] if audits else None
        resume_text = load_parsed_resume_for_voice(email, max_chars=4000)
        jobs = match_jobs(profile=profile, resume_text=resume_text, audit=latest_audit, limit=limit, offset=offset)
        from projects.dilly.api.apply_destinations import get_application_email
        for j in jobs:
            j["application_email"] = get_application_email(str(j.get("id", ""))) or None
        return {"jobs": jobs}
    except Exception:
        raise HTTPException(status_code=500, detail="Could not load job recommendations.")


@router.get("/jobs/page")
async def get_jobs_page(request: Request):
    """Full payload for the /jobs UI: readiness-ordered matches, free-tier stubs, flags."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    subscribed = bool(user.get("subscribed"))
    try:
        from projects.dilly.api.jobs_page import build_jobs_page_payload

        return build_jobs_page_payload(email=email, subscribed=subscribed)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not load jobs page.")


@router.post("/apply-through-dilly")
async def apply_through_dilly(request: Request, body: ApplyThroughMeridianRequest):
    """Alias for Apply through Dilly (same as apply-through-meridian)."""
    deps.require_subscribed(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    job_id = (body.job_id or "").strip()
    from projects.dilly.api.apply_destinations import get_application_email
    from projects.dilly.api.job_matching import get_job_by_id
    from projects.dilly.api.profile_store import get_profile, get_profile_slug
    from projects.dilly.api.email_sender import send_apply_application

    to_email = get_application_email(job_id)
    if not to_email:
        raise HTTPException(status_code=400, detail="This job does not accept applications through Dilly.")
    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    profile = get_profile(email)
    student_name = (profile.get("name") or email.split("@")[0]).strip()
    slug = get_profile_slug(email)
    base = (request.base_url or "").rstrip("/")
    profile_url = f"{base.replace('/api', '').rstrip('/')}/p/{slug}" if slug else ""
    resume_url = body.report_url or None
    note = (body.note or "").strip() or None
    title = (job.get("title") or "Position").strip()
    company = (job.get("company") or "Company").strip()
    sent = send_apply_application(
        to_email=to_email,
        student_name=student_name,
        student_email=email,
        profile_url=profile_url,
        resume_url=resume_url,
        job_title=title,
        company=company,
        note=note,
    )
    return {"sent": sent, "job_id": job_id, "company": company, "title": title}


@router.post("/jd-meridian-scores")
async def jd_to_meridian_scores_endpoint(request: Request, body: dict = Body(...)):
    """Infer Meridian score requirements from a job description. Auth required. Body: { job_description, job_title? }."""
    deps.require_auth(request)
    jd = (body or {}).get("job_description") or ""
    title = (body or {}).get("job_title")
    try:
        from dilly_core.jd_to_meridian_scores import jd_to_meridian_scores
        result = jd_to_meridian_scores(jd.strip(), job_title=title.strip() if title else None)
        return result
    except Exception:
        raise HTTPException(status_code=500, detail="Could not infer score requirements from job description.")


@router.get("/jobs/{job_id}/required-scores")
async def get_job_required_scores_endpoint(request: Request, job_id: str):
    """Return required Meridian scores for this job. Company criteria or JD-inferred. Auth required."""
    deps.require_auth(request)
    try:
        from projects.dilly.api.job_matching import get_job_by_id
        from projects.dilly.api.company_criteria import get_job_required_scores
        from dilly_core.jd_to_meridian_scores import jd_to_required_scores_for_job
        job = get_job_by_id(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found or not available.")
        company_scores = get_job_required_scores(job)
        if company_scores:
            return {"required_scores": company_scores, "source": "company"}
        desc = (job.get("description") or "").strip()
        title = (job.get("title") or "").strip()
        if not desc:
            return {"required_scores": None, "source": None}
        inferred = jd_to_required_scores_for_job(desc, job_title=title or None)
        if not inferred:
            return {"required_scores": None, "source": None}
        return {"required_scores": inferred, "source": "jd_inferred"}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not get required scores for this job.")


@router.get("/door-eligibility")
async def get_door_eligibility(request: Request):
    """One resume, one audit, many doors. Returns which opportunity types the user is eligible for."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    try:
        from projects.dilly.api.profile_store import get_profile
        from projects.dilly.api.audit_history_pg import get_audits
        from projects.dilly.api.door_eligibility import evaluate_doors
        profile = get_profile(email) or {}
        audits = get_audits(email)
        latest_audit = audits[0] if audits else None
        return evaluate_doors(profile=profile, audit=latest_audit)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not compute door eligibility.")

# ── Crawled listings (direct from SQLite) ──────────────────────────────────────

import sqlite3
_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_LISTINGS_DB = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "dilly_jobs.db"))

@router.get("/jobs/listings")
async def get_job_listings(
    request: Request,
    q: str = None, company: str = None, source: str = None,
    remote: bool = None, limit: int = 50, offset: int = 0,
):
    deps.require_auth(request)
    if not os.path.isfile(_LISTINGS_DB):
        return {"listings": [], "total": 0, "has_more": False}
    conn = sqlite3.connect(_LISTINGS_DB)
    conn.row_factory = sqlite3.Row
    where, params = [], []
    if q:
        where.append("(title LIKE ? OR company LIKE ? OR tags LIKE ? OR description LIKE ?)")
        params.extend([f"%{q}%"] * 4)
    if company:
        where.append("company LIKE ?"); params.append(f"%{company}%")
    if source:
        where.append("source = ?"); params.append(source)
    if remote is True:
        where.append("remote = 1")
    w = (" WHERE " + " AND ".join(where)) if where else ""
    total = conn.execute(f"SELECT COUNT(*) FROM jobs{w}", params).fetchone()[0]
    rows = conn.execute(f"SELECT * FROM jobs{w} ORDER BY scraped_at DESC LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
    conn.close()
    listings = []
    for row in rows:
        r = dict(row)
        try: r["tags"] = json.loads(r.get("tags") or "[]")
        except: r["tags"] = []
        try: r["required_scores"] = json.loads(r.get("required_scores") or "{}")
        except: r["required_scores"] = {}
        r["remote"] = bool(r.get("remote"))
        listings.append(r)
    return {"listings": listings, "total": total, "has_more": (offset + limit) < total}

@router.get("/jobs/companies")
async def get_job_companies(request: Request):
    deps.require_auth(request)
    if not os.path.isfile(_LISTINGS_DB):
        return {"companies": []}
    conn = sqlite3.connect(_LISTINGS_DB)
    rows = conn.execute("SELECT company, COUNT(*) as count FROM jobs GROUP BY company ORDER BY count DESC").fetchall()
    conn.close()
    return {"companies": [{"name": r[0], "count": r[1]} for r in rows]}

# ── Crawled listings with relevance filtering ──────────────────────────────────
# Add this to the BOTTOM of projects/dilly/api/routers/jobs.py
# Make sure `import os, json, sqlite3` are at the top of jobs.py

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_LISTINGS_DB = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "dilly_jobs.db"))


@router.get("/jobs/listings")
async def get_job_listings(
    request: Request,
    q: str = None,
    company: str = None,
    source: str = None,
    remote: bool = None,
    show_all: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    """
    Return crawled internship listings. By default, filters by student interests
    and education level. Pass show_all=true to bypass relevance filtering.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    if not os.path.isfile(_LISTINGS_DB):
        return {"listings": [], "total": 0, "has_more": False, "filtered": False}

    # Load student profile for relevance filtering
    interests = []
    education_level = "Undergraduate"
    if not show_all and email:
        try:
            from projects.dilly.api.profile_store import get_profile
            profile = get_profile(email) or {}
            interests = profile.get("interests") or []
            education_level = profile.get("education_level") or "Undergraduate"

            # Auto-include majors and minors as interests if not already present
            majors = profile.get("majors") or []
            if isinstance(majors, str):
                majors = [majors]
            minors = profile.get("minors") or []
            if isinstance(minors, str):
                minors = [minors]
            for m in majors + minors:
                m_clean = m.strip()
                if m_clean and m_clean not in interests:
                    interests.append(m_clean)
        except Exception:
            pass

    conn = sqlite3.connect(_LISTINGS_DB)
    conn.row_factory = sqlite3.Row

    where_clauses = []
    params = []

    if q:
        where_clauses.append("(title LIKE ? OR company LIKE ? OR tags LIKE ? OR description LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like, like])
    if company:
        where_clauses.append("company LIKE ?")
        params.append(f"%{company}%")
    if source:
        where_clauses.append("source = ?")
        params.append(source)
    if remote is True:
        where_clauses.append("remote = 1")

    w = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    rows = conn.execute(
        f"SELECT * FROM jobs{w} ORDER BY scraped_at DESC LIMIT 500",
        params,
    ).fetchall()
    conn.close()

    # Parse and filter
    from projects.dilly.api.interests import job_requires_grad_level, job_matches_interests

    all_listings = []
    for row in rows:
        r = dict(row)
        try:
            r["tags"] = json.loads(r.get("tags") or "[]")
        except (json.JSONDecodeError, TypeError):
            r["tags"] = []
        try:
            r["required_scores"] = json.loads(r.get("required_scores") or "{}")
        except (json.JSONDecodeError, TypeError):
            r["required_scores"] = {}
        r["remote"] = bool(r.get("remote"))
        all_listings.append(r)

    # Apply relevance filtering (unless show_all)
    filtered = not show_all and len(interests) > 0
    if not show_all:
        relevant = []
        for listing in all_listings:
            title = listing.get("title", "")
            tags = listing.get("tags", [])
            desc = listing.get("description", "")

            # Filter by education level
            if education_level == "Undergraduate":
                grad_req = job_requires_grad_level(title, desc)
                if grad_req in ("phd", "masters", "mba"):
                    continue

            # Filter by interests (if student has any)
            if interests:
                if not job_matches_interests(title, tags, desc, interests):
                    continue

            relevant.append(listing)
        listings = relevant
    else:
        listings = all_listings

    total = len(listings)
    page = listings[offset:offset + limit]

    return {
        "listings": page,
        "total": total,
        "has_more": (offset + limit) < total,
        "filtered": filtered,
        "interests_used": interests if filtered else [],
    }


@router.get("/jobs/companies")
async def get_job_companies_list(request: Request):
    """Return distinct companies in the database for filter UI."""
    deps.require_auth(request)
    if not os.path.isfile(_LISTINGS_DB):
        return {"companies": []}
    conn = sqlite3.connect(_LISTINGS_DB)
    rows = conn.execute(
        "SELECT company, COUNT(*) as count FROM jobs GROUP BY company ORDER BY count DESC"
    ).fetchall()
    conn.close()
    return {"companies": [{"name": r[0], "count": r[1]} for r in rows]}
