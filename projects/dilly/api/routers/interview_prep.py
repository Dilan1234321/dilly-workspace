"""
Interview prep endpoints:
  POST /calendar/generate-prep-schedule — auto-generate prep blocks for an interview
  POST /interview/prep-deck             — generate a prep deck with gap-flagged questions
"""

import os
import sys
import uuid as _uuid
from datetime import date, datetime, timedelta
from typing import Any, Optional

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from projects.dilly.api import deps, errors
from projects.dilly.api.cohort_scoring_weights import COHORT_SCORING_WEIGHTS
from projects.dilly.api.profile_store import get_profile, save_profile
from projects.dilly.api.audit_history import get_audits

router = APIRouter(tags=["interview_prep"])


# ─── Prep Schedule ────────────────────────────────────────────────────────────

class PrepScheduleRequest(BaseModel):
    interview_date: str
    company: str
    role: str
    track: Optional[str] = None


class PrepBlock(BaseModel):
    id: str
    label: str
    date: str
    type: str = "prep"
    prep_type: str
    createdBy: str = "dilly"


# Track-specific technical prep descriptions
_TRACK_TECHNICAL_PREP: dict[str, str] = {
    "software_engineering_cs": "LeetCode medium arrays + system design practice",
    "data_science_analytics": "SQL window functions + case study walkthrough",
    "finance_accounting": "DCF walkthrough + market sizing practice",
    "consulting_strategy": "Case interview frameworks + market sizing",
    "marketing_advertising": "Campaign analytics case study + portfolio review",
    "management_operations": "Operations case study + leadership scenario prep",
    "healthcare_clinical": "Clinical scenario review + patient care questions",
    "cybersecurity_it": "Security architecture + incident response scenarios",
    "law_government": "Legal reasoning + policy analysis prep",
    "biotech_pharmaceutical": "Research methodology + lab technique review",
    "mechanical_aerospace_engineering": "Technical design review + FEA/CAD problems",
    "electrical_computer_engineering": "Circuit design + embedded systems review",
    "design_creative_arts": "Portfolio case study review + design critique prep",
    "education_human_development": "Teaching demo prep + pedagogy scenarios",
    "social_sciences_nonprofit": "Grant writing review + program evaluation prep",
    "media_communications": "Media kit review + content strategy case study",
    "life_sciences_research": "Research presentation + methodology defense prep",
    "economics_public_policy": "Policy memo writing + economic model review",
    "entrepreneurship_innovation": "Pitch deck review + business model analysis",
    "physical_sciences_math": "Problem-solving workshop + research presentation",
    "chemical_biomedical_engineering": "Process design + safety protocol review",
    "civil_environmental_engineering": "Structural analysis + project management cases",
}

_DEFAULT_TECHNICAL_PREP = "Technical preparation for your role — review key concepts and practice problems"


def _resolve_track(track: str | None, email: str) -> str:
    """Resolve the track for prep generation."""
    if track and track in COHORT_SCORING_WEIGHTS:
        return track
    profile = get_profile(email) or {}
    pt = (profile.get("track") or "").strip()
    if pt and pt in COHORT_SCORING_WEIGHTS:
        return pt
    audits = get_audits(email)
    if audits:
        dt = (audits[0].get("detected_track") or "").strip()
        if dt and dt in COHORT_SCORING_WEIGHTS:
            return dt
    return "software_engineering_cs"


