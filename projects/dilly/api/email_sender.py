"""
Send verification emails. Uses Resend when RESEND_API_KEY is set; otherwise dev mode (no send, caller returns code to client).
From address should be a verified domain in Resend (e.g. Dilly <verify@yourdomain.com>).
"""

import logging
import os

logger = logging.getLogger(__name__)

# Resend "from" - override with env; must be verified in Resend dashboard
DEFAULT_FROM = "Dilly <noreply@trydilly.com>"


def send_email(to_email: str, subject: str, body_text: str) -> bool:
    """Send a plain text email via Resend. Returns True if sent."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_addr = os.environ.get("DILLY_EMAIL_FROM") or DEFAULT_FROM
    if not api_key:
        logger.warning("RESEND_API_KEY not set; skipping send_email to %s", to_email)
        return False
    try:
        import resend
        resend.api_key = api_key
        html = body_text.replace("\n", "<br>")
        resend.Emails.send({"from": from_addr, "to": [to_email], "subject": subject, "html": html})
        return True
    except Exception as e:
        logger.warning("send_email failed: %s", e, exc_info=True)
        return False


def send_verification_email(to_email: str, code: str, school: dict | None) -> tuple[bool, str | None]:
    """
    Send school-themed verification email to to_email.
    Returns (sent_ok, code_if_not_sent). When RESEND_API_KEY is missing, returns (False, code) so API can return code for dev.
    """
    from projects.dilly.api.verification_email import (
        build_verification_email_html,
        build_verification_email_subject,
    )

    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_addr = os.environ.get("DILLY_EMAIL_FROM") or os.environ.get("DILLY_EMAIL_FROM", DEFAULT_FROM).strip()

    html = build_verification_email_html(code, school)
    subject = build_verification_email_subject(school)

    if not api_key:
        logger.warning("RESEND_API_KEY not set; skipping send (dev_code will be returned if DILLY_DEV=1)")
        return False, code

    try:
        logger.info("Sending verification email to %s via Resend", to_email)
        import resend
        resend.api_key = api_key
        params = {
            "from": from_addr,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }
        resend.Emails.send(params)
        return True, None
    except Exception as e:
        logger.warning("Resend send failed: %s", e, exc_info=True)
        return False, code


def send_report_to_parent(to_email: str, student_name: str, report_url: str) -> bool:
    """Send 'your student shared their report' email to parent. Returns True if sent."""
    from projects.dilly.api.parent_email import (
        build_report_shared_html,
        build_report_shared_subject,
    )
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_addr = os.environ.get("DILLY_EMAIL_FROM") or os.environ.get("DILLY_EMAIL_FROM", DEFAULT_FROM).strip()
    subject = build_report_shared_subject(student_name)
    html = build_report_shared_html(student_name, report_url)
    if not api_key:
        logger.warning("RESEND_API_KEY not set; skipping send_report_to_parent")
        return False
    try:
        import resend
        resend.api_key = api_key
        resend.Emails.send({"from": from_addr, "to": [to_email], "subject": subject, "html": html})
        return True
    except Exception as e:
        logger.warning("Resend send_report_to_parent failed: %s", e, exc_info=True)
        return False


# Apply-through-Dilly: from address for application emails (recruiters see this)
APPLY_FROM_ENV = "DILLY_APPLY_EMAIL_FROM"
DEFAULT_APPLY_FROM = "Dilly Apply <onboarding@resend.dev>"


def _build_apply_email_html(
    student_name: str,
    student_email: str,
    profile_url: str,
    resume_url: str | None,
    job_title: str,
    company: str,
    note: str | None,
) -> str:
    """Plain, recruiter-friendly HTML for Apply-through-Dilly."""
    lines = [
        f"<p><strong>{student_name}</strong> applied to <strong>{job_title}</strong> at <strong>{company}</strong> through Dilly.</p>",
        "<p>This applicant is a <strong>verified .edu student</strong>. No fakes, no bots.</p>",
        f'<p><a href="{profile_url}">View full Dilly profile (scores, evidence, story)</a></p>',
    ]
    if resume_url:
        lines.append(f'<p><a href="{resume_url}">Download resume / report PDF</a></p>')
    lines.append(f"<p>Reply to this email to contact the candidate: {student_email}</p>")
    if (note or "").strip():
        lines.append(f'<p><strong>Note from candidate:</strong><br/>{note.strip()}</p>')
    return "<br/>".join(lines)


def send_apply_application(
    to_email: str,
    student_name: str,
    student_email: str,
    profile_url: str,
    resume_url: str | None,
    job_title: str,
    company: str,
    note: str | None = None,
) -> bool:
    """Send application email for Apply-through-Dilly. Subject: [Dilly Verified] Name – Title at Company. Reply-to: student. Returns True if sent."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_addr = os.environ.get(APPLY_FROM_ENV, DEFAULT_APPLY_FROM).strip()
    subject = f"[Dilly Verified] {student_name} – {job_title} at {company}"
    html = _build_apply_email_html(
        student_name, student_email, profile_url, resume_url, job_title, company, note
    )
    if not api_key:
        logger.warning("RESEND_API_KEY not set; skipping send_apply_application")
        return False
    try:
        import resend
        resend.api_key = api_key
        resend.Emails.send({
            "from": from_addr,
            "to": [to_email],
            "reply_to": student_email,
            "subject": subject,
            "html": html,
        })
        return True
    except Exception as e:
        logger.warning("Resend send_apply_application failed: %s", e, exc_info=True)
        return False


