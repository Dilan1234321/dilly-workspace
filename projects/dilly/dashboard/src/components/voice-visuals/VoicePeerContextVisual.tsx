"use client";

import { cn } from "@/lib/utils";
import { VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoicePeerContextVisual({
  trackLabel,
  smartPct,
  gritPct,
  buildPct,
  className,
}: {
  trackLabel?: string | null;
  smartPct?: number | null;
  gritPct?: number | null;
  buildPct?: number | null;
  className?: string;
}) {
  const dims: { key: string; label: string; pct: number; color: string }[] = [];
  if (smartPct != null && smartPct >= 0) dims.push({ key: "s", label: "Smart", pct: Math.round(smartPct), color: "var(--blue)" });
  if (gritPct != null && gritPct >= 0) dims.push({ key: "g", label: "Grit", pct: Math.round(gritPct), color: "var(--amber)" });
  if (buildPct != null && buildPct >= 0) dims.push({ key: "b", label: "Build", pct: Math.round(buildPct), color: "var(--indigo)" });
  if (!dims.length) return null;

  return (
    <VoiceVisualShell className={cn("rounded-xl border border-amber-500/20 bg-amber-950/15 px-2.5 py-2.5", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/90 mb-1">Vs your peers</p>
      {trackLabel ? (
        <p className="text-[11px] text-slate-400 mb-2 line-clamp-2">{trackLabel}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {dims.map((d) => (
          <div
            key={d.key}
            className="flex-1 min-w-[88px] rounded-lg border border-white/[0.08] bg-black/35 px-2 py-1.5 text-center"
          >
            <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: d.color }}>
              {d.label}
            </p>
            <p className="text-lg font-bold tabular-nums text-slate-50 leading-tight">Top {d.pct}%</p>
          </div>
        ))}
      </div>
    </VoiceVisualShell>
  );
}
