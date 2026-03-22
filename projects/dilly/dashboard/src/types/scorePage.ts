export type ScorePageData = {
  first_name: string;
  track: string;
  school_short: string;
  final_score: number;
  smart: number;
  grit: number;
  build: number;
  final_percentile: number;
  weakest_dimension: "smart" | "grit" | "build";
  gap_insight: string;
  nearest_company: string;
  nearest_company_bar: number;
  nearest_company_gap: number;
  audit_history: { score: number; date: string; audit_id?: string | null }[];
  peer_preview: { initials: string; score: number; rank: number; is_student: boolean }[];
  student_rank: number;
  peer_count: number;
  is_free_tier: boolean;
  latest_audit_id?: string | null;
  audit_ts?: number | null;
  dimension_bar_smart?: number;
  dimension_bar_grit?: number;
  dimension_bar_build?: number;
};

export const SCORE_PAGE_CACHE_KEY = "dilly_score_page_cache_v1";

/** True when the payload has no audit id and no non-zero scores (the default “empty” shell). */
export function scorePayloadLooksEmpty(p: ScorePageData | null | undefined): boolean {
  if (!p) return true;
  const z = (n: number | undefined) => n == null || !(n > 0);
  return !p.latest_audit_id?.trim() && z(p.final_score) && z(p.smart) && z(p.grit) && z(p.build);
}

/** Read cached score-page payload from session (client only). */
export function readScorePageCache(): ScorePageData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SCORE_PAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { payload?: ScorePageData };
    if (parsed?.payload && typeof parsed.payload === "object") {
      return parsed.payload;
    }
  } catch {
    /* ignore */
  }
  return null;
}
