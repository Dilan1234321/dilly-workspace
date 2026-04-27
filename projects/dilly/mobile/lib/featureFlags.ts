/**
 * Feature flags - single-flip constants for in-development surfaces.
 * Set to true locally to preview; ship false until you're ready to roll.
 *
 * Skills recommendation-first landing:
 *   SKILLS_RECOMMENDED_FIRST_ENABLED = true  → tab opens the personalised
 *   feed (hero video, up-next queue, cohort preview) instead of the raw
 *   22-cohort library grid. The library grid remains reachable via
 *   "Browse full library" at the bottom of the feed.
 *
 *   Baked at true for build 401 so users see the new Skills surface
 *   immediately. Flip to false to revert to the raw library grid.
 */
export const SKILLS_RECOMMENDED_FIRST_ENABLED = true;

/**
 * Chapter V2 - the new 5-screen advisor arc with live backend sessions.
 * Baked false for build 406. Flip to true when FEATURE_CHAPTER_API is
 * also enabled on Railway and you're ready to test the full flow.
 */
export const CHAPTER_V2_ENABLED = true;

/**
 * Skills persona-awareness - gates persona-specific copy and backend
 * reason strings for the three Dilly modes: student / seeker / holder.
 * Persona is derived from profile.app_mode / profile.user_path (same
 * logic as mobile/lib/appMode.ts). Flip to false to revert all copy
 * to the generic "Today's picks for you" fallback strings.
 */
export const SKILLS_PERSONA_AWARE = true;
