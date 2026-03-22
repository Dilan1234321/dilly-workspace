"""
Templates router: Eliminate Repetitive Work.
Cover letters, thank-you emails, follow-ups, LinkedIn outreach, resume tailoring.
All outputs are editable by the user; we generate drafts, not final copy.
"""

import json
import os
import sys

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.normpath(os.path.join(_ROUTER_DIR, ".."))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Request, Body
from fastapi.responses import JSONResponse

from projects.dilly.api import deps
from projects.dilly.api.template_helpers import get_profile_context_for_templates

router = APIRouter(tags=["templates"])


def _call_llm(system: str, user: str, max_tokens: int = 2000, temperature: float = 0.5) -> str | None:
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if not is_llm_available():
            return None
        return get_chat_completion(system, user, model=get_light_model(), max_tokens=max_tokens, temperature=temperature)
    except Exception:
        return None


def _parse_json_or_text(raw: str | None) -> dict | str | None:
    if not raw or not raw.strip():
        return None
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


@router.post("/templates/cover-letter")
async def template_cover_letter(request: Request, body: dict = Body(...)):
    """
    Generate a full cover letter from profile + job description.
    User edits before sending. Output must feel personal, not generic.
    """
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    job_description = (body.get("job_description") or body.get("jd") or "").strip()
    company = (body.get("company") or "").strip()
    role = (body.get("role") or body.get("job_title") or "").strip()

    if not job_description and not (company and role):
        return JSONResponse(status_code=400, content={"error": "job_description or company+role required"})

    profile_ctx = get_profile_context_for_templates(email)
    if not profile_ctx:
        return JSONResponse(status_code=400, content={"error": "No profile or resume on file. Upload a resume first."})

    system = """You are a career coach helping a college student write a cover letter.
Rules:
- Generate a full cover letter (3–5 short paragraphs). Professional but human.
- Root every claim in their actual resume/audit evidence. No generic fluff.
- Match their experience to the role requirements. Be specific.
- Opening: hook that connects their story to the company/role.
- Body: 1–2 paragraphs with concrete evidence (projects, leadership, skills).
- Closing: brief, confident, one clear ask.
- Output ONLY the cover letter text. No JSON. No meta-commentary."""

    user_content = f"Profile:\n{profile_ctx}\n\n"
    if company:
        user_content += f"Company: {company}\n"
    if role:
        user_content += f"Role: {role}\n"
    if job_description:
        user_content += f"Job description:\n{job_description[:3000]}\n"

    raw = _call_llm(system, user_content, max_tokens=1200)
    letter = (raw or "").strip() if raw else ""
    return JSONResponse(content={"cover_letter": letter, "company": company, "role": role})


@router.post("/templates/thank-you")
async def template_thank_you(request: Request, body: dict = Body(...)):
    """
    Generate a post-interview thank-you email with role/company specifics.
    """
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    company = (body.get("company") or "").strip()
    role = (body.get("role") or body.get("job_title") or "").strip()
    interviewer_name = (body.get("interviewer_name") or body.get("interviewer") or "").strip()
    notes = (body.get("notes") or "").strip()

    profile_ctx = get_profile_context_for_templates(email)
    if not profile_ctx:
        return JSONResponse(status_code=400, content={"error": "No profile on file. Upload a resume first."})

    system = """You are a career coach. Generate a post-interview thank-you email.
Rules:
- 3–4 short paragraphs. Warm, professional, specific.
- Reference something specific from the interview (or a general topic if no notes).
- Reiterate 1–2 strengths that match the role.
- End with a clear next step or expression of continued interest.
- Output ONLY the email body. No subject line unless asked. No JSON."""

    user_content = f"Profile:\n{profile_ctx}\n\nCompany: {company or 'Unknown'}\nRole: {role or 'Unknown'}\n"
    if interviewer_name:
        user_content += f"Interviewer: {interviewer_name}\n"
    if notes:
        user_content += f"Interview notes: {notes}\n"

    raw = _call_llm(system, user_content, max_tokens=600)
    email_body = (raw or "").strip() if raw else ""
    return JSONResponse(content={
        "email_body": email_body,
        "subject": f"Thank you – {role or 'Interview'} at {company or 'your company'}" if company or role else "Thank you",
        "company": company,
        "role": role,
    })


