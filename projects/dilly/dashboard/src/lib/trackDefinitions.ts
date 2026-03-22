/**
 * Short definitions of Smart, Grit, and Build per cohort (track).
 * Used on the dashboard so users see what each dimension means for their field.
 * Voice: top-level hiring manager + job consultant + advisor (see dilly_core/DILLY_VOICE.md).
 */

export type TrackKey =
  | "Pre-Health"
  | "Pre-Law"
  | "Tech"
  | "Science"
  | "Business"
  | "Finance"
  | "Quantitative"
  | "Health"
  | "Social Science"
  | "Sport"
  | "Consulting"
  | "Communications"
  | "Education"
  | "Arts"
  | "Humanities";

export type DimensionKey = "smart" | "grit" | "build";

export const TRACK_DEFINITIONS: Record<
  TrackKey,
  { smart: string; grit: string; build: string }
> = {
  "Pre-Health": {
    smart: "Academic rigor, BCPM readiness, and research or scientific inquiry that healthcare employers look for.",
    grit: "Clinical hours, leadership, service orientation, and resilience: what healthcare employers and organizations value.",
    build: "Proof: shadowing, volunteering, research, and community impact with clear dates and scope.",
  },
  "Pre-Law": {
    smart: "Analytical writing, research, and academic performance that law firms and legal employers screen for.",
    grit: "Disciplined leadership, persistence, and ownership: evidence you can commit to a cause, lead under pressure, and follow through.",
    build: "Concrete experience: internships, publications, or roles that show legal and analytical proof.",
  },
  Tech: {
    smart: "Technical rigor: coursework, certifications, and problem-solving that recruiters verify.",
    grit: "Project velocity, ownership, and initiative: shipping code, leading projects, or contributing to open source.",
    build: "Stack depth and proof: named tools, languages, and at least one deployed or portfolio project.",
  },
  Science: {
    smart: "Research signal, methods, and academic inquiry that labs and industry employers look for.",
    grit: "Quantifiable impact, sustained effort, and ownership in research or lab roles.",
    build: "Evidence: lab work, publications, or projects with clear dates and outcomes.",
  },
  Business: {
    smart: "Academic consistency, relevant coursework, and certifications (e.g. CFA, Excel) that firms expect.",
    grit: "Leadership density: specific roles and outcomes with percentages or dollar impact.",
    build: "Analytics proof: tools (Excel, Tableau) and quantifiable results (revenue, conversion, growth).",
  },
  Finance: {
    smart: "Quant rigor, accounting/finance/economics coursework, CFA/CPA progress, Excel and modeling: what Big Four and finance recruiters value.",
    grit: "Quantifiable impact ($, %, revenue, cost savings), deal or audit experience, leadership in finance/accounting orgs.",
    build: "Audit/tax/advisory internships, valuation or modeling work, transaction exposure, Excel/GAAP: proof for Big Four and financial firms.",
  },
  Consulting: {
    smart: "Structured problem-solving, analytical rigor, strategy/econ/analytics coursework: what consulting recruiters value.",
    grit: "Leadership, client or team impact, quantifiable outcomes ($, %, growth), case work or competition.",
    build: "Consulting internships, case competitions, client projects, frameworks, synthesis and presentation.",
  },
  Communications: {
    smart: "Relevant coursework, writing, media, or PR signal that employers and agencies check.",
    grit: "Portfolio impact: reach, engagement, or campaign outcomes with numbers.",
    build: "Content and campaigns: specific channels, content types, and their impact.",
  },
  Education: {
    smart: "Certifications, teaching or subject-area prep, and academic signal that schools look for.",
    grit: "Teaching experience: tutoring, mentoring, or classroom roles with dates and outcomes.",
    build: "Student impact: students served, hours, or grade improvement, quantified where possible.",
  },
  Arts: {
    smart: "Academic rigor, awards, and relevant coursework that programs and employers value.",
    grit: "Portfolio and productions: exhibitions, performances, reels, or design projects.",
    build: "Concrete work: specific projects, roles, and outcomes (audience reach, awards, collaborations).",
  },
  Humanities: {
    smart: "Research and writing: publications, theses, or conference presentations.",
    grit: "Quantifiable impact where possible: readers served, events organized, hours taught.",
    build: "Evidence of analysis: specific writing, research, or teaching outcomes with clear dates.",
  },
  Quantitative: {
    smart: "Mathematical rigor: coursework, exam progress (Putnam, actuarial exams), and analytical depth.",
    grit: "Sustained problem-solving and project ownership: competitions, research, and quantitative impact.",
    build: "Proof of quantitative skill: Kaggle, publications, statistical models, or quant-adjacent tools.",
  },
  Health: {
    smart: "Academic rigor, relevant coursework, and certifications that healthcare employers look for.",
    grit: "Clinical and service experience: hours, leadership, and sustained patient-care commitment.",
    build: "Proof: clinical rotations, certifications (CPR, CNA), and community health impact with dates.",
  },
  "Social Science": {
    smart: "Research methods, analytical coursework, and academic inquiry for policy and consulting roles.",
    grit: "Community and field impact: leadership, advocacy, and sustained nonprofit or government work.",
    build: "Evidence: internships, fieldwork, publications, or survey/data projects with clear scope.",
  },
  Sport: {
    smart: "Sport management coursework, analytics, and certifications relevant to the industry.",
    grit: "Event and operations leadership: game days managed, teams led, sponsorship or ticketing outcomes.",
    build: "Concrete experience: internships, events coordinated, or roles at recognized sports organizations.",
  },
};

