"""
Job scraper configuration — ethical/legal sources only.

Premium standard: Only scrape companies we have verified hiring criteria for.
Add a company to company_hiring_criteria.json first, then add its board token here.
"""

# Greenhouse Job Board API: public, no auth for GET jobs.
# Board token = URL slug from https://boards.greenhouse.io/{board_token}
# ONLY include companies in knowledge/company_hiring_criteria.json.
GREENHOUSE_BOARD_TOKENS = [
    # ── Tech ──────────────────────────────────────────────────────────────────
    "stripe",
    "figma",
    # ── Digital Health (Pre-Health track) ─────────────────────────────────────
    "hingehealth",       # Hinge Health — digital musculoskeletal care
    "noom",              # Noom — digital health / behavior change
    "headway",           # Headway — mental health platform
    "zocdoc",            # Zocdoc — healthcare scheduling marketplace
    "colorhealth",       # Color Health — preventive genomics / public health
    "includedhealth",    # Included Health — virtual care navigation
    "calibrate",         # Calibrate — metabolic health / GLP-1
    # ── Legal Tech (Pre-Law track) ────────────────────────────────────────────
    "clio",              # Clio — legal practice management software
    "ironcladapp",       # Ironclad — contract lifecycle management
    "relativity",        # Relativity — e-discovery and legal tech
    "thomsonreuters",    # Thomson Reuters — Westlaw, legal information
    "wolterskluwer",     # Wolters Kluwer — legal, regulatory, and compliance
]

# USAJobs: requires USAJOBS_API_KEY env var. Free at developer.usajobs.gov
# Search params for college-relevant roles
USAJOBS_INTERNSHIP_KEYWORDS = [
    # General internship
    "intern", "internship", "student", "pathways",
    # Healthcare / Pre-Health (VA, CDC, NIH, HRSA hire for these)
    "clinical", "public health", "health aide", "patient care", "nursing assistant",
    "medical assistant", "emergency medical", "health sciences",
    # Legal / Pre-Law (DOJ, FTC, SEC, FCC, state AGs, Congressional offices)
    "paralegal", "legal assistant", "compliance analyst", "policy analyst",
    "legislative aide", "regulatory analyst", "law clerk", "legal intern",
    # Science / Research
    "research assistant", "laboratory",
    # Business / Consulting (federal agencies)
    "analyst", "program analyst", "management analyst",
]
USAJOBS_GRADE = "GS"  # General Schedule (federal)

# Rate limiting
REQUEST_DELAY_SEC = 2.0
USER_AGENT = "Dilly-Job-Aggregator/1.0 (+https://trydilly.com)"
