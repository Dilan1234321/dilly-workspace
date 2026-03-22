"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { hapticLight } from "@/lib/haptics";
import { PHONE_CHROME_LAYOUT } from "@/lib/phoneChromeLayout";
import { PracticeTabIcon } from "./PracticeTabIcon";

export type CareerCenterMinibarActive = "score" | "new-audit" | "edit" | "practice" | "calendar";

export type CareerCenterMinibarEmbedded = {
  onScore: () => void;
  onNewAudit: () => void;
  onCalendar: () => void;
};

type Props = {
  /** Highlights the current section (optional). */
  active?: CareerCenterMinibarActive;
  /** Use in main app: buttons for Score / New audit / Calendar to avoid full reload. */
  embedded?: CareerCenterMinibarEmbedded;
  /** Standalone pages with their own bottom nav (e.g. Jobs + m-nav): fixed offset above that bar. */
  aboveBottomNav?: boolean;
  /** Stacked inside `<BottomNav dockTop={…} />` — flush with tab bar, no separate fixed layer. */
  docked?: boolean;
  /** Override bottom offset (Tailwind), e.g. `bottom-[80px]` to sit above a fixed page footer. */
  bottomClass?: string;
  /**
   * When false, renders without `fixed` positioning (for stacking inside a parent dock).
   * Ignores `bottomClass` and `aboveBottomNav`.
   */
  fixed?: boolean;
};

function itemStyle(isActive: boolean): CSSProperties | undefined {
  if (!isActive) return undefined;
  return { background: "var(--s3)" };
}

export function CareerCenterMinibar({
  active,
  embedded,
  aboveBottomNav = false,
  bottomClass,
  fixed: fixedToViewport = true,
  docked = false,
}: Props) {
  const innerRow = (
    <div
      className="app-talent-quicklinks pointer-events-auto flex justify-between items-stretch py-2 px-3"
      style={{ minHeight: 52 }}
    >
        {embedded ? (
          <button
            type="button"
            onClick={() => {
              hapticLight();
              embedded.onScore();
            }}
            className="flex-1 min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-[12px]"
            style={itemStyle(active === "score")}
            aria-label="Score"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <span className="text-[10px] font-medium truncate w-full text-center">Score</span>
          </button>
        ) : (
          <Link
            href="/score"
            onClick={() => hapticLight()}
            className="flex-1 min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-[12px]"
            style={itemStyle(active === "score")}
            aria-label="Score"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <span className="text-[10px] font-medium truncate w-full text-center">Score</span>
          </Link>
        )}

        {embedded ? (
          <button
            type="button"
            onClick={() => {
              hapticLight();
              embedded.onNewAudit();
            }}
            className="flex-1 min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-[12px]"
            style={itemStyle(active === "new-audit")}
            aria-label="New audit"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="text-[10px] font-medium truncate w-full text-center">New audit</span>
          </button>
        ) : (
          <Link
            href="/?tab=upload"
            onClick={() => hapticLight()}
            className="flex-1 min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-[12px]"
            style={itemStyle(active === "new-audit")}
            aria-label="New audit"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="text-[10px] font-medium truncate w-full text-center">New audit</span>
          </Link>
        )}

        <Link
          href="/?tab=edit"
          onClick={() => hapticLight()}
          className="flex-1 min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-[12px]"
          style={itemStyle(active === "edit")}
          aria-label="Edit Resume"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232 18.768 8.768m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="text-[10px] font-medium truncate w-full text-center">Edit</span>
        </Link>

        <Link
          href="/?tab=practice"
          onClick={() => hapticLight()}
          className="flex-1 min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-[12px]"
          style={itemStyle(active === "practice")}
          aria-label="Practice"
        >
          <PracticeTabIcon className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-medium truncate w-full text-center">Practice</span>
        </Link>

        {embedded ? (
          <button
            type="button"
            onClick={() => {
              hapticLight();
              embedded.onCalendar();
            }}
            className="flex-1 min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-[12px]"
            style={itemStyle(active === "calendar")}
            aria-label="Calendar"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span className="text-[10px] font-medium truncate w-full text-center">Calendar</span>
          </button>
        ) : (
          <Link
            href="/?tab=calendar"
            onClick={() => hapticLight()}
            className="flex-1 min-h-[44px] min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-[12px]"
            style={itemStyle(active === "calendar")}
            aria-label="Calendar"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span className="text-[10px] font-medium truncate w-full text-center">Calendar</span>
          </Link>
        )}
    </div>
  );

  if (docked) {
    return (
      <div className="app-talent-quicklinks-host relative z-10 w-full shrink-0 px-4 pointer-events-none">
        {innerRow}
      </div>
    );
  }

  if (!fixedToViewport) {
    return (
      <div className="app-talent-quicklinks-host relative z-0 w-full max-w-[390px] mx-auto px-4 pointer-events-none">
        {innerRow}
      </div>
    );
  }

  const bottomTw = bottomClass ? bottomClass : aboveBottomNav ? "" : "bottom-6";
  const bottomStyle: CSSProperties | undefined =
    aboveBottomNav && !bottomClass ? { bottom: PHONE_CHROME_LAYOUT.minibarFixedBottom } : undefined;

  return (
    <div
      className={`app-talent-quicklinks-host fixed left-0 right-0 z-10 max-w-[390px] mx-auto px-4 pointer-events-none ${bottomTw}`}
      style={bottomStyle}
    >
      {innerRow}
    </div>
  );
}
