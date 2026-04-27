/**
 * appMode - Dilly's primary product-mode primitive.
 *
 * Three modes, one profile. This is the switch that reshapes the entire
 * app for the audience without forking the data layer.
 *
 *   holder  - has a job, wants to stay ahead of AI + plan their career
 *             Default tabs: Arena / Chat / The Market / My Career
 *             Hero feature: Arena (threat report, peer signals, weekly pulse)
 *             Tone: sharp strategist, not cheerleader
 *
 *   seeker  - actively looking for work they don't have yet
 *             Default tabs: Career Center / Arena / My Dilly / Jobs
 *             Hero feature: Jobs feed with fit narratives
 *             Tone: honest coach, path-specific (dropout, veteran, etc.)
 *
 *   student - in school, working toward a first role
 *             Default tabs: Career Center / Arena / My Dilly / Jobs
 *             Hero feature: journey + internships
 *             Tone: cohort-aware, aspirational but direct
 *
 * Derivation (seeker-primary audience mapping):
 *   user_path === 'i_have_a_job'             → holder
 *   user_path === 'student'                  → student
 *   everything else (16 paths)               → seeker
 *
 * Override:
 *   profile.app_mode can explicitly override the derived value. Set when
 *   the user flips a toggle in settings or accepts a Dilly prompt
 *   ("Looks like you're job hunting - switch to Job Search mode?").
 *
 * Mode is derived at render time from profile. No separate state to sync.
 */

export type AppMode = 'holder' | 'seeker' | 'student';

const HOLDER_PATHS = new Set(['i_have_a_job']);
const STUDENT_PATHS = new Set(['student']);

export interface ProfileLike {
  user_path?: string | null;
  app_mode?: string | null;
}

/** Derive the product mode from a profile. Never throws. */
export function getAppMode(profile: ProfileLike | null | undefined): AppMode {
  if (!profile) return 'seeker';

  // Explicit override wins - the user told us what mode they want.
  const override = (profile.app_mode || '').trim().toLowerCase();
  if (override === 'holder' || override === 'seeker' || override === 'student') {
    return override;
  }

  const path = (profile.user_path || '').trim().toLowerCase();
  if (HOLDER_PATHS.has(path)) return 'holder';
  if (STUDENT_PATHS.has(path)) return 'student';
  return 'seeker';
}

/** Human-readable label for the current mode, used in settings + toggles. */
export function modeLabel(mode: AppMode): string {
  switch (mode) {
    case 'holder':  return 'Career Watch';
    case 'seeker':  return 'Job Search';
    case 'student': return 'Student';
  }
}

/** One-line explanation of what each mode is for. */
export function modeDescription(mode: AppMode): string {
  switch (mode) {
    case 'holder':
      return "You have a job. Dilly watches your field and tells you what's changing, how your peers are adapting, and what to learn this month.";
    case 'seeker':
      return "You're looking for a new role. Dilly matches you to jobs, writes fit narratives, tailors resumes, and preps you for interviews.";
    case 'student':
      return "You're in school. Dilly guides you through internships, first roles, and the unwritten rules of breaking in.";
  }
}

/** All modes in display order (holder first - reflects default audience). */
export const ALL_MODES: AppMode[] = ['holder', 'seeker', 'student'];