@router.post("/templates/follow-up")
async def template_follow_up(request: Request, body: dict = Body(...)):
    """
    Generate a follow-up email when the user hasn't heard back (e.g. 2+ weeks).
    """
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    company = (body.get("company") or "").strip()
    role = (body.get("role") or body.get("job_title") or "").strip()
    weeks_since = body.get("weeks_since") or body.get("weeks") or 2

    profile_ctx = get_profile_context_for_templates(email)
    if not profile_ctx:
        return JSONResponse(status_code=400, content={"error": "No profile on file. Upload a resume first."})

    system = """You are a career coach. Generate a polite follow-up email when a student hasn't heard back after applying.
Rules:
- Brief (2–3 short paragraphs). Professional, not desperate.
- Acknowledge they applied X weeks ago and are still interested.
- Add one new piece of value: a recent accomplishment, course, or update that reinforces fit.
- End with a soft ask (status check, next steps).
- Output ONLY the email body. No subject line. No JSON."""

    user_content = f"Profile:\n{profile_ctx}\n\nCompany: {company or 'Unknown'}\nRole: {role or 'Unknown'}\nWeeks since applying: {weeks_since}\n"

    raw = _call_llm(system, user_content, max_tokens=500)
    email_body = (raw or "").strip() if raw else ""
    subject = f"Following up – {role or 'Application'} at {company}" if company or role else "Following up on my application"
    return JSONResponse(content={
        "email_body": email_body,
        "subject": subject,
        "company": company,
        "role": role,
    })


@router.post("/templates/linkedin")
async def template_linkedin(request: Request, body: dict = Body(...)):
    """
    Generate LinkedIn connection request or message. Feels personal, not generic.
    """
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    template_type = (body.get("type") or "connection").strip().lower()
    recipient_name = (body.get("recipient_name") or body.get("recipient") or "").strip()
    company = (body.get("company") or "").strip()
    role = (body.get("role") or body.get("job_title") or "").strip()
    context = (body.get("context") or "").strip()

    profile_ctx = get_profile_context_for_templates(email)
    if not profile_ctx:
        return JSONResponse(status_code=400, content={"error": "No profile on file. Upload a resume first."})

    if template_type == "message":
        system = """You are a career coach. Generate a short LinkedIn message (not connection request).
Rules:
- 2–4 sentences. Personal, specific to the recipient/company.
- Reference something genuine (their role, company, shared connection, or their post).
- One clear ask or value proposition.
- Under 300 characters for connection requests; up to 1000 for messages.
- Output ONLY the message text. No JSON."""
    else:
        system = """You are a career coach. Generate a LinkedIn connection request.
Rules:
- Max 300 characters (LinkedIn limit).
- Personal: reference their role, company, or a shared interest.
- One sentence about why connecting makes sense.
- No generic "I'd love to connect." Be specific.
- Output ONLY the connection request text. No JSON."""

    user_content = f"Profile:\n{profile_ctx}\n\n"
    if recipient_name:
        user_content += f"Recipient: {recipient_name}\n"
    if company:
        user_content += f"Company: {company}\n"
    if role:
        user_content += f"Role: {role}\n"
    if context:
        user_content += f"Context: {context}\n"

    raw = _call_llm(system, user_content, max_tokens=400)
    text = (raw or "").strip() if raw else ""
    return JSONResponse(content={"text": text, "type": template_type, "recipient_name": recipient_name, "company": company})


