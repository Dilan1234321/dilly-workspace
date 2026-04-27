/**
 * Per-user_path narrator framing for AI Arena.
 *
 * AI Arena's data (threat report, weekly signal, skill vault) is
 * keyed by ROLE, not PATH. Two users with the same role see identical
 * numbers and headlines. A veteran and a dropout may both be software
 * engineers; the threat percentage is the same; but the MEANING of
 * that number is not. A dropout reads "45% of this role is at risk"
 * as "my work better speak loudly." A senior_reset reads it as "the
 * field I gave 20 years to is shifting under me." Same data, very
 * different stance.
 *
 * This module provides a short narrator block per path - 2 sentences
 * that frame the Arena for who the user is. Injected at the top of
 * the Arena screen above the Field Pulse card. Zero LLM cost.
 *
 * Unknown paths fall through to DEFAULT_FRAMING which reads neutral.
 */

export interface ArenaFraming {
  /** Small eyebrow label ("YOUR READ", "TODAY'S POSTURE", etc.). */
  eyebrow: string;
  /** 1-2 sentence framing line. Keep under ~160 chars. */
  line: string;
}

const DEFAULT_FRAMING: ArenaFraming = {
  eyebrow: 'YOUR READ',
  line:    'Here is what the field is doing this week. Use the tools below to see where it leaves you.',
};

const FRAMINGS: Record<string, ArenaFraming> = {
  i_have_a_job: {
    eyebrow: 'DEFEND AND EXTEND',
    line:    'You have a seat at the table. Arena is for watching where the table moves so you can move before it does.',
  },
  exploring: {
    eyebrow: 'SCANNING THE MAP',
    line:    'You are looking, not committing. Treat this as a landscape read. No role, no timeline, no pressure.',
  },
  student: {
    eyebrow: 'WHAT YOU ARE WALKING INTO',
    line:    'You will graduate into this market, not the one your syllabus was written for. Know the terrain before you pick a route.',
  },
  international_grad: {
    eyebrow: 'ON TWO CLOCKS',
    line:    'The market clock and the visa clock are not the same clock. Arena reads the first; remember the second when you pick your move.',
  },
  dropout: {
    eyebrow: 'YOUR PROOF WILL SHOW',
    line:    'This field is filtering on credentials less than it used to and on proof more than it used to. That cuts your way.',
  },
  senior_reset: {
    eyebrow: 'THE TERRAIN YOU BUILT IN',
    line:    'You gave years to this field. It is shifting under everyone, not just you. Your depth is the lever that most peers do not have.',
  },
  career_switch: {
    eyebrow: 'READING A NEW MAP',
    line:    'You are leaving one field and learning another. This is the terrain of where you are going, not where you were. Study it like a newcomer.',
  },
  first_gen_college: {
    eyebrow: 'THE UNWRITTEN FIELD',
    line:    'The career map was not taught in any class. Here is what it is doing right now, in plain language, without the insider shorthand.',
  },
  parent_returning: {
    eyebrow: 'BACK IN THE ROOM',
    line:    'The work changed while you were caregiving. Some of it in your favor. Read it without catastrophizing the gap.',
  },
  veteran: {
    eyebrow: 'FIELD BRIEFING',
    line:    'You have led through uncertainty before. Same discipline, new terrain. Arena reads the terrain; you still pick the move.',
  },
  trades_to_white_collar: {
    eyebrow: 'NEW RULES, SAME MIND',
    line:    'Office work has its own rituals. Arena is the recon before you walk in. Your on-the-ground skills still matter.',
  },
  formerly_incarcerated: {
    eyebrow: 'FAIR-CHANCE TERRAIN',
    line:    'This market has more fair-chance employers than it did five years ago, and more AI-driven filters too. Both are true. Read both.',
  },
  neurodivergent: {
    eyebrow: 'WHERE YOUR WIRING WINS',
    line:    'Different fields reward different cognition. Arena helps you find the ones where your pattern-recognition is the edge, not the edge case.',
  },
  disabled_professional: {
    eyebrow: 'REAL ACCESS, NOT SLOGANS',
    line:    'The Arena read shows where the field is going. Pair it with your own read on which employers have actual access, not the brochure version.',
  },
  lgbtq: {
    eyebrow: 'CULTURE AS DATA',
    line:    'Market data tells half the story. Who is actually in the room tells the rest. Arena handles the first; your network handles the second.',
  },
  rural_remote_only: {
    eyebrow: 'REMOTE-FIRST FIELD',
    line:    'Your location is a filter, not a constraint. The field is more remote-friendly than it reads on paper. Here is where that is true.',
  },
  refugee: {
    eyebrow: 'TRANSLATING THE TERRAIN',
    line:    'Your career did not start here. The field still moves the same way globally. Read this as the local version of what you already understand.',
  },
  ex_founder: {
    eyebrow: 'THE MARKET SIDE OF THE TABLE',
    line:    'You know what it looks like from inside a company you ran. Here is what it looks like from the hiring side - which most candidates cannot see.',
  },
};

export function framingForPath(path: string | null | undefined): ArenaFraming {
  if (!path || typeof path !== 'string') return DEFAULT_FRAMING;
  return FRAMINGS[path.trim().toLowerCase()] || DEFAULT_FRAMING;
}
