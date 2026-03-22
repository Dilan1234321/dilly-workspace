import type { AppProfile } from "@/types/dilly";
import type { HomeInsightContext } from "./types";

function buildUserPrompt(name: string, ctx: HomeInsightContext): string {
  const lines: string[] = [];
  lines.push(`Student name: ${name || "Student"}`);
  const la = ctx.latest_audit;
  if (la) {
    lines.push(
      `Track: ${la.detected_track}. Final score: ${la.final_score}. Smart ${la.scores?.smart ?? "?"} / Grit ${la.scores?.grit ?? "?"} / Build ${la.scores?.build ?? "?"}.`,
    );
  }
  if (ctx.score_delta != null) lines.push(`Score delta since previous audit: ${ctx.score_delta}`);
  if (ctx.peer_percentile != null) lines.push(`Peer percentile (approx): ${ctx.peer_percentile}`);
  if (ctx.days_since_last_audit != null) lines.push(`Days since last audit: ${ctx.days_since_last_audit}`);
  if (ctx.upcoming_deadlines.length) {
    lines.push(
      "Upcoming deadlines: " +
        ctx.upcoming_deadlines
          .slice(0, 5)
          .map((d) => `${d.label} (${d.date})`)
          .join("; "),
    );
  }
  if (ctx.applications.length) {
    lines.push(
      "Applications: " +
        ctx.applications
          .slice(0, 6)
          .map((a) => `${a.company_name || a.company || "?"} — ${a.status || "unknown"}`)
          .join("; "),
    );
  }
  const undone = ctx.action_items.filter((a) => !a.done && !a.dismissed);
  lines.push(`Undone action items: ${undone.length}`);
  if (ctx.memory_items.length) {
    lines.push(
      "Recent memory: " +
        ctx.memory_items
          .slice(0, 4)
          .map((m) => m.label || m.value)
          .join("; "),
    );
  }
  if (ctx.cohort_pulse) {
    lines.push(`Cohort pulse: score change ${ctx.cohort_pulse.user_score_change}, commentary: ${ctx.cohort_pulse.dilly_commentary ?? ""}`);
  }
  if (ctx.last_insight) {
    lines.push(`Last insight (do not repeat): ${ctx.last_insight}`);
    lines.push(`Last insight at: ${ctx.last_insight_at ?? "unknown"}`);
  }
  return lines.join("\n");
}

/**
 * Calls the Next.js API route (Anthropic). Returns null on failure / NULL / timeout.
 */
export async function generateHomeInsight(
  _uid: string,
  profile: AppProfile,
  context: HomeInsightContext,
): Promise<string | null> {
  const name = profile.name?.trim() || "";
  const user_prompt = buildUserPrompt(name, context);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("/api/dilly-presence/home-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_prompt }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as { insight?: string | null };
    const insight = data.insight?.trim();
    if (!insight || insight.toUpperCase() === "NULL") return null;
    return insight;
  } catch {
    return null;
  }
}
