/**
 * Client-side DillyFace splash greeting variants.
 *
 * All logic is pure client-side - reads the locally cached profile
 * slim and picks a variant not shown in the last 5 opens. Zero LLM
 * calls, zero new network round-trips.
 *
 * Each variant produces a partial SplashState (headline + sub +
 * eyebrow). The caller merges this with the backend SplashState or
 * the default fallback for non-content fields (CTA route, voice
 * prompt, etc.).
 */

import { readProfileSlim, readSplashHistory, recordSplashShown, type ProfileSlim } from './profileCache';

export interface GreetingContent {
  variantId: string;
  eyebrow: string;
  eyebrow_color: 'gold' | 'green' | 'coral' | 'amber' | 'muted';
  headline: string;
  headline_gold: string;
  sub: string;
}

type VariantDef = {
  id: string;
  weight: number; // higher = more likely to be picked when eligible
  available: (p: ProfileSlim, now: Date) => boolean;
  generate: (p: ProfileSlim, now: Date) => Omit<GreetingContent, 'variantId'>;
};

const VARIANTS: VariantDef[] = [
  // ── Time-of-day ─────────────────────────────────────────────────
  {
    id: 'morning',
    weight: 2,
    available: (_p, now) => now.getHours() >= 5 && now.getHours() < 12,
    generate: (p) => ({
      eyebrow: 'GOOD MORNING',
      eyebrow_color: 'gold',
      headline: p.name
        ? `Good morning, ${firstName(p.name)}. Ready to build something?`
        : 'Good morning. Ready to build something?',
      headline_gold: 'Ready to build something?',
      sub: 'Your career center has been thinking about you.',
    }),
  },
  {
    id: 'evening',
    weight: 2,
    available: (_p, now) => now.getHours() >= 18,
    generate: (p) => ({
      eyebrow: 'GOOD EVENING',
      eyebrow_color: 'muted',
      headline: p.name
        ? `Evening, ${firstName(p.name)}. You put in the work.`
        : 'Evening. You put in the work.',
      headline_gold: 'You put in the work.',
      sub: 'Come check what Dilly noticed today.',
    }),
  },
  // ── Profile-signal ───────────────────────────────────────────────
  {
    id: 'has_major_school',
    weight: 3,
    available: (p) => !!(p.school && p.major),
    generate: (p) => ({
      eyebrow: 'YOUR PATH',
      eyebrow_color: 'gold',
      headline: `${p.major} at ${p.school}. Let's make that count.`,
      headline_gold: "Let's make that count.",
      sub: 'Dilly knows what recruiters look for in your field.',
    }),
  },
  {
    id: 'has_major',
    weight: 2,
    available: (p) => !!(p.major && !p.school),
    generate: (p) => ({
      eyebrow: 'YOUR PROFILE',
      eyebrow_color: 'gold',
      headline: `Studying ${p.major}? Dilly has thoughts.`,
      headline_gold: 'Dilly has thoughts.',
      sub: 'Your major shapes which doors are open. Let\'s look at them.',
    }),
  },
  {
    id: 'has_experience',
    weight: 3,
    available: (p) => p.experience_count > 0,
    generate: (p) => ({
      eyebrow: 'YOUR EXPERIENCE',
      eyebrow_color: 'green',
      headline: p.experience_count === 1
        ? 'One internship on the record. Let\'s make it shine.'
        : `${p.experience_count} experiences on your profile. Let's sharpen them.`,
      headline_gold: p.experience_count === 1
        ? "Let's make it shine."
        : "Let's sharpen them.",
      sub: 'How you frame experience matters more than where you worked.',
    }),
  },
  {
    id: 'has_skills',
    weight: 2,
    available: (p) => p.skills_count >= 3,
    generate: (p) => ({
      eyebrow: 'SKILLS CHECK',
      eyebrow_color: 'amber',
      headline: `${p.skills_count} skills in your profile. Dilly spotted a pattern.`,
      headline_gold: 'Dilly spotted a pattern.',
      sub: 'Some of your skills cluster well for specific roles. Let\'s dig in.',
    }),
  },
  {
    id: 'has_courses',
    weight: 2,
    available: (p) => p.courses_count >= 2,
    generate: (p) => ({
      eyebrow: 'YOUR COURSEWORK',
      eyebrow_color: 'muted',
      headline: `${p.courses_count} courses on your record. They tell a story.`,
      headline_gold: 'They tell a story.',
      sub: 'Recruiters care about what you studied, not just your GPA.',
    }),
  },
  {
    id: 'has_activities',
    weight: 2,
    available: (p) => p.activities_count >= 1,
    generate: (p) => ({
      eyebrow: 'BEYOND CLASS',
      eyebrow_color: 'green',
      headline: `You're involved. ${p.activities_count > 1 ? `${p.activities_count} activities listed.` : 'Activity on the record.'} That sets you apart.`,
      headline_gold: 'That sets you apart.',
      sub: 'Clubs and orgs signal initiative. Let\'s make sure yours read that way.',
    }),
  },
  // ── Day-of-week ──────────────────────────────────────────────────
  {
    id: 'monday',
    weight: 2,
    available: (_p, now) => now.getDay() === 1,
    generate: (p) => ({
      eyebrow: 'NEW WEEK',
      eyebrow_color: 'gold',
      headline: p.name
        ? `New week, ${firstName(p.name)}. Set one career goal today.`
        : 'New week. Set one career goal today.',
      headline_gold: 'Set one career goal today.',
      sub: 'Small moves compound. Dilly will help you pick the right one.',
    }),
  },
  {
    id: 'friday',
    weight: 2,
    available: (_p, now) => now.getDay() === 5,
    generate: () => ({
      eyebrow: 'FRIDAY',
      eyebrow_color: 'green',
      headline: 'Recruiters reply more on Fridays. Reach out before noon.',
      headline_gold: 'Reach out before noon.',
      sub: 'It\'s a real pattern. Dilly can help you draft something.',
    }),
  },
  {
    id: 'weekend',
    weight: 1,
    available: (_p, now) => [0, 6].includes(now.getDay()),
    generate: () => ({
      eyebrow: 'WEEKEND CHECK',
      eyebrow_color: 'muted',
      headline: 'Even a 10-minute review today keeps you sharp.',
      headline_gold: '10-minute review',
      sub: 'Update one thing. Future you will thank you.',
    }),
  },
  // ── Generic fallback (always available) ──────────────────────────
  {
    id: 'generic_ready',
    weight: 1,
    available: () => true,
    generate: (p) => ({
      eyebrow: 'WELCOME BACK',
      eyebrow_color: 'gold',
      headline: p.name
        ? `${firstName(p.name)}, your career center is ready.`
        : 'Your career center is ready.',
      headline_gold: 'career center is ready.',
      sub: 'Pick up where you left off.',
    }),
  },
  {
    id: 'generic_noticed',
    weight: 1,
    available: () => true,
    generate: (p) => ({
      eyebrow: 'DILLY NOTICED',
      eyebrow_color: 'gold',
      headline: p.name
        ? `${firstName(p.name)}, your next opportunity is one conversation away.`
        : 'Your next opportunity is one conversation away.',
      headline_gold: 'one conversation away.',
      sub: 'Tell Dilly what you\'re after. She\'ll help you get there.',
    }),
  },
  {
    id: 'generic_next_step',
    weight: 1,
    available: () => true,
    generate: () => ({
      eyebrow: 'NEXT STEP',
      eyebrow_color: 'amber',
      headline: 'The next opportunity is closer than you think.',
      headline_gold: 'closer than you think.',
      sub: 'Tell Dilly where you want to go. She\'ll map the gaps.',
    }),
  },
];

/** Pick a greeting variant not shown in the last N opens.
 *  Returns null if no profile cache is available (caller uses default). */
export async function pickSplashGreeting(): Promise<GreetingContent | null> {
  const [profile, history] = await Promise.all([
    readProfileSlim(),
    readSplashHistory(),
  ]);
  if (!profile) return null;

  const now = new Date();
  const eligible = VARIANTS.filter(v => v.available(profile, now));
  // Sort: not-in-history first, then by weight desc
  const sorted = [...eligible].sort((a, b) => {
    const aInHistory = history.includes(a.id);
    const bInHistory = history.includes(b.id);
    if (aInHistory !== bInHistory) return aInHistory ? 1 : -1;
    return b.weight - a.weight;
  });

  const pick = sorted[0];
  if (!pick) return null;

  await recordSplashShown(pick.id);
  const content = pick.generate(profile, now);
  return { variantId: pick.id, ...content };
}

function firstName(name: string): string {
  return name.split(/\s+/)[0];
}
