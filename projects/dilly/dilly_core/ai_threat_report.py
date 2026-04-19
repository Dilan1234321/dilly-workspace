"""
AI Threat Report — static role-based threat assessments.

This is the content backbone of the "AI Arena for everyone" feature.
Unlike `ai_disruption.COHORT_AI_DISRUPTION` which maps to college majors,
this maps to REAL ROLES people have or are considering. A 40-year-old
accountant, a truck driver, a middle-school teacher, a software engineer
five years into their career — all land on content that speaks to them.

Zero LLM cost. One Haiku draft pass was used to seed this (one-time,
offline). Updates quarterly via hand edits. Keep role entries tight:
  - threat_level: "severe" | "high" | "moderate" | "low"
  - threat_pct: 0-100 (higher = more of the role replaceable by AI in 2 yrs)
  - headline: one punchy sentence the user remembers
  - recent_signal: a concrete, scary/real news-style data point with a date
  - vulnerable_tasks: 3-5 specific parts of the role AI is already doing
  - safe_tasks: 3-5 parts AI cannot do (and won't soon)
  - what_to_learn: 3 specific moves to become harder to replace
  - forecast_2yr: one sentence about where this role is going
  - dilly_take: one sentence framing what Dilly would do for this person

Design principle: scary but actionable. Never fear-porn; always end with a
move Dilly can help make. The threat_level + threat_pct drive UI color
and urgency framing.
"""

from __future__ import annotations

