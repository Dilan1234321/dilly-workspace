"use client";

import { useMemo } from "react";
import { useMe } from "@/components/MeProvider";
import { getCollegeById } from "@/lib/match";
import { buildTimelineTasks } from "@/lib/timeline";

export default function TimelinePage() {
  const { savedCollegeIds: ids, ready } = useMe();

  const tasks = useMemo(() => {
    const colleges = ids.flatMap((id) => {
      const c = getCollegeById(id);
      return c ? [c] : [];
    });
    return buildTimelineTasks(colleges);
  }, [ids]);

  if (!ready) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Timeline</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Deadlines are demo placeholders—verify every date on official admissions sites.
        </p>
      </div>

      {ids.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          Save schools from <strong className="text-[var(--text)]">Match</strong> to populate deadlines.
        </p>
      ) : (
        <ol className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="min-w-[96px] text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                {t.due}
              </div>
              <div className="text-sm leading-relaxed text-[var(--text)]">{t.label}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
