"""
Canonical tag ontology for cohort-agnostic matching.

This is the single source of truth for:
- canonical tags (display form)
- synonym phrases (lowercase) that map into canonical tags

Design constraints:
- Deterministic: no LLM required to apply ontology
- Bounded: keep vocab reasonably sized; expand over time
- Cross-cohort: cover tools, domains, and competencies across ALL_TRACKS
"""

from __future__ import annotations


# Canonical tags are the values; keys are normalized phrases (lowercase).
# Keep keys free of trailing spaces; matching is done with word boundaries.
CANONICAL_TAGS: dict[str, str] = {
    # --- Tech / data tools ---
    "python": "Python",
    "java": "Java",
    "javascript": "JavaScript",
    "js": "JavaScript",
    "typescript": "TypeScript",
    "sql": "SQL",
    "c++": "C++",
    "c#": "C#",
    "html": "HTML",
    "css": "CSS",
    "react": "React",
    "node": "Node.js",
    "node.js": "Node.js",
    "git": "Git",
    "linux": "Linux",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "tableau": "Tableau",
    "power bi": "Power BI",
    "powerbi": "Power BI",
    "data analysis": "Data analysis",
    "data analytics": "Data analytics",
    "statistics": "Statistics",
    "machine learning": "Machine learning",
    "ml": "Machine learning",
    "artificial intelligence": "Machine learning",
    "ai": "Machine learning",
    "llm": "Machine learning",
    "llms": "Machine learning",
    "nlp": "Machine learning",
    "computer vision": "Machine learning",
    "deep learning": "Machine learning",
    "rag": "Machine learning",
    "genai": "Machine learning",

    # --- Finance / business ---
    "excel": "Excel",
    "financial modeling": "Financial modeling",
    "valuation": "Valuation",
    "fp&a": "FP&A",
    "fpa": "FP&A",
    "budgeting": "Budgeting",
    "forecasting": "Forecasting",
    "due diligence": "Due diligence",
    "private equity": "Private equity",
    "investment banking": "Investment banking",
    "accounting": "Accounting",

    # --- Pre-health / science ---
    "clinical": "Clinical experience",
    "shadowing": "Clinical experience",
    "patient care": "Clinical experience",
    "emt": "Clinical experience",
    "research": "Research",
    "lab": "Lab experience",
    "laboratory": "Lab experience",
    "biochemistry": "Biochemistry",
    "biology": "Biology",
    "chemistry": "Chemistry",

    # --- Pre-law / humanities ---
    "legal": "Legal experience",
    "law": "Legal experience",
    "advocacy": "Advocacy",
    "policy": "Policy",
    "writing": "Writing",
    "research writing": "Writing",

    # --- Communications / arts / design ---
    "public relations": "Public relations",
    "pr": "Public relations",
    "journalism": "Journalism",
    "content": "Content",
    "marketing": "Marketing",
    "graphic design": "Graphic design",
    "figma": "Figma",
    "ui": "UI/UX",
    "ux": "UI/UX",

    # --- Education ---
    "teaching": "Teaching",
    "tutoring": "Tutoring",
}


# Competencies (soft tags) kept separate so we can tune weight differently.
COMPETENCY_TAGS: dict[str, str] = {
    "leadership": "Leadership",
    "teamwork": "Teamwork",
    "communication": "Communication",
    "project management": "Project management",
    "cross-functional": "Cross-functional",
    "analytical": "Analytical",
    "problem solving": "Problem solving",
    "critical thinking": "Critical thinking",
    "public speaking": "Public speaking",
    "presentation": "Presentation",
    "collaboration": "Collaboration",
    "client-facing": "Client-facing",
    "client": "Client-facing",
    "volunteer": "Volunteer",
    "mentorship": "Mentorship",
}


def all_vocab() -> dict[str, str]:
    """Merged vocab for scanning/token matching."""
    return {**CANONICAL_TAGS, **COMPETENCY_TAGS}