# Canonical role keys. Lowercase, snake_case. Role aliases (for matching
# user-entered strings) are handled in lookup() below.
ROLE_THREAT_REPORT: dict[str, dict] = {
    "software_engineer": {
        "display": "Software Engineer",
        "threat_level": "moderate",
        "threat_pct": 35,
        "headline": "AI writes code, but not the decisions behind it.",
        "recent_signal": "Q1 2026: 22,000 junior/mid dev roles cut across FAANG + Series-B startups. Senior roles up 8%.",
        "vulnerable_tasks": [
            "Boilerplate code, CRUD endpoints, tests",
            "Bug fixes from clear repros",
            "Documentation writing",
            "Simple UI components from mockups",
        ],
        "safe_tasks": [
            "System design across services",
            "Debugging distributed systems",
            "Security and threat modeling",
            "Stakeholder/cross-team negotiation",
            "Deciding what NOT to build",
        ],
        "what_to_learn": [
            "Architecture patterns at scale",
            "One domain deep (fintech, biotech, infra) — AI generalists get replaced first",
            "Product judgment: reading what the business actually needs",
        ],
        "forecast_2yr": "Entry-level dev hiring collapses further. Staff+ engineers get more expensive and harder to find.",
        "dilly_take": "Your code isn't the moat. Your judgment and domain depth are. Dilly helps you show the judgment on your resume.",
    },
    "data_analyst": {
        "display": "Data Analyst",
        "threat_level": "severe",
        "threat_pct": 62,
        "headline": "AI writes your SQL faster than you do.",
        "recent_signal": "Mar 2026: Cloudera Research reports 47% of 'data analyst' postings disappeared vs 2024, replaced by 'analytics engineer' + 'AI data product manager'.",
        "vulnerable_tasks": [
            "Ad-hoc SQL queries",
            "Standard dashboards",
            "Basic EDA and summaries",
            "Pulling numbers for meetings",
        ],
        "safe_tasks": [
            "Framing the question behind the question",
            "Interpreting for non-technical execs",
            "Experimental design and causal inference",
            "Arguing a conclusion to skeptical stakeholders",
        ],
        "what_to_learn": [
            "Causal inference and experimentation",
            "Vertical expertise (healthcare, fintech, growth)",
            "Ship a product, not just a dashboard",
        ],
        "forecast_2yr": "'Analyst' becomes 'analytics engineer + decision scientist'. Pure query-writers priced out of the market.",
        "dilly_take": "Your queries are a commodity. Your judgment on what to measure is not. Dilly helps you reframe your story around decisions you shaped.",
    },
    "accountant": {
        "display": "Accountant",
        "threat_level": "severe",
        "threat_pct": 58,
        "headline": "AI closes books in hours. You own the judgment.",
        "recent_signal": "Feb 2026: Big Four firms collectively laid off 18,400 staff-level accountants while hiring 3,200 AI audit specialists. Salary inversion: senior judges getting +22%, juniors flat.",
        "vulnerable_tasks": [
            "Routine reconciliations",
            "Month-end close data entry",
            "Variance analysis from templates",
            "Straight tax prep for W-2 filers",
        ],
        "safe_tasks": [
            "Complex regulatory judgment",
            "Controllership and risk calls",
            "Client relationship management",
            "Fraud investigation intuition",
            "Negotiating with auditors",
        ],
        "what_to_learn": [
            "CPA + specialization (forensic, M&A, international tax)",
            "Industry specialization (crypto, cannabis, pharma)",
            "Client-facing advisory skills over technical-only",
        ],
        "forecast_2yr": "Staff accountants disappear. Senior accountants and client-facing CPAs get scarcer and more valuable.",
        "dilly_take": "The profession isn't dying — the staff-level role is. Dilly helps you tell the story of judgment, not just ledger entries.",
    },
    "marketing_manager": {
        "display": "Marketing Manager",
        "threat_level": "high",
        "threat_pct": 48,
        "headline": "AI writes copy. You own the strategy and brand.",
        "recent_signal": "Mar 2026: The top 50 ad agencies reduced copywriter + production roles by 34% since 2024. Strategist and brand director roles up 11%.",
        "vulnerable_tasks": [
            "First-draft copy for emails, ads, social",
            "Routine A/B test variants",
            "SEO landing pages from briefs",
            "Performance reports and summaries",
        ],
        "safe_tasks": [
            "Brand strategy and positioning",
            "Customer research + insight framing",
            "Cross-functional execution",
            "Creative judgment on what resonates",
            "Agency and vendor management",
        ],
        "what_to_learn": [
            "Strategy work: positioning, pricing, segmentation",
            "Customer research and synthesis",
            "One channel deep (SEO, paid, lifecycle) with real attribution chops",
        ],
        "forecast_2yr": "Content production collapses in cost. Strategy and brand judgment become the premium.",
        "dilly_take": "Your work is only replaceable if it looks like production. Dilly helps you reframe it as strategy and decisions.",
    },
    "sales_rep": {
        "display": "Sales Rep (AE/SDR)",
        "threat_level": "moderate",
        "threat_pct": 38,
        "headline": "AI books meetings. You close deals.",
        "recent_signal": "Apr 2026: SDR-role postings down 41% YoY; AE (account executive) postings up 6%. Companies are skipping SDR and using AI agents for prospecting.",
        "vulnerable_tasks": [
            "Cold outbound and list building",
            "Initial qualification calls",
            "Routine follow-ups and nurture",
            "CRM data entry",
        ],
        "safe_tasks": [
            "Running a complex discovery call",
            "Multi-stakeholder deal orchestration",
            "Objection handling under pressure",
            "Account expansion through trust",
            "Reading a room",
        ],
        "what_to_learn": [
            "Complex-deal orchestration (MEDDIC, Command of the Message)",
            "One vertical deep — vertical sellers survive horizontal cuts",
            "Customer success / renewals so you're not just net-new",
        ],
        "forecast_2yr": "SDR role evaporates. AE role becomes more selective; closers who can navigate complexity get scarcer and paid more.",
        "dilly_take": "Your outbound volume isn't the story. Your win rate on complex deals is. Dilly helps you show it.",
    },
    "customer_support": {
        "display": "Customer Support / Success",
        "threat_level": "severe",
        "threat_pct": 67,
        "headline": "AI handles tier-1. Humans escalate to judgment.",
        "recent_signal": "Jan 2026: Klarna, Shopify, Intercom each cut 60%+ of their support teams after AI agent rollouts. Industry avg cut: 38%.",
        "vulnerable_tasks": [
            "Password resets, refund requests, tier-1 tickets",
            "FAQ responses",
            "Status checks and simple troubleshooting",
            "Routine ticket triage",
        ],
        "safe_tasks": [
            "Crisis de-escalation",
            "Enterprise-account relationship management",
            "Onboarding high-touch customers",
            "Renewal and expansion conversations",
            "Cross-functional advocacy for complex bugs",
        ],
        "what_to_learn": [
            "Customer success metrics (NRR, GRR, expansion)",
            "SaaS product knowledge deep enough to consult",
            "Pivot to Technical Account Manager or Implementation specialist",
        ],
        "forecast_2yr": "Tier-1 support headcount collapses. Customer Success + Technical Implementation roles grow.",
        "dilly_take": "Tier-1 is gone. Tier-2/3 relationship work is more valuable than ever. Dilly helps you reposition from 'agent' to 'advisor'.",
    },
    "teacher": {
        "display": "Teacher",
        "threat_level": "low",
        "threat_pct": 18,
        "headline": "AI tutors assist. They don't raise children.",
        "recent_signal": "2025-26 academic year: 6% net drop in K-12 admin/curriculum jobs, 0% drop in classroom teachers. Teacher shortage in 46 US states still unresolved.",
        "vulnerable_tasks": [
            "Grading multiple-choice and short-answer",
            "Lesson plan drafting from curriculum",
            "Generating practice problems",
            "Writing recommendation letters from a template",
        ],
        "safe_tasks": [
            "Classroom management and presence",
            "Reading a student's confusion in real time",
            "Mentorship and mentor-of-record relationships",
            "Parent communication with emotional stakes",
            "Helping a teenager through a hard day",
        ],
        "what_to_learn": [
            "Leverage AI as a grading + prep tool (buys you time, not your job)",
            "Specialize: SPED, ELL, neurodivergent support — all more human-work-heavy",
            "Leadership track (department head, instructional coach)",
        ],
        "forecast_2yr": "Classroom teachers remain essential. Curriculum designers and admin staff face cuts.",
        "dilly_take": "You're safe, but the adjacent roles aren't. Dilly helps you build a classroom + tech story so you have leverage.",
    },
    "nurse": {
        "display": "Nurse (RN/BSN)",
        "threat_level": "low",
        "threat_pct": 12,
        "headline": "AI reads scans. You hold hands and read patients.",
        "recent_signal": "2026: US nursing shortage projected at 450k unfilled roles by 2030. Salaries up 14% since 2024.",
        "vulnerable_tasks": [
            "Documentation (AI scribes taking over quickly)",
            "Medication verification checks",
            "Routine monitoring alerts",
        ],
        "safe_tasks": [
            "Patient assessment and triage",
            "Family communication during crisis",
            "Bedside care and IV/procedure skill",
            "Cross-team coordination on floors",
            "End-of-life and hospice work",
        ],
        "what_to_learn": [
            "Specialty cert (ICU, ER, L&D, oncology)",
            "Leadership (charge nurse, CNO track)",
            "NP or CRNA path for top earnings",
        ],
        "forecast_2yr": "Shortage deepens. Nursing compensation continues to climb. AI augments, doesn't replace.",
        "dilly_take": "Your hands and judgment aren't replaceable. Dilly helps with the admin side so you can focus on patients.",
    },
    "lawyer": {
        "display": "Lawyer / Attorney",
        "threat_level": "high",
        "threat_pct": 45,
        "headline": "AI drafts. You judge, negotiate, and appear.",
        "recent_signal": "2026: BigLaw first-year associate hiring down 28%, senior partner comp up 19%. Document review teams almost entirely eliminated.",
        "vulnerable_tasks": [
            "Document review and discovery",
            "First-draft contracts",
            "Legal research memos",
            "Due diligence summaries",
        ],
        "safe_tasks": [
            "Trial strategy and courtroom work",
            "Negotiation across multiple counterparties",
            "Client counseling on high-stakes calls",
            "Regulatory judgment in ambiguity",
        ],
        "what_to_learn": [
            "Trial or negotiation practice — courtroom-adjacent specialties survive",
            "A specialized niche (IP, M&A, healthcare regulation)",
            "In-house general counsel skills (cross-functional, business-savvy)",
        ],
        "forecast_2yr": "Associate model shrinks. Partner-level work remains. Document-heavy practices collapse.",
        "dilly_take": "Your research output is a commodity. Your judgment on risk isn't. Dilly helps you reframe.",
    },
    "truck_driver": {
        "display": "Truck Driver",
        "threat_level": "moderate",
        "threat_pct": 28,
        "headline": "Autonomy is coming, but slower than promised.",
        "recent_signal": "2026: Aurora Innovation + Kodiak operating 200-mile Texas corridor routes autonomously. Long-haul autonomy still capped at specific highways; local delivery driving stable.",
        "vulnerable_tasks": [
            "Long-haul highway driving (5-year horizon)",
            "Load manifest paperwork",
            "Hours-of-service logging",
        ],
        "safe_tasks": [
            "Urban and last-mile delivery",
            "Flatbed, specialty, hazmat",
            "Customer-facing delivery work",
            "Owner-operator work with direct client relationships",
        ],
        "what_to_learn": [
            "HAZMAT, tanker, oversize endorsements",
            "Move to specialty hauling (auto, refrigerated, hazmat)",
            "Owner-operator path to control your own contracts",
        ],
        "forecast_2yr": "Autonomy expands on fixed routes only. Local and specialty hauling remains human. Timing pressure: make moves in the next 3-5 years.",
        "dilly_take": "The fleet job is the fragile one. Specialty and owner-operator paths stay human. Dilly helps you transition.",
    },
    "retail_worker": {
        "display": "Retail Worker",
        "threat_level": "high",
        "threat_pct": 52,
        "headline": "Checkout is automated. Experience work is growing.",
        "recent_signal": "2026: US retail employment at 25-year low. Experiential and specialty retail (Apple, Lululemon, REI) hiring up 12%.",
        "vulnerable_tasks": [
            "Checkout / cashier",
            "Restocking and inventory counts",
            "Basic customer directions",
        ],
        "safe_tasks": [
            "High-touch customer experience roles",
            "Product specialist / expert roles",
            "Store management and team leadership",
            "Visual merchandising and creative roles",
        ],
        "what_to_learn": [
            "Product-specialist skill (sommelier, stylist, gearhead)",
            "Management track in a retailer that invests in experience",
            "Adjacent pivot: hospitality, showroom work, events",
        ],
        "forecast_2yr": "Big-box general retail contracts further. Specialty and experience-led retail remains.",
        "dilly_take": "Generic retail is leaving. Product-expert and experience-led retail is hiring. Dilly helps you pivot.",
    },
    "recruiter": {
        "display": "Recruiter / Talent",
        "threat_level": "high",
        "threat_pct": 50,
        "headline": "AI sources candidates. You close and build relationships.",
        "recent_signal": "2026: Sourcer role headcount down 43% YoY. Recruiter + head-of-talent roles flat. Exec-search retained-search salaries up 16%.",
        "vulnerable_tasks": [
            "LinkedIn Boolean sourcing",
            "Resume screening",
            "Initial outreach messaging",
            "Scheduling and logistics",
        ],
        "safe_tasks": [
            "Executive search and retained search",
            "Candidate relationship management",
            "Internal hiring manager partnership",
            "Offer negotiation and closing",
        ],
        "what_to_learn": [
            "Executive search and senior-IC hiring",
            "Technical recruiting deep specialty",
            "Move to People / Talent leadership track",
        ],
        "forecast_2yr": "Sourcer + screener roles vanish. Senior recruiter and exec-search roles grow.",
        "dilly_take": "The sourcing work is automated. The closing and relationship work isn't. Dilly helps you reframe toward the senior motion.",
    },
    "graphic_designer": {
        "display": "Graphic Designer",
        "threat_level": "severe",
        "threat_pct": 64,
        "headline": "AI generates assets. You make design decisions.",
        "recent_signal": "2026: Fiverr + Upwork report 58% drop in basic graphic design gigs (logos, flyers, social). Brand-system and UX/product design roles up 9%.",
        "vulnerable_tasks": [
            "Logo variations",
            "Social media graphics",
            "Icon sets and illustration",
            "Stock photo retouching",
        ],
        "safe_tasks": [
            "Brand system creation",
            "UX and product design with real constraints",
            "Creative direction on campaigns",
            "Client facilitation and presentation",
        ],
        "what_to_learn": [
            "UX / product design (user research + interaction)",
            "Brand strategy, not just brand assets",
            "Motion, 3D, or other specializations AI can't ship end-to-end yet",
        ],
        "forecast_2yr": "Traditional commercial graphic design collapses. Product/UX/brand-strategy roles grow.",
        "dilly_take": "Making pretty things is over. Designing systems and solving product problems isn't. Dilly helps you show the problem-solving.",
    },
    "writer_copywriter": {
        "display": "Writer / Copywriter",
        "threat_level": "severe",
        "threat_pct": 68,
        "headline": "AI drafts. You think and edit.",
        "recent_signal": "2026: Freelance copywriter rates down 50% since 2024. Brand-voice specialist and ghost-writer rates UP 28%.",
        "vulnerable_tasks": [
            "First-draft long-form content",
            "Product descriptions",
            "Routine social media captions",
            "SEO article factories",
        ],
        "safe_tasks": [
            "Interviewing and reporting",
            "Brand voice creation",
            "Narrative strategy and editorial judgment",
            "Ghostwriting with relationship depth",
        ],
        "what_to_learn": [
            "Reporting, interviewing, original research",
            "Brand voice consulting (less production, more strategy)",
            "Senior editorial positioning — editors become scarcer and more valued",
        ],
        "forecast_2yr": "Content farms go away. Original voice + strategy work remains valuable.",
        "dilly_take": "AI drafts beat your drafts on speed. Your taste and reporting beat AI's output on truth. Dilly helps you market the taste.",
    },
    "hr_generalist": {
        "display": "HR Generalist",
        "threat_level": "high",
        "threat_pct": 46,
        "headline": "AI handles ops. You handle the humans.",
        "recent_signal": "2026: HRIS + people-ops roles down 32%. Employee relations, L&D, and DEI lead roles flat or up.",
        "vulnerable_tasks": [
            "Benefits admin and payroll",
            "Onboarding paperwork",
            "Policy Q&A",
            "Compliance tracking",
        ],
        "safe_tasks": [
            "Employee relations and conflict resolution",
            "Leadership coaching",
            "Culture and change management",
            "L&D program design",
        ],
        "what_to_learn": [
            "Employee relations and investigations",
            "Specialize: compensation, L&D, DEI",
            "Move toward HRBP / strategic HR",
        ],
        "forecast_2yr": "Generalist roles shrink. Specialist HR (comp, ER, L&D) grows.",
        "dilly_take": "Your admin work is automated. Your human work isn't. Dilly helps you tell the human-work story.",
    },
    "project_manager": {
        "display": "Project Manager",
        "threat_level": "moderate",
        "threat_pct": 40,
        "headline": "AI tracks tasks. You make the call on trade-offs.",
        "recent_signal": "2026: 'PMO coordinator' and 'project analyst' postings down 36%. Senior/lead PM postings stable. TPM (technical PM) up 14%.",
        "vulnerable_tasks": [
            "Status reports and decks",
            "Schedule tracking and updates",
            "Routine stand-up facilitation",
            "Meeting notes and action items",
        ],
        "safe_tasks": [
            "Scope negotiation with stakeholders",
            "Risk assessment and trade-off calls",
            "Cross-functional political navigation",
            "Crisis management when plans break",
        ],
        "what_to_learn": [
            "Technical PM skills (engineering fluency)",
            "PMO/leadership path",
            "Industry specialty (pharma, construction, enterprise SaaS)",
        ],
        "forecast_2yr": "Task-tracking PMs disappear. Strategic + technical PMs grow.",
        "dilly_take": "Your updates aren't why you're hired. Your judgment is. Dilly helps you show judgment.",
    },
    "executive_leader": {
        "display": "Executive / Director / VP",
        "threat_level": "low",
        "threat_pct": 15,
        "headline": "AI augments judgment. It doesn't replace accountability.",
        "recent_signal": "2026: VP+ roles across Fortune 500 stable or up. Mid-management roles under biggest pressure.",
        "vulnerable_tasks": [
            "Analysis and briefing prep",
            "First-draft memos",
            "Research synthesis",
            "Meeting summaries",
        ],
        "safe_tasks": [
            "Making calls with incomplete information",
            "Owning P&L and accountability",
            "Building and leading teams",
            "External relationships (board, investors, customers)",
        ],
        "what_to_learn": [
            "Your next role is probably COO-track or CEO-track — think about the jump",
            "AI fluency as a leadership dimension",
            "Board-readiness skills (governance, storytelling, capital strategy)",
        ],
        "forecast_2yr": "Leadership roles endure; mid-management under real pressure below you.",
        "dilly_take": "You're safer than your team. Dilly helps you think about the next move before the market forces it.",
    },
    "freelancer_generic": {
        "display": "Freelancer / Independent",
        "threat_level": "high",
        "threat_pct": 55,
        "headline": "AI competes with you on price. You compete on trust.",
        "recent_signal": "2026: Upwork + Fiverr commodity gig rates down 40%+. Retainer-based expert consultants up 22%.",
        "vulnerable_tasks": [
            "Commodity project work (bids on marketplaces)",
            "First-draft deliverables",
            "Turnkey template work",
        ],
        "safe_tasks": [
            "Retainer consulting with repeat clients",
            "Speaking, teaching, coaching engagements",
            "Senior-level strategic advisory",
            "Productized services with your name attached",
        ],
        "what_to_learn": [
            "Productize your expertise (course, retainer, advisory)",
            "Build direct client relationships outside marketplaces",
            "Narrow niche to escape generalist pricing pressure",
        ],
        "forecast_2yr": "Marketplaces hollow out. Direct-to-client senior freelancers do better than ever.",
        "dilly_take": "The commodity end is AI-priced. The senior end is human-priced. Dilly helps you move up.",
    },
    "operations": {
        "display": "Operations / Ops Manager",
        "threat_level": "moderate",
        "threat_pct": 39,
        "headline": "AI automates the process. You design the system.",
        "recent_signal": "2026: Ops analyst and coordinator postings down 30%. Ops-lead and head-of-ops roles flat.",
        "vulnerable_tasks": [
            "Process documentation",
            "Data entry and reporting",
            "Routine vendor coordination",
            "Scheduling and logistics ops",
        ],
        "safe_tasks": [
            "System and process design",
            "Cross-functional negotiation",
            "Owning a P&L",
            "Vendor strategy, not just vendor management",
        ],
        "what_to_learn": [
            "Systems thinking — design the ops, don't just run them",
            "Finance fluency (bring P&L skills)",
            "Industry specialization (supply chain, fintech, SaaS)",
        ],
        "forecast_2yr": "Ops coordinators vanish. Head-of-ops grows.",
        "dilly_take": "You're not paid to execute anymore. You're paid to design. Dilly helps you show the design thinking.",
    },
    "student_general": {
        "display": "Student / Early Career",
        "threat_level": "high",
        "threat_pct": 50,
        "headline": "Entry-level jobs are where the squeeze is sharpest.",
        "recent_signal": "2025-26: Internship offers across tech, finance, consulting down 24-31% YoY. Hiring for experienced roles flat or up.",
        "vulnerable_tasks": [
            "Anything described as 'learn on the job'",
            "Routine analyst work",
            "Basic coding/analysis tasks",
            "Starter content production",
        ],
        "safe_tasks": [
            "Projects where you shipped something real",
            "Roles you created for yourself (club, club, volunteer)",
            "Internship-to-return-offer pipelines",
        ],
        "what_to_learn": [
            "Ship things outside class (real users, real outcome)",
            "Network into warm intros — cold apps work less",
            "Pick a specialty earlier than your peers did",
        ],
        "forecast_2yr": "Entry-level hiring compresses further. Those who stand out via projects win.",
        "dilly_take": "The resume-template path is saturated. The 'I built this' path is open. Dilly helps you tell the builder story.",
    },
}

