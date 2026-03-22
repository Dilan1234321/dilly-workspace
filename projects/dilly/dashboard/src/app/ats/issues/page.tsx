"use client";

import { ATSColorHeader, ATSEmptyState, ATSIssueCard, ATSStagger, DillyStrip } from "@/components/ats";
import { useATSResult } from "@/hooks/useATSResult";

export default function ATSIssuesPage() {
  const { atsResult } = useATSResult();
  if (!atsResult) {
    return (
      <ATSStagger>
        <ATSColorHeader
          eyebrow="Issues"
          title="Priority Issues"
          subtitle="Fix highest-impact ATS issues first to maximize score gains."
        />
        <ATSEmptyState title="No issues to review yet" />
      </ATSStagger>
    );
  }
  const sorted = [...atsResult.issues].sort((a, b) => b.potential_pts - a.potential_pts);
  return (
    <ATSStagger>
      <ATSColorHeader
        eyebrow="Issues"
        title="Priority Issues"
        subtitle="Fix highest-impact ATS issues first to maximize score gains."
      />
      {sorted.length ? sorted.map((issue) => (
        <ATSIssueCard
          key={issue.id}
          severity={issue.severity}
          title={issue.title}
          detail={issue.detail}
          quote={issue.quote}
          insight={issue.dilly_insight}
          action={issue.dilly_action}
          potential={issue.potential_pts}
        />
      )) : (
        <div className="rounded-xl border p-3 text-[12px]" style={{ background: "var(--s2)", borderColor: "var(--b1)", color: "var(--t3)" }}>
          No issues detected.
        </div>
      )}
      <DillyStrip text={atsResult.dilly_score_commentary} />
    </ATSStagger>
  );
}

