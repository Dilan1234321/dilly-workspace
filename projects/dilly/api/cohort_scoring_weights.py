"""
43-Cohort Scoring Weights — Research-backed Smart / Grit / Build weights
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

    # ─────────────────────────────────────────────────────────────────────
    # 23. Mechanical & Aerospace Engineering
    # ─────────────────────────────────────────────────────────────────────
    # Boeing, Lockheed Martin, SpaceX, Tesla, GE Aerospace. GPA screens
    # are real (3.0+ minimum, 3.5+ for top tier like SpaceX). FE exam
    # passage is a strong signal. Senior design projects, SAE/ASME
    # competitions, and co-op experience are critical. CAD proficiency
    # (SolidWorks, CATIA, NX) is non-negotiable. Hands-on prototyping
    # and manufacturing experience differentiates. SpaceX acceptance
    # rate <1%. Boeing hires ~3,000 interns/year from 100K+ applicants.
    "mechanical_aerospace_engineering": {
        "label": "Mechanical & Aerospace Engineering",
        "smart": 35,
        "grit": 25,
        "build": 40,
        "recruiter_bar": 76,
        "reference_benchmark": "Boeing / SpaceX new-grad engineering bar",
        "reference_company": "Boeing",
        "gpa_screen": 3.0,  # 3.5+ for SpaceX/top tier
        "acceptance_rate": "<1% (SpaceX), ~3% (Boeing internships)",
        "key_proof_points": [
            "Senior design project with tangible deliverable",
            "SAE/ASME/AIAA competition team experience",
            "Co-op or internship at recognized manufacturer",
            "CAD proficiency (SolidWorks, CATIA, NX)",
            "FE exam passage or preparation",
            "Hands-on prototyping or machine shop experience",
        ],
        "certifications": ["FE (Fundamentals of Engineering)", "SolidWorks CSWA/CSWP", "Six Sigma Green Belt"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 24. Electrical & Computer Engineering
    # ─────────────────────────────────────────────────────────────────────
    # Intel, Qualcomm, Texas Instruments, NVIDIA, Apple. Hardware/firmware
    # roles require deep academic foundation (circuit design, signals,
    # embedded systems). GPA screens at 3.2+ for most semiconductor
    # companies. Lab work and project portfolios (PCB design, FPGA
    # implementations, embedded projects) are critical proof. Intel
    # ISEF participation and IEEE student branch leadership valued.
    # NVIDIA acceptance rate <2% for hardware roles.
    "electrical_computer_engineering": {
        "label": "Electrical & Computer Engineering",
        "smart": 35,
        "grit": 20,
        "build": 45,
        "recruiter_bar": 78,
        "reference_benchmark": "Intel / NVIDIA hardware engineering bar",
        "reference_company": "Intel",
        "gpa_screen": 3.2,  # Semiconductor companies screen rigorously
        "acceptance_rate": "<2% (NVIDIA), ~3% (Intel internships)",
        "key_proof_points": [
            "PCB design or FPGA implementation projects",
            "Embedded systems projects with real hardware",
            "Circuit design and simulation portfolio",
            "Lab coursework with documented results",
            "IEEE or robotics club leadership",
            "Internship at semiconductor or hardware company",
        ],
        "certifications": ["FE (Fundamentals of Engineering)", "Certified LabVIEW Developer", "Altium Designer Certification"],
        "competition_level": "very_high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 25. Civil & Environmental Engineering
    # ─────────────────────────────────────────────────────────────────────
    # AECOM, Bechtel, Jacobs, Fluor. PE licensure path is the career
    # backbone — FE exam passage before graduation is strongly expected.
    # AutoCAD Civil 3D, Revit, and GIS proficiency required. Field
    # experience (surveying, construction site observation) valued.
    # Infrastructure projects and sustainability design increasingly
    # important. More stable hiring than other engineering fields.
    # AECOM hires ~2,000 interns globally.
    "civil_environmental_engineering": {
        "label": "Civil & Environmental Engineering",
        "smart": 30,
        "grit": 30,
        "build": 40,
        "recruiter_bar": 72,
        "reference_benchmark": "AECOM / Bechtel entry-level bar",
        "reference_company": "AECOM",
        "gpa_screen": 3.0,  # Standard across major firms
        "acceptance_rate": "~5-8% (top firms), moderate overall",
        "key_proof_points": [
            "FE exam passage (strongly expected before graduation)",
            "AutoCAD Civil 3D / Revit / GIS proficiency",
            "Senior capstone with real client or municipality",
            "Field experience (surveying, site observation)",
            "ASCE student chapter leadership",
            "Sustainability or green infrastructure projects",
        ],
        "certifications": ["FE (Fundamentals of Engineering)", "LEED Green Associate", "GIS Certificate"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 26. Chemical & Biomedical Engineering
    # ─────────────────────────────────────────────────────────────────────
    # Pfizer, J&J, Medtronic, Dow, ExxonMobil. Chemical engineering
    # roles require strong academic foundation (thermodynamics, transport
    # phenomena, reaction kinetics). Biomedical roles need FDA regulatory
    # knowledge and medical device design. GPA screens at 3.2+ for
    # pharma/biotech. Lab research experience is critical. Co-ops are
    # common and almost expected (especially at Dow, ExxonMobil).
    # Pfizer R&D acceptance rate <3%.
    "chemical_biomedical_engineering": {
        "label": "Chemical & Biomedical Engineering",
        "smart": 40,
        "grit": 25,
        "build": 35,
        "recruiter_bar": 78,
        "reference_benchmark": "Pfizer R&D / Medtronic entry-level bar",
        "reference_company": "Pfizer",
        "gpa_screen": 3.2,  # Pharma/biotech screen rigorously
        "acceptance_rate": "<3% (Pfizer R&D), ~5% (major pharma internships)",
        "key_proof_points": [
            "Research experience with publications or presentations",
            "Process design or simulation projects (Aspen, COMSOL)",
            "Lab skills (GMP, analytical chemistry, bioprocessing)",
            "Co-op at recognized chemical or pharmaceutical company",
            "FDA regulatory awareness (for biomedical track)",
            "Medical device prototyping or design control",
        ],
        "certifications": ["FE (Fundamentals of Engineering)", "Six Sigma Green Belt", "Lean Manufacturing"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 27. Industrial & Systems Engineering
    # ─────────────────────────────────────────────────────────────────────
    # Amazon, GE, Toyota, Deloitte (operations consulting). ISE is the
    # bridge between engineering and business — optimization, lean/six
    # sigma, supply chain modeling, data analytics. Employers value
    # quantified process improvements. Six Sigma certification is a
    # major differentiator. Amazon Operations hires heavily from ISE.
    # Consulting firms recruit ISE for operations practices. GPA
    # screen at 3.0+ standard, 3.5+ for consulting.
    "industrial_systems_engineering": {
        "label": "Industrial & Systems Engineering",
        "smart": 25,
        "grit": 35,
        "build": 40,
        "recruiter_bar": 74,
        "reference_benchmark": "Amazon Operations / GE entry-level bar",
        "reference_company": "Amazon",
        "gpa_screen": 3.0,  # 3.5+ for consulting track
        "acceptance_rate": "~3-5% (Amazon Ops), ~8% (GE internships)",
        "key_proof_points": [
            "Quantified process improvement projects",
            "Lean/Six Sigma project with documented savings",
            "Supply chain or logistics optimization work",
            "Simulation modeling (Arena, AnyLogic, Python)",
            "Data analytics with business impact",
            "IIE/IISE student chapter or case competition",
        ],
        "certifications": ["Six Sigma Green Belt", "Six Sigma Black Belt", "APICS CSCP", "Lean Manufacturing"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 28. Agriculture & Food Science
    # ─────────────────────────────────────────────────────────────────────
    # Cargill, USDA, Monsanto/Bayer Crop Science, ADM. Mix of academic
    # (agronomy, soil science) and practical (farm management, equipment).
    # FFA experience matters. Research on crop yields and sustainability
    # is valued. Field experience and applied research dominate hiring.
    "agriculture_food_science": {
        "label": "Agriculture & Food Science",
        "smart": 30,
        "grit": 35,
        "build": 35,
        "recruiter_bar": 68,
        "reference_benchmark": "Cargill / USDA entry-level agronomist bar",
        "reference_company": "Cargill",
        "gpa_screen": "3.0+ preferred for research roles",
        "acceptance_rate": "~10-15% for top agribusiness programs",
        "key_proof_points": [
            "FFA or 4-H leadership and competition awards",
            "Crop yield or sustainability research projects",
            "Farm management or agribusiness internship",
            "Soil science or agronomy fieldwork",
            "Equipment operation and precision agriculture tech",
        ],
        "certifications": ["Certified Crop Adviser (CCA)", "HACCP", "ServSafe"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 29. Architecture & Urban Planning
    # ─────────────────────────────────────────────────────────────────────
    # Gensler, SOM, AECOM, HOK. Portfolio is critical (like design).
    # Academic rigor matters (5-year accredited B.Arch programs). ARE exam
    # path. Studio projects and internship hours (IDP/AXP) required for
    # licensure. Build-heavy because portfolio and studio work dominate.
    "architecture_urban_planning": {
        "label": "Architecture & Urban Planning",
        "smart": 25,
        "grit": 25,
        "build": 50,
        "recruiter_bar": 74,
        "reference_benchmark": "Gensler / SOM junior designer bar",
        "reference_company": "Gensler",
        "gpa_screen": "3.0+ for competitive firms",
        "acceptance_rate": "~5-10% for top architecture firms",
        "key_proof_points": [
            "Design portfolio with 4-6 studio projects",
            "AXP/IDP internship hours logged toward licensure",
            "Revit, AutoCAD, Rhino, Grasshopper proficiency",
            "Competition entries or awards (AIA, ULI)",
            "Urban planning or community design charrette experience",
        ],
        "certifications": ["ARE (Architect Registration Exam)", "LEED AP", "AICP (for planning track)"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 30. Performing Arts & Film
    # ─────────────────────────────────────────────────────────────────────
    # Netflix, Disney, A24, Broadway, regional theaters, film studios.
    # Reel/portfolio/performance credits are everything. Academic
    # credentials are less important. Festival selections, productions
    # directed or acted in, and union membership (SAG-AFTRA) matter.
    # Extremely build-heavy — shipped creative work is the currency.
    "performing_arts_film": {
        "label": "Performing Arts & Film",
        "smart": 10,
        "grit": 30,
        "build": 60,
        "recruiter_bar": 70,
        "reference_benchmark": "Netflix / A24 entry-level production bar",
        "reference_company": "Netflix",
        "gpa_screen": None,  # Credits and reel matter, not GPA
        "acceptance_rate": "~2-5% for top film/theater programs; <1% for studio roles",
        "key_proof_points": [
            "Demo reel or performance credits",
            "Festival selections or competition awards",
            "Productions directed, acted in, or crewed",
            "Union membership (SAG-AFTRA, IATSE)",
            "Student film or theater leadership roles",
        ],
        "certifications": ["SAG-AFTRA membership", "IATSE membership", "Final Cut / Avid / DaVinci Resolve"],
        "competition_level": "very_high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 31. Foreign Languages & Linguistics
    # ─────────────────────────────────────────────────────────────────────
    # State Department, UN, translation firms, international organizations.
    # DLPT scores, interpreter certifications, and immersion experience
    # are primary signals. Academic rigor (linguistics research) combined
    # with practical fluency proof. Bilingual candidates in high-demand
    # languages (Arabic, Mandarin, Russian) have strong advantage.
    "foreign_languages_linguistics": {
        "label": "Foreign Languages & Linguistics",
        "smart": 35,
        "grit": 30,
        "build": 35,
        "recruiter_bar": 72,
        "reference_benchmark": "State Department / UN interpreter bar",
        "reference_company": "U.S. State Department",
        "gpa_screen": "3.0+ for government language programs",
        "acceptance_rate": "~10-15% for State Dept fellowships",
        "key_proof_points": [
            "DLPT score or equivalent proficiency certification",
            "Immersion experience (study abroad, Peace Corps)",
            "Interpreter or translation work samples",
            "Linguistics research or published papers",
            "Fluency in 2+ languages with documented proficiency",
        ],
        "certifications": ["ATA Certified Translator", "State Dept DLPT", "ACTFL OPI certification"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 32. Religious Studies & Ministry
    # ─────────────────────────────────────────────────────────────────────
    # Seminaries, chaplaincy programs, faith-based nonprofits. Community
    # leadership, pastoral care, and theology GPA are the primary signals.
    # Grit-heavy — leadership, service orientation, and interpersonal
    # skills dominate over technical or academic proof.
    "religious_studies_ministry": {
        "label": "Religious Studies & Ministry",
        "smart": 30,
        "grit": 45,
        "build": 25,
        "recruiter_bar": 62,
        "reference_benchmark": "Top seminary / chaplaincy program admission bar",
        "reference_company": "Duke Divinity School",
        "gpa_screen": "3.0+ preferred for competitive seminaries",
        "acceptance_rate": "~20-30% for top seminary programs",
        "key_proof_points": [
            "Community or congregational leadership roles",
            "Pastoral care or chaplaincy volunteer hours",
            "Theology coursework and GPA",
            "Mission trips or faith-based service projects",
            "Public speaking and teaching experience",
        ],
        "certifications": ["CPE (Clinical Pastoral Education)", "Ordination credentials", "Board Certified Chaplain"],
        "competition_level": "low",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 33. Aviation & Transportation
    # ─────────────────────────────────────────────────────────────────────
    # Delta, United, FedEx, FAA. FAA certifications (PPL, instrument
    # rating) and logged flight hours are the hard gates. Build-heavy
    # because certifications and flight time are non-negotiable proof.
    # Airline cadet programs are the primary pipeline for new pilots.
    "aviation_transportation": {
        "label": "Aviation & Transportation",
        "smart": 25,
        "grit": 30,
        "build": 45,
        "recruiter_bar": 72,
        "reference_benchmark": "Delta / United cadet program bar",
        "reference_company": "Delta Air Lines",
        "gpa_screen": "2.5+ minimum; 3.0+ for competitive cadet programs",
        "acceptance_rate": "~5-10% for airline cadet programs",
        "key_proof_points": [
            "FAA Private Pilot License (PPL) or higher",
            "Instrument rating and logged flight hours",
            "Aviation internship or FBO experience",
            "FAA written exam scores",
            "Leadership in aviation clubs or organizations",
        ],
        "certifications": ["FAA PPL", "Instrument Rating", "Commercial Pilot License (CPL)", "FAA Part 107 (drone)"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 34. Criminal Justice & Public Safety
    # ─────────────────────────────────────────────────────────────────────
    # FBI, DEA, US Marshals, state/local law enforcement. Physical
    # fitness, leadership, and community service are primary signals.
    # Background investigations matter. Academy training is the entry
    # point. Grit-heavy — resilience, integrity, and service dominate.
    "criminal_justice_public_safety": {
        "label": "Criminal Justice & Public Safety",
        "smart": 25,
        "grit": 45,
        "build": 30,
        "recruiter_bar": 68,
        "reference_benchmark": "FBI / DEA special agent entry bar",
        "reference_company": "FBI",
        "gpa_screen": "3.0+ for federal agencies; 2.5+ for local",
        "acceptance_rate": "~5% (FBI), ~10-15% (local law enforcement)",
        "key_proof_points": [
            "Physical fitness test scores (PFT)",
            "Leadership roles in student organizations",
            "Community service and volunteer hours",
            "Criminal justice internship or ride-along",
            "Clean background and drug screening",
        ],
        "certifications": ["CPR/First Aid", "FEMA ICS certifications", "State POST certification"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 35. Library & Information Science
    # ─────────────────────────────────────────────────────────────────────
    # Library of Congress, academic libraries, digital archives. MLS
    # preparation, cataloging/metadata experience, and digital literacy
    # are the primary signals. Balanced across all three dimensions.
    "library_information_science": {
        "label": "Library & Information Science",
        "smart": 35,
        "grit": 30,
        "build": 35,
        "recruiter_bar": 64,
        "reference_benchmark": "Library of Congress / top academic library bar",
        "reference_company": "Library of Congress",
        "gpa_screen": "3.0+ for competitive MLS programs",
        "acceptance_rate": "~25-35% for top MLS programs",
        "key_proof_points": [
            "Library internship or work-study experience",
            "Cataloging, metadata, or digital archiving projects",
            "Information literacy instruction experience",
            "Database management and digital tools proficiency",
            "Community programming and outreach",
        ],
        "certifications": ["MLS/MLIS (in progress)", "Digital Archives Specialist", "Metadata certification"],
        "competition_level": "low",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 36. Culinary Arts & Food Service
    # ─────────────────────────────────────────────────────────────────────
    # CIA (Culinary Institute of America), Michelin restaurants, hotel
    # food programs. Kitchen experience, stages/externships, and food
    # safety certifications are non-negotiable. Build-heavy — hands-on
    # cooking skill and kitchen time are the currency.
    "culinary_arts_food_service": {
        "label": "Culinary Arts & Food Service",
        "smart": 10,
        "grit": 40,
        "build": 50,
        "recruiter_bar": 66,
        "reference_benchmark": "CIA / Michelin restaurant entry bar",
        "reference_company": "Culinary Institute of America",
        "gpa_screen": None,  # Kitchen skill matters, not GPA
        "acceptance_rate": "~20-30% for top culinary programs",
        "key_proof_points": [
            "Kitchen experience (line cook, prep, pastry)",
            "Stage or externship at recognized restaurant",
            "Food safety and sanitation certifications",
            "Culinary competition awards",
            "Menu development or recipe creation portfolio",
        ],
        "certifications": ["ServSafe Manager", "ACF Certified Culinarian", "HACCP"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 37. Fashion & Apparel
    # ─────────────────────────────────────────────────────────────────────
    # LVMH, Nike, Vogue, PVH, Kering. Portfolio, runway shows, design
    # competitions, and brand internships are primary signals. Extremely
    # build-heavy — creative output and industry exposure dominate.
    "fashion_apparel": {
        "label": "Fashion & Apparel",
        "smart": 10,
        "grit": 30,
        "build": 60,
        "recruiter_bar": 72,
        "reference_benchmark": "LVMH / Nike design entry bar",
        "reference_company": "LVMH",
        "gpa_screen": None,  # Portfolio is the only screen
        "acceptance_rate": "~3-5% for top fashion house internships",
        "key_proof_points": [
            "Fashion design portfolio with collection work",
            "Runway shows or design competition participation",
            "Brand internship at recognized label",
            "Textile and pattern-making proficiency",
            "Fashion week or trade show exposure",
        ],
        "certifications": ["CLO 3D certification", "Adobe Creative Suite", "Textile science credential"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 38. Journalism & Broadcasting
    # ─────────────────────────────────────────────────────────────────────
    # NYT, WSJ, CNN, NPR, AP. Published clips, broadcast reels, and
    # editor experience are primary signals. Separate from general
    # media/comms — more specific to investigative reporting, beat
    # coverage, and broadcast production. Build-heavy but grit matters
    # for deadline-driven, high-pressure newsroom culture.
    "journalism_broadcasting": {
        "label": "Journalism & Broadcasting",
        "smart": 20,
        "grit": 35,
        "build": 45,
        "recruiter_bar": 72,
        "reference_benchmark": "NYT / CNN entry-level reporter bar",
        "reference_company": "New York Times",
        "gpa_screen": None,  # Published work matters, not GPA
        "acceptance_rate": "~2-5% for top masthead fellowships/internships",
        "key_proof_points": [
            "Published clips at recognized outlets",
            "Broadcast reel with on-air or production work",
            "Student newspaper or campus media editor role",
            "Investigative or enterprise reporting samples",
            "AP Style and CMS proficiency",
        ],
        "certifications": ["Google News Initiative", "AP Style certification", "Broadcast journalism credential"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 39. Public Administration & Government
    # ─────────────────────────────────────────────────────────────────────
    # Federal agencies, state government, city management. Policy
    # analysis, public speaking, and government internships are primary
    # signals. Grit-heavy — public service orientation, leadership, and
    # persistence through bureaucratic processes matter.
    "public_administration_government": {
        "label": "Public Administration & Government",
        "smart": 30,
        "grit": 40,
        "build": 30,
        "recruiter_bar": 70,
        "reference_benchmark": "Federal PMF / state government analyst bar",
        "reference_company": "Office of Management and Budget",
        "gpa_screen": "3.0+ for Presidential Management Fellowship",
        "acceptance_rate": "~5-10% for PMF; ~15-20% for state programs",
        "key_proof_points": [
            "Government internship (federal, state, or local)",
            "Policy analysis or research papers",
            "Public speaking and legislative testimony",
            "Community organizing or civic engagement",
            "Grant writing or program evaluation",
        ],
        "certifications": ["Certified Public Manager (CPM)", "PMP", "FEMA certifications"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 40. Veterinary & Animal Science
    # ─────────────────────────────────────────────────────────────────────
    # Top vet schools, animal hospitals, USDA APHIS. Clinical hours,
    # animal handling, and GRE/GPA screens are the hard gates. Smart-
    # heavy because pre-vet academic requirements are rigorous.
    "veterinary_animal_science": {
        "label": "Veterinary & Animal Science",
        "smart": 40,
        "grit": 30,
        "build": 30,
        "recruiter_bar": 76,
        "reference_benchmark": "Top vet school admission / USDA APHIS bar",
        "reference_company": "Cornell Veterinary",
        "gpa_screen": 3.4,  # Pre-vet GPA screens are rigorous
        "acceptance_rate": "~10-15% for top vet schools",
        "key_proof_points": [
            "500+ clinical or animal handling hours",
            "Veterinary hospital or clinic experience",
            "Animal science research with faculty",
            "GRE scores in competitive range",
            "Large and small animal experience diversity",
        ],
        "certifications": ["Veterinary Technician (CVT)", "USDA APHIS accreditation", "Fear Free certification"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 41. Pharmacy & Pharmaceutical Science
    # ─────────────────────────────────────────────────────────────────────
    # CVS Health, Walgreens, Pfizer, FDA. PCAT prep, pharmacy internship
    # hours, and compounding experience are primary signals. Smart-heavy
    # due to rigorous pre-pharmacy academic requirements and PCAT.
    "pharmacy_pharmaceutical": {
        "label": "Pharmacy & Pharmaceutical Science",
        "smart": 45,
        "grit": 25,
        "build": 30,
        "recruiter_bar": 78,
        "reference_benchmark": "Top PharmD program admission / Pfizer entry bar",
        "reference_company": "Pfizer",
        "gpa_screen": 3.3,  # Pre-pharmacy GPA screens are strict
        "acceptance_rate": "~15-25% for top PharmD programs",
        "key_proof_points": [
            "PCAT score in competitive range",
            "Pharmacy internship hours (300+ preferred)",
            "Compounding or clinical rotation experience",
            "Pharmaceutical research or lab work",
            "Patient counseling and medication therapy management",
        ],
        "certifications": ["Pharmacy Technician (CPhT)", "Immunization delivery", "PCAT"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 42. Nursing & Patient Care
    # ─────────────────────────────────────────────────────────────────────
    # Mayo Clinic, Cleveland Clinic, HCA, Kaiser Permanente. NCLEX prep,
    # clinical rotations, and patient care hours are the hard gates.
    # Grit-heavy — resilience, compassion, and ability to perform under
    # pressure in clinical settings are paramount.
    "nursing_patient_care": {
        "label": "Nursing & Patient Care",
        "smart": 30,
        "grit": 40,
        "build": 30,
        "recruiter_bar": 72,
        "reference_benchmark": "Mayo Clinic / Cleveland Clinic new-grad RN bar",
        "reference_company": "Mayo Clinic",
        "gpa_screen": 3.0,  # BSN programs screen at 3.0+
        "acceptance_rate": "~15-25% for top nursing residency programs",
        "key_proof_points": [
            "NCLEX-RN preparation and practice scores",
            "500+ clinical rotation hours across specialties",
            "Patient care technician or CNA experience",
            "Simulation lab performance evaluations",
            "Healthcare volunteer hours and leadership",
        ],
        "certifications": ["BLS/ACLS", "CNA", "NCLEX-RN (in progress)", "Specialty nursing certifications"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 43. Dental & Oral Health
    # ─────────────────────────────────────────────────────────────────────
    # Top dental schools, private practices, community health. DAT prep,
    # shadowing hours, manual dexterity, and patient interaction are
    # primary signals. Smart-heavy due to rigorous pre-dental academic
    # requirements and DAT scoring.
    "dental_oral_health": {
        "label": "Dental & Oral Health",
        "smart": 40,
        "grit": 30,
        "build": 30,
        "recruiter_bar": 78,
        "reference_benchmark": "Top dental school admission bar",
        "reference_company": "UCSF School of Dentistry",
        "gpa_screen": 3.5,  # Pre-dental GPA screens are very strict
        "acceptance_rate": "~5-10% for top dental schools",
        "key_proof_points": [
            "DAT score in competitive range (20+ AA)",
            "100+ dental shadowing hours across specialties",
            "Manual dexterity demonstration (wire bending, wax-up)",
            "Patient interaction in clinical or volunteer setting",
            "Dental research or community oral health outreach",
        ],
        "certifications": ["DAT", "Dental Assisting (CDA)", "Radiology certification"],
        "competition_level": "very_high",
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
    """Return all 43 cohort keys."""
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
| 23 | Mechanical & Aerospace Eng.        |  35   |  25  |  40   |  76 | Boeing           | high          |
| 24 | Electrical & Computer Eng.         |  35   |  20  |  45   |  78 | Intel            | very_high     |
| 25 | Civil & Environmental Eng.         |  30   |  30  |  40   |  72 | AECOM            | moderate      |
| 26 | Chemical & Biomedical Eng.         |  40   |  25  |  35   |  78 | Pfizer           | high          |
| 27 | Industrial & Systems Eng.          |  25   |  35  |  40   |  74 | Amazon           | moderate      |
| 28 | Agriculture & Food Science         |  30   |  35  |  35   |  68 | Cargill          | moderate      |
| 29 | Architecture & Urban Planning      |  25   |  25  |  50   |  74 | Gensler          | high          |
| 30 | Performing Arts & Film             |  10   |  30  |  60   |  70 | Netflix          | very_high     |
| 31 | Foreign Languages & Linguistics    |  35   |  30  |  35   |  72 | State Dept       | moderate      |
| 32 | Religious Studies & Ministry       |  30   |  45  |  25   |  62 | Duke Divinity    | low           |
| 33 | Aviation & Transportation          |  25   |  30  |  45   |  72 | Delta            | high          |
| 34 | Criminal Justice & Public Safety   |  25   |  45  |  30   |  68 | FBI              | moderate      |
| 35 | Library & Information Science      |  35   |  30  |  35   |  64 | Library of Cong. | low           |
| 36 | Culinary Arts & Food Service       |  10   |  40  |  50   |  66 | CIA (Culinary)   | moderate      |
| 37 | Fashion & Apparel                  |  10   |  30  |  60   |  72 | LVMH             | high          |
| 38 | Journalism & Broadcasting          |  20   |  35  |  45   |  72 | New York Times   | high          |
| 39 | Public Administration & Govt       |  30   |  40  |  30   |  70 | OMB              | moderate      |
| 40 | Veterinary & Animal Science        |  40   |  30  |  30   |  76 | Cornell Vet      | high          |
| 41 | Pharmacy & Pharmaceutical          |  45   |  25  |  30   |  78 | Pfizer           | high          |
| 42 | Nursing & Patient Care             |  30   |  40  |  30   |  72 | Mayo Clinic      | moderate      |
| 43 | Dental & Oral Health               |  40   |  30  |  30   |  78 | UCSF Dentistry   | very_high     |
+----+------------------------------------+-------+------+-------+-----+------------------+---------------+
"""


if __name__ == "__main__":
    import json
    print(json.dumps(export_weights_json(), indent=2))
