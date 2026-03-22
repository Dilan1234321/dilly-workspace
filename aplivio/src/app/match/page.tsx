"use client";

import { useMemo } from "react";
import { useMe } from "@/components/MeProvider";
import { matchAll, sortByFit } from "@/lib/match";
import { TierBadge } from "@/components/TierBadge";

export default function MatchPage() {
  const { profile, savedCollegeIds, toggleCollege, ready } = useMe();

  const rows = useMemo(() => sortByFit(matchAll(profile)), [profile]);

  if (!ready) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Match & odds</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Percentages are a <strong className="text-[var(--text)]">rough model</strong> from your profile and
          published midpoints. They are not predictions.
        </p>
      </div>

      <ul className="space-y-3">
        {rows.map(({ college, estimatedRate, tier, rationale }) => {
          const saved = savedCollegeIds.includes(college.id);
          const pct = Math.round(estimatedRate * 100);
          return (
            <li
              key={college.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{college.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {college.state} · ~{Math.round(college.admitRate * 100)}% admit rate
                  </div>
                </div>
                <TierBadge tier={tier} />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{pct}%</span>
                <span className="text-sm text-[var(--muted)]">est. chance</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{rationale}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {college.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-xs text-[var(--muted)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm font-medium text-[var(--text)]"
                onClick={() => toggleCollege(college.id)}
              >
                {saved ? "Remove from saved list" : "Save to list"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
