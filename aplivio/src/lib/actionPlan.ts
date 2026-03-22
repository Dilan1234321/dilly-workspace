import type { College } from "@/types/college";
import type { StudentProfile } from "@/types/student";
import { effectiveSat, estimateAcceptanceRate } from "@/lib/match";
import { effectiveApCount, holisticNarrativeScore } from "@/lib/profileSignals";

export type ActionItem = {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
};

export function buildActionPlan(
  profile: StudentProfile,
  targets: College[],
): { summary: string; items: ActionItem[] } {
  const sat = effectiveSat(profile);
  const items: ActionItem[] = [];
  const apTotal = effectiveApCount(profile);
  const narrative = holisticNarrativeScore(profile);

  if (!sat) {
    items.push({
      title: "Clarify testing strategy",
      detail:
        "Add an SAT or ACT score to tighten estimates, or confirm test-optional policies per school and lean on GPA, rigor, and essays.",
      priority: "high",
    });
  }

  if (apTotal < 5) {
    items.push({
      title: "Increase rigor signal",
      detail:
        "Select the AP courses you’ve taken (or add IB/DE in the other field). Selective schools expect sustained challenge aligned with your major.",
      priority: "high",
    });
  }

  if (narrative < 2.5 && profile.extracurricularStrength <= 2) {
    items.push({
      title: "Add specifics to activities & impact",
      detail:
        "Describe 1–2 extracurriculars with role, timeframe, and measurable outcomes (hours, people impacted, awards). Stronger narratives lift the holistic score in the model.",
      priority: "medium",
    });
  }

  if (profile.gpaUnweighted < 3.7 && targets.some((t) => t.admitRate < 0.2)) {
    items.push({
      title: "Balance reach list with matches",
      detail:
        "Your unweighted GPA is below typical midpoints for several reach schools. Keep a few reaches but ensure matches and safeties where your profile fits.",
      priority: "high",
    });
  }

  const weakest = targets
    .map((c) => ({
      college: c,
      est: estimateAcceptanceRate(profile, c),
    }))
    .sort((a, b) => a.est - b.est)[0];

  if (weakest && weakest.est < 0.18) {
    items.push({
      title: `Strengthen fit narrative for ${weakest.college.name}`,
      detail:
        "For lower estimated odds, show program-specific fit (courses, faculty, initiatives)—not generic prestige.",
      priority: "medium",
    });
  }

  items.push({
    title: "Lock recommendation and transcript timing",
    detail:
      "Request counselor/teacher recommendations early; confirm transcript delivery windows for each portal.",
    priority: "medium",
  });

  const summary = `Plan for ${profile.intendedMajor}: focus on ${items.filter((i) => i.priority === "high").length} high-priority items before the next deadline.`;

  return { summary, items };
}
