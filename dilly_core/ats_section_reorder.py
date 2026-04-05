"""
Dilly ATS Section Reorder Suggestions.

Per-vendor preferred section order based on parsing behavior.
Workday, Greenhouse, iCIMS, and Lever each have different preferences.
"""

from typing import Dict, List, Optional, Tuple


# Map section keys to canonical categories for order comparison
_SECTION_TO_CANONICAL: Dict[str, str] = {
    "_top": "contact",
    "contact": "contact",
    "contact / top": "contact",
    "summary": "summary",
    "objective": "summary",
    "professional summary": "summary",
    "profile": "summary",
    "education": "education",
    "academic": "education",
    "academics": "education",
    "qualifications": "education",
    "experience": "experience",
    "work experience": "experience",
    "professional experience": "experience",
    "employment": "experience",
    "work history": "experience",
    "skills": "skills",
    "technical skills": "skills",
    "core competencies": "skills",
    "projects": "projects",
    "research": "projects",
    "research experience": "projects",
    "certifications": "certifications",
    "honors": "honors",
    "activities": "activities",
    "involvement": "activities",
    "volunteer": "activities",
    "leadership": "activities",
    "publications": "publications",
}


def _to_canonical(key: str) -> str:
    """Map a section key to canonical category."""
    lower = key.lower().strip()
    if lower in _SECTION_TO_CANONICAL:
        return _SECTION_TO_CANONICAL[lower]
    for sub, cat in [
        ("experience", "experience"), ("work", "experience"), ("employment", "experience"),
        ("education", "education"), ("academic", "education"),
        ("skill", "skills"), ("competenc", "skills"),
        ("summary", "summary"), ("objective", "summary"), ("profile", "summary"),
        ("project", "projects"), ("research", "projects"),
        ("contact", "contact"), ("_top", "contact"),
        ("certif", "certifications"), ("honor", "honors"),
        ("activit", "activities"), ("involve", "activities"), ("volunteer", "activities"),
    ]:
        if sub in lower:
            return cat
    return "other"


# Per-vendor preferred section order (canonical names).
# Order matters: first = top of resume.
_VENDOR_PREFERRED_ORDER: Dict[str, List[str]] = {
    "workday": ["contact", "summary", "experience", "education", "skills", "projects", "certifications", "activities", "other"],
    "greenhouse": ["contact", "summary", "experience", "projects", "education", "skills", "certifications", "activities", "other"],
    "icims": ["contact", "summary", "experience", "education", "skills", "projects", "certifications", "activities", "other"],
    "lever": ["contact", "summary", "experience", "projects", "education", "skills", "certifications", "activities", "other"],
}


def _canonical_order(section_keys: List[str]) -> List[str]:
    """Convert section keys to canonical order, preserving relative order of same-category."""
    seen: set = set()
    result: List[str] = []
    for k in section_keys:
        c = _to_canonical(k)
        if c not in seen:
            seen.add(c)
            result.append(c)
    return result


def _suggested_order(current: List[str], preferred: List[str]) -> List[str]:
    """Reorder current to match preferred as closely as possible. Returns suggested order."""
    current_set = set(current)
    result: List[str] = []
    for p in preferred:
        if p in current_set:
            result.append(p)
    # Append any current sections not in preferred (e.g. "other")
    for c in current:
        if c not in result:
            result.append(c)
    return result


def get_reorder_suggestion(
    section_order: List[str],
    vendor: str,
) -> Optional[Tuple[str, List[str], List[str]]]:
    """
    Get section reorder suggestion for a vendor.

    Args:
        section_order: Section keys in document order (from ATS analysis)
        vendor: "workday" | "greenhouse" | "icims" | "lever"

    Returns:
        None if order is fine, else (message, current_canonical, suggested_canonical)
    """
    if not section_order:
        return None

    preferred = _VENDOR_PREFERRED_ORDER.get(vendor)
    if not preferred:
        return None

    current_canonical = _canonical_order(section_order)
    suggested = _suggested_order(current_canonical, preferred)

    if current_canonical == suggested:
        return None

    # Build human-readable message
    vendor_display = {"workday": "Workday", "greenhouse": "Greenhouse", "icims": "iCIMS", "lever": "Lever"}.get(vendor, vendor)
    msg = f"{vendor_display} parses best with this order: " + " → ".join(s.title() for s in suggested[:6])
    if len(suggested) > 6:
        msg += " (then others)"

    return (msg, current_canonical, suggested)


def get_all_reorder_suggestions(section_order: List[str]) -> Dict[str, dict]:
    """
    Get reorder suggestions for all four vendors.

    Returns:
        { vendor: { "message": str, "current": [...], "suggested": [...] } or {} if no change needed }
    """
    result: Dict[str, dict] = {}
    for vendor in ("workday", "greenhouse", "icims", "lever"):
        suggestion = get_reorder_suggestion(section_order, vendor)
        if suggestion:
            msg, current, suggested = suggestion
            result[vendor] = {"message": msg, "current": current, "suggested": suggested}
    return result
