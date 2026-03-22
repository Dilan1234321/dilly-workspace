import type { College, ListTier, MatchResult } from "@/types/college";
import type { StudentProfile } from "@/types/student";
import { effectiveApCount } from "@/lib/profileSignals";
import { effectiveSat } from "@/lib/testScores";

export type StrengthItem = { label: string; detail: string };

export type SchoolAnalysis = {
  statsLine: string;
  strengths: StrengthItem[];
  areasToStrengthen: string[];
  actionPlanFallback: string;
};

const LEADERSHIP = /\b(president|founder|co-?founder|captain|director|chair|vp|vice president|lead|led)\b/i;

export function formatSchoolStatsLine(c: College): string {
  const sel = Math.round(c.admitRate * 100);
  const satLo = Math.max(400, c.satMid - 55);
  const satHi = Math.min(1600, c.satMid + 45);
  return `Selectivity: ${sel}% • Typical GPA ~${c.gpaMid.toFixed(2)} • SAT ~${satLo}–${satHi}`;
}

function tierLabel(tier: ListTier): string {
  if (tier === "reach") return "Reach";
  if (tier === "match") return "Match";
  return "Safety";
}

export function formatTierBadge(tier: ListTier, estimatedRate: number): string {
  const pct = Math.round(estimatedRate * 100);
  return `${tierLabel(tier)} (${pct}%)`;
}

function firstSentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const cut = t.split(/(?<=[.!?])\s/)[0];
  return cut.length > 120 ? `${cut.slice(0, 117)}…` : cut;
}

export function buildSchoolAnalysis(profile: StudentProfile, college: College, match: MatchResult): SchoolAnalysis {
  const sat = effectiveSat(profile);
  const apN = effectiveApCount(profile);
  const ec = [
    profile.extracurricularsDescription,
    profile.workExperienceDescription,
    profile.honorsAndAwardsDescription,
  ].join("\n");

  const strengths: StrengthItem[] = [];

  if (profile.gpaWeighted != null && profile.gpaWeighted >= 4.0) {
    const comp =
      profile.gpaWeighted >= 4.3 ? "Strong for selective lists" : "Competitive";
    strengths.push({
      label: `Weighted GPA ${profile.gpaWeighted.toFixed(2)}`,
      detail: comp,
    });
  } else if (profile.gpaUnweighted >= college.gpaMid - 0.08) {
    strengths.push({
      label: `Unweighted GPA ${profile.gpaUnweighted.toFixed(2)}`,
      detail: "Aligned with typical mid",
    });
  }

  if (sat != null) {
    if (sat >= college.satMid + 30) {
      strengths.push({
        label: `SAT ${sat}`,
        detail: "At or above typical mid",
      });
    } else if (sat >= college.satMid - 20) {
      strengths.push({
        label: `SAT ${sat}`,
        detail: "Within common band",
      });
    }
  }

  if (apN >= 5) {
    strengths.push({
      label: "Coursework",
      detail: `${apN} advanced courses show rigor`,
    });
  } else if (apN >= 3) {
    strengths.push({
      label: "Coursework",
      detail: `${apN} advanced courses — room to add depth`,
    });
  }

  if (LEADERSHIP.test(ec)) {
    const snippet = ec.match(LEADERSHIP)?.[0] ?? "leadership";
    strengths.push({
      label: "Leadership",
      detail: `Signals like “${snippet}” in your activities`,
    });
  } else if (profile.extracurricularStrength >= 4) {
    strengths.push({
      label: "Involvement",
      detail: "Strong self-rated extracurricular depth",
    });
  }

  if (profile.honorsAndAwardsDescription.trim().length > 40) {
    strengths.push({
      label: "Recognition",
      detail: "Honors/awards section adds concrete signals",
    });
  }

  if (strengths.length === 0) {
    strengths.push({
      label: "Profile",
      detail: "Add test scores, AP selections, and activity detail to unlock sharper strengths.",
    });
  }

  const areas: string[] = [];
  if (match.tier === "reach") {
    areas.push("Sharpen school-specific supplements—avoid generic prestige talk");
  }
  if (sat != null && sat < college.satMid - 40) {
    areas.push("Raise SAT/ACT or lean into strong GPA & essays if test-optional");
  }
  if (apN < 5 && college.admitRate < 0.25) {
    areas.push("Add unique research or project work tied to your major");
  }
  if (ec.trim().length < 120) {
    areas.push("Highlight community impact metrics (people, hours, funds raised)");
  }
  if (!LEADERSHIP.test(ec) && profile.extracurricularStrength <= 3) {
    areas.push("Develop a distinctive “spike” with one deep commitment");
  }
  if (match.tier !== "safety") {
    areas.push("Consider competitive summer programs or college-level coursework for reaches");
  } else {
    areas.push("Keep senior-year grades strong and follow through on interest signals");
  }

  const hook =
    firstSentence(profile.extracurricularsDescription) ||
    firstSentence(profile.additionalInfo) ||
    firstSentence(profile.workExperienceDescription);

  const actionPlanFallback = hook
    ? `Focus your essays on the story behind: ${hook.slice(0, 220)}${hook.length > 220 ? "…" : ""} Tie that narrative to specific programs, values, or faculty at ${college.name}—show fit, not just prestige.`
    : `Build one clear narrative from your activities and intended major (${profile.intendedMajor}), then connect it to ${college.name}’s offerings with specific names (courses, labs, initiatives).`;

  return {
    statsLine: formatSchoolStatsLine(college),
    strengths: strengths.slice(0, 5),
    areasToStrengthen: areas.slice(0, 5),
    actionPlanFallback,
  };
}
