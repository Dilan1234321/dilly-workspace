"use client";

import Link from "next/link";
import { useMe } from "@/components/MeProvider";

export default function HomePage() {
  const { profile, savedCollegeIds, ready } = useMe();

  if (!ready) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  const profileOk = profile.name.trim().length > 0 && profile.gpaUnweighted > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your admissions workspace</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Estimates are illustrative—always verify deadlines and requirements on each school’s site.
        </p>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Status</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex justify-between gap-4">
            <span>Profile</span>
            <span className={profileOk ? "text-emerald-400" : "text-amber-400"}>
              {profileOk ? "Ready" : "Incomplete"}
            </span>
          </li>
          <li className="flex justify-between gap-4">
            <span>Saved schools</span>
            <span className="text-[var(--text)]">{savedCollegeIds.length}</span>
          </li>
        </ul>
        {!profileOk ? (
          <Link
            href="/profile"
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
          >
            Finish profile
          </Link>
        ) : (
          <div className="mt-4 grid gap-2">
            <Link
              href="/match"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm font-medium"
            >
              View matches & odds
            </Link>
            <Link
              href="/analysis"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm font-medium"
            >
              AI admissions analysis
            </Link>
            <Link
              href="/plan"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm font-medium"
            >
              Open action plan
            </Link>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        <p>
          <strong className="text-[var(--text)]">Tip:</strong> Save 6–10 schools from Match, then use Plan and Timeline
          to sequence work.
        </p>
      </section>
    </div>
  );
}
