import { describe, expect, it, vi } from "vitest";
import { orderFeedCards, orderedFeedIds } from "./orderFeed";
import type { FeedOrderContext } from "./types";

const baseCtx = (): FeedOrderContext => ({
  has_critical_ats_issues: false,
  days_until_nearest_deadline: null,
  deadline_label: null,
  undone_action_items: 0,
  oldest_action_item_days: 0,
  days_since_last_application: null,
  score_delta: null,
  unseen_session_capture: false,
  unseen_conversation_output: false,
  unseen_cohort_pulse: false,
  is_recruiting_season: false,
  peer_percentile: null,
  ats_score: null,
  am_i_ready_follow_up_pending: false,
});

describe("orderFeedCards", () => {
  it("pins score first and dilly_insight second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z")); // Wednesday
    const ordered = orderFeedCards(
      [
        { id: "a", type: "applications" },
        { id: "s", type: "score" },
        { id: "i", type: "dilly_insight" },
        { id: "d", type: "deadlines" },
      ],
      { ...baseCtx(), days_until_nearest_deadline: 2 },
    );
    expect(ordered.map((c) => c.type)).toEqual(["score", "dilly_insight", "deadlines", "applications"]);
    vi.useRealTimers();
  });

  it("orders dynamic cards by priority (deadline urgency)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));
    const ordered = orderFeedCards(
      [
        { id: "apps", type: "applications" },
        { id: "dl", type: "deadlines" },
      ],
      { ...baseCtx(), days_until_nearest_deadline: 1 },
    );
    expect(ordered[0].type).toBe("deadlines");
    expect(ordered[0].priority_score).toBeGreaterThan(ordered[1].priority_score);
    vi.useRealTimers();
  });
});

describe("orderedFeedIds", () => {
  it("returns ids in sorted order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));
    const ids = orderedFeedIds(
      [
        { id: "x", type: "ats" },
        { id: "y", type: "action_items" },
      ],
      { ...baseCtx(), has_critical_ats_issues: true, undone_action_items: 2, oldest_action_item_days: 10 },
    );
    expect(ids[0]).toBe("x");
    vi.useRealTimers();
  });
});
