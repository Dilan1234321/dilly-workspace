"use client";

import { useEffect, useRef, useState } from "react";
import type { AuditV2 } from "@/types/dilly";
import type { DimensionKey } from "@/types/dilly";
import { gapToNextLevel } from "@/lib/dillyUtils";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function useCountUp(target: number, startDelayMs: number, durationMs: number) {
  const [v, setV] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + startDelayMs;

    const tick = (now: number) => {
      if (now < t0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - (startRef.current ?? now);
      const u = Math.min(1, elapsed / durationMs);
      setV(Math.round(target * easeOutCubic(u)));
      if (u < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, startDelayMs, durationMs]);

  return v;
}

function weakestDimension(audit: AuditV2): DimensionKey {
  const s = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  return keys.reduce((a, b) => (s[a] <= s[b] ? a : b));
}

export function ScoreRevealCard({
  audit,
  profileTrack,
}: {
  audit: AuditV2;
  profileTrack: string | null;
}) {
  const final = Math.round(audit.final_score ?? 0);
  const cohort = getEffectiveCohortLabel(audit.detected_track, profileTrack);
  const gaps = gapToNextLevel(audit);
  const weak = weakestDimension(audit);

  const main = useCountUp(final, 400, 1200);
  const sSmart = useCountUp(audit.scores?.smart ?? 0, 0, 1200);
  const sGrit = useCountUp(audit.scores?.grit ?? 0, 200, 1200);
  const sBuild = useCountUp(audit.scores?.build ?? 0, 400, 1200);

  const topPctBest = (() => {
    if (!audit.peer_percentiles) return 50;
    const p = audit.peer_percentiles;
    const keys: DimensionKey[] = ["smart", "grit", "build"];
    let best = 50;
    for (const k of keys) {
      best = Math.min(best, Math.max(1, 100 - (p[k] ?? 50)));
    }
    return best;
  })();

  const headlineOk = topPctBest <= 25;
  const gapPts =
    gaps.length > 0
      ? gaps[0].pointsToTop25 ?? 3
      : Math.max(1, 72 - Math.round(audit.scores?.[weak] ?? 0));
  const dimGapLabel =
    gaps[0]?.label ?? (weak === "smart" ? "Smart" : weak === "grit" ? "Grit" : "Build");

  return (
    <>
      <div
        className="mb-2 rounded-[15px] border p-[13px]"
        style={{ background: "var(--s2)", borderColor: "var(--b1)" }}
      >
        <p className="mb-[7px] text-[8px] font-bold uppercase tracking-wide" style={{ color: "var(--t3)" }}>
          Career readiness · {cohort} track
        </p>
        <div className="mb-[7px] flex items-end gap-1">
          <span
            className="font-light tabular-nums"
            style={{
              fontSize: 46,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              color: "var(--gold)",
            }}
          >
            {main}
          </span>
          <span
            className="inline-block pb-[5px] text-[14px] font-light tabular-nums"
            style={{ color: "var(--t3)" }}
          >
            /100
          </span>
        </div>
        <p
          className="mb-[7px] text-[11px] font-bold"
          style={{ color: final >= 70 ? "var(--green)" : "var(--amber)" }}
        >
          Top {topPctBest}% {cohort} · UTampa
        </p>
        <div className="mb-2 h-[3px] overflow-hidden rounded-full" style={{ background: "var(--s3)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, main)}%`,
              background: "var(--gold)",
              transition: "width 400ms ease-out",
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-[5px] text-center">
          <div className="rounded-[8px] px-1 py-[6px]" style={{ background: "var(--s3)" }}>
            <div className="text-[15px] font-light tabular-nums" style={{ color: "var(--blue)" }}>
              {sSmart}
            </div>
            <div className="text-[7px] font-bold uppercase tracking-wide" style={{ color: "var(--t3)" }}>
              Smart
            </div>
          </div>
          <div className="rounded-[8px] px-1 py-[6px]" style={{ background: "var(--s3)" }}>
            <div className="text-[15px] font-light tabular-nums" style={{ color: "var(--gold)" }}>
              {sGrit}
            </div>
            <div className="text-[7px] font-bold uppercase tracking-wide" style={{ color: "var(--t3)" }}>
              Grit
            </div>
          </div>
          <div className="rounded-[8px] px-1 py-[6px]" style={{ background: "var(--s3)" }}>
            <div className="text-[15px] font-light tabular-nums" style={{ color: "var(--green)" }}>
              {sBuild}
            </div>
            <div className="text-[7px] font-bold uppercase tracking-wide" style={{ color: "var(--t3)" }}>
              Build
            </div>
          </div>
        </div>
      </div>

      {headlineOk ? (
        <div
          className="mb-2 flex gap-[7px] rounded-[11px] border px-[11px] py-[9px]"
          style={{
            background: "var(--gdim)",
            borderColor: "var(--gbdr)",
          }}
        >
          <p className="text-[10px] font-medium leading-[1.5]" style={{ color: "var(--green)" }}>
            You&apos;re above the recruiter bar. Top {topPctBest}% puts you in elite territory.
          </p>
        </div>
      ) : (
        <div
          className="mb-2 flex gap-[7px] rounded-[11px] border px-[11px] py-[9px]"
          style={{
            background: "var(--golddim)",
            borderColor: "var(--goldbdr)",
          }}
        >
          <div
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md"
            style={{ background: "var(--goldbdr)" }}
          >
            <span className="text-[9px]" style={{ color: "var(--gold)" }}>
              ⚠
            </span>
          </div>
          <p className="text-[10px] font-medium leading-[1.5]" style={{ color: "var(--gold)" }}>
            Top 25% is the recruiter filter. You&apos;re <strong>{gapPts} points</strong> away.{" "}
            <strong>{dimGapLabel}</strong> is the gap.
          </p>
        </div>
      )}
    </>
  );
}
