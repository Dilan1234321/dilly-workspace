"""
22-Cohort Scoring Weights — Deeply-researched Smart / Grit / Build weights,
recruiter-bar thresholds, and per-dimension definitions for Dilly's career
scoring engine.

DIMENSION DEFINITIONS (change meaning by cohort — see each entry)
──────────────────────────────────────────────────────────────────
Smart  = The intellectual/academic proof for THIS field.
         Not generic GPA — the specific type of knowledge that signals
         readiness to recruiters in this cohort.
         (e.g. Smart in Finance = financial modeling + quant GPA;
               Smart in Design = design theory + UX research methods;
               Smart in SWE = algorithmic thinking + CS fundamentals)

Grit   = The persistence/drive/ownership proof for THIS field.
         Leadership and work ethic expressed through the lens of what
         this cohort actually demands.
         (e.g. Grit in Finance = 200+ networking coffee chats, GPA under
               pressure, investment club consistency;
               Grit in Healthcare = clinical hours logged, pre-med
               multi-year dedication, patient care endurance)

Build  = Shipped, tangible proof of competence for THIS field.
         Domain-specific artifacts that a recruiter can point to.
         (e.g. Build in SWE = deployed apps, GitHub portfolio;
               Build in Design = Figma case studies, Behance portfolio;
               Build in Finance = DCF models, pitch decks, deal exposure)

SCALE
─────
  100 = perfect — student gets any job they want in this cohort
  85+ = elite — competitive at Goldman, McKinsey, Google, SpaceX, etc.
  75–84 = strong — competitive at Tier-2 leaders (Stripe, Brex, Boeing)
  65–74 = competitive — gets most mid-market internships; some top-tier
  55–64 = developing — entry-level roles, regional employers
  <55   = needs significant work before job applications

COHORT WEIGHTS
──────────────
  smart + grit + build = 100 (integers for clarity)
  These weights determine how dilly_score is computed:
    dilly_score = smart_score×(smart/100) + grit_score×(grit/100) + build_score×(build/100)

  recruiter_bar = minimum dilly_score to be competitive at the reference employer.

SOURCES (April 2026 research)
──────────────────────────────
  Hiring data: company career pages, Glassdoor, LinkedIn Salary, Wall Street Oasis,
  Blind, levels.fyi, eFinancialCareers, LeetCode discuss, Biotech/Pharma forums,
  SHRM, APICS, IEEE, ASCE, ABA, AMA, PRSA, SPJ, NASW, SEJ.
  Acceptance rates: company press releases, Bloomberg, Fortune, NYT reporting.
  Certification bodies: CompTIA, PMI, CFA Institute, CAIA, APICS, NSPE, ABRET.
"""
from __future__ import annotations


