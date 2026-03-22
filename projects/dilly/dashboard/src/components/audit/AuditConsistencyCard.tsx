"use client";

import type { AuditReportConsistencyVM } from "@/lib/auditReportViewModel";

function WarningGlyph() {
  return (
    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="var(--amber)" strokeWidth={2} />
      <path d="M12 8v5M12 16h.01" stroke="var(--amber)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function AuditConsistencyCard({ flags }: { flags: AuditReportConsistencyVM[] }) {
  if (flags.length === 0) return null;

  return (
    <div className="overflow-hidden" style={{ background: "var(--s2)", borderRadius: 14 }}>
      <div
        style={{
          background: "var(--adim)",
          border: "1px solid var(--abdr)",
          borderRadius: "14px 14px 0 0",
          padding: "9px 13px",
        }}
      >
        <p className="uppercase" style={{ fontSize: 8, fontWeight: 800, color: "var(--amber)" }}>
          Resume consistency
        </p>
        <p style={{ fontSize: 10, fontWeight: 400, color: "var(--t2)", marginTop: 2 }}>
          Duplicates or misplaced content worth cleaning up
        </p>
      </div>
      <div className="flex flex-col" style={{ padding: "12px 13px", gap: 8 }}>
        {flags.map((f) => (
          <div key={f.id} className="flex flex-row items-start gap-2.5">
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: 18,
                height: 18,
                background: "var(--adim)",
                border: "1px solid var(--abdr)",
                marginTop: 1,
              }}
            >
              <WarningGlyph />
            </div>
            <p style={{ fontSize: 11, fontWeight: 400, color: "var(--t2)", lineHeight: 1.6, flex: 1 }}>{f.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
