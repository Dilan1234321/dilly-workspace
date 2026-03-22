import type { StudentProfile } from "@/types/student";
import { AP_COURSE_BY_ID } from "@/data/apCourses";

const IMPACT_WORDS =
  /\b(president|founder|co-?founder|captain|director|officer|chair|vp|vice president|national|state|regional|published|patent|internship|nonprofit|non-profit|volunteer|research|lab|startup|founded|led|managed|raised|scholarship|finalist|semifinalist|first place|award|honor|eagle scout|varsity|all-?state|nationals)\b/gi;

/** STEM-ish majors: boost alignment with STEM APs */
const STEM_MAJOR = /\b(computer|cs|software|data|math|physics|engineering|bio|chemistry|chem|pre-?med|neuroscience|statistics|mechanical|electrical|civil|aerospace)\b/i;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** 0–8: narrative depth + impact language from activities, work, honors */
export function holisticNarrativeScore(profile: StudentProfile): number {
  const blocks = [
    profile.extracurricularsDescription,
    profile.workExperienceDescription,
    profile.honorsAndAwardsDescription,
    profile.additionalInfo,
  ];
  const combined = blocks.join("\n").trim();
  const len = combined.length;

  let score = 0;
  if (len >= 400) score += 3;
  else if (len >= 200) score += 2;
  else if (len >= 80) score += 1;

  const matches = combined.match(IMPACT_WORDS);
  const kw = matches ? Math.min(5, matches.length * 0.7) : 0;
  score += kw;

  if (len < 30) {
    score = Math.max(score, (profile.extracurricularStrength / 5) * 3);
  }

  return clamp(Math.round(score * 10) / 10, 0, 8);
}

export function stemMajorIntent(profile: StudentProfile): boolean {
  return STEM_MAJOR.test(profile.intendedMajor);
}

export function stemApAlignmentBonus(profile: StudentProfile): number {
  if (!stemMajorIntent(profile)) return 0;
  let stemAps = 0;
  for (const id of profile.apCourseIds) {
    if (AP_COURSE_BY_ID[id]?.stem) stemAps += 1;
  }
  return clamp(stemAps * 0.6, 0, 3);
}

/** AP exams + other advanced (IB/DE) capped for model stability */
export function effectiveApCount(profile: StudentProfile): number {
  return clamp(profile.apCourseIds.length + profile.advancedCourses, 0, 24);
}
