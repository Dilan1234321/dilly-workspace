"""
Interview feedback endpoint:
  POST /interview/feedback - AI-powered interview practice feedback using Dilly Profile
"""

import json
import os
import sys

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, Body, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional

from projects.dilly.api import deps

router = APIRouter(tags=["interview_prep"])


# ---------------------------------------------------------------------------
# Profile text builder (same pattern as jobs_narrative.py)
# ---------------------------------------------------------------------------
def _build_profile_text(profile: dict, facts: list[dict]) -> str:
    """Assemble profile data into a structured text block for the LLM."""
    parts: list[str] = []

    name = profile.get("name") or profile.get("full_name") or "Unknown"
    parts.append(f"Name: {name}")
    school = profile.get("school") or ""
    if school:
        parts.append(f"School: {school}")
    major = profile.get("major") or ""
    minors = profile.get("minors") or profile.get("minor") or ""
    if major:
        parts.append(f"Major: {major}")
    if minors:
        parts.append(f"Minor(s): {minors if isinstance(minors, str) else ', '.join(minors)}")
    gpa = profile.get("gpa") or profile.get("transcript_gpa")
    if gpa:
        parts.append(f"GPA: {gpa}")
    class_year = profile.get("class_year") or profile.get("graduation_year") or ""
    if class_year:
        parts.append(f"Class Year: {class_year}")
    target = profile.get("application_target") or "exploring"
    parts.append(f"Application Target: {target}")

    cohorts = profile.get("cohorts") or []
    if cohorts:
        parts.append(f"Cohorts: {', '.join(cohorts)}")

    if facts:
        by_cat: dict[str, list[str]] = {}
        for f in facts:
            cat = f.get("category", "other")
            text = f"{f.get('label', '')}: {f.get('value', '')}".strip()
            if text and text != ":":
                by_cat.setdefault(cat, []).append(text)
        for cat, items in sorted(by_cat.items()):
            parts.append(f"\n[{cat.upper()}]")
            for item in items[:30]:
                parts.append(f"  - {item}")

    beyond = profile.get("beyond_resume") or []
    if beyond:
        parts.append("\n[ADDITIONAL INFO]")
        for item in beyond[:20]:
            if isinstance(item, dict):
                t = item.get("type", "")
                text = item.get("text", "")
                if text:
                    parts.append(f"  - [{t}] {text}")

    expansion = profile.get("experience_expansion") or []
    if expansion:
        parts.append("\n[EXPERIENCE DETAILS]")
        for entry in expansion[:10]:
            if not isinstance(entry, dict):
                continue
            role = entry.get("role_label", "")
            org = entry.get("organization", "")
            label = f"{role} at {org}" if org else role
            if not label:
                continue
            parts.append(f"  {label}")
            skills = entry.get("skills") or []
            if skills:
                parts.append(f"    Skills: {', '.join(skills[:15])}")
            tools = entry.get("tools_used") or []
            if tools:
                parts.append(f"    Tools: {', '.join(tools[:15])}")

    goals = profile.get("goals") or []
    if goals:
        parts.append(f"\nGoals: {', '.join(str(g) for g in goals[:5])}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class QuestionAnswer(BaseModel):
    question: str
    answer: str
    category: Optional[str] = "general"


class InterviewFeedbackRequest(BaseModel):
    company: str
    role: str
    job_description: str
    questions_and_answers: List[QuestionAnswer]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/interview/feedback")
async def interview_feedback(req: InterviewFeedbackRequest, request: Request):
    """Generate AI-powered feedback on interview practice answers."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    if not req.company.strip() or not req.role.strip():
        raise HTTPException(status_code=400, detail="Company and role are required.")

    if not req.questions_and_answers:
        raise HTTPException(status_code=400, detail="At least one question is required.")

    # Load profile and facts
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.memory_surface_store import get_memory_surface

    profile = get_profile(email) or {}
    surface = get_memory_surface(email)
    facts = surface.get("items") or []

    profile_text = _build_profile_text(profile, facts)

    # Build Q&A text
    qa_lines: list[str] = []
    for i, qa in enumerate(req.questions_and_answers, 1):
        answer_text = qa.answer.strip() if qa.answer.strip() else "[SKIPPED]"
        qa_lines.append(f"Q{i} ({qa.category}): {qa.question}")
        qa_lines.append(f"A{i}: {answer_text}")
        qa_lines.append("")
    qa_text = "\n".join(qa_lines)

    system_prompt = (
        "You are a senior interview coach at a top career consulting firm. "
        "You just watched a candidate practice for a specific role. "
        "Give honest, actionable, role-specific feedback.\n\n"
        "For each answer, assess: did they demonstrate what THIS specific role "
        "at THIS specific company needs? Reference the job description requirements.\n\n"
        "Never use em dashes. Be specific and cite their actual words. Don't be generic.\n\n"
        "Return JSON only:\n"
        "{\n"
        '  "verdict": "ready" | "almost" | "needs_work",\n'
        '  "overall": "2-3 sentences about their overall performance for THIS role. Cite specific answers.",\n'
        '  "top_strength": "One thing they did well, citing a specific answer.",\n'
        '  "priority_fix": "One thing to work on. Be specific to this role.",\n'
        '  "per_question": [\n'
        "    {\n"
        '      "rating": "strong" | "needs_work" | "weak" | "skipped",\n'
        '      "feedback": "2-3 sentences. What was good? What was missing? Specific to the role.",\n'
        '      "model_answer": "A strong candidate for THIS role at THIS company might say: [2-3 sentence example]"\n'
        "    }\n"
        "  ],\n"
        '  "action_items": [\n'
        '    "Specific thing to practice or prepare. Not generic."\n'
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- verdict: ready = performed well on most questions, almost = close but with fixable gaps, "
        "needs_work = significant preparation still needed\n"
        "- per_question array MUST have the same length as the number of questions\n"
        "- If an answer is [SKIPPED], set rating to 'skipped' and still provide a model_answer\n"
        "- Model answers should be realistic and role-specific, not generic STAR templates\n"
        "- action_items: exactly 2-3 items, each specific to this role at this company\n"
        "- Never use em dashes. Use hyphens, commas, or periods instead."
    )

    user_message = (
        f"Role: {req.role} at {req.company}\n"
        f"Job Description: {req.job_description[:3000]}\n\n"
        f"Profile (candidate's background):\n{profile_text[:2000]}\n\n"
        f"Questions and Answers:\n{qa_text}"
    )

    try:
        import anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="AI service not configured.")

        client = anthropic.AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

        raw = "".join(getattr(b, "text", "") or "" for b in (response.content or []))
        raw = raw.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()

        parsed = json.loads(raw)

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="AI returned an invalid response. Please try again.",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[INTERVIEW-FEEDBACK] Error calling Claude: {e}", flush=True)
        raise HTTPException(
            status_code=502,
            detail="AI service error. Please try again.",
        )

    # Validate response shape
    verdict = parsed.get("verdict", "almost")
    if verdict not in ("ready", "almost", "needs_work"):
        verdict = "almost"

    per_question = parsed.get("per_question", [])
    # Ensure per_question has the right length
    while len(per_question) < len(req.questions_and_answers):
        per_question.append({
            "rating": "skipped",
            "feedback": "No feedback available for this question.",
            "model_answer": "",
        })
    per_question = per_question[: len(req.questions_and_answers)]

    # Validate each per_question entry
    validated_pq = []
    for pq in per_question:
        rating = pq.get("rating", "needs_work")
        if rating not in ("strong", "needs_work", "weak", "skipped"):
            rating = "needs_work"
        validated_pq.append({
            "rating": rating,
            "feedback": pq.get("feedback", ""),
            "model_answer": pq.get("model_answer", ""),
        })

    action_items = parsed.get("action_items", [])
    if not isinstance(action_items, list):
        action_items = []
    action_items = [str(a) for a in action_items[:3]]

    return {
        "verdict": verdict,
        "overall": parsed.get("overall", ""),
        "top_strength": parsed.get("top_strength", ""),
        "priority_fix": parsed.get("priority_fix", ""),
        "per_question": validated_pq,
        "action_items": action_items,
    }
