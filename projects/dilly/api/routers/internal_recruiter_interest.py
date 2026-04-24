"""
Internal endpoint: called by the Blind Audition server when a recruiter expresses
interest in a candidate. Sends candidate an email + push notification.

Auth: X-Internal-Key header must match DILLY_INTERNAL_KEY env var.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from projects.dilly.api import deps

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/recruiter-interest", tags=["internal"])


class RecruiterInterestPayload(BaseModel):
    candidate_email: str
    candidate_name: str
    recruiter_name: str
    recruiter_company: str
    recruiter_email: str | None = None
    role_label: str
    intro_message: str  # The Dilly-drafted intro message


@router.post("/notify")
async def notify_candidate_of_interest(
    body: RecruiterInterestPayload,
    _auth=Depends(deps.require_internal_key),
):
    """
    Notify a candidate that a recruiter expressed interest in their Dilly profile.
    Sends:
    1. Email via Resend (always attempted)
    2. Push notification (skipped gracefully if no push token)
    """
    candidate_email = (body.candidate_email or "").strip().lower()
    if not candidate_email or "@" not in candidate_email:
        raise HTTPException(status_code=400, detail="Invalid candidate_email")

    results = {}

    # ── Email notification ────────────────────────────────────────────────────
    try:
        from projects.dilly.api.email_sender import send_recruiter_outreach_email
        sent = send_recruiter_outreach_email(
            to_email=candidate_email,
            student_name=body.candidate_name or None,
            recruiter_email=body.recruiter_email or "noreply@trydilly.com",
            recruiter_name=body.recruiter_name or None,
            company=body.recruiter_company or None,
            job_title=body.role_label or None,
            message=body.intro_message,
        )
        results["email"] = "sent" if sent else "skipped_no_api_key"
        logger.info(
            "recruiter interest email to %s: %s",
            candidate_email,
            results["email"],
        )
    except Exception as e:
        logger.warning("recruiter interest email failed: %s", e)
        results["email"] = f"error: {str(e)[:120]}"

    # ── Push notification ─────────────────────────────────────────────────────
    try:
        from projects.dilly.api.send_push_notification import send_push_notification

        push_message = (
            f"{body.recruiter_name} from {body.recruiter_company} found your Dilly profile "
            f"for a {body.role_label} role."
        )
        pushed = send_push_notification(
            uid=candidate_email,
            message=push_message,
            payload={
                "trigger_id": "recruiter_interest",
                "deep_link": "/dashboard",
            },
        )
        results["push"] = "sent" if pushed else "skipped_no_token"
    except Exception as e:
        logger.warning("recruiter interest push failed: %s", e)
        results["push"] = f"error: {str(e)[:120]}"

    # ── Log to notification_store ─────────────────────────────────────────────
    try:
        from projects.dilly.api.notification_store import log_notification

        log_notification(
            candidate_email,
            trigger_id="recruiter_interest",
            message=(
                f"{body.recruiter_name} from {body.recruiter_company} found your Dilly profile "
                f"for a {body.role_label} role."
            ),
            deep_link="/dashboard",
            data_snapshot={
                "recruiter_name": body.recruiter_name,
                "recruiter_company": body.recruiter_company,
                "role_label": body.role_label,
            },
        )
        results["notification_log"] = "ok"
    except Exception as e:
        logger.warning("recruiter interest notification_store log failed: %s", e)
        results["notification_log"] = f"error: {str(e)[:120]}"

    return {"ok": True, "candidate_email": candidate_email, "results": results}
