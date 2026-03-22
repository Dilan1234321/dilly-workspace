"use client";

import { useATSResult } from "@/hooks/useATSResult";
import { TagPill } from "./TagPill";

export function ATSSkillsExtracted() {
  const { atsResult } = useATSResult();
  if (!atsResult) return null;
  return (
    <section className="rounded-xl border p-3 space-y-2" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <h3 className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>Skills Extracted</h3>
      {atsResult.skills_extracted.length ? (
        <div className="flex flex-wrap gap-1.5">
          {atsResult.skills_extracted.map((skill) => <TagPill key={skill} label={skill} />)}
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--t3)" }}>No skills extracted yet.</p>
      )}
    </section>
  );
}

