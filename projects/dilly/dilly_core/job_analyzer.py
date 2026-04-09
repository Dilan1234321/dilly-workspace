"""
Job Analyzer — assigns cohorts + Smart/Grit/Build requirements to scraped jobs.

Pure rule-based, no LLM. Runs after scraping to enrich each job with:
  - cohort_requirements: list of {cohort, smart, grit, build} dicts
  - job_type: internship / entry_level / full_time
  - seniority: intern / junior / mid / senior

Uses keyword matching against a curated taxonomy of skills, tools, and
domain terms mapped to cohorts. S/G/B requirements are estimated from
JD signals (education depth → Smart, experience years → Grit, portfolio
mentions → Build).
"""

import re
from typing import Optional

# ── Cohort keyword taxonomy ──────────────────────────────────────────────────
# Each cohort maps to a list of keywords/phrases. A job matches a cohort
# if its title + description contain enough of that cohort's keywords.

COHORT_KEYWORDS: dict[str, list[str]] = {
    "Software Engineering & CS": [
        "software engineer", "software developer", "swe", "full stack", "fullstack",
        "frontend", "backend", "devops", "cloud engineer", "react", "node.js",
        "python developer", "java developer", "golang", "rust developer", "kubernetes",
        "docker", "aws engineer", "azure", "gcp", "microservices", "api developer",
        "mobile developer", "ios developer", "android developer", "flutter",
    ],
    "Data Science & Analytics": [
        "data scientist", "data analyst", "data engineer", "machine learning",
        "ml engineer", "deep learning", "nlp", "computer vision", "ai engineer",
        "analytics", "business intelligence", "bi analyst", "tableau", "power bi",
        "sql analyst", "python data", "r programmer", "statistical", "predictive model",
        "data pipeline", "etl", "spark", "hadoop", "tensorflow", "pytorch",
    ],
    "Cybersecurity & IT": [
        "cybersecurity", "security analyst", "security engineer", "soc analyst",
        "penetration test", "ethical hack", "information security", "infosec",
        "network security", "it support", "it analyst", "systems administrator",
        "help desk", "it specialist", "cloud security", "vulnerability",
    ],
    "Finance & Accounting": [
        "financial analyst", "investment bank", "equity research", "private equity",
        "venture capital", "hedge fund", "accounting", "auditor", "tax analyst",
        "cpa", "controller", "treasury", "financial model", "valuation",
        "bloomberg", "corporate finance", "fp&a", "mergers", "acquisitions",
        "credit analyst", "risk analyst", "portfolio", "wealth management",
    ],
    "Consulting & Strategy": [
        "consultant", "consulting", "strategy", "management consult",
        "business analyst", "case study", "engagement manager", "advisory",
        "transformation", "change management", "process improvement",
    ],
    "Marketing & Advertising": [
        "marketing", "digital marketing", "social media", "content market",
        "seo", "sem", "ppc", "brand manager", "copywriter", "advertising",
        "campaign manager", "growth market", "product market", "email market",
        "market research", "creative strategy",
    ],
    "Healthcare & Clinical": [
        "nurse", "nursing", "clinical", "patient care", "medical assistant",
        "healthcare", "hospital", "pharmacy tech", "physical therapy",
        "occupational therapy", "health sciences", "emt", "paramedic",
        "public health", "epidemiol",
    ],
    "Life Sciences & Research": [
        "research scientist", "lab technician", "laboratory", "biology",
        "biochemistry", "molecular", "genetics", "pharmaceutical", "biotech",
        "clinical trial", "r&d", "assay", "pcr", "cell culture",
    ],
    "Design & Creative": [
        "graphic design", "ui/ux", "ux designer", "ui designer", "product design",
        "visual design", "creative director", "art director", "illustration",
        "motion graphic", "brand design", "figma", "adobe", "photoshop",
    ],
    "Media & Communications": [
        "journalist", "reporter", "editor", "public relations", "pr specialist",
        "communications", "media relations", "content creator", "social media manager",
        "broadcast", "podcast", "video producer",
    ],
    "Management & Operations": [
        "operations", "project manager", "program manager", "supply chain",
        "logistics", "warehouse", "procurement", "vendor management",
        "business operations", "office manager", "administrative",
    ],
    "Economics & Public Policy": [
        "economist", "policy analyst", "public policy", "government affairs",
        "legislative", "regulatory", "think tank", "economic research",
        "federal reserve", "central bank",
    ],
    "Human Resources & People": [
        "human resources", "hr coordinator", "recruiter", "talent acquisition",
        "people operations", "employee relations", "benefits", "payroll",
        "learning and development", "organizational development",
    ],
    "Legal & Compliance": [
        "paralegal", "legal assistant", "compliance", "regulatory affairs",
        "contract", "litigation", "corporate counsel", "legal analyst",
        "law clerk", "juris",
    ],
    "Education & Teaching": [
        "teacher", "tutor", "instructor", "curriculum", "education",
        "academic advisor", "admissions", "student affairs", "higher education",
    ],
    "Entrepreneurship & Innovation": [
        "startup", "founder", "entrepreneur", "incubator", "accelerator",
        "venture", "innovation", "product launch", "mvp",
    ],
    "Mechanical & Aerospace Engineering": [
        "mechanical engineer", "aerospace", "cad", "solidworks", "catia",
        "manufacturing", "quality engineer", "test engineer", "propulsion",
        "structural engineer", "thermodynamics",
    ],
    "Electrical & Computer Engineering": [
        "electrical engineer", "hardware engineer", "embedded", "fpga",
        "circuit design", "pcb", "semiconductor", "vlsi", "signal processing",
        "firmware", "robotics",
    ],
}

