export type LeaderboardEntry = {
  rank: number;
  initials: string;
  display_name: string;
  score: number;
  score_change_this_week: number | null;
  year: string | null;
  is_student: boolean;
  /** Global board (`All cohorts`): cohort label for this row. */
  cohort_track?: string;
};

export type WeeklyEvent = {
  type: "moved_up" | "new_entry" | "score_improved" | "student_moved";
  text: string;
  is_student: boolean;
  dot_color: "green" | "amber" | "blue";
};

export type LeaderboardPodiumSlot = {
  rank: number;
  initials: string;
  display_name: string;
  score: number;
  is_student: boolean;
  medal: number;
  cohort_track?: string;
};

export type LeaderboardData = {
  track: string;
  school_short: string;
  student_rank: number;
  student_rank_last_week: number | null;
  rank_change: number;
  peer_count: number;
  student_score: number;
  student_first_name: string;
  pts_to_next_rank: number;
  move_up_insight: string;
  podium: LeaderboardPodiumSlot[];
  entries: LeaderboardEntry[];
  weekly_events: WeeklyEvent[];
  is_free_tier: boolean;
  locked_count: number;
  weakest_dimension: "smart" | "grit" | "build";
  goldman_application_days?: number;
};

export const LEADERBOARD_CACHE_KEY = "dilly_leaderboard_cache_v3";

/** Session cache for `/leaderboard` → All cohorts (same payload shape as track board). */
export const GLOBAL_LEADERBOARD_CACHE_KEY = "dilly_global_leaderboard_cache_v1";

export function parseLeaderboardEntry(raw: unknown): LeaderboardEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const er = raw as Record<string, unknown>;
  const rank = typeof er.rank === "number" && Number.isFinite(er.rank) ? er.rank : 0;
  return {
    rank,
    initials: typeof er.initials === "string" ? er.initials : "??",
    display_name: typeof er.display_name === "string" ? er.display_name : "—",
    score: typeof er.score === "number" && Number.isFinite(er.score) ? er.score : 0,
    score_change_this_week:
      er.score_change_this_week === null || (typeof er.score_change_this_week === "number" && Number.isFinite(er.score_change_this_week))
        ? (er.score_change_this_week as number | null)
        : null,
    year: er.year === null || typeof er.year === "string" ? (er.year as string | null) : null,
    is_student: typeof er.is_student === "boolean" ? er.is_student : false,
    cohort_track: typeof er.cohort_track === "string" ? er.cohort_track : undefined,
  };
}

export function parsePodiumSlot(raw: unknown): LeaderboardPodiumSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const medal = typeof s.medal === "number" && Number.isFinite(s.medal) ? s.medal : 1;
  return {
    rank: typeof s.rank === "number" && Number.isFinite(s.rank) ? s.rank : 0,
    initials: typeof s.initials === "string" ? s.initials : "—",
    display_name: typeof s.display_name === "string" ? s.display_name : "—",
    score: typeof s.score === "number" && Number.isFinite(s.score) ? s.score : 0,
    is_student: typeof s.is_student === "boolean" ? s.is_student : false,
    medal,
    cohort_track: typeof s.cohort_track === "string" ? s.cohort_track : undefined,
  };
}
