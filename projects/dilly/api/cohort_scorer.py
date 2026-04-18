"""
Cohort-specific S/G/B scoring using Claude.

Called after resume audit to produce accurate per-cohort scores.
For each cohort the student belongs to (via major/minor/interest),
Claude reads the actual resume and scores ONLY the evidence relevant
to that cohort — so a DS student gets a high DS score and a low
Finance score (unless they have real finance experience).
"""

import json
import os
import sys

_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

# ── Scoring criteria Claude uses for each cohort ────────────────────────────

COHORT_CRITERIA: dict[str, dict[str, str]] = {
    "Software Engineering & CS": {
        "smart": "CS coursework depth, algorithms, data structures, systems, GPA in technical classes, advanced math",
        "grit": "hackathons, open source contributions, tech leadership, side projects maintained over time, teaching/mentoring in tech",
        "build": "deployed applications with real users, GitHub projects, production code, technical internships at software companies",
    },
    "Data Science & Analytics": {
        "smart": "statistics, probability, ML coursework, linear algebra, research methods, quantitative GPA, relevant certifications",
        "grit": "Kaggle/data competitions, analytics internships, research assistantships, data project leadership, conference presentations",
        "build": "ML models deployed or published, dashboards with real data, published analyses, data pipelines, capstone projects",
    },
    "Cybersecurity & IT": {
        "smart": "networking, security coursework, certifications (CompTIA Security+, CISSP, CEH), systems knowledge, cryptography",
        "grit": "CTF competitions, security research, IT support/help desk experience, incident response, club/team leadership",
        "build": "security tools built, penetration testing reports, vulnerability assessments, lab environments, home lab projects",
    },
    "Finance & Accounting": {
        "smart": "finance, accounting, economics coursework, CFA/CPA progress, financial modeling knowledge, quantitative skills, GPA",
        "grit": "investment club leadership, finance competitions (CFA challenge), financial modeling workshops, networking events attended",
        "build": "financial models built, investment research/analyses, Bloomberg terminal experience, real trading/portfolio experience, internships at banks or funds",
    },
    "Consulting & Strategy": {
        "smart": "business, economics, quantitative coursework, case methodology, analytical frameworks, GPA",
        "grit": "case competitions, consulting club leadership, client-facing projects, public speaking, strategy research",
        "build": "case studies delivered, strategy decks, client deliverables, consulting internships, business analyses with recommendations",
    },
    "Marketing & Advertising": {
        "smart": "marketing, consumer behavior, analytics, digital marketing, brand management coursework",
        "grit": "social media management, brand campaigns run, marketing club leadership, event planning, content creation at scale",
        "build": "campaigns with measurable results (reach, conversions), content portfolio, ad spend managed, growth metrics achieved",
    },
    "Management & Operations": {
        "smart": "business coursework, operations management, project management, organizational behavior, supply chain",
        "grit": "team leadership roles, event organization, process improvement initiatives, cross-functional team experience",
        "build": "projects managed end-to-end, operations improvements with metrics, teams led, efficiency gains documented",
    },
    "Healthcare & Clinical": {
        "smart": "pre-med/nursing coursework, biology, chemistry, anatomy, physiology, clinical knowledge, science GPA (BCPM)",
        "grit": "clinical volunteering hours logged, hospital/clinic experience, health org leadership, patient interaction hours",
        "build": "clinical hours total, healthcare research, certifications (CNA, EMT, BLS), physician shadowing hours",
    },
    "Biotech & Pharmaceutical": {
        "smart": "biology, chemistry, biochemistry coursework, lab techniques, research methods, molecular biology",
        "grit": "lab research hours, conference presentations, research team collaboration, academic publications contributed to",
        "build": "lab techniques mastered, experiments conducted independently, papers contributed to, protocols developed, internships at biotech/pharma",
    },
    "Life Sciences & Research": {
        "smart": "biology, ecology, environmental science coursework, research methodology, statistics for science",
        "grit": "field research hours, lab hours, research presentations, academic conferences attended, TA/RA roles",
        "build": "research papers authored or contributed to, field studies conducted, datasets collected, lab experiments, thesis work",
    },
    "Electrical & Computer Engineering": {
        "smart": "circuits, signals, embedded systems coursework, physics, calculus, differential equations",
        "grit": "engineering competitions, robotics teams, lab projects, IEEE/ACM involvement, design challenges",
        "build": "circuits designed, embedded systems built, PCB layouts, hardware prototypes, firmware written",
    },
    "Mechanical & Aerospace Engineering": {
        "smart": "mechanics, thermodynamics, materials science, CAD proficiency, fluid dynamics",
        "grit": "design competitions, FSAE/rocketry/robotics teams, engineering clubs, collaborative build projects",
        "build": "physical prototypes, CAD models, simulations run, manufacturing experience, testing/validation work",
    },
    "Civil & Environmental Engineering": {
        "smart": "structural analysis, environmental science, geotechnical, hydrology, AutoCAD/Revit proficiency",
        "grit": "engineering service projects, sustainability initiatives, field experience, professional organization involvement",
        "build": "structural designs, site analyses, environmental assessments, AutoCAD/BIM projects, internships at engineering firms",
    },
    "Chemical & Biomedical Engineering": {
        "smart": "chemical engineering, thermodynamics, transport phenomena, biomedical courses, reactor design",
        "grit": "research assistantships, engineering competitions, lab team leadership, co-op/internship experience",
        "build": "process simulations, lab experiments, biomedical device designs, research contributions, internships at chemical/biomedical companies",
    },
    "Economics & Public Policy": {
        "smart": "economics, econometrics, statistics, public policy, political economy coursework, quantitative methods",
        "grit": "economics research, policy debate teams, government/think-tank internships, policy writing",
        "build": "economic analyses published or presented, policy papers, data-driven research, econometric models built",
    },
    "Law & Government": {
        "smart": "political science, pre-law coursework, writing skills, critical analysis, constitutional law, philosophy",
        "grit": "mock trial, moot court, student government, legal internships/clerkships, debate team, advocacy work",
        "build": "legal research memos, policy briefs, case analyses, legislative experience, paralegal work",
    },
    "Media & Communications": {
        "smart": "journalism, communications, media studies coursework, writing skills, public speaking",
        "grit": "student newspaper/radio/TV, media production, communications leadership, public speaking competitions",
        "build": "published articles/bylines, media produced, social media accounts grown with metrics, content portfolio",
    },
    "Design & Creative Arts": {
        "smart": "design theory, UX principles, color theory, typography, art history, human-computer interaction",
        "grit": "design competitions, portfolio reviews, creative leadership, collaborative client projects, freelance work",
        "build": "portfolio pieces shipped, Figma/Adobe work, user research conducted, prototypes tested, freelance clients served",
    },
    "Education & Human Development": {
        "smart": "education coursework, child development, pedagogy, educational psychology, curriculum design",
        "grit": "tutoring hours logged, teaching assistant roles, youth program leadership, mentoring relationships",
        "build": "lesson plans created, students taught, curriculum developed, educational programs run, measurable student outcomes",
    },
    "Social Sciences & Nonprofit": {
        "smart": "sociology, psychology, anthropology coursework, qualitative/quantitative research methods",
        "grit": "community service hours, nonprofit volunteering, social justice advocacy, mentoring programs",
        "build": "research projects completed, community programs organized, surveys conducted, impact measured in numbers",
    },
    "Entrepreneurship & Innovation": {
        "smart": "business fundamentals, market analysis, financial literacy, innovation methods, startup ecosystem knowledge",
        "grit": "ventures started (even if small), pitch competitions, startup/accelerator experience, risk-taking track record",
        "build": "businesses launched (even side projects), products shipped, revenue generated, users acquired, investors pitched",
    },
    "Physical Sciences & Math": {
        "smart": "advanced math, physics, chemistry coursework, theoretical foundations, proof-based courses",
        "grit": "math/physics competitions, research presentations, academic conferences, teaching/tutoring in STEM",
        "build": "proofs written, simulations built, research papers, computational models, lab experiments",
    },
    "Sports & Athletic Performance": {
        "smart": "exercise science, sports medicine, kinesiology, biomechanics, sport psychology coursework",
        "grit": "varsity/club sports participation, athletic leadership (captain), coaching or training roles, athletic achievements",
        "build": "athletic certifications, coaching experience, training programs designed, sports analytics work, performance data",
    },
}


