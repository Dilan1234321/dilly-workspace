"""
Email templates for recruiter-to-student outreach relay.
"""


def build_recruiter_outreach_subject(company: str | None, job_title: str | None) -> str:
    company = (company or "").strip()
    job_title = (job_title or "").strip()
    if company and job_title:
        return f"Recruiter outreach via Meridian: {job_title} at {company}"
    if company:
        return f"Recruiter outreach via Meridian: {company}"
    if job_title:
        return f"Recruiter outreach via Meridian: {job_title}"
    return "Recruiter outreach via Meridian"


def build_recruiter_outreach_html(
    *,
    student_name: str | None,
    recruiter_email: str,
    recruiter_name: str | None,
    company: str | None,
    job_title: str | None,
    message: str,
) -> str:
    student_name = (student_name or "").strip() or "there"
    recruiter_email = (recruiter_email or "").strip()
    recruiter_name = (recruiter_name or "").strip() or "A recruiter"
    company = (company or "").strip()
    job_title = (job_title or "").strip()
    message = (message or "").strip()

    header = f"<p>Hi {student_name},</p>"
    intro_parts = [f"<strong>{recruiter_name}</strong> reached out to you via Meridian"]
    if company and job_title:
        intro_parts.append(f"about <strong>{job_title}</strong> at <strong>{company}</strong>")
    elif company:
        intro_parts.append(f"about <strong>{company}</strong>")
    elif job_title:
        intro_parts.append(f"about <strong>{job_title}</strong>")
    intro = "<p>" + " ".join(intro_parts) + ".</p>"

    body = (
        "<p><strong>Message:</strong></p>"
        f"<div style=\"padding:12px;border:1px solid #2a2a2a;border-radius:10px;line-height:1.45;\">"
        f"{_escape_html(message).replace('\\n', '<br/>')}"
        "</div>"
    )

    how_to_reply = (
        "<p style=\"margin-top:14px;\"><strong>Want to respond?</strong> "
        "Just reply to this email. Your reply will go directly to the recruiter.</p>"
    )

    safety = (
        "<p style=\"color:#a3a3a3;font-size:12px;margin-top:10px;\">"
        "Safety: Meridian never asks you to share passwords or pay for opportunities. "
        f"If this message seems suspicious, forward it to support. Recruiter contact: { _escape_html(recruiter_email) }."
        "</p>"
    )

    return "<br/>".join([header, intro, body, how_to_reply, safety])


def _escape_html(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )

