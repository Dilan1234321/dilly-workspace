"use client";

import type { CSSProperties, ReactNode } from "react";
import { PHONE_CHROME_LAYOUT } from "@/lib/phoneChromeLayout";
import { cn } from "@/lib/utils";

export type MainAppTabKey = "center" | "voice" | "resources" | "rank";

type NavItem = {
  key: MainAppTabKey;
  label: string;
  icon: ReactNode;
  badge?: boolean;
};

type BottomNavProps = {
  /** `career` highlights the Center tab on standalone shells that are not a main tab (e.g. `/score`). */
  /** `practice` = home Practice panel (no nav pill); still passed so no tab falsely appears active. */
  activeTab: MainAppTabKey | "hiring" | "calendar" | "career" | "practice";
  voiceOverlayOpen?: boolean;
  onTabSelect: (key: MainAppTabKey) => void;
  items: NavItem[];
  /** When true, nav is not fixed (for embedded use in audit page wrapper) */
  embedded?: boolean;
  /**
   * Quick-links row stacked flush above the tab bar in one fixed dock (no gap vs separate fixed layers).
   * Use with `<CareerCenterMinibar docked />`.
   */
  dockTop?: ReactNode;
};

/** Frosted stack: content behind blurs through (iOS-style). */
const FROSTED_DOCK: CSSProperties = {
  background: "rgba(10, 10, 12, 0.52)",
  backdropFilter: "saturate(165%) blur(22px)",
  WebkitBackdropFilter: "saturate(165%) blur(22px)",
};

/** Strip from physical bottom up to tab bar — stronger blur so the home zone reads as glass. */
const FROSTED_HOME_WELL: CSSProperties = {
  background: "rgba(10, 10, 12, 0.38)",
  backdropFilter: "saturate(180%) blur(36px)",
  WebkitBackdropFilter: "saturate(180%) blur(36px)",
};

const navRowStyleEmbedded: CSSProperties = {
  background: "var(--bg)",
  borderTop: "1px solid var(--b1)",
  padding: "8px 6px 10px",
};

const navRowStyleFrosted: CSSProperties = {
  background: "transparent",
  borderTop: "1px solid var(--b1)",
  padding: "8px 6px 10px",
};

/** Dock stack: no top border on tabs — avoids a hard line under the minibar; frost is continuous. */
const navRowStyleFrostedDocked: CSSProperties = {
  background: "transparent",
  borderTop: "none",
  padding: "8px 6px 10px",
};

function VoiceTabIcon() {
  return (
    <span
      className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0"
      style={{ background: "var(--idim)" }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    </span>
  );
}

function BottomNavHomeWellBlur() {
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 bottom-0 w-full pointer-events-none"
      style={{
        height: PHONE_CHROME_LAYOUT.bottomNavBottom,
        zIndex: PHONE_CHROME_LAYOUT.zBottomBlurWell,
        ...FROSTED_HOME_WELL,
      }}
    />
  );
}

export function BottomNav({ activeTab, voiceOverlayOpen, onTabSelect, items, embedded, dockTop }: BottomNavProps) {
  const underVoiceDimmer = Boolean(voiceOverlayOpen);
  const grid = (
    <div
      className="grid items-stretch w-full"
      style={{
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      }}
    >
      {items.map(({ key, label, icon, badge }) => {
        const isActive =
          activeTab === key ||
          (key === "center" && (activeTab === "hiring" || activeTab === "calendar" || activeTab === "career")) ||
          (key === "voice" && voiceOverlayOpen);

        const iconColor = isActive ? "var(--t1)" : "var(--t3)";

        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onTabSelect(key)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-h-[48px] touch-manipulation transition-colors rounded-[12px] outline-none border-0",
              "focus-visible:ring-2 focus-visible:ring-white/15 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(10,10,12,0.97)]"
            )}
            style={{
              background: isActive ? "var(--s2)" : "transparent",
            }}
          >
            <div className="relative flex items-center justify-center w-[22px] h-[22px]">
              {key === "voice" ? (
                <VoiceTabIcon />
              ) : (
                <span className="flex items-center justify-center" style={{ color: iconColor }}>
                  {icon}
                </span>
              )}
              {badge && !isActive && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: "var(--blue)" }}
                />
              )}
            </div>
            <span
              className="text-[10px] font-medium whitespace-nowrap"
              style={{ color: isActive ? "var(--t1)" : "var(--t3)" }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <nav className="w-full max-w-[390px] mx-auto" style={navRowStyleEmbedded}>
        {grid}
      </nav>
    );
  }

  const zNav = underVoiceDimmer ? PHONE_CHROME_LAYOUT.zBottomNavUnderVoiceOverlay : PHONE_CHROME_LAYOUT.zBottomNav;

  if (dockTop) {
    return (
      <>
        <BottomNavHomeWellBlur />
        <div
          className="fixed left-1/2 flex w-full max-w-[390px] -translate-x-1/2 flex-col"
          style={{
            bottom: PHONE_CHROME_LAYOUT.bottomNavBottom,
            zIndex: zNav,
            ...FROSTED_DOCK,
          }}
        >
          {dockTop}
          <nav className="w-full shrink-0" style={navRowStyleFrostedDocked}>
            {grid}
          </nav>
        </div>
      </>
    );
  }

  return (
    <>
      <BottomNavHomeWellBlur />
      <nav
        className="fixed left-1/2 w-full max-w-[390px] -translate-x-1/2"
        style={{
          ...navRowStyleFrosted,
          ...FROSTED_DOCK,
          bottom: PHONE_CHROME_LAYOUT.bottomNavBottom,
          zIndex: zNav,
        }}
      >
        {grid}
      </nav>
    </>
  );
}
