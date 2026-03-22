"use client";

import type { DimensionKey } from "@/types/dilly";
import { DIMENSIONS } from "@/lib/dillyUtils";
import { benchmarkRowColor } from "@/lib/auditReportViewModel";
import { AuditDillyStrip } from "./AuditDillyStrip";

function pctColor(mode: "green" | "amber" | "coral"): string {
  if (mode === "green") return "var(--green)";
  if (mode === "amber") return "var(--amber)";
  return "var(--coral)";
}

export function AuditBenchmarking({
  track,
  peer_count,
  smart,
  grit,
  build,
  smart_bar,
  grit_bar,
  build_bar,
  smart_percentile_top,
  grit_percentile_top,
  build_percentile_top,
  smart_at_bar,
  grit_at_bar,
  build_at_bar,
  dilly_benchmarking_commentary,
  barsAnimated,
}: {
  track: string;
  peer_count: number;
  smart: number;
  grit: number;
  build: number;
  smart_bar: number;
  grit_bar: number;
  build_bar: number;
  smart_percentile_top: number;
  grit_percentile_top: number;
  build_percentile_top: number;
  smart_at_bar: boolean;
  grit_at_bar: boolean;
  build_at_bar: boolean;
  dilly_benchmarking_commentary: string;
  barsAnimated: boolean;
}) {
  const dims: {
    key: DimensionKey;
    score: number;
    bar: number;
    topPct: number;
    atBar: boolean;
  }[] = [
    { key: "smart", score: smart, bar: smart_bar, topPct: smart_percentile_top, atBar: smart_at_bar },
    { key: "grit", score: grit, bar: grit_bar, topPct: grit_percentile_top, atBar: grit_at_bar },
    { key: "build", score: build, bar: build_bar, topPct: build_percentile_top, atBar: build_at_bar },
  ];

  return (
    <div className="overflow-hidden" style={{ background: "var(--s2)", borderRadius: 16 }}>
      <div
        className="flex flex-row items-center justify-between"
        style={{ background: "var(--indigo)", padding: "9px 13px" }}
      >
        <span className="uppercase" style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
          Peer benchmarking
        </span>
        <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
          vs {peer_count || "—"} {track} peers
        </span>
      </div>
      <div className="flex flex-col" style={{ padding: "12px 13px", gap: 12 }}>
        {dims.map((d) => {
          const label = DIMENSIONS.find((x) => x.key === d.key)?.label ?? d.key;
          const mode = benchmarkRowColor(d.score, d.bar);
          const fillPct = Math.min(100, Math.max(0, 100 - d.topPct));
          const c = pctColor(mode);
          return (
            <div key={d.key}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t1)" }}>{label}</span>
                <span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em", color: c }}>
                  Top {d.topPct}%
                </span>
              </div>
              <div className="relative w-full rounded-full overflow-hidden mt-1.5" style={{ height: 4, background: "var(--b1)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-[600ms] ease-out"
                  style={{
                    width: barsAnimated ? `${fillPct}%` : "0%",
                    background: c,
                  }}
                />
              </div>
              <p
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  color: d.atBar ? "var(--green)" : "var(--t3)",
                  marginTop: 4,
                }}
              >
                {d.atBar ? `At/above bar (${d.bar})` : `Below bar (${d.bar})`}
              </p>
            </div>
          );
        })}
      </div>
      <AuditDillyStrip text={dilly_benchmarking_commentary} />
    </div>
  );
}