@router.post("/templates/interview-prep")
async def template_interview_prep(request: Request, body: dict = Body(...)):
    """
    Generate common interview questions + personalized stories from their profile.
    """
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    company = (body.get("company") or "").strip()
    role = (body.get("role") or body.get("job_title") or "").strip()
    job_description = (body.get("job_description") or body.get("jd") or "").strip()

    profile_ctx = get_profile_context_for_templates(email)
    if not profile_ctx:
        return JSONResponse(status_code=400, content={"error": "No profile on file. Upload a resume first."})

    system = """You are a career coach. Generate interview prep: common questions + personalized answer hints.
Output a JSON object:
{
  "questions": [
    {
      "question": "Tell me about a time you showed leadership.",
      "dimension": "Grit",
      "hint": "Use your [specific experience from their profile] - focus on the outcome.",
      "story_hook": "30-second opening line they could use"
    }
  ]
}
Rules:
- 4–6 questions. Mix behavioral (STAR) and role-specific.
- Each hint must cite actual evidence from their profile.
- story_hook: first sentence they could say to launch their answer.
- Output ONLY the JSON object."""

    user_content = f"Profile:\n{profile_ctx}\n\n"
    if company:
        user_content += f"Company: {company}\n"
    if role:
        user_content += f"Role: {role}\n"
    if job_description:
        user_content += f"Job description:\n{job_description[:2000]}\n"

    raw = _call_llm(system, user_content, max_tokens=1200)
    parsed = _parse_json_or_text(raw)
    questions = []
    if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list):
        for q in parsed["questions"][:8]:
            if isinstance(q, dict) and q.get("question"):
                questions.append({
                    "question": (q.get("question") or "").strip()[:300],
                    "dimension": (q.get("dimension") or "General").strip()[:40],
                    "hint": (q.get("hint") or "").strip()[:400],
                    "story_hook": (q.get("story_hook") or "").strip()[:300],
                })

    return JSONResponse(content={"questions": questions, "company": company, "role": role})


@router.post("/templates/resume-tailor")
async def template_resume_tailor(request: Request, body: dict = Body(...)):
    """
    Generate tailored bullet suggestions for a role. One base resume, many role-specific versions.
    Returns suggested rewrites for key bullets to better match the JD.
    """
    user = deps.require_auth(request)
    deps.require_subscribed(request)
    email = (user.get("email") or "").strip().lower()
    job_description = (body.get("job_description") or body.get("jd") or "").strip()
    company = (body.get("company") or "").strip()
    role = (body.get("role") or body.get("job_title") or "").strip()

    if not job_description and not (company and role):
        return JSONResponse(status_code=400, content={"error": "job_description or company+role required"})

    profile_ctx = get_profile_context_for_templates(email)
    if not profile_ctx:
        return JSONResponse(status_code=400, content={"error": "No profile or resume on file. Upload a resume first."})

    system = """You are a career coach. Given a student's resume and a job description, suggest tailored bullet rewrites.
Output a JSON object:
{
  "suggestions": [
    {
      "original": "Their current bullet text",
      "tailored": "Rewritten bullet that better matches the JD",
      "role_keywords": "Keywords from JD this addresses",
      "rationale": "One sentence why this helps"
    }
  ]
}
Rules:
- 3–5 suggestions. Pick their strongest bullets that could be tightened for this role.
- Tailored bullets: same facts, different framing. Add metrics if implied. Use JD language.
- Keep each tailored bullet under 2 lines.
- Output ONLY the JSON object."""

    user_content = f"Profile/Resume:\n{profile_ctx}\n\n"
    if company:
        user_content += f"Company: {company}\n"
    if role:
        user_content += f"Role: {role}\n"
    user_content += f"Job description:\n{job_description[:3000]}\n"

    raw = _call_llm(system, user_content, max_tokens=1500)
    parsed = _parse_json_or_text(raw)
    suggestions = []
    if isinstance(parsed, dict) and isinstance(parsed.get("suggestions"), list):
        for s in parsed["suggestions"][:6]:
            if isinstance(s, dict) and s.get("original") and s.get("tailored"):
                suggestions.append({
                    "original": (s.get("original") or "").strip()[:400],
                    "tailored": (s.get("tailored") or "").strip()[:400],
                    "role_keywords": (s.get("role_keywords") or "").strip()[:100],
                    "rationale": (s.get("rationale") or "").strip()[:200],
                })

    return JSONResponse(content={"suggestions": suggestions, "company": company, "role": role})
