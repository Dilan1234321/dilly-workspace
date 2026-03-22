"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { hapticLight } from "@/lib/haptics";
import type { JobDimension, JobMatch } from "@/types/jobsPage";
import { JobCardExpanded } from "./JobCardExpanded";

const DIM_LABEL: Record<JobDimension, string> = { smart: "Smart", grit: "Grit", build: "Build" };

type Props = {
  job: JobMatch;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onApplied: (job: JobMatch) => void;
  onOpenApplyEmail: (job: JobMatch) => void;
};

export function JobCard({ job, expanded, onExpand, onCollapse, onApplied, onOpenApplyEmail }: Props) {
  const r = job.readiness;
  const isReady = r === "ready";
  const isClose = r === "close_gap";

  const showDeadlinePill =
    isClose && job.days_until_deadline != null && job.days_until_deadline <= 14 && job.days_until_deadline >= 0;

  const dimPill = (dim: JobDimension, pass: boolean) => {
    const ok = pass;
    return (
      <span
        key={dim}
        className="inline-flex items-center rounded-full font-bold"
        style={{
          background: ok ? "var(--gdim)" : "var(--cdim)",
          border: ok ? "1px solid var(--gbdr)" : "1px solid var(--cbdr)",
          borderRadius: 999,
          padding: "2px 8px",
          fontSize: 9,
          fontWeight: 700,
          color: ok ? "var(--green)" : "var(--coral)",
        }}
      >
        {DIM_LABEL[dim]} {ok ? "✓" : "✗"}
      </span>
    );
  };

  const gapVoiceHref = `/voice?context=job_gap&job_id=${encodeURIComponent(job.id)}&dimension=${encodeURIComponent(
    job.failing_dimension || "grit",
  )}&gap=${encodeURIComponent(String(job.gap_pts ?? 0))}&company=${encodeURIComponent(job.company)}&days=${encodeURIComponent(
    String(job.days_until_deadline ?? ""),
  )}`;

  const onApplyNow = (e: MouseEvent) => {
    e.stopPropagation();
    hapticLight();
    if (job.applied) return;
    if (job.apply_url) {
      window.open(job.apply_url, "_blank", "noopener,noreferrer");
      onApplied(job);
      return;
    }
    if (job.apply_email) {
      onOpenApplyEmail(job);
      return;
    }
    onExpand();
  };

  const cardBorder = isReady ? "1px solid var(--gbdr)" : "1px solid transparent";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => {
        hapticLight();
        if (expanded) onCollapse();
        else onExpand();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (expanded) onCollapse();
          else onExpand();
        }
      }}
      className="rounded-[14px] cursor-pointer"
      style={{
        background: "var(--s2)",
        borderRadius: 14,
        padding: "13px 14px",
        margin: "0 20px 8px",
        border: cardBorder,
      }}
    >
      <div className="flex flex-row justify-between items-start mb-1" style={{ marginBottom: 5 }}>
        <div className="min-w-0 flex-1 pr-2">
          <h2 className="font-bold truncate" style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 1 }}>
            {job.title}
          </h2>
          <p style={{ fontSize: 11, color: "var(--t2)" }}>
            {job.company} · {job.location} · {job.type === "internship" ? "Internship" : "Full-time"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0" style={{ marginLeft: 6 }}>
          {isReady ? (
            <span
              className="rounded-full font-bold whitespace-nowrap"
              style={{
                background: "var(--gdim)",
                border: "1px solid var(--gbdr)",
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--green)",
              }}
            >
              You&apos;re ready
            </span>
          ) : null}
          {showDeadlinePill ? (
            <span
              className="rounded-full font-bold whitespace-nowrap"
              style={{
                background: "var(--cdim)",
                border: "1px solid var(--cbdr)",
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--coral)",
              }}
            >
              {job.days_until_deadline} days
            </span>
          ) : null}
          {r === "stretch" ? (
            <span
              className="rounded-full font-bold whitespace-nowrap"
              style={{
                background: "var(--cdim)",
                border: "1px solid var(--cbdr)",
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--coral)",
              }}
            >
              Stretch
            </span>
          ) : null}
        </div>
      </div>

      {isReady ? (
        <p className="font-semibold mb-2" style={{ fontSize: 11, color: "var(--green)", fontWeight: 600, marginBottom: 8 }}>
          Above their bar across Smart, Grit, and Build. Apply today.
        </p>
      ) : null}

      {isClose && job.gap_insight ? (
        <p style={{ fontSize: 11, color: "var(--amber)", lineHeight: 1.5, marginBottom: 8 }}>{job.gap_insight}</p>
      ) : null}

      {r === "stretch" && job.gap_insight ? (
        <p style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.5, marginBottom: 8 }}>{job.gap_insight}</p>
      ) : null}

      <div className="flex flex-row flex-wrap gap-1" style={{ gap: 5 }}>
        {dimPill("smart", job.smart_pass)}
        {dimPill("grit", job.grit_pass)}
        {dimPill("build", job.build_pass)}
      </div>

      {job.applied ? (
        <p className="mt-2 text-center text-[11px] font-semibold" style={{ color: "var(--t3)", marginTop: 8 }}>
          Applied
        </p>
      ) : isReady ? (
        <button
          type="button"
          onClick={onApplyNow}
          className="w-full border-0 font-bold mt-2"
          style={{
            background: "var(--green)",
            borderRadius: 10,
            padding: 10,
            fontSize: 12,
            fontWeight: 700,
            color: "#051A0B",
            marginTop: 8,
          }}
        >
          Apply now →
        </button>
      ) : isClose ? (
        <Link
          href={gapVoiceHref}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-full font-bold mt-2 text-center"
          style={{
            background: "var(--adim)",
            border: "1px solid var(--abdr)",
            borderRadius: 10,
            padding: 10,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--amber)",
            marginTop: 8,
          }}
        >
          Close the gap with Dilly →
        </Link>
      ) : (
        <Link
          href="/score"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="flex items-center justify-center w-full font-bold mt-2 text-center"
          style={{
            background: "var(--s3)",
            border: "1px solid var(--b2)",
            borderRadius: 10,
            padding: 10,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--t1)",
            marginTop: 8,
          }}
        >
          Build your scores →
        </Link>
      )}

      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: expanded ? 520 : 0, overflow: "hidden" }}
      >
        {expanded ? <JobCardExpanded job={job} onCollapse={onCollapse} /> : null}
      </div>
    </article>
  );
}
