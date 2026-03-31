"""
22-Cohort Scoring Weights — Research-backed Smart / Grit / Build weights
and recruiter bar thresholds for Dilly's career scoring engine.

Sources: Web research conducted March 2026 across top employer hiring
pages, Glassdoor, Wall Street Oasis, eFinancialCareers, SHRM, APICS,
university career centers, and industry certification bodies.

Methodology:
  - Smart  = academic rigor (GPA, honors, research, major difficulty, coursework)
  - Grit   = leadership, ownership, impact (clubs, work experience, initiative)
  - Build  = shipped work, domain-specific proof (projects, certs, portfolios)
  - Weights always sum to 100 (stored as integers for clarity)
  - recruiter_bar = 0-100 threshold above which a student is competitive
    at the reference benchmark employer
"""
from __future__ import annotations


COHORT_SCORING_WEIGHTS: dict[str, dict] = {

    # ─────────────────────────────────────────────────────────────────────
    # 1. Software Engineering & CS
    # ─────────────────────────────────────────────────────────────────────
    # Google/Meta/Amazon: GPA not formally screened (removed requirement
    # years ago). Hiring is interview-driven: LeetCode, system design,
    # behavioral. GitHub repos, deployed apps, and open-source
    # contributions dominate resume screening. Google acceptance rate
    # ~0.2-0.5% for SWE roles. Build-heavy field.
    "software_engineering_cs": {
        "label": "Software Engineering & CS",
        "smart": 20,
        "grit": 25,
        "build": 55,
        "recruiter_bar": 76,
        "reference_benchmark": "Google L3 new-grad hiring bar",
        "reference_company": "Google",
        "gpa_screen": None,  # No formal GPA cutoff at FAANG
        "acceptance_rate": "~0.2-0.5% (Google), <1% (Meta/Amazon)",
        "key_proof_points": [
            "Deployed applications with real users",
            "GitHub portfolio with meaningful contributions",
            "LeetCode / system design interview performance",
            "Hackathon wins, open-source contributions",
            "Technical internships at recognized companies",
        ],
        "certifications": ["AWS Solutions Architect", "Google Cloud Professional"],
        "competition_level": "extreme",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 2. Data Science & Analytics
    # ─────────────────────────────────────────────────────────────────────
    # Google/Meta data roles: SQL and Python are non-negotiable. Tested
    # on statistics, A/B testing, probability, experimental design.
    # Recruiters want clarity, numbers, and impact in projects. Mix of
    # academic foundation (stats) and practical proof (Kaggle, deployed
    # models, dashboards). Interview process 4-6 weeks.
    "data_science_analytics": {
        "label": "Data Science & Analytics",
        "smart": 30,
        "grit": 25,
        "build": 45,
        "recruiter_bar": 78,
        "reference_benchmark": "Google/Meta Data Scientist new-grad bar",
        "reference_company": "Google",
        "gpa_screen": "3.0+ typical; no hard cutoff at FAANG",
        "acceptance_rate": "~1-3% for top data roles",
        "key_proof_points": [
            "SQL + Python/R proficiency (non-negotiable)",
            "A/B testing and experimental design experience",
            "Kaggle competitions or published analyses",
            "ML models with measurable business impact",
            "Dashboards and data pipeline projects",
        ],
        "certifications": ["Google Data Analytics Certificate", "IBM Data Science"],
        "competition_level": "very_high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 3. Cybersecurity & IT
    # ─────────────────────────────────────────────────────────────────────
    # CrowdStrike, Palo Alto Networks: Certifications carry enormous
    # weight (CompTIA Security+, CEH, PCCET). GPA rarely screened.
    # Practical skills (CTF competitions, incident response, pen testing)
    # matter more than academic pedigree. Palo Alto's LEAP program and
    # Unit 42 Consulting hire entry-level with academy training.
    "cybersecurity_it": {
        "label": "Cybersecurity & IT",
        "smart": 20,
        "grit": 30,
        "build": 50,
        "recruiter_bar": 72,
        "reference_benchmark": "CrowdStrike / Palo Alto Networks entry-level bar",
        "reference_company": "CrowdStrike",
        "gpa_screen": None,  # Certifications matter more than GPA
        "acceptance_rate": "~3-5% for top security firms",
        "key_proof_points": [
            "CompTIA Security+, CEH, or PCCET certification",
            "CTF competition participation and wins",
            "Penetration testing / vulnerability assessment labs",
            "Incident response or SOC experience",
            "Home lab environments documented",
        ],
        "certifications": [
            "CompTIA Security+", "CompTIA Network+", "CEH",
            "PCCET (Palo Alto)", "CISSP (advanced)",
        ],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 4. Finance & Accounting
    # ─────────────────────────────────────────────────────────────────────
    # Goldman Sachs, JP Morgan, Deloitte: GPA screens are REAL.
    # Goldman received 360,000+ intern applications in 2025 with <0.7%
    # acceptance. Target school: 3.5+ GPA; non-target: 3.7+ to pass
    # resume screen. Leadership (investment clubs, case competitions)
    # and networking are critical. Financial modeling is key build proof.
    "finance_accounting": {
        "label": "Finance & Accounting",
        "smart": 35,
        "grit": 40,
        "build": 25,
        "recruiter_bar": 84,
        "reference_benchmark": "Goldman Sachs summer analyst filter",
        "reference_company": "Goldman Sachs",
        "gpa_screen": "3.5+ (target school), 3.7+ (non-target)",
        "acceptance_rate": "<0.7% (Goldman internship), ~1-2% (bulge bracket)",
        "key_proof_points": [
            "GPA 3.5+ (hard screen at top banks)",
            "Investment club / finance society leadership",
            "Financial modeling and DCF experience",
            "Bloomberg Terminal proficiency",
            "Case/pitch competitions, networking events",
        ],
        "certifications": ["CFA Level I (in progress)", "Series 7/63", "CPA (accounting)"],
        "competition_level": "extreme",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 5. Marketing & Advertising
    # ─────────────────────────────────────────────────────────────────────
    # WPP, Ogilvy, HubSpot: Portfolio and measurable campaign results
    # dominate. GPA rarely screened. Creative proof (campaigns run,
    # content produced, social accounts grown, ad spend managed) is
    # what gets you hired. Ogilvy is #1 global agency on WARC for
    # creative excellence. Soft skills and creative thinking valued.
    "marketing_advertising": {
        "label": "Marketing & Advertising",
        "smart": 15,
        "grit": 35,
        "build": 50,
        "recruiter_bar": 68,
        "reference_benchmark": "Ogilvy / WPP early career program bar",
        "reference_company": "Ogilvy",
        "gpa_screen": None,  # Portfolio matters, not GPA
        "acceptance_rate": "~5-10% for top agency programs",
        "key_proof_points": [
            "Campaign portfolio with measurable results",
            "Social media accounts grown with metrics",
            "Content marketing portfolio (blog, video, social)",
            "Ad spend managed with ROI documentation",
            "Creative awards or competition wins",
        ],
        "certifications": [
            "Google Ads Certification", "HubSpot Inbound Marketing",
            "Meta Blueprint",
        ],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 6. Consulting & Strategy
    # ─────────────────────────────────────────────────────────────────────
    # McKinsey, BCG, Bain: Sub-1% overall acceptance rate (~200K
    # applicants for ~2K spots at McKinsey). GPA 3.5+ minimum, 3.7+
    # strong. Case competition wins and consulting club experience
    # matter enormously. Leadership roles are weighted heavily.
    # 10-15% get first-round interviews; 20-30% of final-round get offers.
    "consulting_strategy": {
        "label": "Consulting & Strategy",
        "smart": 30,
        "grit": 45,
        "build": 25,
        "recruiter_bar": 85,
        "reference_benchmark": "McKinsey Associate Consultant hiring bar",
        "reference_company": "McKinsey",
        "gpa_screen": "3.5+ minimum, 3.7+ competitive",
        "acceptance_rate": "<1% overall (MBB); 15-30% of interviewed candidates",
        "key_proof_points": [
            "GPA 3.6+ with quantitative coursework",
            "Case competition wins or finals appearances",
            "Consulting club leadership or client projects",
            "Significant leadership roles (president-level)",
            "Structured problem-solving demonstration",
        ],
        "certifications": [],  # No certifications; pure meritocracy via cases
        "competition_level": "extreme",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 7. Management & Operations
    # ─────────────────────────────────────────────────────────────────────
    # Amazon operations, supply chain roles: Lean/Kaizen/Six Sigma
    # process improvement experience valued. Quantified impact on
    # operations (efficiency %, cost reduction). Amazon's Pathways
    # program hires recent grads for ops leadership. Data-driven
    # decision-making emphasized.
    "management_operations": {
        "label": "Management & Operations",
        "smart": 20,
        "grit": 45,
        "build": 35,
        "recruiter_bar": 72,
        "reference_benchmark": "Amazon Area Manager / Pathways program bar",
        "reference_company": "Amazon",
        "gpa_screen": "3.0+ preferred, not hard cutoff",
        "acceptance_rate": "~5-8% for Amazon Pathways",
        "key_proof_points": [
            "Lean / Six Sigma / Kaizen experience",
            "Quantified process improvement results",
            "Team leadership with measurable outcomes",
            "Operations internship experience",
            "Data-driven decision-making examples",
        ],
        "certifications": ["Six Sigma Green Belt", "PMP", "Lean certification"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 8. Economics & Public Policy
    # ─────────────────────────────────────────────────────────────────────
    # Federal Reserve, Brookings, World Bank: Research Assistant roles
    # are the entry point. Require strong economics/stats coursework,
    # Stata/R/Python skills, and demonstrated research ability.
    # Fed RA is a 2-year program; most go to top PhD programs after.
    # Brookings RAs recruited in fall/spring cycles. GPA matters.
    "economics_public_policy": {
        "label": "Economics & Public Policy",
        "smart": 40,
        "grit": 30,
        "build": 30,
        "recruiter_bar": 80,
        "reference_benchmark": "Federal Reserve Research Assistant bar",
        "reference_company": "Federal Reserve",
        "gpa_screen": "3.5+ expected, strong quant coursework required",
        "acceptance_rate": "~3-5% for Fed RA, ~5-8% for Brookings RA",
        "key_proof_points": [
            "Economics / econometrics coursework depth",
            "Stata, R, or Python proficiency",
            "Independent research or thesis",
            "Policy writing or published analysis",
            "Government / think tank internship",
        ],
        "certifications": [],  # Academic credentials dominate
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 9. Entrepreneurship & Innovation
    # ─────────────────────────────────────────────────────────────────────
    # YC, Techstars, startup roles: GPA is irrelevant. What have you
    # built? Shipped products, revenue generated, users acquired.
    # YC Spring 2025 batch was 50%+ agentic AI companies. Startups
    # value adaptability, grit, and problem-solving over credentials.
    # Small teams = you wear multiple hats from day one.
    "entrepreneurship_innovation": {
        "label": "Entrepreneurship & Innovation",
        "smart": 10,
        "grit": 35,
        "build": 55,
        "recruiter_bar": 70,
        "reference_benchmark": "Y Combinator startup hiring bar",
        "reference_company": "Y Combinator (portfolio)",
        "gpa_screen": None,  # Completely irrelevant
        "acceptance_rate": "~2-3% (YC acceptance); startup jobs vary widely",
        "key_proof_points": [
            "Products or businesses launched",
            "Revenue generated or users acquired",
            "Pitch competition wins",
            "Hackathon projects shipped to production",
            "Demonstrated scrappiness and resourcefulness",
        ],
        "certifications": [],  # Building is the certification
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 10. Healthcare & Clinical
    # ─────────────────────────────────────────────────────────────────────
    # Mayo Clinic, top hospitals: Clinical hours and certifications are
    # the entry ticket. CNA/EMT/BLS required. Must be 18+. Preferred:
    # nursing assistant certification, 6+ months healthcare experience.
    # Patient care documentation and empathy demonstration matter.
    # Entry-level pay $20-25/hr at Mayo. Grit-heavy (volunteering,
    # clinical hours, patient interaction).
    "healthcare_clinical": {
        "label": "Healthcare & Clinical",
        "smart": 25,
        "grit": 40,
        "build": 35,
        "recruiter_bar": 74,
        "reference_benchmark": "Mayo Clinic entry-level clinical bar",
        "reference_company": "Mayo Clinic",
        "gpa_screen": "3.0+ for nursing/clinical programs",
        "acceptance_rate": "~10-15% for top hospital systems",
        "key_proof_points": [
            "Clinical hours logged (200+ competitive)",
            "CNA, EMT, or BLS certification",
            "Patient care experience documented",
            "Hospital / clinic volunteering",
            "Health organization leadership",
        ],
        "certifications": ["CNA", "EMT-B", "BLS/CPR", "Phlebotomy"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 11. Life Sciences & Research
    # ─────────────────────────────────────────────────────────────────────
    # Pfizer, NIH, biotech: Publications and lab experience are king.
    # Pfizer's R&D Rotational Program (2-year, 4 rotations) has 3-5%
    # acceptance rate. Top life sciences schools prioritized (Johns
    # Hopkins, Harvard, UC Berkeley). 0-2 years lab experience for
    # entry-level. Summer intern acceptance ~3-5%.
    "life_sciences_research": {
        "label": "Life Sciences & Research",
        "smart": 40,
        "grit": 25,
        "build": 35,
        "recruiter_bar": 78,
        "reference_benchmark": "Pfizer R&D Rotational Program bar",
        "reference_company": "Pfizer",
        "gpa_screen": "3.3+ typical for top biotech programs",
        "acceptance_rate": "~3-5% for Pfizer R&D program",
        "key_proof_points": [
            "Lab research experience (0-2 years minimum)",
            "Publications or conference posters",
            "REU or NIH-funded research",
            "Lab techniques mastered (PCR, Western blot, etc.)",
            "Research presentations at conferences",
        ],
        "certifications": ["BSL-2 training", "IACUC certification", "GLP training"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 12. Physical Sciences & Math
    # ─────────────────────────────────────────────────────────────────────
    # National labs (PNNL, LLNL, Sandia, Argonne, Brookhaven):
    # Heavy academic focus. BS minimum with 2+ years lab experience for
    # entry-level. Advanced degrees (MS/PhD) strongly preferred for
    # research roles. Computational skills (Python, MATLAB) required.
    # Research output (papers, simulations) is primary proof.
    "physical_sciences_math": {
        "label": "Physical Sciences & Math",
        "smart": 50,
        "grit": 20,
        "build": 30,
        "recruiter_bar": 80,
        "reference_benchmark": "National lab (LLNL/PNNL) entry-level researcher bar",
        "reference_company": "Lawrence Livermore National Laboratory",
        "gpa_screen": "3.5+ strongly preferred for national labs",
        "acceptance_rate": "~5-10% for national lab positions",
        "key_proof_points": [
            "Advanced coursework in physics/math/chemistry",
            "Research papers or thesis",
            "Computational modeling (Python, MATLAB, Fortran)",
            "NSF REU or national lab internship",
            "Math competition achievements (Putnam, AMC)",
        ],
        "certifications": [],  # Academic credentials and research output dominate
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 13. Social Sciences & Nonprofit
    # ─────────────────────────────────────────────────────────────────────
    # UNDP, large nonprofits: Fieldwork, community impact, and policy
    # work are primary signals. 53% of nonprofit employers expanding
    # teams in 2025. UNDP internships focus on research, writing,
    # conference support. Impact measurement skills increasingly valued.
    # Community organizing and advocacy experience weighted heavily.
    "social_sciences_nonprofit": {
        "label": "Social Sciences & Nonprofit",
        "smart": 25,
        "grit": 45,
        "build": 30,
        "recruiter_bar": 68,
        "reference_benchmark": "UNDP / major nonprofit internship bar",
        "reference_company": "UNDP",
        "gpa_screen": "3.0+ preferred for competitive programs",
        "acceptance_rate": "~10-15% for top international orgs",
        "key_proof_points": [
            "Community impact projects with documented outcomes",
            "Nonprofit volunteering or fieldwork",
            "Policy research or advocacy experience",
            "Grant writing or fundraising",
            "Cross-cultural experience or language skills",
        ],
        "certifications": ["Peace Corps", "AmeriCorps", "Nonprofit Management cert"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 14. Media & Communications
    # ─────────────────────────────────────────────────────────────────────
    # NYT, CNN, PR agencies: Published work and bylines are everything.
    # Portfolio of diverse reporting styles required. Familiarity with
    # video editing, CMS, social media platforms, and multimedia tools
    # expected. Student media experience (newspaper, TV, radio) is the
    # primary pipeline. GPA rarely factors in hiring decisions.
    "media_communications": {
        "label": "Media & Communications",
        "smart": 15,
        "grit": 35,
        "build": 50,
        "recruiter_bar": 70,
        "reference_benchmark": "NYT / CNN entry-level reporter/producer bar",
        "reference_company": "New York Times",
        "gpa_screen": None,  # Portfolio and clips matter, not GPA
        "acceptance_rate": "~3-5% for top masthead fellowships",
        "key_proof_points": [
            "Published articles / bylines at recognized outlets",
            "Student newspaper or campus media leadership",
            "Multimedia portfolio (video, audio, written)",
            "Social media content creation with reach metrics",
            "Journalism internships at recognized publications",
        ],
        "certifications": ["Google News Initiative training", "AP Style mastery"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 15. Design & Creative
    # ─────────────────────────────────────────────────────────────────────
    # IDEO, design agencies: Portfolio is EVERYTHING. Process-driven
    # design thinking valued (research-led, human-centered). Figma,
    # Adobe XD proficiency expected. Dribbble/Behance presence matters.
    # Entry-level UX designers start with personal projects, freelance,
    # or volunteering. GPA not a factor.
    "design_creative": {
        "label": "Design & Creative",
        "smart": 10,
        "grit": 25,
        "build": 65,
        "recruiter_bar": 72,
        "reference_benchmark": "IDEO / top design agency junior designer bar",
        "reference_company": "IDEO",
        "gpa_screen": None,  # Portfolio is the only screen
        "acceptance_rate": "~5-10% for top design programs/agencies",
        "key_proof_points": [
            "Portfolio with 4-6 case studies showing process",
            "Figma / Adobe XD proficiency",
            "User research and usability testing conducted",
            "Dribbble/Behance presence with quality work",
            "Design competition wins or hackathon projects",
        ],
        "certifications": ["Google UX Design Certificate", "Nielsen Norman Group UX cert"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 16. Legal & Compliance
    # ─────────────────────────────────────────────────────────────────────
    # Top law firms, corporate legal: Pre-law path is GPA + LSAT driven.
    # Mock trial, moot court, legal internships matter for law school
    # admission. For corporate compliance (non-JD path), GPA screens
    # exist at top firms. Government legal programs (DOJ, IRS) evaluate
    # moot court, journal, clinical experience, and GPA (3.25+ minimum
    # for some programs). LSAT 160+ for competitive schools.
    "legal_compliance": {
        "label": "Legal & Compliance",
        "smart": 40,
        "grit": 35,
        "build": 25,
        "recruiter_bar": 82,
        "reference_benchmark": "Top law school admission / BigLaw hiring bar",
        "reference_company": "Skadden, Arps",
        "gpa_screen": "3.5+ for top law schools; 3.25+ for government honors programs",
        "acceptance_rate": "~5-10% for T14 law schools; <5% for BigLaw summer associate",
        "key_proof_points": [
            "GPA 3.5+ (hard screen for law school admissions)",
            "LSAT score 160+ (80th percentile)",
            "Mock trial or moot court participation",
            "Legal internship or paralegal experience",
            "Law review, debate, policy research",
        ],
        "certifications": ["Paralegal Certificate", "Compliance certifications (for non-JD)"],
        "competition_level": "very_high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 17. Human Resources & People
    # ─────────────────────────────────────────────────────────────────────
    # SHRM-CP is the gold standard certification. No degree or prior HR
    # experience required to sit for SHRM-CP. SHRM-certified
    # professionals earn ~15% more. Operational HR knowledge (policies,
    # day-to-day functions, employee relations) is the focus. People
    # skills and culture building outweigh technical skills.
    "human_resources_people": {
        "label": "Human Resources & People",
        "smart": 20,
        "grit": 50,
        "build": 30,
        "recruiter_bar": 66,
        "reference_benchmark": "SHRM-CP certified HR generalist bar",
        "reference_company": "SHRM",
        "gpa_screen": None,  # People skills > GPA
        "acceptance_rate": "~20-30% for top HR associate programs",
        "key_proof_points": [
            "SHRM-CP certification (or in progress)",
            "HR internship or people operations experience",
            "Employee relations or culture initiatives",
            "Event planning and team coordination",
            "Conflict resolution and communication skills",
        ],
        "certifications": ["SHRM-CP", "SHRM-SCP (advanced)", "PHR"],
        "competition_level": "low",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 18. Supply Chain & Logistics
    # ─────────────────────────────────────────────────────────────────────
    # Amazon, FedEx, logistics companies: APICS certifications (CSCP,
    # CPIM) provide competitive edge. Six Sigma valued. Entry-level
    # certified logistics professionals start ~$50K. Excel/SQL and
    # warehouse management system familiarity expected. Operations
    # focus with process improvement mindset.
    "supply_chain_logistics": {
        "label": "Supply Chain & Logistics",
        "smart": 20,
        "grit": 40,
        "build": 40,
        "recruiter_bar": 70,
        "reference_benchmark": "Amazon / FedEx supply chain analyst bar",
        "reference_company": "Amazon",
        "gpa_screen": "3.0+ preferred",
        "acceptance_rate": "~10-15% for top supply chain programs",
        "key_proof_points": [
            "APICS CSCP or CPIM certification (or in progress)",
            "Six Sigma Green/Yellow Belt",
            "Excel and SQL proficiency",
            "Supply chain internship or warehouse experience",
            "Process improvement projects with metrics",
        ],
        "certifications": ["APICS CSCP", "APICS CPIM", "Six Sigma Green Belt", "CLTD"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 19. Education & Teaching
    # ─────────────────────────────────────────────────────────────────────
    # Top school districts, ed-tech: Classroom hours are the primary
    # gate. Student teaching requires 450-600+ hours depending on state.
    # Typically 20 weeks at 25+ hrs/week. State teaching certification
    # required. Teacher shortages in STEM and special education create
    # opportunities. Ed-tech values curriculum design and learning
    # management system experience.
    "education_teaching": {
        "label": "Education & Teaching",
        "smart": 20,
        "grit": 45,
        "build": 35,
        "recruiter_bar": 65,
        "reference_benchmark": "Top school district / ed-tech hiring bar",
        "reference_company": "Teach For America",
        "gpa_screen": "2.5+ minimum for certification; 3.0+ competitive",
        "acceptance_rate": "~15-25% for TFA; varies by district/shortage area",
        "key_proof_points": [
            "450-600+ student teaching hours completed",
            "State teaching certification (or in progress)",
            "Tutoring or mentoring experience",
            "Classroom management demonstrations",
            "Curriculum design or lesson plan portfolio",
        ],
        "certifications": [
            "State Teaching License", "Praxis exams",
            "ESL/TESOL certification", "Special Education endorsement",
        ],
        "competition_level": "low",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 20. Real Estate & Construction
    # ─────────────────────────────────────────────────────────────────────
    # CBRE, top developers: Bachelor's in Business, Real Estate, Finance,
    # or Engineering required. Real estate license required if state-
    # mandated. 0-5 years experience for entry-level at CBRE. Deal
    # experience, market analysis, and financial modeling valued.
    # Intern exposure to diverse clients and projects is the entry point.
    "real_estate_construction": {
        "label": "Real Estate & Construction",
        "smart": 20,
        "grit": 40,
        "build": 40,
        "recruiter_bar": 70,
        "reference_benchmark": "CBRE entry-level analyst bar",
        "reference_company": "CBRE",
        "gpa_screen": "3.0+ preferred for commercial real estate firms",
        "acceptance_rate": "~10-15% for top CRE firms",
        "key_proof_points": [
            "Real estate license (if state-mandated)",
            "Financial modeling and market analysis",
            "Real estate internship or deal exposure",
            "Excel / Argus proficiency",
            "Networking within local real estate community",
        ],
        "certifications": ["Real Estate License", "LEED AP", "Argus certification"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 21. Environmental & Sustainability
    # ─────────────────────────────────────────────────────────────────────
    # EPA, sustainability firms (ERM): Entry-level includes lab roles,
    # field sampling, compliance, and sustainability positions. Hands-on
    # fieldwork valued. LEED, GHG Protocol, and energy audit knowledge
    # increasingly required. Consulting firms (ERM) hire early-career
    # for EHS and sustainability. Starting salaries $50-62K for climate
    # consultants.
    "environmental_sustainability": {
        "label": "Environmental & Sustainability",
        "smart": 30,
        "grit": 35,
        "build": 35,
        "recruiter_bar": 68,
        "reference_benchmark": "EPA / ERM entry-level environmental scientist bar",
        "reference_company": "EPA",
        "gpa_screen": "3.0+ for competitive programs",
        "acceptance_rate": "~10-20% for EPA entry programs",
        "key_proof_points": [
            "Field research or environmental sampling experience",
            "LEED or GHG Protocol knowledge",
            "Environmental impact assessments conducted",
            "GIS or environmental modeling skills",
            "Sustainability internship or research",
        ],
        "certifications": ["LEED Green Associate", "LEED AP", "Certified Environmental Scientist"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 22. Hospitality & Events
    # ─────────────────────────────────────────────────────────────────────
    # Marriott, live events: Customer service orientation is paramount.
    # Bachelor's in hospitality, business, or related field preferred.
    # Event management software proficiency expected. Practical
    # internship experience valued. Marriott career fairs across US.
    # Event Manager salary range $57K-$85K. Volume management and
    # organizational skills are the differentiators.
    "hospitality_events": {
        "label": "Hospitality & Events",
        "smart": 10,
        "grit": 50,
        "build": 40,
        "recruiter_bar": 62,
        "reference_benchmark": "Marriott entry-level event coordinator bar",
        "reference_company": "Marriott",
        "gpa_screen": None,  # Experience and service orientation matter more
        "acceptance_rate": "~15-25% for major hotel management programs",
        "key_proof_points": [
            "Event coordination experience with documented scale",
            "Hospitality internship at recognized brand",
            "Customer service metrics or testimonials",
            "Event management software proficiency",
            "Volume management under pressure",
        ],
        "certifications": [
            "CMP (Certified Meeting Professional)",
            "ServSafe", "TIPS certification",
        ],
        "competition_level": "low",
    },
}


# ── Convenience accessors ──────────────────────────────────────────────────

def get_cohort_weights(cohort_key: str) -> dict[str, float]:
    """Return normalized {smart, grit, build} weights (summing to 1.0)."""
    cfg = COHORT_SCORING_WEIGHTS.get(cohort_key)
    if not cfg:
        # Fallback: equal weights
        return {"smart": 0.33, "grit": 0.34, "build": 0.33}
    return {
        "smart": cfg["smart"] / 100,
        "grit": cfg["grit"] / 100,
        "build": cfg["build"] / 100,
    }


def get_recruiter_bar(cohort_key: str) -> int:
    """Return the recruiter bar threshold (0-100) for a given cohort."""
    cfg = COHORT_SCORING_WEIGHTS.get(cohort_key)
    return cfg["recruiter_bar"] if cfg else 70


def get_reference(cohort_key: str) -> tuple[str, str]:
    """Return (reference_company, reference_benchmark) for a cohort."""
    cfg = COHORT_SCORING_WEIGHTS.get(cohort_key)
    if not cfg:
        return ("top employers", "the recruiter threshold")
    return (cfg["reference_company"], cfg["reference_benchmark"])


def list_cohort_keys() -> list[str]:
    """Return all 22 cohort keys."""
    return list(COHORT_SCORING_WEIGHTS.keys())


# ── JSON export for frontend / API consumption ─────────────────────────────

def export_weights_json() -> list[dict]:
    """Export all cohort weights as a JSON-serializable list."""
    result = []
    for key, cfg in COHORT_SCORING_WEIGHTS.items():
        result.append({
            "cohort_key": key,
            "label": cfg["label"],
            "weights": {
                "smart": cfg["smart"],
                "grit": cfg["grit"],
                "build": cfg["build"],
            },
            "recruiter_bar": cfg["recruiter_bar"],
            "reference_benchmark": cfg["reference_benchmark"],
            "reference_company": cfg["reference_company"],
            "gpa_screen": cfg["gpa_screen"],
            "competition_level": cfg["competition_level"],
            "key_proof_points": cfg["key_proof_points"],
            "certifications": cfg["certifications"],
        })
    return result


# ── Summary table (for quick reference) ────────────────────────────────────

WEIGHTS_SUMMARY = """
+----+------------------------------------+-------+------+-------+-----+------------------+---------------+
| #  | Cohort                             | Smart | Grit | Build | Bar | Reference        | Competition   |
+----+------------------------------------+-------+------+-------+-----+------------------+---------------+
|  1 | Software Engineering & CS          |  20   |  25  |  55   |  76 | Google           | extreme       |
|  2 | Data Science & Analytics           |  30   |  25  |  45   |  78 | Google           | very_high     |
|  3 | Cybersecurity & IT                 |  20   |  30  |  50   |  72 | CrowdStrike      | high          |
|  4 | Finance & Accounting               |  35   |  40  |  25   |  84 | Goldman Sachs    | extreme       |
|  5 | Marketing & Advertising            |  15   |  35  |  50   |  68 | Ogilvy           | moderate      |
|  6 | Consulting & Strategy              |  30   |  45  |  25   |  85 | McKinsey         | extreme       |
|  7 | Management & Operations            |  20   |  45  |  35   |  72 | Amazon           | moderate      |
|  8 | Economics & Public Policy          |  40   |  30  |  30   |  80 | Federal Reserve  | high          |
|  9 | Entrepreneurship & Innovation      |  10   |  35  |  55   |  70 | YC (portfolio)   | moderate      |
| 10 | Healthcare & Clinical              |  25   |  40  |  35   |  74 | Mayo Clinic      | moderate      |
| 11 | Life Sciences & Research           |  40   |  25  |  35   |  78 | Pfizer           | high          |
| 12 | Physical Sciences & Math           |  50   |  20  |  30   |  80 | LLNL             | high          |
| 13 | Social Sciences & Nonprofit        |  25   |  45  |  30   |  68 | UNDP             | moderate      |
| 14 | Media & Communications             |  15   |  35  |  50   |  70 | New York Times   | high          |
| 15 | Design & Creative                  |  10   |  25  |  65   |  72 | IDEO             | high          |
| 16 | Legal & Compliance                 |  40   |  35  |  25   |  82 | Skadden          | very_high     |
| 17 | Human Resources & People           |  20   |  50  |  30   |  66 | SHRM             | low           |
| 18 | Supply Chain & Logistics           |  20   |  40  |  40   |  70 | Amazon           | moderate      |
| 19 | Education & Teaching               |  20   |  45  |  35   |  65 | TFA              | low           |
| 20 | Real Estate & Construction         |  20   |  40  |  40   |  70 | CBRE             | moderate      |
| 21 | Environmental & Sustainability     |  30   |  35  |  35   |  68 | EPA              | moderate      |
| 22 | Hospitality & Events               |  10   |  50  |  40   |  62 | Marriott         | low           |
+----+------------------------------------+-------+------+-------+-----+------------------+---------------+
"""


if __name__ == "__main__":
    import json
    print(json.dumps(export_weights_json(), indent=2))
