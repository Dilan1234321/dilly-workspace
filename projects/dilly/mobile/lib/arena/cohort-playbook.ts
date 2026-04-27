/**
 * Cohort playbook - the zero-cost knowledge base the AI Arena draws on.
 *
 * Every tool in the new Arena (Market Value Live, Conviction Builder,
 * Future Pulse, Threat Radar, Honest Mirror, Cold Email Studio, etc.)
 * reads from this file to avoid LLM calls. The idea: Dilly can feel
 * impossibly knowledgeable because we encode real per-cohort truths
 * once, then mix them with the user's actual profile facts at render
 * time.
 *
 * Source of truth rules:
 *   - Comp bands are 2026-grade US anchors for early-career (0-3 yrs
 *     post-grad) and mid-career (3-8 yrs) roles at reputable
 *     employers. These are NOT precise - they are the range a
 *     well-informed friend-of-a-friend would quote. We never claim
 *     precision.
 *   - Skill gaps list the things a cohort hiring manager most often
 *     asks about when a candidate has the title but not the proof.
 *   - Skill-keyword hints map to Dilly Skills search terms so we can
 *     recommend a real video without another LLM call.
 *
 * Keys must match lib/cohorts.ts ALL_COHORTS exactly. Unknown cohort
 * keys fall back to a 'default' entry at the bottom of this file.
 */

export interface CohortPlaybook {
  /** Short editorial label shown in arena hero copy. */
  shortName: string
  /** Editorial one-liner about what this cohort *is*. */
  tagline: string
  /** 2026 US comp anchors. `earlyBase`/`midBase` are total-cash
   *  annual USD averages at reputable employers. `top10Tcc` is what
   *  strong performers at top-percentile firms clear in total comp. */
  comp: {
    earlyBase: number   // 0-3 yrs
    midBase: number     // 3-8 yrs
    top10Tcc: number    // what top-10% performers at top firms clear
  }
  /** Cities where this cohort is densest (descending by share). */
  hotCities: string[]
  /** Canonical companies by tier. Used by Conviction Builder + the
   *  Hook to choose plausible targets and tune copy. */
  anchorCompanies: {
    tier1: string[]   // "the name everyone knows"
    tier2: string[]   // "serious / respected"
    scaleup: string[] // "fast-growth, moving"
  }
  /** Five skills every strong candidate in this cohort is expected
   *  to demonstrate. Order matters: first is the most-asked. */
  coreSkills: string[]
  /** The five rubric items hiring managers mentally grade against.
   *  Used by Honest Mirror + Conviction Builder fit read. */
  rubric: string[]
  /** Three skill-keyword phrases we send to the Skills search to
   *  surface curated videos. Phrases, not single words. */
  skillQueries: string[]
  /** Three threat categories specific to this cohort - used by the
   *  Threat Radar tile. Each is one concrete risk, not a platitude. */
  threats: { title: string; body: string }[]
  /** Day-in-the-life vignette used by Future Pulse. One scene per
   *  time-of-day. Should feel lived-in and specific. */
  vignette: {
    morning: string
    midday: string
    lateafternoon: string
    ceiling: string   // what the top of this track looks like
  }
}

/** Reputable-employer comp anchors vary widely by cohort. These are
 *  the numbers a well-informed friend would quote in a coffee chat. */
