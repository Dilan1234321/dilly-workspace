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
    # ── Finance / Banking ─────────────────────────────────────────────────────
    "citadel",           # Citadel — quant finance
    "twosigma",          # Two Sigma — quant finance
    "janestreet",        # Jane Street — quant trading
    # ── Consulting ──────────────────────────────────────────────────────────
    "mckinsey",          # McKinsey & Company
    "bcg",               # Boston Consulting Group
    # ── More Tech ────────────────────────────────────────────────────────────
    "airbnb",            # Airbnb
    "notion",            # Notion
    "discord",           # Discord
    "plaid",             # Plaid — fintech
    "brex",              # Brex — fintech
    "ramp",              # Ramp — fintech
    "verkada",           # Verkada — security
    "anduril",           # Anduril — defense tech
    "palantir",          # Palantir
    "databricks",        # Databricks
    "snowflakecomputing",# Snowflake
    "cockroachlabs",     # CockroachDB
    "duolingo",          # Duolingo
    "doordash",          # DoorDash
    "instacart",         # Instacart
    # ── Healthcare ───────────────────────────────────────────────────────────
    "tempus",            # Tempus — precision medicine
    "flatiron",          # Flatiron Health — oncology data
    "ro",                # Ro — telehealth
    # ── Enterprise Tech ──────────────────────────────────────────────────────
    "hashicorp",         # HashiCorp
    "confluent",         # Confluent — Kafka
    "elastic",           # Elastic
    "mongodb",           # MongoDB
    "cloudflare",        # Cloudflare
    "datadog",           # Datadog
    "twilio",            # Twilio
    "okta",              # Okta — identity
    "crowdstrike",       # CrowdStrike — cybersecurity
    "sentinelone",       # SentinelOne — cybersecurity
    # ── Consumer ─────────────────────────────────────────────────────────────
    "lyft",              # Lyft
    "pinterest",         # Pinterest
    "reddit",            # Reddit
    "snap",              # Snap Inc
    "spotify",           # Spotify
    "squarespace",       # Squarespace
    "etsy",              # Etsy
    # ── Fintech ──────────────────────────────────────────────────────────────
    "sofi",              # SoFi
    "affirm",            # Affirm
    "marqeta",           # Marqeta
    # ── Aerospace / Defense ──────────────────────────────────────────────────
    "relativityspace",   # Relativity Space
    "astranis",          # Astranis — satellites
]

# Lever Job Board API: public, no auth needed.
# Company slug from https://jobs.lever.co/{company_slug}
LEVER_COMPANY_SLUGS = [
    "netflix",           # Netflix
    "spotify",           # Spotify
    "openai",            # OpenAI
    "anthropic",         # Anthropic
    "coinbase",          # Coinbase
    "robinhood",         # Robinhood
    "chime",             # Chime — fintech
    "wealthsimple",     # Wealthsimple — fintech
    "figma",             # Figma (also on Greenhouse)
    "scale",             # Scale AI
    "replit",            # Replit
    "vercel",            # Vercel
    "linear",            # Linear
    "retool",            # Retool
    "loom",              # Loom
    "deel",              # Deel — HR tech
    "rippling",          # Rippling — HR tech
    "gusto",             # Gusto — HR/payroll
    "mercury",           # Mercury — fintech
    "ramp",              # Ramp (also Greenhouse)
    "stripe",            # Stripe (also Greenhouse)
    "masterclass",       # MasterClass
    "notion",            # Notion (also Ashby)
    "faire",             # Faire — B2B marketplace
    "webflow",           # Webflow
    "zapier",            # Zapier
    "grammarly",         # Grammarly
    "plaid",             # Plaid (also Greenhouse)
    "anduril",           # Anduril (also Greenhouse)
    "airtable",          # Airtable
    "brex",              # Brex (also Greenhouse)
]

# Ashby Job Board API: public, no auth needed.
# Org slug from https://jobs.ashbyhq.com/{org_slug}
ASHBY_ORG_SLUGS = [
    "notion",            # Notion
    "linear",            # Linear
    "vercel",            # Vercel
    "resend",            # Resend
    "cal",               # Cal.com
    "posthog",           # PostHog
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
