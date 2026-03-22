import type { StudentProfile } from "@/types/student";
import type { College } from "@/types/college";
import { effectiveSat } from "@/lib/testScores";
import { holisticNarrativeScore, stemApAlignmentBonus, effectiveApCount } from "@/lib/profileSignals";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Composite 0–100 academic + extracurricular strength vs typical selective pool.
 * Not a prediction—feeds the acceptance heuristic.
 */
export function studentStrengthIndex(profile: StudentProfile): number {
  const uw = clamp(profile.gpaUnweighted, 0, 4);
  /** Avoid double-counting UW + weighted when both exist */
  let academicBlock: number;
  if (profile.gpaWeighted != null && profile.gpaWeighted > 0) {
    const gw = clamp(profile.gpaWeighted, 0, 5);
    academicBlock = (uw / 4) * 18 + (gw / 5) * 20;
  } else {
    academicBlock = (uw / 4) * 32;
  }

  const sat = effectiveSat(profile);
  const testScore = sat
    ? ((sat - 400) / 1200) * 30
    : 11;

  const apN = effectiveApCount(profile);
  const rigor = clamp(Math.sqrt(apN + 1) * 4.2, 0, 18);
  const stemBonus = stemApAlignmentBonus(profile);

  const narrative = holisticNarrativeScore(profile);
  const sliderBoost = (profile.extracurricularStrength / 5) * 4;

  const raw =
    academicBlock +
    testScore +
    rigor +
    stemBonus +
    narrative +
    sliderBoost * 0.35;

  return clamp(raw, 0, 100);
}

export function collegeDifficultyIndex(c: College): number {
  const selectivity = (1 - c.admitRate) * 100;
  const satBar = ((1600 - c.satMid) / 1200) * 36;
  const gpaBar = ((4 - c.gpaMid) / 1.2) * 20;
  return clamp(selectivity * 0.44 + satBar * 0.36 + gpaBar * 0.2, 0, 100);
}

export function estimateRateFromIndices(studentIndex: number, college: College): number {
  const d = collegeDifficultyIndex(college);
  const delta = (studentIndex - d) / 11.5;
  const boost = Math.exp(0.62 * delta);
  return clamp(college.admitRate * boost, 0.02, 0.92);
}
