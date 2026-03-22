"""
Layer 2 — Section header dictionary. All keys lowercase, values canonical uppercase.
"""
SECTION_HEADER_MAP: dict[str, str] = {}

# Build canonical entries
_variants = [
    ("EXPERIENCE", [
        "experience", "work experience", "professional experience", "relevant experience",
        "employment history", "work history", "career history", "professional background",
        "internship experience", "internships", "professional journey", "my experience",
        "positions held", "roles", "employment", "related experience", "applicable experience",
    ]),
    ("EDUCATION", [
        "education", "academic background", "academic history", "educational background",
        "schooling", "academic experience", "degrees", "training and education",
        "educational qualifications", "academic credentials",
    ]),
    ("SKILLS", [
        "skills", "technical skills", "core skills", "key skills", "competencies",
        "core competencies", "technical competencies", "areas of expertise", "expertise",
        "technologies", "tools", "tools & technologies", "technical proficiencies",
        "proficiencies", "languages & tools", "programming languages", "software",
        "hard skills", "software skills", "technology skills", "digital skills",
    ]),
    ("PROJECTS", [
        "projects", "personal projects", "academic projects", "project experience",
        "selected projects", "relevant projects", "portfolio", "key projects",
        "notable projects", "independent projects",
    ]),
    ("CERTIFICATIONS", [
        "certifications", "certificates", "licenses", "licenses & certifications",
        "professional certifications", "credentials", "accreditations",
        "professional development", "training",
    ]),
    ("ACTIVITIES", [
        "campus involvement", "extracurricular activities", "activities",
        "clubs and organizations", "organizations", "involvement", "campus activities",
        "student organizations", "community involvement", "extracurriculars",
        "campus leadership", "student activities",
    ]),
    ("LEADERSHIP", [
        "leadership", "leadership experience", "leadership roles",
        "leadership & involvement", "positions of leadership",
    ]),
    ("VOLUNTEERING", [
        "volunteer experience", "volunteering", "community service", "service",
        "civic engagement", "nonprofit experience",
    ]),
    ("SUMMARY", [
        "summary", "professional summary", "career summary", "objective",
        "career objective", "profile", "professional profile", "about me",
        "overview", "executive summary", "personal statement", "career overview",
        "introduction",
    ]),
    ("HONORS", [
        "awards", "honors", "honors & awards", "achievements", "recognition",
        "scholarships", "fellowships", "awards & honors", "distinctions", "accolades",
        "academic honors",
    ]),
    ("PUBLICATIONS", [
        "publications", "published works", "research publications", "papers", "articles",
    ]),
    ("RESEARCH", [
        "research", "research experience", "research projects", "undergraduate research",
        "academic research",
    ]),
    ("LANGUAGES", [
        "languages", "foreign languages", "spoken languages", "language proficiency",
        "language skills",
    ]),
    ("COURSEWORK", [
        "relevant coursework", "coursework", "related coursework", "key coursework",
        "selected coursework", "applicable coursework", "notable coursework",
    ]),
    ("REFERENCES", [
        "references", "professional references", "references available upon request",
    ]),
]

for canonical, keys in _variants:
    for k in keys:
        SECTION_HEADER_MAP[k.lower().strip()] = canonical
