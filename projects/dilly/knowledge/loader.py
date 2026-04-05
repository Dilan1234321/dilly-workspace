"""
Dilly Knowledge Loader
Loads track-specific knowledge files for use in gap scanning, auditing, and Voice context.
"""

import json
import os
from functools import lru_cache
from typing import List

_KNOWLEDGE_DIR = os.path.dirname(os.path.abspath(__file__))

_TRACK_FILE_MAP = {
    "Pre-Law": "pre_law.json",
    "Pre-Health": "pre_health.json",
    "Tech": "tech.json",
    "Business": "business.json",
    "Finance": "business.json",
    "Consulting": "business.json",
    "Science": "science.json",
    "Communications": "communications.json",
    "Education": "education.json",
    "Arts": "arts.json",
    "Humanities": "humanities.json",
}


@lru_cache(maxsize=16)
def load_knowledge(track: str) -> dict | None:
    """Load and cache knowledge file for a track. Returns None if no file exists."""
    filename = _TRACK_FILE_MAP.get(track)
    if not filename:
        return None
    path = os.path.join(_KNOWLEDGE_DIR, filename)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def get_school_profile(track: str, school_name: str) -> dict | None:
    """Look up a specific school/firm by name within a track's knowledge file."""
    knowledge = load_knowledge(track)
    if not knowledge:
        return None

    school_name_lower = school_name.lower()

    # Pre-Law / Pre-Health: schools list
    schools = knowledge.get("schools") or knowledge.get("school_tiers") or []
    for school in schools:
        name = (school.get("name") or "").lower()
        if school_name_lower in name or name in school_name_lower:
            return school

    # Business: nested subtracks with firms
    subtracks = knowledge.get("subtracks") or {}
    for subtrack_data in subtracks.values():
        firms = subtrack_data.get("firms") or []
        for firm in firms:
            name = (firm.get("name") or "").lower()
            if school_name_lower in name or name in school_name_lower:
                return firm

    # Tech: companies list
    companies = knowledge.get("companies") or []
    for company in companies:
        name = (company.get("name") or "").lower()
        if school_name_lower in name or name in school_name_lower:
            return company

    return None


def build_gap_scan_context(track: str, target_school: str | None = None) -> str:
    """
    Build a text block of track-specific knowledge to inject into the gap scanner prompt.
    If target_school is provided and found, includes school-specific benchmarks.
    """
    knowledge = load_knowledge(track)
    if not knowledge:
        return ""

    lines = []
    lines.append(f"## {track} Track Knowledge (sourced: {knowledge.get('last_updated', 'unknown')})")

    # Dimension definitions
    dims = knowledge.get("dimensions") or {}
    for dim_key, dim_data in dims.items():
        if isinstance(dim_data, dict):
            label = dim_data.get("label", dim_key.capitalize())
            what_counts = dim_data.get("what_counts") or []
            lines.append(f"\n{label} ({dim_key.capitalize()}) - what counts for this track:")
            for item in what_counts[:5]:
                lines.append(f"  - {item}")

    # Common gaps
    common_gaps = knowledge.get("common_gaps") or []
    if common_gaps:
        lines.append("\nKnown screening gaps for this track:")
        for gap in common_gaps:
            severity = gap.get("severity", "moderate")
            lines.append(f"  [{severity.upper()}] {gap.get('gap', '')}: {gap.get('fix', '')}")

    # School-specific data
    if target_school:
        school_profile = get_school_profile(track, target_school)
        if school_profile:
            lines.append(f"\n## Target: {school_profile.get('name', target_school)}")

            # Numeric benchmarks (Pre-Law)
            if "median_lsat" in school_profile:
                lines.append(f"  LSAT: median {school_profile['median_lsat']}, 25th-75th: {school_profile.get('p25_lsat')}-{school_profile.get('p75_lsat')}")
                lines.append(f"  GPA: median {school_profile['median_gpa']}, 25th-75th: {school_profile.get('p25_gpa')}-{school_profile.get('p75_gpa')}")
                ar = school_profile.get("acceptance_rate")
                if ar:
                    lines.append(f"  Acceptance rate: {ar * 100:.1f}%")

            # Numeric benchmarks (Pre-Health tiers)
            if "median_mcat" in school_profile:
                lines.append(f"  MCAT median: {school_profile['median_mcat']}, GPA median: {school_profile['median_gpa']}")

            # GPA floor (business/finance)
            if "gpa_floor" in school_profile:
                lines.append(f"  GPA floor: {school_profile['gpa_floor']}")

            priorities = school_profile.get("priorities") or []
            if priorities:
                lines.append(f"  Priorities: {'; '.join(priorities[:4])}")

            hiring_culture = school_profile.get("hiring_culture") or school_profile.get("notes")
            if hiring_culture:
                lines.append(f"  Culture/notes: {hiring_culture[:300]}")

    # Scraped criteria from public career pages (when target matches)
    if target_school:
        scraped = load_scraped_criteria(target_school)
        if scraped:
            lines.append("\n## Scraped from company career page (source: public)")
            for s in scraped[:3]:
                content = (s.get("content") or "").strip()[:400]
                if content:
                    lines.append(f"  {s.get('heading', '')}: {content}...")

    return "\n".join(lines)