def send_milestone_to_parent(to_email: str, student_name: str, milestone_type: str, extra: dict | None = None) -> bool:
    """Send milestone notification to parent. Returns True if sent."""
    from projects.dilly.api.parent_email import (
        build_milestone_html,
        build_milestone_subject,
    )
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_addr = os.environ.get("DILLY_EMAIL_FROM") or os.environ.get("DILLY_EMAIL_FROM", DEFAULT_FROM).strip()
    subject = build_milestone_subject(milestone_type, student_name)
    html = build_milestone_html(milestone_type, student_name, extra)
    if not api_key:
        logger.warning("RESEND_API_KEY not set; skipping send_milestone_to_parent")
        return False


# Recruiter → student outreach relay
RECRUITER_FROM_ENV = "DILLY_RECRUITER_EMAIL_FROM"
DEFAULT_RECRUITER_FROM = "Dilly Recruiter <onboarding@resend.dev>"


def send_recruiter_outreach_email(
    *,
    to_email: str,
    student_name: str | None,
    recruiter_email: str,
    recruiter_name: str | None,
    company: str | None,
    job_title: str | None,
    message: str,
) -> bool:
    """
    Send recruiter outreach email to a student. Reply-to is recruiter_email so the student can respond naturally.
    Returns True if sent.
    """
    from projects.dilly.api.recruiter_outreach_email import (
        build_recruiter_outreach_html,
        build_recruiter_outreach_subject,
    )
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_addr = os.environ.get(RECRUITER_FROM_ENV, DEFAULT_RECRUITER_FROM).strip()

    if not api_key:
        logger.warning("RESEND_API_KEY not set; skipping send_recruiter_outreach_email")
        return False

    subject = build_recruiter_outreach_subject(company, job_title)
    html = build_recruiter_outreach_html(
        student_name=student_name,
        recruiter_email=recruiter_email,
        recruiter_name=recruiter_name,
        company=company,
        job_title=job_title,
        message=message,
    )
    try:
        import resend
        resend.api_key = api_key
        resend.Emails.send({
            "from": from_addr,
            "to": [to_email],
            "reply_to": recruiter_email,
            "subject": subject,
            "html": html,
        })
        return True
    except Exception as e:
        logger.warning("Resend send_recruiter_outreach_email failed: %s", e, exc_info=True)
        return False
    try:
        import resend
        resend.api_key = api_key
        resend.Emails.send({"from": from_addr, "to": [to_email], "subject": subject, "html": html})
        return True
    except Exception as e:
        logger.warning("Resend send_milestone_to_parent failed: %s", e, exc_info=True)
        return False
