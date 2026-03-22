"use client";

import { AuditTagPill } from "./AuditTagPill";
import { AuditDillyStrip } from "./AuditDillyStrip";

function scoreStripColor(final: number): string {
  if (final >= 85) return "var(--green)";
  if (final >= 55) return "var(--amber)";
  return "var(--coral)";
}

function statusTag(final: number): { color: "g" | "a" | "r"; label: string } {
  if (final >= 85) return { color: "g", label: "Elite" };
  if (final >= 70) return { color: "a", label: "Strong" };
  if (final >= 55) return { color: "a", label: "Average" };
  return { color: "r", label: "At risk" };
}

function formatHeaderDate(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AuditScoreHero({
  final_score,
  tsMs,
  track,
  final_percentile_top,
  score_delta,
  dilly_score_commentary,
  barsAnimated,
}: {
  final_score: number;
  tsMs: number;
  track: string;
  final_percentile_top: number;
  score_delta: number | null;
  dilly_score_commentary: string;
  barsAnimated: boolean;
}) {
  const strip = scoreStripColor(final_score);
  const tag = statusTag(final_score);
  const peerLineStrong = final_score >= 70;

  return (
    <div className="overflow-hidden" style={{ background: "var(--s2)", borderRadius: 20 }}>
      <div
        className="flex flex-row items-center justify-between w-full"
        style={{
          height: 36,
          padding: "0 14px",
          background: strip,
        }}
      >
        <span
          className="uppercase"
          style={{
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: "0.12em",
            color: "rgba(0,0,0,0.55)",
          }}
        >
          Career Readiness Assessment
        </span>
        <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>{formatHeaderDate(tsMs)}</span>
      </div>
      <div style={{ padding: 14 }}>
        <div className="flex flex-row items-end gap-1.5">
          <span
            className="tabular-nums"
            style={{
              fontSize: 56,
              fontWeight: 300,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              color: strip,
            }}
          >
            {final_score}
          </span>
          <span
            className="tabular-nums"
            style={{ fontSize: 18, fontWeight: 300, color: "var(--t3)", paddingBottom: 8 }}
          >
            /100
          </span>
          <div className="ml-auto flex items-end" style={{ paddingBottom: 10 }}>
            <AuditTagPill color={tag.color}>{tag.label}</AuditTagPill>
          </div>
        </div>
        <div className="relative w-full rounded-full overflow-hidden mt-2" style={{ height: 4, background: "var(--b1)" }}>
          <div
            className="relative h-full rounded-full overflow-hidden transition-[width] duration-[600ms] ease-out"
            style={{
              width: barsAnimated ? `${Math.min(100, Math.max(0, final_score))}%` : "0%",
              background: strip,
            }}
          >
            <div
              className="pointer-events-none absolute rounded-full"
              style={{
                top: 1,
                left: 4,
                right: 4,
                height: 1.5,
                background: "rgba(255,255,255,0.3)",
              }}
            />
          </div>
        </div>
        <p className="mt-2" style={{ fontSize: 11, fontWeight: 500, color: "var(--t2)" }}>
          Dilly score ·{" "}
          <span style={{ color: peerLineStrong ? "var(--green)" : "var(--amber)", fontWeight: 700 }}>
            Top {final_percentile_top}% {track}
          </span>
        </p>
        {score_delta != null && score_delta !== 0 ? (
          <p
            className="mt-1"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: score_delta > 0 ? "var(--green)" : "var(--coral)",
            }}
          >
            {score_delta > 0 ? "+" : "−"}
            {Math.abs(score_delta)} pts since last audit
          </p>
        ) : null}
      </div>
      <AuditDillyStrip text={dilly_score_commentary} />
    </div>
  );
}
