/**
 * @dilly/api — Shared localStorage key constants
 *
 * Single source of truth for every key written to localStorage across
 * dashboard, desktop, and mobile. Import from here — never hard-code
 * key strings in application code.
 *
 * Naming convention: all keys follow the "dilly_<noun>" pattern.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────

/** JWT / session token — written on login, deleted on logout (dashboard + mobile). */
export const AUTH_TOKEN_KEY = "dilly_auth_token";

/**
 * Desktop app localStorage token key.
 * Intentionally different from AUTH_TOKEN_KEY — desktop and web apps share a
 * machine but maintain independent sessions to avoid cross-app auth interference.
 */
export const DESKTOP_AUTH_TOKEN_KEY = "dilly_token";

/** Cached user object keyed alongside the auth token (mobile). */
export const AUTH_USER_KEY = "dilly_user";

// ─── Mobile onboarding ───────────────────────────────────────────────────────

/** Set to "1" once onboarding is complete; never cleared by clearAuth(). */
export const HAS_ONBOARDED_KEY = "dilly_has_onboarded";

/** Pending file upload path — survives auth clear so upload can resume after re-login. */
export const PENDING_UPLOAD_KEY = "dilly_pending_upload";

/** Last audit result cached on device. */
export const AUDIT_RESULT_KEY = "dilly_audit_result";

export const ONBOARDING_NAME_KEY = "dilly_onboarding_name";
export const ONBOARDING_COHORT_KEY = "dilly_onboarding_cohort";
export const ONBOARDING_TRACK_KEY = "dilly_onboarding_track";
export const ONBOARDING_MAJORS_KEY = "dilly_onboarding_majors";
export const ONBOARDING_PRE_PROF_KEY = "dilly_onboarding_pre_prof";
export const ONBOARDING_TARGET_KEY = "dilly_onboarding_target";
export const ONBOARDING_INDUSTRY_TARGET_KEY = "dilly_onboarding_industry_target";

// ─── School / Profile ────────────────────────────────────────────────────────

/** School cohort id (e.g. "university_of_tampa"). */
export const SCHOOL_STORAGE_KEY = "dilly_school";

/** Human-readable school name. */
export const SCHOOL_NAME_KEY = "dilly_school_name";

/** Short-lived /auth/me cache so app loads instantly on return; revalidated in background. */
export const AUTH_USER_CACHE_KEY = "dilly_auth_user";

/** Max age for AUTH_USER_CACHE_KEY in milliseconds (5 minutes). */
export const AUTH_USER_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

/** Short-lived profile cache base key (append user-id suffix as needed). */
export const PROFILE_CACHE_KEY_BASE = "dilly_profile_cache";

/** Recruiter API key (X-Recruiter-API-Key) stored for the recruiter-facing UI. */
export const RECRUITER_API_KEY_STORAGE = "dilly_recruiter_api_key";

// ─── Onboarding ──────────────────────────────────────────────────────────────

/** Current onboarding step index (persisted so refresh doesn't restart). */
export const ONBOARDING_STEP_KEY = "dilly_onboarding_step";

// ─── Voice / Chat ─────────────────────────────────────────────────────────────

/** Persisted voice chat message thread. */
export const VOICE_MESSAGES_KEY = "dilly_voice_messages";

/** Persisted voice conversation list. */
export const VOICE_CONVOS_KEY = "dilly_voice_convos";

/** Pending voice prompt to auto-send when the voice UI next opens. */
export const PENDING_VOICE_KEY = "dilly_pending_voice_prompt";

/** Audit id that triggers the voice overlay to open with audit-report context. */
export const VOICE_FROM_AUDIT_ID_KEY = "dilly_voice_from_audit_id";

/**
 * JSON handoff for cert resume help: { cert_id, name?, provider?, source?: "cert_landing" }.
 * Set before opening voice with context=cert; consumed once.
 */
export const VOICE_FROM_CERT_HANDOFF_KEY = "dilly_voice_cert_handoff";

// ─── Audit / Score state ─────────────────────────────────────────────────────

/** Last completed audit result (base key — suffix with user id if needed). */
export const DILLY_STORAGE_KEY_BASE = "dilly_last_audit";

/** Last ATS scan score, persisted so the badge shows without a refetch. */
export const DILLY_LAST_ATS_SCORE_KEY = "dilly_last_ats_score";

/** Score history for the sparkline chart (desktop). */
export const DILLY_SCORE_HISTORY_KEY = "dilly_score_history";

// ─── UI / Overlay state ──────────────────────────────────────────────────────

/** Which overlay (if any) should open on the next app launch. */
export const DILLY_OPEN_OVERLAY_KEY = "dilly_open_overlay";

// ─── Voice prompt hand-offs ──────────────────────────────────────────────────

/** Pre-filled prompt to open voice coach on a score-gap discussion. */
export const DILLY_SCORE_GAP_VOICE_PROMPT_KEY = "dilly_score_gap_voice_prompt";

/** Pre-filled prompt to open voice coach on leaderboard context. */
export const DILLY_LEADERBOARD_VOICE_PROMPT_KEY = "dilly_leaderboard_voice_prompt";

/** Pre-filled prompt to open voice coach on a job-gap discussion. */
export const DILLY_JOB_GAP_VOICE_PROMPT_KEY = "dilly_job_gap_voice_prompt";

/** Pre-filled prompt to expand job search via voice. */
export const DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY =
  "dilly_expand_job_search_voice_prompt";

/** Pre-filled prompt to discuss the career playbook via voice. */
export const DILLY_PLAYBOOK_VOICE_PROMPT_KEY = "dilly_playbook_voice_prompt";

// ─── Cross-feature hand-offs ─────────────────────────────────────────────────

/** Leaderboard data cached for the refresh animation. */
export const DILLY_LEADERBOARD_REFRESH_KEY = "dilly_leaderboard_refresh";

/** Audit report payload handed off from audit flow to the report view. */
export const DILLY_AUDIT_REPORT_HANDOFF_KEY = "dilly_audit_report_handoff";