# ── Seniority detection ──────────────────────────────────────────────────────

def _detect_seniority(title: str, desc: str) -> str:
    tl = title.lower()
    if any(w in tl for w in ["intern", "internship", "co-op", "coop"]):
        return "intern"
    if any(w in tl for w in ["junior", "jr.", "jr ", "entry level", "entry-level", "associate", "new grad", "graduate"]):
        return "junior"
    if any(w in tl for w in ["senior", "sr.", "sr ", "lead", "principal", "staff"]):
        return "senior"
    # Check description for experience requirements
    exp_match = re.search(r"(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)", desc.lower())
    if exp_match:
        years = int(exp_match.group(1))
        if years <= 1:
            return "junior"
        if years <= 3:
            return "junior"
        if years <= 5:
            return "mid"
        return "senior"
    return "junior"  # default for entry-level focus

def _detect_job_type(title: str, desc: str) -> str:
    tl = title.lower()
    if any(w in tl for w in ["intern", "internship", "co-op", "coop"]):
        return "internship"
    if any(w in tl for w in ["entry level", "entry-level", "new grad", "graduate", "junior", "associate"]):
        return "entry_level"
    if any(w in tl for w in ["part time", "part-time"]):
        return "part_time"
    return "entry_level"  # default assumption for our audience

# ── S/G/B requirement estimation ─────────────────────────────────────────────

def _estimate_sgb(title: str, desc: str, seniority: str) -> dict:
    """Estimate Smart/Grit/Build requirements from JD signals."""
    dl = desc.lower()

    # Base levels by seniority
    bases = {
        "intern":  {"smart": 45, "grit": 35, "build": 40},
        "junior":  {"smart": 55, "grit": 50, "build": 50},
        "mid":     {"smart": 65, "grit": 65, "build": 65},
        "senior":  {"smart": 75, "grit": 75, "build": 75},
    }
    sgb = dict(bases.get(seniority, bases["junior"]))

    # Smart boosters (education, certifications, technical depth)
    if any(w in dl for w in ["master", "phd", "doctorate", "graduate degree"]):
        sgb["smart"] += 10
    if any(w in dl for w in ["gpa", "grade point", "3.5", "3.7", "dean's list"]):
        sgb["smart"] += 8
    if any(w in dl for w in ["certification", "certified", "cpa", "cfa", "pe ", "fe exam"]):
        sgb["smart"] += 5

    # Grit boosters (leadership, experience, extracurriculars)
    if any(w in dl for w in ["leadership", "led a team", "managed", "mentor"]):
        sgb["grit"] += 8
    if any(w in dl for w in ["fast-paced", "startup", "entrepreneurial", "self-starter"]):
        sgb["grit"] += 5
    if any(w in dl for w in ["volunteer", "community", "extracurricular"]):
        sgb["grit"] += 3

    # Build boosters (portfolio, projects, publications)
    if any(w in dl for w in ["portfolio", "github", "personal project", "side project"]):
        sgb["build"] += 10
    if any(w in dl for w in ["published", "publication", "research paper", "conference"]):
        sgb["build"] += 8
    if any(w in dl for w in ["open source", "contributor", "blog", "technical writing"]):
        sgb["build"] += 5

    # Cap at 100
    return {k: min(v, 100) for k, v in sgb.items()}

# ── Main analyzer ────────────────────────────────────────────────────────────

def analyze_job(
    title: str,
    company: str,
    description: str,
    location: str = "",
    url: str = "",
) -> dict:
    """
    Analyze a job listing and return enriched metadata.

    Returns:
        {
            "cohort_requirements": [
                {"cohort": "Data Science & Analytics", "smart": 55, "grit": 50, "build": 60},
                {"cohort": "Finance & Accounting", "smart": 60, "grit": 55, "build": 45},
            ],
            "job_type": "internship",
            "seniority": "intern",
            "primary_cohort": "Data Science & Analytics",
        }
    """
    text = f"{title} {description}".lower()

    # Score each cohort by keyword matches
    cohort_scores: list[tuple[str, int]] = []
    for cohort, keywords in COHORT_KEYWORDS.items():
        matches = sum(1 for kw in keywords if kw in text)
        if matches >= 2:  # minimum 2 keyword hits to assign
            cohort_scores.append((cohort, matches))

    # Sort by match count descending, take top 3
    cohort_scores.sort(key=lambda x: -x[1])
    matched_cohorts = [c for c, _ in cohort_scores[:3]]

    # Fallback: if no cohorts matched, assign "Management & Operations"
    if not matched_cohorts:
        matched_cohorts = ["Management & Operations"]

    seniority = _detect_seniority(title, description)
    job_type = _detect_job_type(title, description)
    sgb_base = _estimate_sgb(title, description, seniority)

    # Build per-cohort requirements (slight variation per cohort emphasis)
    cohort_requirements = []
    for cohort in matched_cohorts:
        reqs = dict(sgb_base)
        # Adjust based on cohort emphasis
        if "Engineering" in cohort or "Software" in cohort or "Design" in cohort:
            reqs["build"] = min(reqs["build"] + 5, 100)
        if "Finance" in cohort or "Consulting" in cohort or "Legal" in cohort:
            reqs["smart"] = min(reqs["smart"] + 5, 100)
            reqs["grit"] = min(reqs["grit"] + 3, 100)
        if "Healthcare" in cohort or "Education" in cohort or "HR" in cohort:
            reqs["grit"] = min(reqs["grit"] + 5, 100)
        cohort_requirements.append({"cohort": cohort, **reqs})

    return {
        "cohort_requirements": cohort_requirements,
        "job_type": job_type,
        "seniority": seniority,
        "primary_cohort": matched_cohorts[0],
    }
