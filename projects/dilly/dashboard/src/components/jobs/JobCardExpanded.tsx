"use client";

import { JobDillyStrip } from "./JobDillyStrip";
import type { JobMatch } from "@/types/jobsPage";

function fmtDeadline(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

type Props = {
  job: JobMatch;
  onCollapse: () => void;
};

export function JobCardExpanded({ job, onCollapse }: Props) {
  const days = job.days_until_deadline;

  return (
    <div className="border-t pt-2.5" style={{ borderTop: "1px solid var(--b1)", paddingTop: 11 }}>
        <p className="uppercase font-bold mb-1.5" style={{ fontSize: 9, color: "var(--t3)", marginBottom: 7 }}>
          Why you&apos;re a fit
        </p>
        <ul className="list-none p-0 m-0 space-y-2">
          {(job.why_fit_bullets || []).slice(0, 3).map((b, i) => (
            <li key={i} className="flex flex-row gap-2" style={{ gap: 8 }}>
              <span
                className="shrink-0 rounded-full mt-1"
                style={{ width: 5, height: 5, background: "var(--green)", marginTop: 4 }}
              />
              <span style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.55 }}>{b}</span>
            </li>
          ))}
        </ul>

        {job.deadline && days != null ? (
          <p className="mt-2" style={{ fontSize: 11, color: "var(--coral)", lineHeight: 1.5, marginTop: 8 }}>
            Closes {fmtDeadline(job.deadline)} — {days} day{days === 1 ? "" : "s"} from now.
          </p>
        ) : null}

        <JobDillyStrip text={job.dilly_take} />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCollapse();
          }}
          className="flex flex-row items-center justify-center gap-1.5 w-full border-0 bg-transparent mt-2"
          style={{ gap: 5, marginTop: 8 }}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          <span style={{ fontSize: 10, color: "var(--t3)" }}>Show less</span>
        </button>
    </div>
  );
}
