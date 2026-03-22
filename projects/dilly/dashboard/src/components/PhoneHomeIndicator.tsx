import { PHONE_CHROME_LAYOUT } from "@/lib/phoneChromeLayout";

/**
 * iOS-style home indicator (pill). Rendered once from the root layout so every route
 * matches phone chrome. Sits at the bottom; above the blur well, below BottomNav (see phoneChromeLayout z-indexs).
 *
 * On devices with a large system safe-area inset, the OS also draws an indicator — you may
 * see both; tune with CSS or a client gate later if needed.
 */
export function PhoneHomeIndicator() {
  return (
    <div
      className="phone-home-indicator fixed left-1/2 -translate-x-1/2 pointer-events-none"
      style={{
        zIndex: PHONE_CHROME_LAYOUT.zHomeIndicator,
        bottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 6px))",
        width: 134,
        height: 5,
        borderRadius: 9999,
        background: "rgba(255, 255, 255, 0.42)",
        boxShadow: "0 0 0 0.5px rgba(0, 0, 0, 0.25)",
      }}
      aria-hidden
    />
  );
}

/** @deprecated Use `PhoneHomeIndicator` */
export const PhoneHomeIndicatorPreview = PhoneHomeIndicator;
