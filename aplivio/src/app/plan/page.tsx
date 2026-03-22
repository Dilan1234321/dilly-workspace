"use client";

import { useMemo } from "react";
import { useMe } from "@/components/MeProvider";
import { getCollegeById } from "@/lib/match";
import { buildActionPlan } from "@/lib/actionPlan";

export default function PlanPage() {
  const { profile, savedCollegeIds, ready } = useMe();

  const plan = useMemo(() => {
    const targets = savedCollegeIds.flatMap((id) => {
      const c = getCollegeById(id);
      return c ? [c] : [];
    });
    if (targets.length === 0) {
      return { summary: "Save at least one school from the Match tab to generate a plan.", items: [] };
    }
    return buildActionPlan(profile, targets);
  }, [profile, savedCollegeIds]);

  if (!ready) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Action plan</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{plan.summary}</p>
      </div>

      {plan.items.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          Open <strong className="text-[var(--text)]">Match</strong>, save schools, then return here.
        </p>
      ) : (
        <ol className="space-y-3">
          {plan.items.map((item, i) => (
            <li
              key={item.title + i}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{item.title}</span>
                <span
                  className={
                    item.priority === "high"
                      ? "text-red-400"
                      : item.priority === "medium"
                        ? "text-amber-400"
                        : "text-[var(--muted)]"
                  }
                >
                  {item.priority}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{item.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
