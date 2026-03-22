"use client";

import { ATSChecklistItem, ATSColorHeader, ATSEmptyState, ATSStagger, DillyStrip } from "@/components/ats";
import { useATSResult } from "@/hooks/useATSResult";

export default function ATSChecklistPage() {
  const { atsResult } = useATSResult();
  if (!atsResult) {
    return (
      <ATSStagger>
        <ATSColorHeader
          eyebrow="Checklist"
          title="ATS Checklist"
          subtitle="Pass the parser baseline checks to improve score and consistency."
        />
        <ATSEmptyState title="No checklist data yet" />
      </ATSStagger>
    );
  }
  return (
    <ATSStagger>
      <ATSColorHeader
        eyebrow="Checklist"
        title="ATS Checklist"
        subtitle="Pass the parser baseline checks to improve score and consistency."
      />
      {atsResult.checklist.length ? atsResult.checklist.map((item) => (
        <ATSChecklistItem
          key={item.id}
          label={item.label}
          description={item.description}
          passed={item.passed}
          impact={item.impact}
          potential={item.potential_pts}
        />
      )) : (
        <div className="rounded-xl border p-3 text-[12px]" style={{ background: "var(--s2)", borderColor: "var(--b1)", color: "var(--t3)" }}>
          No checklist data yet.
        </div>
      )}
      <DillyStrip text={atsResult.dilly_score_commentary} />
    </ATSStagger>
  );
}

