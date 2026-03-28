"""
Dilly Interests — curated list and job keyword mapping.
Used by:
- Profile API (validate interests)
- Jobs API (relevance filtering)
- Onboarding + Edit Profile (UI)
"""

# ── Curated interest list ──────────────────────────────────────────────────────
# Students pick from this list. Their majors/minors auto-populate.

INTERESTS_LIST = [
    "Software Engineering & CS",
    "Data Science & Analytics",
    "Cybersecurity & IT",
    "Electrical & Computer Engineering",
    "Mechanical & Aerospace Engineering",
    "Civil & Environmental Engineering",
    "Chemical & Biomedical Engineering",
    "Finance & Accounting",
    "Consulting & Strategy",
    "Marketing & Advertising",
    "Management & Operations",
    "Entrepreneurship & Innovation",
    "Economics & Public Policy",
    "Healthcare & Clinical",
    "Biotech & Pharmaceutical",
    "Life Sciences & Research",
    "Physical Sciences & Math",
    "Law & Government",
    "Media & Communications",
    "Design & Creative Arts",
    "Education & Human Development",
    "Social Sciences & Nonprofit",
]

# ── Interest → job keyword mapping ─────────────────────────────────────────────
# Maps each interest to keywords that match job titles, tags, and descriptions.
# A student with "Computer Science" interest will see jobs matching any of these keywords.

INTEREST_JOB_KEYWORDS: dict[str, list[str]] = {
    "Accounting": ["accounting", "accountant", "audit", "tax", "bookkeeping", "cpa"],
    "Aerospace Engineering": ["aerospace", "aviation", "flight", "propulsion", "satellite"],
    "Architecture": ["architect", "architecture", "urban design", "building design"],
    "Art & Design": ["art", "design", "creative", "visual", "illustration", "graphic"],
    "Biochemistry": ["biochemistry", "biochem", "molecular biology", "lab research"],
    "Biology": ["biology", "biotech", "life sciences", "lab", "genomics", "research"],
    "Biomedical Engineering": ["biomedical", "biotech", "medical device", "biomechanics"],
    "Business Administration": ["business", "operations", "management", "strategy", "admin"],
    "Chemical Engineering": ["chemical engineer", "process engineer", "materials"],
    "Chemistry": ["chemistry", "chemical", "lab", "formulation", "analytical"],
    "Civil Engineering": ["civil engineer", "structural", "construction", "infrastructure"],
    "Communications": ["communications", "media", "pr", "public relations", "content"],
    "Computer Engineering": ["computer engineer", "hardware", "embedded", "firmware", "fpga"],
    "Computer Science": ["software", "engineer", "developer", "programming", "backend", "frontend", "full-stack", "fullstack", "web dev", "mobile dev", "api", "systems", "infrastructure", "devops", "cloud", "sre"],
    "Criminal Justice": ["criminal justice", "law enforcement", "compliance", "legal"],
    "Cybersecurity": ["security", "cybersecurity", "infosec", "penetration", "threat", "soc"],
    "Data Science": ["data science", "data analyst", "machine learning", "ml", "ai", "analytics", "data engineer", "deep learning", "nlp", "computer vision"],
    "Economics": ["economics", "economist", "economic", "policy", "monetary"],
    "Education": ["education", "teaching", "curriculum", "instructional", "tutor"],
    "Electrical Engineering": ["electrical engineer", "power systems", "circuits", "signal"],
    "English": ["writing", "editorial", "editor", "content", "copywriter", "technical writer"],
    "Entrepreneurship": ["startup", "entrepreneur", "venture", "innovation", "founder", "product", "business development", "growth"],
    "Environmental Science": ["environmental", "sustainability", "climate", "ecology", "green"],
    "Film & Media": ["film", "video", "production", "media", "broadcast", "streaming"],
    "Finance": ["finance", "financial", "banking", "investment", "trading", "asset management", "equity", "credit", "risk", "portfolio", "wealth", "analyst"],
    "Graphic Design": ["graphic design", "visual design", "ui design", "branding", "creative"],
    "Health Sciences": ["health", "healthcare", "clinical", "medical", "patient", "wellness"],
    "History": ["history", "historical", "museum", "archives", "preservation"],
    "Hospitality Management": ["hospitality", "hotel", "restaurant", "tourism", "events"],
    "Human Resources": ["human resources", "hr", "talent", "recruiting", "people operations"],
    "Industrial Engineering": ["industrial engineer", "manufacturing", "lean", "quality"],
    "Information Systems": ["information systems", "it", "systems admin", "database", "erp"],
    "International Relations": ["international", "diplomacy", "foreign policy", "global"],
    "Journalism": ["journalism", "reporter", "news", "editorial", "investigative"],
    "Kinesiology": ["kinesiology", "sports science", "exercise", "physical therapy", "athletic"],
    "Linguistics": ["linguistics", "language", "translation", "nlp", "localization"],
    "Management": ["management", "manager", "operations", "project management", "coordinator"],
    "Marine Biology": ["marine", "ocean", "aquatic", "fisheries", "coastal"],
    "Marketing": ["marketing", "brand", "digital marketing", "seo", "advertising", "campaign", "social media", "growth"],
    "Mathematics": ["mathematics", "math", "quantitative", "statistical", "actuary", "computational"],
    "Mechanical Engineering": ["mechanical engineer", "robotics", "cad", "thermal", "manufacturing"],
    "Music": ["music", "audio", "sound", "recording", "composition"],
    "Neuroscience": ["neuroscience", "neuro", "brain", "cognitive", "neuroimaging"],
    "Nursing": ["nursing", "nurse", "rn", "clinical", "patient care"],
    "Nutrition": ["nutrition", "dietitian", "food science", "dietary"],
    "Philosophy": ["philosophy", "ethics", "logic", "critical thinking"],
    "Physics": ["physics", "quantum", "optics", "photonics", "particle"],
    "Political Science": ["political", "politics", "government", "policy", "legislative", "campaign"],
    "Pre-Law": ["legal", "law", "paralegal", "compliance", "contract", "litigation"],
    "Pre-Med": ["medical", "clinical", "patient", "healthcare", "physician", "research"],
    "Psychology": ["psychology", "behavioral", "counseling", "mental health", "ux research", "user research"],
    "Public Health": ["public health", "epidemiology", "health policy", "global health"],
    "Public Relations": ["public relations", "pr", "communications", "media relations"],
    "Real Estate": ["real estate", "property", "commercial real estate", "development"],
    "Social Work": ["social work", "community", "nonprofit", "advocacy", "case management"],
    "Sociology": ["sociology", "social research", "community", "demographics"],
    "Software Engineering": ["software", "engineer", "developer", "programming", "backend", "frontend", "full-stack", "fullstack", "devops", "cloud", "api"],
    "Statistics": ["statistics", "statistical", "biostatistics", "quantitative", "data analyst"],
    "Supply Chain Management": ["supply chain", "logistics", "procurement", "inventory", "warehouse"],
    "Theater & Performing Arts": ["theater", "performing arts", "acting", "production", "stage"],
    "UX Design": ["ux", "user experience", "ui/ux", "interaction design", "usability", "product design", "figma"],
    "Urban Planning": ["urban planning", "city planning", "zoning", "transportation"],
}

