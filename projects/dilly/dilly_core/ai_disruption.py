"""
AI Disruption Analysis — scores how AI-resilient a student's resume is.

Two outputs:
1. Per-cohort AI disruption risk (how much AI is impacting entry-level jobs
   in this field) — used in the jobs page and career center.
2. Per-resume AI readiness score — how AI-proof the student's specific
   skills and experiences are.

Pure rule-based, no LLM. Runs deterministically in <50ms.
"""

# ── Cohort AI Disruption Data ──────────────────────────────────────────────
# Percentage of entry-level roles in each cohort that are being significantly
# disrupted by AI (based on 2025-2026 industry reports from McKinsey, WEF,
# Goldman Sachs). Higher = more disruption.

COHORT_AI_DISRUPTION: dict[str, dict] = {
    "Software Engineering & CS": {
        "disruption_pct": 35,
        "trend": "rising",
        "headline": "AI is writing code, but not designing systems.",
        "ai_resistant_skills": ["system design", "architecture", "debugging complex distributed systems", "user empathy", "cross-team leadership"],
        "ai_vulnerable_skills": ["boilerplate code", "simple CRUD apps", "basic testing", "documentation writing"],
        "what_to_do": "Build projects that require architectural decisions, not just code output. Show you can design systems, not just implement them.",
    },
    "Data Science & Analytics": {
        "disruption_pct": 42,
        "trend": "rising",
        "headline": "AI automates analysis, but not the questions.",
        "ai_resistant_skills": ["problem framing", "stakeholder communication", "causal inference", "experimental design", "domain expertise"],
        "ai_vulnerable_skills": ["basic EDA", "dashboard creation", "simple SQL queries", "report generation"],
        "what_to_do": "Show you can frame the right questions, not just run the queries. Highlight projects where your insight changed a decision.",
    },
    "Finance & Accounting": {
        "disruption_pct": 48,
        "trend": "rising",
        "headline": "AI handles the spreadsheets. You handle the judgment.",
        "ai_resistant_skills": ["client relationships", "deal negotiation", "regulatory judgment", "risk assessment under uncertainty", "stakeholder management"],
        "ai_vulnerable_skills": ["financial modeling from templates", "data entry", "basic reconciliation", "routine reporting"],
        "what_to_do": "Emphasize judgment calls, client-facing work, and situations where you navigated ambiguity. Models are commoditized; thinking is not.",
    },
    "Consulting & Strategy": {
        "disruption_pct": 30,
        "trend": "stable",
        "headline": "AI can research. It can't sit in the room.",
        "ai_resistant_skills": ["client management", "workshop facilitation", "executive communication", "organizational change", "synthesis across ambiguous data"],
        "ai_vulnerable_skills": ["market sizing", "deck formatting", "basic benchmarking", "secondary research"],
        "what_to_do": "Lead with communication and influence. Show you've driven decisions, not just delivered slides.",
    },
    "Marketing & Advertising": {
        "disruption_pct": 55,
        "trend": "rising_fast",
        "headline": "AI writes copy. It doesn't build brands.",
        "ai_resistant_skills": ["brand strategy", "creative direction", "consumer psychology", "campaign orchestration", "community building"],
        "ai_vulnerable_skills": ["copywriting", "social media scheduling", "basic graphic design", "email templates", "SEO keyword stuffing"],
        "what_to_do": "Show strategic thinking, not just output. Campaigns you led, audiences you grew, brands you shaped.",
    },
    "Healthcare & Clinical": {
        "disruption_pct": 15,
        "trend": "stable",
        "headline": "AI assists diagnosis. Humans deliver care.",
        "ai_resistant_skills": ["patient communication", "clinical judgment", "physical assessment", "empathy under pressure", "interdisciplinary coordination"],
        "ai_vulnerable_skills": ["medical coding", "basic triage protocols", "appointment scheduling", "record transcription"],
        "what_to_do": "Your human touch is your moat. Highlight patient interactions, clinical rotations, and care coordination.",
    },
    "Design & Creative": {
        "disruption_pct": 40,
        "trend": "rising",
        "headline": "AI generates images. It doesn't solve problems.",
        "ai_resistant_skills": ["user research", "design thinking", "brand identity", "complex UX flows", "physical product design"],
        "ai_vulnerable_skills": ["stock graphics", "simple layouts", "icon creation", "basic photo editing"],
        "what_to_do": "Your portfolio should show process, not just output. The thinking behind the design is what AI can't replicate.",
    },
    "Legal & Compliance": {
        "disruption_pct": 38,
        "trend": "rising",
        "headline": "AI reads contracts. It doesn't advise clients.",
        "ai_resistant_skills": ["legal strategy", "client counseling", "courtroom advocacy", "negotiation", "regulatory interpretation"],
        "ai_vulnerable_skills": ["document review", "contract drafting from templates", "basic legal research", "citation checking"],
        "what_to_do": "Show judgment and advocacy. Moot court, clinic work, and any situation where you advised a real person.",
    },
    "Management & Operations": {
        "disruption_pct": 25,
        "trend": "stable",
        "headline": "AI optimizes processes. It doesn't lead people.",
        "ai_resistant_skills": ["people management", "crisis response", "vendor negotiation", "cross-functional coordination", "organizational design"],
        "ai_vulnerable_skills": ["data entry", "inventory counting", "basic scheduling", "report compilation"],
        "what_to_do": "Lead with leadership. Show you've managed people, resolved conflicts, or improved a process end-to-end.",
    },
    "Education & Teaching": {
        "disruption_pct": 20,
        "trend": "stable",
        "headline": "AI tutors. Teachers inspire.",
        "ai_resistant_skills": ["classroom management", "mentoring", "curriculum design for diverse learners", "social-emotional support", "parent communication"],
        "ai_vulnerable_skills": ["grading multiple choice", "lesson plan templates", "basic tutoring"],
        "what_to_do": "Show the human side: students you mentored, classrooms you managed, programs you designed.",
    },
}