# Role aliases — lowercased keys of common user phrasings mapped to the
# canonical ROLE_THREAT_REPORT key. Keeps lookup forgiving.
_ROLE_ALIASES: dict[str, str] = {
    # Software
    "software engineer": "software_engineer",
    "software developer": "software_engineer",
    "developer": "software_engineer",
    "programmer": "software_engineer",
    "sde": "software_engineer",
    "swe": "software_engineer",
    "backend engineer": "software_engineer",
    "frontend engineer": "software_engineer",
    "full stack engineer": "software_engineer",
    "mobile developer": "software_engineer",
    # Data
    "data analyst": "data_analyst",
    "analyst": "data_analyst",
    "business analyst": "data_analyst",
    "data scientist": "data_analyst",
    # Accounting
    "accountant": "accountant",
    "cpa": "accountant",
    "staff accountant": "accountant",
    "tax preparer": "accountant",
    "bookkeeper": "accountant",
    "accounting": "accountant",
    "accounting manager": "accountant",
    "auditor": "accountant",
    "internal auditor": "accountant",
    "external auditor": "accountant",
    "controller": "accountant",
    "financial controller": "accountant",
    "tax associate": "accountant",
    "tax analyst": "accountant",
    "tax manager": "accountant",
    "audit associate": "accountant",
    "audit manager": "accountant",
    "financial analyst": "accountant",
    # Marketing
    "marketing manager": "marketing_manager",
    "marketing": "marketing_manager",
    "digital marketer": "marketing_manager",
    "brand manager": "marketing_manager",
    # Sales
    "sales rep": "sales_rep",
    "salesperson": "sales_rep",
    "account executive": "sales_rep",
    "ae": "sales_rep",
    "sdr": "sales_rep",
    "bdr": "sales_rep",
    "sales": "sales_rep",
    # Support
    "customer support": "customer_support",
    "support": "customer_support",
    "customer success": "customer_support",
    "csm": "customer_support",
    # Teacher
    "teacher": "teacher",
    "educator": "teacher",
    "professor": "teacher",
    "instructor": "teacher",
    # Nurse
    "nurse": "nurse",
    "rn": "nurse",
    "bsn": "nurse",
    "registered nurse": "nurse",
    # Lawyer
    "lawyer": "lawyer",
    "attorney": "lawyer",
    "paralegal": "lawyer",
    # Truck driver
    "truck driver": "truck_driver",
    "driver": "truck_driver",
    "cdl": "truck_driver",
    # Retail
    "retail": "retail_worker",
    "retail worker": "retail_worker",
    "cashier": "retail_worker",
    "sales associate": "retail_worker",
    # Recruiter
    "recruiter": "recruiter",
    "sourcer": "recruiter",
    "talent acquisition": "recruiter",
    # Designer
    "graphic designer": "graphic_designer",
    "designer": "graphic_designer",
    "ux designer": "graphic_designer",
    # Writer
    "writer": "writer_copywriter",
    "copywriter": "writer_copywriter",
    "content writer": "writer_copywriter",
    "journalist": "writer_copywriter",
    # HR
    "hr": "hr_generalist",
    "human resources": "hr_generalist",
    "hr manager": "hr_generalist",
    "people ops": "hr_generalist",
    # PM
    "project manager": "project_manager",
    "program manager": "project_manager",
    "product manager": "project_manager",  # close enough for threat content
    "pmp": "project_manager",
    # Exec
    "ceo": "executive_leader",
    "cto": "executive_leader",
    "cfo": "executive_leader",
    "vp": "executive_leader",
    "director": "executive_leader",
    "executive": "executive_leader",
    # Freelance
    "freelancer": "freelancer_generic",
    "consultant": "freelancer_generic",
    "independent": "freelancer_generic",
    # Ops
    "operations": "operations",
    "operations manager": "operations",
    "ops": "operations",
    "coo": "operations",
    # Student
    "student": "student_general",
    "college student": "student_general",
    "undergrad": "student_general",
    "new grad": "student_general",
}


