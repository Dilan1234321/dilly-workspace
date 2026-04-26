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
    # Canonical-only buckets (no prior legacy equivalent). Added 2026-04-21
    # so business_accounting / health_nursing_allied / sport_management
    # students stop falling through to "Management & Operations".
    "Accounting & Audit": [
        "accountant", "accounting", "auditor", "audit ", "cpa", "tax ",
        "tax associate", "staff accountant", "internal audit", "external audit",
        "controller", "bookkeep", "reconciliation", "financial reporting",
        "gaap", "ifrs", "big 4", "big four",
    ],
    "Nursing & Allied Health": [
        "registered nurse", "rn ", "lpn", "nursing", "nurse practitioner",
        "cna", "pharmacy technician", "respiratory therap", "occupational therap",
        "physical therap", "medical assistant", "radiologic technolog",
        "phlebotomy", "sonograph", "dental hygien", "ekg tech",
        "surgical tech", "medical coder",
    ],
    "Sport & Recreation": [
        "athletic", "sports management", "sport marketing", "recreation",
        "sports operations", "game day", "athletic department", "fitness",
        "team operations", "ncaa", "sports analytics", "sports media",
        "event operations", "front office",
    ],
}

# ── Canonical cohort mapping ─────────────────────────────────────────────────
# The DB historically stores the "legacy" labels above in
# internships.cohort_requirements. The rubric system and the mobile UI
# both speak in canonical cohort IDs defined in
# knowledge/cohort_rubrics.json (tech_cybersecurity,
# business_accounting, etc).
#
# Rather than rewrite the legacy names in every downstream surface,
# every analyzed job now carries BOTH:
#   - cohort_requirements: [{cohort: <legacy_label>, smart/grit/build}]
#   - canonical_cohorts:   [<canonical_id>, ...]
#
# Old callers keep reading cohort_requirements; new callers index on
# canonical_cohorts. The crawler's DB write path unions them into
# existing jsonb fields so no schema change is required.
#
# Multiple legacy labels can map to the same canonical cohort (e.g.
# "Cybersecurity & IT" → tech_cybersecurity). Some legacy labels span
# more than one canonical cohort (e.g. "Finance & Accounting" → both
# business_finance AND business_accounting, because the keyword list
# covers both). Downstream code is happy with 1..N canonicals per job.
LEGACY_TO_CANONICAL: dict[str, list[str]] = {
    "Software Engineering & CS":        ["tech_software_engineering"],
    "Data Science & Analytics":         ["tech_data_science"],
    "Cybersecurity & IT":               ["tech_cybersecurity"],
    "Finance & Accounting":             ["business_finance", "business_accounting"],
    "Accounting & Audit":               ["business_accounting"],
    "Consulting & Strategy":            ["business_consulting"],
    "Marketing & Advertising":          ["business_marketing"],
    "Healthcare & Clinical":            ["pre_health", "health_nursing_allied"],
    "Nursing & Allied Health":          ["health_nursing_allied"],
    "Life Sciences & Research":         ["science_research"],
    "Design & Creative Arts":           ["arts_design"],
    "Media & Communications":           ["humanities_communications"],
    "Management & Operations":          [],  # generic bucket, no cohort
    "Economics & Public Policy":        ["social_sciences"],
    "Human Resources & People":         ["social_sciences"],
    "Legal & Compliance":               ["pre_law"],
    "Education & Teaching":             ["social_sciences"],
    "Entrepreneurship & Innovation":    [],  # spans many cohorts, skip
    "Mechanical & Aerospace Engineering": ["tech_software_engineering"],  # nearest fit
    "Electrical & Computer Engineering": ["tech_software_engineering"],
    "Sport & Recreation":               ["sport_management"],
}


def _canonical_cohorts_for(legacy_labels: list[str]) -> list[str]:
    """Translate the list of legacy cohort labels into canonical IDs.
    De-duplicates and preserves relative order of first appearance."""
    out: list[str] = []
    for label in legacy_labels:
        for cid in LEGACY_TO_CANONICAL.get(label, []):
            if cid not in out:
                out.append(cid)
    return out


