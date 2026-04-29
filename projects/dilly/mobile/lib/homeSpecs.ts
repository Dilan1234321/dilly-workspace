/**
 * Tier-2 Home specs - per-user_path data blocks that feed a shared
 * render. 10 paths that don't warrant a full Rung-3 bespoke Home
 * (VeteranHome, ParentReturningHome etc live in SituationHomes.tsx)
 * still deserve to feel written-for-them. Same visual grammar as
 * the bespoke Homes; different eyebrow, greeting, hero, prompts,
 * tone, and market label.
 *
 * Shape per path:
 *   eyebrow, greetingLine, tone (hex)
 *   hero: { kicker, head, body, ctaLabel, seed }
 *   prompts: [{ text, seed }, ...]  // usually 3
 *   marketLabel
 *   growthNudge?  // shown when factCount is low
 *
 * Unknown paths fall through to a neutral DEFAULT_SPEC so the
 * TieredSeekerHome can always render something reasonable.
 */

export interface HomeSpecHero {
  kicker: string;
  head: string;
  body: string;
  ctaLabel: string;
  seed: string;
}

export interface HomeSpecPrompt {
  text: string;
  seed: string;
}

export interface HomeSpec {
  eyebrow: string;
  greetingLine: string;
  tone: string;
  hero: HomeSpecHero;
  prompts: HomeSpecPrompt[];
  marketLabel: string;
  growthNudge?: string;
  /** Per-path framing for the MoatCard on the home screen. Tells
   *  the user in their own voice WHY each fact Dilly captures
   *  matters for THIS situation. Falls through to a generic line
   *  in TieredSeekerHome when omitted. */
  moatFraming?: string;
}


export const DEFAULT_SPEC: HomeSpec = {
  eyebrow: 'TODAY',
  greetingLine: "let's take a look.",
  tone: '#4F46E5',
  hero: {
    kicker: 'WHERE TO START',
    head: "Here's the honest\npicture of your week.",
    body: "Pick one thing. Do it. Tell Dilly how it went. That's the whole loop - and it's the only one that compounds.",
    ctaLabel: 'Talk to Dilly',
    seed: "Help me figure out what's actually worth focusing on this week. Ask me what I've already been chewing on.",
  },
  prompts: [
    { text: "What's the one thing I should do this week?",
      seed: "Help me pick the ONE thing for this week that actually moves my career. Ask me what I've been putting off." },
    { text: "Where am I stuck right now?",
      seed: "Help me name where I'm actually stuck. Not the surface version. Ask me questions that get at the real blocker." },
    { text: "What would a good week look like?",
      seed: "Help me describe what a good career-week looks like for me right now. Make it concrete enough that I'd know I hit it." },
  ],
  marketLabel: 'live roles Dilly is tracking',
};


