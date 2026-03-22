"use client";

import { useState } from "react";
import type { AuditReportEvidenceVM } from "@/lib/auditReportViewModel";
import type { DimensionKey } from "@/types/dilly";

const DIM: Record<DimensionKey, string> = {
  smart: "var(--amber)",
  grit: "var(--green)",
  build: "var(--blue)",
};

export function AuditEvidenceCard({ ev }: { ev: AuditReportEvidenceVM }) {
  const [copied, setCopied] = useState(false);
  const c = DIM[ev.dimension];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ev.citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="overflow-hidden" style={{ background: "var(--s2)", borderRadius: 14 }}>
      <div className="flex flex-row justify-between items-start gap-2" style={{ padding: "10px 13px" }}>
        <div className="min-w-0">
          <p
            className="uppercase underline"
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: c,
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            {ev.dimension === "smart" ? "Smart" : ev.dimension === "grit" ? "Grit" : "Build"}
          </p>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.01em", marginTop: 2 }}>
            {ev.headline}
          </h3>
        </div>
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 22, height: 22, background: "var(--coral)" }}
        >
          <span style={{ fontSize: 9, fontWeight: 800, color: "white" }}>{ev.number}</span>
        </div>
      </div>
      <div style={{ padding: "0 13px 12px" }}>
        <p style={{ fontSize: 12, fontWeight: 400, color: "var(--t2)", lineHeight: 1.6, marginBottom: 9 }}>{ev.description}</p>
        <div
          style={{
            background: "var(--s3)",
            borderLeft: "2px solid var(--t3)",
            borderRadius: "0 8px 8px 0",
            padding: "8px 10px",
            marginBottom: 8,
          }}
        >
          <p
            className="uppercase"
            style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.10em", color: "var(--t3)", marginBottom: 4 }}
          >
            Cited from your resume
          </p>
          <p style={{ fontSize: 11, fontWeight: 400, color: "var(--t2)", lineHeight: 1.55, fontStyle: "italic" }}>
            {ev.citation}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="border-0 bg-transparent cursor-pointer"
          style={{ fontSize: 10, fontWeight: 700, color: "var(--blue)" }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
