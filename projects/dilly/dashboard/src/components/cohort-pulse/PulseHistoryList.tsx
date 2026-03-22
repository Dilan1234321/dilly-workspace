"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { CohortPulse, UserCohortPulse } from "@/types/dilly";

type PulseWithCohort = UserCohortPulse & { cohort: CohortPulse };

function relDate(weekStart: string): string {
  const d = new Date(weekStart);
  if (Number.isNaN(d.getTime())) return weekStart;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pillStyles(change: number): { bg: string; border: string; color: string; label: string } {
  if (change > 0) {
    return { bg: "var(--gdim)", border: "var(--green)", color: "var(--green)", label: `+${Math.round(change)} pts` };
  }
  if (change < 0) {
    return { bg: "var(--cdim)", border: "var(--coral)", color: "var(--coral)", label: `${Math.round(change)} pts` };
  }
  return { bg: "var(--s3)", border: "var(--b1)", color: "var(--t3)", label: "→" };
}

export function PulseHistoryList({ items }: { items: PulseWithCohort[] }) {
  const router = useRouter();
  const rows = useMemo(() => [...items].sort((a, b) => String(b.week_start).localeCompare(String(a.week_start))), [items]);

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const pill = pillStyles(row.user_score_change);
        return (
          <button
            key={row.id}
            type="button"
            className="w-full rounded-[14px] p-[12px_14px] text-left"
            style={{ background: "var(--s2)" }}
            onClick={() => {
              const route = row.cta_payload?.route || "/?tab=hiring&view=report";
              router.push(route);
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px]" style={{ color: "var(--t3)" }}>{relDate(row.week_start)}</p>
                <p className="mt-0.5 text-[12px] font-semibold leading-snug" style={{ color: "var(--t1)" }}>{row.cohort.headline}</p>
                <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--t2)" }}>{row.cohort.insight}</p>
              </div>
              <span
                className="shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold"
                style={{ background: pill.bg, borderColor: pill.border, color: pill.color }}
              >
                {pill.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