# Role keywords — weighted signal tokens used as a FALLBACK when the exact
# + substring alias matchers miss. Each (phrase, weight) contributes its
# weight to the role's total when the phrase appears in the normalized
# input. Highest-scoring role wins if it clears the MIN_SCORE threshold.
#
# Weights:
#   10 = unambiguous signal (role word itself, unique abbrev)
#    8 = strong domain word (almost always this role)
#    5 = medium signal (often this role but could be adjacent)
#    3 = weak signal (contextual hint only)
#    2 = very weak (only used to break ties)
#
# Tuned so single-word titles land on the right role AND long real-world
# titles like "Senior Director of Product Marketing, West Region" resolve
# to marketing_manager (domain word "marketing" at 10 beats "director" at 3).
_ROLE_KEYWORDS: dict[str, list[tuple[str, int]]] = {
    "software_engineer": [
        ("software engineer", 10), ("software developer", 10), ("swe", 10), ("sde", 10),
        ("engineering manager", 10), ("engineer", 5), ("engineering", 5),
        ("developer", 10), ("programmer", 10), ("coder", 8),
        ("frontend", 8), ("front end", 8), ("backend", 8), ("back end", 8),
        ("full stack", 8), ("fullstack", 8), ("full-stack", 8),
        ("mobile dev", 10), ("ios developer", 10), ("android developer", 10),
        ("web developer", 10), ("devops", 10), ("sre", 10),
        ("site reliability", 10), ("platform engineer", 10), ("infrastructure engineer", 10),
        ("systems engineer", 8), ("embedded engineer", 10), ("firmware", 8),
        ("ml engineer", 10), ("machine learning engineer", 10), ("ai engineer", 10),
        ("staff engineer", 10), ("principal engineer", 10),
    ],
    "data_analyst": [
        ("data analyst", 10), ("analytics engineer", 10), ("data scientist", 10),
        ("business analyst", 10), ("bi analyst", 10), ("business intelligence", 8),
        ("data engineer", 10), ("quant", 8), ("quantitative analyst", 10),
        ("research analyst", 8), ("analyst", 5), ("analytics", 5),
        ("reporting analyst", 10), ("statistician", 10),
    ],
    "accountant": [
        ("accountant", 10), ("accounting", 10), ("cpa", 10),
        ("bookkeeper", 10), ("bookkeeping", 10),
        ("auditor", 10), ("audit", 8), ("tax preparer", 10),
        ("tax analyst", 10), ("tax associate", 10), ("tax manager", 10),
        ("tax", 5), ("controller", 8), ("financial controller", 10),
        ("financial analyst", 8), ("fp&a", 8), ("fpa", 8),
        ("ledger", 5), ("payroll", 5),
    ],
    "marketing_manager": [
        ("marketing manager", 10), ("marketing director", 10),
        ("marketing", 10), ("marketer", 10), ("brand manager", 10),
        ("brand director", 10), ("brand", 5), ("advertising", 8),
        ("digital marketing", 10), ("content marketing", 8),
        ("growth marketer", 10), ("growth manager", 8),
        ("seo", 5), ("sem", 5), ("performance marketing", 10),
        ("cmo", 10), ("demand gen", 10), ("demand generation", 10),
    ],
    "sales_rep": [
        ("sales", 10), ("account executive", 10), ("ae", 8),
        ("sdr", 10), ("bdr", 10), ("sales development", 10),
        ("business development", 8), ("salesperson", 10),
        ("sales rep", 10), ("sales representative", 10),
        ("sales manager", 8), ("sales director", 8),
        ("quota", 3), ("inside sales", 10), ("outside sales", 10),
    ],
    "customer_support": [
        ("customer support", 10), ("customer service", 10),
        ("customer success", 10), ("csm", 10), ("cs manager", 10),
        ("help desk", 10), ("service desk", 8), ("technical support", 10),
        ("support engineer", 10), ("support specialist", 10),
        ("client services", 8), ("call center", 10), ("support agent", 10),
    ],
    "teacher": [
        ("teacher", 10), ("teaching", 10), ("educator", 10),
        ("professor", 10), ("instructor", 10), ("lecturer", 10),
        ("tutor", 8), ("faculty", 8), ("substitute teacher", 10),
        ("adjunct", 8), ("k-12", 8), ("k12", 8), ("kindergarten", 8),
        ("preschool", 8), ("school counselor", 8), ("principal", 3),
    ],
    "nurse": [
        ("nurse", 10), ("nursing", 10), ("rn", 10), ("bsn", 10),
        ("lpn", 10), ("lvn", 10), ("cna", 8), ("np", 8),
        ("registered nurse", 10), ("nurse practitioner", 10),
        ("icu", 3), ("er nurse", 10), ("charge nurse", 10),
        ("triage nurse", 10),
    ],
    "lawyer": [
        ("lawyer", 10), ("attorney", 10), ("paralegal", 10),
        ("counsel", 8), ("legal counsel", 10), ("general counsel", 10),
        ("associate attorney", 10), ("litigator", 10), ("litigation", 8),
        ("esq", 8), ("jd", 3), ("judge", 10), ("prosecutor", 10),
        ("public defender", 10),
    ],
    "truck_driver": [
        ("truck driver", 10), ("trucker", 10), ("trucking", 10),
        ("cdl", 10), ("hauler", 8), ("owner operator", 10),
        ("long haul", 10), ("delivery driver", 10), ("courier", 8),
        ("freight", 5), ("dispatcher", 5),
    ],
    "retail_worker": [
        ("retail", 10), ("cashier", 10), ("sales associate", 10),
        ("stocker", 10), ("store associate", 10), ("store manager", 8),
        ("barista", 10), ("waiter", 10), ("waitress", 10),
        ("server", 5), ("bartender", 10), ("line cook", 10),
        ("clerk", 8), ("host", 5), ("hostess", 5), ("shift lead", 8),
    ],
    "recruiter": [
        ("recruiter", 10), ("recruiting", 10), ("sourcer", 10),
        ("talent acquisition", 10), ("headhunter", 10),
        ("technical recruiter", 10), ("university recruiter", 10),
        ("ta specialist", 10), ("ta manager", 10),
    ],
    "graphic_designer": [
        ("graphic designer", 10), ("graphic design", 10),
        ("ux designer", 10), ("ui designer", 10), ("product designer", 10),
        ("visual designer", 10), ("web designer", 10),
        ("designer", 5), ("illustrator", 8), ("art director", 10),
        ("creative director", 10), ("motion designer", 10),
        ("industrial designer", 10),
    ],
    "writer_copywriter": [
        ("writer", 10), ("copywriter", 10), ("copywriting", 10),
        ("journalist", 10), ("reporter", 10), ("author", 8),
        ("content writer", 10), ("technical writer", 10), ("blogger", 8),
        ("editor", 8), ("editorial", 8), ("ghostwriter", 10),
        ("content strategist", 8),
    ],
    "hr_generalist": [
        ("hr generalist", 10), ("hr manager", 10), ("hr business partner", 10),
        ("hrbp", 10), ("human resources", 10), ("people ops", 10),
        ("people operations", 10), ("chief people officer", 10), ("chro", 10),
        ("employee relations", 10), ("compensation manager", 10),
        ("benefits manager", 10), ("learning and development", 8),
        ("l&d manager", 10), ("training manager", 8), ("hr", 5),
    ],
    "project_manager": [
        ("project manager", 10), ("program manager", 10),
        ("product manager", 10), ("product owner", 10),
        ("scrum master", 10), ("agile coach", 10), ("pmp", 10),
        ("technical program manager", 10), ("tpm", 10),
        ("delivery manager", 10), ("associate product manager", 10),
        ("apm", 8),
    ],
    "executive_leader": [
        ("ceo", 10), ("cto", 10), ("cfo", 10), ("cmo", 10), ("cpo", 10),
        ("chief executive", 10), ("chief technology", 10), ("chief financial", 10),
        ("chief marketing", 10), ("president", 10), ("founder", 10),
        ("co-founder", 10), ("cofounder", 10), ("managing director", 10),
        ("vice president", 8), ("vp", 5), ("svp", 8), ("evp", 8),
        ("director", 3), ("executive", 5),
    ],
    "freelancer_generic": [
        ("freelancer", 10), ("freelance", 10), ("consultant", 8),
        ("contractor", 10), ("self employed", 10), ("self-employed", 10),
        ("independent contractor", 10), ("gig", 5), ("solopreneur", 10),
        ("advisor", 5),
    ],
    "operations": [
        ("operations manager", 10), ("operations analyst", 10),
        ("head of operations", 10), ("head of ops", 10), ("ops manager", 10),
        ("supply chain", 10), ("logistics manager", 10), ("coo", 10),
        ("business operations", 10), ("biz ops", 10), ("bizops", 10),
        ("operations", 8), ("ops", 5), ("warehouse manager", 10),
        ("procurement", 8),
    ],
    "student_general": [
        ("college student", 10), ("undergrad", 10), ("undergraduate", 10),
        ("new grad", 10), ("recent graduate", 10), ("student", 8),
        ("intern", 5), ("summer intern", 10), ("grad student", 8),
        ("graduate student", 8), ("phd student", 8), ("mba student", 8),
    ],
}

