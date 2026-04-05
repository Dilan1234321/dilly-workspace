"""
Companies: list verified companies and full Dilly breakdown per company.

- GET /companies — list companies (slug, display_name, source, score requirements).
- GET /companies/{slug} — full breakdown for signed-in user: company info, score requirements,
  user's scores vs bar, jobs/internships, certifications track, recruiter advice.
- GET /companies/{slug}/guidelines — public: hiring guidelines in voice-friendly format (no auth).
"""

from fastapi import APIRouter, HTTPException, Request

from projects.dilly.api import deps
from projects.dilly.api.company_criteria import (
    get_all_companies,
    get_company_by_slug,
    criteria_to_voice_bullets,
)
from projects.dilly.api.company_recruiter_advice import get_recruiter_advice_for_company
from projects.dilly.api.job_matching import get_jobs_for_company
from dilly_core.company_fit import get_company_fit, get_company_weighted_score

router = APIRouter(tags=["companies"])


@router.get("/companies")
async def list_companies():
    """Return all companies we have verified hiring criteria for. No auth required."""
    companies = get_all_companies()
    return {"companies": companies}


@router.get("/companies/{slug}")
async def get_company_breakdown(request: Request, slug: str):
    """
    Full Dilly breakdown for this company: score requirements, your scores vs bar,
    available jobs/internships, certifications track, real recruiter advice.
    Requires signed-in user for personalized scores and job list.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    company = get_company_by_slug(slug)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")

    # User's latest audit for score comparison
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.audit_history import get_audits

    profile = get_profile(email) or {}
    audits = get_audits(email)
    latest_audit = audits[0] if audits else None

    user_scores = None
    if latest_audit:
        scores = latest_audit.get("scores") or {}
        user_scores = {
            "smart": scores.get("smart"),
            "grit": scores.get("grit"),
            "build": scores.get("build"),
            "final_score": latest_audit.get("final_score"),
            "track": latest_audit.get("detected_track"),
        }

    # Jobs for this company (with required_scores and match_tier when we have audit)
    jobs = get_jobs_for_company(
        company_slug=slug,
        profile=profile,
        audit=latest_audit,
        limit=50,
    )
    from projects.dilly.api.apply_destinations import get_application_email
    for j in jobs:
        j["application_email"] = get_application_email(str(j.get("id", ""))) or None

    # Recruiter advice for this company
    recruiter_advice = get_recruiter_advice_for_company(slug)

    # Track for certifications (frontend filters certs by this)
    dilly_scores = company.get("meridian_scores") or {}
    track = dilly_scores.get("track")

    # Voice-friendly bullets for "What they look for" and "Listen with Dilly"
    criteria = (company.get("criteria_for_llm") or "").strip()
    voice_friendly_bullets = criteria_to_voice_bullets(criteria) if criteria else []

    # Company fit (threshold-based): "You meet 2/3 bars; gap in Build"
    # Company-weighted score (optional): "Fit score for Google: 72"
    company_fit = None
    company_weighted_score = None
    if user_scores:
        sm = user_scores.get("smart")
        gr = user_scores.get("grit")
        bu = user_scores.get("build")
        if sm is not None and gr is not None and bu is not None:
            if dilly_scores:
                fit_result = get_company_fit(float(sm), float(gr), float(bu), slug)
                if fit_result:
                    company_fit = {
                        "meets_smart": fit_result.meets_smart,
                        "meets_grit": fit_result.meets_grit,
                        "meets_build": fit_result.meets_build,
                        "bars_met": fit_result.bars_met,
                        "bars_total": fit_result.bars_total,
                        "gaps": fit_result.gaps,
                        "fit_label": fit_result.fit_label,
                    }
            # Company-weighted composite (from tech.json dimension_weights; fallback: industry)
            track_hint = (latest_audit.get("detected_track") or "").strip() if latest_audit else ""
            weighted = get_company_weighted_score(float(sm), float(gr), float(bu), slug, track=track_hint)
            if weighted:
                company_weighted_score = weighted

    return {
        "company": {
            "slug": company.get("slug"),
            "display_name": company.get("display_name"),
            "source": company.get("source"),
            "dilly_scores": dilly_scores,
            "criteria_for_llm": company.get("criteria_for_llm"),
            "criteria_source": company.get("criteria_source"),
            "confidence": company.get("confidence"),
            "voice_friendly_bullets": voice_friendly_bullets,
        },
        "your_scores": user_scores,
        "company_fit": company_fit,
        "company_weighted_score": company_weighted_score,
        "jobs": jobs,
        "recruiter_advice": recruiter_advice,
        "certifications_track": track,
    }


@router.get("/companies/{slug}/guidelines")
async def get_company_guidelines(slug: str):
    """
    Public (no auth): hiring guidelines for this company in a voice-friendly format.
    Used for company pages on the website and "Listen with Dilly".
    """
    company = get_company_by_slug(slug)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")
    criteria = (company.get("criteria_for_llm") or "").strip()
    bullets = criteria_to_voice_bullets(criteria) if criteria else []
    return {
        "slug": company.get("slug"),
        "display_name": company.get("display_name"),
        "criteria_source": company.get("criteria_source"),
        "confidence": company.get("confidence"),
        "dilly_scores": company.get("meridian_scores"),
        "criteria_for_llm": criteria,
        "voice_friendly_bullets": bullets,
    }
