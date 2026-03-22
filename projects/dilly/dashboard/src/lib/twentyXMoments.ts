/**
 * 20x Moments — Make the value of Dilly feel like a 10–20x improvement.
 * Contextual before/after copy shown when relevant. Underpromise, overdeliver.
 */

export type TwentyXMomentId =
  | "applications"
  | "interview_prep"
  | "mental_load"
  | "rejection_recovery"
  | "networking";

export type TwentyXMoment = {
  id: TwentyXMomentId;
  before: string;
  with: string;
  headline?: string;
  /** When to show (context hint) */
  when?: string;
};

export const TWENTY_X_MOMENTS: Record<TwentyXMomentId, TwentyXMoment> = {
  applications: {
    id: "applications",
    before: "Hours per application",
    with: "Tailored resume + cover letter in minutes",
    headline: "Applications",
    when: "When applying or tracking apps",
  },
  interview_prep: {
    id: "interview_prep",
    before: "Generic questions",
    with: "Personalized questions + story prompts from your profile",
    headline: "Interview prep",
    when: "When opening Interview Prep",
  },
  mental_load: {
    id: "mental_load",
    before: "Spreadsheets and notes",
    with: "One place for deadlines, applications, and prep",
    headline: "Mental load",
    when: "Career Center",
  },
  rejection_recovery: {
    id: "rejection_recovery",
    before: "Stuck and demotivated",
    with: "Reframe + next steps + progress view",
    headline: "Rejection recovery",
    when: "When user has rejections",
  },
  networking: {
    id: "networking",
    before: "Sporadic, forgetful",
    with: "Reminders + templates + relationship tracking",
    headline: "Networking",
    when: "When user has people in beyond_resume",
  },
};

/** Compact one-line format for cards: "Before: X. With Dilly: Y." */
export function formatTwentyXCompact(m: TwentyXMoment): string {
  return `${m.before} → ${m.with}`;
}
