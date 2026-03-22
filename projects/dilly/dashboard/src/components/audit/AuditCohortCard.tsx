"use client";

import type { AuditReportCohortVM } from "@/lib/auditReportViewModel";

const DIM_COLORS = { smart: "var(--amber)", grit: "var(--green)", build: "var(--blue)" } as const;

export function AuditCohortCard({ cohort }: { cohort: AuditReportCohortVM }) {
  const rows: { key: keyof typeof DIM_COLORS; label: string; text: string }[] = [
    { key: "smart", label: "Smart", text: cohort.smart_description },
    { key: "grit", label: "Grit", text: cohort.grit_description },
    { key: "build", label: "Build", text: cohort.build_description },
  ];

  return (
    <div className="overflow-hidden" style={{ background: "var(--s2)", borderRadius: 16 }}>
      <div style={{ background: "var(--teal)", padding: "9px 13px" }}>
        <span className="uppercase" style={{ fontSize: 8, fontWeight: 800, color: "rgba(0,0,0,0.55)" }}>
          Your cohort · {cohort.track}
        </span>
      </div>
      <div style={{ padding: "12px 13px" }}>
        <p style={{ fontSize: 10, fontWeight: 400, color: "var(--t2)", lineHeight: 1.55, marginBottom: 10 }}>
          What hiring managers and consultants look for in your field:
        </p>
        {rows.map((r, i) => (
          <div
            key={r.key}
            className="flex flex-row items-start gap-2.5"
            style={{
              padding: "7px 0",
              borderBottom: i < rows.length - 1 ? "1px solid var(--b1)" : undefined,
            }}
          >
            <span
              className="shrink-0"
              style={{
                width: 36,
                fontSize: 11,
                fontWeight: 700,
                color: DIM_COLORS[r.key],
                marginTop: 1,
              }}
            >
              {r.label}
            </span>
            <p className="min-w-0 flex-1" style={{ fontSize: 11, fontWeight: 400, color: "var(--t2)", lineHeight: 1.55 }}>
              {r.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