# ── Seniority detection ──────────────────────────────────────────────────────

_JA_EXEC_WORDS = (
    "managing director", "managing partner", "vice president", " vp ", "head of",
    "chief ", " cto", " cfo", " coo", " ceo", " cmo", " ciso",
    "director", "partner ", "president",
)
_JA_SENIOR_WORDS = ("senior", " sr ", "sr.", "lead ", "staff ", "principal ")
_JA_INTERN_WORDS = (
    "intern", "internship", "co-op", "coop",
    "summer analyst", "summer associate", "summer fellow",
    "summer engineer", "summer swe", "summer program", "summer intern",
    "apprentice", "trainee", "rotational analyst", "rotational program",
)
_JA_ENTRY_WORDS = (
    "entry level", "entry-level", "new grad", "new graduate",
    "junior", "jr ", "jr.", "graduate", "associate",
    "early career", "level 1", "analyst i ", "engineer i ",
)


def _detect_seniority(title: str, desc: str) -> str:
    tl = title.lower()
    # Exec → treat as senior for S/G/B purposes
    if any(w in tl for w in _JA_EXEC_WORDS):
        return "senior"
    # Intern/summer keywords → intern
    if any(w in tl for w in _JA_INTERN_WORDS):
        return "intern"
    # Year-prefixed summer programs: "2025 Summer Analyst"
    if re.search(r"\b20\d{2}\s+summer\b|\bsummer\s+20\d{2}\b", tl):
        return "intern"
    if any(w in tl for w in _JA_SENIOR_WORDS):
        return "senior"
    if any(w in tl for w in _JA_ENTRY_WORDS):
        return "junior"
    # Description experience heuristic
    exp_match = re.search(r"(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)", (desc or "").lower())
    if exp_match:
        years = int(exp_match.group(1))
        if years <= 2:
            return "junior"
        if years <= 4:
            return "mid"
        return "senior"
    return "junior"  # default for entry-level focus


def _detect_job_type(title: str, desc: str) -> str:
    tl = title.lower()
    # Exec disqualifier — these are clearly full-time senior roles
    if any(w in tl for w in _JA_EXEC_WORDS):
        return "full_time"
    # Intern/summer signals
    if any(w in tl for w in _JA_INTERN_WORDS):
        # Exclude if senior modifiers are also present ("Senior Intern Coordinator")
        if not any(w in tl for w in _JA_SENIOR_WORDS):
            return "internship"
    # Year-prefixed summer programs: "2025 Summer Analyst", "Summer 2025 Associate"
    if re.search(r"\b20\d{2}\s+summer\b|\bsummer\s+20\d{2}\b", tl):
        return "internship"
    # Senior IC → full-time
    if any(w in tl for w in _JA_SENIOR_WORDS):
        return "full_time"
    # Part-time
    if any(w in tl for w in ("part time", "part-time")):
        return "part_time"
    # Entry-level
    if any(w in tl for w in _JA_ENTRY_WORDS):
        return "entry_level"
    # Description experience heuristic
    exp = re.search(r"(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)", (desc or "").lower())
    if exp:
        years = int(exp.group(1))
        if years >= 5:
            return "full_time"
        if years <= 2:
            return "entry_level"
    return "full_time"  # safer default; entry_level was over-broad

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

    canonical_cohorts = _canonical_cohorts_for(matched_cohorts)

    return {
        "cohort_requirements": cohort_requirements,
        "job_type": job_type,
        "seniority": seniority,
        "primary_cohort": matched_cohorts[0],
        # Canonical cohort IDs matching knowledge/cohort_rubrics.json.
        # Empty list is possible when every matched legacy label has no
        # canonical mapping (e.g. "Management & Operations" only).
        "canonical_cohorts": canonical_cohorts,
        # Primary canonical = the first matched legacy label's first
        # canonical, or None when none exists.
        "primary_canonical_cohort": canonical_cohorts[0] if canonical_cohorts else None,
    }