# Default for cohorts not in the map
_DEFAULT_DISRUPTION = {
    "disruption_pct": 30,
    "trend": "stable",
    "headline": "AI is changing every field. Adaptability is your edge.",
    "ai_resistant_skills": ["leadership", "creative problem-solving", "stakeholder communication", "adaptability", "cross-functional collaboration"],
    "ai_vulnerable_skills": ["routine data entry", "template-based work", "basic research", "simple reporting"],
    "what_to_do": "Focus on skills that require human judgment, creativity, and relationship-building.",
}


def get_cohort_disruption(cohort: str) -> dict:
    """Get AI disruption data for a cohort."""
    return COHORT_AI_DISRUPTION.get(cohort, _DEFAULT_DISRUPTION)


def score_ai_readiness_llm(profile_text: str, cohort: str = "") -> dict:
    """LLM-based AI readiness scoring. More accurate than keyword matching."""
    import os, json
    try:
        import anthropic
    except ImportError:
        return score_ai_readiness(profile_text, cohort)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return score_ai_readiness(profile_text, cohort)

    disruption = get_cohort_disruption(cohort)

    prompt = f"""You assess how AI-proof a student's profile is. Their field is {cohort} ({disruption.get('disruption_pct', 30)}% disrupted by AI).

AI-resistant skills in this field: {', '.join(disruption.get('ai_resistant_skills', []))}
AI-vulnerable skills: {', '.join(disruption.get('ai_vulnerable_skills', []))}

Read the profile below and return JSON:
{{
  "ai_readiness": number 0-100 (how AI-proof they are - higher is better),
  "resistant_signals": ["up to 5 SHORT phrases (max 8 words each) of things AI cannot replace"],
  "vulnerable_signals": ["up to 5 SHORT phrases (max 8 words each) of things AI could automate"],
  "recommendation": "One sentence of actionable advice. Max 15 words. No em dashes."
}}

Only use evidence from the profile. If the profile is thin, score lower and say what's missing."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            temperature=0.2,
            system=prompt,
            messages=[{"role": "user", "content": f"Profile:\n{profile_text[:8000]}"}],
        )
        try:
            from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
            log_from_anthropic_response("", FEATURES.AI_DISRUPTION, response)
        except Exception:
            pass
        raw = response.content[0].text
        j_start = raw.find("{")
        j_end = raw.rfind("}") + 1
        if j_start == -1:
            return score_ai_readiness(profile_text, cohort)
        result = json.loads(raw[j_start:j_end])
        return {
            "ai_readiness": max(10, min(95, result.get("ai_readiness", 50))),
            "resistant_signals": result.get("resistant_signals", [])[:5],
            "vulnerable_signals": result.get("vulnerable_signals", [])[:5],
            "recommendation": result.get("recommendation", ""),
        }
    except Exception:
        return score_ai_readiness(profile_text, cohort)


# ── Resume AI Readiness Score ──────────────────────────────────────────────
# Scans resume text for AI-resistant vs AI-vulnerable signals.

AI_RESISTANT_KEYWORDS = [
    "led", "managed", "designed", "architected", "negotiated", "mentored",
    "facilitated", "presented", "persuaded", "collaborated across",
    "stakeholder", "ambiguity", "judgment", "strategy", "vision",
    "creative direction", "user research", "client relationship",
    "cross-functional", "organizational", "culture", "empathy",
    "crisis", "conflict resolution", "public speaking", "workshop",
]

AI_VULNERABLE_KEYWORDS = [
    "data entry", "spreadsheet", "template", "basic", "routine",
    "generated reports", "compiled data", "transcribed", "formatted",
    "copied", "scheduled meetings", "filed", "sorted", "cataloged",
]


def score_ai_readiness(resume_text: str, cohort: str = "") -> dict:
    """
    Score how AI-proof a resume is.

    Returns:
        {
            "ai_readiness": 0-100 (higher = more AI-proof),
            "resistant_signals": ["led a team of 5", ...],
            "vulnerable_signals": ["generated weekly reports", ...],
            "recommendation": "...",
        }
    """
    text_lower = resume_text.lower()

    resistant_found = []
    for kw in AI_RESISTANT_KEYWORDS:
        if kw in text_lower:
            # Find the sentence containing this keyword
            for line in resume_text.split('\n'):
                if kw in line.lower() and len(line.strip()) > 10:
                    resistant_found.append(line.strip()[:100])
                    break

    vulnerable_found = []
    for kw in AI_VULNERABLE_KEYWORDS:
        if kw in text_lower:
            for line in resume_text.split('\n'):
                if kw in line.lower() and len(line.strip()) > 10:
                    vulnerable_found.append(line.strip()[:100])
                    break

    # Score: base 50, +3 per resistant signal, -5 per vulnerable signal
    score = 50
    score += len(resistant_found) * 3
    score -= len(vulnerable_found) * 5
    score = max(15, min(95, score))

    # Recommendation based on score
    if score >= 75:
        rec = "Your resume shows strong AI-resistant skills. You're well-positioned for the AI era."
    elif score >= 50:
        rec = "Your resume has a mix of AI-resistant and AI-vulnerable skills. Replace routine tasks with leadership and creative problem-solving."
    else:
        rec = "Your resume leans heavily on tasks AI can automate. Rewrite your bullets to emphasize judgment, leadership, and human skills."

    return {
        "ai_readiness": score,
        "resistant_signals": resistant_found[:5],
        "vulnerable_signals": vulnerable_found[:5],
        "recommendation": rec,
    }
