"""
Dilly Core - Cohort Build Keywords and mappings.

Per-cohort domain keywords used by compute_build_score in scoring.py.
Extracted from scoring.py to keep the scoring engine focused on logic.

22 career tracks, each with domain-specific keywords that signal "shipped proof".
Keywords are matched case-insensitively against raw resume text.
"""

# Per-cohort Build keywords: domain-specific terms that signal "shipped proof"
# for each of the 22 career tracks. Keywords are matched case-insensitively
# against raw resume text. Each hit earns points; domain-relevant hits score
# higher than generic ones.

COHORT_BUILD_KEYWORDS: dict[str, dict] = {
    # 1. Software Engineering & CS
    "software_engineering_cs": {
        "domain_keywords": [
            "deployed", "github", "open source", "open-source", "ci/cd", "microservices",
            "distributed", "api", "full-stack", "fullstack", "backend", "frontend",
            "docker", "kubernetes", "react", "node", "django", "flask", "spring",
            "aws", "gcp", "azure", "terraform", "devops", "rest api", "graphql",
            "typescript", "javascript", "python", "java", "golang", "rust",
            "leetcode", "system design", "scalable", "users", "production",
        ],
        "portfolio_keywords": ["github.com", "github.io", "vercel.app", "netlify.app", "herokuapp"],
        "domain_weight": 3,
    },
    # 2. Data Science & Analytics
    "data_science_analytics": {
        "domain_keywords": [
            "machine learning", "ml model", "deep learning", "neural network",
            "kaggle", "jupyter", "pandas", "scikit-learn", "sklearn", "tensorflow",
            "pytorch", "data pipeline", "etl", "dashboard", "tableau", "power bi",
            "a/b test", "ab test", "experiment", "statistical", "regression",
            "classification", "nlp", "natural language", "computer vision",
            "snowflake", "databricks", "sagemaker", "bigquery", "sql",
            "model accuracy", "precision", "recall", "f1", "auc",
        ],
        "portfolio_keywords": ["kaggle.com", "github.com", "colab", "nbviewer"],
        "domain_weight": 3,
    },
    # 3. Finance & Accounting
    "finance_accounting": {
        "domain_keywords": [
            "dcf", "lbo", "valuation", "financial model", "pitch deck",
            "bloomberg", "capital iq", "factset", "excel", "vba",
            "investment banking", "equity research", "asset management",
            "portfolio management", "trading", "fixed income", "derivatives",
            "m&a", "mergers", "acquisitions", "due diligence", "deal",
            "audit", "gaap", "ifrs", "sox", "tax", "cpa", "cfa",
            "financial analysis", "budgeting", "forecasting", "p&l",
        ],
        "portfolio_keywords": [],
        "domain_weight": 4,
    },
    # 4. Consulting & Strategy
    "consulting_strategy": {
        "domain_keywords": [
            "case competition", "case study", "strategy", "mece",
            "client-facing", "client facing", "deliverable", "pro-bono",
            "pro bono", "consulting club", "market sizing", "implementation",
            "process improvement", "stakeholder", "recommendation",
            "framework", "operations improvement", "cost reduction",
            "revenue growth", "efficiency", "bcg", "mckinsey", "bain",
        ],
        "portfolio_keywords": [],
        "domain_weight": 4,
    },
    # 5. Marketing & Advertising
    "marketing_advertising": {
        "domain_keywords": [
            "campaign", "social media", "seo", "sem", "google ads",
            "meta ads", "tiktok", "content marketing", "email marketing",
            "conversion", "ctr", "click-through", "roas", "roi",
            "impressions", "engagement", "followers", "brand", "creative",
            "copywriting", "analytics", "google analytics", "hubspot",
            "mailchimp", "hootsuite", "buffer", "canva", "adobe",
            "influencer", "pr ", "public relations", "media buy",
        ],
        "portfolio_keywords": ["behance.net", "dribbble.com"],
        "domain_weight": 3,
    },
    # 6. Management & Operations
    "management_operations": {
        "domain_keywords": [
            "process improvement", "supply chain", "six sigma", "lean",
            "operations", "logistics", "inventory", "erp", "sap",
            "project management", "pmp", "agile", "scrum", "kanban",
            "cost reduction", "efficiency", "kpi", "headcount",
            "cross-functional", "stakeholder management", "vendor",
            "quality assurance", "qa", "sop", "standard operating",
        ],
        "portfolio_keywords": [],
        "domain_weight": 3,
    },
    # 7. Healthcare & Clinical
    "healthcare_clinical": {
        "domain_keywords": [
            "clinical", "patient", "hospital", "shadowing", "emt",
            "cna", "bls", "cpr", "phlebotomy", "hipaa", "ehr",
            "medical", "nursing", "surgery", "triage", "vital signs",
            "charting", "scribing", "direct patient care", "bedside",
            "volunteer", "clinic", "physician", "provider",
            "patient encounter", "clinical hours", "rotation",
        ],
        "portfolio_keywords": [],
        "domain_weight": 3,
    },
    # 8. Cybersecurity & IT
    "cybersecurity_it": {
        "domain_keywords": [
            "security+", "comptia", "ceh", "oscp", "pccet",
            "ctf", "hackthebox", "tryhackme", "picoctf", "bug bounty",
            "penetration test", "pen test", "vulnerability", "siem",
            "splunk", "crowdstrike", "sentinel", "edr", "ids", "ips",
            "incident response", "soc", "threat hunting", "mitre",
            "owasp", "firewall", "nmap", "wireshark", "burp suite",
            "malware analysis", "forensics", "home lab",
        ],
        "portfolio_keywords": ["hackthebox.com", "tryhackme.com", "github.com"],
        "domain_weight": 3,
    },
    # 9. Law & Government
    "law_government": {
        "domain_keywords": [
            "moot court", "mock trial", "law review", "legal research",
            "paralegal", "legal clinic", "brief", "legislation",
            "policy paper", "constitutional", "statutory", "regulatory",
            "government intern", "federal", "state government",
            "advocacy", "lobbying", "compliance", "legal writing",
            "doj", "public defender", "district attorney", "ngo",
        ],
        "portfolio_keywords": [],
        "domain_weight": 4,
    },
    # 10. Biotech & Pharmaceutical
    "biotech_pharmaceutical": {
        "domain_keywords": [
            "wet lab", "bsl-2", "bsl2", "glp", "gmp", "fda",
            "clinical trial", "drug discovery", "assay", "pcr",
            "western blot", "cell culture", "sequencing", "hplc",
            "mass spectrometry", "chromatography", "bioprocessing",
            "pharmacology", "toxicology", "formulation", "patent",
            "publication", "poster presentation", "conference",
            "thesis", "grant", "nih", "nsf",
        ],
        "portfolio_keywords": [],
        "domain_weight": 4,
    },
    # 11. Mechanical & Aerospace Engineering
    "mechanical_aerospace_engineering": {
        "domain_keywords": [
            "solidworks", "catia", "nx", "autocad", "cad",
            "fea", "cfd", "simulation", "ansys", "abaqus",
            "3d print", "cnc", "machining", "manufacturing",
            "prototype", "fsae", "sae", "aiaa", "asme",
            "senior design", "capstone", "thermodynamics",
            "fe exam", "fundamentals of engineering",
        ],
        "portfolio_keywords": [],
        "domain_weight": 4,
    },
    # 12. Electrical & Computer Engineering
    "electrical_computer_engineering": {
        "domain_keywords": [
            "pcb", "altium", "kicad", "eagle", "fpga", "verilog",
            "vhdl", "embedded", "microcontroller", "arduino", "raspberry pi",
            "stm32", "arm", "risc-v", "signal processing", "circuit",
            "oscilloscope", "labview", "matlab", "simulink",
            "ieee", "robotics", "sensor", "firmware", "vlsi",
        ],
        "portfolio_keywords": ["github.com"],
        "domain_weight": 4,
    },
    # 13. Design & Creative Arts
    "design_creative_arts": {
        "domain_keywords": [
            "figma", "sketch", "adobe", "photoshop", "illustrator",
            "indesign", "after effects", "premiere", "xd",
            "case study", "user research", "usability test",
            "wireframe", "prototype", "design system", "ui/ux",
            "ux", "ui", "interaction design", "information architecture",
            "typography", "branding", "logo", "visual design",
            "motion design", "animation", "3d", "illustration",
        ],
        "portfolio_keywords": ["behance.net", "dribbble.com", "figma.com", "cargo.site"],
        "domain_weight": 3,
    },
    # 14. Education & Human Development
    "education_human_development": {
        "domain_keywords": [
            "student teaching", "classroom", "curriculum", "lesson plan",
            "tutoring", "mentoring", "praxis", "teaching certification",
            "certified teacher", "iep", "special education",
            "differentiated instruction", "assessment", "pedagogy",
            "bloom", "udl", "classroom management", "google classroom",
            "canvas", "learning management",
        ],
        "portfolio_keywords": [],
        "domain_weight": 3,
    },
    # 15. Social Sciences & Nonprofit
    "social_sciences_nonprofit": {
        "domain_keywords": [
            "community", "nonprofit", "non-profit", "ngo",
            "grant", "fundraising", "advocacy", "volunteer",
            "americorps", "peace corps", "policy brief",
            "social impact", "outreach", "program coordinator",
            "case management", "community organizing",
            "social work", "united way", "habitat for humanity",
        ],
        "portfolio_keywords": [],
        "domain_weight": 3,
    },
    # 16. Media & Communications
    "media_communications": {
        "domain_keywords": [
            "byline", "published", "article", "feature story",
            "journalism", "editorial", "newsroom", "broadcast",
            "podcast", "video production", "documentary",
            "social media", "content creator", "audience",
            "ap style", "press release", "media kit",
            "editor", "producer", "reporter", "correspondent",
        ],
        "portfolio_keywords": ["medium.com", "substack.com"],
        "domain_weight": 3,
    },
    # 17. Life Sciences & Research
    "life_sciences_research": {
        "domain_keywords": [
            "publication", "paper", "journal", "first author", "co-author",
            "poster", "conference", "reu", "research assistant",
            "lab technique", "pcr", "western blot", "cell culture",
            "microscopy", "sequencing", "bioinformatics", "spss",
            "graphpad", "r ", "statistical analysis", "thesis",
            "pi ", "principal investigator", "iacuc", "irb",
        ],
        "portfolio_keywords": ["orcid.org", "scholar.google.com", "pubmed"],
        "domain_weight": 4,
    },
    # 18. Economics & Public Policy
    "economics_public_policy": {
        "domain_keywords": [
            "econometrics", "regression", "stata", "causal inference",
            "instrumental variable", "difference-in-difference", "did",
            "rdd", "panel data", "time series", "macro", "micro",
            "policy analysis", "think tank", "federal reserve",
            "brookings", "thesis", "working paper", "nber",
            "world bank", "imf", "policy brief",
        ],
        "portfolio_keywords": [],
        "domain_weight": 4,
    },
    # 19. Entrepreneurship & Innovation
    "entrepreneurship_innovation": {
        "domain_keywords": [
            "startup", "founded", "co-founded", "launched", "mvp",
            "revenue", "users", "customers", "pitch competition",
            "incubator", "accelerator", "y combinator", "techstars",
            "venture", "angel", "seed", "funding", "raised",
            "product-market fit", "customer discovery", "lean startup",
            "product hunt", "beta", "waitlist",
        ],
        "portfolio_keywords": [],
        "domain_weight": 3,
    },
    # 20. Physical Sciences & Math
    "physical_sciences_math": {
        "domain_keywords": [
            "research paper", "thesis", "publication", "pre-print",
            "putnam", "usamo", "amc", "imo", "competition math",
            "proof", "real analysis", "abstract algebra", "topology",
            "computational", "matlab", "julia", "fortran",
            "national lab", "reu", "nsf", "doe",
            "simulation", "modeling", "experiment",
        ],
        "portfolio_keywords": ["arxiv.org", "orcid.org"],
        "domain_weight": 4,
    },
    # 21. Chemical & Biomedical Engineering
    "chemical_biomedical_engineering": {
        "domain_keywords": [
            "aspen", "comsol", "hysys", "chemcad",
            "bioprocessing", "bioreactor", "fermentation",
            "chromatography", "mass spectrometry", "hplc",
            "gmp", "fda", "biomaterials", "tissue engineering",
            "medical device", "polymer", "thermodynamics",
            "transport phenomena", "reaction kinetics",
            "fe exam", "fundamentals of engineering",
            "co-op", "coop",
        ],
        "portfolio_keywords": [],
        "domain_weight": 4,
    },
    # 22. Civil & Environmental Engineering
    "civil_environmental_engineering": {
        "domain_keywords": [
            "autocad", "civil 3d", "revit", "gis", "arcgis",
            "structural", "geotechnical", "hydraulic", "surveying",
            "asce", "leed", "nepa", "clean water act",
            "construction", "site observation", "field work",
            "fe exam", "fundamentals of engineering",
            "concrete", "steel", "sustainability", "stormwater",
            "infrastructure", "transportation",
        ],
        "portfolio_keywords": [],
        "domain_weight": 4,
    },
}

