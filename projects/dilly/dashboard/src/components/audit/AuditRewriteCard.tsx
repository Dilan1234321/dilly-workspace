"use client";

import { useState } from "react";
import type { AuditReportRewriteVM, AuditReportTagColor } from "@/lib/auditReportViewModel";
import { AuditTagPill } from "./AuditTagPill";
import { AuditDillyStrip } from "./AuditDillyStrip";

function reasonTagColor(rt: AuditReportRewriteVM["reason_type"]): AuditReportTagColor {
  const m: Record<AuditReportRewriteVM["reason_type"], AuditReportTagColor> = {
    placeholder: "g",
    acronym: "b",
    verb: "i",
    quantification: "a",
    header: "r",
  };
  return m[rt];
}

export function AuditRewriteCard({
  recommendationTitle,
  tagLabels,
  dimensionTagColor,
  rewrite,
}: {
  recommendationTitle: string;
  tagLabels: string[];
  dimensionTagColor: AuditReportTagColor;
  rewrite: AuditReportRewriteVM;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rewrite.rewritten);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="overflow-hidden" style={{ background: "var(--s2)", borderRadius: 14 }}>
      <div className="flex flex-row items-center" style={{ background: "var(--indigo)", padding: "8px 12px" }}>
        <span
          className="uppercase flex-1 min-w-0 truncate"
          style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}
        >
          {recommendationTitle}
        </span>
        <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>
          {rewrite.index} of {rewrite.total}
        </span>
      </div>
      <div style={{ padding: "11px 12px" }}>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {tagLabels.map((t) => (
            <AuditTagPill key={t} color={dimensionTagColor}>
              {t.trim()}
            </AuditTagPill>
          ))}
        </div>
        <p
          className="uppercase"
          style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.10em", color: "var(--t3)", marginBottom: 3 }}
        >
          Before
        </p>
        <p
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: "var(--t2)",
            textDecoration: "line-through",
            lineHeight: 1.55,
          }}
        >
          {rewrite.original}
        </p>
        <div style={{ height: 1, background: "var(--b1)", margin: "9px 0" }} />
        <p
          className="uppercase"
          style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.10em", color: "var(--green)", marginBottom: 3 }}
        >
          After
        </p>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--t1)", lineHeight: 1.55 }}>{rewrite.rewritten}</p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <AuditTagPill color={reasonTagColor(rewrite.reason_type)}>{rewrite.reason_tag}</AuditTagPill>
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
      <AuditDillyStrip text={rewrite.reason} />
    </div>
  );
}
