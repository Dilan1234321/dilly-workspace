/**
 * Keeps BottomNav (and stacked minibar) above the synthetic home indicator (PhoneHomeIndicator.tsx).
 */
export const PHONE_CHROME_LAYOUT = {
  /** `bottom` for fixed BottomNav / dock stack */
  bottomNavBottom:
    "calc(max(10px, calc(env(safe-area-inset-bottom, 0px) + 6px)) + 5px + 10px)",
  /** Fixed minibar above a separate bottom tab row (~Jobs `m-nav`, same vertical band as BottomNav). */
  minibarFixedBottom:
    "calc(max(10px, calc(env(safe-area-inset-bottom, 0px) + 6px)) + 5px + 10px + 76px)",
  /** z-index: blur strip below tab bar < home pill < BottomNav */
  zBottomBlurWell: 92,
  zHomeIndicator: 96,
  /** VoiceOverlay backdrop is z-[100]; use this when overlay is open so dock + minibar sit under the dimmer. */
  zBottomNavUnderVoiceOverlay: 99,
  zBottomNav: 100,
} as const;
