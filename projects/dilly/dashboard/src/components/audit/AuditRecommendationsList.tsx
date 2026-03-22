"use client";

import type { AuditReportRecommendationVM, AuditReportRewriteVM } from "@/lib/auditReportViewModel";
import { tagColorForDimension } from "@/lib/auditReportViewModel";
import type { AuditReportTagColor } from "@/lib/auditReportViewModel";
import { AuditRewriteCard } from "./AuditRewriteCard";
import { AuditActionRecommendationCard } from "./AuditActionRecommendationCard";

export function AuditRecommendationsList({
  recommendations,
  rewrites,
}: {
  recommendations: AuditReportRecommendationVM[];
  rewrites: AuditReportRewriteVM[];
}) {
  const byRecId = new Map(rewrites.map((r) => [r.recId, r]));

  return (
    <>
      <p
        className="uppercase"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--t3)",
          letterSpacing: "0.12em",
          padding: "6px 0 4px",
        }}
      >
        Strategic recommendations
      </p>
      <div className="flex flex-col gap-2.5">
        {recommendations.map((rec) => {
          const rw = rec.type === "line_edit" ? byRecId.get(rec.id) : undefined;
          if (rec.type === "line_edit" && rw) {
            const tags = rec.tag_label.split(",").map((s) => s.trim()).filter(Boolean);
            const dimTag = tagColorForDimension(rec.dimension) as AuditReportTagColor;
            return (
              <AuditRewriteCard
                key={rec.id}
                recommendationTitle={rec.title}
                tagLabels={tags.length ? tags : ["Edit line"]}
                dimensionTagColor={dimTag}
                rewrite={rw}
              />
            );
          }
          return <AuditActionRecommendationCard key={rec.id} rec={rec} />;
        })}
      </div>
    </>
  );
}
