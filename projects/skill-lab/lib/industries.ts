// Industries — the primary entry point for working adults. Each industry maps
// to cohort slugs (where we already have curated videos) AND a list of AI-era
// skills that matter most for that role. This is Skill Lab's answer to "what
// should I learn so I'm not replaced by AI?"
//
// The skills list doubles as an editorial syllabus and a set of curation
// filters. Over time we'll attach specific video IDs to each skill.

export type Industry = {
  slug: string;
  name: string;
  tagline: string;         // punchy, one line
  blurb: string;           // 1–2 sentences of "what's changing"
  at_risk: string;         // what AI can replace (honest, not doomer)
  moat: string;            // what keeps you valuable
  ai_skills: string[];     // the 5–7 skills to learn NOW
  cohort_slugs: string[];  // from lib/cohorts.ts — drives video selection
  emoji: string;
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "software-engineer",
    name: "Software Engineer",
    tagline: "Ship 10× more with AI as your pair.",
    blurb: "AI can write boilerplate and tests faster than you can. Engineers who win pair tightly with it and own systems, architecture, and outcomes.",
    at_risk: "Rote coding, boilerplate, tutorial-level tasks",
    moat: "System design, code review judgment, production-grade debugging, owning outcomes",
    ai_skills: [
      "Prompting for code generation",
      "AI pair-programming workflows",
      "System design fundamentals",
      "Observability and debugging production",
      "Writing for humans (docs, reviews)",
      "Architecture for AI-augmented systems",
    ],
    cohort_slugs: ["software-engineering-cs", "cybersecurity-it", "data-science-analytics"],
    emoji: "💻",
  },
  {
    slug: "marketer",
    name: "Marketer",
    tagline: "Strategy is the job. Execution is the commodity.",
    blurb: "AI writes decent copy and generates decent ads. The differentiator is taste, positioning, and knowing what to test.",
    at_risk: "Generic copy, basic SEO, template-driven content",
    moat: "Positioning, narrative, creative judgment, data-driven experimentation",
    ai_skills: [
      "Positioning and brand strategy",
      "AI-assisted creative direction",
      "Marketing analytics with SQL",
      "Prompt-driven content ops",
      "Experiment design",
      "Customer research synthesis",
    ],
    cohort_slugs: ["marketing-advertising", "data-science-analytics", "consulting-strategy"],
    emoji: "📣",
  },
  {
    slug: "designer",
    name: "Designer",
    tagline: "Taste compounds. AI accelerates it.",
    blurb: "AI can mock a screen. It can't run a discovery interview or defend a design decision. Designers who direct AI instead of fighting it will pull ahead fast.",
    at_risk: "Generic UI layouts, stock mockups, pattern-library duplicates",
    moat: "Research-to-decision craft, systems thinking, prototype-to-production taste",
    ai_skills: [
      "Prompt craft for image/UI tools",
      "Design systems and tokens",
      "Running user research interviews",
      "Motion and prototyping",
      "Design engineering basics",
      "Writing in the voice of the product",
    ],
    cohort_slugs: ["design-creative-arts", "software-engineering-cs"],
    emoji: "🎨",
  },
  {
    slug: "finance",
    name: "Finance Professional",
    tagline: "Spreadsheets are table stakes. Judgment is the job.",
    blurb: "AI will model, scrape, and summarize faster than any junior. The edge shifts to understanding businesses, reading situations, and owning calls.",
    at_risk: "Repetitive modeling, data scraping, format-heavy deliverables",
    moat: "Valuation judgment, business understanding, stakeholder management",
    ai_skills: [
      "Python for finance",
      "AI-augmented financial modeling",
      "Data analysis with SQL",
      "Presenting to executives",
      "Industry-specific diligence",
      "Prompting for research synthesis",
    ],
    cohort_slugs: ["finance-accounting", "data-science-analytics", "economics-public-policy"],
    emoji: "💼",
  },
  {
    slug: "writer",
    name: "Writer / Creator",
    tagline: "Voice is the moat. Distribution is the discipline.",
    blurb: "Anyone can generate words. Writers with a distinctive point of view, deep reporting, and loyal audiences win the era.",
    at_risk: "Generic explainers, SEO content farms, summaries",
    moat: "Original reporting, distinctive voice, audience relationships",
    ai_skills: [
      "AI-assisted editing (not writing)",
      "Distribution and audience building",
      "Research and interview craft",
      "Data-driven storytelling",
      "Editorial judgment",
    ],
    cohort_slugs: ["media-communications", "design-creative-arts"],
    emoji: "✍️",
  },
  {
    slug: "teacher",
    name: "Teacher / Educator",
    tagline: "Human presence is the thing no AI replaces.",
    blurb: "AI tutors scale. Teachers who design experiences, facilitate debate, and mentor will be more valuable, not less.",
    at_risk: "Lecture delivery, grading, lesson-plan authoring",
    moat: "Classroom facilitation, mentorship, curriculum design",
    ai_skills: [
      "AI in the classroom (responsibly)",
      "Adaptive curriculum design",
      "Prompting for feedback at scale",
      "Assessment redesign for AI era",
      "Facilitation and discussion craft",
    ],
    cohort_slugs: ["education-human-development", "social-sciences-nonprofit"],
    emoji: "🧑‍🏫",
  },
  {
    slug: "sales",
    name: "Salesperson",
    tagline: "Relationships are the only truly AI-proof moat.",
    blurb: "AI handles prospecting, email, and CRM hygiene. The human edge is trust, negotiation, and reading the room.",
    at_risk: "Cold outreach, CRM updates, demo follow-ups",
    moat: "Relationship building, negotiation, complex discovery, closing",
    ai_skills: [
      "AI-driven prospecting",
      "Sales analytics basics",
      "Discovery question design",
      "Negotiation fundamentals",
      "Writing for humans, at scale",
    ],
    cohort_slugs: ["marketing-advertising", "consulting-strategy", "management-operations"],
    emoji: "🤝",
  },
  {
    slug: "operations",
    name: "Operations / Ops",
    tagline: "Automate the known so you can solve the unknown.",
    blurb: "Ops roles are being reshaped by AI workflows. The practitioners who design the automation will thrive; the ones who execute manual steps will not.",
    at_risk: "Manual data entry, repetitive ticket routing, basic reporting",
    moat: "Process design, root-cause thinking, cross-functional orchestration",
    ai_skills: [
      "Workflow automation (Zapier, n8n, Make)",
      "SQL for ops reporting",
      "Prompting for task ops",
      "Process design and mapping",
      "Agent workflows for ops",
    ],
    cohort_slugs: ["management-operations", "data-science-analytics"],
    emoji: "⚙️",
  },
  {
    slug: "healthcare",
    name: "Healthcare / Clinical",
    tagline: "Clinical judgment + AI tooling = the new standard of care.",
    blurb: "AI will triage, read imaging, and surface evidence. Clinicians who use it well will give better care. Those who don't will be outpaced.",
    at_risk: "Routine documentation, basic imaging review, patient intake",
    moat: "Diagnostic judgment, bedside manner, complex decision-making",
    ai_skills: [
      "Medical AI tooling literacy",
      "Evidence-based practice with AI",
      "Clinical informatics basics",
      "Patient communication",
      "Critical appraisal of AI outputs",
    ],
    cohort_slugs: ["healthcare-clinical", "biotech-pharmaceutical"],
    emoji: "🩺",
  },
  {
    slug: "lawyer",
    name: "Lawyer / Legal",
    tagline: "Research is the commodity. Argument is the craft.",
    blurb: "AI drafts contracts and finds precedent in seconds. Lawyers who lead strategy, negotiate, and represent clients remain indispensable.",
    at_risk: "Document review, basic research, contract drafting",
    moat: "Legal strategy, negotiation, courtroom and client work",
    ai_skills: [
      "Legal AI tool literacy",
      "Contract analysis with AI",
      "Legal writing for humans",
      "Client communication",
      "Negotiation fundamentals",
    ],
    cohort_slugs: ["law-government", "economics-public-policy"],
    emoji: "⚖️",
  },
  {
    slug: "data-analyst",
    name: "Data Analyst",
    tagline: "Pull the data, tell the story, run the experiment.",
    blurb: "AI writes SQL. Analysts who know which question to ask, how to validate results, and how to move an org with data are the ones who compound.",
    at_risk: "Basic dashboarding, SQL-from-template, rote reporting",
    moat: "Problem framing, statistical judgment, stakeholder communication",
    ai_skills: [
      "SQL fluency (well past basics)",
      "Statistics for experimentation",
      "Python for analytics",
      "Prompting for data tasks",
      "Data storytelling",
      "Causal inference basics",
    ],
    cohort_slugs: ["data-science-analytics", "software-engineering-cs", "economics-public-policy"],
    emoji: "📊",
  },
  {
    slug: "product-manager",
    name: "Product Manager",
    tagline: "Judgment under uncertainty. That's the job.",
    blurb: "AI will write specs and summarize research. PMs who set bets, pick the right problem, and push through ambiguity will lead.",
    at_risk: "Spec writing, meeting notes, status updates",
    moat: "Prioritization, user empathy, strategy, cross-functional leadership",
    ai_skills: [
      "Prompt-driven product discovery",
      "Data analysis for PMs",
      "Customer interview synthesis",
      "Writing crisp specs (for humans)",
      "AI-feature design",
      "Experimentation fluency",
    ],
    cohort_slugs: ["software-engineering-cs", "consulting-strategy", "data-science-analytics"],
    emoji: "🧭",
  },
  {
    slug: "consultant",
    name: "Consultant",
    tagline: "The deck is worth less. The insight is worth more.",
    blurb: "AI can research, structure, and produce slides. Consultants who synthesize sharp takes and drive executive conversations will be more valuable than ever.",
    at_risk: "Research synthesis, slide building, benchmarking",
    moat: "Executive presence, sharp recommendations, change management",
    ai_skills: [
      "Case interview frameworks",
      "AI-augmented research",
      "Data-driven recommendations",
      "Executive communication",
      "Change management fundamentals",
    ],
    cohort_slugs: ["consulting-strategy", "economics-public-policy", "management-operations"],
    emoji: "🧩",
  },
  {
    slug: "entrepreneur",
    name: "Founder / Entrepreneur",
    tagline: "Build leaner. Ship faster. Stay weird.",
    blurb: "AI collapses the cost of building. The edge shifts to taste, distribution, and building something people actually want.",
    at_risk: "Generic \"ChatGPT wrapper\" products, me-too features",
    moat: "Customer obsession, distribution, distinctive taste, speed",
    ai_skills: [
      "Customer discovery",
      "AI-leveraged building",
      "Distribution and go-to-market",
      "Fundraising basics",
      "Unit economics",
    ],
    cohort_slugs: ["entrepreneurship-innovation", "software-engineering-cs", "marketing-advertising"],
    emoji: "🚀",
  },
  {
    slug: "support",
    name: "Customer Support",
    tagline: "Empathy scales when AI handles the tickets.",
    blurb: "AI handles the repetitive ticket volume. The humans who manage escalations, fix root causes, and design better CX will move up.",
    at_risk: "Tier-1 ticket triage, scripted responses",
    moat: "Escalation handling, CX design, cross-team orchestration",
    ai_skills: [
      "AI-assisted support tooling",
      "Root-cause analysis",
      "Writing for empathy at scale",
      "Product fluency",
      "Data analysis basics",
    ],
    cohort_slugs: ["management-operations", "media-communications"],
    emoji: "💬",
  },
  {
    slug: "student",
    name: "Student",
    tagline: "Stack the skills compound interest can't automate away.",
    blurb: "School prepares you for the last era. AI-native students will pull ahead by learning what their courses don't teach — the fundamentals and the new tools.",
    at_risk: "Copy-paste coursework, rote memorization",
    moat: "Deep understanding, real projects, network, range",
    ai_skills: [
      "Learning how to learn",
      "Prompting as a thinking tool",
      "Writing clearly",
      "Data literacy",
      "Building real projects",
    ],
    cohort_slugs: ["software-engineering-cs", "data-science-analytics", "economics-public-policy", "design-creative-arts"],
    emoji: "🎓",
  },
];

export const INDUSTRIES_BY_SLUG: Record<string, Industry> = Object.fromEntries(
  INDUSTRIES.map((i) => [i.slug, i]),
);

export function industryFromSlug(slug: string): Industry | null {
  return INDUSTRIES_BY_SLUG[slug] ?? null;
}
