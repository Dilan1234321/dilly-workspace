"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { AppProfileHeader, BottomNav, CareerCenterMinibar, CareerCenterTabIcon, JobsTabIcon, RankTabIcon, type MainAppTabKey } from "@/components/career-center";
import { ATSProvider } from "@/components/ats";
import { ATSTabs } from "@/components/ats/ATSTabs";
import { useATSResult } from "@/hooks/useATSResult";
import { LoadingScreen } from "@/components/ui/loading-screen";

/** Same tab icons/labels as the subscribed main app BottomNav (`page.tsx`). */
const MAIN_APP_BOTTOM_NAV_ITEMS: { key: MainAppTabKey; label: string; icon: ReactNode }[] = [
  {
    key: "center",
    label: "Career Center",
    icon: <CareerCenterTabIcon />,
  },
  {
    key: "rank",
    label: "Rank",
    icon: <RankTabIcon />,
  },
  {
    key: "voice",
    label: "Dilly AI",
    // BottomNav renders VoiceTabIcon for `voice`; placeholder satisfies NavItem type.
    icon: <span className="inline-block w-[18px] h-[18px] shrink-0" aria-hidden />,
  },
  {
    key: "resources",
    label: "Get Hired",
    icon: <JobsTabIcon />,
  },
];

function ATSLayoutInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { authLoading, user, displayAudit, atsScanError, retry } = useATSResult();

  const onTabSelect = (key: MainAppTabKey) => {
    if (key === "rank") {
      router.push("/leaderboard");
      return;
    }
    router.push(`/?tab=${key}`);
  };

  // Match /career and /resume-edit: show shell immediately; audit hydrates in context (no full-screen gate on audit fetch).
  if (authLoading) {
    return <LoadingScreen message="Loading ATS…" variant="career-center" />;
  }

  const showAuditBanner = !displayAudit;
  const showErrorBanner = Boolean(atsScanError);

  return (
    <>
    <div
      className="ats-root min-h-[100dvh] min-h-screen flex flex-col career-center-talent"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}
    >
      <div className="mx-auto flex w-full min-h-0 flex-1 flex-col max-w-[390px] px-4 pb-[150px]">
        <div className="template-pop-in" style={{ animationDelay: "0ms" }}>
          <AppProfileHeader
            name={user?.email?.split("@")[0] ?? undefined}
            track="ATS Review"
            schoolName=""
            back="/?tab=center"
          />
        </div>
        <div className="template-pop-in" style={{ animationDelay: "52ms" }}>
          <ATSTabs />
        </div>
        {showAuditBanner ? (
          <div
            className="template-pop-in rounded-xl border p-3 mb-3"
            style={{ animationDelay: "96ms", background: "var(--s2)", borderColor: "var(--b1)" }}
          >
            <p className="text-[12px]" style={{ color: "var(--t2)" }}>
              No scored resume on file. ATS opens once a resume audit is saved to your profile.
            </p>
          </div>
        ) : null}
        {showErrorBanner ? (
          <div
            className="template-pop-in rounded-xl border p-3 mb-3"
            style={{ animationDelay: "96ms", background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.3)" }}
          >
            <p className="text-[12px]" style={{ color: "var(--t1)" }}>{atsScanError}</p>
            <button
              type="button"
              onClick={() => { void retry(); }}
              className="mt-2 min-h-[38px] px-3 rounded-lg text-[12px] font-semibold"
              style={{ background: "var(--blue)", color: "#fff" }}
            >
              Retry scan
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
    {/* Fixed docks outside the flex column so they don’t affect main height / leave a dead zone. */}
    <BottomNav
      dockTop={<CareerCenterMinibar docked active="score" />}
      activeTab="center"
      onTabSelect={onTabSelect}
      items={MAIN_APP_BOTTOM_NAV_ITEMS}
    />
    </>
  );
}

export default function ATSLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ATSProvider>
        <ATSLayoutInner>{children}</ATSLayoutInner>
      </ATSProvider>
    </Suspense>
  );
}

