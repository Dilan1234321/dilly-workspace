"""
major_taxonomy.py — comprehensive mapping of US undergraduate majors to cohort IDs.

PURPOSE
───────
Every college student in the US needs to see their major recognized by Dilly.
If a student's major isn't mapped to a cohort, they score 0 across the board
and they delete the app. This file is the load-bearing mapping that prevents
that failure mode.

Covers the ~250 most common US undergraduate majors across the full CIP 2020
taxonomy, with synonyms and common alternate names. Not every CIP 6-digit code
is listed (there are 1500+), but every BROAD major family is represented and
fuzzy matching in `rubric_scorer._cohort_for_major()` handles the long tail.

COHORT ID REFERENCE (16 cohorts)
────────────────────────────────
  tech_software_engineering     — CS, SWE, CE, EE, IT, info systems
  tech_data_science             — data science, analytics, stats-heavy
  tech_cybersecurity            — cyber, infosec, network security
  business_finance              — finance, banking, economics (business-leaning)
  business_consulting           — strategy, management consulting
  business_marketing            — marketing, advertising, brand, PR
  business_accounting           — accounting, audit, tax
  pre_health                    — pre-med, pre-dental, pre-PA, pre-vet, etc.
  pre_law                       — pre-law, legal-adjacent majors
  science_research              — biology, chemistry, physics, research track
  health_nursing_allied         — nursing, allied health, public health, kinesiology
  social_sciences               — psychology, sociology, poli sci, criminology
  humanities_communications     — English, history, communication, journalism
  arts_design                   — visual art, design, music, theater, film
  quantitative_math_stats       — pure math, stats, actuarial
  sport_management              — sport management, recreation

DESIGN NOTES
────────────
- Keys are Title Case, matching how students typically enter them.
- Fuzzy matching in `_cohort_for_major()` normalizes case and whitespace
  before looking up, so case doesn't matter at query time.
- Many majors have multiple valid cohort mappings (e.g., Biology → pre_health
  for pre-med students, → science_research for grad-school-bound). The PRIMARY
  mapping here is the most common real outcome. The profile's
  pre_professional_track field overrides this when set (e.g., a Biology major
  with pre-professional_track="Pre-Med" is routed to pre_health regardless).
- For each cohort, at least ~10 majors are mapped so the baseline_cohort_fit
  signal has good coverage.
- Synonyms and alternate spellings are handled by the fuzzy fallback in
  _cohort_for_major() rather than by duplicate entries here, to keep this dict
  readable.
"""

from __future__ import annotations

# ═════════════════════════════════════════════════════════════════════════
# THE BIG MAPPING
# ═════════════════════════════════════════════════════════════════════════