def load_scraped_criteria(company_name: str) -> List[dict] | None:
    """
    Load scraped criteria for a company from knowledge/scraped_criteria.json.
    Returns list of {heading, content, source_url} or None if not found.
    Run scripts/company_criteria_scraper.py to populate.
    """
    path = os.path.join(_KNOWLEDGE_DIR, "scraped_criteria.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None
    sources = data.get("sources") or []
    name_lower = (company_name or "").lower()
    for src in sources:
        if (src.get("company") or "").lower() in name_lower or name_lower in (src.get("company") or "").lower():
            sections = src.get("sections") or []
            return [{"heading": s.get("heading"), "content": s.get("content"), "source_url": src.get("source_url")} for s in sections if s.get("content") and len((s.get("content") or "").strip()) > 50]
    return None


def build_voice_knowledge_snippet(track: str, target_school: str | None = None) -> str:
    """
    Compact knowledge snippet for injecting into Voice context (kept short to avoid blowing token budget).
    """
    knowledge = load_knowledge(track)
    if not knowledge:
        return ""

    lines = []

    # School-specific data (most valuable for Voice)
    if target_school:
        school_profile = get_school_profile(track, target_school)
        if school_profile:
            name = school_profile.get("name", target_school)
            lines.append(f"Target school/firm: {name}")

            if "median_lsat" in school_profile:
                lines.append(f"  {name} LSAT median: {school_profile['median_lsat']} (25th: {school_profile.get('p25_lsat')}, 75th: {school_profile.get('p75_lsat')})")
                lines.append(f"  {name} GPA median: {school_profile['median_gpa']} (25th: {school_profile.get('p25_gpa')}, 75th: {school_profile.get('p75_gpa')})")
                ar = school_profile.get("acceptance_rate")
                if ar:
                    lines.append(f"  {name} acceptance rate: {ar * 100:.1f}%")

            if "median_mcat" in school_profile:
                lines.append(f"  {name} MCAT median: {school_profile['median_mcat']}, GPA median: {school_profile['median_gpa']}")

            if "gpa_floor" in school_profile:
                lines.append(f"  {name} GPA floor: {school_profile['gpa_floor']}")

            priorities = school_profile.get("priorities") or []
            if priorities:
                lines.append(f"  {name} top priorities: {', '.join(priorities[:3])}")

            notes = school_profile.get("notes") or school_profile.get("hiring_culture")
            if notes:
                lines.append(f"  {name} insight: {notes[:200]}")

    # Top 3 critical gaps for the track (always useful)
    common_gaps = knowledge.get("common_gaps") or []
    critical_gaps = [g for g in common_gaps if g.get("severity") == "critical"][:3]
    if critical_gaps:
        lines.append(f"\nTop critical gaps for {track} applicants (use these to audit their profile):")
        for gap in critical_gaps:
            lines.append(f"  - {gap.get('gap', '')}")

    return "\n".join(lines)
