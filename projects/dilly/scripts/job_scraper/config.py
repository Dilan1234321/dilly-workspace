"""
Job scraper configuration — ethical/legal sources only.

Premium standard: Only scrape companies we have verified hiring criteria for.
Add a company to company_hiring_criteria.json first, then add its board token here.
"""

# Greenhouse Job Board API: public, no auth for GET jobs.
# Board token = URL slug from https://boards.greenhouse.io/{board_token}
# ONLY include companies in knowledge/company_hiring_criteria.json.
GREENHOUSE_BOARD_TOKENS = [
    "stripe",
    "figma",
]

# USAJobs: requires USAJOBS_API_KEY env var. Free at developer.usajobs.gov
# Search params for college-relevant roles
USAJOBS_INTERNSHIP_KEYWORDS = ["intern", "internship", "student", "pathways"]
USAJOBS_GRADE = "GS"  # General Schedule (federal)

# Rate limiting
REQUEST_DELAY_SEC = 2.0
USER_AGENT = "Meridian-Job-Aggregator/1.0 (+https://trydilly.com)"
