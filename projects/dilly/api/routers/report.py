"""
Report router: POST/GET report/pdf, report/email-to-parent, apply-through-meridian.
"""

import os
import secrets
import sys
import time

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Request, Body
from fastapi.responses import FileResponse

from projects.dilly.api import deps, errors
from projects.dilly.api.openapi_helpers import ERROR_RESPONSES
from projects.dilly.api.constants import ERR_REPORT_500
from projects.dilly.api.schemas import (
    ReportEmailToParentRequest,
    ApplyThroughMeridianRequest,
)

router = APIRouter(tags=["report"])

_REPORTS_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "meridian_reports")
_REPORT_EXPIRY_DAYS = 7


def _report_token_safe(token: str) -> bool:
    return bool(token and len(token) <= 64 and all(c.isalnum() or c in "-_" for c in token))


def _report_path(token: str) -> str:
    os.makedirs(_REPORTS_DIR, exist_ok=True)
    return os.path.join(_REPORTS_DIR, f"{token}.pdf")


def _generate_report_pdf(audit: dict, output_path: str) -> None:
    """Write a minimal one-page PDF from audit dict (candidate_name, scores, findings)."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet

    doc = SimpleDocTemplate(output_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    name = (audit.get("candidate_name") or "Student").strip()
    track = (audit.get("detected_track") or "").strip() or "—"
    scores = audit.get("scores") or {}
    s, g, b = scores.get("smart", 0), scores.get("grit", 0), scores.get("build", 0)
    final = audit.get("final_score", (s + g + b) / 3 if (s or g or b) else 0)
    story.append(Paragraph("<font size=20 color='#0f172a'>Meridian Report</font>", styles["Title"]))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"<b>{name}</b> · {track} Track", styles["Normal"]))
    story.append(Spacer(1, 16))
    table_data = [
        ["Dimension", "Score"],
        ["Smart", f"{s:.0f}"],
        ["Grit", f"{g:.0f}"],
        ["Build", f"{b:.0f}"],
        ["Overall", f"{final:.0f}"],
    ]
    t = Table(table_data, colWidths=[120, 80])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    findings = audit.get("audit_findings") or []
    if findings:
        story.append(Spacer(1, 16))
        story.append(Paragraph("<b>Key findings</b>", styles["Heading3"]))
        for f in findings[:6]:
            safe = (f or "").replace("&", "&amp;").replace("<", "&lt;")[:200]
            story.append(Paragraph(f"• {safe}", styles["Normal"]))
    story.append(Spacer(1, 24))
    story.append(Paragraph("<i>Dilly · trydilly.com</i>", styles["Italic"]))
    doc.build(story)


@router.post("/report/pdf", responses=ERROR_RESPONSES)
async def report_pdf(request: Request, body: dict = Body(...)):
    """Generate a shareable report PDF from audit data. Returns URL with token."""
    deps.require_subscribed(request)
    audit = body if isinstance(body, dict) and (body.get("scores") or body.get("candidate_name")) else body.get("audit")
    if not audit or not isinstance(audit, dict):
        raise errors.validation_error("Provide audit object (candidate_name, scores, audit_findings).")
    token = secrets.token_urlsafe(24)
    if not _report_token_safe(token):
        token = secrets.token_urlsafe(20)
    path = _report_path(token)
    try:
        _generate_report_pdf(audit, path)
    except Exception:
        import traceback
        traceback.print_exc()
        raise errors.internal(ERR_REPORT_500)
    base = (request.base_url or "").rstrip("/")
    url = f"{base}/report/pdf/{token}"
    return {"url": url, "token": token}


@router.get("/report/pdf/{token}")
async def report_pdf_get(request: Request, token: str):
    """Serve report PDF by token (share link)."""
    if not _report_token_safe(token):
        raise errors.not_found("Invalid report link.")
    path = _report_path(token)
    if not os.path.isfile(path):
        raise errors.not_found("Report not found or expired.")
    return FileResponse(path, media_type="application/pdf", filename="dilly-report.pdf")


@router.post("/report/email-to-parent")
async def report_email_to_parent(request: Request, body: ReportEmailToParentRequest):
    """Send report share link to parent email."""
    deps.require_subscribed(request)
    parent_email = (body.parent_email or "").strip().lower()
    report_url = (body.report_url or "").strip()
    student_name = (body.student_name or "").strip()
    if not parent_email or "@" not in parent_email:
        raise errors.validation_error("parent_email required.")
    if not report_url:
        raise errors.validation_error("report_url required.")
    from projects.dilly.api.email_sender import send_report_to_parent
    sent = send_report_to_parent(parent_email, student_name or "Your student", report_url)
    return {"sent": sent}


@router.post("/apply-through-meridian")
async def apply_through_meridian(request: Request, body: ApplyThroughMeridianRequest):
    """Send application email to recruiter (Apply on Meridian). Requires job_id and optional note."""
    deps.require_subscribed(request)
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized("Not authenticated.")
    job_id = (body.job_id or "").strip()
    from projects.dilly.api.apply_destinations import get_application_email
    from projects.dilly.api.job_matching import get_job_by_id
    from projects.dilly.api.profile_store import get_profile, get_profile_slug
    from projects.dilly.api.email_sender import send_apply_application

    to_email = get_application_email(job_id)
    if not to_email:
        raise errors.bad_request("This job does not accept applications through Meridian.")
    job = get_job_by_id(job_id)
    if not job:
        raise errors.not_found("Job not found.")
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
