"use client";

import type { ReadyCheck } from "@/types/dilly";

type Group = { company: string; checks: ReadyCheck[] };

function rel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Recently";
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

export function VerdictHistoryList({
  groups,
  onOpen,
}: {
  groups: Group[];
  onOpen: (check: ReadyCheck) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--t3)" }}>
        No ready checks yet.
      </div>
    );
  }
  return (
    <div className="px-4 space-y-4">
      {groups.map((group) => (
        <section key={group.company} className="rounded-[16px] p-3.5" style={{ background: "var(--s2)" }}>
          <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--t1)" }}>
            {group.company}
          </p>
          <div className="space-y-2">
            {group.checks.map((check, idx) => (
              <button
                key={check.id}
                type="button"
                onClick={() => onOpen(check)}
                className="w-full text-left rounded-[12px] p-2.5 border"
                style={{ borderColor: "var(--bbdr)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px]" style={{ color: "var(--t3)" }}>{rel(check.created_at)}</p>
                  <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: "var(--bdim)", color: "var(--t2)" }}>
                    {check.verdict_label}
                  </span>
                </div>
                <p className="text-[12px] mt-1" style={{ color: "var(--t2)" }}>
                  Final {check.user_scores.final} · Grit {check.user_scores.grit}
                </p>
                {idx < group.checks.length - 1 ? (
                  <p className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Trajectory →</p>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

