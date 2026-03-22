"use client";

import { useATSResult } from "@/hooks/useATSResult";
import { TagPill } from "./TagPill";

function statusTone(status: "excellent" | "good" | "risky" | "at_risk"): "success" | "info" | "warning" | "danger" {
  if (status === "excellent") return "success";
  if (status === "good") return "info";
  if (status === "risky") return "warning";
  return "danger";
}

export function ATSScoreHero({ onExplainChange }: { onExplainChange?: () => void }) {
  const { atsResult } = useATSResult();
  if (!atsResult) return null;
  const delta = atsResult.previous_score == null ? null : atsResult.score - atsResult.previous_score;
  return (
    <section className="rounded-2xl border p-4" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Dilly ATS Score</p>
          <p className="text-[40px] leading-none font-semibold mt-1 tabular-nums" style={{ color: "var(--t1)" }}>{atsResult.score}</p>
        </div>
        <TagPill label={atsResult.status.replace("_", " ")} tone={statusTone(atsResult.status)} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl p-2" style={{ background: "var(--s3)" }}>
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Prev Score</p>
          <p className="text-[16px] font-semibold tabular-nums" style={{ color: "var(--t1)" }}>
            {atsResult.previous_score ?? "--"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onExplainChange?.()}
          className="rounded-xl p-2 text-left transition-opacity hover:opacity-90"
          style={{ background: "var(--s3)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Change</p>
          <p className="text-[16px] font-semibold tabular-nums" style={{ color: delta != null && delta >= 0 ? "var(--green)" : "var(--amber)" }}>
            {delta == null ? "--" : `${delta > 0 ? "+" : ""}${delta}`}
          </p>
        </button>
      </div>
    </section>
  );
}

