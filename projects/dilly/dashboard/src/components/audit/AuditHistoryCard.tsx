"use client";

export interface AuditRecord {
  id: string;
  /** Present when this row came from the server; needed for View report / share links. */
  serverAuditId: string | null;
  date: string;
  score: number;
  previousScore: number | null;
  percentile: number;
  track: string;
  dimensions: {
    smart: number;
    grit: number;
    build: number;
  };
}

type AuditHistoryCardProps = {
  audit: AuditRecord;
  isMostRecent: boolean;
  onViewReport?: () => void;
  onShare?: () => void;
};

function formatDateAndTime(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (isToday) return `Today · ${time}`;
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  return `${month} ${day} · ${time}`;
}

const UpArrow = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 15l-6-6-6 6" />
  </svg>
);

const DownArrow = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const ShareNodes = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
  </svg>
);

export function AuditHistoryCard({ audit, isMostRecent, onViewReport, onShare }: AuditHistoryCardProps) {
  const delta = audit.previousScore !== null ? audit.score - audit.previousScore : null;
  const canOpen = Boolean(audit.serverAuditId);

  const scoreColor = isMostRecent ? "var(--t1)" : "var(--t2)";
  const barFillColor = isMostRecent ? "var(--green)" : "var(--amber)";
  const smartColor = isMostRecent ? "var(--blue)" : "var(--t2)";
  const gritColor = isMostRecent ? "var(--amber)" : "var(--t2)";
  const buildColor = isMostRecent ? "var(--indigo)" : "var(--t2)";

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--s2)",
        borderRadius: 16,
        padding: "13px 14px",
      }}
    >
      {/* Top row */}
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-medium" style={{ color: "var(--t3)" }}>
          {formatDateAndTime(audit.date)}
        </span>
        <div className="flex items-center gap-1" style={{ gap: 4 }}>
          {delta !== null && delta > 0 && (
            <>
              <span className="inline-flex text-[var(--green)]" aria-hidden><UpArrow /></span>
              <span className="text-[11px] font-semibold" style={{ color: "var(--green)" }}>+{delta} pts</span>
            </>
          )}
          {delta !== null && delta < 0 && (
            <>
              <span className="inline-flex text-[var(--coral)]" aria-hidden><DownArrow /></span>
              <span className="text-[11px] font-semibold" style={{ color: "var(--coral)" }}>−{Math.abs(delta)} pts</span>
            </>
          )}
          {delta !== null && delta === 0 && (
            <span className="text-[11px] font-semibold" style={{ color: "var(--t3)" }}>No change</span>
          )}
          {delta === null && (
            <span className="text-[11px] font-semibold" style={{ color: "var(--t3)" }}>Earliest</span>
          )}
        </div>
      </div>

      {/* Score row */}
      <div className="flex items-baseline mb-2" style={{ gap: 5, marginBottom: 8 }}>
        <span
          className="text-[32px] font-light"
          style={{ color: scoreColor, letterSpacing: "-0.04em" }}
        >
          {audit.score}
        </span>
        <span className="text-[14px] font-light" style={{ color: "var(--t3)" }}>/100</span>
        <span
          className="text-[11px] font-medium ml-auto"
          style={{ color: "var(--t2)" }}
        >
          Top {audit.percentile}% {audit.track}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-[3px] rounded-full mb-3"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${audit.score}%`, background: barFillColor }}
        />
      </div>

      {/* Dimension row */}
      <div className="grid grid-cols-3 mb-0" style={{ gap: 6 }}>
        <div className="flex flex-col items-center">
          <span className="text-[13px] font-medium" style={{ color: smartColor }}>{audit.dimensions.smart}</span>
          <span className="text-[9px] font-medium uppercase" style={{ color: "var(--t3)", letterSpacing: "0.04em" }}>Smart</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[13px] font-medium" style={{ color: gritColor }}>{audit.dimensions.grit}</span>
          <span className="text-[9px] font-medium uppercase" style={{ color: "var(--t3)", letterSpacing: "0.04em" }}>Grit</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[13px] font-medium" style={{ color: buildColor }}>{audit.dimensions.build}</span>
          <span className="text-[9px] font-medium uppercase" style={{ color: "var(--t3)", letterSpacing: "0.04em" }}>Build</span>
        </div>
      </div>

      {/* Footer row */}
      <div
        className="flex justify-between items-center pt-[11px] mt-2"
        style={{ borderTop: "1px solid var(--b1)" }}
      >
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => {
            if (canOpen) onViewReport?.();
          }}
          className="text-[12px] font-semibold"
          style={{
            color: "var(--blue)",
            background: "none",
            border: "none",
            outline: "none",
            opacity: canOpen ? 1 : 0.35,
            cursor: canOpen ? "pointer" : "not-allowed",
          }}
        >
          View full report
        </button>
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => {
            if (canOpen) onShare?.();
          }}
          className="flex items-center gap-1.5 text-[12px] font-medium"
          style={{
            color: "var(--t3)",
            background: "none",
            border: "none",
            outline: "none",
            opacity: canOpen ? 1 : 0.35,
            cursor: canOpen ? "pointer" : "not-allowed",
          }}
        >
          <ShareNodes />
          Share
        </button>
      </div>
    </div>
  );
}
