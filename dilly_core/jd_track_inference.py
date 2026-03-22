"""
Infer career track from job description and optional title.

Used by jd_to_meridian_scores to anchor score inference to track benchmarks.
Returns one of: Tech, Pre-Health, Pre-Law, Business, Finance, Consulting,
Science, Communications, Education, Arts, Humanities, or None if unclear.
"""

import re
from typing import Optional

# Keywords per track (case-insensitive). Order matters for ties: first match wins.
_TRACK_KEYWORDS: list[tuple[str, list[str]]] = [
    ("Pre-Health", [
        "pre-med", "pre-medical", "medical school", "physician", "clinical", "patient care",
        "healthcare", "nursing", "pharmacy", "dental", "veterinary", "med school",
        "mcat", "clinical hours", "shadowing", "scribing", "emt", "hospital",
    ]),
    ("Pre-Law", [
        "law school", "legal", "attorney", "paralegal", "litigation", "lsat",
        "juris", "court", "legal research", "mock trial", "moot court",
    ]),
    ("Tech", [
        "software engineer", "software developer", "developer", "programming", "coding",
        "full stack", "frontend", "backend", "machine learning", "data science",
        "computer science", "cs degree", "python", "javascript", "react", "java",
        "software", "engineering", "devops", "cloud", "aws", "api",
    ]),
    ("Finance", [
        "investment banking", "analyst", "finance", "banking", "trading", "portfolio",
        "cfa", "cpa", "audit", "valuation", "equity", "fixed income", "wealth management",
        "financial", "accounting", "investment", "capital markets",
    ]),
    ("Consulting", [
        "consulting", "consultant", "strategy", "management consulting", "mckinsey",
        "bain", "bcg", "deloitte consulting", "case study", "client engagement",
    ]),
    ("Science", [
        "research", "lab", "phd", "publication", "scientific", "biology", "chemistry",
        "physics", "neuroscience", "biotech", "wet lab", "data analysis",
    ]),
    ("Business", [
        "business", "marketing", "sales", "operations", "product management",
        "project management", "analytics", "strategy", "mba",
    ]),
    ("Communications", [
        "communications", "pr", "public relations", "media", "journalism",
        "content", "social media", "brand", "marketing communications",
    ]),
    ("Education", [
        "teaching", "education", "teacher", "tutor", "curriculum", "classroom",
        "student", "school", "instruction",
    ]),
    ("Arts", [
        "design", "creative", "art", "graphic design", "ux design", "ui design",
        "film", "theater", "music", "performance", "exhibition",
    ]),
    ("Humanities", [
        "humanities", "history", "philosophy", "english", "writing", "literature",
        "policy", "political", "nonprofit", "ngo",
    ]),
]

# Default when no match
_DEFAULT_TRACK = "Humanities"


def infer_track_from_jd(
    job_description: str,
    job_title: Optional[str] = None,
) -> Optional[str]:
    """
    Infer career track from job description and optional title.

    Uses keyword matching. Returns track name or None if text is empty.
    Falls back to Humanities when no strong match (caller can use as default).
    """
    text = ((job_title or "") + " " + (job_description or "")).lower()
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return None

    scores: dict[str, int] = {}
    for track, keywords in _TRACK_KEYWORDS:
        count = sum(1 for kw in keywords if kw in text)
        if count > 0:
            scores[track] = count

    if not scores:
        return _DEFAULT_TRACK
    return max(scores, key=scores.get)
