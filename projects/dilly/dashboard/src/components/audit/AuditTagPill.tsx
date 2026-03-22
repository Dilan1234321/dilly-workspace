"use client";

import type { AuditReportTagColor } from "@/lib/auditReportViewModel";

const tagStyles: Record<AuditReportTagColor, React.CSSProperties> = {
  g: { background: "var(--gdim)", color: "var(--green)", border: "1px solid var(--gbdr)" },
  b: { background: "var(--bdim)", color: "var(--blue)", border: "1px solid var(--bbdr)" },
  a: { background: "var(--adim)", color: "var(--amber)", border: "1px solid var(--abdr)" },
  r: { background: "var(--cdim)", color: "var(--coral)", border: "1px solid var(--cbdr)" },
  t: { background: "var(--tdim)", color: "var(--teal)", border: "1px solid var(--tbdr)" },
  i: { background: "var(--idim)", color: "var(--indigo)", border: "1px solid var(--ibdr)" },
};

export function AuditTagPill({
  color,
  children,
  className = "",
  style,
}: {
  color: AuditReportTagColor;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{
        borderRadius: 999,
        padding: "3px 9px",
        fontSize: 9,
        fontWeight: 700,
        ...tagStyles[color],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