/** Leaderboard cohort boards — keep in sync with API `_COHORT_BOARDS` in `leaderboard_page.py`. */
export const COHORT_BOARD_TRACKS: readonly TrackKey[] = [
  "Pre-Health",
  "Pre-Law",
  "Tech",
  "Business",
  "Science",
  "Quantitative",
  "Health",
  "Social Science",
  "Humanities",
  "Sport",
  "Finance",
  "Consulting",
  "Communications",
  "Education",
  "Arts",
] as const;

/**
 * Pre-professional tracks offered at University of Tampa (onboarding Screen 7).
 * Each maps to a category (Pre-Health, Pre-Law) for scoring and TRACK_DEFINITIONS.
 * Source: UTampa College of Natural and Health Sciences + Pre-Health/Pre-Law Advising.
 */
export type PreProfessionalTrackValue =
  | "Pre-Med"
  | "Pre-PA"
  | "Pre-Dental"
  | "Pre-Vet"
  | "Pre-PT"
  | "Pre-OT"
  | "Pre-Pharmacy"
  | "Pre-Law";

export const PRE_PROFESSIONAL_TRACKS: {
  value: PreProfessionalTrackValue;
  label: string;
  category: TrackKey;
  goalKey: string;
  goalLabel: string;
}[] = [
  { value: "Pre-Med", label: "Pre-Med", category: "Pre-Health", goalKey: "pre_health_career", goalLabel: "I'm Pursuing a Healthcare Career" },
  { value: "Pre-PA", label: "Pre-Physician Assistant", category: "Pre-Health", goalKey: "pre_health_career", goalLabel: "I'm Pursuing a Healthcare Career" },
  { value: "Pre-Dental", label: "Pre-Dental", category: "Pre-Health", goalKey: "pre_health_career", goalLabel: "I'm Pursuing a Healthcare Career" },
  { value: "Pre-Vet", label: "Pre-Vet", category: "Pre-Health", goalKey: "pre_health_career", goalLabel: "I'm Pursuing a Healthcare Career" },
  { value: "Pre-PT", label: "Pre-Physical Therapy", category: "Pre-Health", goalKey: "pre_health_career", goalLabel: "I'm Pursuing a Healthcare Career" },
  { value: "Pre-OT", label: "Pre-Occupational Therapy", category: "Pre-Health", goalKey: "pre_health_career", goalLabel: "I'm Pursuing a Healthcare Career" },
  { value: "Pre-Pharmacy", label: "Pre-Pharmacy", category: "Pre-Health", goalKey: "pre_health_career", goalLabel: "I'm Pursuing a Healthcare Career" },
  { value: "Pre-Law", label: "Pre-Law", category: "Pre-Law", goalKey: "pre_law_career", goalLabel: "I'm Pursuing a Legal Career" },
];

/** Map a pre-professional track (e.g. Pre-Med) to the category used for scoring (Pre-Health, Pre-Law). */
export function getTrackCategory(specificTrack: string): TrackKey {
  const found = PRE_PROFESSIONAL_TRACKS.find((t) => t.value === specificTrack);
  return found ? found.category : (specificTrack as TrackKey);
}

/**
 * Cohort label for UI and peer benchmarks: a pre-professional selection maps to Pre-Health or Pre-Law;
 * otherwise the resume-detected track is used.
 */
export function getEffectiveCohortLabel(
  auditDetectedTrack: string | null | undefined,
  profileTrack: string | null | undefined
): string {
  const pt = (profileTrack ?? "").trim();
  if (pt && PRE_PROFESSIONAL_TRACKS.some((t) => t.value === pt)) {
    return getTrackCategory(pt);
  }
  return (auditDetectedTrack ?? "").trim();
}

/** Values that must never be sent as ?track= (often from bad URLs, caches, or `/…/page` confusion). */
const LEADERBOARD_JUNK_TRACKS = new Set([
  "page",
  "undefined",
  "null",
  "your track",
  "your-track",
  "track",
  "leaderboard",
]);

