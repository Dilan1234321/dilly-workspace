"use client";

import { cn } from "@/lib/utils";
import { VoiceStagger, VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoiceNextMovesVisual({ items, className }: { items: string[]; className?: string }) {
  const top = items.filter(Boolean).slice(0, 3);
  if (!top.length) return null;

  return (
    <VoiceVisualShell className={cn("rounded-xl border border-emerald-500/20 bg-emerald-950/25 px-2.5 py-2.5", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90 mb-2">Your next moves</p>
      <VoiceStagger baseDelayMs={80} stepMs={75}>
        {top.map((text, i) => (
          <div
            key={`${i}-${text.slice(0, 24)}`}
            className="rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-2 text-left flex gap-2 items-start"
          >
            <span className="text-[11px] font-bold text-emerald-400 tabular-nums shrink-0">{i + 1}.</span>
            <span className="text-[11px] text-slate-100 leading-snug">{text}</span>
          </div>
        ))}
      </VoiceStagger>
    </VoiceVisualShell>
  );
}
