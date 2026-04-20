// Shared types for Skill Lab. Keep in sync with the FastAPI response shapes
// in projects/dilly/api/skill_lab_routes.py and the SQL schema.

export type Video = {
  id: string;                // youtube video id
  title: string;
  channel_id: string;
  channel_title: string;
  cohort: string;            // cohort display name (matches COHORTS[].name)
  duration_sec: number;
  view_count: number;
  published_at: string;      // ISO 8601
  quality_score: number;     // 0–100
  thumbnail_url: string;
  description: string | null;
  language: string;          // ISO 639-1, e.g. 'en'
};

export type SavedVideo = Video & {
  saved_at: string;
  progress_sec: number;
};

export type SessionUser = {
  email: string;
  subscribed: boolean;       // true if on a paid Dilly plan
};