# ── DB helpers ───────────────────────────────────────────────────────────────

def _get_db_conn():
    import psycopg2
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try:
            pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except Exception:
            pass
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly",
        user="dilly_admin",
        password=pw,
        sslmode="require",
    )


# ── Core scoring logic ────────────────────────────────────────────────────────

def _build_entries(majors: list, minors: list, interests: list) -> list[dict]:
    """Map majors/minors/interests to cohort entries for scoring."""
    try:
        from projects.dilly.academic_taxonomy import get_cohort as _gc
    except Exception:
        _gc = lambda x: None  # noqa

    entries = []
    seen: set[str] = set()

    for m in (majors or []):
        c = _gc(m)
        if c and c not in seen:
            entries.append({"field": m, "cohort": c, "level": "major"})
            seen.add(c)

    for m in (minors or []):
        c = _gc(m)
        if c and c not in seen:
            entries.append({"field": m, "cohort": c, "level": "minor"})
            seen.add(c)

    # Interests are stored as cohort-label strings already
    for i in (interests or []):
        if not i or i in seen:
            continue
        # Interest IS a known cohort label
        if i in COHORT_CRITERIA:
            entries.append({"field": i, "cohort": i, "level": "interest"})
            seen.add(i)
        else:
            # Try the taxonomy as fallback
            c = _gc(i)
            if c and c not in seen:
                entries.append({"field": i, "cohort": c, "level": "interest"})
                seen.add(c)

    return entries