# ── Education levels ───────────────────────────────────────────────────────────

EDUCATION_LEVELS = ["Undergraduate", "Masters", "PhD", "MBA"]

# Keywords in job titles/descriptions that indicate education level requirements
GRAD_LEVEL_KEYWORDS = {
    "phd": ["phd", "ph.d", "doctoral", "doctorate"],
    "masters": ["masters", "master's", "ms ", "m.s.", "graduate student", "grad student"],
    "mba": ["mba", "m.b.a"],
}


def job_requires_grad_level(title: str, description: str) -> str | None:
    """Return 'phd', 'masters', or 'mba' if the job requires that level. None if undergrad-eligible."""
    text = f"{title} {description[:1000]}".lower()
    # Check title first (strongest signal)
    title_lower = title.lower()
    for level, keywords in GRAD_LEVEL_KEYWORDS.items():
        for kw in keywords:
            if kw in title_lower:
                return level
    # Check description (weaker signal — only if it says "required" near the keyword)
    for level, keywords in GRAD_LEVEL_KEYWORDS.items():
        for kw in keywords:
            idx = text.find(kw)
            if idx != -1:
                # Check if "required" or "must have" is within 100 chars
                context = text[max(0, idx - 50):idx + len(kw) + 100]
                if any(req in context for req in ["required", "must have", "must be", "pursuing a", "enrolled in a"]):
                    return level
    return None


def job_matches_interests(title: str, tags: list[str], description: str, interests: list[str]) -> bool:
    """Return True if the job matches at least one of the student's interests."""
    if not interests:
        return True  # No interests set — show everything

    text = f"{title} {' '.join(tags)} {description[:500]}".lower()

    for interest in interests:
        keywords = INTEREST_JOB_KEYWORDS.get(interest, [])
        if not keywords:
            # Fallback: use the interest name itself as a keyword
            if interest.lower() in text:
                return True
            continue
        for kw in keywords:
            if kw in text:
                return True

    return False
