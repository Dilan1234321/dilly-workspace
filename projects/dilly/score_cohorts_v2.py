"""
Cohort Scoring v2 — Uses Claude to generate cohort-specific S/G/B scores
by analyzing the student's resume against each cohort's expectations.
"""
import os, sys, json, time
import psycopg2
import psycopg2.extras
import anthropic

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/../..')
from projects.dilly.academic_taxonomy import get_cohort

def get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try: pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except: pass
    return psycopg2.connect(
        host="dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com",
        database="dilly", user="dilly_admin", password=pw, sslmode="require"
    )

COHORT_CRITERIA = {
    "Software Engineering & CS": {
        "smart": "CS coursework depth, algorithms, data structures, GPA in technical classes",
        "grit": "hackathons, open source contributions, tech leadership, teaching/mentoring",
        "build": "deployed applications, GitHub projects with users, production code, technical internships"
    },
    "Data Science & Analytics": {
        "smart": "statistics, math, ML coursework, quantitative GPA, research methods",
        "grit": "Kaggle competitions, data projects presented, analytics leadership, research assistantships",
        "build": "ML models deployed, dashboards built, published analyses, data pipeline experience"
    },
    "Cybersecurity & IT": {
        "smart": "networking, security coursework, certifications (CompTIA, CISSP), systems knowledge",
        "grit": "CTF competitions, security research, IT support experience, incident response",
        "build": "security tools built, penetration testing, vulnerability assessments, lab environments"
    },
    "Finance & Accounting": {
        "smart": "finance/accounting coursework, CFA/CPA progress, quantitative skills, GPA",
        "grit": "investment club, finance competitions, financial modeling practice, networking",
        "build": "financial models built, investment analyses, Bloomberg terminal, real trading experience"
    },
    "Consulting & Strategy": {
        "smart": "business/econ coursework, analytical thinking, case methodology, GPA",
        "grit": "case competitions, consulting club, client projects, leadership roles",
        "build": "case studies completed, strategy decks, client deliverables, business analyses"
    },
    "Marketing & Advertising": {
        "smart": "marketing coursework, consumer behavior, analytics, digital marketing knowledge",
        "grit": "social media management, brand campaigns, marketing club leadership, event planning",
        "build": "campaigns with measurable results, content portfolio, growth metrics, ad spend managed"
    },
    "Management & Operations": {
        "smart": "business coursework, operations management, project management, organizational behavior",
        "grit": "team leadership, event organization, process improvement, cross-functional experience",
        "build": "projects managed, operations improved, teams led, efficiency gains documented"
    },
    "Healthcare & Clinical": {
        "smart": "pre-med/nursing coursework, biology, chemistry, anatomy, clinical knowledge",
        "grit": "clinical volunteering hours, hospital experience, health org leadership, patient interaction",
        "build": "clinical hours logged, research in healthcare, certifications (CNA, EMT), shadowing"
    },
    "Biotech & Pharmaceutical": {
        "smart": "biology, chemistry, biochemistry coursework, lab techniques, research methods",
        "grit": "lab research hours, conference presentations, research team collaboration",
        "build": "lab techniques mastered, experiments conducted, papers contributed to, protocols developed"
    },
    "Life Sciences & Research": {
        "smart": "biology, ecology, environmental science coursework, research methodology",
        "grit": "field research, lab hours, research presentations, academic conferences",
        "build": "research papers, field studies, data collection, lab experiments, thesis work"
    },
    "Electrical & Computer Engineering": {
        "smart": "circuits, signals, embedded systems coursework, physics, math",
        "grit": "engineering competitions, robotics teams, lab projects, design challenges",
        "build": "circuits designed, embedded systems built, PCB layouts, hardware prototypes"
    },
    "Mechanical & Aerospace Engineering": {
        "smart": "mechanics, thermodynamics, materials science, CAD proficiency",
        "grit": "design competitions, FSAE/rocketry teams, engineering clubs",
        "build": "physical prototypes, CAD models, simulations run, manufacturing experience"
    },
    "Civil & Environmental Engineering": {
        "smart": "structural analysis, environmental science, geotechnical, hydrology",
        "grit": "engineering service projects, sustainability initiatives, field experience",
        "build": "structural designs, site analyses, environmental assessments, AutoCAD projects"
    },
    "Chemical & Biomedical Engineering": {
        "smart": "chemical engineering coursework, thermodynamics, transport phenomena, biomedical courses",
        "grit": "research assistantships, engineering competitions, lab team leadership",
        "build": "process simulations, lab experiments, biomedical device designs, research contributions"
    },
    "Economics & Public Policy": {
        "smart": "economics coursework, econometrics, statistics, policy analysis",
        "grit": "economics research, policy debate, government internships, think tank work",
        "build": "economic analyses, policy papers, data-driven research, econometric models"
    },
    "Law & Government": {
        "smart": "political science, pre-law coursework, writing, critical analysis",
        "grit": "mock trial, student government, legal internships, advocacy work",
        "build": "legal research, policy briefs, case analyses, legislative experience"
    },
    "Media & Communications": {
        "smart": "journalism, communications, media studies coursework, writing skills",
        "grit": "student newspaper, media production, communications leadership, public speaking",
        "build": "published articles, media produced, social media accounts grown, content portfolio"
    },
    "Design & Creative Arts": {
        "smart": "design theory, UX principles, color theory, typography, art history",
        "grit": "design competitions, portfolio reviews, creative leadership, collaborative projects",
        "build": "portfolio pieces, shipped designs, user research conducted, prototypes built"
    },
    "Education & Human Development": {
        "smart": "education coursework, child development, pedagogy, educational psychology",
        "grit": "tutoring hours, teaching assistant work, youth program leadership, mentoring",
        "build": "lesson plans created, students taught, curriculum developed, educational programs run"
    },
    "Social Sciences & Nonprofit": {
        "smart": "sociology, psychology, anthropology coursework, research methods",
        "grit": "community service, nonprofit volunteering, social justice advocacy, mentoring",
        "build": "research projects, community programs organized, surveys conducted, impact measured"
    },
    "Entrepreneurship & Innovation": {
        "smart": "business fundamentals, market analysis, financial literacy, innovation methods",
        "grit": "ventures started, pitch competitions, startup experience, risk-taking",
        "build": "businesses launched, products shipped, revenue generated, users acquired"
    },
    "Physical Sciences & Math": {
        "smart": "advanced math, physics, chemistry coursework, theoretical foundations",
        "grit": "math competitions, research presentations, academic conferences, teaching",
        "build": "proofs written, simulations built, research papers, computational models"
    },
}

