/**
 * Dilly noticed: conditions that trigger a small card in Career Center.
 * Track which have been shown to avoid repeat.
 */

const SEEN_KEY = "dilly_noticed_seen";

export type DillyNoticedId =
  | "improved_3_audits"
  | "consistent_calendar"
  | "five_applications_week"
  | "first_top25"
  | "streak_7";

export type DillyNoticedCard = {
  id: DillyNoticedId;
  title: string;
  message: string;
};

function hasSeen(id: DillyNoticedId): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    return seen.includes(id);
  } catch {
    return false;
  }
}

export function markNoticedSeen(id: DillyNoticedId): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (!seen.includes(id)) {
      seen.push(id);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    }
  } catch {
    /* ignore */
  }
}

export type NoticedConditions = {
  improved3AuditsInRow?: boolean;
  consistentCalendar?: boolean;
  fiveApplicationsThisWeek?: boolean;
  firstTop25?: boolean;
  streak7?: boolean;
};

const NOTICED_CARDS: Record<DillyNoticedId, DillyNoticedCard> = {
  improved_3_audits: {
    id: "improved_3_audits",
    title: "Dilly noticed",
    message: "You've improved 3 audits in a row. That's momentum.",
  },
  consistent_calendar: {
    id: "consistent_calendar",
    title: "Dilly noticed",
    message: "Your calendar's looking organized. Keep it up.",
  },
  five_applications_week: {
    id: "five_applications_week",
    title: "Dilly noticed",
    message: "5 applications this week. You're putting in the work.",
  },
  first_top25: {
    id: "first_top25",
    title: "Dilly noticed",
    message: "First time in Top 25%. Recruiters will notice.",
  },
  streak_7: {
    id: "streak_7",
    title: "Dilly noticed",
    message: "7-day streak. Consistency wins.",
  },
};

/**
 * Check conditions and return the first matching card that hasn't been shown.
 */
export function getDillyNoticedCard(
  conditions: NoticedConditions
): DillyNoticedCard | null {
  if (conditions.improved3AuditsInRow && !hasSeen("improved_3_audits")) {
    return NOTICED_CARDS.improved_3_audits;
  }
  if (conditions.consistentCalendar && !hasSeen("consistent_calendar")) {
    return NOTICED_CARDS.consistent_calendar;
  }
  if (conditions.fiveApplicationsThisWeek && !hasSeen("five_applications_week")) {
    return NOTICED_CARDS.five_applications_week;
  }
  if (conditions.firstTop25 && !hasSeen("first_top25")) {
    return NOTICED_CARDS.first_top25;
  }
  if (conditions.streak7 && !hasSeen("streak_7")) {
    return NOTICED_CARDS.streak_7;
  }
  return null;
}
