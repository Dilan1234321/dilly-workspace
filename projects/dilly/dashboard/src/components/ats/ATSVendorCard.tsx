"use client";

import { TagPill } from "./TagPill";

export function ATSVendorCard({
  name,
  score,
  status,
  companies,
}: {
  name: string;
  score: number;
  status: "will_parse" | "risky" | "fail";
  companies: string[];
}) {
  const tone = status === "will_parse" ? "success" : status === "risky" ? "warning" : "danger";
  return (
    <article className="rounded-xl border p-3 space-y-2" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>{name}</p>
        <TagPill label={status.replace("_", " ")} tone={tone} />
      </div>
      <p className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: "var(--t1)" }}>{score}</p>
      {companies?.length ? (
        <p className="text-[11px]" style={{ color: "var(--t3)" }}>
          Seen at {companies.slice(0, 3).join(", ")}
        </p>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--t3)" }}>No company examples yet.</p>
      )}
    </article>
  );
}

