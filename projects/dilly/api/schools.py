"""
School config for backend (email domain → theme + copy). Kept in sync with dashboard src/lib/schools.ts.
Used for verification emails and any school-specific API behavior.
"""

# id -> { name, short_name, domains[], primary, secondary, tagline, email_headline }
SCHOOLS = {
    "utampa": {
        "id": "utampa",
        "name": "University of Tampa",
        "short_name": "UT",
        "domains": ["spartans.ut.edu"],
        "primary": "#C8102E",   # UT Red
        "secondary": "#FFCD00", # UT Golden Yellow
        "tagline": "Your career center. Open 24/7.",
        "mascot_name": "Spartans",
        "email_headline": "Your future starts with one step.",
        "email_subhead": "Welcome to Dilly",
    },
}


def _domain_to_school():
    m = {}
    for sid, s in SCHOOLS.items():
        for d in s.get("domains", []):
            m[d.lower()] = s
    return m


_DOMAIN_MAP = _domain_to_school()


def get_school_from_email(email: str) -> dict | None:
    """Return school config for this .edu email, or None if unknown. Keys: id, name, short_name, primary, secondary, tagline, mascot_name, email_headline, email_subhead."""
    if not email or "@" not in email:
        return None
    domain = email.strip().lower().split("@")[-1]
    return _DOMAIN_MAP.get(domain)


# Pre-professional tracks offered at UTampa (onboarding) → category for scoring. Kept in sync with dashboard PRE_PROFESSIONAL_TRACKS.
PRE_PROFESSIONAL_TO_CATEGORY = {
    "Pre-Med": "Pre-Health",
    "Pre-PA": "Pre-Health",
    "Pre-Dental": "Pre-Health",
    "Pre-Vet": "Pre-Health",
    "Pre-PT": "Pre-Health",
    "Pre-OT": "Pre-Health",
    "Pre-Pharmacy": "Pre-Health",
    "Pre-Law": "Pre-Law",
}


def get_track_category(track: str) -> str:
    """Map pre-professional track (Pre-Med, Pre-Vet, etc.) to category (Pre-Health, Pre-Law) for scoring. If unknown, return track as-is."""
    if not track:
        return track
    return PRE_PROFESSIONAL_TO_CATEGORY.get(track.strip(), track)
