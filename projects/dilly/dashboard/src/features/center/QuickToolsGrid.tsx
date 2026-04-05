"use client";

import React from "react";
import Link from "next/link";

import { useAppContext } from "@/context/AppContext";
import { useNavigation } from "@/contexts/NavigationContext";

import { hapticLight } from "@/lib/haptics";

import type { AuditV2 } from "@/types/dilly";

export interface QuickToolsGridProps {
  displayAudit: AuditV2 | null;
  handleGapScan: () => Promise<void>;
  handleCoverLetter: () => Promise<void>;
  handleInterviewPrepFromEvidence: () => Promise<void>;
  setStickerSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function QuickToolsGrid(props: QuickToolsGridProps) {
  const {
    displayAudit,
    handleGapScan,
    handleCoverLetter,
    handleInterviewPrepFromEvidence,
    setStickerSheetOpen,
  } = props;

  const { appProfile } = useAppContext();
  const { setMainAppTab } = useNavigation();

  return (
    <>
      {/* Compact tool row: ATS, Jobs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {displayAudit ? (
          <Link href="/ats/overview?run=1" className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s2)" }}>
            <img src="/ats-scan-icon.png" alt="" className="w-5 h-5 object-contain shrink-0" aria-hidden />
            <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t2)" }}>ATS Scan</span>
          </Link>
        ) : (
          <button type="button" onClick={() => { hapticLight(); setMainAppTab("hiring"); }} className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80 opacity-60" style={{ background: "var(--s2)" }}>
            <img src="/ats-scan-icon.png" alt="" className="w-5 h-5 object-contain shrink-0" aria-hidden />
            <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t3)" }}>ATS Scan</span>
          </button>
        )}
        <Link href="/?tab=resources&view=jobs" className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s2)" }}>
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>
          <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t2)" }}>Jobs</span>
        </Link>
        {appProfile?.profile_slug ? (
          <button type="button" onClick={() => { hapticLight(); window.open(`/p/${appProfile.profile_slug}?preview=1`, "_blank"); }} className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s2)" }}>
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--amber)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
            <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t1)" }}>Recruiter view</span>
          </button>
        ) : (
          <div className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] opacity-60" style={{ background: "var(--s2)" }}>
            <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t3)" }}>Recruiter view</span>
          </div>
        )}
      </div>
      {/* Career Tools row */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          type="button"
          onClick={() => { hapticLight(); handleGapScan(); }}
          className="rounded-[18px] p-3 flex items-center gap-2.5 text-left min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: "var(--s2)" }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <span className="text-[11px] font-medium leading-tight" style={{ color: "var(--t2)" }}>Gap Analysis</span>
        </button>
        <button
          type="button"
          onClick={() => { hapticLight(); handleCoverLetter(); }}
          className="rounded-[18px] p-3 flex items-center gap-2.5 text-left min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: "var(--s2)" }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.981l7.5-4.039a2.25 2.25 0 012.134 0l7.5 4.039a2.25 2.25 0 011.183 1.98V19.5z" /></svg>
          <span className="text-[11px] font-medium leading-tight" style={{ color: "var(--t2)" }}>Cover Letter</span>
        </button>
        <button
          type="button"
          disabled={!displayAudit}
          onClick={() => {
            hapticLight();
            void handleInterviewPrepFromEvidence();
          }}
          className="rounded-[18px] p-3 flex items-center gap-2.5 text-left min-h-[52px] min-w-0 transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50 disabled:pointer-events-none"
          style={{ background: "var(--s2)" }}
          title={displayAudit ? "Questions and scripts from your resume evidence (Smart, Grit, Build)" : "Complete an audit first"}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
          <span className="text-[11px] font-medium leading-tight" style={{ color: "var(--t2)" }}>Interview Prep</span>
        </button>
        {(() => {
          const unlockedCount = appProfile?.achievements ? Object.keys(appProfile.achievements).length : 0;
          return (
            <button
              type="button"
              onClick={() => { hapticLight(); setStickerSheetOpen(true); }}
              className="rounded-[18px] p-3 flex items-center gap-2.5 min-h-[52px] min-w-0 transition-opacity hover:opacity-90 active:opacity-80 text-left"
              style={{ background: "var(--s2)" }}
            >
              <img src="/achievements-collection-icon.png" alt="" className="w-5 h-5 object-contain shrink-0" aria-hidden />
              <div className="min-w-0">
                <span className="text-[11px] font-medium leading-tight block" style={{ color: "var(--t2)" }}>Achievements</span>
                {unlockedCount > 0 && (
                  <span className="text-[10px] font-medium" style={{ color: "var(--amber)" }}>{unlockedCount} unlocked</span>
                )}
              </div>
            </button>
          );
        })()}
      </div>
    </>
  );
}