const CANONICAL_TRACK_BY_LOWER: Map<string, TrackKey> = new Map(
  (Object.keys(TRACK_DEFINITIONS) as TrackKey[]).map((k) => [k.toLowerCase(), k]),
);

/**
 * Map URL/session/cache track string to a real cohort key for the leaderboard API.
 * Unknown strings fall back (avoid querying a nonsense board like "page").
 */
export function coerceLeaderboardTrackForApi(raw: string | null | undefined, fallback: string): string {
  const sanitizeFallback = (s: string): TrackKey => {
    const x = s.trim();
    if (!x || LEADERBOARD_JUNK_TRACKS.has(x.toLowerCase())) return "Humanities";
    if (PRE_PROFESSIONAL_TRACKS.some((p) => p.value === x)) return getTrackCategory(x);
    return CANONICAL_TRACK_BY_LOWER.get(x.toLowerCase()) ?? "Humanities";
  };
  const fb = sanitizeFallback(fallback || "Humanities");
  const t = (raw ?? "").trim();
  if (!t) return fb;
  const lo = t.toLowerCase();
  if (LEADERBOARD_JUNK_TRACKS.has(lo)) return fb;
  if (PRE_PROFESSIONAL_TRACKS.some((p) => p.value === t)) {
    return getTrackCategory(t);
  }
  const canon = CANONICAL_TRACK_BY_LOWER.get(lo);
  if (canon) return canon;
  return fb;
}

/** Get definitions for a track; fallback to Humanities if unknown. Accepts specific track (Pre-Med) or category (Pre-Health). */
export function getDefinitionsForTrack(
  track: string
): { smart: string; grit: string; build: string } {
  const category = getTrackCategory(track);
  const key = category as TrackKey;
  return (
    TRACK_DEFINITIONS[key] ?? TRACK_DEFINITIONS.Humanities
  );
}

/** Playbook: what recruiters in this track look for. Shown on Career Center. */
export type TrackPlaybook = { headline: string; bullets: string[] };

const TRACK_PLAYBOOKS: Record<TrackKey, TrackPlaybook> = {
  "Pre-Health": {
    headline: "What healthcare employers and organizations look for",
    bullets: [
      "Clear BCPM and academic rigor: GPA (if you share it), coursework, and research.",
      "Clinical and shadowing hours with dates and scope; volunteering and service.",
      "Leadership and resilience: roles, committees, and how you handle pressure.",
    ],
  },
  "Pre-Law": {
    headline: "What Pre-Law and legal recruiters look for",
    bullets: [
      "Analytical writing and research: moot court, journal, or writing samples.",
      "Sustained leadership and follow-through: roles with real responsibility and measurable outcomes.",
      "Concrete legal-adjacent experience: internships, clinics, or publications.",
    ],
  },
  Tech: {
    headline: "What Tech recruiters look for",
    bullets: [
      "Named stack and tools: languages, frameworks, and where you used them.",
      "Shipped work: projects, open source, or deployments with clear outcomes.",
      "Ownership and velocity: led a feature, fixed a bug, improved a metric.",
    ],
  },
  Science: {
    headline: "What Science and research recruiters look for",
    bullets: [
      "Research methods and inquiry: lab work, publications, or conference presentations.",
      "Quantifiable impact: samples run, experiments, or outcomes with dates.",
      "Sustained effort and ownership in lab or research roles.",
    ],
  },
  Business: {
    headline: "What Business and finance recruiters look for",
    bullets: [
      "Relevant coursework and certifications (CFA, Excel, etc.) that firms expect.",
      "Leadership with numbers: revenue, conversion, growth, or team size.",
      "Analytics proof: tools (Excel, Tableau) and quantifiable results.",
    ],
  },
  Finance: {
    headline: "What Big Four and financial firms look for",
    bullets: [
      "Audit, tax, or advisory experience: internships at accounting or financial firms with clear scope ($, segments, deliverables).",
      "Quant impact: $ or % in every relevant bullet; Excel, modeling, valuation, or GAAP/SEC exposure.",
      "Leadership in finance/accounting orgs (e.g. Beta Alpha Psi) and progress toward or interest in CFA/CPA.",
    ],
  },
  Consulting: {
    headline: "What consulting firms (MBB, strategy) look for",
    bullets: [
      "Consulting internships or case competitions with clear role and outcome.",
      "Client or project impact: $ or % outcomes, recommendations delivered, frameworks used.",
      "Leadership and structured problem-solving: team size, deliverables, synthesis and presentation.",
    ],
  },
  Communications: {
    headline: "What Communications and PR recruiters look for",
    bullets: [
      "Portfolio and reach: clips, campaigns, or channels with engagement numbers.",
      "Writing and media signal: coursework, roles, or bylines.",
      "Campaign outcomes: reach, engagement, or audience impact.",
    ],
  },
  Education: {
    headline: "What Education recruiters look for",
    bullets: [
      "Teaching or tutoring experience with dates and student outcomes.",
      "Certifications and subject-area prep that schools look for.",
      "Student impact: hours, grades, or number of students served.",
    ],
  },
  Arts: {
    headline: "What Arts and creative recruiters look for",
    bullets: [
      "Portfolio and productions: exhibitions, performances, reels, or design work.",
      "Concrete projects with audience reach, awards, or collaborations.",
      "Academic rigor and awards; relevant coursework.",
    ],
  },
  Humanities: {
    headline: "What Humanities recruiters look for",
    bullets: [
      "Research and writing: publications, theses, or conference presentations.",
      "Evidence of analysis: specific writing or teaching outcomes with dates.",
      "Impact where possible: readers served, events organized, hours taught.",
    ],
  },
  Quantitative: {
    headline: "What quantitative employers (Jane Street, quant funds, actuarial firms) look for",
    bullets: [
      "Mathematical proof: Putnam, actuarial exam progress, Kaggle, or competition results.",
      "Quantitative tools in use: Python, R, MATLAB, or statistical modeling with named outcomes.",
      "Research or publication signal: arXiv, undergraduate thesis, or lab work with clear methods.",
    ],
  },
  Health: {
    headline: "What healthcare employers look for",
    bullets: [
      "Clinical and patient-care experience with hours, dates, and scope.",
      "Certifications and credentials: CPR, CNA, EMT, or HIPAA compliance.",
      "Leadership and community health impact with measurable outcomes.",
    ],
  },
  "Social Science": {
    headline: "What consulting, government, and nonprofit employers look for",
    bullets: [
      "Research methods and analytical rigor: surveys, fieldwork, or policy analysis.",
      "Community impact: nonprofit roles, advocacy, or government internships with scope.",
      "Leadership and sustained follow-through in organizations with measurable outcomes.",
    ],
  },
  Sport: {
    headline: "What sport industry employers (ESPN, leagues, agencies) look for",
    bullets: [
      "Event and game-day operations: managed events, ticketing, or facility oversight.",
      "Sponsorship and marketing: campaigns, partnerships, or revenue-generating work.",
      "Industry-adjacent experience: NASSM membership, sport management internships.",
    ],
  },
};