const COHORTS: Record<string, CohortPlaybook> = {
  'Software Engineering & CS': {
    shortName: 'SWE',
    tagline: 'Build systems that scale.',
    comp: { earlyBase: 180_000, midBase: 260_000, top10Tcc: 450_000 },
    hotCities: ['San Francisco', 'Seattle', 'New York', 'Austin', 'Los Angeles'],
    anchorCompanies: {
      tier1: ['Google', 'Meta', 'Apple', 'Amazon', 'Microsoft'],
      tier2: ['Stripe', 'Databricks', 'Airbnb', 'Nvidia', 'Snowflake'],
      scaleup: ['Ramp', 'Anthropic', 'Notion', 'Figma', 'Linear'],
    },
    coreSkills: ['System design', 'Data structures & algorithms', 'One backend stack deeply', 'Reading production code', 'Debugging under load'],
    rubric: [
      'Can you ship end-to-end, not just commit code',
      'Do you reason about failure modes before they happen',
      'Can you explain a system you built to a hostile senior',
      'How you handle ambiguity in a spec',
      'Whether you measure what you build',
    ],
    skillQueries: ['system design', 'leetcode patterns', 'production debugging'],
    threats: [
      { title: 'Commodification of junior SWE work', body: 'AI assistants compress the value of entry-level IC tickets. You need to be the person who decides WHAT to build, not just implements it.' },
      { title: 'Stack monoculture', body: 'Going deep in only one stack at only one company. When that stack ages out, so does your price.' },
      { title: 'The invisible-IC trap', body: 'Heads-down coders with no visibility into product decisions get stuck at senior forever. Get into design docs early.' },
    ],
    vignette: {
      morning: 'You pull on-call, scan PagerDuty, push a fix for a race condition that was keeping a prod job wedged, and approve two PRs before standup.',
      midday: 'You pair with a new grad on a gnarly refactor, then spend 40 minutes in a design doc review picking apart the consistency model of a proposed feature.',
      lateafternoon: 'You lead a writing session on a system design for your next half-year project. The senior you used to look up to asks you to rewrite the migration path.',
      ceiling: 'Principal engineer at a top-10 firm, total comp $700K+, opinions that move the roadmap, your name on a public postmortem people will reference for a decade.',
    },
  },
  'Data Science & Analytics': {
    shortName: 'Data',
    tagline: 'Make numbers speak.',
    comp: { earlyBase: 145_000, midBase: 210_000, top10Tcc: 360_000 },
    hotCities: ['San Francisco', 'New York', 'Seattle', 'Austin', 'Boston'],
    anchorCompanies: {
      tier1: ['Google', 'Meta', 'Netflix', 'Amazon', 'Airbnb'],
      tier2: ['Databricks', 'Snowflake', 'Stripe', 'Uber', 'DoorDash'],
      scaleup: ['Ramp', 'Anthropic', 'Scale AI', 'Mercury', 'Hex'],
    },
    coreSkills: ['SQL - deep', 'Experiment design', 'Product sense', 'Python + pandas', 'Storytelling with data'],
    rubric: [
      'Can you define the right metric, not just pull the one asked',
      'Can you design an experiment without being told the primary',
      'Do you understand the limits of your own model',
      'Can you present to a PM without losing them in variance talk',
      'Can you say no to a bad question',
    ],
    skillQueries: ['sql window functions', 'ab test design', 'bayesian ab testing'],
    threats: [
      { title: 'Becoming a dashboard factory', body: 'If your work is mostly Looker tickets, you will cap out. The job is making better decisions, not prettier charts.' },
      { title: 'Tooling treadmill', body: 'Every 18 months the canonical ML/analytics stack shifts. If you do not learn one thing deeply, you will restart.' },
      { title: 'Stat fluency gap', body: 'Being a good communicator without being a good statistician makes you a junior forever. Respected DS rigorously reason about uncertainty.' },
    ],
    vignette: {
      morning: 'You pull overnight metrics, spot that a feature rollout is 4% below what the experiment projected, and write a one-paragraph Slack read.',
      midday: 'You lead an experiment-design review, push back on a PM who wants to ship at p=0.08, and win.',
      lateafternoon: 'You pair with a staff engineer to write the DAG for a new signal your model needs. You leave early, a rare day.',
      ceiling: 'Head of analytics at a top-10 firm, reading product-strategy docs instead of pulling numbers for them, shaping what the company measures.',
    },
  },
  'Cybersecurity & IT': {
    shortName: 'Cyber',
    tagline: 'Defend what matters; break what should break.',
    comp: { earlyBase: 130_000, midBase: 190_000, top10Tcc: 340_000 },
    hotCities: ['Washington DC', 'San Francisco', 'New York', 'Austin', 'Seattle'],
    anchorCompanies: {
      tier1: ['CrowdStrike', 'Palo Alto Networks', 'Cloudflare', 'Okta', 'Cisco'],
      tier2: ['Snowflake', 'Datadog', 'Zscaler', 'Splunk', 'Microsoft'],
      scaleup: ['Wiz', 'Abnormal Security', 'Snyk', 'HashiCorp', 'Tines'],
    },
    coreSkills: ['Networking fundamentals', 'Threat modeling', 'Scripting for automation', 'Incident response', 'One security domain deeply'],
    rubric: [
      'Can you explain a breach you actually investigated',
      'Do you know the common MITRE TTPs cold',
      'Can you write a remediation that does not break the business',
      'Do you understand the regulatory floor for your industry',
      'Can you say what WOULD NOT be worth blocking',
    ],
    skillQueries: ['threat modeling', 'incident response', 'zero trust'],
    threats: [
      { title: 'SOC burnout', body: 'Every cyber candidate thinks they want to work a SOC. Six months of alert fatigue and they want out. Have an exit story before you go in.' },
      { title: 'Compliance-only roles', body: 'Starting in GRC is fine; staying there limits you. The technical floor drops by the year.' },
      { title: 'Cert dependency', body: 'Certs get you past HR; they do not close an interview. Depth in one area beats shallow across five.' },
    ],
    vignette: {
      morning: 'You triage an alert chain from last night, find the real signal buried in three false positives, and scope the blast radius.',
      midday: 'You run a tabletop exercise with legal, IT, and eng. You write the incident runbook people will actually follow.',
      lateafternoon: 'You red-team a new feature with the product engineer who shipped it. You find a privilege-escalation path she had not considered.',
      ceiling: 'CISO at a serious company, on the board update every quarter, the person the CEO calls when something hits the wire.',
    },
  },
  'Finance & Accounting': {
    shortName: 'Finance',
    tagline: 'Modeling, valuation, and the discipline of precision.',
    comp: { earlyBase: 120_000, midBase: 220_000, top10Tcc: 500_000 },
    hotCities: ['New York', 'San Francisco', 'Chicago', 'Boston', 'Charlotte'],
    anchorCompanies: {
      tier1: ['Goldman Sachs', 'Morgan Stanley', 'JP Morgan', 'Evercore', 'Lazard'],
      tier2: ['Blackstone', 'KKR', 'Citadel', 'Jane Street', 'Two Sigma'],
      scaleup: ['Ramp', 'Mercury', 'Brex', 'Stripe', 'Plaid'],
    },
    coreSkills: ['Three-statement modeling', 'Valuation (DCF, comps, LBO)', 'Excel speed', 'Memo writing', 'Reading the footnotes'],
    rubric: [
      'Can you build a DCF without a template',
      'Do you catch the number that does not fit in 60 seconds',
      'Can you defend an assumption in front of an MD',
      'Can you read a 10-K like a novel',
      'Can you articulate the bear case for your own thesis',
    ],
    skillQueries: ['dcf modeling', 'lbo modeling', 'financial statement analysis'],
    threats: [
      { title: 'IBD grind ceiling', body: 'The first two years teach you modeling and endurance. After that you either move to the buy side or become a career banker - make the choice intentionally.' },
      { title: 'Fintech wage undercut', body: 'Fintech will pay you $180K and call it senior. The path to real comp still runs through PE/HF.' },
      { title: 'Losing technical edge in corp', body: 'Moving to corp dev or corp strat is a career luxury, not a promotion. Your modeling atrophies fast.' },
    ],
    vignette: {
      morning: 'You turn in an MD comment pack by 7:30, pull new comps, and flag that an outlier in the comp set has a private-market transaction distorting the multiple.',
      midday: 'You sit in on a diligence call for a $2B carve-out. You write a two-paragraph read on the margin bridge that the MD circulates to the deal team.',
      lateafternoon: 'You rebuild the LBO with new tax assumptions. You leave the office at 11pm, ride the black car home, and wake up a small amount richer.',
      ceiling: 'Partner at a top PE firm, names carried weight in rooms you used to have to prove you belonged in, writing your own checks.',
    },
  },
  'Consulting & Strategy': {
    shortName: 'Consulting',
    tagline: 'Structure, synthesis, and the whiteboard.',
    comp: { earlyBase: 110_000, midBase: 210_000, top10Tcc: 400_000 },
    hotCities: ['New York', 'Chicago', 'San Francisco', 'Boston', 'Washington DC'],
    anchorCompanies: {
      tier1: ['McKinsey', 'Bain', 'BCG'],
      tier2: ['Deloitte', 'Accenture', 'Oliver Wyman', 'LEK', 'PwC Strategy&'],
      scaleup: ['Ramp', 'Stripe', 'Databricks', 'Anthropic', 'Notion'],
    },
    coreSkills: ['Structured problem-solving', 'Slide craft', 'Client-facing presence', 'Excel + PowerPoint fluency', 'Writing executive summaries'],
    rubric: [
      'Can you MECE a problem on the fly',
      'Can you land a recommendation in one slide',
      'Do you synthesize before you analyze',
      'Can you disagree with a client without losing them',
      'Can you run a workshop that actually decides something',
    ],
    skillQueries: ['case interview', 'consulting slide', 'executive writing'],
    threats: [
      { title: 'Flight of the generalist', body: 'Without a practice (healthcare, tech, PE due-diligence), you will stall at senior-manager. Industry expertise compounds; generalism does not.' },
      { title: 'Exit urgency', body: 'The 2-3 year mark is the exit window. Stay past it and the industry roles that used to be available start drying up.' },
      { title: 'AI eating the deck', body: 'Slide automation will gut the junior-analyst workload. Your value is the judgment behind the slide, not the slide.' },
    ],
    vignette: {
      morning: 'You land in Chicago, lead the kickoff of a cost-takeout project, and have the client team nodding by slide three.',
      midday: 'You rewrite the executive summary an AP is stuck on. Your version lands the recommendation in six words. The partner notices.',
      lateafternoon: 'You run a working session with the client COO that turns into a one-pager agreement on next quarter\'s priorities. You catch the 8pm flight.',
      ceiling: 'Senior partner at MBB, owning a practice, your book worth seven figures a year, the person a Fortune 100 CEO calls when the board wants a scrub.',
    },
  },
  'Marketing & Advertising': {
    shortName: 'Marketing',
    tagline: 'Positioning, distribution, and demand.',
    comp: { earlyBase: 95_000, midBase: 165_000, top10Tcc: 320_000 },
    hotCities: ['New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Austin'],
    anchorCompanies: {
      tier1: ['Meta', 'Google', 'Apple', 'TikTok', 'Netflix'],
      tier2: ['Snowflake', 'Datadog', 'Amazon', 'Uber', 'LinkedIn'],
      scaleup: ['Ramp', 'Notion', 'Figma', 'Linear', 'Retool'],
    },
    coreSkills: ['Positioning', 'Brief writing', 'One channel deeply (paid / content / lifecycle)', 'Analytics basics', 'Demand modeling'],
    rubric: [
      'Can you write a one-line positioning that survives scrutiny',
      'Do you know the unit economics of your channel',
      'Can you ship a campaign end-to-end, not just a brief',
      'Can you present to finance without hedging',
      'Can you kill your own baby',
    ],
    skillQueries: ['brand positioning', 'performance marketing', 'content marketing strategy'],
    threats: [
      { title: 'Brand-only career', body: 'Pure brand marketers who cannot talk pipeline get outnumbered by growth marketers who can. Learn the numbers.' },
      { title: 'Agency → in-house delay', body: 'Agency experience is rich; staying past year 4 stalls the senior-director path. Move before you are convenient.' },
      { title: 'AI content inflation', body: 'Content marketing without a distribution edge gets buried. Your job is distribution + taste, not generation.' },
    ],
    vignette: {
      morning: 'You rewrite a positioning one-pager that was not landing, present it to the founder at 10, and ship the final brief to design by noon.',
      midday: 'You sit in on a customer call, hear the exact phrase you need, and kill three pieces of existing collateral by end of day.',
      lateafternoon: 'You cut a paid campaign that was spending with no intent, move the budget to organic, and get a ping from finance that they noticed.',
      ceiling: 'CMO at a real brand, a book of work the industry cites, one company everyone in your world has heard of bearing your fingerprints.',
    },
  },
  'Management & Operations': {
    shortName: 'Ops / PM',
    tagline: 'Teams, process, and the operating cadence.',
    comp: { earlyBase: 115_000, midBase: 195_000, top10Tcc: 380_000 },
    hotCities: ['San Francisco', 'New York', 'Seattle', 'Austin', 'Chicago'],
    anchorCompanies: {
      tier1: ['Google', 'Meta', 'Amazon', 'Microsoft', 'Apple'],
      tier2: ['Stripe', 'Databricks', 'Airbnb', 'Uber', 'Snowflake'],
      scaleup: ['Ramp', 'Notion', 'Figma', 'Linear', 'Retool'],
    },
    coreSkills: ['Spec writing', 'Prioritization', 'Quantitative judgment', 'Running a meeting', 'Saying no'],
    rubric: [
      'Can you write a spec that is falsifiable',
      'Do you understand the trade in every decision',
      'Can you run a standup that moves work',
      'Can you disagree with a senior eng without starting a war',
      'Can you cut scope under pressure',
    ],
    skillQueries: ['pm interview', 'product strategy', 'writing specs'],
    threats: [
      { title: 'Process tax', body: 'A PM whose job becomes mostly meetings is a PM who will be quietly cut in the next reorg. Keep your hand on the thing being built.' },
      { title: 'Quant gap', body: 'PMs who cannot pull their own data become hostages to the analyst queue. Learn SQL well enough to answer your own questions.' },
      { title: 'Framework disease', body: 'Memorizing RICE / ICE / JTBD does not make you a PM. Taste and judgment do, and neither comes from a deck.' },
    ],
    vignette: {
      morning: 'You kill a meeting that was going to waste an hour, rewrite the spec that triggered it, and ship the one-pager by 10.',
      midday: 'You sit with an engineer debugging a prod issue, learn the thing you have been dodging learning, and use it to re-scope the next sprint.',
      lateafternoon: 'You convince a senior PM to cut a feature in half. You write a clean decision doc. Your manager CCs the VP.',
      ceiling: 'VP of Product at a top-tier company, the person the CEO asks when a tough call is about to be made, an opinionated book of work.',
    },
  },
  'Entrepreneurship & Innovation': {
    shortName: 'Startup',
    tagline: 'Building from zero.',
    comp: { earlyBase: 90_000, midBase: 180_000, top10Tcc: 2_000_000 },
    hotCities: ['San Francisco', 'New York', 'Austin', 'Los Angeles', 'Miami'],
    anchorCompanies: {
      tier1: ['Y Combinator', 'Sequoia', 'Andreessen Horowitz', 'Benchmark', 'Founders Fund'],
      tier2: ['Stripe', 'Notion', 'Figma', 'Ramp', 'Linear'],
      scaleup: ['Anthropic', 'Perplexity', 'Mercury', 'Vercel', 'Retool'],
    },
    coreSkills: ['Talking to users', 'Shipping weekly', 'Fundraising narrative', 'One functional area deeply', 'Writing a crisp deck'],
    rubric: [
      'Can you articulate the wedge in one sentence',
      'Can you ship without asking permission',
      'Do you talk to 20 users a month, unprompted',
      'Can you recruit someone better than you',
      'Can you keep going on the day no one believes you',
    ],
    skillQueries: ['startup fundraising', 'yc application', 'founder sales'],
    threats: [
      { title: 'Wedge-less startup', body: 'Most startups die because the wedge is not sharp. If you cannot finish the "we are 10x better at X for Y" sentence, you do not have a company yet.' },
      { title: 'Premature team', body: 'Hiring before product-market fit kills runway and morale. Stay small and weird until the customer yanks you forward.' },
      { title: 'Two-in-a-box', body: 'Cofounder misalignment is the #1 killer of pre-seed companies. The person next to you matters more than the idea.' },
    ],
    vignette: {
      morning: 'You ship a version of the app at 2am, your co-founder finds a bug at 8, you fix it in the car on the way to a customer call.',
      midday: 'You pitch a potential design partner, close them for a paid pilot, and spend the walk back drafting the contract.',
      lateafternoon: 'You talk to three investors, one says yes, two say interesting-let\'s-stay-in-touch, and you know exactly which of those is the lie.',
      ceiling: 'Public company founder, or a quiet acquisition that pays for the rest of your life, your name a link other founders DM about.',
    },
  },
  'Electrical & Computer Engineering': {
    shortName: 'ECE',
    tagline: 'Circuits, signals, and the metal layer.',
    comp: { earlyBase: 120_000, midBase: 180_000, top10Tcc: 320_000 },
    hotCities: ['San Francisco', 'Seattle', 'Austin', 'San Diego', 'Boston'],
    anchorCompanies: {
      tier1: ['Apple', 'Nvidia', 'Qualcomm', 'Intel', 'AMD'],
      tier2: ['Google', 'Microsoft', 'Tesla', 'Amazon', 'Meta'],
      scaleup: ['Cerebras', 'Groq', 'Rivos', 'Astera Labs', 'Anduril'],
    },
    coreSkills: ['Digital design basics', 'Signal processing', 'Embedded C / systems code', 'Verification mindset', 'Reading datasheets'],
    rubric: [
      'Can you read a schematic without hand-holding',
      'Do you understand the verification loop',
      'Can you close timing on a real design',
      'Can you bring up a board without panic',
      'Can you pick the right abstraction layer',
    ],
    skillQueries: ['digital design', 'verilog', 'embedded systems'],
    threats: [
      { title: 'Software gravity', body: 'Every ECE grad is tempted into SWE. Fine - but be explicit. If you are doing SWE, be a SWE. Hybrid identities get paid like neither.' },
      { title: 'Cycle downturns', body: 'Semi hiring is cyclical. If you plan your first 5 years without a contingency, a down-cycle can strand you.' },
      { title: 'Toolchain lock-in', body: 'Cadence, Synopsys, proprietary tools - great in-house, rusty skills when you leave. Keep one open-source project you contribute to on the side.' },
    ],
    vignette: {
      morning: 'You stand up at a new silicon board, run your bring-up checklist, and find the DDR alignment issue the lead assumed was a software bug.',
      midday: 'You sit in on an IP license review, push back on a vendor timeline, and save the team three weeks of rework.',
      lateafternoon: 'You pair with a staff designer on a block spec. You go home knowing your name is on the tapeout list.',
      ceiling: 'Chief architect at a marquee chip company, your name on a block that has shipped in 50 million devices.',
    },
  },
  'Mechanical & Aerospace Engineering': {
    shortName: 'MechE / Aero',
    tagline: 'Solids, fluids, and the discipline of flight.',
    comp: { earlyBase: 95_000, midBase: 155_000, top10Tcc: 260_000 },
    hotCities: ['Los Angeles', 'Seattle', 'Houston', 'Detroit', 'San Francisco'],
    anchorCompanies: {
      tier1: ['SpaceX', 'Boeing', 'Lockheed Martin', 'Northrop Grumman', 'Tesla'],
      tier2: ['Rivian', 'Anduril', 'Raytheon', 'GE Aerospace', 'Honeywell'],
      scaleup: ['Relativity Space', 'Astranis', 'Varda', 'Impulse Space', 'Stoke Space'],
    },
    coreSkills: ['CAD (SolidWorks / NX) fluency', 'FEA basics', 'Materials + tolerance sense', 'Manufacturing reality', 'Spec → drawing'],
    rubric: [
      'Can you pick the right material for a load case',
      'Do you understand the drawing you released',
      'Can you sit with a machinist and not get laughed at',
      'Can you estimate before you simulate',
      'Do you know when to over-design and when not to',
    ],
    skillQueries: ['solidworks fundamentals', 'fea basics', 'gd&t'],
    threats: [
      { title: 'Primes vs new-space', body: 'Big primes pay steadier; new-space moves faster and pays more if the company hits. The bet you make by 26 shapes your 30s.' },
      { title: 'Fab-floor distance', body: 'An engineer who never walks the floor loses the knack. Get your hands dirty every quarter.' },
      { title: 'Systems-eng trap', body: 'Systems engineering is vital and invisible. Stay in it too long and you become a coordinator, not an engineer.' },
    ],
    vignette: {
      morning: 'You sit with a technician doing the final assembly of a part you designed. You find a tolerance you called too loose and sign a change order before lunch.',
      midday: 'You present a failure analysis from last week\'s hot-fire to the lead, who agrees with you and asks you to write the redesign scope.',
      lateafternoon: 'You stay late watching a test, wheel your CAD view onto the big screen, and push through a version that trims 4 grams off a bracket.',
      ceiling: 'Chief engineer on a launch system, or a principal at a prime, your name attached to a thing that actually flies.',
    },
  },
  'Healthcare & Clinical': {
    shortName: 'Healthcare',
    tagline: 'Clinical reasoning and patient outcomes.',
    comp: { earlyBase: 70_000, midBase: 220_000, top10Tcc: 500_000 },
    hotCities: ['New York', 'Boston', 'Houston', 'Los Angeles', 'Chicago'],
    anchorCompanies: {
      tier1: ['Mass General Brigham', 'Cleveland Clinic', 'Kaiser Permanente', 'Johns Hopkins', 'NYU Langone'],
      tier2: ['UCSF', 'Stanford Health', 'Mayo Clinic', 'Penn Medicine', 'Cedars-Sinai'],
      scaleup: ['One Medical', 'Oak Street Health', 'Forward Health', 'Ro', 'Hims'],
    },
    coreSkills: ['Clinical reasoning', 'Interpreting imaging / labs', 'Patient communication', 'Procedure proficiency', 'Evidence-based practice'],
    rubric: [
      'Can you present a case tight and complete',
      'Do you know what you do not know',
      'Can you hold bad news and explain it with grace',
      'Can you sit with a differential you cannot yet resolve',
      'Can you work a shift that goes sideways',
    ],
    skillQueries: ['clinical reasoning', 'patient communication', 'evidence based medicine'],
    threats: [
      { title: 'Burnout', body: 'The clinical attrition rate is not a joke. Build peer systems early; they are what keeps you in the work at year seven.' },
      { title: 'Admin creep', body: 'Every year of charting adds more screens, less patient contact. Fight for the shape of your practice before it is designed for you.' },
      { title: 'Sub-specialty lock-in', body: 'Sub-specialty training pays, but closes doors. Know the tradeoff before you decide.' },
    ],
    vignette: {
      morning: 'You round on your patients, catch that a med reconciliation missed a potassium-sparer, and call the outgoing team before the AM handoff.',
      midday: 'You present a complicated case in grand rounds. A senior asks a question you anticipated; you have the answer ready.',
      lateafternoon: 'You sit with a family and walk them through a difficult decision. You do not rush. They tell you, later, that you made the hardest day bearable.',
      ceiling: 'Division chief at a top system, a name on a paper the specialty references, a list of people who trained under you running departments of their own.',
    },
  },
  'Biotech & Pharmaceutical': {
    shortName: 'Biotech',
    tagline: 'Molecules, trials, and regulation.',
    comp: { earlyBase: 90_000, midBase: 160_000, top10Tcc: 290_000 },
    hotCities: ['Boston', 'San Francisco', 'San Diego', 'New York', 'Philadelphia'],
    anchorCompanies: {
      tier1: ['Vertex', 'Genentech', 'Regeneron', 'Moderna', 'Gilead'],
      tier2: ['Amgen', 'AstraZeneca', 'Pfizer', 'Merck', 'Biogen'],
      scaleup: ['Insitro', 'Recursion', 'Altos Labs', 'Xaira', 'Generate Biomedicines'],
    },
    coreSkills: ['Assay design', 'Statistical literacy', 'Regulatory awareness', 'Literature fluency', 'Lab technique'],
    rubric: [
      'Can you design an experiment with a real null',
      'Do you understand what your assay is measuring',
      'Can you read a clinical trial write-up and find the flaws',
      'Can you present data to a non-scientist decision-maker',
      'Do you know the regulatory path for your modality',
    ],
    skillQueries: ['clinical trial design', 'regulatory pathway', 'drug discovery'],
    threats: [
      { title: 'Bench → desk drift', body: 'Every biotech grad wants the management path; few realize how much technical credit it costs. Choose the shape of your leverage.' },
      { title: 'Small-pharma instability', body: 'Startup biotech funding moves in violent cycles. Be ready for two companies in your first decade.' },
      { title: 'The "I did a screen once" trap', body: 'Being casual about one technique ends careers when the field moves. Be serious about two, casual about five.' },
    ],
    vignette: {
      morning: 'You come in early to pull a western that finished overnight, and find that the new construct actually expresses. You send the band to your PI.',
      midday: 'You lead a lit-review session on a competing mechanism of action. You spot the flaw the paper glossed over, and flag it in the next team meeting.',
      lateafternoon: 'You sit in on a regulatory call about your IND, take notes that become the running playbook for the next study. You leave at 7.',
      ceiling: 'VP of R&D at a biotech, your program hitting readouts people quote, a CSO seat on the far horizon.',
    },
  },
  'Physical Sciences & Math': {
    shortName: 'Physics / Math',
    tagline: 'The math that underwrites everything.',
    comp: { earlyBase: 150_000, midBase: 260_000, top10Tcc: 500_000 },
    hotCities: ['New York', 'San Francisco', 'Chicago', 'Boston', 'Seattle'],
    anchorCompanies: {
      tier1: ['Citadel', 'Jane Street', 'Two Sigma', 'DE Shaw', 'Hudson River Trading'],
      tier2: ['Google DeepMind', 'OpenAI', 'Anthropic', 'Meta FAIR', 'Microsoft Research'],
      scaleup: ['PDT Partners', 'Cubist', 'Squarepoint', 'Voloridge', 'Tower Research'],
    },
    coreSkills: ['Probability + stats depth', 'Linear algebra + numerical methods', 'Python for research', 'Proof intuition', 'Comfort with abstraction'],
    rubric: [
      'Can you work a probability problem in your head',
      'Do you understand the assumptions baked into the model',
      'Can you code the thing you are claiming in the paper',
      'Can you explain why a method fails',
      'Can you communicate with someone who does not speak math',
    ],
    skillQueries: ['linear algebra', 'probability theory', 'machine learning fundamentals'],
    threats: [
      { title: 'The academic-postdoc tax', body: 'Staying in academia past a second postdoc is a math problem: the pay, the geography, and the option cost all compound against you.' },
      { title: 'Quant burnout', body: 'The quant path pays, but the first three years are unforgiving. Build exit optionality before year five or you will regret the trade.' },
      { title: 'Theory-to-industry gap', body: 'A brilliant theorist who cannot ship code lasts 12 months in industry. Learn to engineer enough to not be helpless.' },
    ],
    vignette: {
      morning: 'You read a new paper on the train in, catch an assumption you can exploit, and have code running by 10.',
      midday: 'You sit with a senior quant and walk through the backtest. Your results hold. He nods - the closest thing you will get to applause.',
      lateafternoon: 'You write a one-page memo for the PM explaining why the signal decays with capacity. You leave knowing it will be read.',
      ceiling: 'Partner at a top quant fund, or a chaired professorship at a top department, or both, consecutively.',
    },
  },
  'Civil & Environmental Engineering': {
    shortName: 'Civil / Env',
    tagline: 'The built world and its constraints.',
    comp: { earlyBase: 80_000, midBase: 130_000, top10Tcc: 220_000 },
    hotCities: ['New York', 'Los Angeles', 'Houston', 'Dallas', 'Denver'],
    anchorCompanies: {
      tier1: ['AECOM', 'WSP', 'Arup', 'Jacobs', 'Bechtel'],
      tier2: ['HDR', 'Stantec', 'CDM Smith', 'Kiewit', 'Gensler'],
      scaleup: ['Kodiak Robotics', 'Built Robotics', 'Culdesac', 'Pallet', 'Sidewalk Labs'],
    },
    coreSkills: ['Structural / hydraulic fundamentals', 'Code + permit fluency', 'Drafting + specs', 'Site judgment', 'Cost + schedule sense'],
    rubric: [
      'Can you read a drawing and find the error',
      'Do you know the code that applies to your project',
      'Can you sit with a contractor and not get rolled',
      'Can you estimate cost within 20%',
      'Do you hold your site visit discipline',
    ],
    skillQueries: ['structural analysis', 'environmental compliance', 'construction management'],
    threats: [
      { title: 'PE license slip', body: 'The PE is not optional in this field. Not taking it on time costs you $15-25K a year, quietly, forever.' },
      { title: 'Generalist stall', body: 'Broad civil without a sub-discipline (water, transport, structural) stalls at senior. Choose one by year three.' },
      { title: 'AEC comp ceiling', body: 'Pure consulting engineering caps. The exit to owner-side or construction-tech is where the real comp lives.' },
    ],
    vignette: {
      morning: 'You do a site walk, spot a pour that is off spec, call it, and save the owner a four-week rework.',
      midday: 'You meet with the city on a permit variance. You bring the code section pre-highlighted. You leave with a conditional approval.',
      lateafternoon: 'You redline a set of contract drawings and send them back to the architect with notes tight enough that they cannot argue.',
      ceiling: 'Partner at a respected firm, your stamp on a landmark project, your name on the city\'s shortlist for any serious RFP.',
    },
  },
  'Chemical & Biomedical Engineering': {
    shortName: 'ChemE / BME',
    tagline: 'Reactions, unit ops, and devices.',
    comp: { earlyBase: 90_000, midBase: 150_000, top10Tcc: 270_000 },
    hotCities: ['Boston', 'Houston', 'San Diego', 'San Francisco', 'Philadelphia'],
    anchorCompanies: {
      tier1: ['Genentech', 'Regeneron', 'Vertex', 'ExxonMobil', 'Medtronic'],
      tier2: ['Moderna', 'Amgen', 'Dow', 'Abbott', 'Baxter'],
      scaleup: ['Insitro', 'Recursion', 'Spring Discovery', 'Insmed', 'EdenceHealth'],
    },
    coreSkills: ['Unit operations fluency', 'Process control basics', 'Thermodynamics + kinetics', 'Scale-up reality', 'Regulatory + GMP awareness'],
    rubric: [
      'Can you do a mass balance on paper',
      'Do you know when a correlation does not apply',
      'Can you read a P&ID',
      'Can you write a deviation investigation',
      'Can you defend a process change with data',
    ],
    skillQueries: ['process engineering', 'scale up', 'gmp manufacturing'],
    threats: [
      { title: 'Commodity-chem trap', body: 'Commodity chemicals are stable, specialty is rewarding, biotech is volatile. Know which you are in.' },
      { title: 'Loss of plant time', body: 'Engineers who never set foot on a plant floor become easy to replace. Rotate into ops every 2-3 years.' },
      { title: 'Regulatory shock', body: 'A scheduled change in environmental or FDA regulation can wipe a specialty. Read the notices.' },
    ],
    vignette: {
      morning: 'You pull overnight batch data, spot that a pH transmitter is drifting, and call ops to swap before the next batch loads.',
      midday: 'You present a lean-out project for a reactor. You argue for a capex swap that saves eight hours per campaign. It goes to plant manager review.',
      lateafternoon: 'You sit with a QA lead to write a deviation. Your version holds up in the next audit without a single finding.',
      ceiling: 'VP of manufacturing at a real pharma or chemical firm, a plant with your fingerprints on the P&IDs, a team people come back to work for.',
    },
  },
  'Design & Creative Arts': {
    shortName: 'Design',
    tagline: 'Systems, type, motion, and taste as output.',
    comp: { earlyBase: 100_000, midBase: 170_000, top10Tcc: 330_000 },
    hotCities: ['San Francisco', 'New York', 'Los Angeles', 'Seattle', 'Austin'],
    anchorCompanies: {
      tier1: ['Apple', 'Airbnb', 'Figma', 'Stripe', 'Linear'],
      tier2: ['Google', 'Meta', 'Notion', 'Shopify', 'Netflix'],
      scaleup: ['Arc', 'Cursor', 'Granola', 'Vercel', 'Retool'],
    },
    coreSkills: ['Figma fluency', 'Information architecture', 'Writing', 'Motion + prototyping', 'Design-system thinking'],
    rubric: [
      'Can you articulate the brief better than the PM',
      'Do you know what good looks like, and why',
      'Can you write the copy that ships',
      'Can you ship a shippable file, not just a mood board',
      'Can you debate a senior engineer without losing the thread',
    ],
    skillQueries: ['figma systems', 'design critique', 'ux writing'],
    threats: [
      { title: 'Agency drift', body: 'Years at an agency polish the craft, erode product instincts. Move in-house before the opportunity cost compounds.' },
      { title: 'AI commoditizing "visual"', body: 'Aesthetic work without product + systems thinking is being eaten. Your moat is judgment, not comps.' },
      { title: 'Portfolio decay', body: 'Designers who stop posting work stop getting found. Ship something public quarterly or you disappear.' },
    ],
    vignette: {
      morning: 'You push a redesign that cleaned up a cluttered flow. The PR lands. The PM sends a screenshot to the whole company.',
      midday: 'You lead a crit session. Your notes land without defensiveness. Two juniors ping you afterwards to thank you.',
      lateafternoon: 'You ship a one-pager pitching a new surface. The head of design reads it, replies "let\'s do it," and you go home knowing your week bought real leverage.',
      ceiling: 'Head of design at a top product company, a body of work the field references, a seat at the strategy table the org will not fill without you.',
    },
  },
  'Media & Communications': {
    shortName: 'Media',
    tagline: 'Narrative, reporting, and the honest sentence.',
    comp: { earlyBase: 65_000, midBase: 130_000, top10Tcc: 260_000 },
    hotCities: ['New York', 'Los Angeles', 'San Francisco', 'Washington DC', 'Chicago'],
    anchorCompanies: {
      tier1: ['The New York Times', 'The Wall Street Journal', 'The New Yorker', 'The Atlantic', 'Netflix'],
      tier2: ['Bloomberg', 'NPR', 'The Washington Post', 'ProPublica', 'Axios'],
      scaleup: ['Substack', 'Puck', '404 Media', 'The Information', 'Semafor'],
    },
    coreSkills: ['Clear writing', 'Source cultivation', 'Fact-checking discipline', 'Understanding a beat', 'Voice - your own'],
    rubric: [
      'Can you lede in a sentence',
      'Do you have a source who will pick up at 11pm',
      'Can you kill your own precious draft',
      'Can you pitch a story and hear no without flinching',
      'Can you fact-check under deadline',
    ],
    skillQueries: ['investigative journalism', 'narrative writing', 'interview technique'],
    threats: [
      { title: 'Industry compression', body: 'Legacy newsrooms are not the career anchors they once were. Build a personal reader base before you need one.' },
      { title: 'Paywall gating', body: 'Writers without a direct relationship with readers are at the mercy of the platform they publish on. Own an email list by year three.' },
      { title: 'Beatlessness', body: 'Generalists at large publications get stuck on rewrite desks. Pick a beat and go deep, fast.' },
    ],
    vignette: {
      morning: 'You call a source you cultivated for six months. They tell you something on background that changes the shape of your next piece.',
      midday: 'You sit with your editor, defend a lede, win the argument, and file at 5pm.',
      lateafternoon: 'Your piece goes live at 7. By midnight, three peers have DMed to say they wish they had written it. You know the metric that actually matters.',
      ceiling: 'A staff writer at a masthead, a book that made the Times list, a column that moves conversations you care about.',
    },
  },
  'Economics & Public Policy': {
    shortName: 'Econ / Policy',
    tagline: 'Markets, incentives, and evidence.',
    comp: { earlyBase: 90_000, midBase: 160_000, top10Tcc: 320_000 },
    hotCities: ['Washington DC', 'New York', 'San Francisco', 'Boston', 'Chicago'],
    anchorCompanies: {
      tier1: ['Federal Reserve', 'US Treasury', 'The World Bank', 'IMF', 'McKinsey'],
      tier2: ['Congressional Research Service', 'Brookings', 'RAND', 'Bain Public Sector', 'Mathematica'],
      scaleup: ['Open Philanthropy', 'Applied Intuition', 'Palantir Gov', 'Anduril', 'Niantic Labs Policy'],
    },
    coreSkills: ['Econometric literacy', 'Policy writing', 'Statistical software (Stata/R/Python)', 'Legislative process', 'Memo craft'],
    rubric: [
      'Can you write a one-pager an elected official will actually read',
      'Do you know what identification strategy you have, and its limits',
      'Can you debate an ideological opponent on the facts',
      'Can you talk to a practitioner without condescending',
      'Can you hold a priors update when the data changes',
    ],
    skillQueries: ['econometrics', 'policy analysis', 'regression'],
    threats: [
      { title: 'The DC → NY arbitrage', body: 'Policy pays modestly; the exit to private sector or international orgs is the comp lift. Plan it before you need it.' },
      { title: 'PhD detour cost', body: 'A PhD in econ is a 7-year bet. The option value is high; the cash cost is higher. Make the decision with eyes open.' },
      { title: 'Ideological pigeonhole', body: 'Taking a visible stance too early closes doors across the aisle. Reputations in DC are long-lived.' },
    ],
    vignette: {
      morning: 'You finish an analysis that quantifies a policy impact nobody has nailed down. You send it to an old professor, who nods.',
      midday: 'You sit in a meeting on the Hill, watch a staffer absorb your one-pager, and see it referenced in a hearing an hour later.',
      lateafternoon: 'You write a memo you know will be read by a principal. You keep the stance crisp and the caveats honest.',
      ceiling: 'A senior role at Treasury or the Fed, a book people read, a seat at tables that decide how millions of people live.',
    },
  },
  'Life Sciences & Research': {
    shortName: 'Life Sci',
    tagline: 'From bench to insight.',
    comp: { earlyBase: 65_000, midBase: 120_000, top10Tcc: 240_000 },
    hotCities: ['Boston', 'San Francisco', 'San Diego', 'New York', 'Philadelphia'],
    anchorCompanies: {
      tier1: ['Broad Institute', 'HHMI', 'NIH', 'Stanford', 'Whitehead'],
      tier2: ['Genentech', 'Regeneron', 'Vertex', 'Moderna', 'Gilead'],
      scaleup: ['Insitro', 'Recursion', 'Arc Institute', 'Altos', 'Xaira'],
    },
    coreSkills: ['Experimental design', 'Lab technique', 'Literature fluency', 'Statistical rigor', 'Figure making'],
    rubric: [
      'Can you design a clean experiment',
      'Do you understand the failure modes of your assay',
      'Can you read a paper and find the hole',
      'Can you present to a non-specialist',
      'Can you sit with a negative result and not flinch',
    ],
    skillQueries: ['experimental design', 'lab techniques', 'scientific writing'],
    threats: [
      { title: 'Academia math', body: 'The tenure-track odds are brutal. Make industry side-bets early, even if only to know what you are giving up.' },
      { title: 'PI bottleneck', body: 'Your PI\'s career shapes yours for years. Pick one who advocates for their trainees, not one who hoards credit.' },
      { title: 'Tech transfer trap', body: 'Research without a translational arc ages poorly. Translate at least one project to an application, even loosely.' },
    ],
    vignette: {
      morning: 'You finish a lit dive, find a related paper that just came out, and integrate its result into your talk before the 10am group meeting.',
      midday: 'You rerun a control your PI questioned. It holds. You update the figure without saying I told you so.',
      lateafternoon: 'You pair with a postdoc on a manuscript revision. You fix the figure caption that made a reviewer angry. You go home at a decent hour.',
      ceiling: 'Your own lab at a top institution, or a senior IC at a top biotech, a paper or patent a decade of students cite.',
    },
  },
  'Law & Government': {
    shortName: 'Law',
    tagline: 'Cases, briefs, and institutional craft.',
    comp: { earlyBase: 225_000, midBase: 450_000, top10Tcc: 1_200_000 },
    hotCities: ['New York', 'Washington DC', 'San Francisco', 'Chicago', 'Los Angeles'],
    anchorCompanies: {
      tier1: ['Cravath', 'Wachtell', 'Sullivan & Cromwell', 'Skadden', 'Davis Polk'],
      tier2: ['Latham', 'Kirkland & Ellis', 'DOJ', 'SEC', 'US Attorney\'s Office'],
      scaleup: ['Stripe Legal', 'OpenAI Legal', 'Anthropic Legal', 'Atrium (in-house)', 'Airbnb Legal'],
    },
    coreSkills: ['Legal writing', 'Reading cases fast', 'Contract fluency', 'Oral advocacy', 'Client counseling'],
    rubric: [
      'Can you brief a case in one paragraph',
      'Can you spot the material issue in a contract',
      'Do you maintain composure under pressure',
      'Can you tell a client they are wrong without losing them',
      'Can you write a motion the judge will not skim',
    ],
    skillQueries: ['legal writing', 'contract drafting', 'case law research'],
    threats: [
      { title: 'Biglaw attrition', body: 'First-year classes halve by year five. Know your exit - in-house, government, or partnership - before your burnout picks it for you.' },
      { title: 'Speciality lock-in', body: 'Picking a speciality too early narrows your book. Picking it too late stalls your comp.' },
      { title: 'Reputation fragility', body: 'One missed filing or misunderstood ethics rule can end a career. The margin for error is narrower than it looks.' },
    ],
    vignette: {
      morning: 'You come in at 8, redline a brief the partner left at midnight. You flag a cite the junior got wrong, and keep the partner out of a footnote fight.',
      midday: 'You sit in on a deal call. You speak once, with a point that opens a path the lead had not seen. The client asks for you by name on the next call.',
      lateafternoon: 'You draft an opinion letter. You write clean English a judge can follow. You log 10 hours billable and go home at a civilized time.',
      ceiling: 'Partner at a top firm, a client roster that follows you wherever you go, a name young associates want to train under.',
    },
  },
  'Education & Human Development': {
    shortName: 'Education',
    tagline: 'Pedagogy, lesson design, and the classroom craft.',
    comp: { earlyBase: 55_000, midBase: 90_000, top10Tcc: 200_000 },
    hotCities: ['New York', 'Chicago', 'Los Angeles', 'Boston', 'Washington DC'],
    anchorCompanies: {
      tier1: ['NYC DOE', 'Uncommon Schools', 'KIPP', 'Teach For America', 'Success Academy'],
      tier2: ['Chicago Public Schools', 'LAUSD', 'DC Public Schools', 'Boston Public Schools', 'Charter Growth Fund'],
      scaleup: ['Duolingo', 'Khan Academy', 'Outschool', 'Numerade', 'Primer'],
    },
    coreSkills: ['Lesson planning', 'Classroom management', 'Data-informed instruction', 'Content depth', 'Family communication'],
    rubric: [
      'Can you teach the same topic three different ways',
      'Do you know your students by name by week two',
      'Can you hold a parent meeting that ends well',
      'Can you adjust a plan mid-lesson when it is not landing',
      'Can you work in a team where the goals are long',
    ],
    skillQueries: ['lesson design', 'classroom management', 'teaching reading'],
    threats: [
      { title: 'The 5-year exit', body: 'Teacher attrition peaks year 3-5. Knowing why teachers leave makes you the one who stays, if you choose to.' },
      { title: 'Pay compression', body: 'Steps and lanes cap real growth. The real comp moves come from leadership, specialty certifications, or edtech.' },
      { title: 'System churn', body: 'Curriculum initiatives reset every 2-3 years. Keep a grip on the pedagogy, not the program.' },
    ],
    vignette: {
      morning: 'You notice a student is disengaged. You change a seat. You pick up on something at recess and the day turns around.',
      midday: 'You run a reading block that lands. Three students who had been quiet raise their hands in the same hour.',
      lateafternoon: 'You meet with a family. You lead with a student\'s strength. They leave grateful. You stay late to plan tomorrow with exactly that kid in mind.',
      ceiling: 'Principal of a school with waitlists, an instructional leader whose team retains, a reputation that draws serious teachers.',
    },
  },
  'Social Sciences & Nonprofit': {
    shortName: 'Social / NP',
    tagline: 'People, institutions, and mission-driven work.',
    comp: { earlyBase: 55_000, midBase: 90_000, top10Tcc: 180_000 },
    hotCities: ['New York', 'Washington DC', 'San Francisco', 'Chicago', 'Los Angeles'],
    anchorCompanies: {
      tier1: ['Gates Foundation', 'Ford Foundation', 'Robin Hood', 'Open Society', 'MacArthur Foundation'],
      tier2: ['Teach For America', 'City Year', 'Ed Trust', 'Urban Institute', 'Brookings'],
      scaleup: ['Charity Navigator', 'Giving Multiplier', 'Vera Institute', 'Last Mile', 'Rocket Learning'],
    },
    coreSkills: ['Program design', 'Grant writing', 'Stakeholder management', 'Basic data analysis', 'Coalition building'],
    rubric: [
      'Can you pitch a program in two minutes',
      'Do you know the funders in your sector by name',
      'Can you read an evaluation without overclaiming',
      'Can you hold a room of competing constituencies',
      'Can you fundraise without sounding desperate',
    ],
    skillQueries: ['grant writing', 'program evaluation', 'coalition building'],
    threats: [
      { title: 'Mission-driven comp', body: 'The pay discount is real. Use early years to build skills a cross-sector employer will pay a premium for later.' },
      { title: 'Burnout from proximity', body: 'Working close to hard problems without systems in place ends careers. Build real boundaries, not just guilt.' },
      { title: 'Grant cycle whiplash', body: 'Funding is lumpy and political. Programs built on one grant are fragile.' },
    ],
    vignette: {
      morning: 'You finish a grant report that shows the program is working. You send it to the funder with a short note that lands exactly right.',
      midday: 'You sit with a community partner. You listen more than you talk. You leave with a better theory of change.',
      lateafternoon: 'You rewrite a program evaluation to make the findings accessible to board members who do not have a research background. They read it. They act on it.',
      ceiling: 'Executive director of an organization whose name opens doors, a board seat at a peer institution, policy wins you can point at.',
    },
  },
}

