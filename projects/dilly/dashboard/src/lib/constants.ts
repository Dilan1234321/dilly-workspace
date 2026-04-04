/**
 * Shared constants for the Dilly dashboard.
 *
 * Storage key constants live in @dilly/api — re-exported here for convenience.
 */

import type { DimensionKey } from "@/types/dilly";

// ─── Storage keys — single source of truth is @dilly/api/src/storage-keys.ts ─
export {
  AUTH_TOKEN_KEY,
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_MAX_AGE_MS,
  DILLY_AUDIT_REPORT_HANDOFF_KEY,
  DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY,
  DILLY_JOB_GAP_VOICE_PROMPT_KEY,
  DILLY_LAST_ATS_SCORE_KEY,
  DILLY_LEADERBOARD_REFRESH_KEY,
  DILLY_LEADERBOARD_VOICE_PROMPT_KEY,
  DILLY_OPEN_OVERLAY_KEY,
  DILLY_PLAYBOOK_VOICE_PROMPT_KEY,
  DILLY_SCORE_GAP_VOICE_PROMPT_KEY,
  DILLY_STORAGE_KEY_BASE,
  ONBOARDING_STEP_KEY,
  PENDING_VOICE_KEY,
  PROFILE_CACHE_KEY_BASE,
  RECRUITER_API_KEY_STORAGE,
  SCHOOL_NAME_KEY,
  SCHOOL_STORAGE_KEY,
  VOICE_CONVOS_KEY,
  VOICE_FROM_AUDIT_ID_KEY,
  VOICE_FROM_CERT_HANDOFF_KEY,
  VOICE_MESSAGES_KEY,
} from "@dilly/api";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const LOW_SCORE_THRESHOLD = 50;

export const DIMENSIONS: { key: DimensionKey; label: string }[] = [
  { key: "smart", label: "Smart" },
  { key: "grit", label: "Grit" },
  { key: "build", label: "Build" },
];

export const GOALS_ALL = [
  { key: "internship", label: "I Want an Internship" },
  { key: "gain_experience", label: "I Want to Gain Experience" },
  { key: "meet_like_minded", label: "I Want to Meet Like-Minded People" },
  { key: "get_involved_university", label: "I Want to Get Involved With My University" },
  { key: "figure_out", label: "I Want to Figure Out What I Actually Want" },
];

/** sessionStorage key for last Career Center path. Used when Back is clicked on child pages (ATS, Jobs, etc.) so we return to the user's last tab instead of new audit. */
export const LAST_CAREER_CENTER_PATH_KEY = "dilly_last_career_center_path";