COHORT_SCORING_WEIGHTS: dict[str, dict] = {

    # ─────────────────────────────────────────────────────────────────────
    # 1. Software Engineering & CS
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Google/Meta/Amazon new-grad SWE (L3/E3/SDE-I).
    # Google acceptance ~0.2–0.5%. Build dominates because FAANG removed
    # GPA screens — interview performance (LeetCode/system design) and
    # portfolio evidence determine outcome. Smart is still non-trivial:
    # it captures algorithmic fluency, not academic GPA.
    #
    # Smart (SWE)  = Algorithmic thinking, data structures, system design,
    #                CS theory, competitive programming rating, coding interview
    #                performance, depth of CS coursework
    # Grit  (SWE)  = Consistency of open-source contributions, persistence
    #                through hard coding challenges, time invested in
    #                self-teaching, hackathon participation, side project
    #                follow-through across semesters
    # Build (SWE)  = Deployed applications with real users, GitHub portfolio
    #                activity and code quality, internships at recognized tech
    #                companies, system complexity demonstrated, open-source
    #                contributions merged upstream
    "software_engineering_cs": {
        "label": "Software Engineering & CS",
        "smart": 20,
        "grit": 25,
        "build": 55,
        "recruiter_bar": 76,
        "reference_benchmark": "Google L3 / Meta E3 new-grad bar",
        "reference_company": "Google",
        "gpa_screen": None,
        "acceptance_rate": "~0.2–0.5% (Google), <1% (Meta/Amazon)",
        "smart_means": "Algorithmic thinking, DS&A mastery, system design ability, LeetCode performance, CS theory depth",
        "grit_means": "Consistent building over time, open-source persistence, hackathon follow-through, self-teaching new tech stacks",
        "build_means": "Deployed apps with users, GitHub portfolio quality/activity, tech internships, system complexity, open-source merged PRs",
        "key_proof_points": [
            "LeetCode 200+ problems solved, medium/hard focus",
            "Deployed app with real users (not just localhost)",
            "GitHub portfolio with meaningful, sustained contributions",
            "Technical internship at recognized company",
            "Hackathon win or substantial open-source contribution",
        ],
        "certifications": ["AWS Solutions Architect", "Google Cloud Professional Engineer"],
        "competition_level": "extreme",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 2. Data Science & Analytics
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Google/Meta DS new-grad, Stripe Analytics, Airbnb DS.
    # Acceptance ~1–3% for top DS roles. Heavier on Smart than SWE
    # because statistical reasoning and mathematical foundations are
    # screened in interviews (probability, A/B testing, SQL). Build
    # matters: deployed models and Kaggle scores are verifiable proof.
    #
    # Smart (DS&A) = Statistical reasoning, ML theory, math foundations,
    #                SQL + Python/R mastery, experimental design, probability,
    #                quantitative coursework depth, A/B testing knowledge
    # Grit  (DS&A) = Kaggle competition persistence, long analysis projects
    #                seen through to publication, staying current with ML
    #                advances, iterating on failed model architectures
    # Build (DS&A) = Deployed ML models with measurable business impact,
    #                Kaggle competition rankings, published analysis notebooks,
    #                data pipelines in production, dashboards used by real teams
    "data_science_analytics": {
        "label": "Data Science & Analytics",
        "smart": 35,
        "grit": 25,
        "build": 40,
        "recruiter_bar": 75,
        "reference_benchmark": "Google/Stripe/Airbnb DS new-grad bar",
        "reference_company": "Stripe",
        "gpa_screen": "3.0+ typical; no hard cutoff at FAANG",
        "acceptance_rate": "~1–3% for top DS roles",
        "smart_means": "Statistical reasoning, ML theory, math foundations, SQL/Python mastery, A/B testing, probability, experimental design",
        "grit_means": "Kaggle persistence, long analysis projects followed through, staying current with ML literature, iterating on model failures",
        "build_means": "Deployed models with business impact, Kaggle rankings, published notebooks, production data pipelines, dashboards used by teams",
        "key_proof_points": [
            "SQL and Python/R proficiency (screened in every interview)",
            "A/B testing and experimental design experience",
            "Kaggle competition or published public analysis",
            "ML model with quantified business impact",
            "Data pipeline or dashboard used by real stakeholders",
        ],
        "certifications": ["Google Data Analytics Certificate", "Databricks Certified Associate"],
        "competition_level": "very_high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 3. Finance & Accounting
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Goldman Sachs summer analyst. 360K+ applicants, <0.7%
    # acceptance. GPA screens are REAL: 3.5+ target school, 3.7+ non-target.
    # Grit is the strongest signal because networking is the meta-game —
    # students who land Goldman do 150-300 coffee chats. Smart reflects
    # quantitative academic performance. Build is lowest because finance
    # cares less about portfolio artifacts and more about who you know and
    # how you perform in modeling/case interviews.
    #
    # Smart (Finance) = GPA (heavily screened), financial modeling proficiency,
    #                   quantitative reasoning, accounting/valuation knowledge,
    #                   Bloomberg Terminal skill, econ/finance coursework depth
    # Grit  (Finance) = Networking intensity (coffee chats, information interviews),
    #                   recruiting hustle (applying 100+ roles), investment club
    #                   consistent involvement, maintaining GPA under pressure,
    #                   persistence through rejection-heavy process
    # Build (Finance) = DCF and LBO models built, case competition finishes,
    #                   pitch deck quality, Bloomberg proficiency demonstrated,
    #                   deal exposure or investment research published
    "finance_accounting": {
        "label": "Finance & Accounting",
        "smart": 40,
        "grit": 38,
        "build": 22,
        "recruiter_bar": 84,
        "reference_benchmark": "Goldman Sachs / JPMorgan summer analyst filter",
        "reference_company": "Goldman Sachs",
        "gpa_screen": "3.5+ (target school), 3.7+ (non-target) — hard screen",
        "acceptance_rate": "<0.7% (Goldman internship), ~1–2% (bulge bracket)",
        "smart_means": "GPA (hard-screened), financial modeling, valuation (DCF/LBO), quant reasoning, Bloomberg/Excel mastery, accounting fundamentals",
        "grit_means": "Networking intensity (150+ coffee chats), recruiting persistence, investment club leadership, maintaining GPA under pressure, rejection resilience",
        "build_means": "DCF/LBO models built, case competition placements, Bloomberg proficiency, deal or investment research published, pitch decks",
        "key_proof_points": [
            "GPA 3.5+ (non-negotiable at bulge bracket banks)",
            "Investment club or finance society leadership role",
            "Financial model (DCF/LBO) built from scratch",
            "Bloomberg Terminal proficiency",
            "Case/pitch competition participation or win",
        ],
        "certifications": ["CFA Level I (in progress)", "Series 7/63", "CPA (accounting track)"],
        "competition_level": "extreme",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 4. Consulting & Strategy
    # ─────────────────────────────────────────────────────────────────────
    # Reference: McKinsey AC, BCG Consultant, Bain AC (~200K applicants,
    # ~2K spots at McKinsey → <1% overall). GPA 3.5+ minimum, 3.7+ strong.
    # Grit is highest because case prep is the differentiator — top hires
    # do 50-100 practice cases. Networking and persistence across multi-
    # month recruiting cycles matter enormously.
    #
    # Smart (Consulting) = Structured problem-solving speed, quantitative
    #                      analysis, business case frameworks (MECE thinking),
    #                      GPA + rigorous coursework, market sizing accuracy
    # Grit  (Consulting) = Case prep volume (50-100+ cases), networking across
    #                      recruiting cycle, persistence through 5-6 rounds,
    #                      consistent consulting club involvement, leadership
    # Build (Consulting) = Case competition wins/finals, client-facing projects,
    #                      strategy deliverables, operations improvement with
    #                      quantified results, pro-bono consulting projects
    "consulting_strategy": {
        "label": "Consulting & Strategy",
        "smart": 35,
        "grit": 42,
        "build": 23,
        "recruiter_bar": 85,
        "reference_benchmark": "McKinsey / BCG / Bain Associate Consultant bar",
        "reference_company": "McKinsey",
        "gpa_screen": "3.5+ minimum, 3.7+ competitive",
        "acceptance_rate": "<1% overall (MBB); 15–30% of final-round candidates",
        "smart_means": "Structured problem-solving, quantitative case analysis, MECE thinking, GPA + rigorous coursework, business frameworks mastery",
        "grit_means": "Case prep volume (50-100+ cases), multi-month recruiting persistence, consulting club leadership, handling repeated rejection",
        "build_means": "Case competition wins/finals, client-facing deliverables, strategy projects with quantified outcomes, pro-bono consulting",
        "key_proof_points": [
            "GPA 3.6+ with quantitative coursework",
            "Case competition finals or win (national/regional)",
            "Consulting club leadership or client project",
            "50+ practice cases completed",
            "Significant leadership role (president, VP-level)",
        ],
        "certifications": [],
        "competition_level": "extreme",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 5. Marketing & Advertising
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Ogilvy/WPP/HubSpot early career programs. GPA not
    # screened. Portfolio and measurable campaign results dominate.
    # Build is highest — the interviewer wants to see campaigns run,
    # social accounts grown, ad spend managed with ROI. Creative thinking
    # demonstrated through work, not GPA.
    #
    # Smart (Marketing) = Market research methodology, digital analytics
    #                     (Google Analytics, Meta Ads Manager), consumer
    #                     psychology principles, SEO/SEM understanding,
    #                     data interpretation and A/B testing literacy
    # Grit  (Marketing) = Creative iteration cycles, campaign follow-through
    #                     to measurable results, content consistency over
    #                     months, client/feedback-driven revision persistence,
    #                     multi-platform management without dropping quality
    # Build (Marketing) = Campaigns run with documented metrics (impressions,
    #                     conversions, CTR), social media accounts grown
    #                     with follower/engagement proof, ad spend managed
    #                     with ROI documentation, creative portfolio,
    #                     agency or brand internship
    "marketing_advertising": {
        "label": "Marketing & Advertising",
        "smart": 20,
        "grit": 30,
        "build": 50,
        "recruiter_bar": 68,
        "reference_benchmark": "Ogilvy / WPP / HubSpot early career bar",
        "reference_company": "Ogilvy",
        "gpa_screen": None,
        "acceptance_rate": "~5–10% for top agency/brand programs",
        "smart_means": "Market research, digital analytics (GA4/Meta/TikTok), consumer psychology, SEO/SEM, data interpretation, brand strategy literacy",
        "grit_means": "Creative iteration and revision cycles, campaign follow-through to results, content consistency over months, client feedback loops",
        "build_means": "Campaigns run with metrics (impressions, conversions, CTR, ROAS), social accounts grown, ad spend managed with ROI, creative portfolio",
        "key_proof_points": [
            "Campaign portfolio with measurable results (not just screenshots)",
            "Social media accounts managed with growth metrics",
            "Ad spend managed — even $100 budgets with ROI documented",
            "Brand or agency internship",
            "Google Ads / Meta Blueprint / HubSpot certification",
        ],
        "certifications": ["Google Ads Certification", "Meta Blueprint", "HubSpot Inbound Marketing"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 6. Management & Operations
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Amazon Pathways program, Target GLTDP, GE Operations
    # Management. Grit-dominant because operations is about leading
    # teams and delivering under pressure. Smart captures process
    # optimization and data-driven decision-making (not academic GPA).
    # Build is quantified operational impact — efficiency % improvements.
    #
    # Smart (Ops)  = Process optimization methodology, supply chain
    #                fundamentals, data-driven decision frameworks,
    #                Six Sigma principles, ERP system literacy, financial
    #                acumen for operations (P&L reading, cost analysis)
    # Grit  (Ops)  = Leading teams through ambiguity, delivering results
    #                across multi-month projects, managing cross-functional
    #                stakeholders, consistently meeting deadlines under
    #                resource constraints, ownership of problems end-to-end
    # Build (Ops)  = Processes improved with quantified outcomes (cost
    #                saved, time reduced, efficiency %), teams led with
    #                headcount and results, ops internship at recognized
    #                company, Lean/Six Sigma project documented
    "management_operations": {
        "label": "Management & Operations",
        "smart": 25,
        "grit": 43,
        "build": 32,
        "recruiter_bar": 72,
        "reference_benchmark": "Amazon Pathways / Target GLTDP bar",
        "reference_company": "Amazon",
        "gpa_screen": "3.0+ preferred, not hard cutoff",
        "acceptance_rate": "~5–8% for Amazon Pathways, ~8% Target GLTDP",
        "smart_means": "Process optimization, supply chain logic, Six Sigma methodology, data-driven decisions, ERP literacy, P&L and cost analysis",
        "grit_means": "Leading teams under pressure, multi-month project delivery, cross-functional stakeholder management, ownership through setbacks",
        "build_means": "Quantified process improvements (cost%, time%, efficiency%), teams led with headcount, ops internship experience, Lean/Six Sigma projects",
        "key_proof_points": [
            "Process improvement project with quantified outcome (%)",
            "Team leadership with headcount and deliverable",
            "Operations or supply chain internship",
            "Six Sigma, Lean, or PMP exposure",
            "Data-driven decision example with business impact",
        ],
        "certifications": ["Six Sigma Green Belt", "PMP", "Lean certification", "APICS CPIM"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 7. Healthcare & Clinical
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Mayo Clinic, Cleveland Clinic entry-level clinical roles.
    # Grit is highest because healthcare demands sustained dedication —
    # clinical hours (200+ competitive), patient care consistency, and
    # the emotional/physical demands of the field. Smart reflects medical
    # science mastery. Build is certifications and documented hours.
    #
    # Smart (HC)   = Medical/clinical science mastery, anatomy & physiology,
    #                pharmacology basics, clinical protocol knowledge,
    #                science GPA (especially for pre-health), MCAT prep
    #                performance, healthcare system understanding
    # Grit  (HC)   = Clinical hours logged (200+ for competitive apps),
    #                patient care consistency over semesters, emotional
    #                resilience in healthcare settings, pre-med multi-year
    #                dedication, volunteering in underserved settings
    # Build (HC)   = CNA/EMT/BLS/Phlebotomy certifications, documented
    #                patient encounter hours, hospital/clinic placements,
    #                healthcare research or poster presentations, leadership
    #                in pre-med/health organizations
    "healthcare_clinical": {
        "label": "Healthcare & Clinical",
        "smart": 30,
        "grit": 45,
        "build": 25,
        "recruiter_bar": 74,
        "reference_benchmark": "Mayo Clinic / Cleveland Clinic entry-level clinical bar",
        "reference_company": "Mayo Clinic",
        "gpa_screen": "3.0+ for clinical programs; 3.5+ for competitive hospitals",
        "acceptance_rate": "~10–15% for top hospital systems",
        "smart_means": "Clinical science mastery (A&P, pharmacology, pathophysiology), science GPA, MCAT prep performance, healthcare protocol knowledge",
        "grit_means": "Clinical hours (200+ = competitive), patient care endurance over semesters, emotional resilience, pre-med multi-year commitment, volunteering consistency",
        "build_means": "CNA/EMT/BLS/Phlebotomy certifications, documented patient encounters, hospital placements, healthcare research, pre-health org leadership",
        "key_proof_points": [
            "200+ clinical hours documented (minimum for competitive apps)",
            "CNA, EMT-B, or BLS certification",
            "Hospital or clinic internship/volunteering",
            "Pre-health organization leadership role",
            "Research or shadow experience with physician documentation",
        ],
        "certifications": ["CNA", "EMT-B", "BLS/CPR", "Phlebotomy Tech", "Patient Care Tech"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 8. Cybersecurity & IT
    # ─────────────────────────────────────────────────────────────────────
    # Reference: CrowdStrike, Palo Alto Networks, Mandiant entry-level.
    # Build-dominant: certifications (CompTIA Security+, CEH, PCCET) and
    # practical lab proof (CTF wins, bug bounties) matter far more than
    # academic credentials. Smart reflects hands-on technical depth, not
    # GPA. Grit is self-directed learning persistence.
    #
    # Smart (Cyber) = Network fundamentals (TCP/IP, DNS, routing), security
    #                 protocols (TLS, OAuth, PKI), cryptography basics,
    #                 OS internals (Linux command line mastery), threat
    #                 landscape awareness, OWASP top 10, MITRE ATT&CK
    # Grit  (Cyber) = CTF competition persistence and improvement over time,
    #                 self-directed certification study (Security+, CEH),
    #                 staying current on threat intelligence, bug bounty
    #                 hunting consistency, home lab expansion over months
    # Build (Cyber) = CTF wins and rankings (HackTheBox, TryHackMe, PicoCTF),
    #                 certifications earned (CompTIA, CEH, PCCET, OSCP),
    #                 bug bounties submitted/rewarded, pen test lab docs,
    #                 security tools built or contributed to, SOC/IR experience
    "cybersecurity_it": {
        "label": "Cybersecurity & IT",
        "smart": 22,
        "grit": 28,
        "build": 50,
        "recruiter_bar": 72,
        "reference_benchmark": "CrowdStrike / Palo Alto Networks / Mandiant entry-level bar",
        "reference_company": "CrowdStrike",
        "gpa_screen": None,
        "acceptance_rate": "~3–5% for top security firms",
        "smart_means": "Network fundamentals, security protocols, cryptography basics, OS internals (Linux), threat landscape, OWASP top 10, MITRE ATT&CK framework",
        "grit_means": "CTF persistence and skill growth over time, self-directed cert study, staying current on threat intel, bug bounty hunting consistency",
        "build_means": "CTF wins/rankings (HTB, THM, PicoCTF), certifications (Security+, CEH, PCCET, OSCP), bug bounties, pen test lab documentation, SOC experience",
        "key_proof_points": [
            "CompTIA Security+ or CEH certification",
            "CTF competition ranking (HackTheBox, TryHackMe profile)",
            "Home lab documentation (VMs, network topology, tools used)",
            "Bug bounty program participation (even no-reward submissions)",
            "Penetration testing or incident response experience",
        ],
        "certifications": ["CompTIA Security+", "CompTIA Network+", "CEH", "PCCET", "OSCP (advanced)"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 9. Law & Government
    # ─────────────────────────────────────────────────────────────────────
    # Reference: T14 law school admission / BigLaw summer associate /
    # DOJ Honors Program. Smart-dominant because legal reasoning, writing,
    # and analytical thinking are the core screening tool (LSAT proxy).
    # GPA screens are real at top law firms (3.5+ minimum). Grit reflects
    # preparation depth and advocacy persistence.
    #
    # Smart (Law)  = Legal reasoning and analytical writing, LSAT-equivalent
    #                thinking (logical deduction, argument structure),
    #                constitutional/statutory knowledge, policy analysis,
    #                GPA + rigorous coursework, research paper quality
    # Grit  (Law)  = Moot court rounds and preparation depth, legal writing
    #                revision cycles (10+ drafts is normal), pro-bono
    #                hours, political/advocacy work persistence, debate
    #                competition dedication
    # Build (Law)  = Moot court performance/wins, law review articles,
    #                published policy papers, government or legal internships,
    #                paralegal or legal clinic experience, mock trial wins
    "law_government": {
        "label": "Law & Government",
        "smart": 45,
        "grit": 30,
        "build": 25,
        "recruiter_bar": 82,
        "reference_benchmark": "T14 law school / BigLaw SA / DOJ Honors Program bar",
        "reference_company": "Skadden, Arps",
        "gpa_screen": "3.5+ for T14 law; 3.25+ for government honors programs",
        "acceptance_rate": "~5–10% T14 law; <5% BigLaw SA; ~3% DOJ Honors",
        "smart_means": "Legal/analytical reasoning, LSAT-equivalent thinking, constitutional/statutory knowledge, policy analysis, GPA + rigorous coursework, research paper quality",
        "grit_means": "Moot court preparation depth, legal writing revision cycles, pro-bono hours, advocacy/political work persistence, debate competition dedication",
        "build_means": "Moot court wins/performance, law review articles, policy papers published, government/legal internships, paralegal or legal clinic experience",
        "key_proof_points": [
            "GPA 3.5+ (hard screen for BigLaw and T14 law)",
            "Moot court or mock trial participation",
            "Government or legal internship (state/federal/NGO)",
            "Published research paper or policy brief",
            "Debate club, pre-law society, or political org leadership",
        ],
        "certifications": ["Paralegal Certificate", "LSAT 160+ (80th percentile)"],
        "competition_level": "very_high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 10. Biotech & Pharmaceutical
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Pfizer R&D, Genentech, J&J, Moderna entry-level.
    # Pfizer acceptance <3% for R&D program. Smart-dominant because the
    # scientific depth required (molecular biology, biochemistry, FDA
    # regulatory) is the primary screen. Grit reflects lab research
    # persistence (failed experiments are the norm in this field).
    #
    # Smart (Biotech) = Molecular biology, biochemistry, cell biology,
    #                   pharmacology mastery, FDA regulatory pathway
    #                   understanding, lab science GPA (3.3+ competitive),
    #                   drug discovery and development process knowledge
    # Grit  (Biotech) = Lab research persistence through repeated failed
    #                   experiments, grant writing dedication, long publication
    #                   timelines (6–24 months), multi-semester research
    #                   commitment, conference presentation preparation
    # Build (Biotech) = Research publications or conference posters,
    #                   lab technique certifications (BSL-2, GLP, GMP),
    #                   patents or invention disclosures, industry internship
    #                   at pharma/biotech, thesis quality and research citations
    "biotech_pharmaceutical": {
        "label": "Biotech & Pharmaceutical",
        "smart": 42,
        "grit": 33,
        "build": 25,
        "recruiter_bar": 76,
        "reference_benchmark": "Pfizer R&D / Genentech / Moderna entry-level bar",
        "reference_company": "Pfizer",
        "gpa_screen": "3.3+ typical; 3.5+ for top pharma R&D",
        "acceptance_rate": "<3% (Pfizer R&D program), ~4–6% major pharma internships",
        "smart_means": "Molecular biology, biochemistry, cell biology, pharmacology, FDA regulatory pathways, drug discovery process, science GPA",
        "grit_means": "Lab research persistence through failures, grant writing, long publication timelines, multi-semester research commitment, conference prep",
        "build_means": "Publications/conference posters, lab certifications (BSL-2, GLP, GMP), patents, pharma/biotech internship, thesis quality",
        "key_proof_points": [
            "Wet lab research experience (0-2 years minimum)",
            "Publications, posters, or research presentations",
            "BSL-2 training and core lab technique proficiency",
            "Industry internship at pharma or biotech company",
            "GPA 3.3+ in science courses (pre-requisite screen)",
        ],
        "certifications": ["BSL-2 Lab Safety", "GLP/GMP Training", "IRB/IACUC certification"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 11. Mechanical & Aerospace Engineering
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Boeing, SpaceX, Lockheed Martin, Tesla. SpaceX <1%
    # acceptance, Boeing hires 3K interns from 100K+ applications (~3%).
    # GPA screens real: 3.0+ standard, 3.5+ for SpaceX/Blue Origin.
    # Smart reflects engineering fundamentals mastery. Build captures
    # the tangible prototypes and CAD portfolio that differentiate.
    #
    # Smart (ME/AE) = Thermodynamics, fluid mechanics, structural analysis,
    #                 FE exam-level theory, materials science, CAD theory
    #                 and simulation (FEA/CFD understanding), statics/dynamics,
    #                 machine design principles, engineering math depth
    # Grit  (ME/AE) = Senior capstone dedication through multiple semesters,
    #                 competition team commitment (SAE, AIAA, ASME), iterative
    #                 physical prototyping persistence, manufacturing shop hours,
    #                 handling design failures and iterating to solutions
    # Build (ME/AE) = CAD portfolio (SolidWorks/CATIA/NX designs), manufactured
    #                 prototypes and physical builds, SAE/FSAE/AIAA competition
    #                 results, FE exam passage, co-op at recognized manufacturer,
    #                 lab reports and documented experimental results
    "mechanical_aerospace_engineering": {
        "label": "Mechanical & Aerospace Engineering",
        "smart": 33,
        "grit": 27,
        "build": 40,
        "recruiter_bar": 76,
        "reference_benchmark": "Boeing / SpaceX / Lockheed Martin new-grad bar",
        "reference_company": "Boeing",
        "gpa_screen": "3.0+ standard; 3.5+ for SpaceX/Blue Origin",
        "acceptance_rate": "<1% (SpaceX), ~3% (Boeing internships)",
        "smart_means": "Thermodynamics, fluid mechanics, structural analysis, FE-level theory, materials science, FEA/CFD understanding, statics/dynamics/machine design",
        "grit_means": "Senior capstone multi-semester dedication, SAE/AIAA/ASME competition commitment, iterative prototyping persistence, manufacturing shop hours",
        "build_means": "CAD portfolio (SolidWorks/CATIA/NX), manufactured prototypes, FSAE/AIAA competition results, FE exam passage, co-op at recognized manufacturer",
        "key_proof_points": [
            "Senior design project with tangible manufactured deliverable",
            "SAE/FSAE, AIAA, or ASME competition team experience",
            "CAD proficiency (SolidWorks/CATIA/NX) — non-negotiable",
            "FE exam passage or preparation (before graduation)",
            "Co-op or internship at recognized manufacturer/aerospace company",
        ],
        "certifications": ["FE (Fundamentals of Engineering)", "SolidWorks CSWA/CSWP"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 12. Electrical & Computer Engineering
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Intel, NVIDIA, Qualcomm, Apple hardware/firmware.
    # NVIDIA acceptance <2% for hardware roles. GPA screen at 3.2+
    # for most semiconductor companies. Build-heavy (similar to SWE)
    # because hardware portfolio (PCB, FPGA, embedded) is the proof.
    # Smart reflects deep circuit and systems theory mastery.
    #
    # Smart (ECE)  = Circuit theory, signal processing, digital design,
    #                embedded systems theory, computer architecture, VLSI
    #                fundamentals, electromagnetics, GPA in technical courses,
    #                advanced math (diff eq, linear algebra) mastery
    # Grit  (ECE)  = Hardware debugging persistence (hours tracing signals),
    #                lab report rigor, staying current with hardware trends
    #                (silicon, RISC-V, neuromorphic), long-haul research
    # Build (ECE)  = PCB designs (Altium, KiCad) with proven function,
    #                FPGA implementations and HDL code portfolio, embedded
    #                systems projects with real hardware, IEEE/robotics club
    #                leadership, certifications (LabVIEW), industry internship
    "electrical_computer_engineering": {
        "label": "Electrical & Computer Engineering",
        "smart": 35,
        "grit": 20,
        "build": 45,
        "recruiter_bar": 78,
        "reference_benchmark": "Intel / NVIDIA / Qualcomm hardware engineering bar",
        "reference_company": "NVIDIA",
        "gpa_screen": "3.2+ (semiconductor companies screen rigorously)",
        "acceptance_rate": "<2% (NVIDIA), ~3% (Intel internships)",
        "smart_means": "Circuit theory, signal processing, digital design, embedded systems theory, computer architecture, VLSI, GPA in technical courses",
        "grit_means": "Hardware debugging persistence, lab report rigor, staying current with hardware trends, long-haul research and iteration",
        "build_means": "PCB designs (Altium/KiCad), FPGA/HDL implementations, embedded systems projects with real hardware, IEEE/robotics club leadership",
        "key_proof_points": [
            "PCB design (Altium or KiCad) with functional demonstration",
            "FPGA or embedded systems project with real hardware",
            "GPA 3.2+ in technical courses",
            "IEEE student branch or robotics club involvement",
            "Hardware internship at semiconductor/systems company",
        ],
        "certifications": ["FE (Fundamentals of Engineering)", "LabVIEW Associate Developer", "Altium Designer Cert"],
        "competition_level": "very_high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 13. Design & Creative Arts
    # ─────────────────────────────────────────────────────────────────────
    # Reference: IDEO, Figma Design, Apple HIG team, top ad agencies.
    # MOST build-heavy cohort — portfolio is 100% of the hiring decision.
    # GPA doesn't exist in the conversation. Smart captures design
    # theory (not IQ). Grit is the relentless iteration mindset.
    # A student who has done 100 portfolio revisions and published 6
    # case studies beats a design student with a 4.0 every time.
    #
    # Smart (Design) = Design theory (typography, color theory, grid systems),
    #                  UX research methodology (user interviews, usability
    #                  testing, affinity mapping), visual communication
    #                  principles, design history and precedent awareness,
    #                  information architecture and interaction design theory
    # Grit  (Design) = Willingness to iterate a design 50-100 times,
    #                  client and user feedback incorporation without ego,
    #                  sustained portfolio development over years, creative
    #                  block resilience, self-critique rigor and improvement
    # Build (Design) = Portfolio case studies (4-6 minimum, process-driven),
    #                  Figma/Sketch/Adobe CC proficiency demonstrated in work,
    #                  Dribbble/Behance presence with quality pieces, shipped
    #                  products/interfaces used by real people, design
    #                  competition wins or recognized publications, freelance
    "design_creative_arts": {
        "label": "Design & Creative Arts",
        "smart": 12,
        "grit": 23,
        "build": 65,
        "recruiter_bar": 72,
        "reference_benchmark": "IDEO / Figma Design / Apple HIG junior designer bar",
        "reference_company": "IDEO",
        "gpa_screen": None,
        "acceptance_rate": "~5–10% for top design programs/agencies",
        "smart_means": "Design theory (typography, color, grid), UX research methodology, visual communication principles, information architecture, interaction design theory",
        "grit_means": "Willingness to iterate 50-100 times, client/user feedback without ego, sustained portfolio building over years, self-critique rigor",
        "build_means": "Portfolio case studies (4-6, process-driven), Figma/Adobe CC mastery shown in work, Dribbble/Behance presence, shipped products, competition wins",
        "key_proof_points": [
            "Portfolio with 4-6 case studies showing PROCESS (not just final output)",
            "Figma or Adobe CC proficiency demonstrated in work (not just listed)",
            "User research and usability testing conducted and documented",
            "Shipped design used by real users (app, site, product)",
            "Dribbble/Behance portfolio with quality and consistency",
        ],
        "certifications": ["Google UX Design Certificate", "Nielsen Norman Group UX Cert"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 14. Education & Human Development
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Teach For America, top school districts, ed-tech companies.
    # Grit-dominant because teaching demands sustained human dedication —
    # classroom management, student relationship-building, and curriculum
    # iteration require emotional resilience. Build is documented hours and
    # certifications. Smart is pedagogical theory, not academic GPA.
    #
    # Smart (Edu)  = Pedagogical theory (Vygotsky, Bloom's taxonomy, UDL),
    #                child and adolescent development research, curriculum
    #                design principles, assessment literacy, educational
    #                psychology, learning management system proficiency
    # Grit  (Edu)  = Student teaching hours logged (450-600+ for licensure),
    #                classroom management persistence through difficult students,
    #                tutoring or mentoring consistency over semesters,
    #                emotional resilience with student crises
    # Build (Edu)  = State teaching certification (in progress or earned),
    #                curriculum materials created and used, documented student
    #                outcomes/impact, tutoring program built, Praxis exam
    #                scores, education internship or student teaching placement
    "education_human_development": {
        "label": "Education & Human Development",
        "smart": 22,
        "grit": 48,
        "build": 30,
        "recruiter_bar": 65,
        "reference_benchmark": "Teach For America / top school district hiring bar",
        "reference_company": "Teach For America",
        "gpa_screen": "2.5+ minimum for certification; 3.0+ competitive",
        "acceptance_rate": "~15–25% for TFA; varies by district/shortage area",
        "smart_means": "Pedagogical theory (Bloom's, UDL, constructivism), child development research, curriculum design, assessment literacy, educational psychology",
        "grit_means": "Student teaching hours (450-600+ for licensure), classroom management persistence, tutoring/mentoring consistency, emotional resilience",
        "build_means": "State teaching certification, curriculum materials created, documented student outcomes, tutoring/program built, Praxis scores, student teaching placement",
        "key_proof_points": [
            "450+ hours of student teaching or supervised classroom time",
            "State teaching certification (or enrolled in credentialing program)",
            "Tutoring or mentoring experience with documented impact",
            "Curriculum design or lesson plan portfolio",
            "Praxis exams passed or in preparation",
        ],
        "certifications": ["State Teaching License", "Praxis Core + Subject", "ESL/TESOL", "Special Education Endorsement"],
        "competition_level": "low",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 15. Social Sciences & Nonprofit
    # ─────────────────────────────────────────────────────────────────────
    # Reference: UNDP, Peace Corps, major US nonprofits (Gates Foundation,
    # United Way). Grit-dominant because nonprofit work is chronically
    # underfunded and demands sustained commitment without financial
    # incentive. Smart captures research and policy analysis skills.
    # Build is documented community impact and grant work.
    #
    # Smart (SS/NP) = Social science research methodology (qualitative +
    #                 quantitative), policy analysis frameworks, statistical
    #                 literacy for social research, sociological and
    #                 psychological theory, grant proposal writing quality,
    #                 cultural competency and community needs assessment
    # Grit  (SS/NP) = Grant writing persistence (most grants rejected),
    #                 community organizing long-haul commitment, advocacy
    #                 work in underfunded environments, volunteer leadership
    #                 sustained over multiple years, dealing with systemic
    #                 barriers without burnout
    # Build (SS/NP) = Community programs launched with documented impact,
    #                 grant dollars raised, research publications or policy
    #                 briefs, nonprofit internship or volunteer leadership,
    #                 AmeriCorps/Peace Corps service, conference presentations
    "social_sciences_nonprofit": {
        "label": "Social Sciences & Nonprofit",
        "smart": 25,
        "grit": 45,
        "build": 30,
        "recruiter_bar": 68,
        "reference_benchmark": "UNDP / Gates Foundation / United Way intern bar",
        "reference_company": "UNDP",
        "gpa_screen": "3.0+ preferred for competitive international orgs",
        "acceptance_rate": "~10–15% for top international organizations",
        "smart_means": "Research methodology (qual+quant), policy analysis, social science theory, statistical literacy, grant proposal writing, cultural competency",
        "grit_means": "Grant persistence (most rejected), community organizing multi-year commitment, advocacy in underfunded settings, volunteer leadership sustained over years",
        "build_means": "Community programs with documented impact, grant dollars raised, publications/policy briefs, nonprofit internship/leadership, AmeriCorps/Peace Corps",
        "key_proof_points": [
            "Community program or initiative led with documented impact",
            "Grant writing or fundraising experience",
            "Nonprofit or government internship",
            "Research paper or policy brief published/presented",
            "AmeriCorps, Peace Corps, or equivalent service",
        ],
        "certifications": ["AmeriCorps certification", "Peace Corps", "Nonprofit Management cert (CNM)"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 16. Media & Communications
    # ─────────────────────────────────────────────────────────────────────
    # Reference: New York Times, CNN, top PR agencies (Edelman).
    # Build-dominant: published bylines and portfolio are everything.
    # The NYT fellowship receives thousands of applications for 5-10
    # spots. Grit captures story pitching persistence and deadline
    # performance. Smart reflects storytelling craft and media literacy.
    #
    # Smart (Media) = Storytelling craft and narrative structure, media
    #                 theory and journalism ethics (AP style mastery),
    #                 audience analytics interpretation, communications
    #                 strategy, media law fundamentals, SEO for content,
    #                 data journalism literacy
    # Grit  (Media) = Story pitching persistence to editors (most rejected),
    #                 deadline performance under pressure, handling editorial
    #                 rejection and revision, interview hustle, long-form
    #                 investigative research over months
    # Build (Media) = Published articles/bylines at recognized outlets,
    #                 multimedia portfolio (video, audio, written, social),
    #                 broadcast/podcast production credits, social media
    #                 reach metrics, newsroom or PR internship, student
    #                 media leadership (editor/producer role)
    "media_communications": {
        "label": "Media & Communications",
        "smart": 18,
        "grit": 30,
        "build": 52,
        "recruiter_bar": 70,
        "reference_benchmark": "New York Times / CNN / Edelman early career bar",
        "reference_company": "New York Times",
        "gpa_screen": None,
        "acceptance_rate": "~3–5% for top masthead fellowships",
        "smart_means": "Storytelling craft, narrative structure, media theory, AP style mastery, audience analytics, communications strategy, data journalism literacy",
        "grit_means": "Story pitching persistence (most rejected), deadline performance, editorial rejection resilience, interview hustle, long-form investigative research",
        "build_means": "Published bylines at recognized outlets, multimedia portfolio (video/audio/written/social), broadcast/podcast credits, social media reach, student media leadership",
        "key_proof_points": [
            "Published bylines at student newspaper, local outlet, or recognized platform",
            "Multimedia portfolio (written + at least one of: video, audio, social)",
            "Student media leadership (editor, producer, or senior role)",
            "Journalism or PR internship at recognized organization",
            "Social media management with audience metrics documented",
        ],
        "certifications": ["Google News Initiative Training", "AP Style mastery (test)"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 17. Life Sciences & Research
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Pfizer, NIH, Genentech, major academic research labs.
    # Smart-dominant because research roles require deep scientific
    # foundation. Grit reflects lab research persistence (negative results
    # are the norm — a good researcher persists through them). Build is
    # publications, posters, and lab technique mastery.
    #
    # Smart (LS/R) = Molecular/cellular biology mastery, biochemistry,
    #                experimental design and controls, statistical analysis
    #                (SPSS, R, GraphPad), literature review depth,
    #                grant proposal structure, scientific writing quality
    # Grit  (LS/R) = Lab research persistence through failure (avg 70%+
    #                experiments fail), multi-semester research commitment,
    #                scientific writing revision cycles, conference
    #                preparation and abstract submission persistence
    # Build (LS/R) = Publications (first or co-author), conference posters
    #                or oral presentations, grants funded, lab techniques
    #                mastered and certified, industry or academic research
    #                internship, thesis/dissertation quality
    "life_sciences_research": {
        "label": "Life Sciences & Research",
        "smart": 45,
        "grit": 30,
        "build": 25,
        "recruiter_bar": 78,
        "reference_benchmark": "Pfizer R&D / NIH Research Fellowship bar",
        "reference_company": "Pfizer",
        "gpa_screen": "3.3+ typical for top biotech programs",
        "acceptance_rate": "~3–5% for Pfizer R&D, NIH IRTA",
        "smart_means": "Molecular/cellular biology mastery, biochemistry, experimental design, statistical analysis, literature review depth, scientific writing quality",
        "grit_means": "Lab research persistence through failure (70%+ experiments fail), multi-semester commitment, scientific writing revision cycles, conference prep",
        "build_means": "Publications (first/co-author), conference posters/presentations, grants funded, lab techniques certified, research internship, thesis quality",
        "key_proof_points": [
            "0-2 years wet lab research experience minimum",
            "Publications, conference posters, or research presentations",
            "REU, NIH fellowship, or faculty-mentored research",
            "Core lab techniques mastered (PCR, Western blot, cell culture)",
            "GPA 3.3+ in science courses",
        ],
        "certifications": ["BSL-2 Safety", "IACUC Certification", "GLP Training"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 18. Economics & Public Policy
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Federal Reserve Research Assistant, Brookings Research
    # Assistant, World Bank YPP. Fed RA is a 2-year program; most go to
    # top PhD programs after. Smart-dominant because econometrics and
    # quantitative research are the primary screens. Build reflects
    # research output quality.
    #
    # Smart (Econ) = Econometrics (OLS, IV, DID, RDD), macro/micro theory
    #                depth, Stata/R/Python proficiency, research design,
    #                mathematical economics (real analysis, linear algebra),
    #                GPA in economics and math courses, policy analysis
    # Grit  (Econ) = Thesis research multi-year dedication, policy paper
    #                revision cycles, think tank application persistence,
    #                econ competition preparation, long-form research
    #                project follow-through
    # Build (Econ) = Independent research/thesis published or circulated,
    #                econometric models with documented results, policy
    #                briefs written and distributed, think tank or
    #                government internship, econ competition performance
    "economics_public_policy": {
        "label": "Economics & Public Policy",
        "smart": 42,
        "grit": 28,
        "build": 30,
        "recruiter_bar": 80,
        "reference_benchmark": "Federal Reserve RA / Brookings RA bar",
        "reference_company": "Federal Reserve",
        "gpa_screen": "3.5+ expected; strong quant coursework required",
        "acceptance_rate": "~3–5% (Fed RA), ~5–8% (Brookings RA)",
        "smart_means": "Econometrics (OLS/IV/DID), macro/micro theory, Stata/R/Python, mathematical economics, research design, GPA in econ and math, policy analysis",
        "grit_means": "Thesis research multi-year dedication, policy paper revision cycles, think tank persistence, econ competition preparation, long-form research",
        "build_means": "Research/thesis published/circulated, econometric models with results, policy briefs, think tank or government internship, econ competition placement",
        "key_proof_points": [
            "Econometrics coursework (OLS, IV, panel data) with demonstrated proficiency",
            "Stata, R, or Python for economic analysis",
            "Independent research paper, thesis, or policy brief",
            "Government or think tank internship",
            "Economics competition participation",
        ],
        "certifications": [],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 19. Entrepreneurship & Innovation
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Y Combinator startup hiring, Techstars portfolio
    # companies. GPA is 100% irrelevant. Startups want proof that you've
    # shipped something real and handled failure. Grit is the resilience
    # to keep going when everything is uncertain. Build is the portfolio
    # of what you've actually launched.
    #
    # Smart (Entro) = Business model thinking, product sense, market sizing
    #                 and validation skills, lean startup methodology, basic
    #                 financial literacy (unit economics, CAC, LTV), customer
    #                 discovery and interview technique
    # Grit  (Entro) = Startup resilience (built something despite no money/
    #                 team/resources), customer discovery persistence,
    #                 fundraising rejection handling, willingness to pivot,
    #                 24/7 ownership mentality, community building
    # Build (Entro) = Companies or products launched (even small), revenue
    #                 generated or users acquired, pitch competition wins,
    #                 press or recognition, hackathon projects shipped to
    #                 production, funding raised (even small angel round)
    "entrepreneurship_innovation": {
        "label": "Entrepreneurship & Innovation",
        "smart": 15,
        "grit": 42,
        "build": 43,
        "recruiter_bar": 70,
        "reference_benchmark": "Y Combinator / Techstars startup team hiring bar",
        "reference_company": "Y Combinator (portfolio)",
        "gpa_screen": None,
        "acceptance_rate": "~2–3% (YC acceptance); startup jobs vary widely",
        "smart_means": "Business model thinking, product sense, market sizing, lean methodology, unit economics (CAC/LTV), customer discovery interview technique",
        "grit_means": "Startup resilience, customer discovery persistence, fundraising rejection handling, willingness to pivot, 24/7 ownership, community building",
        "build_means": "Companies/products launched (even small), revenue/users acquired, pitch competition wins, press/recognition, hackathon shipped to production, funding raised",
        "key_proof_points": [
            "Product or business launched (even if failed — show what you learned)",
            "Revenue generated OR users acquired with documented numbers",
            "Pitch competition participation or win",
            "Hackathon project shipped to production (deployed, not just demoed)",
            "Customer discovery — 20+ user interviews conducted",
        ],
        "certifications": [],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 20. Physical Sciences & Math
    # ─────────────────────────────────────────────────────────────────────
    # Reference: National labs (LLNL, PNNL, Argonne, Brookhaven, Sandia).
    # Most Smart-heavy cohort of all 22 because theoretical depth and
    # mathematical rigor are THE gate. Advanced degrees strongly preferred.
    # Grit captures competition math dedication. Build is research output.
    #
    # Smart (PS/M)  = Mathematical proof-writing ability, abstract algebra/
    #                 real analysis/topology, theoretical physics depth,
    #                 computational methods (Python, MATLAB, Fortran/Julia),
    #                 research methodology, GPA in proof-based courses,
    #                 competition math performance (Putnam, USAMO, IMO)
    # Grit  (PS/M)  = Problem set persistence (math is notoriously hard),
    #                 competition math training over years, long research
    #                 cycles with delayed gratification, PhD-track discipline
    # Build (PS/M)  = Research papers (even pre-prints), Putnam/USAMO/AMC
    #                 competition wins, computational physics/math projects,
    #                 NSF REU or national lab internship, thesis quality
    "physical_sciences_math": {
        "label": "Physical Sciences & Math",
        "smart": 52,
        "grit": 25,
        "build": 23,
        "recruiter_bar": 80,
        "reference_benchmark": "National lab (LLNL/PNNL/Argonne) entry-level researcher bar",
        "reference_company": "Lawrence Livermore National Laboratory",
        "gpa_screen": "3.5+ strongly preferred for national labs",
        "acceptance_rate": "~5–10% for national lab positions",
        "smart_means": "Mathematical proof-writing, abstract algebra/real analysis, theoretical physics depth, computational methods (Python/MATLAB), research methodology",
        "grit_means": "Problem set persistence in proof-based courses, competition math training over years, long research cycles with delayed gratification",
        "build_means": "Research papers (even pre-prints), Putnam/USAMO/AMC wins, computational physics/math projects, NSF REU or national lab internship",
        "key_proof_points": [
            "Advanced coursework in proof-based mathematics (real analysis, algebra, topology)",
            "Research paper, thesis, or technical report",
            "NSF REU or national laboratory internship",
            "Math competition achievement (Putnam, USAMO, AMC)",
            "Computational modeling project (Python/MATLAB/Julia)",
        ],
        "certifications": [],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 21. Chemical & Biomedical Engineering
    # ─────────────────────────────────────────────────────────────────────
    # Reference: Pfizer, J&J, Medtronic, Dow Chemical, ExxonMobil.
    # Pfizer R&D acceptance <3%. GPA screen at 3.2+ for pharma/biotech.
    # Smart reflects rigorous ChE/BME fundamentals. Build is lab-and-
    # simulation proof. Co-ops are almost expected (Dow, ExxonMobil).
    #
    # Smart (ChE/BME) = Thermodynamics, transport phenomena, reaction kinetics,
    #                   biomaterials and tissue engineering (BME track),
    #                   process design and simulation (Aspen, COMSOL),
    #                   FDA regulatory pathway knowledge (BME), GPA in
    #                   core ChE/BME courses (3.2+ screen), ABET fundamentals
    # Grit  (ChE/BME) = Lab experiment iteration through repeated failures,
    #                   senior design multi-semester commitment, complex
    #                   problem set persistence, co-op dedication and
    #                   professional development during work terms
    # Build (ChE/BME) = Lab protocols mastered (analytical chemistry,
    #                   bioprocessing, GMP), process simulation projects
    #                   (Aspen Plus, COMSOL), research publications or posters,
    #                   co-op at recognized chemical/pharma/biotech company,
    #                   medical device prototype or FE passage
    "chemical_biomedical_engineering": {
        "label": "Chemical & Biomedical Engineering",
        "smart": 40,
        "grit": 25,
        "build": 35,
        "recruiter_bar": 78,
        "reference_benchmark": "Pfizer R&D / Medtronic / Dow Chemical entry-level bar",
        "reference_company": "Pfizer",
        "gpa_screen": "3.2+ (pharma/biotech screen rigorously)",
        "acceptance_rate": "<3% (Pfizer R&D), ~5% (major pharma internships)",
        "smart_means": "Thermodynamics, transport phenomena, reaction kinetics, biomaterials (BME), process simulation (Aspen/COMSOL), FDA regulatory (BME), GPA in core courses",
        "grit_means": "Lab experiment iteration through failures, senior design multi-semester commitment, complex problem set persistence, co-op professional development",
        "build_means": "Lab protocols mastered, process simulation projects (Aspen/COMSOL), publications/posters, co-op at pharma/biotech company, FE passage",
        "key_proof_points": [
            "GPA 3.2+ in ChE/BME core courses",
            "Process simulation project (Aspen Plus or COMSOL)",
            "Co-op or internship at recognized chemical/pharma/biotech company",
            "Lab research experience with documented techniques",
            "FE exam passage or preparation (before graduation)",
        ],
        "certifications": ["FE (Fundamentals of Engineering)", "Six Sigma Green Belt", "GMP Training"],
        "competition_level": "high",
    },

    # ─────────────────────────────────────────────────────────────────────
    # 22. Civil & Environmental Engineering
    # ─────────────────────────────────────────────────────────────────────
    # Reference: AECOM, Bechtel, Jacobs, Fluor. PE licensure path is
    # the career backbone. AECOM hires ~2K interns globally. More stable
    # hiring than other engineering fields. FE exam passage expected
    # before graduation at competitive firms. Field experience matters.
    #
    # Smart (CE/EE) = Structural analysis, geotechnical engineering,
    #                 hydraulics and fluid mechanics, surveying and
    #                 mapping, environmental regulations (Clean Water Act,
    #                 NEPA), AutoCAD Civil 3D and GIS proficiency,
    #                 construction materials knowledge, GPA 3.0+
    # Grit  (CE/EE) = Field work dedication (site observation, surveying),
    #                 long multi-year infrastructure project timelines,
    #                 regulatory approval patience, construction site
    #                 conditions and physical demands, ASCE chapter
    # Build (CE/EE) = AutoCAD Civil 3D / Revit / GIS design portfolio,
    #                 senior capstone with real client or municipality,
    #                 field experience documented (hours, projects),
    #                 FE exam passage, ASCE student chapter leadership,
    #                 sustainability or green infrastructure project
    "civil_environmental_engineering": {
        "label": "Civil & Environmental Engineering",
        "smart": 32,
        "grit": 30,
        "build": 38,
        "recruiter_bar": 72,
        "reference_benchmark": "AECOM / Bechtel / Jacobs entry-level bar",
        "reference_company": "AECOM",
        "gpa_screen": "3.0+ (standard across major firms)",
        "acceptance_rate": "~5–8% (top firms), moderate overall",
        "smart_means": "Structural analysis, geotechnical engineering, hydraulics, environmental regulations, AutoCAD Civil 3D and GIS proficiency, construction materials, GPA 3.0+",
        "grit_means": "Field work dedication, long infrastructure project timelines, regulatory patience, construction site work, ASCE chapter involvement",
        "build_means": "AutoCAD Civil 3D/Revit/GIS portfolio, senior capstone with real client, field experience hours documented, FE passage, ASCE leadership",
        "key_proof_points": [
            "FE exam passage (strongly expected before graduation at top firms)",
            "AutoCAD Civil 3D, Revit, or GIS proficiency demonstrated",
            "Senior capstone project with real client or municipality",
            "Field experience (surveying, site observation, construction)",
            "ASCE student chapter leadership or competition",
        ],
        "certifications": ["FE (Fundamentals of Engineering)", "LEED Green Associate", "GIS Certificate"],
        "competition_level": "moderate",
    },

    # ─────────────────────────────────────────────────────────────────────
    # LEGACY KEYS — kept for backward compatibility with old references
    # These map to the same data as the active cohorts above.
    # cohort_config.py uses the `label` field as the key in COHORT_SCORING_CONFIG,
    # so duplicate labels are deduplicated automatically.
    # ─────────────────────────────────────────────────────────────────────
    "design_creative": {
        "label": "Design & Creative Arts",  # Redirect to canonical label
        "smart": 12, "grit": 23, "build": 65,
        "recruiter_bar": 72,
        "reference_benchmark": "IDEO / top design agency junior designer bar",
        "reference_company": "IDEO",
        "gpa_screen": None, "acceptance_rate": "~5–10%",
        "competition_level": "high",
    },
    "legal_compliance": {
        "label": "Law & Government",  # Redirect to canonical label
        "smart": 45, "grit": 30, "build": 25,
        "recruiter_bar": 82,
        "reference_benchmark": "T14 law / BigLaw SA / DOJ Honors bar",
        "reference_company": "Skadden, Arps",
        "gpa_screen": "3.5+", "acceptance_rate": "~5–10%",
        "competition_level": "very_high",
    },
    "education_teaching": {
        "label": "Education & Human Development",  # Redirect to canonical label
        "smart": 22, "grit": 48, "build": 30,
        "recruiter_bar": 65,
        "reference_benchmark": "TFA / top school district bar",
        "reference_company": "Teach For America",
        "gpa_screen": "2.5+", "acceptance_rate": "~15–25%",
        "competition_level": "low",
    },
}