def score_cohorts_for_student(
    resume_text: str,
    majors: list,
    minors: list,
    interests: list,
) -> tuple[dict, float, float, float, float]:
    """
    Call Claude to generate accurate per-cohort S/G/B scores by reading
    the actual resume for each cohort's relevant evidence.

    Returns (cohort_scores_dict, overall_smart, overall_grit, overall_build, overall_dilly).
    cohort_scores_dict is keyed by cohort name.
    """
    import anthropic

    entries = _build_entries(majors, minors, interests)
    if not entries:
        return {}, 0.0, 0.0, 0.0, 0.0

    cohort_section = ""
    for e in entries:
        criteria = COHORT_CRITERIA.get(e["cohort"], {})
        cohort_section += (
            f"\n- Cohort: {e['cohort']} (level: {e['level']}, field: {e['field']})"
            f"\n  Smart criteria: {criteria.get('smart', 'general academic rigor and coursework depth')}"
            f"\n  Grit criteria: {criteria.get('grit', 'leadership, initiative, persistence in this field')}"
            f"\n  Build criteria: {criteria.get('build', 'tangible, provable deliverables in this field')}\n"
        )

    prompt = f"""You are a career expert scoring a student's resume for specific academic/career cohorts.
Score each cohort SEPARATELY based ONLY on evidence in the resume that is directly relevant to that cohort.

RESUME:
{resume_text[:5500]}

COHORTS TO SCORE:
{cohort_section}

SCORING RULES (read carefully — accuracy is critical):

1. Smart (0-100): How academically prepared is this student for THIS SPECIFIC cohort?
   - Look ONLY at coursework, GPA signals, certifications, and knowledge relevant to that cohort
   - A Data Science student with 3.7 GPA should score 80+ for Data Science Smart
   - The SAME student with no finance classes should score 20-35 for Finance Smart
   - GPA alone does not make someone smart in a field they haven't studied

2. Grit (0-100): How much effort and persistence have they shown IN THIS SPECIFIC FIELD?
   - Count ONLY experiences, clubs, competitions, leadership directly tied to this cohort
   - Running a coding club = Grit for CS, NOT Grit for Finance
   - Investment club leadership = Grit for Finance, NOT Grit for CS

3. Build (0-100): What have they actually built or produced FOR THIS SPECIFIC COHORT?
   - Count ONLY tangible deliverables relevant to this cohort
   - Deployed ML models = Build for Data Science
   - Financial models or deal analyses = Build for Finance
   - Clinical hours = Build for Healthcare
   - If they have ZERO relevant builds for a cohort, score 0-15

CRITICAL RULES:
- Scores MUST vary significantly across cohorts. If someone is DS-focused, DS scores should be 70-90, Finance scores 10-40, Sports scores 5-20 (unless there is evidence)
- For minor cohorts: score conservatively — only count evidence explicitly present in the resume for that field
- For interest cohorts: if they list it as an interest but have NO supporting evidence, all three scores should be 10-25
- Never give 100 unless there is exceptional, overwhelming evidence for that specific cohort
- Use precise decimals (67.3, not 67 or 70). No rounding to 5s or 0s

Return ONLY valid JSON array (no markdown, no explanation):
[{{"cohort":"...","level":"...","field":"...","smart":72.4,"grit":65.8,"build":41.3}}]"""

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1200,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        from projects.dilly.api.llm_usage_log import log_from_anthropic_response, FEATURES
        log_from_anthropic_response("", FEATURES.COHORT_SCORER, resp)
    except Exception:
        pass

    text = resp.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    raw = json.loads(text)

    cohort_scores: dict = {}
    ws = wg = wb = tw = 0.0

    for item in raw:
        cohort = item["cohort"]
        level = item["level"]
        weight = 1.0 if level == "major" else 0.5 if level == "minor" else 0.0
        s = round(float(item["smart"]), 1)
        g = round(float(item["grit"]), 1)
        b = round(float(item["build"]), 1)

        cohort_scores[cohort] = {
            "cohort": cohort,
            "level": level,
            "field": item["field"],
            "smart": s,
            "grit": g,
            "build": b,
            "dilly_score": round((s + g + b) / 3, 1),
            "weight": weight,
            "scored_by_claude": True,  # flag so profile.py knows not to overwrite
        }

        if weight > 0:
            ws += s * weight
            wg += g * weight
            wb += b * weight
            tw += weight

    if tw > 0:
        overall_smart = round(ws / tw, 1)
        overall_grit = round(wg / tw, 1)
        overall_build = round(wb / tw, 1)
    elif cohort_scores:
        vals = list(cohort_scores.values())
        overall_smart = round(sum(v["smart"] for v in vals) / len(vals), 1)
        overall_grit = round(sum(v["grit"] for v in vals) / len(vals), 1)
        overall_build = round(sum(v["build"] for v in vals) / len(vals), 1)
    else:
        overall_smart = overall_grit = overall_build = 0.0

    overall_dilly = round((overall_smart + overall_grit + overall_build) / 3, 1)
    return cohort_scores, overall_smart, overall_grit, overall_build, overall_dilly


def store_cohort_scores(
    email: str,
    cohort_scores: dict,
    overall_smart: float,
    overall_grit: float,
    overall_build: float,
    overall_dilly: float,
) -> None:
    """Persist Claude-scored cohort scores to the students table."""
    conn = _get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE students
            SET cohort_scores      = %s,
                overall_smart      = %s,
                overall_grit       = %s,
                overall_build      = %s,
                overall_dilly_score= %s
            WHERE LOWER(email) = LOWER(%s)
            """,
            (
                json.dumps(cohort_scores),
                overall_smart,
                overall_grit,
                overall_build,
                overall_dilly,
                email,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def score_and_store_cohorts(
    email: str,
    resume_text: str,
    majors: list,
    minors: list,
    interests: list,
) -> bool:
    """
    Full pipeline: score cohorts with Claude, then persist to DB.
    Returns True on success, False on any error.
    Safe to call from a background thread.
    """
    try:
        if not resume_text or len(resume_text.split()) < 40:
            return False
        cohort_scores, os_, og, ob, od = score_cohorts_for_student(
            resume_text, majors, minors, interests
        )
        if not cohort_scores:
            return False
        store_cohort_scores(email, cohort_scores, os_, og, ob, od)
        return True
    except Exception:
        return False
