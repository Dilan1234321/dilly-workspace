export type JobReadiness = "ready" | "close_gap" | "stretch";
export type JobType = "internship" | "full_time";
export type JobDimension = "smart" | "grit" | "build";

export type JobMatchStub = {
  id: string;
  title: string;
  company: string;
  readiness: JobReadiness;
};

export type JobMatch = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: JobType;
  deadline: string | null;
  days_until_deadline: number | null;
  readiness: JobReadiness;
  match_pct: number;
  smart_pass: boolean;
  grit_pass: boolean;
  build_pass: boolean;
  failing_dimension: JobDimension | null;
  gap_pts: number | null;
  gap_insight: string | null;
  why_fit_bullets: string[];
  dilly_take: string;
  apply_url: string | null;
  apply_email: string | null;
  applied: boolean;
};

export type JobsPageData = {
  matches: (JobMatch | JobMatchStub)[];
  total_matches: number;
  locked_count: number;
  is_free_tier: boolean;
  has_audit: boolean;
  has_location_prefs: boolean;
};

export const JOBS_PAGE_CACHE_KEY = "dilly_jobs_page_cache_v1";

export function isFullJobMatch(m: JobMatch | JobMatchStub): m is JobMatch {
  return "match_pct" in m && typeof (m as JobMatch).match_pct === "number";
}