# Legacy keys: map old cohort names to canonical keys
COHORT_BUILD_ALIASES: dict[str, str] = {
    "design_creative": "design_creative_arts",
    "legal_compliance": "law_government",
    "education_teaching": "education_human_development",
}

# Map 11-track names to their best-matching cohort key for Build scoring
TRACK_TO_COHORT: dict[str, str] = {
    "Pre-Health": "healthcare_clinical",
    "Pre-Law": "law_government",
    "Tech": "software_engineering_cs",
    "Science": "life_sciences_research",
    "Business": "management_operations",
    "Finance": "finance_accounting",
    "Consulting": "consulting_strategy",
    "Communications": "media_communications",
    "Education": "education_human_development",
    "Arts": "design_creative_arts",
    "Humanities": "social_sciences_nonprofit",
}

# More specific major-to-cohort overrides within a track
# (e.g., a "Data Science" major on the "Tech" track uses data_science_analytics cohort)
MAJOR_TO_COHORT_OVERRIDE: dict[str, str] = {
    "Data Science": "data_science_analytics",
    "Cybersecurity": "cybersecurity_it",
    "Actuarial Science": "data_science_analytics",
    "Business Information Technology": "data_science_analytics",
    "Management Information Systems": "data_science_analytics",
    "Mathematics with Computer Science": "software_engineering_cs",
    "Financial Enterprise Systems": "finance_accounting",
    "Biochemistry": "biotech_pharmaceutical",
    "Biochemistry and Allied Health": "biotech_pharmaceutical",
    "Chemistry": "chemical_biomedical_engineering",
    "Physics": "physical_sciences_math",
    "Mathematics": "physical_sciences_math",
    "Marine Science": "life_sciences_research",
    "Marine Biology": "life_sciences_research",
    "Environmental Science": "civil_environmental_engineering",
    "Environmental Studies": "civil_environmental_engineering",
    "Biology": "life_sciences_research",
    "Biomedical Sciences": "biotech_pharmaceutical",
    "Nursing": "healthcare_clinical",
    "Public Health": "healthcare_clinical",
    "Health Science": "healthcare_clinical",
    "Economics": "economics_public_policy",
    "Marketing": "marketing_advertising",
    "International Business": "management_operations",
    "Entrepreneurship": "entrepreneurship_innovation",
    "Advertising and Public Relations": "media_communications",
    "Journalism": "media_communications",
    "Communication": "media_communications",
    "Graphic Design": "design_creative_arts",
    "Design": "design_creative_arts",
    "Animation": "design_creative_arts",
    "Film and Media Arts": "media_communications",
    "Political Science": "economics_public_policy",
    "Sociology": "social_sciences_nonprofit",
    "Psychology": "social_sciences_nonprofit",
}
