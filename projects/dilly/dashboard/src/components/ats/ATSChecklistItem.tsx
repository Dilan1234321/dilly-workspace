"use client";

import { TagPill } from "./TagPill";

export function ATSChecklistItem({
  label,
  description,
  passed,
  impact,
  potential,
}: {
  label: string;
  description: string;
  passed: boolean;
  impact: "critical" | "high" | "medium" | "low";
  potential?: number;
}) {
  return (
    <article className="rounded-xl border p-3" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>{label}</p>
        <div className="flex items-center gap-1.5">
          <TagPill label={passed ? "Pass" : "Fail"} tone={passed ? "success" : "danger"} />
          <TagPill label={impact} tone={impact === "critical" ? "danger" : impact === "high" ? "warning" : "info"} />
        </div>
      </div>
      <p className="text-[12px] mt-1.5" style={{ color: "var(--t2)" }}>{description}</p>
      {!passed && potential ? <p className="text-[11px] mt-1.5" style={{ color: "var(--t3)" }}>Potential gain: +{potential} pts</p> : null}
    </article>
  );
}

