"use client";

import { TagPill } from "./TagPill";

export function ATSIssueCard({
  severity,
  title,
  detail,
  quote,
  insight,
  action,
  potential,
}: {
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  quote?: string | null;
  insight: string;
  action: string;
  potential: number;
}) {
  return (
    <article className="rounded-xl border p-3 space-y-2" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>{title}</p>
        <TagPill label={severity} tone={severity === "critical" ? "danger" : severity === "warning" ? "warning" : "info"} />
      </div>
      <p className="text-[12px]" style={{ color: "var(--t2)" }}>{detail}</p>
      {quote ? (
        <blockquote className="rounded-lg p-2 text-[11px] italic border" style={{ color: "var(--t2)", borderColor: "var(--b1)", background: "var(--s3)" }}>
          &quot;{quote}&quot;
        </blockquote>
      ) : null}
      <p className="text-[11px]" style={{ color: "var(--t3)" }}>Dilly insight: {insight}</p>
      <p className="text-[11px]" style={{ color: "var(--t3)" }}>Dilly action: {action}</p>
      <p className="text-[11px] font-semibold" style={{ color: "var(--amber)" }}>Potential gain +{potential}</p>
    </article>
  );
}

