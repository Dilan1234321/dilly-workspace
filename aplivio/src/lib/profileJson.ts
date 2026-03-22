import type { StudentProfile } from "@/types/student";
import { DEFAULT_PROFILE } from "@/types/student";

function parseExtra(n: unknown, fallback: number): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return fallback;
}

export function normalizeProfile(raw: unknown): StudentProfile {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROFILE };
  const o = raw as Record<string, unknown>;
  const ex = o.extracurricularStrength;
  const extra =
    ex === 1 || ex === 2 || ex === 3 || ex === 4 || ex === 5 ? ex : DEFAULT_PROFILE.extracurricularStrength;

  let apCourseIds: string[] = [];
  if (Array.isArray(o.apCourseIds)) {
    apCourseIds = o.apCourseIds.filter((x): x is string => typeof x === "string");
  }

  return {
    ...DEFAULT_PROFILE,
    name: typeof o.name === "string" ? o.name : DEFAULT_PROFILE.name,
    gpaUnweighted:
      typeof o.gpaUnweighted === "number" && Number.isFinite(o.gpaUnweighted)
        ? o.gpaUnweighted
        : DEFAULT_PROFILE.gpaUnweighted,
    gpaWeighted:
      typeof o.gpaWeighted === "number" && Number.isFinite(o.gpaWeighted) ? o.gpaWeighted : undefined,
    sat: typeof o.sat === "number" && Number.isFinite(o.sat) ? o.sat : undefined,
    act: typeof o.act === "number" && Number.isFinite(o.act) ? o.act : undefined,
    apCourseIds,
    advancedCourses: parseExtra(o.advancedCourses, DEFAULT_PROFILE.advancedCourses),
    extracurricularStrength: extra,
    extracurricularsDescription:
      typeof o.extracurricularsDescription === "string" ? o.extracurricularsDescription : "",
    workExperienceDescription:
      typeof o.workExperienceDescription === "string" ? o.workExperienceDescription : "",
    honorsAndAwardsDescription:
      typeof o.honorsAndAwardsDescription === "string" ? o.honorsAndAwardsDescription : "",
    additionalInfo: typeof o.additionalInfo === "string" ? o.additionalInfo : "",
    intendedMajor:
      typeof o.intendedMajor === "string" ? o.intendedMajor : DEFAULT_PROFILE.intendedMajor,
    homeState: typeof o.homeState === "string" ? o.homeState : undefined,
  };
}

export function parseSavedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}