/** Get playbook for a track; fallback to Humanities. Accepts specific (Pre-Med) or category (Pre-Health). */
export function getPlaybookForTrack(track: string): TrackPlaybook {
  const category = getTrackCategory(track);
  const key = category as TrackKey;
  return TRACK_PLAYBOOKS[key] ?? TRACK_PLAYBOOKS.Humanities;
}

/** Track-specific tips: common mistakes students in this track make. Shown under playbook. */
const TRACK_TIPS: Record<TrackKey, string[]> = {
  "Pre-Health": ["Vague clinical hours. Add dates and scope.", "Missing service/volunteering context.", "Generic leadership without outcomes."],
  "Pre-Law": ["Weak analytical writing signal.", "Leadership without measurable follow-through.", "No legal-adjacent experience."],
  Tech: ["Unnamed stack. List languages and tools.", "Projects without deployment or outcomes.", "No ownership or velocity proof."],
  Science: ["Research without methods or dates.", "Missing quantifiable impact.", "Lab roles without scope."],
  Business: ["Leadership without numbers.", "No analytics or tool proof.", "Generic coursework."],
  Finance: ["Bullets without $ or % impact.", "Missing Excel/modeling/GAAP.", "No audit or advisory experience."],
  Consulting: ["No case competition or client work.", "Impact without frameworks.", "Missing structured problem-solving proof."],
  Communications: ["Portfolio without reach numbers.", "No campaign outcomes.", "Vague writing signal."],
  Education: ["Teaching without student impact.", "Missing certifications.", "No hours or outcomes."],
  Arts: ["Portfolio without audience or awards.", "Projects without scope.", "Missing academic rigor."],
  Humanities: ["Writing without evidence or dates.", "No quantifiable impact.", "Vague research signal."],
  Quantitative: ["No competition or exam progress.", "Tools listed without outcomes.", "Missing quantitative proof (models, stats, code)."],
  Health: ["Clinical hours without dates or scope.", "No certifications listed.", "Missing patient-care context."],
  "Social Science": ["Research without methods or scope.", "Leadership without measurable outcomes.", "No community or fieldwork evidence."],
  Sport: ["Events without scope or outcomes.", "No industry-specific organizations listed.", "Generic leadership without sports context."],
};

export function getTrackTips(track: string): string[] {
  const category = getTrackCategory(track);
  const key = category as TrackKey;
  return TRACK_TIPS[key] ?? TRACK_TIPS.Humanities;
}