def _generate_prep_blocks(
    interview_date: str,
    company: str,
    role: str,
    track: str,
) -> list[dict]:
    """Generate prep schedule blocks leading up to an interview."""
    try:
        idate = datetime.strptime(interview_date[:10], "%Y-%m-%d").date()
    except ValueError:
        return []

    tech_prep = _TRACK_TECHNICAL_PREP.get(track, _DEFAULT_TECHNICAL_PREP)
    blocks: list[dict] = []

    # 7 days before: Company research
    research_date = idate - timedelta(days=7)
    if research_date >= date.today():
        blocks.append({
            "id": str(_uuid.uuid4()),
            "label": f"Research {company} — culture, recent news, team structure",
            "date": research_date.isoformat(),
            "type": "prep",
            "prep_type": "company_research",
            "createdBy": "dilly",
        })

    # 4 days before: More company research if early enough
    research2_date = idate - timedelta(days=4)
    if research2_date >= date.today() and research2_date != research_date:
        blocks.append({
            "id": str(_uuid.uuid4()),
            "label": f"Deep dive: {company} competitors, strategy, recent earnings/launches",
            "date": research2_date.isoformat(),
            "type": "prep",
            "prep_type": "company_research",
            "createdBy": "dilly",
        })

    # 3 days before: Technical prep
    tech_date = idate - timedelta(days=3)
    if tech_date >= date.today():
        blocks.append({
            "id": str(_uuid.uuid4()),
            "label": tech_prep,
            "date": tech_date.isoformat(),
            "type": "prep",
            "prep_type": "technical_prep",
            "createdBy": "dilly",
        })

    # 2 days before: More technical prep
    tech2_date = idate - timedelta(days=2)
    if tech2_date >= date.today():
        track_label = COHORT_SCORING_WEIGHTS.get(track, {}).get("label", track)
        blocks.append({
            "id": str(_uuid.uuid4()),
            "label": f"Technical deep practice — {track_label} focus areas",
            "date": tech2_date.isoformat(),
            "type": "prep",
            "prep_type": "technical_prep",
            "createdBy": "dilly",
        })

    # 1 day before: Behavioral prep
    behav_date = idate - timedelta(days=1)
    if behav_date >= date.today():
        blocks.append({
            "id": str(_uuid.uuid4()),
            "label": f"Behavioral prep — STAR stories for {COHORT_SCORING_WEIGHTS.get(track, {}).get('label', track)} interviews",
            "date": behav_date.isoformat(),
            "type": "prep",
            "prep_type": "behavioral_prep",
            "createdBy": "dilly",
        })

    # Day of: Interview day
    blocks.append({
        "id": str(_uuid.uuid4()),
        "label": f"Interview day — {company} {role}",
        "date": idate.isoformat(),
        "type": "prep",
        "prep_type": "day_of",
        "createdBy": "dilly",
    })

    return blocks


@router.post("/calendar/generate-prep-schedule")
async def generate_prep_schedule(req: PrepScheduleRequest, request: Request):
    user = deps.require_auth(request)
    email = user.get("email") or ""

    track = _resolve_track(req.track, email)
    blocks = _generate_prep_blocks(req.interview_date, req.company, req.role, track)

    if not blocks:
        return {"blocks": [], "saved": 0}

    # Save as DillyDeadline entries
    profile = get_profile(email) or {}
    deadlines = profile.get("deadlines") or []
    if not isinstance(deadlines, list):
        deadlines = []

    for block in blocks:
        deadlines.append({
            "id": block["id"],
            "label": block["label"],
            "date": block["date"],
            "type": block["type"],
            "prep_type": block.get("prep_type"),
            "createdBy": "dilly",
        })

    profile["deadlines"] = deadlines
    save_profile(email, profile)

    return {"blocks": blocks, "saved": len(blocks)}


# ─── Interview Prep Deck ──────────────────────────────────────────────────────

class PrepDeckRequest(BaseModel):
    company: str
    role: str
    track: Optional[str] = None
    job_description: Optional[str] = None  # When provided, generates JD-specific questions via Claude


