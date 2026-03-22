import collegesData from "@/data/colleges.json";
import type { College } from "@/types/college";
import type { ListTier, MatchResult } from "@/types/college";
import type { StudentProfile } from "@/types/student";
import {
  collegeDifficultyIndex,
  estimateRateFromIndices,
  studentStrengthIndex,
} from "@/lib/admissionModel";
import { effectiveApCount } from "@/lib/profileSignals";
import { effectiveSat } from "@/lib/testScores";

export { effectiveSat } from "@/lib/testScores";

const colleges = collegesData as unknown as College[];

/**
 * Heuristic model: uses UW/weighted GPA, tests, AP selections, activities/work/honors text.
 * Illustrative only—not an admission prediction.
 */
export function estimateAcceptanceRate(profile: StudentProfile, college: College): number {
  const s = studentStrengthIndex(profile);
  return estimateRateFromIndices(s, college);
}

function tierFor(estimated: number, college: College): ListTier {
  const ar = college.admitRate;
  if (estimated >= 0.42 || estimated >= ar * 2.2) return "safety";
  if (estimated < 0.14 || (ar < 0.12 && estimated < ar * 1.4)) return "reach";
  return "match";
}

function rationale(profile: StudentProfile, college: College, estimated: number): string {
  const sat = effectiveSat(profile);
  const apN = effectiveApCount(profile);
  const w = profile.gpaWeighted != null ? `W GPA ~${profile.gpaWeighted.toFixed(2)}/5` : "no weighted GPA entered";
  const satNote = sat
    ? `Tests ~${sat} vs mid ~${college.satMid}.`
    : "Test-optional path: GPA, rigor, and narrative weigh more.";
  const estPct = Math.round(estimated * 100);
  return `Est. ${estPct}% (illustrative). UW ${profile.gpaUnweighted.toFixed(2)}/4, ${w}, ${apN} advanced courses in model (AP list + IB/DE). Activities/work/honors text + depth slider feed holistic score. ${satNote} School admit rate ~${Math.round(college.admitRate * 100)}%.`;
}

/** Single-school match (e.g. Analysis tab). */
export function getMatchResult(profile: StudentProfile, college: College): MatchResult {
  const estimatedRate = estimateAcceptanceRate(profile, college);
  return {
    college,
    estimatedRate,
    tier: tierFor(estimatedRate, college),
    rationale: rationale(profile, college, estimatedRate),
  };
}

export function matchAll(profile: StudentProfile): MatchResult[] {
  return colleges.map((c) => {
    const estimatedRate = estimateAcceptanceRate(profile, c);
    return {
      college: c,
      estimatedRate,
      tier: tierFor(estimatedRate, c),
      rationale: rationale(profile, c, estimatedRate),
    };
  });
}

export function sortByFit(results: MatchResult[]): MatchResult[] {
  return [...results].sort((a, b) => b.estimatedRate - a.estimatedRate);
}

export function getCollegeById(id: string): College | undefined {
  return colleges.find((c) => c.id === id);
}

export { colleges, collegeDifficultyIndex, studentStrengthIndex };
