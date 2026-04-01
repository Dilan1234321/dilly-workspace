/**
 * Cohort utilities — core data re-exported from @dilly/api (single source of truth).
 * Add new cohorts/mappings to packages/dilly-api/src/constants.ts, not here.
 */
export {
  ALL_COHORTS,
  COHORT_COLORS,
  getCohortColor,
  MAJOR_TO_COHORT,
  PRE_PROF_TO_COHORT,
  detectCohort,
  APPROVED_MAJORS,
  INTERESTS_LIST,
  type CohortName,
} from "@dilly/api";

import { ALL_COHORTS } from "@dilly/api";

/**
 * Derives a user's pre-selected interests from their profile.
 * Merges manually saved interests with cohort_scores keys.
 * Desktop-specific helper — not shared because it reads raw profile any-typed data.
 */
export function getProfileInterests(profile: any): string[] {
  const saved: string[] = profile?.interests ?? [];
  const fromCohorts: string[] = Object.values(profile?.cohort_scores ?? {})
    .map((c: any) => c?.cohort)
    .filter((name: any): name is string => typeof name === "string" && ALL_COHORTS.includes(name as never));
  return Array.from(new Set([...saved, ...fromCohorts]));
}