# Score threshold. Below this, we return None rather than guess a wrong role.
_MIN_SCORE = 8


def _score_roles(q: str) -> tuple[str, int] | None:
    """Run the weighted keyword matcher. Returns (role_key, score) for
    the highest-scoring role, or None if nothing clears the threshold.

    Each role's score is the sum of weights of its keywords present in
    the normalized query as a substring. Ties broken by length of the
    longest matched phrase (more specific wins).
    """
    best_key: str | None = None
    best_score = 0
    best_specificity = 0
    for role_key, keywords in _ROLE_KEYWORDS.items():
        score = 0
        longest = 0
        for phrase, weight in keywords:
            # Word-boundary-ish check for short abbreviations so "rn" in
            # "learn" doesn't trigger a nurse match. Long phrases (>= 4
            # chars) use plain substring since collisions are rare.
            if len(phrase) < 4:
                import re as _re
                if _re.search(rf"(?:^|\W){_re.escape(phrase)}(?:$|\W)", q):
                    score += weight
                    if len(phrase) > longest:
                        longest = len(phrase)
            else:
                if phrase in q:
                    score += weight
                    if len(phrase) > longest:
                        longest = len(phrase)
        if score > best_score or (score == best_score and longest > best_specificity):
            best_key = role_key
            best_score = score
            best_specificity = longest
    if best_key and best_score >= _MIN_SCORE:
        return (best_key, best_score)
    return None