/** Fallback for any cohort not present above. */
const DEFAULT_PLAYBOOK: CohortPlaybook = {
  shortName: 'Your Field',
  tagline: 'Your craft, your leverage.',
  comp: { earlyBase: 80_000, midBase: 130_000, top10Tcc: 230_000 },
  hotCities: ['New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Austin'],
  anchorCompanies: {
    tier1: ['Top firms in your field'],
    tier2: ['Respected firms in your field'],
    scaleup: ['Fast-growth firms in your field'],
  },
  coreSkills: ['The canonical skills of your field', 'The tools people actually use', 'Writing clearly', 'Working with a team', 'Holding a standard'],
  rubric: [
    'Can you do the work',
    'Can you explain the work',
    'Can you defend the work under pressure',
    'Can you raise the work above where you found it',
    'Can you lead people into it after you',
  ],
  skillQueries: ['career fundamentals', 'interviewing', 'workplace communication'],
  threats: [
    { title: 'Drift', body: 'A career without a deliberate next step becomes whatever is in front of you. Set a direction every six months.' },
    { title: 'Invisibility', body: 'Good work without a record is hard to cash in later. Keep a paper trail of what you have shipped.' },
    { title: 'Tool dependency', body: 'Skills that only work inside your current employer do not port. Invest in something transferable.' },
  ],
  vignette: {
    morning: 'You come in and do the thing you are better at than most. You do not flinch from the hard part.',
    midday: 'You help someone younger. It costs you 20 minutes. It will pay back for a decade.',
    lateafternoon: 'You close something you said you would close. You go home without it hanging over the evening.',
    ceiling: 'The senior role in your field, respected for doing the work, not for managing people who do the work.',
  },
}

/** Pick the most relevant playbook for the user's cohorts. Priority
 *  order: first cohort in the user's list. Falls back to default. */
export function resolvePlaybook(cohorts: string[] | null | undefined): CohortPlaybook {
  if (!Array.isArray(cohorts) || cohorts.length === 0) return DEFAULT_PLAYBOOK
  for (const c of cohorts) {
    const hit = COHORTS[c]
    if (hit) return hit
  }
  return DEFAULT_PLAYBOOK
}

export function playbookFor(cohort: string): CohortPlaybook {
  return COHORTS[cohort] || DEFAULT_PLAYBOOK
}

export { COHORTS as ALL_PLAYBOOKS }