export const HOME_SPECS: Record<string, HomeSpec> = {
  // Default student - keep SeekerHome vibe but with spec-driven
  // tailoring that explicitly acknowledges where they are.
  student: {
    eyebrow: 'STUDENT MODE',
    greetingLine: "the market doesn't wait, but you're ready.",
    tone: '#4F46E5',
    hero: {
      kicker: 'THE FIRST-REAL-JOB MOVE',
      head: "Pick the one bet\nworth making this semester.",
      body: "You don't need ten applications. You need one concrete artifact that proves you can do the work. A project, an internship log, a conversation that turns into a referral.",
      ctaLabel: "Plan my semester move",
      seed: "I'm a student working on my first real career move (internship or full-time). Help me pick the ONE concrete thing to invest in this semester. Ask me my year and field.",
    },
    prompts: [
      { text: "What should I build before graduation?",
        seed: "Help me design one portfolio-worthy project I can actually finish by end of semester. Ask me what tools I already know." },
      { text: "Which companies should I actually apply to?",
        seed: "Help me build a target list of 10 companies for my field and year. Explain why each makes the list. Ask me what I'm studying." },
      { text: "How do I land the informational coffee that leads to a referral?",
        seed: "Help me write a cold outreach message for an informational conversation that actually leads somewhere. Ask me who I'm trying to reach." },
    ],
    marketLabel: "entry-level roles Dilly is tracking",
    growthNudge: "Tell Dilly about one class, one club, one side project. That's what makes the resume writable.",
    moatFraming: "Every class, club, and project — captured. Each one fuels what Dilly does for you next.",
  },

  career_switch: {
    eyebrow: 'THE BRIDGE',
    greetingLine: "your old skills are still valid here.",
    tone: '#7C3AED',
    hero: {
      kicker: 'READING A NEW MAP',
      head: "The skills you had\nare part of the pitch.",
      body: "You are not starting over. You are translating. Every real pivot lands somewhere that values the through-line from your old field to the new one. Find the bridge role, not the dream role, first.",
      ctaLabel: "Name the bridge role",
      seed: "I'm switching careers. Help me find the bridge role - the one that values what I already did AND points at where I'm going. Ask me what I'm switching from and into.",
    },
    prompts: [
      { text: "Which of my old skills actually transfer?",
        seed: "Help me list the skills from my previous career that legitimately transfer into my target field. Be honest - if some don't, say so. Ask me what I did before." },
      { text: "What's the one-sentence story for why I'm switching?",
        seed: "Help me write a clean, non-defensive one-sentence answer to 'why are you leaving X for Y' that I can use in every interview. Ask me the real reason." },
      { text: "Who will hire a switcher in my target field?",
        seed: "Suggest 5 companies or role types in my target field that are known to hire career-switchers. Explain why each is switcher-friendly. Ask my target if you need it." },
    ],
    marketLabel: "switcher-friendly roles Dilly is tracking",
    moatFraming: "Every fact she captures translates your old field into the new one's language.",
  },

  first_gen_college: {
    eyebrow: 'YOUR FIRST',
    greetingLine: "the rules nobody wrote down.",
    tone: '#B45309',
    hero: {
      kicker: 'THE UNWRITTEN RULES',
      head: "The career map was\nnever taught in class.",
      body: "You are doing something nobody in your family has done. That's real and hard and you are still doing it. Dilly is the person who explains the parts nobody said out loud.",
      ctaLabel: "Explain the unwritten rules",
      seed: "I'm a first-generation college student or first-in-family professional. Help me understand the unwritten career rules - how hiring actually works, what to ask recruiters, when to negotiate. Ask me where I'm stuck first.",
    },
    prompts: [
      { text: "What does the hiring process actually look like?",
        seed: "Walk me through what a real hiring process looks like in my field - recruiter screen, interview loops, how long it takes. Ask me my target field." },
      { text: "How do I negotiate a salary offer?",
        seed: "Help me prepare to negotiate a salary offer. I've never done this. Ask me what the offer is or what field I'm in." },
      { text: "What's a warm intro, and how do I get one?",
        seed: "Explain what a warm introduction is, why it matters, and how I can build a network that produces them when I don't know anyone. Ask me my field and where I'm based." },
    ],
    marketLabel: "roles Dilly is tracking in your field",
    moatFraming: "Every fact you tell her becomes one less rule you have to figure out alone.",
  },

  trades_to_white_collar: {
    eyebrow: 'NEW RULES, SAME MIND',
    greetingLine: "you've been managing jobs for years.",
    tone: '#B7791F',
    hero: {
      kicker: 'THE OFFICE IS A SITE',
      head: "You already ran projects.\nThey just called them jobs.",
      body: "Trades work is project management. Budgeting. Customer-facing. Cross-functional. You have been doing the work that white-collar job postings ask for. Dilly helps you put it in their language.",
      ctaLabel: "Translate my jobs",
      seed: "I'm moving from trades (construction, HVAC, electrical, hospitality, warehouse, similar) into an office role. Help me translate my work history into white-collar resume language. Ask me what I did last.",
    },
    prompts: [
      { text: "What office skills have I already been doing?",
        seed: "Help me name the office skills I've already been doing in my trade - scheduling, budgeting, coordinating crews, talking to customers, safety. Ask me about a typical day on the job." },
      { text: "How do I write a resume that passes a desk-job screener?",
        seed: "Help me rewrite my trade-work resume so it passes a white-collar ATS screener. Specific bullets, dollar numbers, team size. Ask me my most recent job." },
      { text: "Which white-collar roles should a trades background aim for?",
        seed: "Suggest 5 office-role types where my trades background is actually an advantage, not a liability. Explain why for each. Ask me what trade I'm coming from." },
    ],
    marketLabel: "office roles Dilly is tracking",
    moatFraming: "Every job you've run translates into something a hiring manager already values.",
  },

  formerly_incarcerated: {
    eyebrow: 'FAIR-CHANCE TERRAIN',
    greetingLine: "direct and practical.",
    tone: '#475569',
    hero: {
      kicker: 'THE HONEST ROUTE',
      head: "You are looking for\na fair shot, not a favor.",
      body: "This market has more fair-chance employers than it did five years ago. It also has more AI-driven filters that can screen you out before a human sees your file. Both are true. Dilly helps you play both.",
      ctaLabel: "Map the practical route",
      seed: "I'm reentering the workforce after incarceration. Help me build a practical plan: fair-chance employers, how to handle background-check questions, how to frame the gap. Ask me my target field and my timeline.",
    },
    prompts: [
      { text: "Which employers actually hire fair-chance?",
        seed: "Suggest 5 employers in my field that meaningfully hire people with records (not just a page that says they do). Explain why each is legit. Ask my field if needed." },
      { text: "How do I handle the disclosure question?",
        seed: "Help me prepare a clean, factual answer to the background-check and record-disclosure question. No overexplaining, no apologizing, nothing that gives up ground I don't need to. Ask me the specifics." },
      { text: "What's a realistic first-step role I can actually get?",
        seed: "Help me pick a realistic first-step role given my record and my skills, with a real path forward from there. Ask me what I'm trained for and what I want to do." },
    ],
    marketLabel: "fair-chance roles Dilly is tracking",
    moatFraming: "Every fact she captures gets you ready for the question — before the question gets asked.",
  },

  neurodivergent: {
    eyebrow: 'WHERE YOUR WIRING WINS',
    greetingLine: "the pattern-recognition is the edge.",
    tone: '#0E7490',
    hero: {
      kicker: 'YOUR WIRING, THEIR WORK',
      head: "Some fields reward\nthe way you actually think.",
      body: "Career advice written for the neurotypical middle will not serve you. Dilly helps you pick environments where your wiring is the advantage, not the accommodation request.",
      ctaLabel: "Map fit to my wiring",
      seed: "I'm neurodivergent (ADHD, autism, dyslexia, or similar) and trying to pick a career that works for how I actually think. Help me identify fields and team structures that fit my wiring. Ask me what environments have made me thrive or crash.",
    },
    prompts: [
      { text: "Which work rhythms wreck me, and which light me up?",
        seed: "Help me name the work rhythms that wreck me (endless meetings, ambiguous deadlines, surprise context-switches) versus the ones that light me up (deep focus blocks, pattern work, clear briefs). Ask me about a recent good day and a recent bad one." },
      { text: "How do I screen a job for neurodivergent-friendly culture?",
        seed: "Give me interview questions I can ask that reveal whether a company's work culture is actually neurodivergent-friendly, not just on-brand about it. Ask my target role if needed." },
      { text: "Should I disclose, and if so, when?",
        seed: "Help me think through whether and when to disclose my neurodivergence to employers. Pros, cons, timing. Don't push me either way. Ask me what I'm considering disclosing." },
    ],
    marketLabel: "roles Dilly is tracking",
    moatFraming: "Every rhythm and quirk she logs sharpens the picture of where your wiring is the asset.",
  },

  disabled_professional: {
    eyebrow: 'REAL ACCESS',
    greetingLine: "you already know more than most hiring managers.",
    tone: '#0F766E',
    hero: {
      kicker: 'BROCHURE VS. ACTUAL',
      head: "You are the expert\non what access looks like.",
      body: "Every company page talks about accessibility. Few deliver. Dilly helps you ask the questions that separate the brochure from the reality, and find roles where you can do peak work without fighting the environment.",
      ctaLabel: "Vet the environment",
      seed: "I'm a disabled professional evaluating where to work next. Help me build a plan for vetting whether a company's stated commitment to access is real. Ask me what accommodations actually matter for my peak work.",
    },
    prompts: [
      { text: "What interview questions reveal real accessibility?",
        seed: "Give me interview questions that expose whether a workplace's accessibility is real. Ask me what I specifically need to know about (physical access, flexible hours, remote, assistive tech)." },
      { text: "How do I decide what to disclose, and when?",
        seed: "Help me think through disclosure strategy - what to tell whom, at what stage of the process. This is mine to decide. Ask me what I'm weighing." },
      { text: "Which employers actually walk the accessibility walk?",
        seed: "Suggest 5 employers in my field with genuinely strong disability inclusion. Point at evidence - reviews, programs, policies - not marketing. Ask my field if needed." },
    ],
    marketLabel: "roles Dilly is tracking in your field",
    moatFraming: "Every access need you name becomes a filter she runs on every employer she sees.",
  },

  lgbtq: {
    eyebrow: 'CULTURE AS DATA',
    greetingLine: "who's actually in the room matters.",
    tone: '#9333EA',
    hero: {
      kicker: 'REAL INCLUSION READS',
      head: "The brochure is easy.\nThe room tells the truth.",
      body: "Every company has a page. Many change URLs the moment the political climate shifts. Dilly helps you read the actual signals - leadership representation, benefits that hold up, geographies you'd actually live in, alumni who've been honest.",
      ctaLabel: "Filter for real inclusion",
      seed: "I'm LGBTQ+ and trying to land somewhere that actually matches the brochure on inclusion. Help me identify signals I should actually trust. Ask me what matters most for me - benefits, leadership rep, geography, public stance.",
    },
    prompts: [
      { text: "Which signals of real inclusion should I look for?",
        seed: "Walk me through concrete signals of real LGBTQ+ inclusion at an employer - executive representation, benefit details, geography of offices, public stance on recent issues. Ask me what my priorities are." },
      { text: "How do I ask inclusion questions in an interview?",
        seed: "Help me ask inclusion-related interview questions that get real answers without making it the whole conversation. Ask me what I most need to know." },
      { text: "Which employers have the track record, not the marketing?",
        seed: "Suggest 5 employers in my field with a genuine LGBTQ+ inclusion track record - not HRC-scorecard theater. Explain how each earned the list. Ask my field." },
    ],
    marketLabel: "inclusive employers Dilly is tracking",
    moatFraming: "Every priority she captures sharpens the line between brochure and a room you'd actually want to work in.",
  },

  rural_remote_only: {
    eyebrow: 'REMOTE-FIRST FIELD',
    greetingLine: "your location is a filter, not a constraint.",
    tone: '#2563EB',
    hero: {
      kicker: "YOU'RE NOT ASKING FOR A FAVOR",
      head: "Remote-first companies\nalready hire where you live.",
      body: "The market is more remote-friendly than job boards make it look. Most 'hybrid' postings will take a truly remote candidate if the work fits. Dilly helps you find the companies that won't flinch.",
      ctaLabel: "Find real remote roles",
      seed: "I live outside a major metro and need a remote or hybrid-flexible role. Help me build a target list of companies that are genuinely remote-first, not hybrid-disguised-as-remote. Ask me my field and any non-negotiables.",
    },
    prompts: [
      { text: "Which companies are actually remote-first?",
        seed: "Suggest 10 companies in my field that are genuinely remote-first (not RTO'd, not hybrid-in-disguise). Sort by hiring volume. Ask my field if needed." },
      { text: "How do I answer 'can you come into the office'?",
        seed: "Help me write a clean, non-defensive answer to 'can you come into the office' that keeps the candidacy alive if remote is actually fine. Ask me how far I am from their HQ." },
      { text: "How do I make my resume pass a 'remote-ready' screen?",
        seed: "Help me tune my resume + LinkedIn so remote-first recruiters see the signals they look for (async comms, self-directed work, proven remote output). Ask me about a remote project I've done." },
    ],
    marketLabel: "remote roles Dilly is tracking",
    moatFraming: "Every fact she captures filters out the hybrid-in-disguise listings before they waste your week.",
  },

  ex_founder: {
    eyebrow: 'POST-FOUNDER',
    greetingLine: "the next arc is yours to design.",
    tone: '#BE185D',
    hero: {
      kicker: 'THE HIRING SIDE',
      head: "You've seen the company\nfrom the inside of the table.",
      body: "Most candidates can't see what you can. That visibility is the pitch. Dilly helps you translate founder judgment into roles worth saying yes to - IC, exec, back to building, or a funded bridge.",
      ctaLabel: "Pick the post-founder arc",
      seed: "I'm an ex-founder (or current founder exploring what's next). Help me decide between IC, exec, and returning to building, given my specific company story. Ask me what I built and why I'm thinking about leaving or switching gears.",
    },
    prompts: [
      { text: "How do I explain the company in sixty seconds?",
        seed: "Help me write a 60-second explanation of what I built that works for interviews - honest about what happened, not over-spun. Ask me what the company did and what the current state is." },
      { text: "IC, exec, or founder again?",
        seed: "Help me think through whether my next move is an IC role, an exec role at someone else's company, or founding again. Talk about what I'd actually optimize for. Ask me what I want out of the next two years." },
      { text: "Who hires ex-founders well, and for what?",
        seed: "Suggest 5 companies or role types known to hire ex-founders into seats where founder judgment is the asset, not a liability. Explain why each makes the list. Ask my field and last role." },
    ],
    marketLabel: "roles Dilly is tracking",
    moatFraming: "Every chapter of the company you tell her becomes the asset she pitches to the next room.",
  },
};


export function specForPath(path: string | null | undefined): HomeSpec {
  if (!path || typeof path !== 'string') return DEFAULT_SPEC;
  return HOME_SPECS[path.trim().toLowerCase()] || DEFAULT_SPEC;
}

export function hasTieredSpec(path: string | null | undefined): boolean {
  if (!path || typeof path !== 'string') return false;
  return path.trim().toLowerCase() in HOME_SPECS;
}
