"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

const CX = 100;
const CY = 72;
const R = 54;
const ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

function vertex(scale: number, i: number): { x: number; y: number } {
  const a = ANGLES[i];
  return { x: CX + R * scale * Math.cos(a), y: CY + R * scale * Math.sin(a) };
}

function pointsForScores(smart: number, grit: number, build: number): string {
  const s = [smart, grit, build].map((v) => Math.min(100, Math.max(0, v)) / 100);
  return s.map((sc, i) => {
    const p = vertex(sc, i);
    return `${p.x},${p.y}`;
  }).join(" ");
}

function ringPolygon(scale: number): string {
  return [0, 1, 2]
    .map((i) => {
      const p = vertex(scale, i);
      return `${p.x},${p.y}`;
    })
    .join(" ");
}

function fmtDelta(prev: number, cur: number): string {
  const d = Math.round(cur) - Math.round(prev);
  if (d === 0) return "0";
  return d > 0 ? `+${d}` : `${d}`;
}

export type VoiceScoresTriple = { smart: number; grit: number; build: number };

export function VoiceInlineScoresVisual({
  scores,
  finalScore,
  prevScores,
  className,
}: {
  scores: VoiceScoresTriple;
  finalScore?: number | null;
  prevScores?: VoiceScoresTriple | null;
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const smart = Math.round(scores.smart);
  const grit = Math.round(scores.grit);
  const build = Math.round(scores.build);
  const poly = pointsForScores(smart, grit, build);

  const dims = [
    { label: "Smart", val: smart, bar: "bg-amber-400", ring: "text-amber-400/90", border: "border-amber-500/25" },
    { label: "Grit", val: grit, bar: "bg-emerald-400", ring: "text-emerald-400/90", border: "border-emerald-500/25" },
    { label: "Build", val: build, bar: "bg-sky-400", ring: "text-sky-400/90", border: "border-sky-500/25" },
  ] as const;

  const overall =
    finalScore != null && !Number.isNaN(Number(finalScore))
      ? Math.round(Number(finalScore))
      : Math.round((smart + grit + build) / 3);

  const hasPrev = prevScores != null;

  return (
    <VoiceVisualShell>
      <div
        className={cn(
          "w-full max-w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-2.5 py-2.5 space-y-2.5",
          className
        )}
        aria-label="Your Smart, Grit, and Build scores"
      >
        <div className="flex justify-center">
          <svg width="100%" height={130} viewBox="0 0 200 140" className="max-w-[220px] block" aria-hidden>
            <defs>
              <linearGradient id={`voice-radar-grad-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(251,191,36,0.2)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0.12)" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map((t) => (
              <polygon
                key={t}
                points={ringPolygon(t)}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
              />
            ))}
            {[0, 1, 2].map((i) => {
              const p = vertex(1, i);
              return (
                <line
                  key={i}
                  x1={CX}
                  y1={CY}
                  x2={p.x}
                  y2={p.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={0.5}
                />
              );
            })}
            <polygon
              className="voice-viz-radar-poly"
              points={poly}
              fill={`url(#voice-radar-grad-${gid})`}
              stroke="rgba(251,191,36,0.85)"
              strokeWidth={1.25}
            />
            {[smart, grit, build].map((_, i) => {
              const sc = Math.min(100, Math.max(0, [smart, grit, build][i]!)) / 100;
              const p = vertex(sc, i);
              const fill = i === 0 ? "#fbbf24" : i === 1 ? "#34d399" : "#38bdf8";
              return (
                <circle
                  key={i}
                  className="voice-viz-radar-dot"
                  cx={p.x}
                  cy={p.y}
                  r={3.5}
                  fill={fill}
                  style={{ animationDelay: `${420 + i * 90}ms` }}
                />
              );
            })}
          </svg>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {dims.map((d, i) => (
            <div
              key={d.label}
              className={cn(
                "voice-viz-stagger-item rounded-lg border bg-black/20 px-1 py-1.5 text-center",
                d.border
              )}
              style={{ animationDelay: `${180 + i * 75}ms` }}
            >
              <div
                className={cn(
                  "text-[9px] font-bold uppercase tracking-wide leading-none hyphens-none",
                  d.label.includes(" ") ? "whitespace-normal" : "whitespace-nowrap",
                  d.ring
                )}
              >
                {d.label}
              </div>
              <div className="text-base font-bold tabular-nums text-white leading-tight">{d.val}</div>
              <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden voice-viz-bar-track">
                <div
                  className={cn("h-full rounded-full voice-viz-bar-fill", d.bar)}
                  style={{
                    width: `${Math.min(100, Math.max(0, d.val))}%`,
                    animationDelay: `${240 + i * 90}ms`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-slate-400 tabular-nums voice-viz-stagger-item" style={{ animationDelay: "480ms" }}>
          Overall <span className="font-semibold text-slate-200">{overall}</span>
          <span className="text-slate-500"> · from your latest audit</span>
        </p>

        {hasPrev && prevScores ? (
          <p
            className="text-center text-[10px] text-slate-500 leading-snug voice-viz-stagger-item px-1"
            style={{ animationDelay: "540ms" }}
          >
            vs last audit · Smart {fmtDelta(prevScores.smart, smart)}, Grit {fmtDelta(prevScores.grit, grit)}, Build{" "}
            {fmtDelta(prevScores.build, build)}
          </p>
        ) : null}
      </div>
    </VoiceVisualShell>
  );
}
