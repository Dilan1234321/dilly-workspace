/**
 * CONNECT FEATURE FLAG
 *
 * Everything in the recruiter Connect surface is dark-launched behind
 * this single constant.  Flip to `true` to turn on all entry points:
 *
 *   - Header icon (Home screen top-right row)
 *   - Home screen "Recruiter activity" card
 *   - My Dilly "Recruiter activity" preview section
 *   - Jobs-feed "Interested in you" badge scaffold
 *   - First-time reveal takeover (shown once per account)
 *   - Full Connect modal stack (who's watching, browse, requests,
 *     conversations, pipeline, visibility settings)
 *
 * To enable: change the line below to `true` and rebuild.
 * The flag is intentionally a compile-time constant (not remote config)
 * so there is zero runtime overhead when disabled.
 *
 * Phase 3 wire-up checklist:
 *   1. Flip CONNECT_FEATURE_ENABLED to `true`
 *   2. Replace CONNECT_FIXTURES in ConnectModal.tsx with real API calls
 *      to /recruiter/activity, /recruiter/requests, /recruiter/conversations
 *   3. Replace AsyncStorage visibility persistence with /profile PATCH
 *      (marked TODO in ConnectVisibilitySettings.tsx)
 *   4. Wire notification deep-links to openConnectOverlay()
 *   5. Wire Wins-timeline share prompt to Connect pipeline section
 *   6. Remove "Coming soon" banners from conversation / pipeline sections
 */
export const CONNECT_FEATURE_ENABLED = false;