MAJOR_TO_COHORT: dict[str, str] = {

    # ─────────────────────────────────────────────────────────────────────
    # TECH — Software Engineering & Computer Science
    # ─────────────────────────────────────────────────────────────────────
    "Computer Science": "tech_software_engineering",
    "Computer Science and Engineering": "tech_software_engineering",
    "Software Engineering": "tech_software_engineering",
    "Computer Engineering": "tech_software_engineering",
    "Electrical Engineering": "tech_software_engineering",
    "Electrical and Computer Engineering": "tech_software_engineering",
    "Information Technology": "tech_software_engineering",
    "Information Systems": "tech_software_engineering",
    "Information Science": "tech_software_engineering",
    "Management Information Systems": "tech_software_engineering",
    "Computer Information Systems": "tech_software_engineering",
    "Business Information Technology": "tech_software_engineering",
    "Web Development": "tech_software_engineering",
    "Game Development": "tech_software_engineering",
    "Game Design": "tech_software_engineering",
    "Mobile Development": "tech_software_engineering",
    "Computer Programming": "tech_software_engineering",
    "Human-Computer Interaction": "tech_software_engineering",
    "Mathematics with Computer Science": "tech_software_engineering",
    "Computational Science": "tech_software_engineering",

    # ─────────────────────────────────────────────────────────────────────
    # TECH — Data Science, Analytics, ML
    # ─────────────────────────────────────────────────────────────────────
    "Data Science": "tech_data_science",
    "Data Analytics": "tech_data_science",
    "Data Science and Analytics": "tech_data_science",
    "Business Analytics": "tech_data_science",
    "Applied Data Science": "tech_data_science",
    "Computational Data Science": "tech_data_science",
    "Informatics": "tech_data_science",
    "Bioinformatics": "tech_data_science",
    "Data Engineering": "tech_data_science",
    "Machine Learning": "tech_data_science",
    "Artificial Intelligence": "tech_data_science",

    # ─────────────────────────────────────────────────────────────────────
    # TECH — Cybersecurity
    # ─────────────────────────────────────────────────────────────────────
    "Cybersecurity": "tech_cybersecurity",
    "Cyber Security": "tech_cybersecurity",
    "Information Security": "tech_cybersecurity",
    "Network Security": "tech_cybersecurity",
    "Computer Security": "tech_cybersecurity",
    "Cybersecurity and Information Assurance": "tech_cybersecurity",
    "Digital Forensics": "tech_cybersecurity",
    "Homeland Security": "tech_cybersecurity",

    # ─────────────────────────────────────────────────────────────────────
    # BUSINESS — Finance, Economics, Banking
    # ─────────────────────────────────────────────────────────────────────
    "Finance": "business_finance",
    "Economics": "business_finance",
    "Financial Economics": "business_finance",
    "Business Economics": "business_finance",
    "International Economics": "business_finance",
    "Quantitative Finance": "business_finance",
    "Financial Engineering": "business_finance",
    "Financial Enterprise Systems": "business_finance",
    "Banking and Finance": "business_finance",
    "Investments": "business_finance",
    "Investment Management": "business_finance",
    "Real Estate": "business_finance",
    "Real Estate Finance": "business_finance",
    "Insurance": "business_finance",
    "Risk Management": "business_finance",
    "Risk Management and Insurance": "business_finance",
    "Financial Planning": "business_finance",
    "Wealth Management": "business_finance",
    "International Business": "business_finance",
    "International Business and Trade": "business_finance",
    "Entrepreneurship": "business_finance",
    "Entrepreneurship and Small Business": "business_finance",

    # ─────────────────────────────────────────────────────────────────────
    # BUSINESS — Consulting, Management, General Business
    # ─────────────────────────────────────────────────────────────────────
    "Business Administration": "business_consulting",
    "Business Management": "business_consulting",
    "Management": "business_consulting",
    "General Business": "business_consulting",
    "Business": "business_consulting",
    "Strategic Management": "business_consulting",
    "Management Consulting": "business_consulting",
    "Organizational Leadership": "business_consulting",
    "Organizational Behavior": "business_consulting",
    "Human Resource Management": "business_consulting",
    "Human Resources": "business_consulting",
    "Operations Management": "business_consulting",
    "Supply Chain Management": "business_consulting",
    "Logistics": "business_consulting",
    "Logistics and Supply Chain Management": "business_consulting",
    "Project Management": "business_consulting",
    "Hospitality Management": "business_consulting",
    "Hotel and Restaurant Management": "business_consulting",
    "Tourism Management": "business_consulting",
    "Event Management": "business_consulting",

    # ─────────────────────────────────────────────────────────────────────
    # BUSINESS — Marketing, Advertising, PR, Sales
    # ─────────────────────────────────────────────────────────────────────
    "Marketing": "business_marketing",
    "Digital Marketing": "business_marketing",
    "Marketing Research": "business_marketing",
    "Marketing Management": "business_marketing",
    "Brand Management": "business_marketing",
    "Advertising": "business_marketing",
    "Advertising and Public Relations": "business_marketing",
    "Public Relations": "business_marketing",
    "Integrated Marketing Communications": "business_marketing",
    "Strategic Communications": "business_marketing",
    "Fashion Merchandising": "business_marketing",
    "Retail Management": "business_marketing",
    "Sales": "business_marketing",
    "Professional Selling": "business_marketing",
    "Consumer Behavior": "business_marketing",
    "Marketing & Finance": "business_marketing",

    # ─────────────────────────────────────────────────────────────────────
    # BUSINESS — Accounting & Audit
    # ─────────────────────────────────────────────────────────────────────
    "Accounting": "business_accounting",
    "Accountancy": "business_accounting",
    "Accounting Information Systems": "business_accounting",
    "Public Accounting": "business_accounting",
    "Tax Accounting": "business_accounting",
    "Taxation": "business_accounting",
    "Auditing": "business_accounting",
    "Forensic Accounting": "business_accounting",

    # ─────────────────────────────────────────────────────────────────────
    # PRE-HEALTH (pre-med, pre-dental, pre-PA, pre-vet, pre-PT, pre-OT, pre-pharm)
    # ─────────────────────────────────────────────────────────────────────
    "Pre-Medicine": "pre_health",
    "Pre-Med": "pre_health",
    "Premedical Studies": "pre_health",
    "Biochemistry": "pre_health",
    "Biochemistry and Molecular Biology": "pre_health",
    "Biomedical Sciences": "pre_health",
    "Biomedical Engineering": "pre_health",
    "Medical Sciences": "pre_health",
    "Health Sciences": "pre_health",
    "Health Science": "pre_health",
    "Allied Health": "pre_health",
    "Pre-Dental": "pre_health",
    "Pre-Dentistry": "pre_health",
    "Pre-Pharmacy": "pre_health",
    "Pharmacy": "pre_health",
    "Pharmaceutical Sciences": "pre_health",
    "Pre-Veterinary": "pre_health",
    "Pre-Vet": "pre_health",
    "Veterinary Sciences": "pre_health",
    "Pre-Physician Assistant": "pre_health",
    "Pre-PA": "pre_health",
    "Pre-Physical Therapy": "pre_health",
    "Pre-PT": "pre_health",
    "Pre-Occupational Therapy": "pre_health",
    "Pre-OT": "pre_health",
    "Pre-Optometry": "pre_health",
    "Pre-Nursing": "pre_health",

    # ─────────────────────────────────────────────────────────────────────
    # PRE-LAW
    # ─────────────────────────────────────────────────────────────────────
    "Pre-Law": "pre_law",
    "Legal Studies": "pre_law",
    "Paralegal Studies": "pre_law",
    "Law and Society": "pre_law",
    "Law, Justice and Advocacy": "pre_law",
    "Law, Justice & Advocacy": "pre_law",
    "Philosophy": "pre_law",  # philosophy majors most commonly target law
    "Jurisprudence": "pre_law",

    # ─────────────────────────────────────────────────────────────────────
    # SCIENCE RESEARCH (bio/chem/physics, research or grad school bound)
    # ─────────────────────────────────────────────────────────────────────
    "Biology": "science_research",
    "General Biology": "science_research",
    "Molecular Biology": "science_research",
    "Cell Biology": "science_research",
    "Cell and Molecular Biology": "science_research",
    "Microbiology": "science_research",
    "Genetics": "science_research",
    "Ecology": "science_research",
    "Evolutionary Biology": "science_research",
    "Organismal Biology": "science_research",
    "Marine Biology": "science_research",
    "Marine Science": "science_research",
    "Marine Chemistry": "science_research",
    "Zoology": "science_research",
    "Botany": "science_research",
    "Plant Biology": "science_research",
    "Neuroscience": "science_research",
    "Cognitive Science": "science_research",
    "Chemistry": "science_research",
    "Organic Chemistry": "science_research",
    "Analytical Chemistry": "science_research",
    "Physical Chemistry": "science_research",
    "Inorganic Chemistry": "science_research",
    "Physics": "science_research",
    "Astrophysics": "science_research",
    "Astronomy": "science_research",
    "Geophysics": "science_research",
    "Geology": "science_research",
    "Geoscience": "science_research",
    "Earth Science": "science_research",
    "Earth and Planetary Science": "science_research",
    "Environmental Science": "science_research",
    "Environmental Studies": "science_research",
    "Environmental Biology": "science_research",
    "Environmental Engineering": "science_research",
    "Atmospheric Science": "science_research",
    "Meteorology": "science_research",
    "Oceanography": "science_research",
    "Hydrology": "science_research",
    "Soil Science": "science_research",
    "Forensic Science": "science_research",
    "Forensic Chemistry": "science_research",
    "Food Science": "science_research",
    "Nutrition Science": "science_research",
    "Animal Science": "science_research",
    "Plant Science": "science_research",
    "Agricultural Science": "science_research",
    "Agriculture": "science_research",
    "Agronomy": "science_research",
    "Horticulture": "science_research",
    "Wildlife Biology": "science_research",
    "Wildlife Management": "science_research",
    "Fisheries Science": "science_research",
    "Forestry": "science_research",
    "Natural Resources": "science_research",
    "Conservation Biology": "science_research",
    "Sustainability": "science_research",
    "Sustainability Studies": "science_research",

    # Engineering (non-software) → science_research is closest fit for research-track
    "Mechanical Engineering": "science_research",
    "Civil Engineering": "science_research",
    "Chemical Engineering": "science_research",
    "Aerospace Engineering": "science_research",
    "Aeronautical Engineering": "science_research",
    "Industrial Engineering": "science_research",
    "Manufacturing Engineering": "science_research",
    "Materials Science": "science_research",
    "Materials Engineering": "science_research",
    "Nuclear Engineering": "science_research",
    "Petroleum Engineering": "science_research",
    "Mining Engineering": "science_research",
    "Structural Engineering": "science_research",
    "Architectural Engineering": "science_research",
    "Agricultural Engineering": "science_research",
    "Systems Engineering": "science_research",

    # ─────────────────────────────────────────────────────────────────────
    # HEALTH — Nursing & Allied Health (not pre-professional)
    # ─────────────────────────────────────────────────────────────────────
    "Nursing": "health_nursing_allied",
    "Registered Nursing": "health_nursing_allied",
    "Bachelor of Science in Nursing": "health_nursing_allied",
    "BSN": "health_nursing_allied",
    "Public Health": "health_nursing_allied",
    "Community Health": "health_nursing_allied",
    "Global Health": "health_nursing_allied",
    "Epidemiology": "health_nursing_allied",
    "Health Administration": "health_nursing_allied",
    "Healthcare Administration": "health_nursing_allied",
    "Health Management": "health_nursing_allied",
    "Healthcare Management": "health_nursing_allied",
    "Health Education": "health_nursing_allied",
    "Health Promotion": "health_nursing_allied",
    "Exercise Science": "health_nursing_allied",
    "Exercise Physiology": "health_nursing_allied",
    "Exercise Science and Sport Studies": "health_nursing_allied",
    "Kinesiology": "health_nursing_allied",
    "Athletic Training": "health_nursing_allied",
    "Sports Medicine": "health_nursing_allied",
    "Human Performance": "health_nursing_allied",
    "Nutrition": "health_nursing_allied",
    "Dietetics": "health_nursing_allied",
    "Nutrition and Dietetics": "health_nursing_allied",
    "Physical Therapy": "health_nursing_allied",
    "Occupational Therapy": "health_nursing_allied",
    "Speech Pathology": "health_nursing_allied",
    "Speech-Language Pathology": "health_nursing_allied",
    "Audiology": "health_nursing_allied",
    "Respiratory Therapy": "health_nursing_allied",
    "Radiologic Technology": "health_nursing_allied",
    "Medical Laboratory Science": "health_nursing_allied",
    "Clinical Laboratory Science": "health_nursing_allied",
    "Dental Hygiene": "health_nursing_allied",
    "Health Information Management": "health_nursing_allied",
    "Health Information Technology": "health_nursing_allied",
    "Healthcare Informatics": "health_nursing_allied",
    "Art Therapy": "health_nursing_allied",
    "Music Therapy": "health_nursing_allied",

    # ─────────────────────────────────────────────────────────────────────
    # SOCIAL SCIENCES
    # ─────────────────────────────────────────────────────────────────────
    "Psychology": "social_sciences",
    "Clinical Psychology": "social_sciences",
    "Cognitive Psychology": "social_sciences",
    "Developmental Psychology": "social_sciences",
    "Social Psychology": "social_sciences",
    "Industrial-Organizational Psychology": "social_sciences",
    "Sociology": "social_sciences",
    "Social Work": "social_sciences",
    "Human Services": "social_sciences",
    "Human Development": "social_sciences",
    "Human Development and Family Studies": "social_sciences",
    "Family Studies": "social_sciences",
    "Child Development": "social_sciences",
    "Anthropology": "social_sciences",
    "Cultural Anthropology": "social_sciences",
    "Archaeology": "social_sciences",
    "Political Science": "social_sciences",
    "Government": "social_sciences",
    "Government and World Affairs": "social_sciences",
    "International Relations": "social_sciences",
    "International Studies": "social_sciences",
    "International Affairs": "social_sciences",
    "Global Studies": "social_sciences",
    "Public Policy": "social_sciences",
    "Environmental Policy": "social_sciences",
    "Environmental Policy and Management": "social_sciences",
    "Public Administration": "social_sciences",
    "Public Affairs": "social_sciences",
    "Urban Studies": "social_sciences",
    "Urban Planning": "social_sciences",
    "City Planning": "social_sciences",
    "Regional Planning": "social_sciences",
    "Criminology": "social_sciences",
    "Criminology and Criminal Justice": "social_sciences",
    "Criminal Justice": "social_sciences",
    "Criminal Investigation": "social_sciences",
    "Environmental Criminology and Crime Analysis": "social_sciences",
    "Law Enforcement": "social_sciences",
    "Peace Studies": "social_sciences",
    "Conflict Resolution": "social_sciences",
    "Women's Studies": "social_sciences",
    "Gender Studies": "social_sciences",
    "Women, Gender and Sexuality Studies": "social_sciences",
    "Ethnic Studies": "social_sciences",
    "African American Studies": "social_sciences",
    "Black Studies": "social_sciences",
    "Latin American Studies": "social_sciences",
    "Latin American and Caribbean Studies": "social_sciences",
    "Asian Studies": "social_sciences",
    "Asian American Studies": "social_sciences",
    "Middle Eastern Studies": "social_sciences",
    "European Studies": "social_sciences",
    "American Studies": "social_sciences",
    "Native American Studies": "social_sciences",
    "Geography": "social_sciences",
    "Human Geography": "social_sciences",
    "Leadership Studies": "social_sciences",
    "Leadership": "social_sciences",

    # ─────────────────────────────────────────────────────────────────────
    # HUMANITIES & COMMUNICATIONS
    # ─────────────────────────────────────────────────────────────────────
    "English": "humanities_communications",
    "English Literature": "humanities_communications",
    "English Language and Literature": "humanities_communications",
    "Literature": "humanities_communications",
    "Comparative Literature": "humanities_communications",
    "World Literature": "humanities_communications",
    "Creative Writing": "humanities_communications",
    "Writing": "humanities_communications",
    "Writing and Rhetoric": "humanities_communications",
    "Technical Writing": "humanities_communications",
    "Professional Writing": "humanities_communications",
    "Professional and Technical Writing": "humanities_communications",
    "Rhetoric": "humanities_communications",
    "Rhetoric and Composition": "humanities_communications",
    "Linguistics": "humanities_communications",
    "Applied Linguistics": "humanities_communications",
    "History": "humanities_communications",
    "American History": "humanities_communications",
    "European History": "humanities_communications",
    "Art History": "humanities_communications",
    "Music History": "humanities_communications",
    "History & International Studies": "humanities_communications",
    "Religious Studies": "humanities_communications",
    "Theology": "humanities_communications",
    "Biblical Studies": "humanities_communications",
    "Divinity": "humanities_communications",
    "Ministry": "humanities_communications",
    "Classical Studies": "humanities_communications",
    "Classics": "humanities_communications",
    "Latin": "humanities_communications",
    "Greek": "humanities_communications",
    "Spanish": "humanities_communications",
    "French": "humanities_communications",
    "German": "humanities_communications",
    "Italian": "humanities_communications",
    "Portuguese": "humanities_communications",
    "Russian": "humanities_communications",
    "Chinese": "humanities_communications",
    "Mandarin": "humanities_communications",
    "Japanese": "humanities_communications",
    "Korean": "humanities_communications",
    "Arabic": "humanities_communications",
    "Hebrew": "humanities_communications",
    "Modern Languages": "humanities_communications",
    "Foreign Languages": "humanities_communications",
    "Romance Languages": "humanities_communications",
    "East Asian Languages": "humanities_communications",
    "Liberal Arts": "humanities_communications",
    "Liberal Studies": "humanities_communications",
    "General Studies": "humanities_communications",
    "Interdisciplinary Studies": "humanities_communications",
    "Humanities": "humanities_communications",

    # Communications & Journalism
    "Communication": "humanities_communications",
    "Communications": "humanities_communications",
    "Communication Studies": "humanities_communications",
    "Communication and Media Studies": "humanities_communications",
    "Communication and Speech Studies": "humanities_communications",
    "Mass Communication": "humanities_communications",
    "Media Studies": "humanities_communications",
    "Speech Communication": "humanities_communications",
    "Speech Studies": "humanities_communications",
    "Speech and Theatre": "humanities_communications",
    "Journalism": "humanities_communications",
    "Broadcast Journalism": "humanities_communications",
    "Print Journalism": "humanities_communications",
    "Digital Journalism": "humanities_communications",
    "Photojournalism": "humanities_communications",
    "News Reporting": "humanities_communications",
    "Sports Journalism": "humanities_communications",
    "Broadcasting": "humanities_communications",
    "Radio and Television": "humanities_communications",
    "Media Production": "humanities_communications",
    "Film and Media": "humanities_communications",
    "Film Studies": "humanities_communications",
    "Television Studies": "humanities_communications",
    "Cinema Studies": "humanities_communications",

    # Education (most tracks)
    "Education": "humanities_communications",
    "Elementary Education": "humanities_communications",
    "Secondary Education": "humanities_communications",
    "Early Childhood Education": "humanities_communications",
    "Middle School Education": "humanities_communications",
    "Special Education": "humanities_communications",
    "Physical Education": "humanities_communications",
    "Music Education": "arts_design",  # music ed → arts (performance-focused)
    "Art Education": "arts_design",
    "Educational Leadership": "humanities_communications",
    "Educational Psychology": "humanities_communications",
    "Curriculum and Instruction": "humanities_communications",
    "Professional Education": "humanities_communications",
    "TESOL": "humanities_communications",
    "English as a Second Language": "humanities_communications",

    # ─────────────────────────────────────────────────────────────────────
    # ARTS & DESIGN
    # ─────────────────────────────────────────────────────────────────────
    "Art": "arts_design",
    "Fine Arts": "arts_design",
    "Visual Arts": "arts_design",
    "Studio Art": "arts_design",
    "Drawing": "arts_design",
    "Painting": "arts_design",
    "Sculpture": "arts_design",
    "Printmaking": "arts_design",
    "Ceramics": "arts_design",
    "Photography": "arts_design",
    "Digital Photography": "arts_design",
    "Graphic Design": "arts_design",
    "Visual Communication Design": "arts_design",
    "Visual Communications": "arts_design",
    "Industrial Design": "arts_design",
    "Interior Design": "arts_design",
    "Interior Architecture": "arts_design",
    "Fashion Design": "arts_design",
    "Apparel Design": "arts_design",
    "Product Design": "arts_design",
    "User Experience Design": "arts_design",
    "UX Design": "arts_design",
    "UI Design": "arts_design",
    "UX/UI Design": "arts_design",
    "Interaction Design": "arts_design",
    "Design": "arts_design",
    "Design and Visual Communications": "arts_design",
    "Animation": "arts_design",
    "Digital Animation": "arts_design",
    "3D Animation": "arts_design",
    "Digital Arts and Design": "arts_design",
    "Digital Media": "arts_design",
    "New Media": "arts_design",
    "Interactive Media": "arts_design",
    "Film and Media Arts": "arts_design",
    "Film": "arts_design",
    "Film Production": "arts_design",
    "Film and Television Production": "arts_design",
    "Cinematography": "arts_design",
    "Music": "arts_design",
    "Music Performance": "arts_design",
    "Music Composition": "arts_design",
    "Music Theory": "arts_design",
    "Musicology": "arts_design",
    "Ethnomusicology": "arts_design",
    "Jazz Studies": "arts_design",
    "Music Production": "arts_design",
    "Audio Engineering": "arts_design",
    "Sound Design": "arts_design",
    "Sound Recording": "arts_design",
    "Vocal Performance": "arts_design",
    "Instrumental Performance": "arts_design",
    "Music Industry": "arts_design",
    "Theater": "arts_design",
    "Theatre": "arts_design",
    "Theatre Arts": "arts_design",
    "Drama": "arts_design",
    "Acting": "arts_design",
    "Musical Theatre": "arts_design",
    "Theatre Performance": "arts_design",
    "Theatre Production": "arts_design",
    "Stagecraft": "arts_design",
    "Dance": "arts_design",
    "Ballet": "arts_design",
    "Choreography": "arts_design",
    "Dance Performance": "arts_design",
    "Museum Studies": "arts_design",
    "Arts Administration": "arts_design",
    "Arts Management": "arts_design",
    "Architecture": "arts_design",
    "Landscape Architecture": "arts_design",

    # ─────────────────────────────────────────────────────────────────────
    # QUANTITATIVE — Math, Stats, Actuarial
    # ─────────────────────────────────────────────────────────────────────
    "Mathematics": "quantitative_math_stats",
    "Applied Mathematics": "quantitative_math_stats",
    "Mathematical Sciences": "quantitative_math_stats",
    "Pure Mathematics": "quantitative_math_stats",
    "Theoretical Mathematics": "quantitative_math_stats",
    "Statistics": "quantitative_math_stats",
    "Applied Statistics": "quantitative_math_stats",
    "Statistical Science": "quantitative_math_stats",
    "Probability and Statistics": "quantitative_math_stats",
    "Biostatistics": "quantitative_math_stats",
    "Actuarial Science": "quantitative_math_stats",
    "Actuarial Studies": "quantitative_math_stats",
    "Actuarial Mathematics": "quantitative_math_stats",
    "Mathematics & Computer Science": "tech_software_engineering",  # CS-leaning
    "Math & Computer Science": "tech_software_engineering",
    "Operations Research": "quantitative_math_stats",
    "Decision Sciences": "quantitative_math_stats",

    # ─────────────────────────────────────────────────────────────────────
    # SPORT MANAGEMENT & RECREATION
    # ─────────────────────────────────────────────────────────────────────
    "Sport Management": "sport_management",
    "Sports Management": "sport_management",
    "Sports Administration": "sport_management",
    "Sport Administration": "sport_management",
    "Sports Marketing": "sport_management",
    "Sport Business": "sport_management",
    "Sport and Recreation Management": "sport_management",
    "Sports and Entertainment Management": "sport_management",
    "Recreation": "sport_management",
    "Recreation Management": "sport_management",
    "Recreation, Parks, and Leisure Studies": "sport_management",
    "Parks and Recreation": "sport_management",
    "Outdoor Recreation": "sport_management",
    "Leisure Studies": "sport_management",
    "Recreational Therapy": "sport_management",

    # ─────────────────────────────────────────────────────────────────────
    # AVIATION, MILITARY, OTHER (map to closest cohort)
    # ─────────────────────────────────────────────────────────────────────
    "Aviation": "science_research",  # technical / STEM
    "Aviation Management": "business_consulting",
    "Aeronautics": "science_research",
    "Professional Pilot": "science_research",
    "Military Science": "social_sciences",  # leadership / strategy track
    "ROTC": "social_sciences",
    "National Security": "social_sciences",
    "Emergency Management": "social_sciences",
    "Fire Science": "social_sciences",
    "Culinary Arts": "arts_design",
    "Culinary Management": "business_consulting",
    "Baking and Pastry": "arts_design",
    "Hospitality and Culinary Arts": "business_consulting",
}


