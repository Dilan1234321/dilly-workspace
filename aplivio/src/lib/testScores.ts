import type { StudentProfile } from "@/types/student";

/** Rough ACT → SAT concordance for modeling only */
export function effectiveSat(profile: StudentProfile): number | undefined {
  if (profile.sat != null && profile.sat >= 400) return profile.sat;
  if (profile.act != null && profile.act >= 1 && profile.act <= 36) {
    return Math.round(400 + ((profile.act - 1) / 35) * 1200);
  }
  return undefined;
}
