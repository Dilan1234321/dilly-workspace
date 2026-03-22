"use client";

import type { DimensionKey } from "@/types/dilly";
import { AuditTagPill } from "./AuditTagPill";

function dimScoreColor(dim: DimensionKey, score: number, atBar: boolean): string {
  if (dim === "smart") return "var(--amber)";
  if (dim === "build") return "var(--blue)";
  return atBar ? "var(--green)" : "var(--amber)";
}

export function AuditDimensionGrid({
  smart,
  grit,
  build,
  smart_at_bar,
  grit_at_bar,
  build_at_bar,
  smart_bar,
  grit_bar,
  build_bar,
  smart_label,
  grit_label,
  build_label,
  grit_percentile_top,
  barsAnimated,
}: {
  smart: number;
  grit: number;
  build: number;
  smart_at_bar: boolean;
  grit_at_bar: boolean;
  build_at_bar: boolean;
  smart_bar: number;
  grit_bar: number;
  build_bar: number;
  smart_label: string;
  grit_label: string;
  build_label: string;
  grit_percentile_top: number;
  barsAnimated: boolean;
}) {
  const rows: {
    key: DimensionKey;
    name: string;
    score: number;
    atBar: boolean;
    bar: number;
    label: string;
  }[] = [
    { key: "smart", name: "Smart", score: smart, atBar: smart_at_bar, bar: smart_bar, label: smart_label },
    { key: "grit", name: "Grit", score: grit, atBar: grit_at_bar, bar: grit_bar, label: grit_label },
    { key: "build", name: "Build", score: build, atBar: build_at_bar, bar: build_bar, label: build_label },
  ];

  const showGritElite = grit_percentile_top <= 5;

  return (
    <>
      <p
        className="uppercase"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--t3)",
          letterSpacing: "0.12em",
          padding: "6px 0 4px",
        }}
      >
        Score breakdown
      </p>
      <div className="grid grid-cols-2 gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {rows.slice(0, 2).map((d) => {
          const accent = dimScoreColor(d.key, d.score, d.atBar);
          return (
            <div key={d.key} style={{ background: "var(--s2)", borderRadius: 14, padding: "12px 13px" }}>
              <div className="flex items-center justify-between gap-1">
                <span
                  className="uppercase"
                  style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "var(--t3)" }}
                >
                  {d.name}
                </span>
                {d.key === "grit" && showGritElite ? (
                  <AuditTagPill color="g" style={{ fontSize: 7, padding: "2px 6px" }}>
                    Top {grit_percentile_top}%
                  </AuditTagPill>
                ) : null}
              </div>
              <div className="flex items-baseline gap-1 mt-1" style={{ marginBottom: 3 }}>
                <span
                  className="tabular-nums"
                  style={{
                    fontSize: 28,
                    fontWeight: 300,
                    letterSpacing: "-0.04em",
                    color: accent,
                  }}
                >
                  {d.score}
                </span>
                <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 300, color: "var(--t3)" }}>
                  /100
                </span>
              </div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: d.atBar ? "var(--green)" : "var(--t2)",
                  marginBottom: 7,
                }}
              >
                {d.label}
              </p>
              <div className="relative w-full rounded-full overflow-hidden" style={{ height: 3, background: "var(--b1)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-[600ms] ease-out"
                  style={{
                    width: barsAnimated ? `${Math.min(100, Math.max(0, d.score))}%` : "0%",
                    background: accent,
                  }}
                />
              </div>
            </div>
          );
        })}
        <div
          className="col-span-2"
          style={{ background: "var(--s2)", borderRadius: 14, padding: "12px 13px", gridColumn: "1 / -1" }}
        >
          {(() => {
            const d = rows[2];
            const accent = dimScoreColor(d.key, d.score, d.atBar);
            return (
              <>
                <div className="flex items-center justify-between">
                  <span
                    className="uppercase"
                    style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "var(--t3)" }}
                  >
                    {d.name}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mt-1" style={{ marginBottom: 3 }}>
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: 28,
                      fontWeight: 300,
                      letterSpacing: "-0.04em",
                      color: accent,
                    }}
                  >
                    {d.score}
                  </span>
                  <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 300, color: "var(--t3)" }}>
                    /100
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: d.atBar ? "var(--green)" : "var(--t2)",
                    marginBottom: 7,
                  }}
                >
                  {d.label}
                </p>
                <div className="relative w-full rounded-full overflow-hidden" style={{ height: 3, background: "var(--b1)" }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-[600ms] ease-out"
                    style={{
                      width: barsAnimated ? `${Math.min(100, Math.max(0, d.score))}%` : "0%",
                      background: accent,
                    }}
                  />
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}