def score_student_cohorts(client, student, resume_text):
    """Use Claude to score a student per-cohort based on their actual resume."""
    
    majors = student.get("majors") or []
    minors = student.get("minors") or []
    interests = student.get("interests") or []
    
    # Map to cohorts
    entries = []
    seen_cohorts = set()
    for m in majors:
        c = get_cohort(m)
        if c and c not in seen_cohorts:
            entries.append({"field": m, "cohort": c, "level": "major"})
            seen_cohorts.add(c)
    for m in minors:
        c = get_cohort(m)
        if c and c not in seen_cohorts:
            entries.append({"field": m, "cohort": c, "level": "minor"})
            seen_cohorts.add(c)
    for m in interests:
        c = get_cohort(m)
        if c and c not in seen_cohorts:
            entries.append({"field": m, "cohort": c, "level": "interest"})
            seen_cohorts.add(c)
    
    if not entries:
        return {}, 0, 0, 0, 0
    
    # Build the prompt
    cohort_section = ""
    for e in entries:
        criteria = COHORT_CRITERIA.get(e["cohort"], {})
        cohort_section += f"""
- Cohort: {e["cohort"]} (level: {e["level"]}, field: {e["field"]})
  Smart criteria: {criteria.get("smart", "general academic rigor")}
  Grit criteria: {criteria.get("grit", "leadership and initiative")}
  Build criteria: {criteria.get("build", "tangible proof of work")}
"""
    
    prompt = f"""Score this student's resume for EACH cohort below. Use precise decimal scores (e.g., 67.3, not 67 or 70).

RESUME:
{resume_text[:4000]}

COHORTS TO SCORE:
{cohort_section}

SCORING RULES:
- Smart (0-100): Academic preparation specific to THIS cohort. A CS student's Smart for "Software Engineering" should reflect CS coursework depth. Their Smart for "Consulting" should reflect analytical/business coursework.
- Grit (0-100): Leadership, initiative, and persistence relevant to THIS cohort. Running a coding club counts more for CS than for Finance.
- Build (0-100): Tangible proof of work specific to THIS cohort. Deployed apps count for CS. Financial models count for Finance. Clinical hours count for Healthcare.
- For minors: score based on what's actually in the resume for that field. If they have no finance projects, their Finance Build should be low even if their CS Build is high.
- For interests: score based on any tangential evidence. If they list Entrepreneurship as interest but haven't started anything, Build should be very low.
- BE PRECISE. Use decimals. 72.4, not 72. 38.7, not 40. No rounding to 5s or 0s.

Return ONLY valid JSON array:
[{{"cohort":"...","level":"...","field":"...","smart":72.4,"grit":65.8,"build":41.3}}]"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        temperature=0,  # Deterministic — same resume always gets same scores
        messages=[{"role": "user", "content": prompt}]
    )
    
    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    
    scores = json.loads(text)
    
    cohort_scores = {}
    for s in scores:
        cohort = s["cohort"]
        level = s["level"]
        weight = 1.0 if level == "major" else 0.5 if level == "minor" else 0.0
        cohort_scores[cohort] = {
            "cohort": cohort,
            "level": level,
            "field": s["field"],
            "smart": round(float(s["smart"]), 1),
            "grit": round(float(s["grit"]), 1),
            "build": round(float(s["build"]), 1),
            "dilly_score": round((float(s["smart"]) + float(s["grit"]) + float(s["build"])) / 3, 1),
            "weight": weight,
        }
    
    # Compute weighted overall
    ws = wg = wb = tw = 0
    for cs in cohort_scores.values():
        w = cs["weight"]
        if w > 0:
            ws += cs["smart"] * w; wg += cs["grit"] * w; wb += cs["build"] * w; tw += w
    
    if tw > 0:
        os_ = round(ws / tw, 1); og = round(wg / tw, 1); ob = round(wb / tw, 1)
    else:
        os_ = og = ob = 0
    od = round((os_ + og + ob) / 3, 1)
    
    return cohort_scores, os_, og, ob, od


def run():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    client = anthropic.Anthropic()
    
    cur.execute("""
        SELECT id, name, email, majors, minors, interests, smart_score, grit_score, build_score, resume_text
        FROM students WHERE smart_score IS NOT NULL
    """)
    students = cur.fetchall()
    print(f"Scoring {len(students)} students with AI cohort-specific S/G/B...")
    
    scored = 0
    errors = 0
    for s in students:
        resume = s.get("resume_text") or ""
        if not resume:
            # Skip students without resume text
            continue
        
        try:
            cs, os_, og, ob, od = score_student_cohorts(client, s, resume)
            
            cur.execute("""
                UPDATE students SET
                    cohort_scores = %s, overall_smart = %s, overall_grit = %s,
                    overall_build = %s, overall_dilly_score = %s
                WHERE id = %s
            """, (json.dumps(cs), os_, og, ob, od, s["id"]))
            
            scored += 1
            print(f"  [{scored}] {s['name']}: {len(cs)} cohorts")
            for k, v in cs.items():
                print(f"    {v['level']}: {k} → S:{v['smart']} G:{v['grit']} B:{v['build']}")
        except Exception as e:
            errors += 1
            print(f"  ERR {s['name']}: {e}")
        
        time.sleep(0.5)
    
    conn.commit()
    print(f"\nDone! {scored} scored, {errors} errors")
    
    # Show Dilan's scores
    cur.execute("SELECT name, cohort_scores, overall_smart, overall_grit, overall_build, overall_dilly_score FROM students WHERE email = 'dilan.kochhar@spartans.ut.edu'")
    r = cur.fetchone()
    if r:
        print(f"\n{r['name']}:")
        print(f"  Overall: S:{r['overall_smart']} G:{r['overall_grit']} B:{r['overall_build']} Dilly:{r['overall_dilly_score']}")
        cs = r['cohort_scores'] if isinstance(r['cohort_scores'], dict) else json.loads(r['cohort_scores'] or '{}')
        for k, v in cs.items():
            print(f"  {v['level'].upper()}: {k} → S:{v['smart']} G:{v['grit']} B:{v['build']}")
    
    conn.close()

if __name__ == "__main__":
    run()