# ═════════════════════════════════════════════════════════════════════════
# Reverse lookup — all majors mapped to a given cohort
# ═════════════════════════════════════════════════════════════════════════

def majors_for_cohort(cohort_id: str) -> list[str]:
    """Return the sorted list of majors that map to this cohort."""
    return sorted([m for m, c in MAJOR_TO_COHORT.items() if c == cohort_id])


# ═════════════════════════════════════════════════════════════════════════
# Normalized lookup — case-insensitive, whitespace-tolerant
# ═════════════════════════════════════════════════════════════════════════

def _normalize(s: str) -> str:
    """Normalize a major string for lookup: lowercase, collapse whitespace, strip."""
    if not s:
        return ""
    return " ".join(s.strip().lower().split())


# Precomputed normalized lookup dict
_NORMALIZED_MAJOR_MAP: dict[str, tuple[str, str]] = {
    _normalize(major): (major, cohort)
    for major, cohort in MAJOR_TO_COHORT.items()
}


def lookup_major(major: str) -> tuple[str, str] | None:
    """
    Look up a major case-insensitively. Returns (canonical_major, cohort_id)
    or None if not found. Use this as the primary lookup path; the fuzzy
    fallback in `rubric_scorer._cohort_for_major()` handles anything this misses.
    """
    if not major:
        return None
    norm = _normalize(major)
    if not norm:
        return None
    # Exact match
    if norm in _NORMALIZED_MAJOR_MAP:
        return _NORMALIZED_MAJOR_MAP[norm]
    # Try with "pre-" prefix stripped (e.g. "pre-medicine" → "medicine")
    if norm.startswith("pre-") or norm.startswith("pre "):
        stripped = norm[4:].strip()
        if stripped in _NORMALIZED_MAJOR_MAP:
            return _NORMALIZED_MAJOR_MAP[stripped]
    return None
