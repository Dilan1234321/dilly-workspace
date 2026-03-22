import type { FeedCard, FeedCardType, FeedOrderContext } from "./types";

export type FeedCardInput = { id: string; type: FeedCardType };

function scoreDeadlines(days: number | null): { score: number; reason: string } {
  if (days == null) return { score: 200, reason: "no deadline urgency" };
  if (days <= 3) return { score: 900, reason: "deadline within 3 days" };
  if (days <= 7) return { score: 800, reason: "deadline within 7 days" };
  if (days <= 14) return { score: 600, reason: "deadline within 14 days" };
  return { score: 200, reason: "deadline over 14 days out" };
}

function scoreSessionCapture(unseen: boolean): { score: number; reason: string } {
  if (unseen) return { score: 750, reason: "unseen session capture" };
  return { score: 0, reason: "session capture seen — omit" };
}

function scoreConversationOutput(unseen: boolean): { score: number; reason: string } {
  if (unseen) return { score: 740, reason: "unseen conversation output" };
  return { score: 0, reason: "conversation output seen" };
}

function scoreAts(ctx: FeedOrderContext): { score: number; reason: string } {
  if (ctx.has_critical_ats_issues) return { score: 700, reason: "critical ATS issues" };
  const s = ctx.ats_score;
  if (s == null) return { score: 100, reason: "ATS score unknown" };
  if (s < 60) return { score: 500, reason: "ATS score under 60" };
  if (s <= 75) return { score: 300, reason: "ATS score 60–75" };
  return { score: 100, reason: "ATS score above 75" };
}

function scoreActionItems(oldestDays: number, undone: number): { score: number; reason: string } {
  if (undone <= 0) return { score: 0, reason: "no undone action items" };
  if (oldestDays > 7) return { score: 650, reason: "action item older than 7 days" };
  if (oldestDays >= 3) return { score: 400, reason: "action item 3–7 days old" };
  return { score: 250, reason: "recent undone action items" };
}

function scoreCohortPulse(unseen: boolean, isMonday: boolean): { score: number; reason: string } {
  if (!unseen) return { score: 150, reason: "cohort pulse already seen" };
  if (isMonday) return { score: 600, reason: "unseen cohort pulse (Monday bump)" };
  return { score: 300, reason: "unseen cohort pulse" };
}

function scoreApplications(ctx: FeedOrderContext): { score: number; reason: string } {
  const silent = ctx.days_since_last_application != null && ctx.days_since_last_application >= 14;
  if (silent && ctx.is_recruiting_season) {
    return { score: 550, reason: "14+ days no application during recruiting season" };
  }
  return { score: 200, reason: "normal application activity" };
}

function scoreAmIReady(ctx: FeedOrderContext): { score: number; reason: string } {
  if (ctx.am_i_ready_follow_up_pending) return { score: 500, reason: "Am I ready follow-up pending" };
  return { score: 150, reason: "Am I ready default priority" };
}

/**
 * Deterministic feed ordering. Score card pinned first (1000), dilly_insight second (999) when present.
 * Cards with priority 0 are dropped from the ordered list (caller may still render elsewhere).
 */
export function orderFeedCards(cards: FeedCardInput[], context: FeedOrderContext): FeedCard[] {
  const isMonday = new Date().getDay() === 1;
  const enriched: FeedCard[] = [];

  for (const c of cards) {
    let priority_score = 0;
    let reason = "";

    switch (c.type) {
      case "score":
        priority_score = 1000;
        reason = "pinned: score card";
        break;
      case "dilly_insight":
        priority_score = 999;
        reason = "pinned: home insight";
        break;
      case "deadlines": {
        const d = scoreDeadlines(context.days_until_nearest_deadline);
        priority_score = d.score;
        reason = d.reason;
        break;
      }
      case "session_capture": {
        const s = scoreSessionCapture(context.unseen_session_capture);
        priority_score = s.score;
        reason = s.reason;
        break;
      }
      case "conversation_output": {
        const co = scoreConversationOutput(context.unseen_conversation_output);
        priority_score = co.score;
        reason = co.reason;
        break;
      }
      case "ats": {
        const a = scoreAts(context);
        priority_score = a.score;
        reason = a.reason;
        break;
      }
      case "action_items": {
        const ai = scoreActionItems(context.oldest_action_item_days, context.undone_action_items);
        priority_score = ai.score;
        reason = ai.reason;
        break;
      }
      case "cohort_pulse": {
        const cp = scoreCohortPulse(context.unseen_cohort_pulse, isMonday);
        priority_score = cp.score;
        reason = cp.reason;
        break;
      }
      case "applications": {
        const ap = scoreApplications(context);
        priority_score = ap.score;
        reason = ap.reason;
        break;
      }
      case "am_i_ready": {
        const ar = scoreAmIReady(context);
        priority_score = ar.score;
        reason = ar.reason;
        break;
      }
      default:
        priority_score = 100;
        reason = "default";
    }

    enriched.push({ ...c, priority_score, reason });
  }

  const scoreE = enriched.find((x) => x.type === "score");
  const insightE = enriched.find((x) => x.type === "dilly_insight");
  const rest = enriched
    .filter((x) => x.type !== "score" && x.type !== "dilly_insight")
    .sort((a, b) => b.priority_score - a.priority_score);

  const head: FeedCard[] = [];
  if (scoreE) head.push(scoreE);
  if (insightE) head.push(insightE);
  return [...head, ...rest];
}

/** Ids only, after ordering and filtering zero-priority optional types if needed */
export function orderedFeedIds(cards: FeedCardInput[], context: FeedOrderContext): string[] {
  const ordered = orderFeedCards(cards, context);
  return ordered.filter((c) => c.priority_score > 0 || c.type === "score" || c.type === "dilly_insight").map((c) => c.id);
}
