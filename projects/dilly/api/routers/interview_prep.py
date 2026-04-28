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
    # ── Added 2026-04-21. Eleven cohort banks so every major user
    # track gets real questions instead of the generic default bank.
    # Each bank: 8 questions, 3-4 technical, 2-3 behavioral, 1-2 fit.
    # Rule of thumb: questions should feel like they were written by
    # someone who has actually interviewed in that domain.
    "cybersecurity_it": [
        {"question": "You detect a lateral movement alert at 2am — walk me through your first 30 minutes", "category": "technical", "probability": "high"},
        {"question": "Explain the difference between vulnerability, threat, and risk", "category": "technical", "probability": "high"},
        {"question": "Tell me about a time you found a security issue others missed", "category": "behavioral", "probability": "high"},
        {"question": "How would you harden an S3 bucket that's been flagged public?", "category": "technical", "probability": "high"},
        {"question": "Describe a SIEM query you've written and what it detected", "category": "technical", "probability": "medium"},
        {"question": "Walk me through the MITRE ATT&CK framework and one technique you've studied", "category": "technical", "probability": "medium"},
        {"question": "Describe a time you had to communicate a security risk to a non-technical stakeholder", "category": "behavioral", "probability": "high"},
        {"question": "Why security specifically, and why this company's team?", "category": "fit", "probability": "high"},
    ],
    "healthcare_clinical": [
        {"question": "Walk me through a clinical scenario where you had to prioritize patients", "category": "technical", "probability": "high"},
        {"question": "Describe a time you disagreed with a physician's plan — how did you handle it?", "category": "behavioral", "probability": "high"},
        {"question": "How do you approach informed consent with a hesitant patient?", "category": "technical", "probability": "high"},
        {"question": "Tell me about a time you caught a medication error", "category": "behavioral", "probability": "high"},
        {"question": "How do you stay current with evidence-based practice?", "category": "fit", "probability": "medium"},
        {"question": "Describe your experience with interdisciplinary teams", "category": "behavioral", "probability": "medium"},
        {"question": "Walk me through your documentation workflow", "category": "technical", "probability": "medium"},
        {"question": "Why this unit/specialty specifically?", "category": "fit", "probability": "high"},
    ],
    "law_government": [
        {"question": "Walk me through how you'd research a novel legal question", "category": "technical", "probability": "high"},
        {"question": "Describe a time you had to persuade someone with a different perspective", "category": "behavioral", "probability": "high"},
        {"question": "Tell me about a writing sample you're most proud of", "category": "technical", "probability": "high"},
        {"question": "How do you approach ambiguity in a statute or regulation?", "category": "technical", "probability": "medium"},
        {"question": "Describe a time you worked under extreme deadline pressure", "category": "behavioral", "probability": "high"},
        {"question": "What area of law/policy are you most drawn to, and why?", "category": "fit", "probability": "high"},
        {"question": "Walk me through how you'd structure a memo on a complex fact pattern", "category": "technical", "probability": "medium"},
        {"question": "Why this firm/agency over its peers?", "category": "fit", "probability": "high"},
    ],
    "biotech_pharmaceutical": [
        {"question": "Walk me through a protocol you designed or executed — what tradeoffs did you make?", "category": "technical", "probability": "high"},
        {"question": "Describe a time an experiment failed — what did you do next?", "category": "behavioral", "probability": "high"},
        {"question": "How do you approach literature review before starting a new project?", "category": "technical", "probability": "high"},
        {"question": "Tell me about a time you had to defend your methodology", "category": "behavioral", "probability": "medium"},
        {"question": "Walk me through your experience with GLP/GMP/GCP — whichever is relevant", "category": "technical", "probability": "medium"},
        {"question": "Describe your wet-lab vs computational comfort zone", "category": "fit", "probability": "medium"},
        {"question": "How do you manage a project with long feedback loops?", "category": "behavioral", "probability": "medium"},
        {"question": "Why this therapeutic area / this company's pipeline?", "category": "fit", "probability": "high"},
    ],
    "mechanical_aerospace_engineering": [
        {"question": "Walk me through the design of something you built — what were the key constraints?", "category": "technical", "probability": "high"},
        {"question": "How would you approach a CAD/FEA problem where simulation diverges from prototype data?", "category": "technical", "probability": "high"},
        {"question": "Describe a time you had to iterate on a design based on testing results", "category": "behavioral", "probability": "high"},
        {"question": "Walk me through a stress analysis you've done", "category": "technical", "probability": "medium"},
        {"question": "How do you handle tolerance stackup in a multi-part assembly?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time you had to make a decision with incomplete data", "category": "behavioral", "probability": "medium"},
        {"question": "What's your most unusual side project?", "category": "fit", "probability": "low"},
        {"question": "Why this industry / why this company's product?", "category": "fit", "probability": "high"},
    ],
    "electrical_computer_engineering": [
        {"question": "Walk me through the board you designed or debugged — what went wrong first?", "category": "technical", "probability": "high"},
        {"question": "How would you approach debugging an intermittent hardware fault?", "category": "technical", "probability": "high"},
        {"question": "Explain the tradeoffs between FPGA and ASIC for a specific use case", "category": "technical", "probability": "medium"},
        {"question": "Describe a firmware bug that was hard to reproduce — how did you find it?", "category": "behavioral", "probability": "high"},
        {"question": "How do you approach power-budgeting on a battery-powered device?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a project where hardware and software teams disagreed", "category": "behavioral", "probability": "medium"},
        {"question": "What's the most interesting datasheet you've read recently?", "category": "fit", "probability": "low"},
        {"question": "Why embedded/hardware vs pure software?", "category": "fit", "probability": "high"},
    ],
    "education_human_development": [
        {"question": "Walk me through a lesson you'd teach on a topic you know well", "category": "technical", "probability": "high"},
        {"question": "Describe a time you adapted your approach for a student who was struggling", "category": "behavioral", "probability": "high"},
        {"question": "How do you assess learning beyond tests and grades?", "category": "technical", "probability": "high"},
        {"question": "Tell me about a parent or stakeholder conversation you handled well", "category": "behavioral", "probability": "medium"},
        {"question": "How do you approach classroom management for a difficult class?", "category": "technical", "probability": "medium"},
        {"question": "Describe how you've used data to improve student outcomes", "category": "behavioral", "probability": "medium"},
        {"question": "What's your philosophy on equity in your content area?", "category": "fit", "probability": "medium"},
        {"question": "Why this school/district/program specifically?", "category": "fit", "probability": "high"},
    ],
    "social_sciences_nonprofit": [
        {"question": "Walk me through a program you've evaluated — what did the data show?", "category": "technical", "probability": "high"},
        {"question": "Describe a time you had to align stakeholders with competing priorities", "category": "behavioral", "probability": "high"},
        {"question": "How do you approach survey design for a hard-to-reach population?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a grant or proposal you've written", "category": "technical", "probability": "high"},
        {"question": "Describe a time you had to change your mind based on evidence", "category": "behavioral", "probability": "medium"},
        {"question": "How do you balance academic rigor with practical timelines?", "category": "behavioral", "probability": "medium"},
        {"question": "What issue area do you care most about, and why?", "category": "fit", "probability": "high"},
        {"question": "Why this organization's mission specifically?", "category": "fit", "probability": "high"},
    ],
    "media_communications": [
        {"question": "Walk me through a campaign or story you're most proud of", "category": "technical", "probability": "high"},
        {"question": "How do you measure the success of a piece of content?", "category": "technical", "probability": "high"},
        {"question": "Describe a time a piece you worked on underperformed — what did you learn?", "category": "behavioral", "probability": "high"},
        {"question": "How do you adapt tone and format across platforms?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time you had to defend your editorial judgment", "category": "behavioral", "probability": "medium"},
        {"question": "Walk me through how you'd pitch a story to a skeptical editor", "category": "technical", "probability": "medium"},
        {"question": "Whose work do you study, and why?", "category": "fit", "probability": "medium"},
        {"question": "Why this outlet/brand's voice specifically?", "category": "fit", "probability": "high"},
    ],
    "life_sciences_research": [
        {"question": "Walk me through your most meaningful research project — what was the question?", "category": "technical", "probability": "high"},
        {"question": "How do you design a control for an experiment with confounding variables?", "category": "technical", "probability": "high"},
        {"question": "Describe a time you had to defend unexpected results", "category": "behavioral", "probability": "high"},
        {"question": "Walk me through a statistical test you've actually used", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a collaboration that was difficult", "category": "behavioral", "probability": "medium"},
        {"question": "How do you manage long research timelines without losing motivation?", "category": "behavioral", "probability": "medium"},
        {"question": "Whose lab/work do you most want to learn from?", "category": "fit", "probability": "medium"},
        {"question": "Why this program/PI specifically?", "category": "fit", "probability": "high"},
    ],
    "economics_public_policy": [
        {"question": "Walk me through a policy question you've analyzed — what was the evidence?", "category": "technical", "probability": "high"},
        {"question": "How do you handle causal identification in observational data?", "category": "technical", "probability": "high"},
        {"question": "Describe a time you had to simplify a technical finding for a policymaker", "category": "behavioral", "probability": "high"},
        {"question": "Walk me through a memo structure you'd use for a Deputy Secretary briefing", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time your recommendation was rejected", "category": "behavioral", "probability": "medium"},
        {"question": "How do you think about cost-benefit analysis with distributional effects?", "category": "technical", "probability": "medium"},
        {"question": "Which economists or policymakers most shape your thinking?", "category": "fit", "probability": "low"},
        {"question": "Why this think tank/agency/shop over its peers?", "category": "fit", "probability": "high"},
    ],
    "entrepreneurship_innovation": [
        {"question": "Walk me through your startup/project — what were you wrong about at the start?", "category": "technical", "probability": "high"},
        {"question": "How do you validate a new idea before committing real time to it?", "category": "technical", "probability": "high"},
        {"question": "Describe a time a customer told you something that changed your roadmap", "category": "behavioral", "probability": "high"},
        {"question": "How would you prioritize between three features a customer asked for?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time you had to fire a close teammate or friend", "category": "behavioral", "probability": "medium"},
        {"question": "What metric do you watch obsessively, and why?", "category": "technical", "probability": "medium"},
        {"question": "What would you do differently next time you start something?", "category": "behavioral", "probability": "medium"},
        {"question": "Why this stage/industry over the alternatives?", "category": "fit", "probability": "high"},
    ],
    "physical_sciences_math": [
        {"question": "Walk me through a problem you've worked on — what made it interesting?", "category": "technical", "probability": "high"},
        {"question": "How do you approach a problem where the standard methods don't apply?", "category": "technical", "probability": "high"},
        {"question": "Describe a time you had to rebuild your intuition on a topic", "category": "behavioral", "probability": "high"},
        {"question": "Walk me through a proof or derivation you've internalized", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a collaboration with someone outside your field", "category": "behavioral", "probability": "medium"},
        {"question": "What open problem do you most want to see progress on?", "category": "fit", "probability": "medium"},
        {"question": "How do you decide when a result is 'done'?", "category": "behavioral", "probability": "medium"},
        {"question": "Why this department/group/industry fit over others?", "category": "fit", "probability": "high"},
    ],
    "chemical_biomedical_engineering": [
        {"question": "Walk me through a process design or simulation you've done", "category": "technical", "probability": "high"},
        {"question": "How do you approach scale-up from bench to pilot?", "category": "technical", "probability": "high"},
        {"question": "Describe a safety or compliance issue you've handled", "category": "behavioral", "probability": "high"},
        {"question": "Walk me through a material/device selection decision you made", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time a specification was ambiguous — what did you do?", "category": "behavioral", "probability": "medium"},
        {"question": "How do you balance experimental design with regulatory constraints?", "category": "technical", "probability": "medium"},
        {"question": "What aspect of chemical/biomedical engineering most excites you right now?", "category": "fit", "probability": "low"},
        {"question": "Why this company's pipeline or process over its competitors?", "category": "fit", "probability": "high"},
    ],
    "civil_environmental_engineering": [
        {"question": "Walk me through a project you designed or analyzed — what were the key loads?", "category": "technical", "probability": "high"},
        {"question": "How do you approach a code or standard you've never used before?", "category": "technical", "probability": "high"},
        {"question": "Describe a time you had to explain a technical decision to a non-engineer", "category": "behavioral", "probability": "high"},
        {"question": "Walk me through your approach to a site with unknown subsurface conditions", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time a project scope changed mid-design", "category": "behavioral", "probability": "medium"},
        {"question": "How do you weigh sustainability against cost in a design choice?", "category": "technical", "probability": "medium"},
        {"question": "What type of project energizes you most?", "category": "fit", "probability": "medium"},
        {"question": "Why this firm/public agency over its peers?", "category": "fit", "probability": "high"},
    ],
    "marketing_advertising": [
        {"question": "Walk me through a campaign you ran — what was the goal and did you hit it?", "category": "technical", "probability": "high"},
        {"question": "How do you think about brand measurement vs performance measurement?", "category": "technical", "probability": "high"},
        {"question": "Describe a time a campaign underperformed — what did you change?", "category": "behavioral", "probability": "high"},
        {"question": "Walk me through an A/B test you'd design for a landing page with low conversion", "category": "technical", "probability": "medium"},
        {"question": "How do you prioritize spend across paid, organic, and earned?", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time you pushed back on creative that didn't fit the brief", "category": "behavioral", "probability": "medium"},
        {"question": "Whose brand work do you most admire?", "category": "fit", "probability": "low"},
        {"question": "Why this brand/agency specifically?", "category": "fit", "probability": "high"},
    ],
    "management_operations": [
        {"question": "Walk me through an operational problem you fixed — what was the root cause?", "category": "technical", "probability": "high"},
        {"question": "How do you prioritize competing initiatives with the same stakeholder?", "category": "technical", "probability": "high"},
        {"question": "Describe a time you led a project across multiple teams", "category": "behavioral", "probability": "high"},
        {"question": "Walk me through how you'd set up KPIs for a new process", "category": "technical", "probability": "medium"},
        {"question": "Tell me about a time a process change was rejected — what happened?", "category": "behavioral", "probability": "medium"},
        {"question": "How do you balance speed vs documentation in a fast-moving org?", "category": "behavioral", "probability": "medium"},
        {"question": "What metric would you add or remove at this company's ops stack?", "category": "technical", "probability": "medium"},
        {"question": "Why operations specifically, and why this company?", "category": "fit", "probability": "high"},
    ],
}

# ── Cohort inference from title + JD + company ────────────────────────────
#
# The user's stored `track` might be wrong or generic (new users,
# career-changers). The best cohort for question generation is the one
# that matches the JOB itself, not the user's profile. If a software
# engineer is interviewing for a security role, we want cybersecurity
# questions. This runs entirely off string signals — no LLM.
#
# Returns the best track key matched against the role title + JD text
# (falls back to the caller's track if no cohort matches strongly).

_TITLE_KEYWORDS: dict[str, list[str]] = {
    "cybersecurity_it": [
        "security", "cyber", "infosec", "soc analyst", "soc engineer",
        "siem", "pentest", "penetration test", "red team", "blue team",
        "appsec", "cloud security", "security engineer", "security architect",
        "incident response", "threat intel", "vulnerability", "grc",
        "ciso", "compliance analyst", "iam", "identity and access",
    ],
    "software_engineering_cs": [
        "software engineer", "software developer", "swe", "full stack",
        "backend engineer", "frontend engineer", "mobile engineer",
        "platform engineer", "infrastructure engineer", "devops",
        "site reliability", "sre", "cloud engineer",
    ],
    "data_science_analytics": [
        "data scientist", "data analyst", "machine learning engineer",
        "ml engineer", "analytics engineer", "bi analyst",
        "business intelligence", "data engineer", "ai engineer",
        "research scientist", "applied scientist",
    ],
    "finance_accounting": [
        "investment banking", "equity research", "private equity",
        "hedge fund", "portfolio manager", "financial analyst",
        "trader", "quant", "wealth management", "credit analyst",
        "fp&a", "accountant", "auditor", "tax associate", "staff accountant",
    ],
    "consulting_strategy": [
        "consultant", "strategy", "associate consultant", "business analyst",
        "engagement manager", "strategy manager",
    ],
    "marketing_advertising": [
        "marketing", "brand manager", "growth marketer", "content marketer",
        "demand gen", "copywriter", "product marketing", "community manager",
        "social media manager", "campaign manager",
    ],
    "design_creative_arts": [
        "designer", "ux designer", "ui designer", "product designer",
        "visual designer", "graphic designer", "art director", "illustrator",
        "motion designer", "brand designer",
    ],
    "healthcare_clinical": [
        "nurse", "physician", "pa-c", "physician assistant",
        "clinical", "medical assistant", "pharmacy tech", "respiratory",
        "physical therap", "occupational therap", "patient care",
    ],
    "law_government": [
        "paralegal", "legal assistant", "associate attorney", "policy analyst",
        "legislative", "compliance officer", "regulatory", "law clerk",
    ],
    "biotech_pharmaceutical": [
        "biotech", "pharmaceutical", "research associate", "scientist i",
        "clinical trial", "regulatory affairs", "qa/qc",
    ],
    "mechanical_aerospace_engineering": [
        "mechanical engineer", "aerospace engineer", "manufacturing engineer",
        "design engineer", "thermal engineer", "propulsion",
    ],
    "electrical_computer_engineering": [
        "electrical engineer", "hardware engineer", "firmware engineer",
        "embedded engineer", "fpga engineer", "asic", "rf engineer",
    ],
    "education_human_development": [
        "teacher", "tutor", "instructor", "curriculum", "academic advisor",
        "admissions", "school counselor",
    ],
    "social_sciences_nonprofit": [
        "program associate", "policy associate", "development associate",
        "nonprofit", "community organizer", "grants", "program manager",
    ],
    "media_communications": [
        "journalist", "reporter", "editor", "producer", "communications",
        "public relations", "pr specialist", "content creator",
    ],
    "life_sciences_research": [
        "research scientist", "postdoc", "lab technician", "laboratory",
        "phd fellow", "graduate researcher",
    ],
    "economics_public_policy": [
        "economist", "economic research", "policy", "federal reserve",
        "central bank", "think tank",
    ],
    "entrepreneurship_innovation": [
        "founder", "cofounder", "co-founder", "founding engineer",
        "founding designer", "chief of staff", "bizops",
    ],
    "physical_sciences_math": [
        "mathematician", "statistician", "actuarial", "physicist",
        "chemist",
    ],
    "chemical_biomedical_engineering": [
        "chemical engineer", "biomedical engineer", "process engineer",
        "formulation",
    ],
    "civil_environmental_engineering": [
        "civil engineer", "structural engineer", "environmental engineer",
        "transportation engineer", "geotechnical", "water resources",
    ],
    "management_operations": [
        "operations manager", "project manager", "program manager",
        "supply chain", "logistics", "procurement", "warehouse manager",
    ],
}


def _infer_track_from_job(
    role: str, company: str, job_description: str, fallback: str,
) -> str:
    """Score each track by keyword hits in role + JD, return the best.
    Falls back to the provided default when nothing matches strongly."""
    text = " ".join([role or "", company or "", (job_description or "")[:3000]]).lower()
    if not text.strip():
        return fallback

    # Weight: role title matches count 3x (most signal), JD matches 1x.
    role_lower = (role or "").lower()
    best_track = fallback
    best_score = 0

    for track, keywords in _TITLE_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw in role_lower:
                score += 3
            elif kw in text:
                score += 1
        if score > best_score:
            best_score = score
            best_track = track

    # Require at least a "solid" hit (either 1 role-title match or 3 JD matches)
    # before overriding the fallback. Prevents a single soft keyword from
    # rerouting a clean SWE interview to, say, data_science.
    if best_score < 3:
        return fallback
    return best_track


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


_COHORT_INTERVIEW_PRIORS: dict[str, str] = {
    "cybersecurity_it": (
        "Security interviews lean heavy on scenario thinking (incident "
        "walkthroughs, threat modeling) and specific frameworks (MITRE "
        "ATT&CK, OWASP Top 10, NIST CSF). Expect at least one hands-on "
        "scenario (e.g. 'you see this alert, what do you do'). Certs, "
        "home labs, and CTF work are strong positive signals."
    ),
    "software_engineering_cs": (
        "SWE interviews favor system design, data-structures, and "
        "debugging narratives. Prioritize questions that surface how "
        "the candidate reasons under ambiguity."
    ),
    "data_science_analytics": (
        "Data interviews test statistical reasoning, SQL fluency, and "
        "communicating findings to non-technical stakeholders. A/B "
        "testing and experimentation questions are especially common."
    ),
    "finance_accounting": (
        "Finance interviews mix technical (DCF, accounting mechanics, "
        "market sizing) with behavioral under deadline pressure. "
        "'Why this firm over its peers?' is always asked."
    ),
    "consulting_strategy": (
        "Consulting interviews are case-heavy — market sizing, "
        "profitability, market entry. Expect at least one behavioral "
        "under ambiguity and a leadership-without-authority story."
    ),
    "marketing_advertising": (
        "Marketing interviews test campaign judgement, measurement "
        "literacy (brand vs performance KPIs), and brand voice. "
        "Portfolio walkthrough is standard."
    ),
    "design_creative_arts": (
        "Design interviews are portfolio-centered. Expect process "
        "walkthrough, user-research methodology, and tradeoff questions."
    ),
    "healthcare_clinical": (
        "Clinical interviews lean behavioral with ethical/judgement "
        "scenarios. Expect triage prioritization, interdisciplinary "
        "conflict, and evidence-based practice questions."
    ),
    "law_government": (
        "Legal/policy interviews test writing and reasoning. Expect "
        "research methodology, memo structure, and a statute-"
        "interpretation scenario."
    ),
    "biotech_pharmaceutical": (
        "Biotech interviews test protocol judgment, failure recovery, "
        "and regulatory awareness (GLP/GMP/GCP). Wet-lab vs "
        "computational balance matters for the team's needs."
    ),
    "mechanical_aerospace_engineering": (
        "Mech/aero interviews test design intuition, tolerance "
        "thinking, and how the candidate moves from simulation to "
        "prototype. Side projects are a strong positive signal."
    ),
    "electrical_computer_engineering": (
        "ECE interviews test board-level debugging, firmware/hardware "
        "coordination, and resource tradeoffs (power, area, cost)."
    ),
    "education_human_development": (
        "Ed interviews center on teaching demos, equity philosophy, "
        "and classroom-management scenarios. Data-driven instruction "
        "is increasingly expected."
    ),
    "social_sciences_nonprofit": (
        "Nonprofit interviews emphasize mission alignment, grant-"
        "writing experience, and program evaluation. Stakeholder-"
        "alignment stories are common."
    ),
    "media_communications": (
        "Media interviews focus on editorial judgement, measurement "
        "(engagement vs reach), and platform-specific craft. Pitches "
        "and portfolios are the throughline."
    ),
    "life_sciences_research": (
        "Research interviews center on the candidate's research story, "
        "experimental design rigor, and defending unexpected results."
    ),
    "economics_public_policy": (
        "Policy interviews test analytical rigor (causal identification, "
        "cost-benefit) and translation of findings into action. Memo "
        "writing and briefing practice matter."
    ),
    "entrepreneurship_innovation": (
        "Founder/early-stage interviews emphasize customer insight, "
        "prioritization, and self-awareness about prior mistakes."
    ),
    "management_operations": (
        "Ops interviews test process improvement, KPI design, and "
        "cross-functional leadership. Expect a root-cause scenario."
    ),
    # tracks that fall through get no specific prior — Claude still
    # produces reasonable questions from the JD alone.
}


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
    cohort_prior = _COHORT_INTERVIEW_PRIORS.get(track, "")
    cohort_prior_block = (
        f"\nDOMAIN NOTES FOR {track_label.upper()}:\n{cohort_prior}\n"
        if cohort_prior else ""
    )

    system = f"""You are a senior {company} interviewer hiring for {role}.
You've run 100+ loops at {company} and you know exactly what {company}
looks for — the signals, the bar, the question patterns. Generate
exactly 8 interview questions a real {company} interviewer would ask
for THIS specific role. Do NOT generate generic FAANG/consulting
boilerplate — this should feel unmistakably like {company}.

JOB DESCRIPTION:
{job_description[:4000]}
{cohort_prior_block}
COMPANY-SPECIFIC STYLE (lean into this):
{company} has its own interview personality. Think about what THAT firm
is actually known for — case-heavy if consulting, leadership-principle
chains if Amazon-style, system-design depth if FAANG infra, fit-and-
firm if banking, portfolio-walkthrough if design. Match the question
PATTERN to the firm. A user practicing for Goldman should feel like
they're sitting with a Goldman interviewer; a user practicing for
Stripe should feel like they're sitting with a Stripe interviewer.

REQUIREMENTS:
1. Mix of technical (3-4), behavioral (2-3), and company-fit (1-2) questions.
2. Reference SPECIFIC skills, tools, or requirements from the JD.
3. Questions should feel unmistakably like {company}, not generic. If
   {company} has known interview rituals (e.g., "tell me about a time"
   chains, market sizing, paper coding, pair programming, take-home,
   case interview, reverse interview, "why this firm"), use those.
4. For technical questions, reference technologies or methods mentioned in the JD.
5. For behavioral questions, relate to scenarios that would occur in this specific role.
6. Include one "Why {company}?" question that references something specific about the company.
7. If the domain notes above mention signals that interviewers look for (certs, portfolios,
   home labs, case frameworks, etc.), at least one question should surface those naturally.
8. The {company} bar matters. Don't write softball questions if {company}
   is tier-1 in this space.

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
        try:
            # Feature-level cost logged anonymously here. Caller
            # (/interview/prep-deck router) wraps this and records
            # per-user cost with the real email. This inner log is
            # a safety net — remove once the outer route is wrapped.
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response("", FEATURES.INTERVIEW_PREP_DECK, msg,
                                        metadata={"company": company, "role": role})
        except Exception:
            pass
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

    resolved_track = _resolve_track(req.track, email)
    # Override with the track that best matches THIS job's title + JD,
    # not the one stored on the user. Someone whose profile says "SWE"
    # but is interviewing for a SOC analyst role deserves cyber
    # questions, not system design. _infer_track_from_job is
    # conservative — it only overrides when the signal is strong.
    inferred_track = _infer_track_from_job(
        role=req.role or "",
        company=req.company or "",
        job_description=req.job_description or "",
        fallback=resolved_track,
    )
    track = inferred_track
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
        # Fall back to static question bank + gap-based flagging.
        # With the inferred track + 22 banks, the default bank is now
        # only hit when role + JD are both empty.
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