def lookup(query: str) -> dict | None:
    """Find a role threat report by free-form user input.

    Resolution order (first hit wins):
      1. Exact canonical key match
      2. Exact alias match
      3. Substring alias match (longest alias wins)
      4. Weighted keyword scoring across all roles (fallback)

    Returns the full report dict plus a resolved `role_key` field, or None
    if nothing clears the keyword-score threshold. Caller decides whether
    to return a generic fallback.
    """
    if not query:
        return None
    q = query.lower().strip()
    # Strip common prefixes users type: "i'm a", "i work as a", etc.
    for prefix in ("i'm a ", "i am a ", "i'm an ", "i work as a ", "i work as an ", "my job is "):
        if q.startswith(prefix):
            q = q[len(prefix):]

    # 1. Direct canonical key
    if q in ROLE_THREAT_REPORT:
        return {**ROLE_THREAT_REPORT[q], "role_key": q}
    # 2. Exact alias
    if q in _ROLE_ALIASES:
        key = _ROLE_ALIASES[q]
        return {**ROLE_THREAT_REPORT[key], "role_key": key}
    # 3. Substring alias — longest alias wins. Short aliases (<4 chars,
    #    e.g. "rn", "vp", "hr") must match on word boundaries so "rn"
    #    doesn't fire inside "intern" and "vp" doesn't fire inside "advp".
    import re as _re
    hits = []
    for alias, key in _ROLE_ALIASES.items():
        if len(alias) < 4:
            if _re.search(rf"(?:^|\W){_re.escape(alias)}(?:$|\W)", q):
                hits.append((len(alias), alias, key))
        else:
            if alias in q:
                hits.append((len(alias), alias, key))
    if hits:
        hits.sort(reverse=True)
        _, _, key = hits[0]
        return {**ROLE_THREAT_REPORT[key], "role_key": key}
    # 4. Keyword-weight fallback — catches long real-world titles like
    #    "VP of Engineering", "Senior Director, Product Marketing", etc.
    scored = _score_roles(q)
    if scored:
        key, _ = scored
        return {**ROLE_THREAT_REPORT[key], "role_key": key}
    return None


def available_roles() -> list[dict]:
    """List of (role_key, display) for building a role picker UI."""
    return [
        {"role_key": k, "display": v["display"], "threat_level": v["threat_level"]}
        for k, v in ROLE_THREAT_REPORT.items()
    ]
