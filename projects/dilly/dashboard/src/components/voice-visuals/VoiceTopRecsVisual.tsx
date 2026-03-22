"use client";

import { cn } from "@/lib/utils";
import { VoiceStagger, VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoiceTopRecsVisual({
  items,
  className,
}: {
  items: Array<{ title: string; score_target?: string | null; action?: string }>;
  className?: string;
}) {
  const top = items.slice(0, 3);
  if (!top.length) return null;

  return (
    <VoiceVisualShell
      className={cn(
        "rounded-xl border border-white/[0.1] bg-white/[0.04] px-2.5 py-2.5",
        className
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Top moves</p>
      <VoiceStagger baseDelayMs={90} stepMs={85}>
        {top.map((r, i) => (
          <div
            key={`${r.title}-${i}`}
            className="rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-100 leading-snug line-clamp-3">{r.title}</span>
              {r.score_target ? (
                <span className="shrink-0 whitespace-nowrap text-[9px] font-bold uppercase tabular-nums text-amber-400/90 leading-none">
                  {r.score_target}
                </span>
              ) : null}
            </div>
            {r.action ? (
              <p className="mt-1 text-[10px] text-slate-400 leading-snug line-clamp-2">{r.action}</p>
            ) : null}
          </div>
        ))}
      </VoiceStagger>
    </VoiceVisualShell>
  );
}
