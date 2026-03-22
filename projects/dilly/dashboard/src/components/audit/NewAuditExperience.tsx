"use client";

import type { ReactNode } from "react";
import { AuditUploadZone } from "./AuditUploadZone";
import { AuditHistoryCard, type AuditRecord } from "./AuditHistoryCard";

export type NewAuditExperienceProps = {
  auditRecords: AuditRecord[];
  onFileSelect: (file: File) => void;
  onPasteRowClick: () => void;
  onViewReport: (auditId: string) => void;
  onShare: (auditId: string) => void;
  /** Paste mode UI + run flow (rendered below upload zone) */
  pasteMode?: boolean;
  pasteSlot?: ReactNode;
  /** File chosen / loading / run audit CTA */
  actionSlot?: ReactNode;
  /** Voice / errors / etc. */
  footerSlot?: ReactNode;
  /** True while GET /audit/history is loading */
  historyLoading?: boolean;
};

export function NewAuditExperience({
  auditRecords,
  onFileSelect,
  onPasteRowClick,
  onViewReport,
  onShare,
  pasteMode,
  pasteSlot,
  actionSlot,
  footerSlot,
  historyLoading,
}: NewAuditExperienceProps) {
  const historyTitle =
    auditRecords.length > 0 ? `Previous audits (${auditRecords.length})` : "Previous audits";

  return (
    <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <div className="max-w-[390px] mx-auto w-full min-w-0 px-4 pb-40">
        {/* Hero */}
        <section className="pt-[18px] pb-[14px] -mx-4 px-4">
          <p
            className="text-[10px] font-semibold uppercase mb-2"
            style={{ color: "var(--t3)", letterSpacing: "0.12em" }}
          >
            Resume audit
          </p>
          <h2
            className="text-[26px] font-light leading-tight"
            style={{ color: "var(--t1)", letterSpacing: "-0.03em" }}
          >
            <strong className="font-semibold">Scan again.</strong>
          </h2>
          <p className="text-[12px] font-normal mt-2 leading-relaxed" style={{ color: "var(--t2)", lineHeight: 1.6 }}>
            Upload your latest resume and see what moved since your last audit.
          </p>
        </section>

        {/* Past runs first so history is visible without scrolling past upload / paste */}
        <section className="mt-1 mb-5" aria-label="Your audit history">
          <div className="flex items-baseline justify-between gap-2 -mx-4 px-4 pb-2">
            <h3 className="text-[11px] font-semibold uppercase" style={{ color: "var(--t3)", letterSpacing: "0.10em" }}>
              {historyTitle}
            </h3>
            {historyLoading && auditRecords.length > 0 ? (
              <span className="text-[10px] font-medium shrink-0" style={{ color: "var(--t3)" }}>
                Updating…
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 -mx-4 px-4 max-h-[min(45vh,420px)] overflow-y-auto overflow-x-hidden pr-3 min-w-0">
            {historyLoading && auditRecords.length === 0 ? (
              <p className="text-[12px] font-normal py-3" style={{ color: "var(--t3)" }}>
                Loading your audit history…
              </p>
            ) : auditRecords.length === 0 ? (
              <p className="text-[12px] font-normal py-3" style={{ color: "var(--t3)" }}>
                No audits yet. Upload a resume to see your scores.
              </p>
            ) : (
              auditRecords.map((rec, i) => (
                <AuditHistoryCard
                  key={rec.id}
                  audit={rec}
                  isMostRecent={i === 0}
                  onViewReport={() => {
                    if (rec.serverAuditId) onViewReport(rec.serverAuditId);
                  }}
                  onShare={() => {
                    if (rec.serverAuditId) onShare(rec.serverAuditId);
                  }}
                />
              ))
            )}
          </div>
        </section>

        {!pasteMode && (
          <AuditUploadZone onFileSelect={onFileSelect} onPasteClick={onPasteRowClick} />
        )}

        {pasteMode && pasteSlot}

        {actionSlot}

        {footerSlot}
      </div>
    </div>
  );
}