# Track-specific question banks (rule-based for speed)
_TRACK_QUESTION_BANKS: dict[str, list[dict]] = {
    "software_engineering_cs": [
        {"question": "Walk me through your approach to system design", "category": "technical", "probability": "high"},
        {"question": "Describe a time you debugged a complex production issue", "category": "behavioral", "probability": "high"},
        {"question": "Explain the tradeoffs between SQL and NoSQL databases", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a project you built from scratch", "category": "behavioral", "probability": "high"},
        {"question": "How would you design a rate limiter?", "category": "technical", "probability": "medium"},
        {"question": "Describe a time you disagreed with a teammate on a technical decision", "category": "behavioral", "probability": "medium"},
        {"question": "What's your experience with CI/CD pipelines?", "category": "technical", "probability": "medium"},
        {"question": "How do you approach code reviews?", "category": "behavioral", "probability": "low"},
    ],
    "finance_accounting": [
        {"question": "Walk me through a DCF", "category": "technical", "probability": "high"},
        {"question": "How would you value a company with negative earnings?", "category": "technical", "probability": "high"},
        {"question": "Tell me about a time you worked under tight deadlines", "category": "behavioral", "probability": "high"},
        {"question": "What's the difference between enterprise value and equity value?", "category": "technical", "probability": "high"},
        {"question": "Walk me through the three financial statements", "category": "technical", "probability": "high"},
        {"question": "Describe a market sizing exercise you've done", "category": "technical", "probability": "medium"},
        {"question": "Why this firm over competitors?", "category": "fit", "probability": "high"},
        {"question": "Tell me about a leadership experience", "category": "behavioral", "probability": "medium"},
    ],
    "consulting_strategy": [
        {"question": "How would you approach a market entry case?", "category": "technical", "probability": "high"},
        {"question": "Walk me through a profitability case", "category": "technical", "probability": "high"},
        {"question": "Tell me about a time you led a team through ambiguity", "category": "behavioral", "probability": "high"},
        {"question": "How would you size the market for electric scooters in NYC?", "category": "technical", "probability": "medium"},
        {"question": "Describe a time you had to influence without authority", "category": "behavioral", "probability": "high"},
        {"question": "What industry trends are you following?", "category": "fit", "probability": "medium"},
        {"question": "How do you structure your thinking on a new problem?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a failure and what you learned", "category": "behavioral", "probability": "high"},
    ],
    "data_science_analytics": [
        {"question": "Explain the bias-variance tradeoff", "category": "technical", "probability": "high"},
        {"question": "How would you design an A/B test?", "category": "technical", "probability": "high"},
        {"question": "Walk me through a project where data drove a business decision", "category": "behavioral", "probability": "high"},
        {"question": "What's the difference between L1 and L2 regularization?", "category": "technical", "probability": "medium"},
        {"question": "How would you handle missing data in a large dataset?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time you communicated complex findings to non-technical stakeholders", "category": "behavioral", "probability": "high"},
        {"question": "What metrics would you track for a subscription product?", "category": "technical", "probability": "medium"},
        {"question": "Describe your experience with SQL and data pipelines", "category": "technical", "probability": "medium"},
    ],
    "design_creative_arts": [
        {"question": "Walk me through your design process for a recent project", "category": "technical", "probability": "high"},
        {"question": "How do you handle stakeholder feedback that conflicts with user research?", "category": "behavioral", "probability": "high"},
        {"question": "Describe how you conduct user research", "category": "technical", "probability": "high"},
        {"question": "Show me a project where you iterated based on user feedback", "category": "technical", "probability": "high"},
        {"question": "How do you prioritize features in a design sprint?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time you advocated for accessibility", "category": "behavioral", "probability": "medium"},
        {"question": "What design tools are you most proficient in?", "category": "fit", "probability": "low"},
        {"question": "How do you measure the success of a design?", "category": "technical", "probability": "medium"},
    ],
}

# Default question bank for tracks without a specific bank
_DEFAULT_QUESTION_BANK: list[dict] = [
    {"question": "Tell me about yourself and why you're interested in this role", "category": "fit", "probability": "high"},
    {"question": "Describe a challenging project you worked on", "category": "behavioral", "probability": "high"},
    {"question": "What's your greatest strength relevant to this position?", "category": "behavioral", "probability": "high"},
    {"question": "Tell me about a time you failed and what you learned", "category": "behavioral", "probability": "high"},
    {"question": "Where do you see yourself in five years?", "category": "fit", "probability": "medium"},
    {"question": "Describe a time you worked on a team with conflicting opinions", "category": "behavioral", "probability": "medium"},
    {"question": "Why this company?", "category": "fit", "probability": "high"},
    {"question": "What questions do you have for us?", "category": "fit", "probability": "high"},
]


def _get_dimension_gaps(latest_audit: dict | None, track: str) -> list[dict]:
    """Compute dimension gaps vs cohort bar."""
    if not latest_audit:
        return []
    scores = latest_audit.get("scores") or {}
    cohort = COHORT_SCORING_WEIGHTS.get(track, {})
    bar = cohort.get("recruiter_bar", 70)
    weights = {
        "smart": cohort.get("smart", 33),
        "grit": cohort.get("grit", 33),
        "build": cohort.get("build", 34),
    }
    gaps = []
    for dim in ("smart", "grit", "build"):
        score = float(scores.get(dim) or 0)
        # Weighted target: if bar is 75, dimension at weight 40 matters more
        target = bar * (weights[dim] / 100.0) * (100 / max(1, weights[dim]))
        gap = max(0, int(round(target - score)))
        if gap > 0:
            focus = {
                "smart": "Strengthen academic/technical foundations",
                "grit": "Show more persistence and follow-through evidence",
                "build": "Add tangible portfolio projects or deliverables",
            }.get(dim, "Improve this dimension")
            gaps.append({"dimension": dim.capitalize(), "gap": gap, "focus": focus})
    gaps.sort(key=lambda g: g["gap"], reverse=True)
    return gaps


def _flag_questions_by_gaps(
    questions: list[dict], gaps: list[dict]
) -> list[dict]:
    """Annotate questions with gap-based flags."""
    weak_dims = {g["dimension"].lower() for g in gaps[:2]}
    flagged = []
    for q in questions:
        cat = q.get("category", "").lower()
        prob = q.get("probability", "medium")
        why = ""
        tip = ""

        # Technical questions map to Build/Smart weakness
        if cat == "technical" and ("build" in weak_dims or "smart" in weak_dims):
            prob = "high"
            dim = "Build" if "build" in weak_dims else "Smart"
            gap_info = next((g for g in gaps if g["dimension"].lower() in ("build", "smart")), None)
            why = f"Your {dim} score shows room for growth" + (f" (gap: {gap_info['gap']} pts)" if gap_info else "")
            tip = gap_info["focus"] if gap_info else ""

        # Behavioral questions map to Grit weakness
        elif cat == "behavioral" and "grit" in weak_dims:
            prob = "high"
            gap_info = next((g for g in gaps if g["dimension"].lower() == "grit"), None)
            why = "Your Grit score suggests limited persistence evidence" + (f" (gap: {gap_info['gap']} pts)" if gap_info else "")
            tip = gap_info["focus"] if gap_info else ""

        flagged.append({
            "question": q["question"],
            "category": q.get("category", "general"),
            "probability": prob,
            "why_flagged": why or f"Common {q.get('category', 'general')} question for this role",
            "prep_tip": tip or f"Practice answering this with specific examples",
        })
    return flagged


def _generate_company_insights(company: str, track: str) -> str:
    """Generate rule-based company insights. Fast path — no LLM call."""
    track_label = COHORT_SCORING_WEIGHTS.get(track, {}).get("label", track)
    return (
        f"{company} values candidates who demonstrate strong domain expertise in {track_label}. "
        f"Research their recent initiatives, team culture, and how your background aligns."
    )


async def _generate_jd_specific_questions(
    company: str, role: str, job_description: str, track: str,
) -> list[dict]:
    """
    Use Claude to generate 6-8 interview questions specific to the
    company + role + JD. Returns the same shape as the static banks.
    Falls back to empty list on any error so the caller can use the
    rule-based bank instead.
    """
    if not job_description or len(job_description.strip()) < 50:
        return []

    track_label = COHORT_SCORING_WEIGHTS.get(track, {}).get("label", track)
    system = f"""You are a senior interviewer at {company} hiring for {role}.
Generate exactly 8 interview questions a real interviewer would ask for this specific role.

JOB DESCRIPTION:
{job_description[:4000]}

REQUIREMENTS:
1. Mix of technical (3-4), behavioral (2-3), and company-fit (1-2) questions.
2. Reference SPECIFIC skills, tools, or requirements from the JD.
3. Questions should feel like they come from someone who works at {company}, not generic.
4. For technical questions, reference technologies or methods mentioned in the JD.
5. For behavioral questions, relate to scenarios that would occur in this specific role.
6. Include one "Why {company}?" question that references something specific about the company.

Return ONLY a JSON array of objects, each with:
  "question": the interview question text,
  "category": "technical" | "behavioral" | "fit",
  "probability": "high" | "medium",
  "why_flagged": one sentence explaining why this question is likely for this role,
  "prep_tip": one sentence of specific advice on how to answer well

No markdown, no prose, just the JSON array."""

    try:
        import anthropic, json as _json
        client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            # 8 questions × ~100 tokens each = ~800. Was 1500 (padding).
            max_tokens=1000,
            system=system,
            messages=[{"role": "user", "content": f"Generate the 8 interview questions for {role} at {company}."}],
        )
        raw = "".join(getattr(b, "text", "") or "" for b in (msg.content or []))
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```", 2)[1] if "```" in cleaned[3:] else cleaned[3:]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        questions = _json.loads(cleaned)
        if isinstance(questions, list) and len(questions) > 0:
            # Validate shape
            return [
                {
                    "question": str(q.get("question", "")).strip(),
                    "category": str(q.get("category", "general")).strip(),
                    "probability": str(q.get("probability", "high")).strip(),
                    "why_flagged": str(q.get("why_flagged", "")).strip(),
                    "prep_tip": str(q.get("prep_tip", "")).strip(),
                }
                for q in questions[:8]
                if q.get("question")
            ]
    except Exception as _exc:
        sys.stderr.write(f"[jd_questions_failed] {type(_exc).__name__}: {str(_exc)[:200]}\n")
    return []


