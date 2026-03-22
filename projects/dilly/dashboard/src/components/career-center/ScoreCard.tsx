"use client";

import Link from "next/link";
import type { AuditV2 } from "@/types/dilly";
import { DIMENSIONS, stashAuditForReportHandoff, topPercentileHeadline } from "@/lib/dillyUtils";
import type { DimensionKey } from "@/types/dilly";
import { DillyCardStrip } from "@/components/presence";

type ScoreCardProps = {
  audit: AuditV2;
  /** Optional Dilly presence footnote (from generateCardStrip / presence manager). */
  dillyStrip?: string | null;
  voiceAvatarIndex?: number | null;
  /** When set, “View full report” links to the standalone audit report page. */
  reportHref?: string;
};

const DIM_COLORS: Record<DimensionKey, { color: string; dim: string }> = {
  smart: { color: "var(--blue)", dim: "var(--bdim)" },
  grit: { color: "var(--amber)", dim: "var(--adim)" },
  build: { color: "var(--indigo)", dim: "var(--idim)" },
};

export function ScoreCard({ audit, dillyStrip, voiceAvatarIndex = null, reportHref }: ScoreCardProps) {
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const final = Math.round(audit.final_score ?? (scores.smart + scores.grit + scores.build) / 3);
  const peerHeadline = topPercentileHeadline(audit);
  const barProgress = (() => {
    if (!audit.peer_percentiles) return Math.min(100, Math.max(0, final));
    const pct = audit.peer_percentiles;
    const keys: DimensionKey[] = ["smart", "grit", "build"];
    let best: { key: DimensionKey; topPct: number } = {
      key: "smart",
      topPct: Math.max(1, 100 - (pct.smart ?? 50)),
    };
    for (const k of keys) {
      const topPct = Math.max(1, 100 - (pct[k] ?? 50));
      if (topPct < best.topPct) best = { key: k, topPct };
    }
    // Align bar with the same "Top X%" message: Top 1% => ~99% fill, Top 25% => ~75% fill.
    return Math.min(100, Math.max(0, 100 - best.topPct));
  })();

  return (
    <div
      className="w-full text-left rounded-[24px] p-5 font-cinzel"
      style={{ background: "var(--s2)" }}
      aria-label="Career score summary"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-medium" style={{ color: "var(--t2)" }}>
          Dilly Score
        </span>
        <span className="text-[11px]" style={{ color: "var(--t3)" }}>
          Updated today
        </span>
      </div>
      <Link
        href="/score"
        className="block font-light tabular-nums mb-1 outline-none"
        style={{
          fontSize: 52,
          letterSpacing: "-0.05em",
          color: "var(--t1)",
        }}
        aria-label="Open My Score"
      >
        {final}
      </Link>
      {peerHeadline ? (
        <p className="text-[13px] mb-3" style={{ color: "var(--green)" }}>
          {peerHeadline}
        </p>
      ) : null}
      <div
        className="h-[3px] rounded-full mb-4 overflow-hidden"
        style={{ background: "var(--s3)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${barProgress}%`,
            background: "var(--green)",
          }}
        />
      </div>
      {reportHref ? (
        <Link
          href={reportHref}
          onClick={() => stashAuditForReportHandoff(audit)}
          className="text-[11px] mb-4 block border-0 bg-transparent p-0 text-left outline-none"
          style={{ color: "var(--blue)", fontWeight: 600 }}
        >
          View full report for breakdown
        </Link>
      ) : (
        <p className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>
          View full report for breakdown
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {(["smart", "grit", "build"] as DimensionKey[]).map((k) => {
          const score = Math.round(scores[k] ?? 0);
          const { color, dim } = DIM_COLORS[k];
          const label = DIMENSIONS.find((d) => d.key === k)?.label ?? k;
          return (
            <div key={k} className="flex flex-col gap-1">
              <span className="text-[11px] font-medium" style={{ color: "var(--t3)" }}>
                {label}
              </span>
              <span className="text-base font-medium tabular-nums" style={{ color }}>
                {score}
              </span>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: dim }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, score))}%`,
                    background: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {dillyStrip ? (
        <DillyCardStrip
          text={dillyStrip}
          voiceAvatarIndex={voiceAvatarIndex ?? null}
          emphases={[String(Math.round(audit.final_score ?? 0))]}
          scoreTriple={{ smart: scores.smart, grit: scores.grit, build: scores.build }}
        />
      ) : null}
    </div>
  );
}
