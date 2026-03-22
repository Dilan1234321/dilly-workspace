"use client";

import type { AuditReportRecommendationVM } from "@/lib/auditReportViewModel";
import { tagColorForDimension } from "@/lib/auditReportViewModel";
import { AuditTagPill } from "./AuditTagPill";
import type { AuditReportTagColor } from "@/lib/auditReportViewModel";

function leftBorderColor(dim: AuditReportRecommendationVM["dimension"]): string {
  if (dim === "smart") return "var(--amber)";
  if (dim === "grit") return "var(--green)";
  return "var(--blue)";
}

export function AuditActionRecommendationCard({ rec }: { rec: AuditReportRecommendationVM }) {
  const tags = rec.tag_label.split(",").map((s) => s.trim()).filter(Boolean);
  const dimTag = tagColorForDimension(rec.dimension) as AuditReportTagColor;

  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{
        background: "var(--s2)",
        padding: "12px 13px",
        borderLeft: `2px solid ${leftBorderColor(rec.dimension)}`,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
      }}
    >
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((t) => (
          <AuditTagPill key={t} color={dimTag}>
            {t}
          </AuditTagPill>
        ))}
      </div>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.01em", marginBottom: 4 }}>
        {rec.title}
      </h3>
      <p style={{ fontSize: 11, fontWeight: 400, color: "var(--t2)", lineHeight: 1.6 }}>{rec.body}</p>
    </div>
  );
}
