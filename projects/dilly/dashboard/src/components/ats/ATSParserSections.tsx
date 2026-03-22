"use client";

import { useATSResult } from "@/hooks/useATSResult";
import { TagPill } from "./TagPill";

export function ATSParserSections() {
  const { atsResult } = useATSResult();
  if (!atsResult) return null;
  return (
    <section className="rounded-xl border p-3 space-y-2" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <h3 className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>Parser Sections</h3>
      <div className="flex flex-wrap gap-1.5">
        {atsResult.sections_found.map((s) => <TagPill key={`found-${s}`} label={s} tone="success" />)}
        {atsResult.sections_missing.map((s) => <TagPill key={`missing-${s}`} label={s} tone="warning" />)}
      </div>
    </section>
  );
}