@router.post("/interview/prep-deck")
async def generate_prep_deck(req: PrepDeckRequest, request: Request):
    user = deps.require_auth(request)
    email = user.get("email") or ""

    # Tier gate: JD-based interview prep is a paid feature. The static
    # fallback question bank is also only useful with a decent profile,
    # so we block all starter calls here rather than letting the
    # handler proceed and burn a Haiku call on _generate_jd_specific_
    # questions.
    try:
        from projects.dilly.api.profile_store import get_profile as _gp
        _plan = ((_gp(email) or {}).get("plan") or "starter").lower().strip()
    except Exception:
        _plan = "starter"
    if _plan == "starter":
        raise HTTPException(
            status_code=402,
            detail={
                "code": "INTERVIEW_PREP_REQUIRES_PLAN",
                "message": "Interview prep is a Dilly feature.",
                "plan": _plan,
                "required_plan": "dilly",
                "features_unlocked": [
                    "Role-specific interview questions per company",
                    "Mock interview practice with feedback",
                    "Scripts you can rehearse",
                    "Unlimited chat with Dilly",
                ],
            },
        )

    track = _resolve_track(req.track, email)
    audits = get_audits(email)
    latest_audit = audits[0] if audits else None

    # If JD is provided, generate company+JD-specific questions via Claude.
    # Falls back to the static question bank if generation fails.
    jd_questions: list[dict] = []
    if req.job_description and len(req.job_description.strip()) > 50:
        jd_questions = await _generate_jd_specific_questions(
            req.company, req.role, req.job_description, track,
        )

    if jd_questions:
        # Use JD-specific questions as the primary set
        flagged_questions = jd_questions
    else:
        # Fall back to static question bank + gap-based flagging
        questions = _TRACK_QUESTION_BANKS.get(track, _DEFAULT_QUESTION_BANK)
        gaps = _get_dimension_gaps(latest_audit, track)
        flagged_questions = _flag_questions_by_gaps(questions, gaps)

    # Compute dimension gaps (always, for the review phase)
    gaps = _get_dimension_gaps(latest_audit, track)

    # Sort: high probability first
    prob_order = {"high": 0, "medium": 1, "low": 2}
    flagged_questions.sort(key=lambda q: prob_order.get(q.get("probability", "medium"), 1))
    flagged_questions = flagged_questions[:8]

    track_label = COHORT_SCORING_WEIGHTS.get(track, {}).get("label", track)
    company_insights = _generate_company_insights(req.company, track)

    return {
        "company": req.company,
        "role": req.role,
        "track": track,
        "track_label": track_label,
        "questions": flagged_questions,
        "dimension_gaps": gaps,
        "company_insights": company_insights,
        "jd_powered": len(jd_questions) > 0,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
